# Atlas — Build Plan

**Product:** Atlas — an AI agentic desktop app
**Org:** NET Group (`netgroup.ai`)
**Upstream (product base):** [block/goose](https://github.com/block/goose) (Apache 2.0)
**Dev methodology:** [github/spec-kit](https://github.com/github/spec-kit) — Spec-Driven Development
**Targets:** macOS, Windows, Linux (day one)
**Owner:** Darshan
**Plan date:** 2026-05-28

---

## 1. Product shape (decisions locked in)

| Area | Decision |
|---|---|
| Base | Fork of `block/goose`, kept in sync with upstream via tracked remote |
| Auth | Browser-based OAuth/OIDC; device-code → refresh token in OS keychain |
| LLM access | **Hybrid**: cloud proxy (Atlas-managed keys, metered) + BYOK + local (Ollama) |
| Distribution | Signed installers + auto-update on all 3 OSes |
| Pricing model (TBD) | Likely tiered subscription: Free (BYOK + local only) / Pro (proxy + quota) / Team (SSO + admin) |

---

## 1b. Development methodology — Spec-Driven via spec-kit

We use **[GitHub's spec-kit](https://github.com/github/spec-kit)** as the development workflow for Atlas. Every feature (auth flow, proxy service, billing, MCP extensions, etc.) is built through the same loop:

```
/speckit-constitution → /speckit-specify → /speckit-clarify → /speckit-plan → /speckit-tasks → /speckit-analyze → /speckit-implement
```

**Why this matters for Atlas specifically:**

- Multi-disciplinary team (Rust + frontend + backend + DevOps) — written specs prevent drift between what each role is building
- AI-agent-assisted coding throughout — spec-kit's templates are tuned to keep Claude Code / Copilot agents on-spec
- Audit trail for compliance (SOC 2 in Phase 7) — every shipped behaviour traces back to a spec doc in `specs/`
- Onboarding new hires — they read specs, not tribal knowledge

**Repo layout once `specify init` runs:**

```
atlas/                              # the Goose fork
├── .specify/                       # spec-kit scaffolding (templates, scripts)
├── memory/
│   └── constitution.md             # non-negotiable project principles (see Phase 0)
├── specs/
│   ├── 001-rebrand-pass/           # one folder per feature/initiative
│   │   ├── spec.md                 # /specify output — what & why, no how
│   │   ├── plan.md                 # /plan output — technical approach
│   │   ├── tasks.md                # /tasks output — ordered work units
│   │   └── research.md             # /clarify output — open questions resolved
│   ├── 002-cloud-auth/
│   ├── 003-llm-proxy/
│   └── ...
├── crates/                         # Atlas-specific Rust crates (auth client, proxy SDK)
├── ui/                             # desktop frontend
└── ... (rest of forked Goose tree)
```

**Mapping spec-kit commands to this plan's phases:**

| Spec-kit step | When it runs | Output |
|---|---|---|
| `/speckit-constitution` | Phase 0, once | `memory/constitution.md` — Atlas's non-negotiables |
| `/speckit-specify` | Start of every phase below | `specs/NNN-<name>/spec.md` |
| `/speckit-clarify` | After `/speckit-specify`, before `/speckit-plan` | Resolves ambiguities by Q&A with stakeholder |
| `/speckit-plan` | After spec is locked | Technical design, stack choices, file layout |
| `/speckit-tasks` | After plan is approved | Granular task list, dependency-ordered |
| `/speckit-analyze` | Before implementation | Cross-checks spec ↔ plan ↔ tasks for gaps |
| `/speckit-implement` | Build phase | AI-agent executes tasks, humans review |

**Atlas Constitution (draft — finalize in Phase 0):**

Principles every spec and PR is held against. Suggested starting set:

1. **User data never leaves the user's machine in BYOK or local mode.** Period.
2. **The agent's reasoning is transparent and inspectable** — no hidden tool calls, all actions logged.
3. **Every external dependency must be Apache-2.0, MIT, BSD, or MPL compatible.** No GPL/AGPL.
4. **Cross-platform parity** — no feature ships on macOS that isn't on Windows + Linux within the same release.
5. **Cost-bounded by default** — proxy mode has hard per-user spend caps that cannot be bypassed without explicit upgrade.
6. **Specs are source of truth** — code may not implement behaviour not described in a spec; specs may not describe behaviour not implemented (the `/speckit-analyze` gate enforces this).

---

## 2. Team & roles needed

Minimum viable team to hit public beta in ~3 months:

- **1× Rust engineer** — Goose core customization, provider integration, extensions
- **1× Desktop/frontend engineer** — Electron (or Tauri migration), UI work, OS integration
- **1× Backend engineer** — cloud auth service, LLM proxy, billing hooks
- **1× DevOps/Release engineer** — CI, signing, notarization, update infra (can be shared 0.5 FTE)
- **1× Product designer** — brand assets, icon set, in-app UX (can be contract)

Total: ~4 FTE for ~12 weeks to public beta.

---

## 3. Cross-cutting prerequisites (Week 0)

Get these started immediately — they have long lead times:

- [ ] **Apple Developer Program** enrollment under NET Group (~24-48h for org verification, then up to 2 weeks for DUNS if not already registered)
- [ ] **Windows EV Code-Signing Certificate** — DigiCert / Sectigo, ~$300/yr, requires hardware token, 3-5 business days
- [ ] **Domain & branding** — `atlas.netgroup.ai`, `getatlas.ai`, or similar; register early
- [ ] **Cloud accounts**: AWS / Cloudflare / Fly.io for the backend; pick one provider and standardize
- [ ] **LLM provider commercial accounts** — Anthropic, OpenAI, Google with org billing for proxy mode; verify TOS allows reselling/proxying for end users
- [ ] **Legal review** — confirm Apache 2.0 attribution requirements satisfied; draft Atlas Terms of Service, Privacy Policy, DPA template for enterprise
- [ ] **Install spec-kit** on every engineer's machine: `uv tool install specify-cli --from git+https://github.com/github/spec-kit.git`
- [ ] **Run `specify init`** inside the Atlas repo with `--ai claude` so Claude Code slash commands are wired up
- [ ] **Draft and ratify `memory/constitution.md`** via `/speckit-constitution` using the principles in §1b as the starting point
- [ ] **Author spec `000-foundations`** that describes the rebrand + dev workflow itself, so the methodology is dogfooded from commit #1

**Risk:** Apple/Windows cert delays can block release by weeks. Start day one even before code.

---

## 4. Phased delivery

### Phase 1 — Fork & Rebrand (Weeks 1–3)

**Goal:** A locally-running Atlas-branded build on all three OSes, indistinguishable functionally from upstream Goose.

**Spec-kit flow:** spec `001-rebrand-pass` — `/speckit-specify` ("Atlas is Goose with NET Group branding and ai.netgroup.atlas bundle identity, on all 3 OSes") → `/speckit-clarify` (asset sources, naming edge cases) → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.

Deliverables:
- Fork created in NET Group GitHub org with `upstream` remote tracked
- Mechanical rename pass:
  - Binaries: `goose` → `atlas` (Cargo workspace, install scripts)
  - Bundle ID: `com.block.goose` → `ai.netgroup.atlas`
  - Config paths: `~/.config/goose/` → `~/.config/atlas/` (and platform equivalents)
  - Env vars: `GOOSE_*` → `ATLAS_*`
  - URL scheme: `goose://` → `atlas://`
  - User-agent and HTTP headers sent to providers
  - All user-facing strings, error messages, doc references
- Asset replacement: app icon set, tray icon, splash, onboarding illustrations, color palette
- `LICENSE` + `NOTICE` preserved; About screen credits Goose upstream
- Internal dev builds for macOS / Windows / Linux produced from CI

Acceptance: New engineer can `git clone` → `make dev` → see "Atlas" running on their laptop with all upstream Goose features.

---

### Phase 2 — Cloud Auth Service (Weeks 2–5, parallel with Phase 1)

**Goal:** Users sign in via browser, desktop gets a refresh token in the OS keychain, all subsequent calls are authenticated.

**Spec-kit flow:** spec `002-cloud-auth` — `/speckit-specify` ("Browser-based sign-in for desktop; refresh tokens in OS keychain; works offline after first sign-in") → `/speckit-clarify` (which IdP, social providers, session lifetime) → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`. Run `/speckit-analyze` before merge to catch any spec/code drift.

Deliverables:
- Web app at `auth.atlas.netgroup.ai`:
  - Email/password + Google + GitHub social login (use Clerk / WorkOS / Auth0 / Supabase Auth — don't build from scratch)
  - Device-code flow endpoint
  - Email verification, password reset
- Desktop integration:
  - "Sign in" button opens system browser
  - Loopback HTTP listener OR `atlas://auth?code=…` deep link to receive callback
  - Token exchange + storage in macOS Keychain / Windows Credential Manager / libsecret
  - Silent refresh on app launch
- Backend:
  - User table, sessions, refresh tokens (rotating)
  - JWT issued to desktop with short TTL (15min) + refresh token (30d, rotating)

Acceptance: Fresh-install user can sign up, sign in, close & reopen app, remain signed in.

---

### Phase 3 — LLM Proxy & Provider Wiring (Weeks 4–7)

**Goal:** Atlas users can run the agent against Atlas-managed models (metered), their own keys (BYOK), or local Ollama, with a clean settings UI for switching.

**Spec-kit flow:** specs `003-llm-proxy` (server) and `004-provider-switcher` (client) authored in parallel. Each goes through full `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement`. The proxy spec must explicitly call out: rate-limit semantics, quota reset behaviour, failover policy, what's logged vs not.

Deliverables:
- **Proxy service** at `api.atlas.netgroup.ai`:
  - `/v1/messages` (Anthropic-compatible), `/v1/chat/completions` (OpenAI-compatible) endpoints
  - Streams responses back to desktop
  - Auth check via JWT from Phase 2
  - Per-user rate limits + monthly token quota
  - Usage logged to a metering store (Postgres + ClickHouse for analytics, or just Postgres at v1)
  - Provider failover (if Anthropic 5xx, retry Claude on Bedrock or fall back to OpenAI per config)
- **Desktop provider layer** in Atlas:
  - "Atlas Cloud" provider that talks to your proxy (default for signed-in users)
  - BYOK provider screens for Anthropic / OpenAI / Google / Groq / OpenRouter — keys stored locally in keychain, never sent to Atlas backend
  - Local provider: Ollama auto-detect at `localhost:11434`, model picker
- Settings UI: clear "Where does my data go?" indicator per provider mode

Acceptance: A signed-in user can switch between Atlas Cloud / BYOK Anthropic / local Llama-3 in <3 clicks and run a task in each mode.

---

### Phase 4 — Product Polish (Weeks 6–9)

**Goal:** Atlas feels like a product, not a fork. Things that distinguish it from "Goose with a new icon."

**Spec-kit flow:** smaller, parallel specs — `005-onboarding`, `006-auto-update`, `007-telemetry`, `008-extensions-bundle`. Each one is small enough to land in ~1 week.

Deliverables:
- First-run onboarding: 3-screen flow (welcome → sign in → pick a model → first task)
- In-app updater wired to your update feed (Sparkle on Mac, Squirrel on Win, AppImageUpdate on Linux)
- Crash reporting (Sentry) with user-opt-in
- Anonymous usage telemetry (PostHog or your own) — feature flag the whole thing
- Settings: model preferences, default extensions/MCP servers, telemetry toggle, sign-out
- Help menu → docs site, support email, "Report a bug" form
- At least 2 Atlas-original MCP extensions that show off the product (e.g., NET Group internal-tools integration if relevant, or a polished web-research extension)

Acceptance: Internal demo to non-engineers without explanation — they can complete a task end-to-end.

---

### Phase 5 — Release Engineering (Weeks 8–10, overlap with Phase 4)

**Goal:** A single git tag produces signed, notarized, auto-updating installers for all three OSes, published to your CDN.

**Spec-kit flow:** spec `009-release-pipeline` — the spec doubles as the runbook future on-call engineers consult.

Deliverables:
- GitHub Actions release workflow (or equivalent):
  - macOS: build → `codesign` → `notarytool submit` → staple → `.dmg`
  - Windows: build → `signtool` with EV cert → MSI + NSIS exe
  - Linux: `.deb`, `.rpm`, AppImage
- Update feeds hosted on Cloudflare R2 or AWS S3 + CloudFront:
  - Sparkle appcast (Mac)
  - Squirrel JSON feed (Windows)
  - AppImageUpdate metadata (Linux)
- Versioning: SemVer, release channels (`stable`, `beta`)
- Download page on marketing site, OS-detection, fallback links
- Rollback plan: ability to pin a bad release out of the update feed

Acceptance: You can ship a patch by tagging `v0.2.1` and have it on user desktops within an hour via auto-update, with a working rollback if it breaks.

---

### Phase 6 — Private Beta (Weeks 10–12)

**Goal:** 50–200 real users on Atlas, daily-active, generating feedback and surfacing issues you couldn't catch internally.

Deliverables:
- Invite-only signup gate (waitlist on marketing site)
- Feedback loop: in-app "Send feedback" → routed to a Linear/Notion/Slack inbox
- Weekly release cadence
- Status page (`status.atlas.netgroup.ai`) — even a simple StatusPage.io
- Support inbox (`support@atlas.netgroup.ai`) with on-call rotation
- Cost monitoring: per-user LLM spend dashboard, alert if any user >$X/day

Acceptance: 30-day retention >40% on beta cohort; <5 P0 bugs open at any time.

---

### Deferred — Post-launch capabilities (Phase 8+)

Two product capability areas are scoped, but deliberately deferred until after public launch:

- **Upstream sync** (`010-upstream-sync`) — Atlas picks up new Goose releases via **curated cherry-pick per release** (Atlas team chooses which upstream commits to bring in; preserves product control over what ships). The "Inherited fork with surgical overlays" architecture in `001-rebrand-pass`'s plan was designed to keep this cheap.
- **Skill-platform layer** (`020`–`024`) — Skills (= Goose MCP extensions, rebranded "Skills" in Atlas UI) become a managed, governable, priced platform capability:
  - `020-skill-registry` — backend catalogue
  - `021-admin-console` — web UI for org admins
  - `022-skill-governance` — per-org enable/block/version-pin policy
  - `023-skill-authoring` — admins write/upload custom org-private skills
  - `024-skill-pricing` — billing tiers driven by skill enablement/usage, layered on `003-llm-proxy` metering

The skill-platform layer is a B2B / enterprise differentiator, dependent on `002-cloud-auth` and `003-llm-proxy`. It is the intended monetisation surface: NET Group prices Atlas by which skills an organisation can access and govern, not just by raw LLM token credits.

### Phase 7 — Public Launch (Week 12+)

**Goal:** Atlas is generally available with pricing, billing, and support.

Deliverables:
- Stripe integration: subscription plans, upgrade/downgrade flow, invoices
- Pricing page on marketing site
- Org/team accounts: invite teammates, shared billing, admin dashboard (lightweight v1)
- SSO (SAML/OIDC) — defer to post-launch unless a design partner needs it
- Docs site: getting started, model guide, extensions, troubleshooting, API reference for MCP authors
- Launch comms: Product Hunt, Hacker News post, LinkedIn from NET Group
- SOC 2 prep kicked off (long lead, but enterprise customers will ask)

Acceptance: A stranger can land on the marketing site, sign up, pay, and use Atlas without a human touchpoint.

---

## 5. Architecture overview

```
┌─────────────────────────────────────────────────────────┐
│                  Atlas Desktop (Tauri/Electron)         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Goose core   │  │ Auth client  │  │ Provider     │   │
│  │ (Rust, fork) │  │ + Keychain   │  │ switcher     │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
└─────────┼─────────────────┼─────────────────┼───────────┘
          │                 │                 │
          │                 │       ┌─────────┴──────────┐
          │                 │       │  Local: Ollama     │
          │                 │       │  BYOK: direct →    │
          │                 │       │   provider APIs    │
          │                 │       └────────────────────┘
          │                 │
          │                 ▼
          │       ┌───────────────────────┐
          │       │  auth.atlas.netgroup  │
          │       │  (Clerk/Auth0/WorkOS) │
          │       └───────────┬───────────┘
          │                   │
          ▼                   ▼
  ┌───────────────────────────────────────┐
  │  api.atlas.netgroup.ai  (LLM proxy)   │
  │  - JWT verify                         │
  │  - Rate limit + quota                 │
  │  - Stream forward to providers        │
  │  - Usage metering → Postgres          │
  └─────┬─────────────┬─────────────┬─────┘
        ▼             ▼             ▼
    Anthropic      OpenAI       Google / etc.
```

---

## 6. Key risks & how to de-risk early

| Risk | Mitigation |
|---|---|
| **Code-signing cert delays block Mac/Windows release** | Apply Week 0. Have a Linux-only internal alpha ready in case |
| **Upstream Goose churn creates painful merges** | Keep rebrand changes in a small surface area (branding module + asset overrides). Pull from upstream weekly, not at the end |
| **LLM provider TOS may restrict proxying for resale** | Read each provider's commercial/redistribution clause before Phase 3. Anthropic and OpenAI both allow this with their business plans, but confirm in writing |
| **Per-user LLM cost runs away in beta** | Hard quota in the proxy from day one, even before billing exists. Alert on per-user >$5/day |
| **Tauri vs Electron migration cost** | Stay on whatever Goose ships with for v1. Revisit only if bundle size or performance becomes a blocker |
| **Apple notarization rejection** | Run `notarytool` in CI from week 1 on internal builds. Catch entitlement issues before release |

---

## 7. What to decide in the next 2 weeks (before Phase 1 starts)

1. **Auth provider**: Clerk vs Auth0 vs WorkOS vs Supabase Auth — affects Phase 2 design
2. **Cloud provider**: AWS vs Cloudflare vs Fly.io vs GCP — affects Phase 3 infra design
3. **Desktop framework**: stay on Goose's current (Electron) or migrate to Tauri in Phase 1? (Recommend: stay)
4. **GitHub org**: private fork in `netgroup-ai/atlas` or public from day one?
5. **Brand identity**: hire a designer / use existing NET Group brand system / contract through 99designs?
6. **Pricing**: even a rough number for Atlas Pro shapes the quota system in Phase 3

---

## 8. Suggested Week-1 kickoff checklist

- [ ] Spin up `netgroup-ai/atlas` private repo, fork `block/goose` into it
- [ ] Inside that repo: `uv tool install specify-cli --from git+https://github.com/github/spec-kit.git` then `specify init . --ai claude`
- [ ] Author `memory/constitution.md` via `/speckit-constitution` using §1b principles
- [ ] Write spec `000-foundations` describing the rebrand + methodology itself
- [ ] Open Apple Developer + Windows EV cert applications
- [ ] Register domains: `getatlas.ai`, point `atlas.netgroup.ai` to a coming-soon page
- [ ] Pick auth provider, create the org account
- [ ] Pick cloud provider, create the org account, set up billing alerts
- [ ] Schedule a 90-min architecture review with the team to ratify the decisions in §7
- [ ] Hire / assign the 4 roles in §2
- [ ] Onboard team to spec-kit: each engineer runs through the [quickstart](https://github.com/github/spec-kit/blob/main/spec-driven.md) and ships one trivial spec end-to-end before touching Atlas code

---

*End of plan.*
