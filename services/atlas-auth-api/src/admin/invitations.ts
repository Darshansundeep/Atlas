/**
 * Spec 050 v0.2 — self-serve team flow.
 *
 *   create team org  →  owner becomes role=owner of new org
 *   invite teammate  →  owner generates short code, ages out in 14 days
 *   accept invite    →  signed-in user pastes code, joins as role=member
 *   list my orgs     →  user sees personal + every team they're in
 *   switch org       →  re-issue access token with new org claim
 *
 * No email at v0.2 — invite code is paste-shared (same UX shape as the
 * Atlas device-code sign-in). v0.3 will wire SMTP.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface CreateOrgInput {
  ownerUserId: string;
  displayName: string;
  plan?: 'free' | 'pro' | 'team' | 'business' | 'enterprise';
}

export interface OrgSummary {
  id: string;
  slug: string;
  display_name: string;
  plan: string;
  role: OrgRole;
  is_personal: boolean;
  member_count: number;
}

/**
 * Generate a paste-friendly invite code:
 *   atlas-invite-XXXX-XXXX-XXXX
 * (16 base32-ish characters, easy to type, no ambiguous chars)
 */
function generateInviteCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // skip I L O 0 1
  const buf = randomBytes(12);
  let raw = '';
  for (let i = 0; i < buf.length; i++) raw += alphabet[buf[i] % alphabet.length];
  return `atlas-invite-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function hashInviteCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

// ---------------------------------------------------------------------------
// Create org

export async function createTeamOrganization(
  pool: Pool,
  input: CreateOrgInput
): Promise<{ id: string; slug: string }> {
  // Generate a slug from display_name; suffix with random to dedupe.
  const base = input.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';
  const slug = `${base}-${randomBytes(3).toString('hex')}`;

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO organizations
        (id, slug, display_name, plan, owner_user_id, max_seats, is_personal)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, FALSE)
     RETURNING id`,
    [slug, input.displayName, input.plan ?? 'free', input.ownerUserId, 25]
  );
  const orgId = rows[0].id;

  await pool.query(
    `INSERT INTO organization_members (organization_id, user_id, role)
     VALUES ($1, $2, 'owner')`,
    [orgId, input.ownerUserId]
  );
  await pool.query(
    `INSERT INTO organization_subscriptions (organization_id, status, seat_count)
     VALUES ($1, 'active', 1)
     ON CONFLICT (organization_id) DO NOTHING`,
    [orgId]
  );

  return { id: orgId, slug };
}

// ---------------------------------------------------------------------------
// Invitations

export interface CreateInvitationInput {
  organizationId: string;
  inviterUserId: string;
  email: string;
  role?: OrgRole;
}

export async function createInvitation(
  pool: Pool,
  input: CreateInvitationInput
): Promise<{ code: string; expires_at: Date; id: string }> {
  const code = generateInviteCode();
  const tokenHash = hashInviteCode(code);
  const ttlDays = 14;
  const { rows } = await pool.query<{ id: string; expires_at: Date }>(
    `INSERT INTO organization_invitations
        (id, organization_id, email, role, invited_by_user_id, token_hash, expires_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW() + ($6 || ' days')::interval)
     RETURNING id, expires_at`,
    [
      input.organizationId,
      input.email.toLowerCase(),
      input.role ?? 'member',
      input.inviterUserId,
      tokenHash,
      String(ttlDays),
    ]
  );
  return { code, expires_at: rows[0].expires_at, id: rows[0].id };
}

export interface AcceptResult {
  ok: true;
  organization_id: string;
  role: OrgRole;
}
export interface AcceptError {
  ok: false;
  reason: 'invalid_code' | 'expired' | 'already_accepted' | 'already_member';
}

export async function acceptInvitation(
  pool: Pool,
  acceptingUserId: string,
  code: string
): Promise<AcceptResult | AcceptError> {
  const tokenHash = hashInviteCode(code.trim());
  const { rows: invs } = await pool.query<{
    id: string;
    organization_id: string;
    role: OrgRole;
    expires_at: Date;
    accepted_at: Date | null;
  }>(
    `SELECT id, organization_id, role, expires_at, accepted_at
       FROM organization_invitations
      WHERE token_hash = $1
      LIMIT 1`,
    [tokenHash]
  );
  const inv = invs[0];
  if (!inv) return { ok: false, reason: 'invalid_code' };
  if (inv.accepted_at) return { ok: false, reason: 'already_accepted' };
  if (new Date(inv.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' };

  const { rows: existing } = await pool.query(
    `SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
    [inv.organization_id, acceptingUserId]
  );
  if (existing.length > 0) return { ok: false, reason: 'already_member' };

  await pool.query(
    `INSERT INTO organization_members (organization_id, user_id, role)
     VALUES ($1, $2, $3)`,
    [inv.organization_id, acceptingUserId, inv.role]
  );
  await pool.query(
    `UPDATE organization_invitations SET accepted_at = NOW() WHERE id = $1`,
    [inv.id]
  );

  return { ok: true, organization_id: inv.organization_id, role: inv.role };
}

// ---------------------------------------------------------------------------
// User-facing listings

export async function listMyOrganizations(
  pool: Pool,
  userId: string
): Promise<OrgSummary[]> {
  const { rows } = await pool.query<OrgSummary>(
    `SELECT o.id, o.slug, o.display_name, o.plan, m.role,
            o.is_personal,
            COALESCE(mc.member_count, 0) AS member_count
       FROM organization_members m
       JOIN organizations o ON o.id = m.organization_id
       LEFT JOIN (
         SELECT organization_id, COUNT(*)::int AS member_count
           FROM organization_members
          GROUP BY organization_id
       ) mc ON mc.organization_id = o.id
      WHERE m.user_id = $1
        AND o.deleted_at IS NULL
      ORDER BY o.is_personal DESC, o.created_at ASC`,
    [userId]
  );
  return rows;
}

export async function userIsMemberWithRole(
  pool: Pool,
  userId: string,
  orgId: string
): Promise<OrgRole | null> {
  const { rows } = await pool.query<{ role: OrgRole }>(
    `SELECT role FROM organization_members
      WHERE organization_id = $1 AND user_id = $2
      LIMIT 1`,
    [orgId, userId]
  );
  return rows[0]?.role ?? null;
}
