# Feature Specification: Admin Console — RBAC + Org Scoping + Billing UI

**Feature Branch**: `021-admin-console`
**Status**: minimum operator panel SHIPPED; full RBAC console deferred (multi-week, multi-blocker)
**Created**: 2026-05-31

## Implementation status — 2026-05-31

**Shipped (the "minimum operator panel")** — `services/atlas-auth-api/src/admin/`:
- HTML SPA at `GET /admin` (no build step; vanilla JS)
- Shared-secret `ADMIN_TOKEN` gate (no RBAC yet)
- Tabs: Overview / People / Sessions / Audit / Models / Skills
- Stats cards (users / signups / sign-ins / active sessions / theft events)
- People — list users + Revoke-all + Set-tier
- Models — CRUD against spec 011 catalogue (17 seeded)
- Skills — CRUD against spec 022 catalogue (with v0.2 version management)

**Deferred — the FULL admin console**: org concept, RBAC roles, MFA gate,
Stripe webhook → `subscription_state`, billing UI, invite flow, per-org
consoles at `<org>.atlas.netgroup.ai/admin`. Multi-week, blocked on
WorkOS-vs-roll-your-own decision + Stripe account. Nothing implemented.

ROADMAP.md item C — not on the v1 launch path.

## Problem

Today's admin panel at `/admin` (delivered alongside spec 002) is a single-page operator console gated by a shared `ADMIN_TOKEN`. That's fine for one operator (Darshan) but breaks as soon as Atlas has paying customers:

- **No org concept.** Every user is in one global namespace; team admins can't manage their own users.
- **No role separation.** A junior support engineer who can read audit events shouldn't be able to set user tiers or revoke sessions.
- **No MFA gate.** A bearer secret typed into a sessionStorage form is not appropriate auth for the surface that controls billing and user lifecycle.
- **No billing UI.** Stripe (or similar) status is invisible; tier changes are manual SQL.
- **No invite flow.** New admins need a way in that doesn't involve sharing `ADMIN_TOKEN` over Slack.

## Desired behaviour

1. **Org model**: Atlas users belong to one or more orgs. Personal accounts are an "org of one". Org admins manage members + roles within their org.
2. **Roles**:
   - `owner` — full org rights, billing, deletion
   - `admin` — user lifecycle, role assignment, audit view
   - `member` — no admin rights
3. **Atlas-staff console** (`admin.atlas.netgroup.ai`):
   - Cross-org user search
   - Revenue dashboard, MRR, churn
   - Per-org tier override (override of self-serve billing)
4. **Org-admin console** (`<org>.atlas.netgroup.ai/admin`):
   - Members tab — invite (email), assign role, suspend
   - Billing tab — current plan, usage vs cap, upgrade/downgrade, invoice history (Stripe-backed)
   - Audit tab — events scoped to this org's users
   - Models tab — org-level pricing overrides on top of catalogue (spec 011)
   - Skills tab — once spec 022 ships, allow/deny lists per org
5. **MFA**: TOTP required for any admin/owner role action. WebAuthn (passkey) as upgrade path.
6. **Invite flow**: owner/admin creates an invite link with a role; invitee sees an existing-user pickup or a sign-in flow.
7. **All admin actions emit audit events** with actor identity (not just target).

## Key constraints

- Replaces the `ADMIN_TOKEN` panel. After this ships, `ADMIN_TOKEN` mode is dev-only.
- Uses WorkOS (spec 002 IdP) for the admin sign-in. No second identity store.
- Stripe is the billing provider — server-side webhooks update `subscription_state`.

## Open questions for `/speckit-clarify`

1. Org slug requirements — alphanumeric only? Reserved words list?
2. Personal-account orgs: auto-create at signup, or only on first paid action?
3. Audit retention — 90 days (free), 1 year (pro), unbounded (enterprise)?
4. MFA enforcement: required only when role changes are attempted, or on every login to admin surface?
5. Self-service deletion — does deleting an org delete all members' personal data per GDPR even if those users still exist elsewhere?
6. Stripe Customer model — one per user or one per org? (Affects how team subs handle ownership transfer.)

## Open implementation questions

- Use WorkOS Organizations (vendor-provided) or roll our own?
- Use WorkOS Roles & Permissions (FGA-style) or simple role enum?
- Real-time audit feed via SSE, or polled?
- How does the desktop know which org context it's in? (Likely a `x-atlas-org-id` header chosen via a switcher.)

## Acceptance criteria

- An org owner can invite a member by email, the member completes sign-in via WorkOS, lands in the org as `member`, and can be promoted to `admin`.
- Promoting / revoking roles requires MFA on the actor.
- Org admins see only their org's users / audit / billing — never cross-org data.
- Atlas-staff console can search any user globally but is itself gated by an `atlas_staff` claim on the JWT.
- Tier changes flow from Stripe webhook → `subscription_state.tier` within 60s and the desktop reflects it on next poll.
- Old `ADMIN_TOKEN` panel returns `410 Gone` once the new console is the default.
