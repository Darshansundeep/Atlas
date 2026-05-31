/**
 * User upsert + subscription initialization. Spec 002-cloud-auth.
 */

import type pg from 'pg';
import type { IdpProfile } from './idp/index.js';

export interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  picture_url: string | null;
}

export interface SubscriptionRow {
  user_id: string;
  tier: 'free' | 'pro' | 'team' | 'enterprise';
  monthly_token_quota: number | null;
  monthly_tokens_used: number;
  renews_at: Date | null;
  entitlements: string[];
}

export async function upsertUser(pool: pg.Pool, p: IdpProfile): Promise<UserRow> {
  // Insert OR update display_name/picture if the IdP changed them.
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (id, email, display_name, picture_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE
       SET email        = EXCLUDED.email,
           display_name = EXCLUDED.display_name,
           picture_url  = EXCLUDED.picture_url
     RETURNING id, email, display_name, picture_url`,
    [p.id, p.email, p.display_name, p.picture_url]
  );

  // Ensure a subscription_state row exists at tier=free.
  await pool.query(
    `INSERT INTO subscription_state (user_id, tier)
     VALUES ($1, 'free')
     ON CONFLICT (user_id) DO NOTHING`,
    [p.id]
  );

  return rows[0];
}

export async function getSubscription(
  pool: pg.Pool,
  userId: string
): Promise<SubscriptionRow | null> {
  const { rows } = await pool.query<SubscriptionRow>(
    `SELECT user_id, tier, monthly_token_quota, monthly_tokens_used, renews_at, entitlements
       FROM subscription_state
      WHERE user_id = $1`,
    [userId]
  );
  return rows[0] ?? null;
}

export function entitlementsFor(tier: SubscriptionRow['tier']): string[] {
  switch (tier) {
    case 'free':
      return ['atlas_cloud_proxy_metered'];
    case 'pro':
      return ['atlas_cloud_proxy', 'skill_marketplace', 'priority_support'];
    case 'team':
      return ['atlas_cloud_proxy', 'skill_marketplace', 'priority_support', 'team_dashboard'];
    case 'enterprise':
      return [
        'atlas_cloud_proxy',
        'skill_marketplace',
        'priority_support',
        'team_dashboard',
        'sso_enforcement',
        'audit_export',
      ];
  }
}
