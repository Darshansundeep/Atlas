# Upstream Layout Notes — Goose v1.36.0

**Produced by**: T003 of `001-rebrand-pass`.
**Purpose**: Ground the assumed layout in `specs/001-rebrand-pass/plan.md` against the actual upstream layout at the pinned tag. Anyone making rebrand changes should read this first.

## Confirmed upstream layout (relative to repo root)

```
atlas/                                 (this repo, forked from block/goose v1.36.0)
├── Cargo.toml                         (workspace manifest; members = ["crates/*", "vendor/v8"])
├── Cargo.lock
├── Justfile                           (top-level task runner; goose uses `just` for builds)
├── LICENSE                            (Apache 2.0; sha256 pinned in UPSTREAM_VERSION)
├── CUSTOM_DISTROS.md                  (UPSTREAM-AUTHORED rebrand guide — read this)
├── BUILDING_LINUX.md
├── BUILDING_DOCKER.md
├── crates/
│   ├── goose/                         (core engine)
│   ├── goose-acp-macros/
│   ├── goose-cli/                     (CLI; produces `goose` binary)
│   ├── goose-mcp/
│   ├── goose-sdk/
│   ├── goose-server/                  (goosed — REST API used by CLI / desktop / 3rd-party UIs)
│   ├── goose-test/
│   └── goose-test-support/
├── ui/
│   ├── desktop/                       (Electron desktop app — primary rebrand target)
│   │   ├── package.json               (productName: "Goose", name: "goose-app")
│   │   ├── src/                       (React + TypeScript)
│   │   ├── scripts/
│   │   └── ...
│   ├── goose-binary/                  (binary distribution helper for the desktop app)
│   ├── install-link-generator/
│   ├── sdk/                           (TS SDK for goosed)
│   ├── text/                          (i18n strings? to confirm)
│   ├── package.json                   (pnpm workspace root)
│   ├── pnpm-workspace.yaml
│   └── pnpm-lock.yaml
├── bin/
├── documentation/
├── evals/
├── examples/
├── oidc-proxy/                        (separate service; out of v1 rebrand scope)
├── recipe-scanner/
├── services/
├── vendor/                            (vendored deps; v8 currently)
└── workflow_recipes/
```

## Deviations from `plan.md`'s assumed layout

| Plan assumption | Reality | Impact |
|---|---|---|
| UI at `ui/` | UI at `ui/desktop/` (one of several packages under `ui/`) | All UI tasks (T006, T016, T020, T024, T025, …) reference `ui/src/…`; rewrite to `ui/desktop/src/…`. |
| `NOTICE` file at root | No NOTICE file in upstream | Spec FR-009 / SC-004 / T045 referencing NOTICE preservation are **moot**. Apache 2.0 §4(d) only engages if upstream ships a NOTICE; it doesn't. Spec amendment needed. |
| Single root `package.json` | `pnpm` workspace with `ui/package.json` as workspace root and `ui/desktop/package.json` as the desktop app | T016 targets `ui/desktop/package.json`. |
| New crate `crates/atlas-branding` | Plan still applies; just one more crate in the workspace | T008/T009 unchanged. |
| `installers/<os>/` | Upstream uses `ui/desktop/`'s Electron Forge config + Justfile recipes for bundling | Installer config tasks (T036–T038) operate on Electron Forge `forge.config.ts` + Justfile, not a fresh `installers/` tree. |
| `.github/workflows/release.yml` | Upstream has `.github/workflows/` but its release pipeline is its own; we overlay | Confirm against `.github/workflows/` in this checkout before authoring T039. |

## Existing rebrand-friendly hooks (gifts from upstream)

Upstream is unusually rebrand-friendly — `CUSTOM_DISTROS.md` is explicitly written for what we're doing. Specific affordances we should exploit:

- **`GOOSE_BUNDLE_NAME` env var** is already plumbed through `ui/desktop/package.json`'s bundle scripts (`bundle:default`, `bundle:intel`). Setting it to `Atlas` at build time renames the produced `.app` bundle. This drastically simplifies T017 / the macOS-side of T036.
- **Declarative provider config** under `crates/goose/src/providers/declarative/` means we can ship Atlas-default provider settings via config files, not source edits.
- **Bundled MCP extensions** are declared in `ui/desktop/src/built-in-extensions.json` and `ui/desktop/src/components/settings/extensions/bundled-extensions.json` — clean override points for Atlas's eventual "skill" curation (deferred to specs `020–024`).
- **System prompts** under `crates/goose/src/prompts/` are isolated files — easy to fork without scattering edits.

## Toolchain confirmed

- **Package manager (JS)**: `pnpm` (v10.30+ per engines block). Workspace root at `ui/`.
- **Node**: ^24.10.0 (per `engines.node`).
- **Rust toolchain**: 1.91.1 (per workspace `rust-version`).
- **JS/UI test runner**: Playwright (e2e). Unit tests likely elsewhere — confirm before T013/T014.
- **Task runner**: `just` (Justfile at root); many build steps invoke just recipes.
- **Linter**: ESLint (per `lint` script in `ui/desktop/package.json`).
- **Electron framework**: Electron Forge (per `start-gui` invoking `electron-forge start`).

## One organisational anomaly to flag

The workspace `Cargo.toml` declares `repository = "https://github.com/aaif-goose/goose"`. We cloned from `github.com/block/goose`, which resolved successfully. Possible explanations: project moved orgs (Block → AAIF), or the Cargo.toml repository field is stale. **Action**: confirm with upstream before publishing Atlas's first release (the upstream URL appears in attribution surfaces).

## Implications for the rebrand task plan

These pass back into `tasks.md` as minor edits — not new findings for `/speckit-analyze` to surface, just path corrections discovered now that the actual upstream is in hand:

1. Every `ui/src/...` reference in tasks → `ui/desktop/src/...`.
2. T045 (NOTICE checksum verification) → revise to "verify LICENSE checksum only; assert upstream still has no NOTICE; if NOTICE appears in a future upstream pull, escalate to a spec amendment".
3. T009 still adds `crates/atlas-branding` to the workspace — unchanged.
4. Installer-config tasks (T036–T038) operate on `ui/desktop/forge.config.ts` + the Justfile, not a fresh `installers/` tree. Plan structure section needs a small update to reflect this.
5. Branding hook in `package.json`'s `bundle:default` (`GOOSE_BUNDLE_NAME` env) gives T017 a cheap path on macOS — flag for the engineer doing T017.

These path corrections will be applied to `tasks.md` as part of the foundation pass and reflected back into `plan.md` in a Polish-phase doc update.
