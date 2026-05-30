# Atlas Installer Configs

Per-OS installer scaffolding for the Atlas release pipeline (T036–T038).

These configs are CONSUMED by the release workflow at `.github/workflows/atlas-release.yml` (T039). Signing certs and notarization secrets are injected via GitHub Actions secrets — none of those values live in source.

| OS | Tooling | Files here | Contract |
|---|---|---|---|
| macOS | Electron Forge + `osxSign` + `osxNotarize` | `macos/entitlements.plist` | `contracts/installer-artifacts.md` §macOS |
| Windows | Electron Forge `MakerSquirrel` / `MakerWix` + EV cert | `windows/upgrade-code.txt` | `contracts/installer-artifacts.md` §Windows |
| Linux | Electron Forge `MakerDeb` + `MakerRpm` + AppImage | `linux/atlas.desktop` | `contracts/installer-artifacts.md` §Linux |

Per LAYOUT_NOTES.md, upstream Goose uses Electron Forge (not electron-builder). Most metadata is configured in `ui/desktop/forge.config.ts` directly; this directory holds artefacts that Forge references by path (entitlements, .desktop entries, MSI upgrade GUIDs).
