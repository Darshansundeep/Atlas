# Feature Specification: Skill Platform — Governance + Per-Org Enablement

**Feature Branch**: `022-skill-platform`
**Status**: v0.1–v0.5 shipped. v0.6 (goosed-side invocation telemetry) and v0.7 (bridge to Goose's built-in `~/.agents/skills/` mechanism) queued.
**Created**: 2026-05-31
**Last updated**: 2026-06-02

## Implementation status — 2026-06-02

| Version | What | Shipped? |
|---|---|---|
| **v0.1** | skills_catalogue table + 6 seeds + admin CRUD + desktop browse + install/uninstall toggle | ✅ |
| **v0.2** | skill_versions table + Edit / Save-in-place / Publish-new-version / version history modal / rollback | ✅ |
| **v0.3** | **SKILL.md content model** — `instructions_md` / `when_to_use` / `examples_md` / `supporting_files` columns on catalogue + versions; admin UI three-prose-textarea editor; SKILL.md status pill; backfill of historical version rows; full agentskills.io-style prose rewritten for all 6 seeded skills | ✅ |
| **v0.4** | **Runtime hookup** — desktop calls `POST /agent/extend_system_prompt` (new goosed route) for each installed skill on session start + on resume, injecting Title/when_to_use/instructions_md/examples_md as a system fragment keyed `atlas.skill.<id>` (idempotent) | ✅ |
| **v0.5** | **Install / usage telemetry** — `skill_installations` + `skill_usage_events` tables; bearer-authed public endpoints `POST /v1/skills/:id/install /uninstall /used`; admin views: Skills Usage summary, per-skill installations, per-skill usage history, per-user skills list | ✅ |
| v0.6 | **Goosed-side invocation tracking** — desktop POSTs `/v1/skills/:id/used` automatically when an installed skill's tools/prompts run, not only on manual trigger | ⏳ |
| v0.7 | **Bridge to Goose's built-in Skills mechanism** — instead of (or in addition to) the custom `extend_system_prompt` injection, write each installed skill's bundle to `~/.agents/skills/<skill_id>/SKILL.md` so Goose's native Skills platform extension auto-loads it per agentskills.io spec. Deferred until current v0.4/v0.5 are validated in the field. See [project_atlas_skills_v07](../../../.claude/.../project_atlas_skills_v07.md) memory. | ⏳ |
| v0.8 | ed25519 manifest signing + verification chain | ⏳ |
| v0.9 | Per-org allow/deny lists (waits on 021 orgs) | ⏳ |

See [`tasks.md`](tasks.md) for the full task list with file pointers
and acceptance criteria. v0.6 + v0.7 are next pickups.

## Problem

Atlas inherits Goose's extension + recipe system. The unit a user installs in the desktop is currently called an "Extension" (MCP server) or a "Recipe" (parameterised flow). Atlas needs:

- **A unified concept** ("Skill") that wraps both extensions and recipes under one mental model.
- **Org governance**: org admins decide which skills their users can install and which models a skill is allowed to call.
- **Discovery**: where do new skills come from? (Today, extensions are added by URL or `--with-extension` flag — not browsable.)
- **Trust**: signed manifests, source provenance, capability declaration.

Without this, Atlas can't ship the enterprise-tier governance pitch and the BYOK / installer-link story stays the same as upstream Goose.

## Desired behaviour

### What is a Skill?

A **Skill** is a versioned bundle that ships ONE of:
- An MCP extension (one or more tools)
- A recipe (parameterised prompt + tool chain)
- A composite (recipe that depends on declared extensions)

Each Skill has:
- A unique `skill_id` (reverse-DNS: `ai.netgroup.atlas.web-research`)
- A semver version
- A signed manifest (JSON; fields below)
- A capability declaration (which models, which OS resources, which side-effects)
- An author / publisher
- A category (e.g. "Web research", "Code review", "Customer support")

### Manifest shape (sketch)

```json
{
  "skill_id": "ai.netgroup.atlas.web-research",
  "version": "1.4.2",
  "publisher": { "name": "NET Group", "verified": true, "url": "https://netgroup.ai" },
  "title": "Web Research",
  "description": "Multi-source web search with citation extraction.",
  "category": "research",
  "kind": "composite",
  "extensions": [{ "ref": "@atlas/extension-fetch@^2", "config": {} }],
  "recipe": { "..." : "..." },
  "capabilities": {
    "models": ["anthropic/*", "openai/*"],
    "network": ["https://*"],
    "filesystem": "read-only"
  },
  "pricing": { "tier_min": "free", "atlas_credits_per_invocation": 0 },
  "signature": "ed25519:..."
}
```

### Org governance

- Org owners set:
  - **Allow list** — only these skills can be installed
  - **Deny list** — these skills are blocked regardless of marketplace presence
  - **Require approval** — admin must approve each install request
  - **Capability caps** — e.g. "no skills that touch the filesystem"
- The desktop fetches the org's policy on sign-in (cached, refreshed on push) and the install button shows the right state.

### Trust

- Skills published to the Atlas marketplace are signed by the publisher and counter-signed by Atlas after a manual review pass.
- Desktop verifies the chain before install.
- "Unsigned" skills can still be installed in personal accounts but show a prominent warning.

### Discovery

- The Skills tab (currently hidden via `FEATURES.skills`) becomes the in-app marketplace browser when this spec ships.
- The web at `skills.atlas.netgroup.ai` is the same catalogue, browsable without sign-in.

## Open questions for /speckit-clarify

1. Skill ID namespace — Atlas-managed (we assign) or first-come-first-served (publisher claims)?
2. Verification process for "verified publisher" — manual review of company identity (similar to Apple Developer)?
3. Pricing in the manifest — is this advisory, or enforced by the proxy (spec 003 + spec 024)?
4. Versioning — auto-update opt-in, or always pinned to the version installed?
5. Sandboxing — do we run skills in isolated processes or rely on MCP's existing process model?
6. Skill removal — when an org adds a skill to the deny list, do we uninstall on next sign-in or block invocation at runtime?

## Dependencies

- Spec 002 (cloud auth) — JWT carries `org_id` to enforce policy
- Spec 003 (LLM proxy) — capability enforcement at the model layer
- Spec 011 (model catalogue) — pricing entries for skills with `atlas_credits_per_invocation`
- Spec 021 (admin console) — org-admin UI for the allow/deny lists

## Acceptance criteria

- A signed skill manifest installs from the desktop marketplace browser in one click.
- An org admin denies a skill and members trying to install it see "Blocked by your org admin".
- Capability declarations are surfaced to the user at install time ("This skill can read your filesystem").
- Unsigned-skill installs require a confirmation flow.
- A skill update prompts the user (or auto-installs based on org policy).
