# Feature Specification: Cloud Auth for Atlas Desktop

**Feature Branch**: `002-cloud-auth`

**Created**: 2026-05-30

**Status**: Draft

**Input**: User description: "When a user opens Atlas they see a Sign In screen. Clicking Sign In opens their system browser to a NET-Group-owned auth page (`auth.atlas.netgroup.ai`). They sign in with email + password OR Google/SSO. A subscription check happens server-side. The browser redirects back to the desktop app via `atlas://auth?code=…`. The desktop app exchanges that code for an access + refresh token, stores them in the OS keychain, and the user is signed in — closing the app and reopening doesn't re-prompt. Same UX as Cursor / Windsurf / Linear / ChatGPT Desktop."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — First-time sign-in via browser (Priority: P1) 🎯 MVP

A new user installs Atlas, opens it, and sees a Sign In screen. They click Sign In; their default browser opens to `auth.atlas.netgroup.ai`. They enter email + password (or use Google / GitHub / SSO) and complete the sign-in. The browser shows a confirmation page and triggers an `atlas://auth?code=...` deep link that hands control back to the desktop app. Atlas exchanges the code for tokens, stores them in the OS keychain, and shows the main UI. The whole flow takes under 60 seconds and never requires the user to copy/paste anything.

**Why this priority**: Without this, Atlas can't function as a managed product. Every other paid capability (proxy quota, subscription gating, per-org policy) depends on the user being authenticated.

**Independent Test**: Fresh install on a clean macOS / Windows / Linux VM. Click Sign In. Confirm: (a) system browser opens to the auth URL with the correct return-redirect parameters; (b) on completing sign-in, the browser triggers `atlas://` and the desktop window comes to the foreground; (c) after the trip, the main UI is unlocked and the user's display name appears in the top-right.

**Acceptance Scenarios**:

1. **Given** a fresh Atlas install with no stored credentials, **When** the user clicks Sign In, **Then** the system default browser opens to `auth.atlas.netgroup.ai/signin?return=atlas%3A%2F%2Fauth&state=<csrf>&pkce_challenge=<base64>`.
2. **Given** the user has signed in via the browser, **When** the browser redirects to `atlas://auth?code=<opaque>&state=<csrf>`, **Then** Atlas validates the `state` value against the one it sent, exchanges the code for tokens at `api.atlas.netgroup.ai/v1/auth/token`, and stores them in the OS keychain.
3. **Given** invalid or mismatched `state`, **When** the deep link arrives, **Then** Atlas rejects it, logs a security event locally, and shows a clear error toast — it does NOT silently retry.
4. **Given** sign-in completed on web but the deep link never reaches the app (user closed browser, OS dropped the URL), **When** the user clicks Sign In again, **Then** the flow restarts cleanly with a fresh `state` / PKCE pair.

---

### User Story 2 — Returning user, silent token refresh (Priority: P1) 🎯 MVP

A user who signed in previously closes Atlas and reopens it later (minutes, hours, or days). They are not re-prompted for credentials. The app loads the refresh token from the OS keychain, exchanges it for a fresh access token, and shows the main UI within ~2 seconds. The user sees no auth-related screen unless the refresh actually fails.

**Why this priority**: Re-prompting every launch destroys the Cursor/Windsurf experience. Daily-active users would abandon.

**Independent Test**: After User Story 1 succeeds, close Atlas. Reopen. Observe: no Sign In screen flashes, the main UI loads with the correct user displayed in the header.

**Acceptance Scenarios**:

1. **Given** a refresh token in the OS keychain, **When** Atlas launches, **Then** within 2 seconds the app obtains a fresh access token and shows the main UI without any sign-in screen flash.
2. **Given** the refresh token has been revoked server-side (e.g., admin force-signout), **When** Atlas tries to refresh, **Then** the app clears local credentials, returns to the Sign In screen, and shows a "Your session expired" message.
3. **Given** the user has no network connectivity at launch, **When** Atlas tries to refresh, **Then** if the cached access token is still within its TTL, the app proceeds offline; otherwise it shows a clear "Sign in needed when you're back online" state — it does NOT silently lock the user out of viewing existing local sessions.

---

### User Story 3 — Subscription check (Priority: P2)

After sign-in, Atlas verifies the user's subscription tier with the auth backend. The user sees their plan (Free / Pro / Team) in Settings. Features that require Pro (e.g., the cloud-proxy LLM mode) are gated behind a clearly-labelled upgrade affordance for Free users; BYOK and Local modes remain available to everyone.

**Why this priority**: P2 because the rebrand spec's BYOK mode is the v1 floor — paid tiers add to it, they don't replace it.

**Independent Test**: Sign in with a known-Free test account; confirm Cloud-proxy mode shows an "Upgrade to Pro" affordance. Sign in with a Pro test account; confirm Cloud-proxy is available.

**Acceptance Scenarios**:

1. **Given** a Free-tier user signs in, **When** they open the model picker, **Then** Atlas Cloud entries appear with an "Upgrade" badge and selecting one routes to the upgrade page in browser.
2. **Given** a Pro-tier user signs in, **When** they open the model picker, **Then** Atlas Cloud entries are selectable directly.
3. **Given** a user upgrades from Free to Pro on the web while Atlas is open, **When** Atlas next polls subscription state (or after manual refresh from Settings → Sign Out → Sign In), **Then** the gating disappears within one polling cycle (≤ 5 minutes) or immediate re-sign-in.

---

### User Story 4 — Sign out (Priority: P2)

The user clicks "Sign Out" in Settings. Atlas revokes the refresh token at the backend, clears tokens from the OS keychain, and returns to the Sign In screen. Local data (chat history, BYOK keys) is preserved unless the user explicitly chooses "Sign Out and Erase Local Data".

**Why this priority**: P2 because most users sign in once and stay signed in; sign-out is a low-traffic but security-critical surface.

**Independent Test**: After signed-in state, open Settings → Sign Out. Confirm: keychain entries gone, Sign In screen shown, refresh token returns 401 if used out-of-band.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they click Sign Out, **Then** Atlas calls `api.atlas.netgroup.ai/v1/auth/revoke`, deletes both access + refresh tokens from the OS keychain, and shows the Sign In screen.
2. **Given** the user picks "Sign Out and Erase Local Data", **When** they confirm the destructive dialog, **Then** Atlas also deletes the Atlas-namespaced config directory before showing Sign In.

---

### Edge Cases

- **Multiple browser windows / tabs open**: only the deep link from the legitimate auth flow's state matches; spurious `atlas://` URLs from other tabs are rejected with a logged warning.
- **Deep link arrives while a different Atlas window has focus**: the auth handler is process-singleton; the URL is routed to the window that initiated the sign-in, not the most recently focused window.
- **User clicks Sign In twice in quick succession**: the second click cancels the first (the in-flight `state` is invalidated); only the most recent state is honoured.
- **OS keychain access is denied** (user revoked permission, MDM policy): Atlas shows a clear error explaining what the keychain is used for and how to re-grant; offers a fallback "session-only" mode that holds the access token in memory and re-prompts at next launch.
- **Sign-in completes on a different device** (e.g., user signs in on phone before desktop receives the deep link): the desktop's pending state expires after 10 minutes and asks the user to retry from Sign In.
- **Clock skew between desktop and server**: token validation tolerates ±5 minutes of clock skew; outside that the app shows a clear "Your system clock is too far off — please correct your system time" error rather than a generic "session expired".
- **User on corporate proxy / firewall** that blocks `atlas://`: an in-app fallback lets the user paste the one-time code shown on the auth page (degraded UX but functional).
- **Multiple Atlas installs on the same machine** (e.g., stable + beta channels): each registers its own URL scheme variant (`atlas://`, `atlas-beta://`); only one channel can be primary at a time.
- **User signs in to Atlas on a machine that also has upstream Goose installed** (per spec `001-rebrand-pass` SC-005): Atlas tokens MUST live in the Atlas-namespaced keychain entry; upstream Goose's keychain is untouched.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Atlas MUST present a Sign In screen on first launch (no stored refresh token) and on any launch where the stored refresh token returns a final rejection from the backend (not transient errors).
- **FR-002**: The Sign In flow MUST use the user's default system browser (not an in-app web view) to display `auth.atlas.netgroup.ai`. The OAuth 2.0 authorization-code flow with PKCE is used; no client secret is embedded in the desktop binary.
- **FR-003**: The sign-in callback MUST be delivered to Atlas via the `atlas://auth` deep link registered in spec `001-rebrand-pass` FR-005 / contract `url-scheme.md`.
- **FR-004**: Every Sign In click MUST generate a fresh CSRF `state` value (cryptographically random, ≥128 bits) and PKCE `code_verifier`. The desktop client MUST reject any deep link whose `state` does not match the one it issued for an active sign-in attempt.
- **FR-005**: After successful code exchange, Atlas MUST store the access token AND refresh token in the OS-native secure store ONLY (macOS Keychain, Windows Credential Manager, Linux libsecret). Tokens MUST NOT be written to plaintext files, log files, or telemetry payloads.
- **FR-006**: Refresh tokens are rotating: every refresh request returns a new refresh token; the previous one is invalidated server-side. Atlas MUST update the stored refresh token after every successful refresh.
- **FR-007**: Atlas MUST attempt a silent refresh at launch when a refresh token exists. The main UI MUST NOT be unlocked until either (a) refresh succeeds and produces a valid access token, or (b) the cached access token's `exp` is still in the future.
- **FR-008**: The user MUST be able to sign out from Settings. Sign-out MUST call the backend revoke endpoint AND delete tokens from the OS keychain. Failure to reach the revoke endpoint MUST NOT prevent local token deletion.
- **FR-009**: Atlas MUST display the signed-in user's display name and avatar (sourced from the access-token claims) in the application header. If avatar is missing, show a default placeholder.
- **FR-010**: Atlas MUST display the user's current subscription tier (Free / Pro / Team) in Settings. Subscription state is refreshed at sign-in and on a polling interval (≤ 5 minutes) while the app is open.
- **FR-011**: When a user on the Free tier selects a Pro-only feature, Atlas MUST show an inline upgrade affordance that links to the billing page in the system browser. It MUST NOT silently fail or show a generic permission error.
- **FR-012**: BYOK mode (per spec `001-rebrand-pass`) MUST remain available to signed-out users at v1. Sign-in is required only to use Atlas Cloud (proxy) features.
- **FR-013**: Atlas MUST register itself as the OS handler for `atlas://` exactly once per install (per spec `001-rebrand-pass` contract `url-scheme.md`). Duplicate registrations across Atlas channels (stable, beta) MUST be disambiguated by scheme suffix (`atlas-beta://`).
- **FR-014**: Atlas MUST persist a local audit log of auth events (sign-in, refresh, sign-out, revoked-token detection) in the Atlas-namespaced log directory. Audit logs MUST NOT contain token values, codes, or `state` parameters — only event types and timestamps.

### Key Entities

- **AuthSession**: The signed-in user's session as it exists on the desktop. Holds: access token (in-memory, OS keychain), refresh token (OS keychain), token-rotation cursor, expiry timestamps, claims (user id, email, display name, avatar URL, subscription tier).
- **SignInAttempt**: A pending in-flight sign-in. Holds: random `state`, PKCE `code_verifier`, initiated-at timestamp, window reference (which Atlas window started this attempt). Lives for at most 10 minutes; expired attempts are GC'd.
- **SubscriptionState**: Cached subscription tier + entitlements (e.g., monthly token quota). Refreshed on a polling cadence.
- **AuditEvent**: One auth event (sign-in / refresh / sign-out / revoked / error). Holds: event type, timestamp, error code if applicable. Token values, codes, and CSRF state are NEVER recorded.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user completes first-time sign-in (download Atlas already installed → click Sign In → enter creds in browser → land in main UI) in under 60 seconds on each of the three supported OSes.
- **SC-002**: A returning user with a valid refresh token sees the main UI within 2 seconds of launch, without a Sign In screen flashing.
- **SC-003**: After sign-out, no Atlas-issued tokens remain readable in the OS keychain, the application's process memory (verified by zeroing helper), or any log file under the Atlas config directory.
- **SC-004**: Zero auth tokens, codes, or `state` values appear in any telemetry payload, crash report, or audit-log entry sent off-device.
- **SC-005**: The full sign-in + refresh + sign-out cycle works on macOS, Windows, and Linux with no platform-specific failure modes (verified by E2E test on all three OSes).
- **SC-006**: Re-running sign-in after a deep-link delivery failure succeeds without manual cache-clearing on at least 95% of attempts (measures resilience to the "browser opened, never returned" edge case).
- **SC-007**: Sign-in works when Atlas is running behind a corporate HTTP proxy that respects the system proxy settings, OR — if `atlas://` is blocked — degrades to the paste-the-code fallback in under 90 seconds.
- **SC-008**: Subscription state is reflected in the UI within 5 minutes of a server-side change, without requiring user action.

## Assumptions

- **NET Group provisions a managed auth provider** — Clerk, WorkOS, Auth0, Supabase Auth, or a similar SaaS — that handles email/password, social login, MFA, and the OAuth 2.0 / PKCE flow. Building the IdP from scratch is out of scope of this spec; the choice is captured in `research.md` once `/speckit-clarify` runs.
- **`auth.atlas.netgroup.ai` and `api.atlas.netgroup.ai` are deployable** — domains registered, DNS configured, TLS certs in place. The cloud-side web app and token endpoint are part of this spec's implementation; the platform / hosting choice is captured during planning.
- **Subscription billing exists in some form** — Stripe is the assumed default for v1; the integration is the subject of spec `024-skill-pricing` (deferred). For this spec, the auth backend exposes a `subscription` claim/endpoint with sensible mock data until real billing is wired.
- **BYOK mode continues to work signed-out** at v1, per the constitution's "data sovereignty" principle. Sign-in is required only for Atlas Cloud (proxy) features.
- **The `atlas://` URL scheme is registered exclusively to Atlas** per spec `001-rebrand-pass`'s contract; this spec consumes that registration, doesn't create it.
- **OS keychain is available on all three platforms** — macOS Keychain (Security framework), Windows Credential Manager (wincred), Linux libsecret/Secret Service. Atlas falls back to a clear "session-only" mode if keychain access is denied, per Edge Cases.
- **No federated identity sharing with upstream Goose** — the constitution forbids reading Goose state; Atlas tokens are stored exclusively in Atlas-namespaced keychain entries.
- **In-app web views are deliberately NOT used for auth.** Industry consensus (Google, GitHub, IETF RFC 8252) is that desktop OAuth must use the system browser to avoid phishing surface, password-manager hostility, and policy violations. The "click Sign In opens browser" UX is by design.

## Out of scope (will be addressed by adjacent specs)

- The cloud-proxy LLM gateway itself — spec `003-llm-proxy`. This spec only authenticates; the proxy spec owns rate-limiting, quota, and the actual `/v1/messages` endpoint.
- Per-org policy / admin governance — spec `022-skill-governance`. This spec covers individual users; org-tier features layer on top.
- Skill-based pricing tiers — spec `024-skill-pricing`. This spec only reports the user's tier; the billing model itself is elsewhere.
- The admin console (`021-admin-console`) — separate web app. Out of scope here.
- Audit-log export / SIEM integration — deferred; this spec defines the local audit-log shape only.
