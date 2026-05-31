# Quickstart: Cloud Auth for Atlas Desktop

**Feature**: `002-cloud-auth`
**Audience**: Engineer joining 002-cloud-auth work mid-stream; productive in 30 min.

---

## Prerequisites

Same as spec 001's quickstart (Rust 1.92+, Node 22, pnpm 10, `just`, cmake) **PLUS**:

- A WorkOS account at https://workos.com (free tier; sign up with NET Group email).
- A WorkOS organization for Atlas, with these set up in the WorkOS dashboard:
  - **AuthKit hosted UI** enabled with custom domain pointing at `auth.atlas.netgroup.ai` (CNAME via Cloudflare).
  - **OAuth client** with redirect URIs:
    - `atlas://auth`
    - `http://127.0.0.1:*/callback` (loopback wildcard)
  - **Sign-in methods** enabled: email + password, Google, GitHub, Microsoft.
  - **MFA** optional at v1; required-for-Pro is configured in spec 024.
- Cloudflare account with a Workers + Pages plan (free tier OK for v1).
- Postgres database (Neon, Supabase, or Cloudflare D1 once it stabilizes for Atlas's load).

Credentials needed locally for development:
- `WORKOS_CLIENT_ID` (from WorkOS dashboard)
- `WORKOS_API_KEY` (server-side; NEVER ship to desktop binary)
- `WORKOS_WEBHOOK_SECRET`
- `JWT_SIGNING_SECRET` (generate one for dev: `openssl rand -base64 32`)
- `DATABASE_URL` (Postgres connection string)

Store in `services/atlas-auth-api/.dev.vars` (gitignored).

---

## 5-minute orientation

1. Open `specs/002-cloud-auth/` in your editor.
2. Read `spec.md` end-to-end (~10 min). Note the 3 clarifications in the `## Clarifications` section.
3. Skim `plan.md` (5 min). Focus on Constitution Check (all green) and Project Structure (the three new modules).
4. Read `research.md` (5 min). The 8 R-002-* decisions are the basis for every implementation choice.
5. Skim `contracts/*.md`. Four contracts: `auth-flow.md` (handshake), `token-shapes.md` (JWT + opaque refresh), `auth-backend-api.md` (HTTP endpoints), `desktop-keychain.md` (keychain entries).
6. Read `data-model.md` (5 min). Four entities; understand where each lives.

---

## Local dev setup

```bash
# Backend service
cd ~/code/atlas/services/atlas-auth-api
pnpm install
cp .dev.vars.example .dev.vars           # populate WorkOS + JWT + DB secrets
pnpm wrangler dev                         # local dev server on http://127.0.0.1:8787

# In another terminal, Postgres
docker run -d --name atlas-auth-postgres -e POSTGRES_PASSWORD=devpass -p 5432:5432 postgres:16
pnpm tsx src/db/migrate.ts                # run schema.sql migrations

# Desktop client crate
cd ~/code/atlas
cargo test -p atlas-auth-client           # run the crate tests

# Desktop auth UI
cd ~/code/atlas/ui/desktop
pnpm run typecheck
pnpm vitest src/auth                       # run auth-screen unit tests

# Full sign-in dry run (Atlas points at local backend)
cd ~/code/atlas/ui/desktop
ATLAS_AUTH_BACKEND_URL=http://127.0.0.1:8787 pnpm run start-gui
```

---

## Where to make changes

| Change | File / module |
|---|---|
| Add a new field to AuthSession | `ui/desktop/src/auth/index.ts` + `crates/atlas-auth-client/src/lib.rs` + JWT claim in `services/atlas-auth-api/src/jwt.ts` (3-way lockstep) |
| Adjust sign-in screen UI | `ui/desktop/src/auth/sign-in-screen.tsx` |
| Adjust paste-code fallback UI | `ui/desktop/src/auth/paste-code-screen.tsx` |
| Change PKCE algorithm | `crates/atlas-auth-client/src/lib.rs` (Rust side) + `ui/desktop/src/auth/index.ts` (TS side) — both must match |
| Add an API endpoint | `services/atlas-auth-api/src/routes/` + update `contracts/auth-backend-api.md` in the SAME commit |
| Change refresh-token TTL | `services/atlas-auth-api/src/db/schema.sql` + `contracts/token-shapes.md` R-RT-001 |
| Adjust cert pin list | `crates/atlas-auth-client/src/pins.rs` — follow the 90-day rotation procedure in `research.md` R-002-006 |

---

## Running tests

```bash
# Backend
cd services/atlas-auth-api && pnpm test

# Rust auth client
cargo test -p atlas-auth-client

# Desktop UI auth screens
cd ui/desktop && pnpm vitest src/auth

# Full E2E (after building the desktop)
cd ui/desktop && pnpm playwright test src/auth/e2e
```

The Playwright E2E spawns a stub WorkOS, runs the full sign-in cycle, asserts tokens land in the keychain. It is the most important regression net.

---

## Common pitfalls

- **"My JWT verifies locally."** — At v1 you should NOT verify locally. The desktop calls `/v1/me` instead. Self-verification ships at v1.5 with RS256 + JWKS.
- **"I added a refresh-token-rotation bypass for testing."** — Don't. The rotation theft response (R-RT-004) is the only mechanism keeping a stolen token from being used. Tests should exercise the rotation, not skip it.
- **"I logged the refresh token to debug."** — That will fail the `token-leak-scan.test.ts` and break CI. Use the audit event types instead (no token contents).
- **"I imported `keytar` to read the keychain."** — Don't. `safeStorage` is the only sanctioned path. Two-layer protection requires it.
- **"I want to test against production WorkOS."** — Use a separate WorkOS environment (Sandbox). Sandbox tokens are clearly marked so production billing isn't touched.

---

## Next-step roadmap (when 002 is done)

After 002-cloud-auth ships:

- **003-llm-proxy**: the `api.atlas.netgroup.ai/v1/messages` LLM gateway that uses tokens from this spec.
- **007-provider-pricing** + **008-usage-analytics**: surface the `subscription_state` + token usage to the user.
- **021-admin-console**: web app where org admins manage org settings, members, billing — uses WorkOS Organizations.
- **022-skill-governance**: per-org policy enforced on the desktop using JWT claims from this spec.
- **024-skill-pricing**: billing tier enforcement using `subscription_state` + Stripe integration.

Each of those depends on something this spec puts in place.
