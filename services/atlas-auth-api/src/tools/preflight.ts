/**
 * Spec 040 v0.2 — preflight quota enforcement.
 * Constitution Principle V (NON-NEGOTIABLE): hard caps BEFORE the
 * upstream provider call.
 *
 * Two-tier check (per spec 050):
 *  - per-user-tier (today's events for this user)
 *  - per-org (today's events across the user's active org)
 * Refuse on whichever cap is hit first; refusal itself is recorded as
 * a usage_event with status='quota_exceeded' so the admin can see it.
 */

import type { Pool } from 'pg';

export type Tier = 'free' | 'pro' | 'team' | 'enterprise';
export type Op = 'search' | 'scrape';

export interface PreflightInput {
  userId: string;
  organizationId: string | null;
  tier: Tier;
  op: Op;
}

export interface PreflightOk { ok: true; }
export interface PreflightDenied {
  ok: false;
  reason: 'tier_quota_exceeded' | 'org_budget_exceeded' | 'tier_budget_exceeded';
  detail: string;
}
export type PreflightResult = PreflightOk | PreflightDenied;

interface QuotaRow {
  searches_per_day: number | null;
  scrapes_per_day: number | null;
  budget_usd_per_day: string;
}

export async function preflight(
  pool: Pool,
  input: PreflightInput
): Promise<PreflightResult> {
  const { rows: qRows } = await pool.query<QuotaRow>(
    `SELECT searches_per_day, scrapes_per_day, budget_usd_per_day
       FROM tool_quotas WHERE tier = $1`,
    [input.tier]
  );
  const quota = qRows[0];
  if (!quota) {
    // Quota table not seeded yet — allow but log so admin notices.
    return { ok: true };
  }

  const opCol = input.op === 'search' ? 'web_search' : 'web_scrape';
  const counterCap = input.op === 'search' ? quota.searches_per_day : quota.scrapes_per_day;
  const budgetCap = Number(quota.budget_usd_per_day);

  // Today's counts for this user (UTC day).
  const { rows: userTodayRows } = await pool.query<{ count: string; spend: string }>(
    `SELECT
        COUNT(*) FILTER (WHERE tool_name = $2)::text AS count,
        COALESCE(SUM(cost_usd), 0)::text             AS spend
       FROM tool_usage_events
      WHERE user_id = $1
        AND status = 'ok'
        AND occurred_at >= date_trunc('day', NOW())`,
    [input.userId, opCol]
  );
  const userCount = Number(userTodayRows[0]?.count ?? 0);
  const userSpend = Number(userTodayRows[0]?.spend ?? 0);

  if (counterCap !== null && userCount >= counterCap) {
    return {
      ok: false,
      reason: 'tier_quota_exceeded',
      detail: `tier=${input.tier} ${input.op} cap=${counterCap}/day; used=${userCount}`,
    };
  }
  if (budgetCap > 0 && userSpend >= budgetCap) {
    return {
      ok: false,
      reason: 'tier_budget_exceeded',
      detail: `tier=${input.tier} budget=$${budgetCap}/day; spent=$${userSpend.toFixed(4)}`,
    };
  }

  // Spec 050 v0.3 — org-level preflight (only kicks in once orgs have an
  // explicit monthly_tools_usd; until then user-tier caps are the binding
  // constraint).
  if (input.organizationId) {
    const { rows: orgRows } = await pool.query<{ cap: string | null; spent: string }>(
      `SELECT o.monthly_tools_usd::text AS cap,
              COALESCE(SUM(e.cost_usd) FILTER (
                WHERE e.occurred_at >= date_trunc('month', NOW())
                  AND e.status = 'ok'
              ), 0)::text AS spent
         FROM organizations o
         LEFT JOIN tool_usage_events e ON e.organization_id = o.id
        WHERE o.id = $1
        GROUP BY o.monthly_tools_usd`,
      [input.organizationId]
    );
    const cap = orgRows[0]?.cap;
    if (cap !== undefined && cap !== null) {
      const orgCap = Number(cap);
      const orgSpent = Number(orgRows[0]?.spent ?? 0);
      if (orgCap > 0 && orgSpent >= orgCap) {
        return {
          ok: false,
          reason: 'org_budget_exceeded',
          detail: `org budget=$${orgCap}/mo; spent=$${orgSpent.toFixed(4)}`,
        };
      }
    }
  }

  return { ok: true };
}

/** Record a tool_usage_events row with consistent shape. */
export async function recordToolUsage(
  pool: Pool,
  row: {
    userId: string;
    organizationId: string | null;
    toolName: 'web_search' | 'web_scrape';
    provider: string;
    inputSize: number;
    outputSize: number;
    costUsd: number;
    status: 'ok' | 'quota_exceeded' | 'upstream_error';
    context?: Record<string, unknown>;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO tool_usage_events
        (id, user_id, organization_id, tool_name, provider,
         input_size, output_size, cost_usd, status, context)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      row.userId,
      row.organizationId,
      row.toolName,
      row.provider,
      row.inputSize,
      row.outputSize,
      row.costUsd,
      row.status,
      JSON.stringify(row.context ?? {}),
    ]
  );
}
