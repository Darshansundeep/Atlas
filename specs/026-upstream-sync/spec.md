# Feature Specification: Upstream-Sync Process

**Feature Branch**: `026-upstream-sync`
**Status**: Draft + initial tooling shipped (`scripts/upstream-sync.sh`)
**Created**: 2026-05-31

## Problem

Atlas is an inherited fork of `block/goose`. Upstream ships features regularly (multi-version provider support, new MCP capabilities, performance fixes). Atlas needs a **predictable, curated** way to pull those changes without:

- regressing Atlas-specific overlays (branding, FEATURES gates, cloud-auth, LLM proxy hooks)
- losing visibility into what changed
- silently inheriting things that violate the Constitution (e.g. telemetry endpoints, vendor URLs)

The model is **"curated cherry-pick"**, not "merge upstream main into Atlas main".

## Desired behaviour

### Cadence

- **Triage week** runs the day after each upstream release (e.g. `block/goose v1.37.0`).
- Triage produces a labelled table of every upstream commit since our last sync.

### Per-commit decision tree

For each upstream commit:

| Action | Use when |
|---|---|
| **TAKE** | Pure bugfix or non-branded feature improvement. `git cherry-pick`. |
| **OVERLAY** | Feature we want but it touches a file we've Atlas-customised. Take in a new commit that wraps the upstream change with our overlay. |
| **SKIP** | Feature contrary to Atlas direction (e.g. Square-specific integrations, telemetry to Block endpoints) OR conflicts with our spec roadmap. Document why. |
| **DEFER** | Take later. Useful for risky changes that we want to land after Atlas's own work stabilises. |

Output: a sync report in `specs/026-upstream-sync/reports/YYYY-MM-DD-upstream-vX.Y.Z.md` with one row per commit.

### Update protocol

1. Update `UPSTREAM_VERSION` file in repo root.
2. Update `IDENTITY.upstreamPinnedVersion` in `ui/desktop/src/branding/index.ts`.
3. Run the sync script to fetch + cherry-pick TAKE commits.
4. Hand-author OVERLAY commits.
5. Run the full CI suite (unit + integration + cross-OS package).
6. Document each SKIP with a one-line rationale.
7. Publish the sync report.

### Constitutional guards

The sync process MUST refuse to take any commit that:

- Adds a URL pointing at `cash-f.squarecdn.com`, `*.block.xyz`, `*.aaif.io`, or other upstream-vendor endpoints (without an explicit OVERLAY note that's removing them).
- Adds a string literal `"Goose"` or `"goose"` outside of files matching `^LICENSE$|^NOTICE-ATLAS$|.+\.md$|.+\.test\.[jt]sx?$`.
- Adds a telemetry call to a non-Atlas endpoint.
- Modifies the constitution.

These are CI-enforced by the existing `brand-guard` lint job. New rules go in the constitution.

## Open questions

1. How often do we sync — monthly, per upstream release, or opportunistic?
2. Should Atlas track upstream's release branches or only tagged releases?
3. When upstream removes a feature we depend on, do we keep our overlay or remove?
4. CI for the sync itself — a separate "upstream-dry-run" job that flags incoming risky changes before triage?

## Dependencies

- None — this is process + tooling.

## Acceptance criteria

- Running `bash scripts/upstream-sync.sh` from the repo root produces a list of unprocessed upstream commits with a suggested action per commit.
- Cherry-picking flagged-as-TAKE commits works without conflicts on the standard cases.
- The brand-guard lint job catches violations from incoming commits.
- A markdown sync report lands in `specs/026-upstream-sync/reports/` for each sync session.
- Atlas can be brought up to any tagged upstream release within one focused session.

## Tooling shipped today

- `scripts/upstream-sync.sh` — fetches upstream, enumerates new commits, prints triage table.
- `specs/026-upstream-sync/reports/.gitkeep` — directory ready for sync reports.

Future tooling:
- `scripts/upstream-take.sh <commit>` — cherry-pick with brand-guard pre-flight
- `scripts/upstream-skip.sh <commit> <reason>` — record a SKIP decision
