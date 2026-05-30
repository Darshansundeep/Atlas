# Atlas Architecture

**Audience**: engineers, security reviewers, and partners evaluating Atlas's relationship to upstream Goose.
**Task**: T054.
**Companion docs**: [`ATLAS_BUILD_PLAN.md`](../ATLAS_BUILD_PLAN.md), [`specs/001-rebrand-pass/plan.md`](../specs/001-rebrand-pass/plan.md), [`.specify/memory/constitution.md`](../.specify/memory/constitution.md).

## TL;DR

Atlas is a forked, rebranded, governed distribution of [Goose](https://github.com/block/goose). The architecture follows an **"inherited fork with surgical overlays"** pattern: upstream source is checked in at a pinned tag; Atlas changes are contained in a small, well-named set of zones that minimise merge surface against future upstream pulls.

## The overlay pattern

```
upstream block/goose @ v1.36.0   (the inherited base — modified as little as possible)
        │
        ▼
Atlas overlays:
  ┌──────────────────────────────────────────────────────────────┐
  │ ui/desktop/src/branding/    ← UI identity SoT (TypeScript)   │
  │ crates/atlas-branding/      ← Rust identity SoT              │
  │ deny.atlas.toml             ← Atlas license denylist         │
  │ .github/workflows/atlas-ci.yml ← Atlas CI gates              │
  │ tools/scripts/*             ← lint / verification scripts    │
  │ tests/integration/*         ← Atlas-owned integration tests  │
  │ specs/                      ← spec-kit feature folders       │
  │ .specify/                   ← spec-kit scaffolding           │
  │ admin-console/              ← future skill-platform admin UI │
  │ UPSTREAM_VERSION            ← pinned upstream commit + SHA   │
  │ NOTICE-ATLAS                ← Atlas-owned attribution file   │
  │ LAYOUT_NOTES.md             ← ground truth vs plan           │
  └──────────────────────────────────────────────────────────────┘
```

**Surgical edits to upstream files are permitted only when**:

1. The edit references a value from a branding module (no literal product names embedded in upstream UI/CLI code).
2. The edit is small enough that the merge driver can usually auto-resolve.
3. The edit is captured in a spec's task with a `[US#]` label.

Examples of surgical edits already shipped:

- `ui/desktop/src/main.ts` — About panel + Help menu now read from `IDENTITY` (T020).
- `ui/desktop/package.json` — productName / name / description (T016).
- `ui/desktop/forge.config.ts` — bundle id, URL scheme, usage strings (T017).

Examples of work the lint will surface and that **must** stay overlay-only:

- The full UI string sweep (T024) — every literal `Goose` in `ui/desktop/src/` becomes `IDENTITY.displayName` or `IDENTITY.upstreamProjectName` depending on whether it's identity or attribution.
- The CLI string sweep (T024a) — analogous for `crates/goose-cli/`.

The `forbid-literal-product-names` CI lint enforces these rules; PR review confirms.

## Layered runtime

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interfaces                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Atlas CLI  │  │ Atlas Desktop│ │  Future: Atlas Web,     │  │
│  │ (was goose) │  │  (Electron) │  │  Atlas Mobile           │  │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │
└─────────┼────────────────┼──────────────────────┼───────────────┘
          │                │                      │
          ▼                ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│           goosed (REST API — upstream, unmodified)              │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Core (goose crate)                         │
│  Providers (LLMs) · Extensions (MCP) · Recipes · Config         │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│           crates/atlas-branding (NEW — Rust identity SoT)       │
│  consumed by goose-cli, goose-server, future Atlas crates       │
└─────────────────────────────────────────────────────────────────┘
```

## Identity-constants lockstep

The single architectural invariant that holds the rebrand together:

| Surface | Source of truth | Enforced by |
|---|---|---|
| TypeScript / UI | `ui/desktop/src/branding/index.ts` | `tools/scripts/check-identity-in-sync.sh` (CI) |
| Rust core / CLI | `crates/atlas-branding/src/lib.rs` | `crates/atlas-branding/tests/identity_constants.rs` (cargo test) |
| Build manifests | `ui/desktop/package.json`, `forge.config.ts` | CI consistency check |
| Documentation | `ATLAS_BUILD_PLAN.md`, this file | PR review |

A change to any identity field MUST be made in **both** branding modules in **the same commit**. CI fails otherwise.

## Future overlays (deferred specs)

`ATLAS_BUILD_PLAN.md` reserves the following slots; their architectural shape is captured here so future engineers don't repaint the same picture:

- **`002-cloud-auth`** — `atlas://auth` deep link + OS-keychain token storage. Adds a thin `crates/atlas-auth-client` and a `ui/desktop/src/auth/` module. The cloud auth web app lives outside this repo (`auth.atlas.netgroup.ai`).
- **`003-llm-proxy`** — REST proxy at `api.atlas.netgroup.ai`. Atlas Desktop talks to it via a new "Atlas Cloud" provider in `crates/goose/src/providers/declarative/atlas_cloud.toml`. Cost-bound enforcement (Constitution Principle V) lives entirely on the proxy.
- **`010-upstream-sync`** — curated cherry-pick workflow. A `scripts/upstream-sync.sh` script + a labelled GitHub issue template that records what's been brought across and what's been deliberately skipped.
- **`020-skill-registry` / `021-admin-console` / `022-skill-governance` / `023-skill-authoring` / `024-skill-pricing`** — the skill-platform tier. Each is its own service in its own repo. `admin-console/` here is the desktop-side placeholder for branding override; the real admin UI is a separate web app.

## Constitution alignment

Each architectural choice traces back to a non-negotiable principle:

| Choice | Principle |
|---|---|
| BYOK / local modes never transit Atlas infra | I (User Data Sovereignty) |
| Per-tool, per-call inspection panel | II (Inspectable Reasoning) |
| Permissive-license allowlist in `deny.atlas.toml` | III (License Hygiene) |
| 3-OS CI matrix for every feature | IV (Cross-Platform Parity) |
| Hard token-quota gate in the proxy | V (Cost-Bounded by Default) |
| spec-kit chain enforced in CI | VI (Specs Are Source of Truth) |

## What "Atlas" actually is, viewed from this layer

When a user opens the desktop app today:

- `productName: "Atlas"` (package.json) → window title, dock entry, taskbar.
- `appBundleId: "ai.netgroup.atlas"` (forge.config.ts) → OS-level identity.
- `IDENTITY.displayName` (branding module) → in-app strings (after T024 sweep).
- `app.setAboutPanelOptions({ applicationName: IDENTITY.displayName, ... credits: "Built on Goose..." })` (main.ts) → About surface.
- `atlas://auth?code=...` (forge.config.ts) → deep-link scheme.

Once T024/T024a complete the sweep, there will be exactly two kinds of "Goose" strings in shipped code: (a) the literal upstream project name in attribution surfaces, (b) inside upstream-owned files our merge driver hasn't touched. The lint covers (a); the constitution review covers (b).
