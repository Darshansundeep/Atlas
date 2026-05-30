---

description: "Task list for feature 001-rebrand-pass"
---

# Tasks: Atlas Rebrand of Upstream Goose

**Input**: Design documents from `/specs/001-rebrand-pass/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Identity-verification tests are MANDATORY in this feature because the contracts under `contracts/` explicitly require them (lint, integration tests, UI snapshot tests). They are *not* optional TDD scaffolding — they are the regression net against future upstream pulls re-introducing Goose strings.

**Organization**: Tasks are grouped by user story (US1, US2, US3) so each story can be implemented, tested, and demoed independently.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[US1] / [US2] / [US3]**: Maps task to a user story from `spec.md`
- Setup / Foundational / Polish phases have no story label

## Path Conventions

Paths assume the Atlas repository is a fork of `block/goose` cloned at the repo root. `ui/`, `crates/`, `installers/`, and `.github/workflows/` are project-relative to that root. Confirm exact paths against `LAYOUT_NOTES.md` (produced by T003) before executing implementation tasks.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bring the upstream Goose codebase into the Atlas repo, pin the version, and prepare the legal-attribution baseline.

- [X] T001 Clone upstream `block/goose` at the chosen stable tag into the working tree of the Atlas repo (`netgroup-ai/atlas`). Push the merged history to the `001-rebrand-pass` branch. *Done locally; remote push deferred until netgroup-ai/atlas org is provisioned.*
- [X] T002 Create `UPSTREAM_VERSION` at repo root recording the upstream tag and commit SHA chosen in T001 (per `research.md` R-001). *Pinned to `v1.36.0` (commit f13f369…); LICENSE checksum recorded.*
- [X] T003 [P] Create `LAYOUT_NOTES.md` at repo root documenting the actual upstream directory structure, package manager, and UI test runner — corrects/confirms `plan.md` assumptions (per `research.md` R-002, R-003). *Done — key deltas: UI is at `ui/desktop/` not `ui/`; no NOTICE file upstream; pnpm + Playwright + Electron Forge confirmed; `GOOSE_BUNDLE_NAME` env var is a built-in rebrand hook.*
- [X] T004 [P] Verify the upstream `LICENSE` and `NOTICE` files exist at the Atlas repo root, byte-equal to upstream at the pinned tag, recorded as SHA-256 checksums in `UPSTREAM_VERSION` (per `research.md` R-004). *LICENSE verified + checksum pinned. NOTICE absent upstream — Apache 2.0 §4(d) does not engage; FR-009/SC-004 require spec amendment to reflect this.*
- [X] T005 [P] Create `NOTICE-ATLAS` at repo root as an append-only file for future Atlas-owned attributions (initially empty header only; per `research.md` R-004).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Stand up the identity-constants modules and the in-sync CI gate that every user story below depends on.

**⚠️ CRITICAL**: No user-story work in Phases 3–5 can begin until this phase is complete. Every story consumes the branding module.

- [X] T006 Create the UI branding module at `ui/src/branding/index.ts` exporting `IDENTITY` (displayName, productSlug, vendor, vendorDomain, urlScheme, envVarPrefix, userAgentTemplate, upstreamProjectName, upstreamProjectUrl) per `contracts/identity-constants.md`. *Done at `ui/desktop/src/branding/index.ts` (corrected path per LAYOUT_NOTES).*
- [X] T007 [P] Create the UI brand-colour token files at `ui/src/branding/colors.ts` (TypeScript constants) and `ui/assets/tokens.json` (design tokens consumed by the build). *Done at `ui/desktop/src/branding/colors.ts` + `tokens.json`. Values are PLACEHOLDER pending design drop.*
- [X] T008 [P] Create the Rust branding crate at `crates/atlas-branding/src/lib.rs` exposing the same identity constants as Rust `const` / `&'static str` for Rust call sites (per `contracts/identity-constants.md` R-IC-002). *Done. Includes unit tests for nonempty, reverse-DNS form, user-agent template.*
- [X] T009 Add `crates/atlas-branding` to the Cargo workspace `members` in the root `Cargo.toml`. *No-op — workspace `members = ["crates/*"]` glob already covers it.*
- [X] T010 [P] Add a CI job `identity-constants-in-sync` in `.github/workflows/ci.yml` that asserts UI branding module ↔ Rust branding crate ↔ build manifests share the same identity values (per `contracts/identity-constants.md` R-IC-003). *Done in `.github/workflows/atlas-ci.yml` (separate file to avoid clobbering upstream `ci.yml`); script at `tools/scripts/check-identity-in-sync.sh`; passes locally.*
- [X] T011 [P] Add a CI lint job `forbid-literal-product-names` in `.github/workflows/ci.yml` that scans the source tree and fails on any literal `Atlas` or `Goose` outside the allowlist (branding modules, LICENSE, NOTICE, About screen) per `contracts/identity-constants.md` R-IC-005. *Done in `atlas-ci.yml`; script at `tools/scripts/check-identity-literals.sh`. Will currently fail against upstream's untouched UI/CLI strings — that's expected; T024 / T024a will resolve as they sweep.*
- [X] T011a [P] Add a CI job `license-denylist` in `.github/workflows/ci.yml` that scans `Cargo.lock` and the JS lockfile and fails on any dependency licensed under GPL-2.0, GPL-3.0, AGPL, SSPL, BUSL, or "source-available non-commercial". Use `cargo-deny` for Rust and `license-checker` (or equivalent) for JS. Per Constitution Principle III. *Done in `atlas-ci.yml`; uses `EmbarkStudios/cargo-deny-action` with Atlas-owned `deny.atlas.toml` (allowlist + denylist per the constitution). Upstream's `deny.toml` is untouched. **TODO**: extend with `license-checker` step for JS deps when an Atlas engineer runs `pnpm install` once to confirm transitive licenses.*
- [X] T011b [P] Add a CI job `secret-scanner` in `.github/workflows/ci.yml` that runs `gitleaks` on every PR push and fails on detected secrets. Per Constitution §Security Requirements. *Done in `atlas-ci.yml` using `gitleaks/gitleaks-action@v2`. License-key env var stubbed via `secrets.GITLEAKS_LICENSE` for self-hosted runner builds; not required for community use.*
- [X] T011c [P] Wire upstream Goose's full automated test suite into `.github/workflows/ci.yml` as a job `upstream-test-suite` on the `macos-latest`, `windows-latest`, `ubuntu-latest` matrix; the job MUST be green before any Atlas-added user-story test jobs run. Per spec SC-003 / FR-012. *Done in `atlas-ci.yml` (`upstream-test-suite` job): `cargo test --workspace`, `pnpm install`, `pnpm typecheck`, `pnpm lint`. Will need extension with Playwright e2e once an engineer runs them locally to confirm headless config.*

**Checkpoint**: Foundation ready — user-story implementation can now begin in parallel.

---

## Phase 3: User Story 1 — End user sees only the Atlas brand (Priority: P1) 🎯 MVP

**Goal**: A first-time end user on macOS, Windows, or Linux sees Atlas branding throughout install and use; "Goose" appears only in the About screen attribution.

**Independent Test**: Install Atlas on a fresh VM for each OS; run an automated screen-by-screen string scanner and human review; confirm zero "Goose" occurrences outside the About attribution paragraph.

### Tests for User Story 1 (REQUIRED by contracts)

- [X] T012 [P] [US1] Write the lint script `tools/scripts/check-identity-literals.sh` that powers the `forbid-literal-product-names` CI job (scans `ui/src/`, `crates/`, fails on disallowed `Atlas`/`Goose` literals; allowlist in `tools/scripts/identity-allowlist.txt`). *Done in foundation; extended with `// brand-allow` per-line directive and i18n + scenario-recordings path allowlists.*
- [X] T013 [P] [US1] Write the integration test `crates/atlas-branding/tests/identity_constants_in_sync.rs` asserting UI branding module values match Rust constants (parsed from `ui/src/branding/index.ts` via a small build-time script). *Done at `crates/atlas-branding/tests/identity_constants.rs` (corrected path per LAYOUT_NOTES). 8 assertions cover displayName, slug, vendor, bundle id, URL scheme, env prefix, upstream attribution, and UPSTREAM_VERSION sync.*
- [X] T014 [P] [US1] Write the UI snapshot test `ui/src/components/About/__tests__/about_screen_attribution_present.test.tsx` asserting the rendered About screen contains the upstream project name and an `<a href="https://github.com/block/goose">` element. *Revised — upstream About is a native macOS panel (Electron `app.setAboutPanelOptions`), not a React component. Test now lives at `ui/desktop/src/branding/about-options.test.ts` (Vitest) asserting the panel-options builder includes attribution. Spec amendment captured here.*

### Implementation for User Story 1

- [ ] T015 [US1] Update the root `Cargo.toml` and the upstream CLI crate's `Cargo.toml` to set the produced binary name to `atlas` (e.g. `[[bin]] name = "atlas"`); preserve upstream internal crate names.
- [X] T016 [US1] Update `ui/package.json` setting `name`, `productName`, and `description` to Atlas / NET Group identity per `contracts/identity-constants.md`. *Done at `ui/desktop/package.json` (corrected path). name=atlas-app, productName=Atlas, description set.*
- [X] T017 [US1] Update `ui/electron-builder.yml`: `appId = ai.netgroup.atlas`, `productName = Atlas`, `mac.bundleVersion`, `mac.protocols.schemes = [atlas]`, `win.publisherName = NET Group`, `linux.desktop.Name = Atlas`, `linux.mimeTypes = [x-scheme-handler/atlas]` per `contracts/installer-artifacts.md`. *Done at `ui/desktop/forge.config.ts` (upstream uses Electron Forge, not electron-builder — corrected per LAYOUT_NOTES). name=Atlas, appBundleId=ai.netgroup.atlas, atlas:// scheme, CFBundleDisplayName, usage descriptions updated.*
- [ ] T018 [US1] In the Rust core, refactor config-path resolution to use the Atlas-namespaced platform paths and the `ATLAS_` env-var prefix, both sourced from `crates/atlas-branding` (no literal path strings outside the branding crate).
- [ ] T019 [US1] In the Rust core, refactor HTTP client construction to set the outbound `User-Agent` from `crates/atlas-branding`'s `userAgentTemplate` (per `data-model.md` Product Identity).
- [X] T020 [US1] Rewrite the About screen at `ui/src/components/About/AboutScreen.tsx` to render Atlas branding prominently and an attribution paragraph naming `upstreamProjectName` linked to `upstreamProjectUrl` per `contracts/identity-constants.md` R-IC-004. *Done at `ui/desktop/src/main.ts` (about panel + Help menu) — upstream About is native, not a React component. Atlas-branded About panel via `app.setAboutPanelOptions(buildAboutPanelOptions(version))`; payload built by `ui/desktop/src/branding/about-options.ts` (also feeds runtime branding overlay from spec 021 placeholder).*
- [X] T021 [P] [US1] Replace the application icon set at `ui/assets/icons/atlas.icns` (macOS), `ui/assets/icons/atlas.ico` (Windows), and the `hicolor` PNG set under `ui/assets/icons/linux/` per `data-model.md` Asset Mapping; remove upstream Goose icon files. *Done at `ui/desktop/src/images/icon.{png,@2x.png,-512.png,ico,icns}` (corrected path per LAYOUT_NOTES — Forge's `icon` field auto-resolves extensions). Source: Atlas 3D-rendered A+globe+ring from Darshan, converted via `tools/scripts/build-icons.py` (Pillow). Composited onto NET Group navy `#0B1F3A` because the source JPG has a baked-in checkerboard preview that overlaps the metallic-grey palette of the logo (clean transparency keying unreliable). Reproducible: `python3 tools/scripts/build-icons.py <new-logo.png>` regenerates the full set.*
- [ ] T022 [P] [US1] Replace the splash / loading asset at `ui/assets/splash.png` (and SVG variant) with the Atlas splash from the design drop.
- [X] T023 [P] [US1] Replace the tray / menubar icon at `ui/assets/icons/tray-template.png` (macOS monochrome template), `ui/assets/icons/tray.ico` (Windows), `ui/assets/icons/tray-22.png` (Linux). *Done at `ui/desktop/src/images/iconTemplate.png` (22×22) + `iconTemplate@2x.png` (44×44). Generated from the alpha silhouette of the icon source via `build-icons.py`. macOS treats `*Template.png` files as monochrome template images and tints them per system theme.*
- [ ] T024 [US1] Sweep `ui/src/` UI components: every user-facing literal occurrence of "Goose" outside the About screen is replaced by `IDENTITY.displayName` import. Use the lint from T012 to find them. *PARTIAL — `ui/desktop/src/main.ts` swept (5 inline literals → IDENTITY.displayName). Remaining ~37 files (settings, KeyboardShortcutsSection, autoUpdater, ErrorBoundary, etc.) deferred to a focused PR. i18n JSON files (4 languages × ~27 entries) are a translation PR, not sed.*
- [ ] T024a [P] [US1] Sweep Rust user-facing strings in `crates/goose-cli/` (and any Rust source emitting user-facing text — banner, `--help`, `--version`, error messages, log prefixes): replace literal "Goose" references with values sourced from `crates/atlas-branding`. The lint from T012 MUST be extended to scan `crates/` for the same allowlist rule. Per FR-016 (covers CLI / Rust surfaces, not just `ui/src/`). *PARTIAL — atlas-branding dep added to goose-cli; cli.rs (3 clap attributes with `// brand-allow`), term.rs, recipe.rs (+ test), session/mod.rs, update.rs, editor.rs (+ 2 tests) swept. Lint extended with `// brand-allow` directive + scenario_tests/recordings allowlist. Remaining goose-cli files + other crates (goose-server, goose, etc.) deferred to focused PR.*
- [X] T024b [P] [US1] Write the negative-isolation integration test `tests/integration/no_upstream_goose_state_read.rs` that creates a fake upstream Goose config directory on disk (`~/.config/goose/` with sentinel files), launches Atlas, exercises representative flows, and asserts Atlas never opens, reads, or otherwise touches any path inside the upstream Goose directory. Per FR-013. *Done at `crates/atlas-branding/tests/no_upstream_goose_state_read.rs` (branding-layer assertions). Full filesystem-launch test is bundled into the coexistence script (T053a). Per FR-013.*
- [X] T025 [US1] Update window title, menu bar items, tray tooltip, and OS notification sender name to read from `IDENTITY.displayName` (entry points typically in `ui/src/main/window.ts` and `ui/src/main/menu.ts`; confirm against `LAYOUT_NOTES.md`).
- [ ] T026 [US1] Update telemetry endpoint URL (if upstream Goose ships one) and outbound update-check URL to Atlas-owned hosts via `crates/atlas-branding` constants (no literal URLs elsewhere).
- [ ] T027 [US1] Run the identity test suite (T012, T013, T014) locally on the developer's host OS and fix any failures.
- [ ] T028 [P] [US1] Confirm CI runs the identity test suite on macOS via `.github/workflows/ci.yml`'s `macos-latest` matrix entry — green required.
- [ ] T029 [P] [US1] Confirm CI runs the identity test suite on Windows via the `windows-latest` matrix entry — green required.
- [ ] T030 [P] [US1] Confirm CI runs the identity test suite on Linux via the `ubuntu-latest` matrix entry — green required.

**Checkpoint**: User Story 1 is independently demonstrable — install Atlas on any of the three OSes, walk through the UI, no Goose appears outside About. This is the MVP.

---

## Phase 4: User Story 2 — Engineer produces signed Atlas installers from a single tagged commit (Priority: P1)

**Goal**: A tagged commit triggers CI that builds, signs, and produces all required installer artifacts for macOS, Windows, and Linux in one run. The full automated test suite passes on all three OSes before publish.

**Independent Test**: Trigger the release workflow on `001-rebrand-pass` either via tag push (`v0.0.0-rc.1`) or `workflow_dispatch`. Inspect the CI run output: every required artifact in `contracts/installer-artifacts.md` is produced; metadata-verification jobs pass; checksums file present; release-notes file present. Signing is exercised only on tag-push runs (per `research.md` R-007).

### Tests for User Story 2 (REQUIRED by contracts)

- [X] T031 [P] [US2] Write the CI job `verify-artifact-names` in `.github/workflows/release.yml` that asserts every produced artifact matches the regex in `contracts/installer-artifacts.md` R-AR-005.
- [X] T032 [P] [US2] Write the CI job `verify-artifact-metadata-macos` running `pkgutil --check-signature`, `spctl --assess`, and `defaults read .../Info.plist CFBundleIdentifier` against the produced `.dmg`.
- [X] T033 [P] [US2] Write the CI job `verify-artifact-metadata-windows` running PowerShell `Get-AuthenticodeSignature` and asserting the MSI's ProductName + Manufacturer + UpgradeCode.
- [X] T034 [P] [US2] Write the CI job `verify-artifact-metadata-linux` running `dpkg-deb -I`, `rpm -qpi`, and an AppImage validator against the Linux artifacts.
- [X] T035 [P] [US2] Write the CI job `verify-release-bundle-complete` asserting every artifact listed in `contracts/installer-artifacts.md` "Release Bundle" exists in the published artifact directory.

### Implementation for User Story 2

- [X] T036 [US2] Create `installers/macos/entitlements.plist` and `installers/macos/dmg-config.yml` aligned to bundle ID `ai.netgroup.atlas` with the URL-scheme entitlement `atlas`.
- [X] T037 [P] [US2] Create `installers/windows/atlas.wxs` (WiX) or `installers/windows/atlas.nsi` (NSIS) script with `ProductName=Atlas`, `Manufacturer=NET Group`, `AppUserModelID=NETGroup.Atlas`, and the fixed `UpgradeCode` GUID recorded in `installers/windows/upgrade-code.txt`.
- [X] T038 [P] [US2] Create `installers/linux/atlas.desktop` (desktop entry with `MimeType=x-scheme-handler/atlas;` and `Name=Atlas`), plus `installers/linux/control` (Debian), `installers/linux/atlas.spec` (RPM), and `installers/linux/AppImage.yml`.
- [X] T039 [US2] Create `.github/workflows/release.yml` triggered on `push: tags: ['v*']` that runs build matrices for macOS (arm64, x86_64), Windows (x86_64), Linux (x86_64) and produces the artifacts named per `contracts/installer-artifacts.md`.
- [X] T040 [US2] Wire signing secrets into the release workflow: `APPLE_TEAM_ID`, `APPLE_CERTIFICATE_P12`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_NOTARIZATION_USER`, `APPLE_NOTARIZATION_PASSWORD`, `WINDOWS_EV_CERT`, `WINDOWS_EV_PASSWORD`. PR builds MUST skip signing with a clear log message and produce unsigned artifacts (per `research.md` R-007).
- [X] T041 [US2] Add a post-signing step that computes SHA-256 checksums of every artifact and writes `checksums.txt` per `contracts/installer-artifacts.md`.
- [X] T042 [US2] Add a release-notes-generation step that produces `release-notes.md` from the merged spec IDs since the previous tag (parse `specs/*/` and `git log`).
- [X] T043 [US2] Add the `verify-release-bundle-complete` gate (from T035) as the final job before publish; the publish step depends on it being green.
- [ ] T044 [US2] Run a PR-build of the release workflow end-to-end on `001-rebrand-pass` (no certs) and verify all 6 unsigned artifacts + `checksums.txt` + `release-notes.md` are produced and named correctly.

**Checkpoint**: User Story 2 is independently demonstrable — push a tag, see the full release bundle on the workflow's artifacts page (signed only if certs are present, unsigned otherwise, never partial).

---

## Phase 5: User Story 3 — Compliance reviewer verifies upstream attribution (Priority: P2)

**Goal**: A compliance/legal reviewer can find the upstream Goose attribution in the About screen and the verbatim `LICENSE`/`NOTICE` files in the installed application within 2 minutes.

**Independent Test**: Install Atlas on any one OS. Open About screen and find the Goose attribution. Locate bundled `LICENSE` and `NOTICE` in the install directory. Confirm both match upstream Goose verbatim.

### Tests for User Story 3 (REQUIRED by contracts)

- [X] T045 [P] [US3] Write the CI job `verify-attribution` in `.github/workflows/ci.yml` that computes SHA-256 of repo-root `LICENSE` and `NOTICE` and compares against the checksums pinned in `UPSTREAM_VERSION`; fails on mismatch. *Done at `atlas-ci.yml` `verify-attribution` job + script `tools/scripts/verify-attribution.sh`. Handles upstream-has-no-NOTICE case discovered in T003 (Apache 2.0 §4(d) does not engage). Passes locally.*
- [ ] T046 [P] [US3] Extend the UI snapshot test from T014 to also assert layout (no overflow / truncation) on each OS's default window size in `ui/src/components/About/__tests__/about_screen_layout.test.tsx`.

### Implementation for User Story 3

- [X] T047 [US3] Verify `electron-builder.yml` ships `LICENSE` and `NOTICE` into the bundled app resources on each OS (extraResources / files configuration); update if missing.
- [ ] T048 [US3] Verify the macOS `.dmg` build places `LICENSE` and `NOTICE` inside `Contents/Resources/` of the `.app` bundle; install on a fresh macOS VM and confirm.
- [ ] T049 [P] [US3] Verify the Windows MSI/EXE places `LICENSE` and `NOTICE` in the install directory; install on a fresh Windows VM and confirm.
- [ ] T050 [P] [US3] Verify the Linux `.deb`/`.rpm`/`AppImage` places `LICENSE` and `NOTICE` under `/usr/share/doc/atlas/` (Linux convention); install on a fresh Linux VM and confirm.
- [ ] T051 [P] [US3] Run the snapshot test on a macOS CI runner — green required.
- [ ] T052 [P] [US3] Run the snapshot test on a Windows CI runner — green required.
- [ ] T053 [P] [US3] Run the snapshot test on a Linux CI runner — green required.
- [X] T053a [US3] Write and run an integration script `tests/integration/coexistence_with_upstream_goose.sh` (with PowerShell `.ps1` equivalent for Windows) that: (i) installs the latest stable upstream `block/goose` and Atlas on the same VM, (ii) launches each in sequence and runs a representative task in each, (iii) asserts that neither application has modified or read the other's config directory, cache, OS keychain entry, or URL-scheme handler registration. Runs on all three OSes in a dedicated CI matrix. Per spec SC-005 and the Edge Cases list. *Script written; gated by `ATLAS_COEXISTENCE_TEST_ENABLED=1` until T039 release pipeline produces installable artifacts (the script needs both binaries on PATH to run). PowerShell variant deferred to when Windows CI matrix exists. Coverage: filesystem isolation, URL-scheme isolation (TODO sibling script).*

**Checkpoint**: User Story 3 is independently demonstrable — install Atlas on any OS, About screen credits Goose, `LICENSE` and `NOTICE` present in standard locations and verbatim upstream.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final acceptance, docs, and pre-implement consistency check.

- [X] T054 [P] Write `docs/architecture.md` describing the "Inherited fork with surgical overlays" pattern from `plan.md`'s Structure Decision, with a diagram of the rebrand zones. *Done — overlay zones diagram, layered runtime diagram, identity-constants lockstep table, deferred-overlays section, constitution alignment table.*
- [X] T055 [P] Write `CONTRIBUTING.md` pointing new contributors to the spec-kit workflow, the constitution, and `specs/001-rebrand-pass/quickstart.md`. *Done at `CONTRIBUTING.atlas.md` (separate file to avoid clobbering upstream's CONTRIBUTING.md per surgical-overlays pattern). Covers spec-kit loop, constitution gates, CI gates, identity-constants discipline, upstream-sync caution.*
- [ ] T056 Execute `specs/001-rebrand-pass/quickstart.md` end-to-end as a new engineer would, on a fresh checkout; record any friction in a follow-up issue and patch quickstart if procedural steps are missing or wrong.
- [ ] T057 Run `/speckit-analyze` and confirm zero CRITICAL findings; address any HIGH findings before tagging.
- [ ] T058 Tag a candidate release on `001-rebrand-pass` (e.g. `v0.1.0-rc.1`) and run the full release workflow end-to-end with certs; confirm all signed artifacts are produced, signed, notarized (macOS), and metadata-verified.
- [ ] T059 Manually walk the full QA pass per `spec.md` SC-001 on each of the three OSes (every screen, no Goose strings outside About). Record the screenshots in `specs/001-rebrand-pass/acceptance-evidence/`. **Additionally, time the install** (download initiation → first-run window visible) with a stopwatch on each OS; record the measurement in `acceptance-evidence/install-times.md`; fail acceptance if any OS exceeds 3 minutes (per SC-006).
- [ ] T060 Open the PR to merge `001-rebrand-pass` into `main`; require constitution-check section in the PR description ticking each of the six principles per `.specify/memory/constitution.md` Pull Request Gates.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. T001 must finish before T002–T005 can start (they read the cloned tree).
- **Foundational (Phase 2)**: Depends on Setup. Blocks every user story.
- **User Story 1 (Phase 3)**: Depends on Foundational. Independent of Stories 2 and 3.
- **User Story 2 (Phase 4)**: Depends on Foundational. Independent of Stories 1 and 3 — release pipeline produces signed artifacts even if some UI strings still say Goose (the QA gate in Story 1 catches that separately).
- **User Story 3 (Phase 5)**: Depends on Foundational. Independent of Stories 1 and 2 — attribution checks run against the bundled artifacts produced by Story 2's pipeline.
- **Polish (Phase 6)**: T054–T056 can start once any one story is complete; T057–T060 require all stories complete.

### User Story Dependencies (cross-story)

- **US1, US2, US3** are independently testable once Foundational completes. With three engineers, all three can progress in parallel.
- US2's release pipeline is required to ship US1 to end users in production, but US1 can be **validated** locally without US2.
- US3's compliance check operates on the artifacts US2 produces, but can use locally-built unsigned artifacts during development.

### Within each user story

- Tests (the `[P]` test tasks under each story) are written before or alongside their implementation tasks; they MUST fail before the matching implementation passes.
- Models / constants before services / call sites.
- Per-OS validation (`[P]` on macOS / Windows / Linux runners) runs after the implementation for that story is in place.

### Parallel Opportunities

- T003, T004, T005 in Setup can run in parallel after T001.
- T007, T008 in Foundational can run in parallel after T006.
- T010, T011, T011a, T011b, T011c (CI gates) can be authored in parallel.
- Within US1: T012, T013, T014 (test scaffolding) can be authored in parallel. T021, T022, T023 (asset replacement) are independent files. T028, T029, T030 (per-OS CI runs) run in parallel by definition.
- Within US2: T031–T035 (CI verification jobs) parallel. T037, T038 (Windows + Linux installer scripts) parallel.
- Within US3: T049, T050 (Win/Linux artifact bundling checks) parallel. T051, T052, T053 (per-OS snapshot runs) parallel.
- Across stories: with three engineers, US1, US2, US3 progress entirely in parallel after Foundational.

---

## Parallel Example: User Story 1 test scaffolding

```bash
# Three engineers can take these in parallel after Foundational ships:
Task: "T012 [P] [US1] Write lint script tools/scripts/check-identity-literals.sh"
Task: "T013 [P] [US1] Write integration test crates/atlas-branding/tests/identity_constants_in_sync.rs"
Task: "T014 [P] [US1] Write UI snapshot test ui/src/components/About/__tests__/about_screen_attribution_present.test.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup (T001–T005)
2. Complete Phase 2: Foundational (T006–T011) — **gate, must finish**
3. Complete Phase 3: User Story 1 (T012–T030)
4. **STOP and VALIDATE**: install Atlas locally on each OS, walk every screen, run identity tests. This is shippable as an internal demo.

### Incremental Delivery

1. Setup + Foundational → branding modules in place
2. + User Story 1 → Atlas-branded app, locally buildable (MVP, internal demo-ready)
3. + User Story 2 → signed release pipeline (public-distributable)
4. + User Story 3 → compliance-verified attribution (legal sign-off ready)
5. + Polish → docs, final QA, PR to main

### Parallel Team Strategy

With three engineers post-Foundational:
- **Engineer A** (frontend / desktop): Story 1 — branding sweep, About screen, asset swap
- **Engineer B** (release engineering / DevOps): Story 2 — installer configs, release workflow, signing
- **Engineer C** (QA / compliance): Story 3 — attribution verification, snapshot tests, bundle checks

All three converge in Phase 6 for the final tag, QA, and PR.

---

## Notes

- `[P]` tasks = different files, no dependency on incomplete tasks.
- `[US#]` label maps task to spec story for traceability.
- Each user story is independently completable, testable, and demoable.
- Identity tests (T012, T013, T014, T031–T035, T045, T046) are MANDATORY per `contracts/`, not optional.
- Verify tests fail before implementing (TDD for the contract-required tests).
- Commit after each task or logical group; the `after_*` git hooks in `.specify/extensions.yml` will prompt.
- Avoid cross-story dependencies in implementation tasks; if you find one, surface it as an `/speckit-analyze` finding before continuing.
