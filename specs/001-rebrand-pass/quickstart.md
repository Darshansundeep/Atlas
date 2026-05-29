# Quickstart: Atlas Rebrand of Upstream Goose

**Feature**: `001-rebrand-pass`
**Audience**: An engineer joining this work mid-stream; gets a local Atlas-branded build in under 30 minutes once prerequisites are met.

---

## Prerequisites

- macOS, Windows, or Linux dev machine
- `git`, `rustup`, Node.js (LTS), package manager that upstream Goose uses (typically `pnpm`)
- Read access to the Atlas GitHub repo (`netgroup-ai/atlas` — provision via your manager)
- Branding assets received from the design team in `assets-drop.zip` (or note that assets are pending — you can still produce a build using placeholder icons)

You do **not** need code-signing certificates for local development; certs are only required for the release CI job.

---

## 5-minute orientation

1. Open this directory in your editor.
2. Read [`spec.md`](./spec.md) — the WHAT and WHY (~10 min). Focus on Functional Requirements and Success Criteria.
3. Read [`plan.md`](./plan.md) — the HOW (~5 min). Focus on Project Structure and Constitution Check.
4. Skim [`research.md`](./research.md) — the WHY-NOT (decisions and rejected alternatives).
5. Browse [`contracts/`](./contracts/) — the rules every implementation MUST follow.

---

## Local setup

```bash
# 1. Clone the Atlas fork
git clone git@github.com:netgroup-ai/atlas.git
cd atlas

# 2. Confirm you're on the rebrand branch
git switch 001-rebrand-pass

# 3. Install Rust toolchain (one-time, per upstream Goose's rust-toolchain.toml)
rustup show  # installs the pinned toolchain

# 4. Install JS dependencies (uses upstream's lockfile)
pnpm install   # or `npm ci`, confirm via LAYOUT_NOTES.md once that file exists

# 5. Build and run the desktop app
pnpm run dev   # exact command depends on upstream's package.json scripts
```

On first run you should see an Atlas-branded window. If you see "Goose" anywhere outside the About screen, file an issue and link to spec FR-016.

---

## Where to make changes

| Change | File / module |
|---|---|
| Add an identity constant | `ui/src/branding/index.ts` (UI) **and** `crates/atlas-branding/src/lib.rs` (Rust) |
| Update About screen text | `ui/src/components/About/` |
| Update brand colours | `ui/src/branding/colors.ts` + `ui/assets/tokens.json` |
| Update icons | `ui/assets/icons/atlas.icns` / `.ico` / PNG set |
| Update bundle identifier or signing | `ui/electron-builder.yml` + `installers/<os>/` |
| Update URL scheme behaviour | follow [`contracts/url-scheme.md`](./contracts/url-scheme.md) |

**Do NOT** edit upstream Goose files outside the zones listed in `plan.md`'s Structure Decision unless `research.md` records an exception. Sweeping renames create merge conflicts that you'll regret on the next upstream pull.

---

## Running tests

```bash
# Rust core
cargo test --workspace

# UI
pnpm run test

# Identity tests (Atlas-added)
cargo test -p atlas-identity-tests   # rust-side scanner
pnpm run test:identity                # UI-side snapshot tests + lint
```

The identity tests are the rebrand's primary regression net. If they fail, the spec is the source of truth — fix the implementation, not the test, unless you intentionally amend the spec.

---

## Producing a local installer (optional)

```bash
# macOS (.dmg, unsigned)
pnpm run dist:macos

# Windows (.msi, unsigned — run from a Windows machine or VM)
pnpm run dist:windows

# Linux (.deb / .AppImage)
pnpm run dist:linux
```

Unsigned local builds are fine for testing. Signed release builds happen only in CI on tagged commits.

---

## Common pitfalls

- **"My identity test fails because there's a literal `Atlas` in some upstream file."** Don't rename the upstream file. Add the file path to the lint allowlist with a one-line justification in `LAYOUT_NOTES.md` referencing why renaming would conflict.
- **"The About screen overflows on Windows."** Snapshot tests run on all three OSes; fix the layout, don't disable the test.
- **"I want to add a new identity field."** Add it to both the UI branding module *and* the Rust branding module in the same commit. The `identity_constants_in_sync_test` will fail otherwise.
- **"The upstream `LICENSE` / `NOTICE` files were edited."** They MUST NOT be. Restore from upstream at the pinned tag.

---

## Next steps after the rebrand merges

- Spec `002-cloud-auth`: cloud auth + keychain token storage. Consumes `atlas://auth` (reserved here).
- Spec `003-llm-proxy`: cloud proxy + BYOK + local Ollama wiring.
- Spec `009-release-pipeline`: full release-engineering CI/CD with code-signing, notarization, auto-update.

Each is its own `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` cycle.
