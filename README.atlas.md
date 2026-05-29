# Atlas

> NET Group's AI agentic desktop app — built on, and contributing back to, [Goose](https://github.com/block/goose) by Block / AAIF.

Atlas is a rebranded, governed, enterprise-oriented distribution of the open-source Goose agent. The same Rust core, the same MCP-extension model, the same provider integrations — wrapped in NET Group identity, with cloud auth, a managed skill catalogue, and per-organisation policy on the roadmap.

## Status

Active feature: **`001-rebrand-pass`** — the identity-overlay foundation. Roughly:

- Upstream pinned at `block/goose` v1.36.0 (see `UPSTREAM_VERSION`).
- TypeScript identity module at `ui/desktop/src/branding/`.
- Rust identity crate at `crates/atlas-branding/`.
- Atlas-specific CI gates (`.github/workflows/atlas-ci.yml`): identity-in-sync, no-literal-product-names, license-denylist, secret-scanner, upstream-test-suite on 3 OSes.

What's NOT here yet: signed installers, cloud auth, LLM proxy, admin console, skill marketplace. Those live in future specs (`002-cloud-auth`, `003-llm-proxy`, `020`–`024`). See [`ATLAS_BUILD_PLAN.md`](./ATLAS_BUILD_PLAN.md).

## For engineers joining

1. Read [`specs/001-rebrand-pass/quickstart.md`](./specs/001-rebrand-pass/quickstart.md) — 30-minute onboarding.
2. Skim [`specs/001-rebrand-pass/spec.md`](./specs/001-rebrand-pass/spec.md), then [`plan.md`](./specs/001-rebrand-pass/plan.md), then [`tasks.md`](./specs/001-rebrand-pass/tasks.md).
3. Read [`LAYOUT_NOTES.md`](./LAYOUT_NOTES.md) — captures actual upstream layout vs assumed.
4. Read [`.specify/memory/constitution.md`](./.specify/memory/constitution.md) — the project's six non-negotiable principles.

Development uses [github/spec-kit](https://github.com/github/spec-kit) — every feature flows through `/speckit-specify → /speckit-clarify → /speckit-plan → /speckit-tasks → /speckit-analyze → /speckit-implement`.

## Upstream attribution

Atlas is a derivative work of Goose, licensed under Apache License 2.0. The verbatim upstream `LICENSE` is at the repo root. NET Group's added attributions live in `NOTICE-ATLAS`. The in-app About screen (forthcoming, per spec FR-010) credits the upstream project.

## License

Apache License 2.0 — see [`LICENSE`](./LICENSE). All Atlas-specific changes are also Apache-2.0 licensed.
