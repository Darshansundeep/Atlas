# Contributing to Atlas

**Task**: T055.

This file complements upstream's `CONTRIBUTING.md`. Read both. When they disagree on Atlas-specific topics (branding, the CI gates, the spec workflow), this file wins.

## Spec-driven from the first commit

Atlas uses [GitHub spec-kit](https://github.com/github/spec-kit). Every non-trivial change flows through:

```
/speckit-constitution  (once per amendment)
        ↓
/speckit-specify  →  /speckit-clarify  →  /speckit-plan
        ↓                                       ↓
/speckit-checklist  ←  /speckit-tasks  ←  /speckit-analyze  →  /speckit-implement
```

Files land under `specs/NNN-<short-name>/`. The chain is the merge gate: `/speckit-analyze` must report 0 CRITICAL / 0 HIGH before `/speckit-implement` runs.

**Trivial changes** — typo fix, dependency bump under the denylist, doc clarification — can skip the full chain but still need a PR-description Constitution Check.

## The constitution is non-negotiable

[`.specify/memory/constitution.md`](.specify/memory/constitution.md). Six principles, three NON-NEGOTIABLE. Read before opening a PR. Three of the principles fail every PR that breaks them — there is no override flag.

## CI gates that gate merge

Implemented in [`.github/workflows/atlas-ci.yml`](.github/workflows/atlas-ci.yml):

| Gate | What it enforces |
|---|---|
| `identity-constants-in-sync` | TS branding module ↔ Rust branding crate ↔ manifests agree |
| `forbid-literal-product-names` | No stray `Atlas` / `Goose` literals outside the allowlist |
| `verify-attribution` | `LICENSE` byte-equal to upstream pin; `NOTICE-ATLAS` present |
| `license-denylist` | No GPL / AGPL / SSPL / BUSL deps (Principle III) |
| `secret-scanner` | gitleaks on every PR |
| `upstream-test-suite` (matrix) | Upstream Goose's full test suite, all 3 OSes |

All gates pass = the PR is mergeable on the constitutional side. Human review checks for everything else.

## Working on the codebase

1. **Always work in a feature branch**, never `main`. Branch names: `NNN-<short-name>` matching the spec folder where possible.
2. **Identity strings go through the branding modules**. Don't hardcode `"Atlas"` or `"Goose"` in code. Import from `ui/desktop/src/branding/index.ts` (TypeScript) or `crates/atlas-branding` (Rust). The forbid-literals lint will catch you.
3. **Touch upstream files surgically**. Every edit to a file outside the Atlas overlay zones (`ui/desktop/src/branding/`, `crates/atlas-branding/`, `.github/workflows/atlas-ci.yml`, `tools/scripts/`, `tests/integration/`, `specs/`, `.specify/`, `admin-console/`, `docs/`) should:
   - reference an identity constant rather than a literal;
   - be small enough that the merge driver can usually auto-resolve;
   - be captured in a spec task with a `[US#]` label.
4. **No new top-level files** at the repo root without thinking. Upstream uses many root-level files; we add only when there's a clear "this is Atlas-specific" reason and a sensible `*.atlas.md` / `atlas-*.yml` name.

## Sync with upstream (post-launch)

The chosen model is **curated cherry-pick** (per `ATLAS_BUILD_PLAN.md`). Don't auto-rebase the whole upstream history; let the upstream-sync script + a labelled PR pick what to bring.

Until that script exists (spec `010-upstream-sync`, deferred), avoid `git merge upstream/main` on a feature branch — it'll create a wall of changes the PR review can't reason about.

## Where to get help

- `specs/<feature>/quickstart.md` — onboarding for that feature.
- `LAYOUT_NOTES.md` — ground truth on upstream's actual directory structure.
- `docs/architecture.md` — the overlay pattern + identity-constants lockstep.

## License

Apache 2.0. All Atlas-specific changes are Apache-2.0 licensed. By contributing you certify that your contribution is yours to make under Apache 2.0.
