# Implementation Plan: Cloud Auth for Atlas Desktop

**Branch**: `001-rebrand-pass` (auth is being planned on the active rebrand branch; will move to its own `002-cloud-auth` branch when implementation begins) | **Date**: 2026-05-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-cloud-auth/spec.md` (clarifications complete: WorkOS / 5-min polling / paste-the-code + localhost-loopback fallback)

## Summary

Deliver a Windsurf/Cursor-style desktop sign-in flow: user clicks **Sign In** in Atlas → system browser opens **`auth.atlas.netgroup.ai`** (WorkOS AuthKit hosted UI) → user authenticates (email/password, social login, MFA, future SSO) → browser redirects back via **`atlas://auth?code=...`** (with parallel localhost-loopback and a paste-the-code fallback for blocked deep links) → desktop exchanges the code at **`api.atlas.netgroup.ai/v1/auth/token`** for a JWT access token (15-min TTL) + opaque rotating refresh token (30-day TTL) → tokens stored exclusively in the OS keychain → main UI unlocks. Returning users get silent refresh on launch; sign-out revokes server-side and wipes the keychain. Subscription tier (Free / Pro / Team) is fetched at sign-in and polled every 5 minutes; tier gates Atlas Cloud features but BYOK and Local modes remain available signed-out.

## Technical Context

**Language/Version**: Rust (workspace) for the desktop's auth-client crate; TypeScript / React for the desktop UI auth screens; TypeScript (Node.js) for the cloud auth backend (`services/atlas-auth-api`). The cloud auth UI itself is **WorkOS AuthKit hosted** — Atlas does not build the sign-in page.

**Primary Dependencies**: WorkOS (AuthKit + Organizations + Directory Sync); `@workos-inc/node` for the backend; `jose` for JWT verification in the desktop (no client secret); Electron's `safeStorage` API for OS-keychain access (macOS Keychain / Windows Credential Manager / libsecret); `electron.shell.openExternal` for system-browser launch; Hono (or Express) for the auth-backend service. PKCE implemented inline (no library — ~40 lines of crypto).

**Storage**:
- Desktop: OS keychain ONLY for tokens (Constitution Principle I). No plaintext.
- Cloud auth backend: PostgreSQL for `refresh_tokens` (rotation cursor, device_install_id, revoked_at), `audit_events` (sign-in / refresh / sign-out timestamps; never the tokens themselves), and `subscription_state` (mirror of Stripe / billing tier — populated by spec `024-skill-pricing` once that lands; mocked at v1).
- WorkOS holds the canonical user identity, password (if any), social linkings, MFA factors, SSO connections.

**Testing**:
- Desktop unit: Vitest for the TypeScript auth screens; Rust integration test for the auth-client crate. Specifically: state-mismatch rejection, PKCE verifier discard, keychain round-trip, refresh rotation.
- Desktop integration: Playwright E2E on all 3 OSes — full first-signin / relaunch / sign-out cycle against a WorkOS sandbox project.
- Cloud backend: Vitest for unit + a stub-WorkOS integration test that exercises code-exchange, refresh-rotation, revoke endpoints.
- Security: dedicated test that scans all log files + telemetry payloads for token-shaped strings after a full session (per spec FR-014).

**Target Platform**: macOS 12+, Windows 10+, Linux x86_64 (matches Atlas's overall platform target from spec `001-rebrand-pass`). Cloud backend deploys to Cloudflare Workers (preferred — auto-scaled, edge-cached, integrates well with WorkOS webhook delivery) OR Fly.io (fallback if Workers' Node runtime constraints bite).

**Project Type**: Desktop client (Rust + Electron) + cloud SaaS backend (Node service) + WorkOS-hosted IdP. Three-tier.

**Performance Goals**:
- Sign-in cold flow: < 60s end-to-end (SC-001).
- Silent refresh on launch: < 2s (SC-002).
- Token endpoint response: p95 < 200ms.
- Subscription poll endpoint: p95 < 100ms (it's a cached lookup).

**Constraints**:
- No client secret embedded in the desktop binary (PKCE only).
- All tokens MUST be JWT for access, opaque for refresh (per `contracts/auth-flow.md` R-AUTH-005).
- Refresh tokens rotate every use (R-AUTH-006).
- Atlas tokens NEVER appear in telemetry, crash reports, or logs at INFO+ (R-AUTH-007; verified by SC-004).
- All transport TLS 1.3+ with cert-pinning on the auth + api hosts (R-AUTH-010).
- Sign-in must work behind corporate firewalls that block `atlas://` (paste-code + loopback fallback per Q3 clarification).

**Scale/Scope**: First-year target ≤ 100K MAU. WorkOS free tier covers this 10×. Cloud backend stateless except for the Postgres tables; Postgres at v1 can be a $30/mo Neon or Supabase managed instance, no sharding needed for years.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluating against [Atlas Constitution v1.0.0](../../.specify/memory/constitution.md):

| # | Principle | Status | Justification |
|---|-----------|--------|---------------|
| I | User Data Sovereignty (NON-NEGOTIABLE) | ✅ PASS | Tokens stored ONLY in OS keychain (FR-005). Refresh tokens rotate (FR-006). Audit log records timestamps + event types — never token values, codes, or `state` (FR-014). Cloud backend logs do not contain user payloads — only metadata required for token issuance. |
| II | Inspectable Reasoning | ✅ PASS | Local audit log (FR-014) lets the user inspect every auth event. No hidden background calls — the refresh happens transparently and the activity is visible in the log. |
| III | License Hygiene (NON-NEGOTIABLE) | ✅ PASS | All listed dependencies (`@workos-inc/node` Apache-2.0; `jose` MIT; `safeStorage` Electron-bundled; Hono MIT) are on the permitted-license list. Cloud backend's npm packages must pass the existing `license-denylist` CI from spec 001. |
| IV | Cross-Platform Parity | ✅ PASS | Full sign-in / refresh / sign-out cycle MUST work on macOS, Windows, Linux per SC-005. OS-keychain access uses Electron's `safeStorage` which abstracts macOS Keychain / Windows Credential Manager / libsecret uniformly. |
| V | Cost-Bounded by Default (NON-NEGOTIABLE) | ➖ N/A in this spec | Cost bounds apply to the LLM proxy (spec `003-llm-proxy`). This spec only authenticates; it does not consume LLM tokens. The subscription tier this spec surfaces is what `024-skill-pricing` will use to enforce limits. |
| VI | Specs Are Source of Truth | ✅ PASS | Spec drafted, clarify complete, this plan, /speckit-tasks next, /speckit-analyze before /speckit-implement. Constitution-mandatory clarify ran because this spec touches auth + persistent credential storage. |

**Gate result: PASS.** Complexity Tracking section below remains empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-cloud-auth/
├── spec.md                  # WHAT and WHY — clarify complete
├── plan.md                  # This file (/speckit-plan output)
├── research.md              # Phase 0 — research decisions
├── data-model.md            # Phase 1 — AuthSession, SignInAttempt, SubscriptionState, AuditEvent
├── quickstart.md            # Phase 1 — engineer onboarding for 002
├── contracts/
│   ├── auth-flow.md         # already authored — wire-level handshake
│   ├── token-shapes.md      # Phase 1 — JWT claims schema + refresh-token model
│   ├── auth-backend-api.md  # Phase 1 — service-level contracts for api.atlas.netgroup.ai
│   └── desktop-keychain.md  # Phase 1 — OS-keychain entry naming + lifecycle contract
├── checklists/
│   └── requirements.md      # already passing
└── tasks.md                 # Phase 2 output (/speckit-tasks, NOT created by /plan)
```

### Source Code (repository root)

Per the "Inherited fork with surgical overlays" pattern from spec 001, all 002 code lives in NEW modules; no upstream Goose code is restructured.

```text
atlas/                                       (Atlas fork of upstream Goose)
├── crates/
│   ├── atlas-branding/                      (existing, from spec 001)
│   └── atlas-auth-client/                   ← NEW for spec 002
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs                       # PKCE pair gen, state CSRF, JWT verify
│           ├── flow.rs                      # OAuth code-exchange + refresh logic
│           ├── pins.rs                      # cert-pin fingerprints for auth/api hosts
│           └── (tests/)
├── ui/desktop/src/
│   ├── branding/                            (existing, from spec 001)
│   └── auth/                                ← NEW for spec 002
│       ├── index.ts                         # public API: signIn(), signOut(), getSession()
│       ├── browser-launch.ts                # shell.openExternal with state+PKCE params
│       ├── deep-link-handler.ts             # atlas://auth callback receiver (singleton)
│       ├── loopback-listener.ts             # 127.0.0.1:<random> fallback HTTP server
│       ├── paste-code-screen.tsx            # manual code entry fallback UI
│       ├── sign-in-screen.tsx               # primary sign-in entry point
│       ├── session-store.ts                 # in-memory access-token cache + refresh scheduler
│       ├── keychain-bridge.ts               # IPC wrapper around Electron safeStorage
│       ├── subscription-poller.ts           # 5-minute polling of /v1/subscription
│       └── __tests__/
└── services/                                ← NEW top-level for backend code (no upstream conflict)
    └── atlas-auth-api/                      ← NEW for spec 002
        ├── package.json
        ├── src/
        │   ├── index.ts                     # service entry — Hono on Cloudflare Workers
        │   ├── routes/
        │   │   ├── token.ts                 # POST /v1/auth/token (code or refresh grant)
        │   │   ├── revoke.ts                # POST /v1/auth/revoke
        │   │   ├── me.ts                    # GET /v1/me
        │   │   └── subscription.ts          # GET /v1/subscription
        │   ├── workos-client.ts             # @workos-inc/node wrapper + retry/circuit-breaker
        │   ├── jwt.ts                       # KMS-signed JWT issuance + JWKS publishing
        │   ├── db/
        │   │   ├── schema.sql               # refresh_tokens, audit_events, subscription_state
        │   │   └── migrations/
        │   └── tests/
        ├── wrangler.toml                    # Cloudflare Workers config
        └── README.md
```

**Structure Decision**: All 002 code in three new self-contained modules (`crates/atlas-auth-client`, `ui/desktop/src/auth/`, `services/atlas-auth-api`). Upstream Goose receives only **one** surgical touch: `ui/desktop/src/main.ts` already registers the `atlas://` URL handler (from spec 001) — this spec wires the auth module into that handler via the IPC bridge already plumbed. No other upstream file is modified. Cloud backend lives in a new top-level `services/` directory that doesn't exist in upstream — zero merge surface against future Goose pulls.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations to justify.

No violations. This table is intentionally empty.
