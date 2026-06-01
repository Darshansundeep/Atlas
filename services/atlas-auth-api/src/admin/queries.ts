/**
 * Admin-panel queries. Spec 002 + early scaffold for spec 021-admin-console.
 *
 * Read-only views layered on the existing tables. No new schema.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';

// Local alias so we can use a `crypto.randomUUID()`-style call where the
// surrounding helpers expect a namespaced reference.
const crypto = { randomUUID };

export interface AdminUserRow {
  id: string;
  email: string;
  display_name: string | null;
  picture_url: string | null;
  created_at: string;
  tier: 'free' | 'pro' | 'team' | 'enterprise';
  monthly_tokens_used: number;
  monthly_token_quota: number | null;
  active_sessions: number;
  last_activity_at: string | null;
}

export async function listUsers(pool: pg.Pool, limit = 200): Promise<AdminUserRow[]> {
  const { rows } = await pool.query<AdminUserRow>(
    `
    SELECT
      u.id,
      u.email,
      u.display_name,
      u.picture_url,
      u.created_at,
      COALESCE(s.tier, 'free') AS tier,
      COALESCE(s.monthly_tokens_used, 0) AS monthly_tokens_used,
      s.monthly_token_quota,
      (SELECT COUNT(*) FROM refresh_tokens rt
        WHERE rt.user_id = u.id AND rt.revoked_at IS NULL)::int AS active_sessions,
      (SELECT MAX(occurred_at) FROM audit_events ae WHERE ae.user_id = u.id) AS last_activity_at
    FROM users u
    LEFT JOIN subscription_state s ON s.user_id = u.id
    ORDER BY u.created_at DESC
    LIMIT $1
    `,
    [limit]
  );
  return rows;
}

export interface AdminSessionRow {
  id: string;
  user_id: string;
  user_email: string;
  device_install_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  rotated_to_id: string | null;
}

export async function listActiveSessions(
  pool: pg.Pool,
  limit = 200
): Promise<AdminSessionRow[]> {
  const { rows } = await pool.query<AdminSessionRow>(
    `
    SELECT
      rt.id,
      rt.user_id,
      u.email AS user_email,
      rt.device_install_id,
      rt.created_at,
      rt.expires_at,
      rt.revoked_at,
      rt.rotated_to_id
    FROM refresh_tokens rt
    JOIN users u ON u.id = rt.user_id
    WHERE rt.revoked_at IS NULL AND rt.expires_at > NOW()
    ORDER BY rt.created_at DESC
    LIMIT $1
    `,
    [limit]
  );
  return rows;
}

export interface AdminAuditRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  event_type: string;
  error_code: string | null;
  occurred_at: string;
}

export async function listAuditEvents(pool: pg.Pool, limit = 200): Promise<AdminAuditRow[]> {
  const { rows } = await pool.query<AdminAuditRow>(
    `
    SELECT
      ae.id,
      ae.user_id,
      u.email AS user_email,
      ae.event_type,
      ae.error_code,
      ae.occurred_at
    FROM audit_events ae
    LEFT JOIN users u ON u.id = ae.user_id
    ORDER BY ae.occurred_at DESC
    LIMIT $1
    `,
    [limit]
  );
  return rows;
}

export interface AdminStats {
  total_users: number;
  signups_today: number;
  signins_today: number;
  active_sessions: number;
  theft_events_week: number;
}

export async function getStats(pool: pg.Pool): Promise<AdminStats> {
  const { rows } = await pool.query<AdminStats>(
    `
    SELECT
      (SELECT COUNT(*) FROM users)::int AS total_users,
      (SELECT COUNT(*) FROM users WHERE created_at > NOW() - interval '24 hours')::int AS signups_today,
      (SELECT COUNT(*) FROM audit_events WHERE event_type = 'sign_in_success'
         AND occurred_at > NOW() - interval '24 hours')::int AS signins_today,
      (SELECT COUNT(*) FROM refresh_tokens
         WHERE revoked_at IS NULL AND expires_at > NOW())::int AS active_sessions,
      (SELECT COUNT(*) FROM audit_events WHERE event_type = 'token_theft_suspected'
         AND occurred_at > NOW() - interval '7 days')::int AS theft_events_week
    `
  );
  return rows[0];
}

export async function revokeAllForUserAdmin(pool: pg.Pool, userId: string): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE refresh_tokens
        SET revoked_at = NOW()
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
  return rowCount ?? 0;
}

export async function setUserTier(
  pool: pg.Pool,
  userId: string,
  tier: 'free' | 'pro' | 'team' | 'enterprise'
): Promise<void> {
  await pool.query(
    `INSERT INTO subscription_state (user_id, tier, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET tier = EXCLUDED.tier, updated_at = NOW()`,
    [userId, tier]
  );
}

// ----- Spec 011: model catalogue ----------------------------------------

export interface CatalogueRow {
  provider: string;
  model: string;
  display_name: string | null;
  input_per_million: string;   // numeric → string via pg
  output_per_million: string;
  context_window: number | null;
  capabilities: string[];
  currency: string;
  deprecated: boolean;
  notes: string | null;
  updated_at: string;
}

export async function listCatalogue(pool: pg.Pool): Promise<CatalogueRow[]> {
  const { rows } = await pool.query<CatalogueRow>(
    `SELECT provider, model, display_name,
            input_per_million::text, output_per_million::text,
            context_window, capabilities, currency, deprecated, notes, updated_at
       FROM model_catalogue
       ORDER BY deprecated ASC, provider ASC, model ASC`
  );
  return rows;
}

export interface CatalogueUpsert {
  provider: string;
  model: string;
  display_name?: string | null;
  input_per_million?: number;
  output_per_million?: number;
  context_window?: number | null;
  capabilities?: string[];
  deprecated?: boolean;
  notes?: string | null;
}

export async function upsertCatalogue(pool: pg.Pool, row: CatalogueUpsert): Promise<void> {
  await pool.query(
    `INSERT INTO model_catalogue
       (provider, model, display_name, input_per_million, output_per_million,
        context_window, capabilities, deprecated, notes, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9, NOW())
     ON CONFLICT (provider, model) DO UPDATE SET
       display_name       = COALESCE(EXCLUDED.display_name, model_catalogue.display_name),
       input_per_million  = COALESCE(EXCLUDED.input_per_million, model_catalogue.input_per_million),
       output_per_million = COALESCE(EXCLUDED.output_per_million, model_catalogue.output_per_million),
       context_window     = COALESCE(EXCLUDED.context_window, model_catalogue.context_window),
       capabilities       = COALESCE(EXCLUDED.capabilities, model_catalogue.capabilities),
       deprecated         = COALESCE(EXCLUDED.deprecated, model_catalogue.deprecated),
       notes              = COALESCE(EXCLUDED.notes, model_catalogue.notes),
       updated_at         = NOW()`,
    [
      row.provider.toLowerCase(),
      row.model,
      row.display_name ?? null,
      row.input_per_million ?? 0,
      row.output_per_million ?? 0,
      row.context_window ?? null,
      JSON.stringify(row.capabilities ?? []),
      row.deprecated ?? false,
      row.notes ?? null,
    ]
  );
}

export async function deleteCatalogue(pool: pg.Pool, provider: string, model: string): Promise<void> {
  await pool.query(
    `DELETE FROM model_catalogue WHERE provider = $1 AND model = $2`,
    [provider.toLowerCase(), model]
  );
}

// ----- Spec 022 v0.1: skills catalogue ----------------------------------

export interface SkillRow {
  skill_id: string;
  version: string;
  title: string;
  description: string;
  category: string;
  publisher_name: string;
  publisher_verified: boolean;
  kind: 'extension' | 'recipe' | 'composite';
  manifest: Record<string, unknown>;
  capabilities: string[];
  pricing_tier_min: 'free' | 'pro' | 'team' | 'enterprise';
  deprecated: boolean;
  /** Spec 022 v0.3 — SKILL.md content. */
  when_to_use: string | null;
  instructions_md: string | null;
  examples_md: string | null;
  supporting_files: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export async function listSkills(pool: pg.Pool): Promise<SkillRow[]> {
  const { rows } = await pool.query<SkillRow>(
    `SELECT skill_id, version, title, description, category,
            publisher_name, publisher_verified, kind, manifest,
            capabilities, pricing_tier_min, deprecated,
            when_to_use, instructions_md, examples_md, supporting_files,
            created_at, updated_at
       FROM skills_catalogue
       ORDER BY deprecated ASC, publisher_verified DESC, title ASC`
  );
  return rows;
}

export interface SkillUpsert {
  skill_id: string;
  version: string;
  title: string;
  description: string;
  category?: string;
  publisher_name: string;
  publisher_verified?: boolean;
  kind: 'extension' | 'recipe' | 'composite';
  manifest: Record<string, unknown>;
  capabilities?: string[];
  pricing_tier_min?: 'free' | 'pro' | 'team' | 'enterprise';
  deprecated?: boolean;
  /** Spec 022 v0.3 — SKILL.md content. */
  when_to_use?: string | null;
  instructions_md?: string | null;
  examples_md?: string | null;
  supporting_files?: Record<string, string>;
}

export async function upsertSkill(pool: pg.Pool, s: SkillUpsert): Promise<void> {
  await pool.query(
    `INSERT INTO skills_catalogue
       (skill_id, version, title, description, category, publisher_name,
        publisher_verified, kind, manifest, capabilities, pricing_tier_min,
        deprecated, when_to_use, instructions_md, examples_md, supporting_files,
        updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16::jsonb,NOW())
     ON CONFLICT (skill_id) DO UPDATE SET
       version            = EXCLUDED.version,
       title              = EXCLUDED.title,
       description        = EXCLUDED.description,
       category           = EXCLUDED.category,
       publisher_name     = EXCLUDED.publisher_name,
       publisher_verified = EXCLUDED.publisher_verified,
       kind               = EXCLUDED.kind,
       manifest           = EXCLUDED.manifest,
       capabilities       = EXCLUDED.capabilities,
       pricing_tier_min   = EXCLUDED.pricing_tier_min,
       deprecated         = EXCLUDED.deprecated,
       when_to_use        = EXCLUDED.when_to_use,
       instructions_md    = EXCLUDED.instructions_md,
       examples_md        = EXCLUDED.examples_md,
       supporting_files   = EXCLUDED.supporting_files,
       updated_at         = NOW()`,
    [
      s.skill_id,
      s.version,
      s.title,
      s.description,
      s.category ?? 'general',
      s.publisher_name,
      s.publisher_verified ?? false,
      s.kind,
      JSON.stringify(s.manifest),
      JSON.stringify(s.capabilities ?? []),
      s.pricing_tier_min ?? 'free',
      s.deprecated ?? false,
      s.when_to_use ?? null,
      s.instructions_md ?? null,
      s.examples_md ?? null,
      JSON.stringify(s.supporting_files ?? {}),
    ]
  );
}

export async function deleteSkill(pool: pg.Pool, skillId: string): Promise<void> {
  await pool.query(`DELETE FROM skills_catalogue WHERE skill_id = $1`, [skillId]);
}

// ----- Spec 022 v0.2: skill versioning ---------------------------------

export interface SkillVersionRow {
  skill_id: string;
  version: string;
  title: string;
  description: string;
  category: string;
  publisher_name: string;
  publisher_verified: boolean;
  kind: 'extension' | 'recipe' | 'composite';
  manifest: Record<string, unknown>;
  capabilities: string[];
  pricing_tier_min: 'free' | 'pro' | 'team' | 'enterprise';
  when_to_use: string | null;
  instructions_md: string | null;
  examples_md: string | null;
  supporting_files: Record<string, string>;
  changelog: string | null;
  published_at: string;
}

export async function listSkillVersions(pool: pg.Pool, skillId: string): Promise<SkillVersionRow[]> {
  const { rows } = await pool.query<SkillVersionRow>(
    `SELECT skill_id, version, title, description, category,
            publisher_name, publisher_verified, kind, manifest,
            capabilities, pricing_tier_min,
            when_to_use, instructions_md, examples_md, supporting_files,
            changelog, published_at
       FROM skill_versions
      WHERE skill_id = $1
      ORDER BY published_at DESC`,
    [skillId]
  );
  return rows;
}

/**
 * Save edits to the existing current version in place — for typo fixes,
 * description tweaks, or category re-tagging. Does NOT create a new
 * history entry. The version string is not allowed to change.
 */
export async function saveSkillInPlace(pool: pg.Pool, s: SkillUpsert): Promise<{ ok: true } | { ok: false; error: string }> {
  // Confirm skill exists and version matches what's currently current.
  const { rows } = await pool.query<{ version: string }>(
    `SELECT version FROM skills_catalogue WHERE skill_id = $1`,
    [s.skill_id]
  );
  if (rows.length === 0) {
    return { ok: false, error: 'skill_not_found' };
  }
  if (rows[0].version !== s.version) {
    return { ok: false, error: 'version_mismatch_use_publish' };
  }
  await pool.query(
    `UPDATE skills_catalogue
        SET title = $2,
            description = $3,
            category = $4,
            publisher_name = $5,
            publisher_verified = $6,
            kind = $7,
            manifest = $8::jsonb,
            capabilities = $9::jsonb,
            pricing_tier_min = $10,
            deprecated = $11,
            when_to_use = $12,
            instructions_md = $13,
            examples_md = $14,
            supporting_files = $15::jsonb,
            updated_at = NOW()
      WHERE skill_id = $1`,
    [
      s.skill_id,
      s.title,
      s.description,
      s.category ?? 'general',
      s.publisher_name,
      s.publisher_verified ?? false,
      s.kind,
      JSON.stringify(s.manifest),
      JSON.stringify(s.capabilities ?? []),
      s.pricing_tier_min ?? 'free',
      s.deprecated ?? false,
      s.when_to_use ?? null,
      s.instructions_md ?? null,
      s.examples_md ?? null,
      JSON.stringify(s.supporting_files ?? {}),
    ]
  );
  // Also patch the matching skill_versions row so the history stays
  // in sync with the current row's metadata.
  await pool.query(
    `UPDATE skill_versions
        SET title = $3,
            description = $4,
            category = $5,
            publisher_name = $6,
            publisher_verified = $7,
            kind = $8,
            manifest = $9::jsonb,
            capabilities = $10::jsonb,
            pricing_tier_min = $11,
            when_to_use = $12,
            instructions_md = $13,
            examples_md = $14,
            supporting_files = $15::jsonb
      WHERE skill_id = $1 AND version = $2`,
    [
      s.skill_id,
      s.version,
      s.title,
      s.description,
      s.category ?? 'general',
      s.publisher_name,
      s.publisher_verified ?? false,
      s.kind,
      JSON.stringify(s.manifest),
      JSON.stringify(s.capabilities ?? []),
      s.pricing_tier_min ?? 'free',
      s.when_to_use ?? null,
      s.instructions_md ?? null,
      s.examples_md ?? null,
      JSON.stringify(s.supporting_files ?? {}),
    ]
  );
  return { ok: true };
}

/**
 * Publish a NEW version of a skill. The new version must not collide
 * with any existing version in `skill_versions`. The previous current
 * version is preserved in history.
 *
 * On first-publish (no existing row), this creates BOTH the catalogue
 * row and the first version history entry.
 */
export async function publishNewSkillVersion(
  pool: pg.Pool,
  s: SkillUpsert & { changelog?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Reject re-using a version that already exists in history.
  const existing = await pool.query<{ version: string }>(
    `SELECT version FROM skill_versions WHERE skill_id = $1 AND version = $2`,
    [s.skill_id, s.version]
  );
  if (existing.rows.length > 0) {
    return { ok: false, error: 'version_already_published' };
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Upsert into the catalogue (this is the new "current").
    await client.query(
      `INSERT INTO skills_catalogue
         (skill_id, version, title, description, category, publisher_name,
          publisher_verified, kind, manifest, capabilities, pricing_tier_min,
          deprecated, when_to_use, instructions_md, examples_md, supporting_files,
          updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16::jsonb,NOW())
       ON CONFLICT (skill_id) DO UPDATE SET
         version            = EXCLUDED.version,
         title              = EXCLUDED.title,
         description        = EXCLUDED.description,
         category           = EXCLUDED.category,
         publisher_name     = EXCLUDED.publisher_name,
         publisher_verified = EXCLUDED.publisher_verified,
         kind               = EXCLUDED.kind,
         manifest           = EXCLUDED.manifest,
         capabilities       = EXCLUDED.capabilities,
         pricing_tier_min   = EXCLUDED.pricing_tier_min,
         deprecated         = EXCLUDED.deprecated,
         when_to_use        = EXCLUDED.when_to_use,
         instructions_md    = EXCLUDED.instructions_md,
         examples_md        = EXCLUDED.examples_md,
         supporting_files   = EXCLUDED.supporting_files,
         updated_at         = NOW()`,
      [
        s.skill_id,
        s.version,
        s.title,
        s.description,
        s.category ?? 'general',
        s.publisher_name,
        s.publisher_verified ?? false,
        s.kind,
        JSON.stringify(s.manifest),
        JSON.stringify(s.capabilities ?? []),
        s.pricing_tier_min ?? 'free',
        s.deprecated ?? false,
        s.when_to_use ?? null,
        s.instructions_md ?? null,
        s.examples_md ?? null,
        JSON.stringify(s.supporting_files ?? {}),
      ]
    );
    // Append the version-history entry.
    await client.query(
      `INSERT INTO skill_versions
         (skill_id, version, title, description, category, publisher_name,
          publisher_verified, kind, manifest, capabilities, pricing_tier_min,
          when_to_use, instructions_md, examples_md, supporting_files, changelog)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15::jsonb,$16)`,
      [
        s.skill_id,
        s.version,
        s.title,
        s.description,
        s.category ?? 'general',
        s.publisher_name,
        s.publisher_verified ?? false,
        s.kind,
        JSON.stringify(s.manifest),
        JSON.stringify(s.capabilities ?? []),
        s.pricing_tier_min ?? 'free',
        s.when_to_use ?? null,
        s.instructions_md ?? null,
        s.examples_md ?? null,
        JSON.stringify(s.supporting_files ?? {}),
        s.changelog ?? null,
      ]
    );
    await client.query('COMMIT');
    return { ok: true };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Roll the catalogue back to a previously-published version. The
 * historical row stays in skill_versions; the catalogue row is rewritten
 * to mirror the chosen version. NO new history entry is created.
 */
// ----- Spec 022 v0.5: telemetry queries --------------------------------

export async function recordInstall(
  pool: pg.Pool,
  userId: string,
  skillId: string,
  version: string,
  deviceInstallId?: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO skill_installations
       (user_id, skill_id, installed_version, device_install_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, skill_id) DO UPDATE
       SET installed_version = EXCLUDED.installed_version,
           device_install_id = EXCLUDED.device_install_id,
           installed_at      = NOW()`,
    [userId, skillId, version, deviceInstallId ?? null]
  );
}

export async function recordUninstall(
  pool: pg.Pool,
  userId: string,
  skillId: string
): Promise<void> {
  await pool.query(
    `DELETE FROM skill_installations WHERE user_id = $1 AND skill_id = $2`,
    [userId, skillId]
  );
}

export async function recordUsage(
  pool: pg.Pool,
  userId: string,
  skillId: string,
  version: string,
  triggerPhrase: string | null,
  deviceInstallId: string | null,
  context: Record<string, unknown> | null
): Promise<void> {
  const eventId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO skill_usage_events
       (id, user_id, skill_id, version, trigger_phrase, device_install_id, context)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [eventId, userId, skillId, version, triggerPhrase, deviceInstallId, JSON.stringify(context ?? {})]
  );
  // Also update the installation row's running totals.
  await pool.query(
    `UPDATE skill_installations
        SET last_used_at = NOW(),
            invocation_count = invocation_count + 1
      WHERE user_id = $1 AND skill_id = $2`,
    [userId, skillId]
  );
}

export interface SkillInstallationRow {
  user_id: string;
  user_email: string;
  user_display_name: string | null;
  skill_id: string;
  installed_version: string;
  installed_at: string;
  last_used_at: string | null;
  invocation_count: number;
}

export async function listInstallationsForSkill(
  pool: pg.Pool,
  skillId: string,
  limit = 200
): Promise<SkillInstallationRow[]> {
  const { rows } = await pool.query<SkillInstallationRow>(
    `SELECT i.user_id, u.email AS user_email, u.display_name AS user_display_name,
            i.skill_id, i.installed_version, i.installed_at, i.last_used_at,
            i.invocation_count
       FROM skill_installations i
       JOIN users u ON u.id = i.user_id
      WHERE i.skill_id = $1
      ORDER BY i.last_used_at DESC NULLS LAST, i.installed_at DESC
      LIMIT $2`,
    [skillId, limit]
  );
  return rows;
}

export interface SkillUsageEventRow {
  id: string;
  user_id: string;
  user_email: string;
  skill_id: string;
  version: string;
  occurred_at: string;
  trigger_phrase: string | null;
  context: Record<string, unknown>;
}

export async function listUsageForSkill(
  pool: pg.Pool,
  skillId: string,
  limit = 200
): Promise<SkillUsageEventRow[]> {
  const { rows } = await pool.query<SkillUsageEventRow>(
    `SELECT e.id, e.user_id, u.email AS user_email, e.skill_id, e.version,
            e.occurred_at, e.trigger_phrase, e.context
       FROM skill_usage_events e
       JOIN users u ON u.id = e.user_id
      WHERE e.skill_id = $1
      ORDER BY e.occurred_at DESC
      LIMIT $2`,
    [skillId, limit]
  );
  return rows;
}

export interface SkillSummaryRow {
  skill_id: string;
  installs: number;
  invocations: number;
  last_used_at: string | null;
}

export async function getSkillUsageSummary(pool: pg.Pool): Promise<SkillSummaryRow[]> {
  const { rows } = await pool.query<SkillSummaryRow>(
    `SELECT c.skill_id,
            COALESCE(i_counts.installs, 0)::int      AS installs,
            COALESCE(e_counts.invocations, 0)::int   AS invocations,
            i_counts.last_used_at
       FROM skills_catalogue c
       LEFT JOIN (
         SELECT skill_id, COUNT(*)::int AS installs, MAX(last_used_at) AS last_used_at
           FROM skill_installations
          GROUP BY skill_id
       ) i_counts ON i_counts.skill_id = c.skill_id
       LEFT JOIN (
         SELECT skill_id, COUNT(*)::int AS invocations
           FROM skill_usage_events
          GROUP BY skill_id
       ) e_counts ON e_counts.skill_id = c.skill_id
      ORDER BY invocations DESC, installs DESC`
  );
  return rows;
}

export interface UserSkillRow {
  skill_id: string;
  skill_title: string;
  installed_version: string;
  installed_at: string;
  last_used_at: string | null;
  invocation_count: number;
}

export async function listSkillsForUser(
  pool: pg.Pool,
  userId: string
): Promise<UserSkillRow[]> {
  const { rows } = await pool.query<UserSkillRow>(
    `SELECT i.skill_id, c.title AS skill_title, i.installed_version,
            i.installed_at, i.last_used_at, i.invocation_count
       FROM skill_installations i
       JOIN skills_catalogue c ON c.skill_id = i.skill_id
      WHERE i.user_id = $1
      ORDER BY i.last_used_at DESC NULLS LAST, i.installed_at DESC`,
    [userId]
  );
  return rows;
}

export async function rollbackSkillToVersion(
  pool: pg.Pool,
  skillId: string,
  version: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { rows } = await pool.query<SkillVersionRow>(
    `SELECT * FROM skill_versions WHERE skill_id = $1 AND version = $2`,
    [skillId, version]
  );
  if (rows.length === 0) return { ok: false, error: 'version_not_found' };
  const v = rows[0];
  await pool.query(
    `UPDATE skills_catalogue
        SET version = $2,
            title = $3,
            description = $4,
            category = $5,
            publisher_name = $6,
            publisher_verified = $7,
            kind = $8,
            manifest = $9::jsonb,
            capabilities = $10::jsonb,
            pricing_tier_min = $11,
            when_to_use = $12,
            instructions_md = $13,
            examples_md = $14,
            supporting_files = $15::jsonb,
            updated_at = NOW()
      WHERE skill_id = $1`,
    [
      skillId,
      v.version,
      v.title,
      v.description,
      v.category,
      v.publisher_name,
      v.publisher_verified,
      v.kind,
      JSON.stringify(v.manifest),
      JSON.stringify(v.capabilities),
      v.pricing_tier_min,
      v.when_to_use,
      v.instructions_md,
      v.examples_md,
      JSON.stringify(v.supporting_files ?? {}),
    ]
  );
  return { ok: true };
}
