# Tasks: 002-cloud-auth

**Branch**: 001-rebrand-pass (continuing the single-branch model)
**Spec**: spec.md  **Plan**: plan.md
**Status**: implementation in progress

## Phase 1 — Setup

- [X] T001 Create services/atlas-auth-api package skeleton (Hono + wrangler) in services/atlas-auth-api/
- [X] T002 Create crates/atlas-auth-client (Cargo.toml + lib.rs) in crates/atlas-auth-client/
- [X] T003 Create ui/desktop/src/auth/ folder with index.ts barrel
- [X] T004 Add `services/` and `crates/atlas-auth-client/` to .gitignore as needed (target/, node_modules/, .dev.vars)

## Phase 2 — Foundational (blocks all stories)

- [X] T005 Backend: define types (auth.ts, jwt.ts, db.ts) in services/atlas-auth-api/src/
- [X] T006 Backend: Postgres schema migration in services/atlas-auth-api/src/db/schema.sql
- [X] T007 Rust client: PKCE generator (S256, 128-char verifier) in crates/atlas-auth-client/src/pkce.rs
- [X] T008 Rust client: opaque refresh-token holder type in crates/atlas-auth-client/src/token.rs
- [X] T009 Desktop: AuthSession + SignInAttempt types in ui/desktop/src/auth/types.ts
- [X] T010 Desktop: AuthContext provider in ui/desktop/src/auth/AuthContext.tsx

## Phase 3 — User Story 1: First-time sign-in (P1)

- [X] T011 [US1] Backend: POST /v1/auth/token (authorization_code grant) with stub-IdP fallback
- [X] T012 [US1] Backend: GET /v1/me endpoint
- [X] T013 [US1] Backend: JWT signing (HS256 v1) in services/atlas-auth-api/src/jwt.ts
- [X] T014 [US1] Backend: stub IdP module — STUB_IDP=true bypasses WorkOS, returns predictable user
- [X] T015 [US1] Desktop: SignInScreen.tsx with "Sign in with Atlas" + "Use my own API keys"
- [X] T016 [US1] Desktop: PasteCodeScreen.tsx (primary firewall fallback)
- [X] T017 [US1] Main: IPC handlers `auth-start-sign-in`, `auth-submit-code`, `auth-sign-out`
- [X] T018 [US1] Main: atlas:// URL handler delivers code to in-flight sign-in attempt
- [X] T019 [US1] Main: OS keychain entries (refresh-token, device-install-id) via safeStorage
- [X] T020 [US1] Preload: window.atlasAuth bridge

## Phase 4 — User Story 2: Refresh (P1)

- [X] T021 [US2] Backend: refresh_token grant in POST /v1/auth/token (with rotation)
- [X] T022 [US2] Backend: rotation-theft detection (R-RT-004) revokes all user tokens on reuse
- [X] T023 [US2] Desktop: auto-refresh on 401 from any authenticated request

## Phase 5 — User Story 3: Subscription polling (P2)

- [X] T024 [US3] Backend: GET /v1/subscription endpoint
- [X] T025 [US3] Desktop: 5-min poll loop after sign-in; updates AuthContext.subscription

## Phase 6 — User Story 4: Sign-out (P2)

- [X] T026 [US4] Backend: POST /v1/auth/revoke (cascading revoke)
- [X] T027 [US4] Desktop: sign-out action wipes keychain + memory; calls revoke

## Phase 7 — Production-readiness deferred

These ship before public launch but NOT in this session — they require external infra Darshan needs to provision:

- [ ] T028 Real WorkOS integration (set STUB_IDP=false, configure WORKOS_CLIENT_ID + API_KEY)
- [ ] T029 Cloudflare Workers deploy (wrangler.toml + custom domain bind)
- [ ] T030 Postgres production database (Neon/Supabase) + connection pooling
- [ ] T031 Cert pinning (R-002-006) — needs cert SPKI after the api.atlas.netgroup.ai cert is issued
- [ ] T032 Rotation to RS256 + JWKS (v1.5)
- [ ] T033 Loopback callback server (parallel fallback) — paste-the-code primary is implemented; loopback is the parallel
- [ ] T034 E2E playwright test in ui/desktop/src/auth/e2e/sign-in.spec.ts (needs stub IdP harness)
- [ ] T035 token-leak-scan CI check

## Done When (this session)

- [ ] Backend dev server runs locally (`pnpm wrangler dev` in services/atlas-auth-api)
- [ ] Postgres schema applies clean
- [ ] Desktop sign-in screen renders, paste-code accepts the stub IdP's code, JWT returns
- [ ] Keychain shows refresh-token entry (verified via Keychain Access app)
- [ ] /v1/me round-trips with the stored access token
- [ ] Sign-out wipes keychain entries
