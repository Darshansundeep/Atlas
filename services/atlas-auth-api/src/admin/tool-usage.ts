/**
 * Spec 040 v0.2 — Admin tool-usage queries.
 *
 * Powers the "Tool Usage" admin panel. Two surfaces:
 *  - Recent row-level events (with filters: user, org, provider, status, date range)
 *  - Daily aggregate (calls + cost-by-day for charting)
 *
 * tool_usage_events carries: user_id, organization_id, session_id,
 * tool_name, provider, status, cost_usd, input_size, output_size,
 * context (JSONB; has query / url / refusal reason).
 */

import type { Pool } from 'pg';

export interface ToolUsageFilters {
  userId?: string;
  organizationId?: string;
  provider?: string;
  toolName?: 'web_search' | 'web_scrape';
  status?: 'ok' | 'quota_exceeded' | 'upstream_error';
  sessionId?: string;
  /** Inclusive lower bound (ISO timestamp). Defaults to last 30 days. */
  since?: string;
  /** Exclusive upper bound. */
  until?: string;
  limit?: number;
}

export interface ToolUsageRow {
  id: string;
  user_id: string;
  user_email: string | null;
  organization_id: string | null;
  organization_name: string | null;
  session_id: string | null;
  tool_name: string;
  provider: string;
  status: string;
  cost_usd: string;        // numeric
  input_size: number | null;
  output_size: number | null;
  occurred_at: Date;
  context: Record<string, unknown> | null;
}

function buildWhere(filters: ToolUsageFilters): { sql: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filters.userId)         { params.push(filters.userId);         conds.push(`e.user_id = $${params.length}`); }
  if (filters.organizationId) { params.push(filters.organizationId); conds.push(`e.organization_id = $${params.length}`); }
  if (filters.provider)       { params.push(filters.provider);       conds.push(`e.provider = $${params.length}`); }
  if (filters.toolName)       { params.push(filters.toolName);       conds.push(`e.tool_name = $${params.length}`); }
  if (filters.status)         { params.push(filters.status);         conds.push(`e.status = $${params.length}`); }
  if (filters.sessionId)      { params.push(filters.sessionId);      conds.push(`e.session_id = $${params.length}`); }
  const since = filters.since ?? `${30}-days-ago`;
  if (filters.since) {
    params.push(filters.since); conds.push(`e.occurred_at >= $${params.length}`);
  } else {
    conds.push(`e.occurred_at >= NOW() - INTERVAL '30 days'`);
  }
  void since;
  if (filters.until)          { params.push(filters.until); conds.push(`e.occurred_at < $${params.length}`); }
  return {
    sql: conds.length ? `WHERE ${conds.join(' AND ')}` : '',
    params,
  };
}

export async function listToolUsage(
  pool: Pool,
  filters: ToolUsageFilters
): Promise<ToolUsageRow[]> {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 1000);
  const { sql, params } = buildWhere(filters);
  params.push(limit);
  const { rows } = await pool.query<ToolUsageRow>(
    `SELECT e.id, e.user_id, u.email AS user_email,
            e.organization_id, o.display_name AS organization_name,
            e.session_id, e.tool_name, e.provider, e.status,
            e.cost_usd::text AS cost_usd,
            e.input_size, e.output_size, e.occurred_at,
            e.context
       FROM tool_usage_events e
       LEFT JOIN users u           ON u.id = e.user_id
       LEFT JOIN organizations o   ON o.id = e.organization_id
       ${sql}
      ORDER BY e.occurred_at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

export interface ToolUsageDailyRow {
  day: string;
  searches: number;
  scrapes: number;
  ok_calls: number;
  refused_calls: number;
  cost_usd: string;
}

export async function getToolUsageDaily(
  pool: Pool,
  filters: ToolUsageFilters,
  days: number = 30
): Promise<ToolUsageDailyRow[]> {
  const { sql, params } = buildWhere(filters);
  params.push(days);
  const { rows } = await pool.query<ToolUsageDailyRow>(
    `SELECT date_trunc('day', e.occurred_at)::date::text AS day,
            COUNT(*) FILTER (WHERE e.tool_name = 'web_search')::int AS searches,
            COUNT(*) FILTER (WHERE e.tool_name = 'web_scrape')::int AS scrapes,
            COUNT(*) FILTER (WHERE e.status = 'ok')::int           AS ok_calls,
            COUNT(*) FILTER (WHERE e.status <> 'ok')::int          AS refused_calls,
            COALESCE(SUM(e.cost_usd), 0)::text                     AS cost_usd
       FROM tool_usage_events e
       ${sql}
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

/**
 * Per-session rollup. The admin can pivot "which sessions used the most
 * web tools" — useful for spotting runaway agents or particularly research-
 * heavy conversations.
 */
export interface ToolUsageSessionRow {
  session_id: string;
  user_id: string;
  user_email: string | null;
  calls: number;
  cost_usd: string;
  first_call_at: Date;
  last_call_at: Date;
}

export async function getToolUsageBySession(
  pool: Pool,
  filters: ToolUsageFilters,
  limit: number = 100
): Promise<ToolUsageSessionRow[]> {
  const { sql, params } = buildWhere(filters);
  params.push(limit);
  const sessionFilter = sql ? `${sql} AND e.session_id IS NOT NULL` : `WHERE e.session_id IS NOT NULL`;
  const { rows } = await pool.query<ToolUsageSessionRow>(
    `SELECT e.session_id, e.user_id, u.email AS user_email,
            COUNT(*)::int                  AS calls,
            COALESCE(SUM(e.cost_usd), 0)::text AS cost_usd,
            MIN(e.occurred_at)             AS first_call_at,
            MAX(e.occurred_at)             AS last_call_at
       FROM tool_usage_events e
       LEFT JOIN users u ON u.id = e.user_id
       ${sessionFilter}
      GROUP BY e.session_id, e.user_id, u.email
      ORDER BY last_call_at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}
