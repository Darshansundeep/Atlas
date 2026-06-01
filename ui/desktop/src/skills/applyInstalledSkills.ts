/**
 * Spec 022 v0.4 — runtime hookup.
 *
 * After a new agent session is created, fetch the user's installed skills
 * and push each one's SKILL.md content into the agent's system prompt as
 * a named addendum. The agent then has access to:
 *
 *   1. when_to_use — so it can decide when this skill applies
 *   2. instructions_md — the procedural knowledge
 *   3. examples_md — concrete patterns to follow
 *
 * Idempotent: each skill is registered under key `atlas.skill.<skill_id>`
 * so re-applying after a restart replaces rather than duplicates.
 *
 * Fail-soft: a network error fetching the catalogue, an empty installed
 * list, or a 404 on the extend endpoint never blocks chat creation.
 */

import { client } from '../api/client.gen';
import { authBackendUrl } from '../auth';

interface SkillRow {
  skill_id: string;
  version: string;
  title: string;
  description: string;
  when_to_use?: string | null;
  instructions_md?: string | null;
  examples_md?: string | null;
}

const SKILL_PROMPT_KEY = (skillId: string) => `atlas.skill.${skillId}`;

/**
 * Build the system-prompt fragment Atlas injects for one installed skill.
 * Plain markdown — frontier models all handle this well.
 */
function buildSkillFragment(s: SkillRow): string {
  const parts: string[] = [];
  parts.push(`# Atlas Skill: ${s.title}  (v${s.version})`);
  parts.push(`Skill id: ${s.skill_id}`);
  if (s.description) parts.push(s.description);
  if (s.when_to_use && s.when_to_use.trim()) {
    parts.push('## When to use this skill');
    parts.push(s.when_to_use.trim());
  }
  if (s.instructions_md && s.instructions_md.trim()) {
    parts.push('## Instructions');
    parts.push(s.instructions_md.trim());
  }
  if (s.examples_md && s.examples_md.trim()) {
    parts.push('## Examples');
    parts.push(s.examples_md.trim());
  }
  return parts.join('\n\n');
}

async function fetchAtlasCatalogue(): Promise<SkillRow[]> {
  try {
    const url = `${authBackendUrl()}/v1/skills`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) return [];
    return (await res.json()) as SkillRow[];
  } catch (e) {
    console.warn('[atlas-skills] failed to fetch catalogue:', e);
    return [];
  }
}

async function getInstalledIds(): Promise<string[]> {
  try {
    const ids = await window.electron.getSetting('installedSkillIds');
    return ids ?? [];
  } catch {
    return [];
  }
}

/**
 * Push one skill's SKILL.md into the running agent's system prompt.
 * Returns true if the call succeeded, false on any failure (silent).
 */
async function extendOne(sessionId: string, key: string, instruction: string): Promise<boolean> {
  try {
    const res = await client.post({
      url: '/agent/extend_system_prompt',
      body: { session_id: sessionId, key, instruction },
      throwOnError: false,
    });
    return !!res.response && res.response.ok;
  } catch (e) {
    console.warn('[atlas-skills] extend_system_prompt failed:', e);
    return false;
  }
}

/**
 * Public entrypoint — call right after `startAgent` succeeds.
 * Best-effort: silent on every failure so chat creation is never blocked.
 */
export async function applyInstalledSkillsToSession(sessionId: string): Promise<{
  applied: number;
  skipped: number;
}> {
  const installedIds = await getInstalledIds();
  if (installedIds.length === 0) {
    return { applied: 0, skipped: 0 };
  }
  const catalogue = await fetchAtlasCatalogue();
  if (catalogue.length === 0) {
    // Could not reach Atlas Cloud — running fully offline / BYOK only.
    // The installed list is still local; we just can't load the prose.
    return { applied: 0, skipped: installedIds.length };
  }
  const byId = new Map(catalogue.map((s) => [s.skill_id, s]));
  let applied = 0;
  let skipped = 0;
  for (const id of installedIds) {
    const skill = byId.get(id);
    if (!skill) {
      skipped++;
      continue;
    }
    const fragment = buildSkillFragment(skill);
    const ok = await extendOne(sessionId, SKILL_PROMPT_KEY(id), fragment);
    if (ok) applied++;
    else skipped++;
  }
  if (applied > 0) {
    console.info(`[atlas-skills] applied ${applied} skill(s) to session ${sessionId}`);
  }
  return { applied, skipped };
}
