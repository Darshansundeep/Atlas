# Atlas Roadmap — single-page status

**Updated**: 2026-06-02 (end-of-day)
**Branch**: `001-rebrand-pass` (single working branch; all work lives here)
**Repo**: https://github.com/Darshansundeep/Atlas
**Constitution**: [.specify/memory/constitution.md](../.specify/memory/constitution.md)

This is the only file you need to read tomorrow morning. Everything below
points at a more detailed spec when it matters.

---

## Pick-up order for the next session

Three pushes, in order. Each is ~1-2 hours; any one alone is a
meaningful day's work.

### 1. Tools v0.2 — wire the web-search runtime — Spec 040

**Status**: admin can configure providers (Brave / Tavily / Serper /
Firecrawl / custom_http) with pgcrypto-encrypted keys and per-tier
quotas. Agent can't call them yet.

**Tomorrow's task**: ship `POST /v1/tools/web/search` +
`/web/scrape` on atlas-auth-api with Bearer auth, per-tier quota
preflight (Principle V), provider adapters, then a new
`atlas-web-tools` MCP extension on the desktop registering
`web_search` / `web_scrape` / `read_url`. Tasks listed in
[`specs/040-tool-providers/spec.md`](040-tool-providers/spec.md)
under v0.2.

Invocation policy (approved 2026-06-02): agent decides per-message
based on tool availability + the "Web Research" skill's `when_to_use`
guardrails — NOT auto-search-every-query.

### 2. Skills v0.6 — auto-record invocations

**Status**: install / uninstall / used endpoints work and the desktop
records on user action. Goosed itself doesn't know when a skill's
prompt/tools are actually used during a session.

**Tomorrow's task**: in goosed, when an installed skill's extension
runs a tool, POST `/v1/skills/:id/used` so the admin's Skills Usage
analytics reflect real engagement, not just manual signals.

### 3. Skills v0.7 — bridge to Goose's built-in `~/.agents/skills/`

**Status**: v0.4 invented a custom `extend_system_prompt` path; Goose
has a native Skills platform extension that auto-loads SKILL.md from
`~/.agents/skills/`. Duplication. Memory note:
[`project_atlas_skills_v07`](../../../.claude/.../project_atlas_skills_v07.md).

**Tomorrow's task**: on install, also write
`~/.agents/skills/<skill_id>/SKILL.md` (+ supporting_files) and delete
the parallel `/agent/extend_system_prompt` injection. Validate the
agent still picks up the SKILL.md prose. Darshan wants to field-test
current v0.4/v0.5 before this refactor.

### 4. Close spec 001 leftovers — keychain + sessions migration

**Status**: rebrand ~90% done after recent fixes (Apps default-off,
Downloads as default working dir, sign-in auto-close, chat layout cap).
Two known artifacts remain:
- macOS still prompts for the legacy `"goose"` keychain entries on first
  launch. Atlas namespace `ai.netgroup.atlas` is in place for new
  credentials but old reads aren't migrated.
- Sessions on disk still live at `~/.local/share/goose/sessions/`.

**Task**: migrate both. Details in
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
| **022 skill platform** | v0.1 catalogue + admin CRUD + desktop browse. v0.2 versioning + rollback. **v0.3 SKILL.md content model** (when_to_use/instructions_md/examples_md/supporting_files prose + admin three-textarea editor + 6 seeded skills with full agentskills.io-style prose). **v0.4 runtime hookup** (custom `POST /agent/extend_system_prompt` per installed skill on session start + resume). **v0.5 install/usage telemetry** (skill_installations + skill_usage_events + admin Skills Usage summary / per-skill installations / per-skill usage / per-user lists). |
| **023 UI refresh** | Atlas Premium design system: cobalt + amber palette, Inter typography, gradient hero on welcome/sign-in, premium cards everywhere, sidebar wordmark + active-rail, message-bubble redesign. **+ 2026-06-02 fixes**: 820 px max-width chat column (no more right-edge drift on wide screens), file-path chip uses `color: inherit` so it reads inside dark user bubbles, sign-in dialog auto-closes after successful paste-code auth. |
| **026 upstream-sync** | `scripts/upstream-sync.sh` triage tool + spec. |
| **040 tool providers (v0.1)** | Tools admin tab: provider templates (Brave / Tavily / Serper / Firecrawl / custom_http), pgcrypto-encrypted API keys at rest, masked read (last-4 hint), per-tier quota matrix (free/pro/team/enterprise — searches/scrapes/USD per day). Encryption fails-closed when passphrase env missing. Runtime adapters + MCP extension pending (v0.2). |

### Recent polish (2026-06-02)

- **Apps platform extension default-off** — agent no longer volunteers
  "apps folder" location since the Apps UI tab is hidden.
- **New chats default to ~/Downloads** — `defaultDirForNewChat()` cascade
  (`~/Downloads` → recent → `$HOME`) wired into all 7 main.ts callsites.
  Documents now save where Darshan expected.
- **Chat input + bubbles capped at 820 px, centred** on wide screens.
- **File-path chip** inherits parent text colour (legible inside dark
  user bubbles AND light assistant cards).
- **Sign-in modal** auto-closes after successful paste-code auth.

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
| **022 v0.6** | Goosed-side invocation tracking (auto-POST `/v1/skills/:id/used` when tools run) |
| **022 v0.7** | Bridge to Goose's built-in `~/.agents/skills/` Skills extension; remove the parallel custom-injection path. Deferred until field testing of v0.4/v0.5 |
| **022 v0.8** | ed25519 manifest signing + verification chain |
| **022 v0.9** | Per-org allow/deny lists (waits on 021 orgs) |
| **023 v2** | Settings tab chrome (still has some upstream patterns); deeper sidebar density work |
| **040 v0.2** | Web-tools runtime: `/v1/tools/web/search` + `/web/scrape` Bearer endpoints, per-tier quota preflight, provider adapters, atlas-web-tools MCP extension, Web Research skill manifest update. **Recommended pickup #1.** |
| **040 v0.3** | Per-user BYOK override on web tools (Pro+ users plug their own provider key, bypass Atlas quota) |
| **040 v0.4** | Tier-aware provider primary/fallback selection |

### C. Specced, no code

Specs are in their respective spec dirs with full scope + open questions
+ acceptance criteria. None of these have implementation yet.

| Spec | Why deferred |
|---|---|
| **021 (full) admin RBAC console** | Multi-week. Needs WorkOS Organizations decision, MFA flow, Stripe webhook → subscription_state, full console UI. Largely subsumed by 050. |
| **024 skill pricing/billing** | Needs Stripe Connect account + Atlas tax stance |
| **025 skill marketplace** | Browse surface + publisher dashboard. Waits on 024 for pricing display. |
| **050 teams & organization licensing** | NEW (2026-06-02). First-class Org entity owning seats, pooled budget, role-scoped admin, org-level provider keys, Stripe subscriptions. Unblocks Atlas Teams revenue motion. Spec only — no code. |

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
