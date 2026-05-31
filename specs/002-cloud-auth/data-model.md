# Data Model: Cloud Auth for Atlas Desktop

**Feature**: `002-cloud-auth`
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Date**: 2026-05-31

The four entities introduced by this feature live in three different stores:

| Entity | Lives in |
|---|---|
| `AuthSession` | Desktop process memory + OS keychain (refresh token persisted only) |
| `SignInAttempt` | Desktop process memory only (in-flight, 10-min TTL) |
| `SubscriptionState` | Cloud backend Postgres, cached on the desktop |
| `AuditEvent` | Cloud backend Postgres (audit table) AND desktop local log file |

---

## Entity: AuthSession

A signed-in user's currently active session on the desktop.

| Field | Type | Source | Notes |
|---|---|---|---|
| `userId` | string (UUID) | JWT `sub` claim | WorkOS user id; never null when session exists |
| `email` | string | JWT `email` claim | Display purposes; not used for routing |
| `displayName` | string | JWT `name` claim | Shown in header |
| `avatarUrl` | string \| null | JWT `picture` claim | Fall back to default if null |
| `accessToken` | string (JWT) | `/v1/auth/token` response | In-memory only; never written to disk |
| `accessTokenExpiresAt` | unix-ms | JWT `exp` claim × 1000 | TTL 15 min |
| `refreshToken` | string (opaque) | `/v1/auth/token` response | OS keychain ONLY; ciphertext via `safeStorage.encryptString` |
| `refreshTokenExpiresAt` | unix-ms | response field | TTL 30 days, slides on each use |
| `deviceInstallId` | string (UUID) | issued at first sign-in | Identifies this desktop install across sessions; persisted in keychain alongside refresh token |
| `subscriptionTier` | enum (`free` / `pro` / `team` / `enterprise`) | JWT `sub_tier` claim, refreshed on poll | Drives feature gating |

**Validation rules**:
- `accessToken` must be a syntactically valid JWT (header.payload.signature, base64url).
- `userId` must match between successive refreshes (catches a server bug or token-mixup).
- `refreshToken` opacity is required — any whitespace, dots, or base64 characters that suggest internal structure should fail validation. We treat it as a meaningless string from the client side.

**State transitions**:

```
[no session]
   │ user clicks Sign In
   ▼
[signing in] ── 10min timeout ──► [no session] (failed)
   │ deep-link OR loopback delivers code
   ▼
[exchanging] ── code-exchange failure ──► [no session] (error toast)
   │ /v1/auth/token returns access + refresh
   ▼
[active] ──── 14min elapsed ────► [refreshing]
   │                                  │ /v1/auth/token (refresh grant) success
   │                                  ▼
   │                                [active]
   │
   │ user clicks Sign Out          ► /v1/auth/revoke → keychain wipe → [no session]
   │
   │ refresh returns 401           ► [no session] (re-prompt)
```

**Lifecycle**:
- Created when the first `/v1/auth/token` succeeds.
- Mutated on every refresh (new access + new refresh token, old refresh marked rotated).
- Destroyed on sign-out or on terminal refresh failure (server-revoked).

---

## Entity: SignInAttempt

An in-flight sign-in. Lives in desktop memory only; never persisted.

| Field | Type | Notes |
|---|---|---|
| `attemptId` | string (UUID) | Internal key |
| `state` | string (32-byte base64url) | CSRF random; sent in OAuth `state` param; matched on deep-link arrival |
| `codeVerifier` | string (128 chars) | PKCE verifier; never sent off-device |
| `codeChallenge` | string (43-char base64url) | `sha256(codeVerifier)`; sent to WorkOS |
| `windowId` | int | Electron `BrowserWindow.id` that initiated this attempt; used to route the callback back to the right window |
| `loopbackPort` | int | The ephemeral port the loopback listener bound to |
| `startedAt` | unix-ms | For 10-min TTL |
| `redirectMethod` | enum (`deep-link` / `loopback` / `paste-code`) | Last-resort logging; never used for routing |

**Validation**:
- `state` MUST be cryptographically random per attempt; reusing a state is a security defect.
- Maximum **one** active attempt per `windowId` — a second Sign In click invalidates the first.

**State transitions**:

```
[created] ── 10 min elapsed ──► [expired] (GC'd)
   │
   │ deep-link with matching state OR loopback receives code OR user pastes code
   ▼
[completing] ── /v1/auth/token failure ──► [failed] (UI error)
   │ success
   ▼
[completed] (destroyed; AuthSession created)
```

---

## Entity: SubscriptionState

Cached subscription tier + entitlements. Backend canonical, desktop cached.

| Field | Type | Notes |
|---|---|---|
| `userId` | string (UUID) | FK to user |
| `tier` | enum (`free`/`pro`/`team`/`enterprise`) | The user's current tier |
| `monthlyTokenQuota` | integer \| null | LLM proxy quota at this tier (used by spec 003-llm-proxy); null for unlimited |
| `monthlyTokensUsed` | integer | Updated by usage analytics (spec 008) |
| `renewsAt` | unix-ms \| null | Subscription renewal date; null for free |
| `entitlements` | string[] | Feature flags this tier grants (e.g., `["atlas_cloud_proxy", "skill_marketplace"]`) |
| `lastFetchedAt` | unix-ms (desktop only) | When desktop last polled `/v1/subscription` |

**Refresh policy**:
- Polled every 5 minutes by `subscription-poller.ts` (per Q2 clarification).
- Also refreshed immediately when the user dismisses an "Upgrade" affordance and returns from the billing page.
- Stale cache (lastFetchedAt > 10 min ago) marked "may be outdated" in UI tooltips.

**Backend canonical source**: `subscription_state` table mirrors Stripe events via webhooks (post spec `024-skill-pricing`); v1 returns mock data.

---

## Entity: AuditEvent

Local audit log of auth-related events. Also mirrored to the backend for the user's signed-in devices history.

| Field | Type | Notes |
|---|---|---|
| `eventId` | string (UUID) | Internal |
| `userId` | string (UUID) \| null | Null for pre-auth events (e.g., "sign-in started") |
| `eventType` | enum | `sign_in_started`, `sign_in_succeeded`, `sign_in_failed`, `refresh_succeeded`, `refresh_failed`, `sign_out`, `revoked_token_detected`, `state_mismatch_rejected`, `keychain_access_denied` |
| `timestamp` | unix-ms | Always-set |
| `errorCode` | string \| null | For `*_failed` events |
| `deviceOs` | enum (`darwin`/`win32`/`linux`) | For backend-side cross-device analysis |

**Critical constraint (FR-014)**: AuditEvent rows MUST NEVER contain token values, PKCE verifiers, CSRF `state`, or auth codes. Only metadata.

**Local storage**: rolling log file at `~/Library/Application Support/Atlas/audit.log` (macOS) / `%APPDATA%\Atlas\audit.log` (Win) / `~/.config/atlas/audit.log` (Linux). Auto-rotates at 10 MB, retains 5 files.

**Backend mirror**: `audit_events` table receives a subset of these events for the "devices signed in" UI in spec `021-admin-console`. NOT mirrored: state-mismatch rejections (purely local), keychain-access-denied (local OS issue, not server-relevant).

---

## Cross-references

- Identity constants used in auth flow → [contracts/auth-flow.md](./contracts/auth-flow.md)
- JWT claim format → [contracts/token-shapes.md](./contracts/token-shapes.md) (authored in this commit)
- HTTP API contract → [contracts/auth-backend-api.md](./contracts/auth-backend-api.md) (authored in this commit)
- OS keychain entry layout → [contracts/desktop-keychain.md](./contracts/desktop-keychain.md) (authored in this commit)
