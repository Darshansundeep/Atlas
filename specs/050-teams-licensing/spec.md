# Feature Specification: Teams & Organization Licensing

**Feature Branch**: `050-teams-licensing`
**Status**: v0.1 + v0.2 Path B SHIPPED 2026-06-02. v0.3 (org-level budget preflight) + v0.4 (Stripe) queued.
**Created**: 2026-06-02
**Last updated**: 2026-06-02
**Depends on**: 002 (auth) shipped; 003 (LLM proxy) shipped; 022 (skills) shipped; 040 (tools) v0.1 shipped
**Blocks**: 024 (skill pricing), 025 (skill marketplace), proper field rollout of 003/022/040

## Problem

Today everything in Atlas is **per-user**:

- `users` table — no `organization_id`
- Tier (`free / pro / team / enterprise`) lives on the user row
- LLM budget (Constitution Principle V hard cap) enforced per-user
- Tool quotas (spec 040) — per-user
- Skill install / usage telemetry (spec 022 v0.5) — per-user
- Admin console (spec 021) — global namespace, single `ADMIN_TOKEN`

This blocks Atlas's **Teams / Enterprise** revenue motion. Claude Teams,
ChatGPT Team, Cursor for Teams etc. all sell on:

1. **One bill, many seats** — admin buys N seats, invites teammates
2. **Pooled budget** — usage shared across the org, not per-user accounting
3. **Org-level admin** — owner manages members, roles, allow-lists
4. **Org-level provider keys** (enterprise) — bring-your-own keys at the org tier, prompts route via Atlas's proxy but billed to the org's upstream account
5. **Org-level skill governance** — admin restricts which skills the team can install
6. **Org-level usage analytics** — see total spend across the team

Darshan asked 2026-06-02:
> *"now the login is with respect to the User .. have you incorporated the
> teams or organisational license similar to claude teams licenses .. if
> not please add this to requirement"*

…and earlier in the same conversation:
> *"is there any log I can capture the calls where it is calling web ..
> so that I can decide on the future pricing and licensing .. I want
> this logs to be with respect to user and organization"*

Both questions are the same gap: Atlas needs the **Organization** as a
first-class entity that owns billing, seats, quotas, policy, and usage.

## Desired behaviour

### Core concept

An **Organization** is the billable entity. A `User` belongs to one or
more orgs via an `organization_members` row carrying a `role`. The
desktop has an **active-org** switcher; every API call carries the
active `organization_id` in the JWT claim.

**Personal accounts**: every new user gets a personal "org of one"
auto-created at signup. They can later upgrade it to Team, or accept an
invitation to a separate Team org and switch context.

### Plans (illustrative — final pricing is Darshan's call)

| Plan | Price | Seats | Pooled LLM budget | Pooled tools budget | SSO | Audit retention |
|---|---|---|---|---|---|---|
| **Free** | $0 | 1 (personal only) | $5/mo | $1/mo | — | 30 days |
| **Pro** | $20/seat/mo | 1 (personal upgrade) | $40/seat | $5/seat | — | 90 days |
| **Team** | $30/seat/mo | 3-25 | $50/seat (pooled) | $8/seat (pooled) | optional | 180 days |
| **Business** | $50/seat/mo | 25-500 | $80/seat (pooled) | $15/seat (pooled) | included | 365 days |
| **Enterprise** | Contract | Unlimited | Custom (or BYO-keys) | Custom (or BYO-keys) | SAML+SCIM | 7 yrs |

"Pooled" = budget summed across all org members; preflight enforces at
both user **and** org level, refusing whichever is hit first.

### Roles

| Role | Can do |
|---|---|
| `owner` | All `admin` rights + billing + delete-org |
| `admin` | Invite/remove members; set roles (not owner); set allow/deny; view audit |
| `member` | Use Atlas; see own usage; (optionally) see own quota |
| `viewer` | Read-only: read shared sessions, no agent invocations (audit roles) |

### Invitation flow

1. Org admin enters email + role in the admin console
2. Backend creates `organization_invitations` row + signed token
3. Email sent (template); recipient clicks link → desktop / web confirms
4. Acceptance creates `organization_members` row; user can now switch to
   the org as their active context

Pending invitations age out after 14 days.

### Org-level enforcement

Every Atlas-side hard cap moves from `(user_id)` to
`(organization_id, user_id)` two-dimensional check:

- **Spec 003 LLM proxy** — preflight checks org daily budget AND user
  daily budget; refuses on whichever is hit first. (Constitution V.)
- **Spec 040 tool proxy** — same: org quota + user quota.
- **Spec 022 skills** — installs are tagged with org; an org admin can
  set allow/deny list, and a member's install button shows the right
  state based on the active org's policy.

### Org-level provider keys (Business + Enterprise tiers)

Spec 040 v0.1 stores Atlas-managed provider keys. v0.3 (already
roadmapped) adds **per-org** overrides: a Business+ org can plug its
own Brave / Tavily / Firecrawl / Anthropic / OpenAI key. Prompts still
route via the Atlas proxy (so quota + audit + Principle V hold), but
the upstream charge lands on the org's account.

Constitution Principle I (BYOK never traverses Atlas) is honoured by:
- **Signed-out personal users**: BYOK on the desktop — never proxied.
- **Signed-in personal users on free/pro**: Atlas-managed keys, prompts
  go through Atlas proxy.
- **Org members in a Business+ org with BYO-keys**: prompts go through
  Atlas proxy with the org's key. The trade-off (auditability +
  governance vs. "never proxied") is opt-in by the org owner. Document
  explicitly.

### Usage logging — per-user AND per-org

This is the second half of Darshan's question. To inform pricing /
licensing decisions, Atlas needs aggregable usage logs **at both the
user grain AND the org grain**, for **every billable surface**.

Add `organization_id UUID` (denormalised, NOT NULL after migration) to:

- `usage_events` (spec 003 — LLM calls; current schema already has
  `user_id`)
- `tool_usage_events` (spec 040 — web search / scrape; current schema
  already has `user_id`)
- `skill_usage_events` (spec 022 v0.5 — skill triggers; current schema
  already has `user_id`)
- `skill_installations` (spec 022 v0.5)
- `audit_events` (spec 021)
- `sessions` (spec 002 — for "active members this month" rollups)

Each event row therefore carries `(organization_id, user_id, …)` so the
admin can pivot either way without joins.

### Admin views (Atlas operator + Org admin)

Two distinct admin surfaces — both query the same tables but with
different scope filters.

**Atlas operator console** (Darshan's view — extends spec 021):
- Organisations list (id, name, plan, seats used / max, MRR, signup date)
- Per-org drilldown: members, monthly spend (LLM + tools), trend
- Cross-org: top providers, cost-by-day, cost-by-tier
- Export to CSV for invoicing reconciliation

**Org admin console** (org-tier-scoped — new):
- Members table (email, role, last active, MTD usage)
- Subscription status + seat count + payment method
- Usage dashboards: LLM tokens, tool calls, skill triggers — all scoped
  to `organization_id = $1`
- Allow/deny skill list (delegates to 022 v0.9)
- Per-member quota (optional — org-level pool + per-member cap)

### Subscription state (Stripe)

A `organization_subscriptions` table mirrors Stripe's source-of-truth:

```
organization_id        UUID PRIMARY KEY
stripe_customer_id     TEXT
stripe_subscription_id TEXT
plan                   TEXT  (free|pro|team|business|enterprise)
status                 TEXT  (active|past_due|canceled|paused)
current_period_end     TIMESTAMPTZ
seat_count             INTEGER
trial_ends_at          TIMESTAMPTZ
```

Stripe webhook → `POST /webhooks/stripe` → write into this table. The
LLM proxy + tool proxy preflight checks `status = 'active'` before
permitting any chargeable call.

## Tables (new)

```sql
CREATE TABLE organizations (
  id                 UUID PRIMARY KEY,
  slug               TEXT UNIQUE NOT NULL,
  display_name       TEXT NOT NULL,
  plan               TEXT NOT NULL DEFAULT 'free',
  owner_user_id      UUID NOT NULL REFERENCES users(id),
  max_seats          INTEGER NOT NULL DEFAULT 1,
  monthly_budget_usd NUMERIC(10,2),
  monthly_tools_usd  NUMERIC(10,2),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ
);

CREATE TABLE organization_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,  -- owner|admin|member|viewer
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE organization_invitations (
  id                  UUID PRIMARY KEY,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  role                TEXT NOT NULL,
  invited_by_user_id  UUID NOT NULL REFERENCES users(id),
  token_hash          TEXT NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL,
  accepted_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organization_subscriptions (
  organization_id        UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  status                 TEXT NOT NULL DEFAULT 'active',
  current_period_end     TIMESTAMPTZ,
  seat_count             INTEGER NOT NULL DEFAULT 1,
  trial_ends_at          TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- per-org provider key overrides (extends spec 040)
CREATE TABLE organization_tool_providers (
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_type        TEXT NOT NULL,  -- brave|tavily|...
  api_key_encrypted    BYTEA NOT NULL,
  api_key_hint         TEXT NOT NULL,
  enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, provider_type)
);

-- ALTERs on existing tables:
ALTER TABLE usage_events       ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE tool_usage_events  ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE skill_usage_events ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE skill_installations ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE audit_events       ADD COLUMN organization_id UUID REFERENCES organizations(id);
CREATE INDEX usage_events_org_recent_idx       ON usage_events       (organization_id, occurred_at DESC);
CREATE INDEX tool_usage_events_org_recent_idx  ON tool_usage_events  (organization_id, occurred_at DESC);
CREATE INDEX skill_usage_events_org_recent_idx ON skill_usage_events (organization_id, occurred_at DESC);
```

Backfill: at migration time, every existing user gets a personal org;
all historical events get the personal-org id.

## Token shape

JWT access token grows an `org` claim carrying `(org_id, role)` for the
active org. The proxies enforce off this claim — no per-call DB lookup
for the membership.

```json
{
  "sub": "user-uuid",
  "email": "darshan@netgroup.ai",
  "tier": "team",
  "org": { "id": "org-uuid", "role": "owner" },
  "exp": ...
}
```

Refresh-token rotation re-issues with the org context preserved. A
"switch active org" action just calls refresh with a `?org_id=` hint.

## Versioned rollout

| Version | What | State |
|---|---|---|
| **v0.1** | DB tables + backfill personal-org for every existing user + `org` JWT claim + admin can list orgs + drilldown with MTD spend | ✅ shipped 2026-06-02 |
| **v0.2 Path B** | Self-serve teams: create-org + invitation codes (paste-share) + accept-invite + multi-org switcher + listMyOrganizations + `/v1/auth/switch-org` re-signs JWT with new org claim. Desktop AtlasTeamCard surfaces all of it. | ✅ shipped 2026-06-02 |
| **v0.2 Path A** | Admin-side: operator creates team org + adds members via `/admin/v1/organizations` endpoints | ⏳ deferred (Path B covers the use case for now) |
| v0.3 | Org-level budget preflight on spec 003 + spec 040 (already wired in 040's preflight.ts via `organization_tool_providers`/`monthly_tools_usd`; needs same in LLM proxy) | 🟡 partial — tool side done, LLM side pending |
| v0.4 | Stripe webhook + subscription state + seat enforcement | ⏳ |
| v0.5 | Org admin console (org-scoped, not Atlas-operator-scoped) | ⏳ |
| v0.6 | Per-org provider keys (extends 040 — table `organization_tool_providers` already exists) | 🟡 schema in place, no UX |
| v0.7 | Org-level skill allow/deny (extends 022) | ⏳ |
| v0.8 | SSO / SAML / SCIM (Business+) | ⏳ |
| v0.9 | Title-bar org switcher chrome (small polish on top of v0.2 Settings switcher) | ⏳ |

v0.1 + v0.2 are the MVP for "Atlas Teams" launch — both shipped today.

### v0.2 Path B — files shipped

| Item | Where |
|---|---|
| Invite-code generator + SHA-256 hash at rest | `services/atlas-auth-api/src/admin/invitations.ts` |
| `createTeamOrganization` / `createInvitation` / `acceptInvitation` / `listMyOrganizations` / `userIsMemberWithRole` | same |
| Public Bearer-authed endpoints: `/v1/organizations/me`, `POST /v1/organizations`, `POST /v1/organizations/:id/invitations`, `POST /v1/invitations/accept`, `POST /v1/auth/switch-org` | `services/atlas-auth-api/src/app.ts` |
| Desktop Settings → App → Atlas Team card: active-org switcher + create-team + invite + accept | `ui/desktop/src/components/settings/app/AtlasTeamCard.tsx` |
| `AuthContext.applyAccessToken(token)` for in-place org switch | `ui/desktop/src/auth/AuthContext.tsx` |
| Client API helpers | `ui/desktop/src/auth/api.ts` |

### Smoke verified

```
1. darshan creates "NET Group Engineering" → owner of new team org
2. /v1/organizations/me lists 2 orgs (personal + team), role=owner each
3. invitation generates code `atlas-invite-EFAH-DB5V-83PT`, 14-day expiry
4. alice signs in → ensurePersonalOrg auto-creates her personal org
5. alice accepts code → joins team as member; team now has 2 members
6. alice /v1/auth/switch-org → fresh JWT with org claim = team, role=member
```

## Constitution touchpoints

- **Principle I (BYOK)**: org-tier proxied calls trade "never proxied"
  for governance; this is an opt-in by the org owner. Personal/free
  signed-out flow remains BYOK-untouched. Document the trade-off in
  Settings → Privacy.
- **Principle V (NON-NEGOTIABLE — hard caps)**: preflight at BOTH user
  and org level. Two-tier check before any upstream call.
- **R-API-004 (token-leak-scan)**: invitation tokens hashed at rest;
  expire in 14 days; one-shot use.

## Open questions

1. **Multi-org switching UX**: dropdown in the title bar (Slack style)
   or workspace pickers (Notion style)?
2. **Personal-account migration**: if Darshan invites a user who already
   has a personal Atlas account, do their history merge into the new
   team org, or stay split?
3. **Pooled vs. per-seat budget allocation**: should an admin be able
   to cap a single member to e.g. 20% of the org pool?
4. **Seat overage**: hard-block at N+1 seat invite, or soft-allow with
   prorated billing on next cycle?
5. **Delete an org**: soft-delete keeps audit trail; what happens to
   members who only belonged to that org? (Force-create personal org?)
6. **Anonymisation in usage logs**: tool/LLM logs currently store the
   query text in `context` JSONB. For org-tier privacy, should we hash
   queries / store only intent classification, or let org admin opt in
   to plain-text storage?

## Acceptance criteria (v0.1 — MVP)

- ✓ `organizations` table created with at least one personal-org per existing user
- ✓ `organization_members` row exists for every user (default role=owner of personal org)
- ✓ `organization_id` populated on every new `usage_events` / `tool_usage_events` / `skill_usage_events` row going forward
- ✓ `org` claim in JWT access token
- ✓ Atlas admin can list all orgs + drill into one to see members + MTD spend
- ✓ Per-user historical data backfilled to the personal-org id

## Out of scope (this spec)

- Pricing finalisation (Darshan's commercial call)
- Stripe Connect for skill marketplace revenue share (covered in 024)
- Skill marketplace browsability (covered in 025)
- Cross-org session sharing (covered in 028, separate spec)
