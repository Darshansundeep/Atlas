# Atlas Roadmap — single-page status

**Updated**: 2026-05-31 (end-of-day)
**Branch**: `001-rebrand-pass` (single working branch; all work lives here)
**Repo**: https://github.com/Darshansundeep/Atlas
**Constitution**: [.specify/memory/constitution.md](../.specify/memory/constitution.md)

This is the only file you need to read tomorrow morning. Everything below
points at a more detailed spec when it matters.

---

## Pick-up order for the next session

Two recommended pushes, in order. Both are ~1 hour each; either alone is
a meaningful day's work.

### 1. Make Skills actually work — Spec 022 v0.3

**Status**: catalogue + admin CRUD + version history + desktop browse
shipped. Install button currently only toggles a local flag — goosed
doesn't wire the MCP extension in yet.

**Tomorrow's task**: when a user installs a skill, take its
`manifest.extensions[]`, push them into goosed's extension manager, and
have them available in the next chat. Sub-tasks in
[`specs/022-skill-platform/tasks.md`](022-skill-platform/tasks.md).

### 2. Close spec 001 leftovers — keychain + sessions migration

**Status**: rebrand 85% done. Two known artifacts:
- macOS still prompts for the legacy `"goose"` keychain entries on first
  launch (you've seen this dialog). The Atlas keychain namespace
  (`ai.netgroup.atlas`) is in place for new credentials but old reads
  haven't been migrated.
- Sessions on disk still live at `~/.local/share/goose/sessions/`.

**Tomorrow's task**: migrate both. Details in
[`specs/001-rebrand-pass/tasks.md`](001-rebrand-pass/tasks.md) tasks
T015 (binary), T018-T019 (Rust paths), T021-T023 (assets/splash).

---

## What's running today

Everything in this column is in the repo and works locally against
Postgres + the two Hono services.

| Spec | What's shipped |
|---|---|
| **001 rebrand** | Atlas branding, FEATURES gates, `atlas://` scheme, Atlas account card, Apache 2.0 LICENSE preserved. ~85% complete. |
| **002 cloud-auth** | Sign-in/refresh/revoke against stub IdP, rotation-theft detection, audit log, OS-keychain-encrypted refresh tokens, AuthContext + IPC bridge. **Stub IdP only — production swap-ins pending.** |
| **003 llm-proxy** | Hono service at :8788. Anthropic adapter, JWT verify, **Constitution-V daily-USD cap enforced before any provider call**, usage_events ledger. Anthropic-only at v0.1. |
| **005 tool-call progress** | Staged Cancel / Diagnose / "Likely stuck" prompt. |
| **006 file attachments** | Inline path chips, click-to-open, right-click-reveal. |
| **007 provider pricing** | Settings → Models → Pricing Overrides, per-(provider, model) USD/M editor, persisted locally. |
| **008 usage analytics** | Usage tab with Tokens/Sessions/Cost/Tool-calls cards, daily sparkline, Top tools table. **Append-only ledger preserves history through Delete-all.** |
| **011 model catalogue** | Postgres table, 17 seeded models, admin CRUD, desktop CostTracker consults override→catalogue. |
| **021 admin (min)** | `/admin` HTML SPA, `ADMIN_TOKEN` gate, Overview / People / Sessions / Audit / Models / Skills tabs. Full RBAC console deferred. |
| **022 skill platform** | Catalogue + admin CRUD with **edit / in-place save / publish new version / version history / rollback**, public read API, desktop Skills tab with install/uninstall toggle and tier-locking. **Runtime hookup pending (v0.3).** |
| **023 UI refresh** | Atlas Premium design system: cobalt + amber palette, Inter typography, gradient hero on welcome/sign-in, premium cards everywhere, sidebar wordmark + active-rail, message-bubble redesign. |
| **026 upstream-sync** | `scripts/upstream-sync.sh` triage tool + spec. |

---

## What's left

### A. Tier 1 — blocks v1 launch

These are not implementable without your accounts/infra. I scaffold to
the boundary then stop.

| # | Item | Blocker |
|---|---|---|
| A1 | **002 production swap-ins** | WorkOS account, Cloudflare Workers, Neon Postgres, DNS, leaf-cert SPKI, RS256+JWKS rotation |
| A2 | **003 v0.2** | OpenAI + Google API keys; streaming-usage extraction code is mine to write |
| A3 | **Signed installers** | Apple Developer ($99/yr), Windows code-signing cert (DigiCert/Sectigo), GPG key |
| A4 | **Atlas brand logo** | Commissioned designer brief ($500-3000) |
| A5 | **001 leftovers** (keychain migration, sessions path, Windows/Linux verify) | Just time — recommended pickup #2 above |

### B. Within-spec enhancements

Code-only, no external blockers — I can do these.

| Spec | What's pending |
|---|---|
| **008 v0.4** | Tool-call counts surviving Delete-all (ledger doesn't snapshot tool counts yet) |
| **022 v0.3** | Runtime hookup — installing a skill adds its extension to goosed. **Recommended pickup #1.** |
| **022 v0.4** | ed25519 manifest signing + verification chain |
| **022 v0.5** | Per-org allow/deny lists (waits on 021 orgs) |
| **023 v2** | Settings tab chrome (still has some upstream patterns); deeper sidebar density work |

### C. Specced, no code

Specs are in their respective spec dirs with full scope + open questions
+ acceptance criteria. None of these have implementation yet.

| Spec | Why deferred |
|---|---|
| **021 (full) admin RBAC console** | Multi-week. Needs WorkOS Organizations decision, MFA flow, Stripe webhook → subscription_state, full console UI. |
| **024 skill pricing/billing** | Needs Stripe Connect account + Atlas tax stance |
| **025 skill marketplace** | Browse surface + publisher dashboard. Waits on 024 for pricing display. |

### D. Specs you might still want

Conversations during this session implied but never opened:

- **027 cloud sync** — back-end-side session sync so a user can pick up a
  conversation on a second device. Today everything is local.
- **028 team collaboration** — shared conversations within an org. Sits
  on 021 (orgs) + 027 (sync).
- **029 enterprise install** — MDM/SSCM/Intune installer profiles,
  managed config. Enterprise procurement requirement.

---

## Quick-start tomorrow

```bash
# Postgres (already installed via brew)
brew services start postgresql@16

# Backend services
cd ~/code/atlas/services/atlas-auth-api
DATABASE_URL="postgres://darshansundeep@127.0.0.1:5432/atlas_auth" \
  JWT_SIGNING_SECRET="test-secret-must-be-at-least-32-chars-long-aaa" \
  STUB_IDP=true PORT=8787 \
  ADMIN_TOKEN="atlas-admin-dev-token-Lq8dN3p2fA" \
  pnpm run start

cd ~/code/atlas/services/atlas-llm-proxy
DATABASE_URL="postgres://darshansundeep@127.0.0.1:5432/atlas_auth" \
  JWT_SIGNING_SECRET="test-secret-must-be-at-least-32-chars-long-aaa" \
  PORT=8788 pnpm run start

# Atlas desktop
launchctl setenv ATLAS_AUTH_BACKEND_URL http://127.0.0.1:8787
open ~/code/atlas/ui/desktop/out/Atlas-darwin-arm64/Atlas.app

# Admin
open "http://127.0.0.1:8787/admin?token=atlas-admin-dev-token-Lq8dN3p2fA"
```

### Build prereqs (verified)

- Node 22 (Node 24 has extract-zip hang). `/opt/homebrew/opt/node@22/bin`
- pnpm 10.30 (corepack-activated).
- Rust stable. `~/.rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo`
- Postgres 16 via brew.

### Repackage

```bash
cd ~/code/atlas/ui/desktop && export PATH=/opt/homebrew/opt/node@22/bin:$PATH
pkill -9 -f "Atlas.app/Contents/MacOS/Atlas"; sleep 1
rm -rf out/Atlas-darwin-arm64
pnpm run package
```

---

## Glossary

| Term | Meaning |
|---|---|
| **Constitution** | `.specify/memory/constitution.md` — the 6 NON-NEGOTIABLE principles. Read these once. |
| **Atlas Cloud** | Sign-in tier where prompts route through the LLM proxy. Opt-in. |
| **BYOK** | Bring-your-own-keys. Prompts never traverse Atlas infrastructure (Principle I). |
| **FEATURES flag** | Per-release toggle in `ui/desktop/src/branding/index.ts`. Lets us ship hidden code. |
| **Skill** | A bundled MCP extension + recipe + capability declaration (spec 022). |
| **Stub IdP** | Local-dev WorkOS replacement. Set `STUB_IDP=true` on the auth backend. |
