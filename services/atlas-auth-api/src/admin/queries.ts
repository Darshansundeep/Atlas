/**
 * Admin-panel queries. Spec 002 + early scaffold for spec 021-admin-console.
 *
 * Read-only views layered on the existing tables. No new schema.
 */

import type pg from 'pg';

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
  created_at: string;
  updated_at: string;
}

export async function listSkills(pool: pg.Pool): Promise<SkillRow[]> {
  const { rows } = await pool.query<SkillRow>(
    `SELECT skill_id, version, title, description, category,
            publisher_name, publisher_verified, kind, manifest,
            capabilities, pricing_tier_min, deprecated, created_at, updated_at
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
}

export async function upsertSkill(pool: pg.Pool, s: SkillUpsert): Promise<void> {
  await pool.query(
    `INSERT INTO skills_catalogue
       (skill_id, version, title, description, category, publisher_name,
        publisher_verified, kind, manifest, capabilities, pricing_tier_min,
        deprecated, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,NOW())
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
  changelog: string | null;
  published_at: string;
}

export async function listSkillVersions(pool: pg.Pool, skillId: string): Promise<SkillVersionRow[]> {
  const { rows } = await pool.query<SkillVersionRow>(
    `SELECT skill_id, version, title, description, category,
            publisher_name, publisher_verified, kind, manifest,
            capabilities, pricing_tier_min, changelog, published_at
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
    ]
  );
  // Also patch the matching skill_versions row so the history stays
  // in sync with the current row's metadata. (Manifest snapshot of a
  // shipped version is immutable — we only update display fields here.)
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
            pricing_tier_min = $11
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
          deprecated, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,NOW())
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
      ]
    );
    // Append the version-history entry.
    await client.query(
      `INSERT INTO skill_versions
         (skill_id, version, title, description, category, publisher_name,
          publisher_verified, kind, manifest, capabilities, pricing_tier_min, changelog)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12)`,
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
    ]
  );
  return { ok: true };
}
