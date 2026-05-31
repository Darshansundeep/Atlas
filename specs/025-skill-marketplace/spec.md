# Feature Specification: Skill Marketplace

**Feature Branch**: `025-skill-marketplace`
**Status**: Draft — blocked on 022 + 024
**Created**: 2026-05-31

## Problem

We need a discoverable retail surface for skills (spec 022) so users can browse, install, rate, and review. Two views:

- **Desktop marketplace tab** — the Skills tab inside Atlas (currently hidden via `FEATURES.skills`)
- **Web marketplace** — `skills.atlas.netgroup.ai`, public, indexable by search engines

Both backed by the same catalogue API.

## Desired behaviour

### Browse experience

- **Categories** — Research, Productivity, Code, Design, Customer support, Creative, ...
- **Featured carousel** — Atlas-curated picks, updated weekly
- **Top by usage / top this week / new**
- **Search** — full-text on title, description, publisher
- **Filters** — free vs paid, by category, by required models, by org tier
- **Trust badges** — "Verified publisher", "Open source", "MFA required"

### Skill detail page

- Title, description, publisher (linked)
- Screenshots / video
- Version history with changelog
- Required permissions surfaced clearly (network hosts, filesystem, models)
- Pricing — free or USD amount
- Rating + reviews (signed-in users only; one review per user per skill)
- "Install" button (desktop deep-link `atlas://install?skill_id=...`)

### Submission

- Publisher dashboard at `publish.atlas.netgroup.ai`
- Upload signed manifest + screenshots
- Atlas review queue (manual at v1; automated checks for capability declarations consistent with included code)
- After approval → live in catalogue

### Org-restricted view

- If signed in as part of an org with an allow list, marketplace hides skills not on the list (with a small "your org's catalogue" note).
- Org admins see all skills with an extra "Add to allow list" button.

## Open questions for /speckit-clarify

1. Public web view default — show all skills (including paid) or only free until sign-in?
2. Review moderation — community-flagged + Atlas staff review, or just Atlas review?
3. Region-locked skills?
4. Skill removal — what happens to existing installs if Atlas pulls a skill from the marketplace? Force-uninstall vs deprecate-but-runnable?
5. Featured slots — paid promotion allowed or Atlas-curated only?

## Dependencies

- Spec 022 — manifest format + signing
- Spec 024 — pricing display
- Spec 021 — org allow/deny list + publisher dashboard within admin console

## Acceptance criteria

- A user browsing without an account sees the marketplace at `skills.atlas.netgroup.ai`.
- Filtering by "free", "models: anthropic", "verified" works.
- Install button on the web triggers `atlas://install?...` deep-link to the desktop.
- Inside Atlas: Skills tab is the same catalogue, filterable. Installing requires confirmation of declared capabilities.
- Publisher submits a skill → review queue → approval → live within minutes.
- Org-restricted view honors the org's allow/deny list.
