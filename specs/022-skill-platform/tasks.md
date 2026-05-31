# Tasks: 022-skill-platform

**Branch**: 001-rebrand-pass
**Status**: v0.1 + v0.2 shipped; v0.3 pending (runtime hookup)

---

## Phase 1 — v0.1: Catalogue + browse (SHIPPED)

- [X] T101 Postgres skills_catalogue table + seed-skills.sql with 6 skills
- [X] T102 Admin queries.ts: listSkills / upsertSkill / deleteSkill
- [X] T103 Admin routes: GET / POST / DELETE /admin/v1/skills
- [X] T104 Public GET /v1/skills (no Bearer, 60s cache)
- [X] T105 Admin panel Skills tab UI (table + publish form)
- [X] T106 FEATURES.skills = true
- [X] T107 Desktop AtlasSkillsView — grid + filters + detail modal
- [X] T108 Local installedSkillIds in settings; install/uninstall toggles it
- [X] T109 Tier-locking based on user.sub_tier vs pricing_tier_min
- [X] T110 EmptyIllustration variant=skills

## Phase 2 — v0.2: Versioning + editing (SHIPPED)

- [X] T201 skill_versions table + backfill in seed
- [X] T202 publishNewSkillVersion (transactional; 409 on version collision)
- [X] T203 saveSkillInPlace (UPDATE current + matching history row)
- [X] T204 rollbackSkillToVersion
- [X] T205 listSkillVersions
- [X] T206 PUT /admin/v1/skills/:id
- [X] T207 GET /admin/v1/skills/:id/versions
- [X] T208 POST /admin/v1/skills/:id/rollback/:version
- [X] T209 Admin UI: Edit / Save-in-place / Publish-new-version / Cancel
- [X] T210 Admin UI: Version history modal with rollback button

## Phase 3 — v0.3: Runtime hookup (NEXT — recommended pickup #1)

This is the missing piece between "user clicks Install" and "the skill
actually does something in the next chat". Today install is presentation
only — `installedSkillIds` is a local flag with no runtime consequence.

- [ ] T301 Define the install → goosed-extension flow.
  - Read the installed skill's `manifest.extensions[]`.
  - Each entry maps to a goosed `addExtension` call (or the equivalent
    on whatever the current Goose extension API is — check
    `crates/goose/` and the relevant MCP server interface).
  - Decide: do we add at install time, or lazy-load on next chat?
  - Decide: how do we display the resulting tools in the existing
    "extension count" badge (currently hidden via FEATURES flag)?

- [ ] T302 Wire the install action.
  - In AtlasSkillsView.install(), after persisting installedSkillIds,
    call into the desktop's existing extension-add code path. The IPC
    bridge likely already exists for the upstream "Add extension by URL"
    flow — find it and reuse.
  - Handle install failures: if the extension can't be added, surface
    a toast and roll back the installedSkillIds entry.

- [ ] T303 Wire the uninstall action.
  - On uninstall, call the corresponding extension-remove path.
  - Must be idempotent: if the extension was already removed externally,
    uninstall still cleans up the installedSkillIds entry.

- [ ] T304 Handle composite skills (extensions + recipe).
  - For `kind: "composite"` skills, install does both: add the
    extensions AND register the recipe. (Recipe handling already exists
    in upstream goose-cli; the desktop has a Recipes view.)

- [ ] T305 Handle pure-recipe skills.
  - For `kind: "recipe"`, no MCP install needed. Just register the
    recipe under the user's recipe set so it surfaces in the existing
    Recipes view.

- [ ] T306 Display installed skills in the chat surface.
  - Today there's an "extension count" badge gated by
    `FEATURES.extensionCountBadge: false`. Consider a separate "Active
    skills" indicator that shows in the chat input footer when at least
    one skill is installed.

- [ ] T307 Test: install Web Research → next chat has web fetch tool
  available → ask "what's at example.com" and it works.

- [ ] T308 Test: uninstall Web Research → next chat doesn't have web
  fetch available.

- [ ] T309 Test: tier-locked skill — Pro skill won't actually be
  installable while user is on Free tier. (Today the UI shows
  "Upgrade" but the API doesn't enforce. Add a server-side check OR
  enforce in the desktop with a tier verifier.)

- [ ] T310 Test: re-install after relaunch — `installedSkillIds`
  re-hydrates the runtime extensions.

## Phase 4 — v0.4: Manifest signing (DEFERRED)

- [ ] T401 ed25519 keypair generation utility for publishers
- [ ] T402 Atlas root key (offline cold-storage) + intermediate signing
- [ ] T403 Manifest field `signature: "ed25519:<base64>"`
- [ ] T404 Desktop verifies signature before install
- [ ] T405 Verification chain: publisher → Atlas intermediate → root
- [ ] T406 Unsigned skills: install allowed in personal accounts with
       prominent warning; blocked in org-policy mode

## Phase 5 — v0.5: Per-org allow/deny lists (DEFERRED — waits on 021)

- [ ] T501 orgs schema + org_skill_policies table
- [ ] T502 Org admin UI for allow/deny lists
- [ ] T503 JWT claim carries org_id (already in 002 design)
- [ ] T504 Desktop fetches policy on sign-in, refreshes on push
- [ ] T505 Install button respects the policy

---

## Implementation notes for tomorrow

### Where to look in the codebase

- **Goose extension API**:
  - `crates/goose/src/agents/extension.rs` — extension trait
  - `crates/goose-server/src/routes/extensions.rs` — HTTP add/remove
  - `ui/desktop/src/api/sdk.gen.ts` — `addExtension`, `removeExtension`
- **Recipe registration**:
  - `ui/desktop/src/components/recipes/` — existing UI surface
  - `crates/goose/src/recipe/` — recipe model
- **Existing install code path** (upstream):
  - "Add extension by URL" lives in
    `ui/desktop/src/components/settings/extensions/`. Reuse the IPC +
    API call from there.

### Open design questions

1. Lazy install vs eager install? Eager is simpler but means a stale
   skill (e.g. the publisher took the extension offline) breaks Atlas
   start-up. Lazy delays the failure to first-use.
2. Should "uninstall" remove the underlying extension if the user had
   manually added it via the upstream UI? Probably no — keep skills and
   raw-added extensions in separate namespaces.
3. Composite skills need to register both an extension AND a recipe —
   should they be atomic (both succeed or both fail)?

### Acceptance criteria

- Installing `ai.netgroup.atlas.web-research` from the Skills tab
  results in `fetch_web_url` (or whatever tool name the extension
  declares) being callable in the next chat.
- Uninstall removes the tool from the next chat.
- The install action is idempotent — clicking twice doesn't double-add.
- Relaunching Atlas re-applies all installed skills before the user's
  first chat.

### Estimate

~1.5-2 hours of focused work for T301-T310. Most of the time is
understanding the existing extension/recipe APIs and wiring; the new
code is small.
