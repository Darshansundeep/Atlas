# Contract: Installer Artifacts

**Feature**: `001-rebrand-pass`
**Status**: authoritative

This contract defines the shape of installer artifacts the rebrand pass produces. The release pipeline (spec `009-release-pipeline`, future) will consume this contract.

## Artifact Naming

```
atlas-<semver>-<os>-<arch>.<ext>
```

| Component | Allowed values |
|---|---|
| `semver` | semantic version per SemVer 2.0, optionally with `-beta.N` or `-rc.N` pre-release suffix |
| `os` | `macos` / `windows` / `linux` |
| `arch` | `arm64` / `x86_64` |
| `ext` | `dmg` (macos) / `msi` or `exe` (windows) / `deb` / `rpm` / `AppImage` (linux) |

**Examples**:
- `atlas-0.1.0-macos-arm64.dmg`
- `atlas-0.1.0-windows-x86_64.msi`
- `atlas-0.1.0-linux-x86_64.AppImage`

## Per-OS Metadata Requirements

### macOS (`.dmg`)

| Field | Required value |
|---|---|
| Bundle identifier | `ai.netgroup.atlas` |
| Bundle display name | `Atlas` |
| Code-signing identity | Developer ID Application certificate owned by NET Group's Apple Developer Team |
| Notarization | MUST be `accepted` for tagged releases; MAY be skipped for PR builds |
| Hardened runtime | enabled |
| Entitlements | minimal — only what upstream Goose requires + URL scheme `atlas` |

### Windows (`.msi` or `.exe`)

| Field | Required value |
|---|---|
| ProductName | `Atlas` |
| Manufacturer | `NET Group` |
| AppUserModelID | `NETGroup.Atlas` |
| UpgradeCode (MSI) | a fixed GUID owned by Atlas, recorded in `installers/windows/upgrade-code.txt` |
| Authenticode signature | EV certificate, publisher = NET Group |
| Installer target | per-user install by default; per-machine install supported via opt-in flag |

### Linux (`.deb` / `.rpm` / `.AppImage`)

| Field | Required value |
|---|---|
| Package name | `atlas` |
| Maintainer | `NET Group <support@netgroup.ai>` (placeholder until support email confirmed) |
| Desktop entry name | `atlas` |
| MIME registrations | `x-scheme-handler/atlas` |
| Architecture | `amd64` (deb) / `x86_64` (rpm) |
| Dependencies | only what upstream Goose declares; no Atlas-added system dependencies in this spec |
| `.AppImage` signing | optional at v1; if signed, the OpenPGP key fingerprint is recorded in `installers/linux/signing-key.txt` |

## Release Bundle

A single release tag MUST produce **all** of the following artifacts in one CI run:

```
atlas-<semver>-macos-arm64.dmg
atlas-<semver>-macos-x86_64.dmg
atlas-<semver>-windows-x86_64.msi
atlas-<semver>-linux-x86_64.deb
atlas-<semver>-linux-x86_64.rpm
atlas-<semver>-linux-x86_64.AppImage
checksums.txt          # sha256 of every artifact above
release-notes.md       # generated from merged spec IDs since previous release
```

The presence of any artifact without the rest invalidates the release. CI MUST fail the release job if any artifact is missing.

## Rules

- **R-AR-001**: All artifacts in a single release MUST be produced from the same git commit.
- **R-AR-002**: A tagged release MUST NOT be published if any required artifact is missing, unsigned (where signing is required), or fails its metadata-verification check.
- **R-AR-003**: Checksums MUST be computed *after* signing.
- **R-AR-004**: Release notes MUST reference the merged spec IDs (e.g., `001-rebrand-pass`) that ship in the release.
- **R-AR-005**: Artifact filenames MUST match the regex `^atlas-[0-9]+\.[0-9]+\.[0-9]+(-(beta|rc)\.[0-9]+)?-(macos|windows|linux)-(arm64|x86_64)\.(dmg|msi|exe|deb|rpm|AppImage)$`.

## Verification

- CI job `verify-artifact-names`: asserts every produced artifact matches R-AR-005.
- CI job `verify-artifact-metadata` (per OS):
  - macOS: `pkgutil --check-signature` + `spctl --assess` + bundle-id assertion.
  - Windows: `Get-AuthenticodeSignature` PowerShell check + ProductName assertion.
  - Linux: `dpkg-deb -I` / `rpm -qpi` / `appimage-validate` metadata assertions.
- Release job `verify-release-bundle-complete`: greps the artifact directory against the required-artifact list, fails on any missing.
