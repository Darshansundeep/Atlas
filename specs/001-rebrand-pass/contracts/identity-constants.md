# Contract: Atlas Identity Constants

**Feature**: `001-rebrand-pass`
**Status**: authoritative

This contract defines the canonical identity constants that every Atlas surface MUST agree on. Every component — Rust core, UI, installer manifests, CI scripts — MUST read from this contract's source-of-truth files (the branding module on the UI side, and the equivalent Rust module on the core side). No identity string MAY be embedded as a literal anywhere else.

## Canonical Constants

| Name | Value | Source of truth (UI) | Source of truth (Rust) |
|---|---|---|---|
| `displayName` | `Atlas` | `ui/src/branding/index.ts` | `crates/atlas-branding/src/lib.rs` |
| `productSlug` | `atlas` | branding module | branding module |
| `vendor` | `NET Group` | branding module | branding module |
| `vendorDomain` | `netgroup.ai` | branding module | branding module |
| `bundleIdMacos` | `ai.netgroup.atlas` | `ui/electron-builder.yml` | n/a (manifest-only) |
| `appUserModelIdWindows` | `NETGroup.Atlas` | `ui/electron-builder.yml` | n/a |
| `desktopEntryLinux` | `atlas` | `installers/linux/atlas.desktop` | n/a |
| `urlScheme` | `atlas` | branding module | branding module |
| `envVarPrefix` | `ATLAS_` | branding module | branding module |
| `userAgentTemplate` | `Atlas/${version} (${os}; NET Group)` | branding module | branding module |
| `upstreamProjectName` | `Goose` | branding module (attribution only) | branding module (attribution only) |
| `upstreamProjectUrl` | `https://github.com/block/goose` | branding module (attribution only) | branding module (attribution only) |

## Rules

- **R-IC-001**: Every UI component that displays the product name MUST import `IDENTITY.displayName` from the branding module. No literal `"Atlas"` MAY appear elsewhere in `ui/src/`.
- **R-IC-002**: Every Rust call site that needs an identity constant MUST use the constant exported from the branding crate / module. No literal `"Atlas"` MAY appear elsewhere in `crates/`.
- **R-IC-003**: Build manifests (`Cargo.toml`, `package.json`, `electron-builder.yml`) MAY contain literal identity strings; they are the canonical place those strings live for the build toolchain. The branding module's values MUST be kept in sync with the manifests by a CI consistency check.
- **R-IC-004**: The only literal occurrences of `Goose` outside the bundled `LICENSE` / `NOTICE` MUST be: (a) the About-screen attribution paragraph, (b) `upstreamProjectName` / `upstreamProjectUrl` constants in the branding module (which the About screen consumes), and (c) the `UPSTREAM_VERSION` file at repo root.
- **R-IC-005**: A repository-wide lint MUST fail any PR that introduces a literal `Atlas` or `Goose` string outside the allowed locations above. The lint is enforced as a CI gate.

## Verification

- Integration test `identity_constants_in_sync_test`: parses the branding module, parses the manifests, asserts equal values.
- Lint job `forbid-literal-product-names`: greps source tree, fails on disallowed literal occurrences.
- UI snapshot test `about_screen_attribution_present`: confirms About screen contains `upstreamProjectName` text and a hyperlink to `upstreamProjectUrl`.
