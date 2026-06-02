/**
 * Spec 022 v0.6 — auto-record skill invocations.
 *
 * The desktop already records install + uninstall events. v0.6 adds a
 * "used" signal: when the agent actually fires a tool during a session
 * where installed skills are active, we bump
 * `POST /v1/skills/:id/used` so the admin's Skills Usage rollup
 * separates "installed but unused" from "actively used".
 *
 * Dedup: once per (sessionId, skillId). A noisy session that fires 50
 * tool calls produces ONE usage event per active skill.
 *
 * Coupling: this is intentionally coarse — it doesn't try to attribute
 * which specific tool maps to which skill (a skill is a bundle of
 * prompt + tools; the agent's choice to use a tool while the skill is
 * in its system prompt is the signal). A finer mapping is v0.6.1
 * territory.
 */

interface SkillRow {
  skill_id: string;
  version: string;
}

interface InstalledRow {
  skill_id: string;
  version: string;
}

const recordedKeys = new Set<string>(); // `${sessionId}|${skillId}`

function recordedKey(sessionId: string, skillId: string): string {
  return `${sessionId}|${skillId}`;
}

async function readInstalledSkillIds(): Promise<Set<string>> {
  try {
    const raw = await window.electron.getSetting('installedSkillIds');
    if (!raw || !Array.isArray(raw)) return new Set();
    return new Set(raw.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

async function fetchCatalogue(): Promise<SkillRow[]> {
  try {
    const backend = backendUrl();
    const res = await fetch(`${backend}/v1/skills`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return [];
    return (await res.json()) as SkillRow[];
  } catch {
    return [];
  }
}

function getAccessToken(): string | null {
  const t = (window as { __atlasAccessToken?: string | null }).__atlasAccessToken;
  return typeof t === 'string' && t.length > 0 ? t : null;
}

function backendUrl(): string {
  return (
    (window as { ATLAS_AUTH_BACKEND_URL?: string }).ATLAS_AUTH_BACKEND_URL ||
    'http://127.0.0.1:8787'
  ).replace(/\/+$/, '');
}

async function postUsage(
  skillId: string,
  version: string,
  sessionId: string,
  accessToken: string
): Promise<void> {
  try {
    await fetch(`${backendUrl()}/v1/skills/${encodeURIComponent(skillId)}/used`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        version,
        trigger_phrase: null,
        context: { source: 'desktop_v0_6', sessionId },
      }),
    });
  } catch {
    // best-effort
  }
}

/**
 * Record a "used" event for every installed skill, once per session.
 * Idempotent: subsequent calls within the same session for the same
 * skill are silent no-ops (recordedKeys set acts as the dedup).
 */
export async function recordSkillsUsageForSession(sessionId: string): Promise<void> {
  const token = getAccessToken();
  if (!token) return;

  const installedIds = await readInstalledSkillIds();
  if (installedIds.size === 0) return;

  const catalogue = await fetchCatalogue();
  if (catalogue.length === 0) return;
  const installedRows: InstalledRow[] = catalogue
    .filter((s) => installedIds.has(s.skill_id))
    .map((s) => ({ skill_id: s.skill_id, version: s.version }));

  await Promise.all(
    installedRows
      .filter((r) => !recordedKeys.has(recordedKey(sessionId, r.skill_id)))
      .map(async (r) => {
        recordedKeys.add(recordedKey(sessionId, r.skill_id));
        await postUsage(r.skill_id, r.version, sessionId, token);
      })
  );
}

/** Test-only — clears the dedup set so smoke tests can re-fire. */
export function _resetSkillsUsageDedup(): void {
  recordedKeys.clear();
}
