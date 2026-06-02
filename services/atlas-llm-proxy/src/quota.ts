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

// ---------------------------------------------------------------------------
// Spec 050 v0.3 — org-level budget preflight.
// Mirrors spec 040 v0.2's tool-side two-tier check: refuse on whichever
// cap (user-tier OR org monthly budget) is hit first. NON-NEGOTIABLE
// Principle V applies at BOTH grains.

export interface OrgPreflightOk {
  ok: true;
  cap: number | null;   // null = unlimited (enterprise)
  spent_mtd: number;
}
export interface OrgPreflightDenied {
  ok: false;
  reason: 'org_budget_exceeded';
  cap: number;
  spent_mtd: number;
}
export type OrgPreflightResult = OrgPreflightOk | OrgPreflightDenied;

/**
 * Returns ok=true when no cap is set (most orgs don't set one), or when
 * MTD spend is below the cap. Returns denied otherwise.
 *
 * The cap lives at `organizations.monthly_budget_usd`. NULL means
 * unlimited (Enterprise contracts).
 */
export async function orgPreflight(
  pool: pg.Pool,
  organizationId: string
): Promise<OrgPreflightResult> {
  const { rows } = await pool.query<{ cap: string | null; spent: string }>(
    `SELECT o.monthly_budget_usd::text AS cap,
            COALESCE(SUM(e.cost_usd) FILTER (
              WHERE e.occurred_at >= date_trunc('month', NOW())
                AND e.status = 'ok'
            ), 0)::text AS spent
       FROM organizations o
       LEFT JOIN usage_events e ON e.organization_id = o.id
      WHERE o.id = $1
      GROUP BY o.monthly_budget_usd`,
    [organizationId]
  );
  const r = rows[0];
  if (!r) {
    // org row missing — fail open at v0.3; spec 050 v0.1's backfill
    // ensures every active user has one.
    return { ok: true, cap: null, spent_mtd: 0 };
  }
  const spent = Number(r.spent ?? 0);
  if (r.cap === null) {
    return { ok: true, cap: null, spent_mtd: spent };
  }
  const cap = Number(r.cap);
  if (cap > 0 && spent >= cap) {
    return { ok: false, reason: 'org_budget_exceeded', cap, spent_mtd: spent };
  }
  return { ok: true, cap, spent_mtd: spent };
}
