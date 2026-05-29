# Research: Atlas Rebrand of Upstream Goose

**Feature**: `001-rebrand-pass`
**Plan**: [plan.md](./plan.md)
**Date**: 2026-05-29

This document resolves the unknowns flagged in `plan.md`'s Technical Context. Each entry follows the format:

- **Decision**: what was chosen
- **Rationale**: why
- **Alternatives considered**: what else was on the table and why rejected
- **Verification**: how to confirm the decision still holds once the fork is cloned

---

## R-001: Upstream Goose tag to fork from

**Decision**: Fork from the most recent **tagged stable release** of `block/goose` at the time the fork is created (not `main`, not a dated commit). Pin the chosen tag in a top-level `UPSTREAM_VERSION` file committed in the same PR as the rebrand. The initial expectation is a release in the `v1.x` family; the exact tag is recorded when the engineer running the fork resolves it.

**Rationale**:
- Forking a tagged release gives a stable baseline that has passed upstream's own release gates.
- Pinning the version in `UPSTREAM_VERSION` makes future merge windows unambiguous — engineers know exactly what they're rebasing against.
- Forking `main` would expose Atlas to upstream's in-flight breakage and complicate the "functionally identical to upstream" claim in spec FR-012.

**Alternatives considered**:
- *Fork `main` HEAD*: gets newest features but introduces moving-target risk; rejected.
- *Fork a specific commit on `main`*: same problem with less traceability; rejected.
- *Vendor upstream as a submodule*: cleaner separation but breaks the "rebrand the build" model — manifests and assets sit inside the submodule and can't be overlaid; rejected.

**Verification**: When the fork is created, the engineer records the chosen tag in `UPSTREAM_VERSION`. CI fails if `UPSTREAM_VERSION` is absent. Reviewers confirm the tag exists in `block/goose`'s tags list.

---

## R-002: Upstream Goose repository layout

**Decision**: Treat the upstream layout as authoritative. The plan's Structure section is the *assumed* layout based on public knowledge; the first task in `tasks.md` (T001) will be to clone upstream at the pinned tag and produce a one-page `LAYOUT_NOTES.md` confirming or correcting the assumed directories.

**Rationale**:
- Authoring the rebrand against an assumed layout is acceptable for `/speckit-plan` (planning); committing it would be premature.
- Upstream may have reorganised crates / UI directories since this plan was drafted. The plan's layout is a hypothesis until verified.
- The "Inherited fork with surgical overlays" Structure Decision in `plan.md` doesn't depend on the *exact* directories, only on the *zones* (manifests, branding module, About screen, assets, installer configs, CI). The verification step adjusts paths but not strategy.

**Alternatives considered**:
- *Block planning until the fork is cloned*: would force the user to do release-engineering setup before they can read a plan; rejected as premature pessimisation.
- *Inline the entire upstream tree into this plan*: bloated and would go stale fast; rejected.

**Verification**: First implementation task clones upstream, produces `LAYOUT_NOTES.md`, and updates this research entry if the assumed structure diverges materially.

---

## R-003: Upstream JS package manager and UI test runner

**Decision**: Use whatever the upstream Goose `package.json` declares (likely `pnpm` based on Block's other open-source projects). Do not change package managers as part of the rebrand. The UI test runner is whatever upstream ships with — adoption of an Atlas-specific test framework is out of scope for this spec.

**Rationale**: Changing package manager or test runner during a rebrand introduces a confounding variable. If something breaks post-rebrand, we want to know it broke because of identity changes, not because of tooling churn.

**Alternatives considered**:
- *Standardise on `npm` or `yarn`*: pure preference change, no value, rejected.
- *Adopt Vitest if upstream uses Jest*: out of scope, rejected.

**Verification**: First implementation task records the actual package manager and test runner in `LAYOUT_NOTES.md`.

---

## R-004: Apache 2.0 attribution requirements satisfied by this rebrand

**Decision**: Preserve upstream `LICENSE` (Apache 2.0 text) and `NOTICE` files verbatim at the repository root. Add an "Attributions" or "About" section in the in-app About screen that names "Goose by Block" with a hyperlink to `https://github.com/block/goose`. Do not modify the contents of `LICENSE` or `NOTICE`; if NET Group adds its own NOTICE-worthy attributions later, append in a separate `NOTICE-ATLAS` file rather than mutating `NOTICE`.

**Rationale**:
- Apache 2.0 §4(c) requires retention of attribution notices "in any derivative works" that you distribute. Verbatim preservation discharges this absolutely.
- §4(d) requires that if upstream included a NOTICE file, the derivative must carry its contents. Verbatim NOTICE preservation discharges this.
- An About-screen credit is not legally mandated but is the standard goodwill practice and reduces friction in compliance reviews.
- Appending to a separate `NOTICE-ATLAS` (rather than editing `NOTICE`) keeps upstream-merge conflict-free.

**Alternatives considered**:
- *Bury the LICENSE / NOTICE in a docs folder*: technically compliant if the files are "included with the work" but reviewers commonly look at root; rejected for friction.
- *Replace upstream NOTICE with a new file that mentions both projects*: technically permissible if upstream content is preserved within it, but error-prone and risks upstream-merge churn; rejected.

**Verification**: First implementation task checks that the unmodified `LICENSE` and `NOTICE` from the upstream tag are at the Atlas repo root and that the About-screen attribution renders on all three OSes.

---

## R-005: Brand asset format and resolution targets

**Decision**: Atlas brand assets produced by NET Group's design team in the following formats, sized to each OS's native expectations:

- **macOS**: `.icns` with embedded sizes 16, 32, 64, 128, 256, 512, 1024 px (1× and 2× variants for each).
- **Windows**: `.ico` containing 16, 24, 32, 48, 64, 128, 256 px. Installer banner / sidebar images per the EV-signed installer toolchain's requirements.
- **Linux**: PNG set at 16, 24, 32, 48, 64, 128, 256, 512 px for `hicolor` icon theme; SVG for resolution-independent contexts.
- **Splash / About**: 1× and 2× PNG, or a single SVG, at the dimensions upstream Goose's About screen uses.
- **Colour palette**: defined as design tokens (CSS variables and a JSON manifest), not hard-coded hex values, so theming changes propagate.

**Rationale**: These are the long-established native asset conventions per OS. Producing assets in any other shape forces lossy conversion at build time, which usually shows up as ugly icons in the taskbar.

**Alternatives considered**:
- *SVG-only across all OSes*: works on Linux, partial on macOS, doesn't work for Windows .ico embedding; rejected.
- *Single high-res PNG, downscaled at build*: produces aliased icons at small sizes; rejected for quality.

**Verification**: Design team delivers an asset bundle that the build pipeline ingests. The pipeline fails if any required size is missing.

---

## R-006: Atlas identity-constants module location

**Decision**: Introduce a single new module at `ui/src/branding/index.ts` (TypeScript) that exports an `IDENTITY` object holding every user-facing identity constant: `displayName`, `bundleId`, `urlScheme`, `envVarPrefix`, `userAgentTemplate`, `aboutAttribution`, `brandColors`, `iconPaths`. Every UI component that needs an identity string imports from this module rather than embedding a literal. Rust-side equivalents live in a `crates/atlas-branding` crate (or, if upstream's structure makes a new crate awkward, an `atlas_branding.rs` module inside the existing CLI crate) exposing the same set as Rust constants.

**Rationale**:
- Single source of truth: any future rename (e.g., a sub-brand) is one file, not a sweep.
- Reduces upstream merge conflicts: upstream UI components don't have identity literals to rename; they call `IDENTITY.displayName`.
- Symmetry between UI and Rust sides means tests can verify both layers reference the same constants.

**Alternatives considered**:
- *Scatter identity strings through components*: traditional approach, but every upstream pull will re-merge them; rejected.
- *Inject identity at build time via environment variables*: works but obscures the values; rejected for legibility.

**Verification**: Implementation task creates the module; a lint rule or test checks that no other file contains a literal "Atlas" string outside the branding module, LICENSE, NOTICE, and About screen.

---

## R-007: Signing / notarization certificates and timing

**Decision**: This spec assumes the signing certificates listed in `ATLAS_BUILD_PLAN.md` §3 (Apple Developer Team ID, Windows EV cert, optional Linux OpenPGP key) are either obtained or in process by the time `/speckit-implement` runs the release-pipeline task. The plan's CI workflow templates reference certificate locations via secrets; the build succeeds without certs in PR-builds (unsigned artifacts) and only requires certs for tagged releases.

**Rationale**: Cert acquisition has long lead times (1–14 days for Apple, 3–5 business days for Windows EV). Decoupling cert acquisition from the rebrand work lets engineering proceed in parallel with procurement.

**Alternatives considered**:
- *Block all CI work until certs arrive*: wastes engineering time, rejected.
- *Self-sign and patch later*: leaves a "self-signed" string in artifact metadata that contradicts FR-014 on the eventual public release; rejected.

**Verification**: PR-build CI runs without signing secrets and produces unsigned artifacts; the release workflow checks for signing secrets and exits with a clear error if they are missing on a tag build.

---

## Open items (carried forward, not blocking)

The following are recorded for visibility but are not gating Phase 1 design:

- **Future merge cadence with upstream**: out of scope for this rebrand spec; modelled in a future operations spec.
- **Channel strategy (stable / beta)**: deferred to spec `009-release-pipeline` per the build plan.
- **Localization of identity strings**: rebrand handles English; localisation deferred until upstream's localisation framework is fully audited.
