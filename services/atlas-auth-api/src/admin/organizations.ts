/**
 * Spec 050 v0.1 — Teams & Organization Licensing
 *
 * Org as billable entity. Every user owns at least one personal org
 * (`is_personal = true`). New users get one created on first sign-in via
 * `ensurePersonalOrg`. Multi-org membership is supported by the schema
 * but the JWT carries a single active org (default: the personal one)
 * until 050 v0.2 ships the multi-org switcher.
 */

import type { Pool } from 'pg';

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface OrganizationRow {
  id: string;
  slug: string;
  display_name: string;
  plan: string;
  owner_user_id: string;
  max_seats: number;
  monthly_budget_usd: string | null;
  monthly_tools_usd: string | null;
  is_personal: boolean;
  created_at: Date;
  member_count: number;
  active_subscription_status: string | null;
}

export interface OrganizationMember {
  organization_id: string;
  user_id: string;
  role: OrgRole;
  joined_at: Date;
  email: string | null;
  display_name: string | null;
}

/**
 * Idempotently create the user's personal org (and owner membership and
 * default free subscription) if they don't already have one. Returns the
 * (id, role) tuple suitable for embedding into the JWT `org` claim.
 *
 * Safe to call on every sign-in — short-circuits when the org exists.
 */
export async function ensurePersonalOrg(
  pool: Pool,
  userId: string,
  displayHint: string | null
): Promise<{ id: string; role: OrgRole }> {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM organizations
     WHERE owner_user_id = $1 AND is_personal = TRUE AND deleted_at IS NULL
     LIMIT 1`,
    [userId]
  );
  if (existing.rows[0]) {
    return { id: existing.rows[0].id, role: 'owner' };
  }

  const { rows: created } = await pool.query<{ id: string }>(
    `INSERT INTO organizations
       (id, slug, display_name, plan, owner_user_id, max_seats, is_personal)
     VALUES (gen_random_uuid(),
             'personal-' || LEFT(gen_random_uuid()::text, 8),
             $2, 'free', $1, 1, TRUE)
     RETURNING id`,
    [userId, displayHint ?? 'Personal']
  );
  const orgId = created[0].id;

  await pool.query(
    `INSERT INTO organization_members (organization_id, user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT DO NOTHING`,
    [orgId, userId]
  );
  await pool.query(
    `INSERT INTO organization_subscriptions (organization_id, status, seat_count)
     VALUES ($1, 'active', 1)
     ON CONFLICT (organization_id) DO NOTHING`,
    [orgId]
  );

  return { id: orgId, role: 'owner' };
}

/**
 * List all orgs for the Atlas operator admin console. Joins member count
 * and current subscription status. Returns plain rows (numerics serialised
 * as strings by `pg`; admin UI handles).
 */
export async function listOrganizations(pool: Pool): Promise<OrganizationRow[]> {
  const { rows } = await pool.query<OrganizationRow>(
    `SELECT o.id, o.slug, o.display_name, o.plan, o.owner_user_id,
            o.max_seats, o.monthly_budget_usd, o.monthly_tools_usd,
            o.is_personal, o.created_at,
            COALESCE(mc.member_count, 0) AS member_count,
            sub.status AS active_subscription_status
       FROM organizations o
       LEFT JOIN (
         SELECT organization_id, COUNT(*)::int AS member_count
           FROM organization_members
          GROUP BY organization_id
       ) mc ON mc.organization_id = o.id
       LEFT JOIN organization_subscriptions sub ON sub.organization_id = o.id
      WHERE o.deleted_at IS NULL
      ORDER BY o.is_personal ASC, o.created_at DESC`
  );
  return rows;
}

export async function getOrganization(
  pool: Pool,
  orgId: string
): Promise<OrganizationRow | null> {
  const { rows } = await pool.query<OrganizationRow>(
    `SELECT o.id, o.slug, o.display_name, o.plan, o.owner_user_id,
            o.max_seats, o.monthly_budget_usd, o.monthly_tools_usd,
            o.is_personal, o.created_at,
            COALESCE(mc.member_count, 0) AS member_count,
            sub.status AS active_subscription_status
       FROM organizations o
       LEFT JOIN (
         SELECT organization_id, COUNT(*)::int AS member_count
           FROM organization_members
          GROUP BY organization_id
       ) mc ON mc.organization_id = o.id
       LEFT JOIN organization_subscriptions sub ON sub.organization_id = o.id
      WHERE o.id = $1 AND o.deleted_at IS NULL`,
    [orgId]
  );
  return rows[0] ?? null;
}

export async function listMembers(
  pool: Pool,
  orgId: string
): Promise<OrganizationMember[]> {
  const { rows } = await pool.query<OrganizationMember>(
    `SELECT m.organization_id, m.user_id, m.role, m.joined_at,
            u.email, u.display_name
       FROM organization_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = $1
      ORDER BY m.joined_at ASC`,
    [orgId]
  );
  return rows;
}

/**
 * Spend rollup for the operator admin's per-org drilldown.
 *
 * Returns MTD totals (LLM tokens + USD, tools USD) so the admin can
 * eyeball who's burning the most.
 */
export async function getOrgSpendMonthToDate(
  pool: Pool,
  orgId: string
): Promise<{
  llm_tokens: number;
  llm_usd: string;
  tools_searches: number;
  tools_scrapes: number;
  tools_usd: string;
}> {
  const { rows: llm } = await pool.query<{
    tokens: string | null;
    usd: string | null;
  }>(
    `SELECT COALESCE(SUM(input_tokens + output_tokens), 0)::text AS tokens,
            COALESCE(SUM(cost_usd), 0)::text                    AS usd
       FROM usage_events
      WHERE organization_id = $1
        AND occurred_at >= date_trunc('month', NOW())`,
    [orgId]
  );
  const { rows: tools } = await pool.query<{
    searches: string;
    scrapes: string;
    usd: string;
  }>(
    `SELECT COUNT(*) FILTER (WHERE tool_name = 'web_search')::text AS searches,
            COUNT(*) FILTER (WHERE tool_name = 'web_scrape')::text AS scrapes,
            COALESCE(SUM(cost_usd), 0)::text                       AS usd
       FROM tool_usage_events
      WHERE organization_id = $1
        AND occurred_at >= date_trunc('month', NOW())`,
    [orgId]
  );
  return {
    llm_tokens: Number(llm[0]?.tokens ?? 0),
    llm_usd: llm[0]?.usd ?? '0',
    tools_searches: Number(tools[0]?.searches ?? 0),
    tools_scrapes: Number(tools[0]?.scrapes ?? 0),
    tools_usd: tools[0]?.usd ?? '0',
  };
}
