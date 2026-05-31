/**
 * Quota enforcement. Spec 003 §quota, Constitution Principle V (NON-NEGOTIABLE):
 *
 * "hard daily and monthly token-spend caps enforced by the proxy BEFORE
 *  any provider call"
 *
 * Pre-flight cap: per-user daily USD ceiling by tier. The proxy refuses
 * to forward when the user is over the cap. Post-call we record the
 * actual usage; the cap check is approximate (we read today's recorded
 * cost), so very high concurrency can momentarily exceed by one call —
 * acceptable tradeoff vs serialising every request.
 */

import type pg from 'pg';

export type Tier = 'free' | 'pro' | 'team' | 'enterprise';

export interface DailyCaps {
  free: number;
  pro: number;
  team: number;
  enterprise: number;
}

export interface QuotaEnv {
  dailyCaps: DailyCaps;
}

export async function getTier(pool: pg.Pool, userId: string): Promise<Tier> {
  const { rows } = await pool.query<{ tier: Tier }>(
    `SELECT tier FROM subscription_state WHERE user_id = $1`,
    [userId]
  );
  return rows[0]?.tier ?? 'free';
}

export async function todaysSpend(pool: pg.Pool, userId: string): Promise<number> {
  const { rows } = await pool.query<{ sum: string }>(
    `SELECT COALESCE(SUM(cost_usd), 0)::text AS sum
       FROM usage_events
      WHERE user_id = $1
        AND occurred_at >= CURRENT_DATE`,
    [userId]
  );
  return Number(rows[0]?.sum ?? 0);
}

export function capFor(tier: Tier, env: QuotaEnv): number {
  return env.dailyCaps[tier];
}

export async function preflight(
  pool: pg.Pool,
  userId: string,
  env: QuotaEnv
): Promise<{ ok: true; tier: Tier; remaining: number } | { ok: false; tier: Tier; cap: number; usedToday: number }> {
  const tier = await getTier(pool, userId);
  const cap = capFor(tier, env);
  const used = await todaysSpend(pool, userId);
  if (used >= cap) {
    return { ok: false, tier, cap, usedToday: used };
  }
  return { ok: true, tier, remaining: cap - used };
}
