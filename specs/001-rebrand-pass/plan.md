# Implementation Plan: Atlas Rebrand of Upstream Goose

**Branch**: `001-rebrand-pass` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-rebrand-pass/spec.md`

## Summary

Fork upstream `block/goose` at a fixed stable tag, then rewrite every user-visible identity surface — application display name, bundle identifier, configuration path namespace, environment variable prefix, custom URL scheme, HTTP user-agent string, icons, splash, brand colour palette, and in-app strings — to present the product as **Atlas** by NET Group. Apache 2.0 `LICENSE` and `NOTICE` files from upstream are preserved verbatim; the in-app About screen credits upstream Goose with a link. The rebrand applies uniformly to macOS, Windows, and Linux builds. Functionally Atlas is identical to upstream Goose at the forked tag; no behaviour, no provider, no extension changes. Delivery is via a single tagged CI run that produces signed installers for all three OSes.

## Technical Context

**Language/Version**: Rust (stable toolchain pinned by upstream Goose's `rust-toolchain.toml`) for the core agent engine; TypeScript / React for the desktop UI (Electron-based, inherited from upstream).

**Primary Dependencies**: Upstream `block/goose` (forked at a specific stable tag, to be selected in Phase 0 research); Electron for the desktop shell; Cargo workspace for Rust crates; whichever JS package manager upstream uses (`pnpm` or `npm`, confirmed in Phase 0).

**Storage**: Filesystem only — application config under the Atlas-namespaced platform-conventional path (`~/Library/Application Support/Atlas/` on macOS, `%APPDATA%\Atlas\` on Windows, `~/.config/atlas/` on Linux). No database introduced by this feature. OS-native secure stores (Keychain / Credential Manager / libsecret) are *referenced* in the constitution but not exercised by this spec (the rebrand does not change credential storage).

**Testing**: Inherited from upstream Goose — `cargo test` for Rust crates, the upstream JS/UI test runner (Vitest / Jest / Playwright, confirmed in Phase 0). One Atlas-added test suite ("identity-tests") verifies the rebrand surface — string scanners, bundle-identifier assertions, About-screen-render snapshots — runs on all three OSes in CI.

**Target Platform**: macOS 12 Monterey+ (Apple Silicon + Intel), Windows 10 1809+ (x64), Linux x86_64 with glibc ≥ 2.31 (Ubuntu 22.04+ baseline). One installer family per OS.

**Project Type**: Desktop application, cross-platform, Rust + Electron hybrid — forked from upstream Goose.

**Performance Goals**: No regression relative to upstream Goose at the forked tag. Specifically: cold app launch within 110% of upstream's launch time on the same hardware; installer artifact size within 110% of upstream's. The rebrand does not introduce new performance work.

**Constraints**: Rebrand changes MUST be confined to a small, identifiable surface (manifests, build configs, asset directories, identity-constant modules, locale strings). Deep edits scattered through unrelated source files are forbidden, because they will create irrecoverable merge conflicts against future upstream pulls. Any necessary in-source rename of a hot file is recorded in `research.md` with justification.

**Scale/Scope**: ~50–150 files touched for the rebrand pass (estimate, to be confirmed once the fork is cloned in Phase 0). Roughly: 1 Cargo workspace manifest, ~10 crate-level manifests, 1 root `package.json`, 2–3 Electron build configs, 1 icon set (~10 resolutions × 3 OSes), 1 splash asset, ~5 brand colour / token files, ~30 UI string references, 1 About-screen component, 3 OS-specific installer manifests, ~3 CI workflow files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluating against [Atlas Constitution v1.0.0](../../.specify/memory/constitution.md):

| # | Principle | Status | Justification |
|---|-----------|--------|---------------|
| I | User Data Sovereignty (NON-NEGOTIABLE) | ✅ PASS | Identity-only rebrand; no data flow changes. Existing upstream Goose data-handling behaviour is preserved exactly. |
| II | Inspectable Reasoning | ✅ PASS | No agent loop or tool-invocation changes. Upstream's existing inspectability surface is preserved. |
| III | License Hygiene (NON-NEGOTIABLE) | ✅ PASS | FR-008/009/010 mandate verbatim preservation of upstream `LICENSE` and `NOTICE` plus visible About-screen attribution. SC-004 verifies. No new dependencies introduced; license-denylist CI gate to be added as part of the dependency-graph audit task in Phase 2. |
| IV | Cross-Platform Parity | ✅ PASS | FR-011 mandates feature parity across macOS, Windows, Linux. SC-001/002/003 verify on all three OSes in the same CI run. No platform asymmetry is introduced. |
| V | Cost-Bounded by Default (NON-NEGOTIABLE) | ➖ N/A | The rebrand does not touch LLM-proxy code paths. Proxy quota enforcement is in spec `003-llm-proxy`. |
| VI | Specs Are Source of Truth | ✅ PASS | This `plan.md` is anchored to `spec.md`; `tasks.md` and `/speckit-analyze` will close the loop before `/speckit-implement` runs. |

**Gate result: PASS.** No violations. `Complexity Tracking` section is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-rebrand-pass/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 output — tag selection, upstream layout, dependency audit
├── data-model.md        # Phase 1 output — Product Identity, Attribution Surface, Build Artifact entities
├── quickstart.md        # Phase 1 output — onboarding for the rebrand work
├── contracts/           # Phase 1 output
│   ├── url-scheme.md           # `atlas://` deep-link contract
│   ├── installer-artifacts.md  # Per-OS artifact naming + metadata contract
│   └── identity-constants.md   # Canonical list of identity strings & their owners
├── checklists/
│   └── requirements.md  # Already created by /speckit-specify
└── tasks.md             # Phase 2 output (created by /speckit-tasks; NOT created here)
```

### Source Code (repository root)

The Atlas repository is a fork of `block/goose`. Upstream layout is inherited; the rebrand introduces a small, contained set of overlays.

```text
atlas/                                 # root of the fork
├── .specify/                          # spec-kit scaffolding (this project's source of truth)
├── .claude/                           # Claude Code skills + project config
├── memory/                            # currently unused at root (spec-kit constitution lives under .specify/memory)
├── specs/                             # feature specs (this feature is 001-rebrand-pass)
├── crates/                            # Rust workspace (inherited from upstream Goose)
│   ├── goose/                         # core agent engine — INTERNAL NAME UNCHANGED (per spec Assumption)
│   ├── goose-cli/                     # CLI front-end — binary name overridden to `atlas` at build time
│   └── ... (other upstream crates)
├── ui/                                # Desktop UI (Electron + React, inherited)
│   ├── package.json                   # productName, name, build identity → Atlas
│   ├── electron-builder.yml           # bundle IDs, signing, installer metadata → Atlas / NET Group
│   ├── src/
│   │   ├── branding/                  # NEW: Atlas-specific identity constants (display name, URLs, copy)
│   │   ├── components/About/          # OVERRIDDEN: About screen renders Atlas + Goose attribution
│   │   └── ... (other upstream UI code, mostly untouched)
│   └── assets/                        # OVERRIDDEN: icons, splash, brand palette
├── installers/                        # NEW or inherited per-OS installer config
│   ├── macos/                         # .dmg metadata, entitlements, notarization config
│   ├── windows/                       # .msi / NSIS scripts, EV-cert signing config
│   └── linux/                         # .deb / .rpm / AppImage scripts
├── .github/workflows/                 # OVERRIDDEN: release workflow tags artifacts as Atlas
├── LICENSE                            # preserved verbatim from upstream Goose (Apache 2.0)
├── NOTICE                             # preserved verbatim from upstream Goose
├── CLAUDE.md                          # agent-context pointer (managed by spec-kit)
├── ATLAS_BUILD_PLAN.md                # human-facing program plan (this directory)
└── Cargo.toml                         # workspace manifest — binary name override for `atlas`
```

**Structure Decision**: We adopt the *Inherited fork with surgical overlays* pattern. Concretely: every rebrand change lives in one of these zones — (a) build manifests at the workspace / package level (`Cargo.toml`, `package.json`, `electron-builder.yml`), (b) a single new `ui/src/branding/` module that exports all identity constants (display name, URL scheme, env-var prefix, user-agent template), (c) the About-screen component (the only deliberately-rewritten UI component), (d) assets under `ui/assets/` (icons, splash, palette), (e) installer configs under `installers/<os>/`, and (f) the release CI workflow. **Upstream Goose source files outside these zones are NOT modified**; UI components that need to display the product name pull it from the branding module rather than embedding a string literal. This bounds the merge surface against future upstream pulls (per Constraint above).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified.**

No violations. This table is intentionally empty.
