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
