# Data Model: Atlas Rebrand of Upstream Goose

**Feature**: `001-rebrand-pass`
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Date**: 2026-05-29

The rebrand is identity-only and introduces **no persisted user data**. The "data model" here describes the build-time and configuration-time entities the feature manipulates, plus their cross-platform mappings.

---

## Entity: Product Identity

The canonical set of identity attributes that defines Atlas as a distinct product.

| Field | Type | Source of truth | Per-OS value |
|---|---|---|---|
| `displayName` | string | `ui/src/branding/index.ts` → `IDENTITY.displayName` | `"Atlas"` (all OSes) |
| `productSlug` | string | branding module | `"atlas"` (lowercase, used in binary name + paths) |
| `vendor` | string | branding module | `"NET Group"` (all OSes) |
| `bundleId` | string | per-OS build manifest | macOS: `ai.netgroup.atlas` / Windows: AppUserModelID `NETGroup.Atlas` / Linux: desktop entry `atlas` |
| `urlScheme` | string | branding module + per-OS registration | `"atlas"` (registers `atlas://`) |
| `envVarPrefix` | string | branding module + Rust constant | `"ATLAS_"` |
| `userAgentTemplate` | string template | branding module | `"Atlas/${version} (${os}; NET Group)"` |
| `configPath` | platform path | resolved at runtime via branding module | macOS: `~/Library/Application Support/Atlas/` / Windows: `%APPDATA%\Atlas\` / Linux: `~/.config/atlas/` |
| `brandColors` | design tokens | `ui/src/branding/colors.ts` + `ui/assets/tokens.json` | identical across OSes |
| `iconSet` | file references | `ui/assets/icons/` | resolved per-OS by build (see Asset Mapping below) |

**Validation rules**:
- `displayName`, `productSlug`, `vendor` MUST NOT be empty strings.
- `bundleId` MUST match the regex `^[a-z]+\.[a-z0-9-]+\.[a-z0-9-]+$` (reverse-DNS form).
- `urlScheme` MUST match `^[a-z][a-z0-9+.-]*$` (RFC 3986 §3.1).
- `envVarPrefix` MUST match `^[A-Z]+_$` (uppercase, trailing underscore).
- `configPath` resolution MUST return an absolute path that the current OS user can write.

**State transitions**: None. `Product Identity` is immutable per build; updates ship as a new release.

**Lifecycle**: Constructed at build time from the branding module + per-OS manifests; read by both Rust core and UI; never mutated at runtime.

---

## Entity: Attribution Surface

The set of in-product locations that discharge the Apache 2.0 attribution obligation to upstream Goose.

| Location | Asset | Mutable? | Verification |
|---|---|---|---|
| Repository root | `LICENSE` (Apache 2.0 text) | No — verbatim from upstream | byte-equal compare against upstream at pinned tag |
| Repository root | `NOTICE` | No — verbatim from upstream | byte-equal compare against upstream at pinned tag |
| Repository root (Atlas-added) | `NOTICE-ATLAS` | Yes, owned by Atlas | append-only; reviewed at PR |
| Installed app resources | bundled `LICENSE` + `NOTICE` | No — copied from repo at build | post-install file presence + checksum |
| About screen | "Atlas is built on Goose by Block." paragraph with link | Yes, Atlas-owned text | UI snapshot test on all 3 OSes |

**Validation rules**:
- `LICENSE` and `NOTICE` MUST byte-equal the upstream tag's files. A CI gate runs `sha256sum --check` against checksums pinned in `UPSTREAM_VERSION`.
- The About-screen attribution paragraph MUST contain the literal string `"Goose"` and a hyperlink whose `href` resolves to `https://github.com/block/goose`.
- The About screen MUST render without overflow / truncation on each OS's default window size at install (verified by snapshot test).

**Lifecycle**: Constructed at build time. Verified at PR time by a `verify-attribution` CI job and at runtime by the identity-test suite.

---

## Entity: Build Artifact

A single distributable installer produced by CI from a tagged commit.

| Field | Type | Notes |
|---|---|---|
| `artifactId` | string | `atlas-<version>-<os>-<arch>.<ext>` (e.g. `atlas-0.1.0-macos-arm64.dmg`) |
| `os` | enum | `macos` / `windows` / `linux` |
| `arch` | enum | `arm64` / `x86_64` |
| `extension` | enum | `dmg` / `msi` / `exe` / `deb` / `rpm` / `AppImage` |
| `bundleId` | string | from Product Identity per-OS |
| `signingIdentity` | string | macOS: Developer ID Application certificate subject; Windows: EV cert subject (NET Group); Linux: OpenPGP key fingerprint (optional) |
| `notarized` | bool | macOS only; MUST be true for tagged releases |
| `checksum` | sha256 | published alongside the artifact |
| `releaseTag` | string | the git tag that produced the artifact |

**Validation rules** (enforced by CI before publishing):
- `bundleId` MUST match `Product Identity.bundleId` for the artifact's OS.
- macOS artifacts MUST have `notarized = true` for tagged releases.
- Windows artifacts MUST have a valid EV Authenticode signature with publisher matching `Product Identity.vendor`.
- Linux artifacts MAY be unsigned at v1; if signed, `signingIdentity` MUST match the published Atlas OpenPGP key.
- `checksum` MUST be computed post-signing and published in the release.

**State transitions**:

```
draft (PR build, unsigned) → signed → notarized (macOS only) → published
```

---

## Asset Mapping (Reference)

How an Atlas icon entry in the branding module resolves per OS:

| Identity field | macOS | Windows | Linux |
|---|---|---|---|
| `iconSet.app` | `ui/assets/icons/atlas.icns` (multi-resolution) | `ui/assets/icons/atlas.ico` (multi-resolution) | `ui/assets/icons/atlas-256.png` (+ scaled set in `hicolor/`) |
| `iconSet.tray` | `ui/assets/icons/tray-template.png` (macOS template image, monochrome) | `ui/assets/icons/tray.ico` | `ui/assets/icons/tray-22.png` (+ scaled) |
| `iconSet.splash` | shared PNG/SVG (resolution-independent) | shared | shared |

---

## Cross-references

- Identity strings → enforced by [contracts/identity-constants.md](./contracts/identity-constants.md)
- URL scheme grammar → enforced by [contracts/url-scheme.md](./contracts/url-scheme.md)
- Installer artifact naming and metadata → enforced by [contracts/installer-artifacts.md](./contracts/installer-artifacts.md)
