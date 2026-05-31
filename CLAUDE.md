@AGENTS.md

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:

- Active features:
  - `specs/001-rebrand-pass/` — Atlas branding (~85% done, runtime-verified)
  - `specs/002-cloud-auth/` — Windsurf-style sign-in (spec + plan + research + contracts complete; `/speckit-tasks` next)
- Plans:
  - `specs/001-rebrand-pass/plan.md`
  - `specs/002-cloud-auth/plan.md`
- Specs:
  - `specs/001-rebrand-pass/spec.md`
  - `specs/002-cloud-auth/spec.md`
- Recently shipped (UX polish on top of 001):
  - `specs/005-tool-call-progress/` — elapsed time + staged Cancel/Diagnose on loading indicator
  - `specs/006-file-attachments/` — inline clickable file-path chips (open / reveal-in-Finder)
  - `specs/007-provider-pricing/` — Settings → Models → Pricing Overrides UI (local-only)
- Build prereqs (verified on darwin/arm64, 2026-05-31):
  - Node **22.x** (Node 24 still has the `extract-zip` hang during `electron-packager` "Finalizing package"). Use `/opt/homebrew/opt/node@22/bin` or nvm 22.
  - pnpm **10.30.x** via `corepack prepare pnpm@10.30.0 --activate`.
  - Rust stable via rustup (cargo lives at `~/.rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo`).
  - Release goosed: `cargo build --release -p goose-server` → `target/release/goosed`, then `cp` into `ui/desktop/src/bin/goosed`.
  - Package: `cd ui/desktop && pnpm run package` produces `ui/desktop/out/Atlas-darwin-arm64/Atlas.app`.
- Constitution: `.specify/memory/constitution.md`
- Upstream layout reality (deltas from plan): `LAYOUT_NOTES.md`
- Upstream pin: `UPSTREAM_VERSION`
<!-- SPECKIT END -->
