-- Atlas Auth Postgres schema. Spec 002-cloud-auth.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY,
  email        TEXT NOT NULL,
  display_name TEXT,
  picture_url  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id                  UUID PRIMARY KEY,
  token_hash          TEXT NOT NULL,             -- bcrypt(token)
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_install_id   UUID NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ,
  rotated_to_id       UUID REFERENCES refresh_tokens(id)
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_active_idx
  ON refresh_tokens(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_idx
  ON refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id          UUID PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL,
  error_code  TEXT,
  device_os   TEXT,
  ip_hash     TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_events_user_recent_idx
  ON audit_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_recent_idx
  ON audit_events(occurred_at DESC);

CREATE TABLE IF NOT EXISTS subscription_state (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tier                 TEXT NOT NULL DEFAULT 'free',
  monthly_token_quota  INTEGER,
  monthly_tokens_used  INTEGER NOT NULL DEFAULT 0,
  renews_at            TIMESTAMPTZ,
  entitlements         JSONB NOT NULL DEFAULT '[]',
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spec 003 — LLM proxy usage events. One row per forwarded call.
CREATE TABLE IF NOT EXISTS usage_events (
  id                   UUID PRIMARY KEY,
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider             TEXT NOT NULL,
  model                TEXT NOT NULL,
  input_tokens         INTEGER NOT NULL DEFAULT 0,
  output_tokens        INTEGER NOT NULL DEFAULT 0,
  cost_usd             NUMERIC(10, 6) NOT NULL DEFAULT 0,
  request_id           TEXT,
  status               TEXT NOT NULL,        -- ok | quota_exceeded | provider_error
  occurred_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS usage_events_user_recent_idx
  ON usage_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_user_day_idx
  ON usage_events(user_id, occurred_at);

-- Spec 022 v0.1 — Skills catalogue (no signing, no org policy yet).
-- A skill is a versioned bundle of an MCP extension config and/or a
-- recipe payload, with metadata. Future v0.2 adds ed25519 manifest
-- signing; v0.3 adds per-org allow/deny lists (depends on orgs from
-- spec 021).
CREATE TABLE IF NOT EXISTS skills_catalogue (
  skill_id              TEXT PRIMARY KEY,        -- reverse-DNS, e.g. ai.netgroup.atlas.web-research
  version               TEXT NOT NULL,
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL,
  category              TEXT NOT NULL DEFAULT 'general',
  publisher_name        TEXT NOT NULL,
  publisher_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  kind                  TEXT NOT NULL,           -- 'extension' | 'recipe' | 'composite'
  manifest              JSONB NOT NULL,          -- full skill manifest (see spec 022)
  capabilities          JSONB NOT NULL DEFAULT '[]',
  pricing_tier_min      TEXT NOT NULL DEFAULT 'free',
  deprecated            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS skills_catalogue_category_idx ON skills_catalogue(category);
CREATE INDEX IF NOT EXISTS skills_catalogue_publisher_idx ON skills_catalogue(publisher_name);

-- Spec 022 v0.2 — Skill version history. One row per published version
-- per skill. The skills_catalogue row above always points at the
-- currently-active version (denormalized for fast public reads).
-- Re-publishing the same version is rejected at the application layer
-- so admins can roll forward but never silently overwrite history.
CREATE TABLE IF NOT EXISTS skill_versions (
  skill_id              TEXT NOT NULL REFERENCES skills_catalogue(skill_id) ON DELETE CASCADE,
  version               TEXT NOT NULL,
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL,
  category              TEXT NOT NULL DEFAULT 'general',
  publisher_name        TEXT NOT NULL,
  publisher_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  kind                  TEXT NOT NULL,
  manifest              JSONB NOT NULL,
  capabilities          JSONB NOT NULL DEFAULT '[]',
  pricing_tier_min      TEXT NOT NULL DEFAULT 'free',
  changelog             TEXT,
  published_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (skill_id, version)
);
CREATE INDEX IF NOT EXISTS skill_versions_recent_idx
  ON skill_versions(skill_id, published_at DESC);

-- Spec 022 v0.3 — SKILL.md content. A skill is more than metadata;
-- it carries the procedural knowledge the agent uses ("how to do this
-- task"). These columns hold the Anthropic-style SKILL.md fields.
-- All NULL-able / additive — existing rows survive migration.
ALTER TABLE skills_catalogue
  ADD COLUMN IF NOT EXISTS instructions_md   TEXT,
  ADD COLUMN IF NOT EXISTS when_to_use       TEXT,
  ADD COLUMN IF NOT EXISTS examples_md       TEXT,
  ADD COLUMN IF NOT EXISTS supporting_files  JSONB NOT NULL DEFAULT '{}';

ALTER TABLE skill_versions
  ADD COLUMN IF NOT EXISTS instructions_md   TEXT,
  ADD COLUMN IF NOT EXISTS when_to_use       TEXT,
  ADD COLUMN IF NOT EXISTS examples_md       TEXT,
  ADD COLUMN IF NOT EXISTS supporting_files  JSONB NOT NULL DEFAULT '{}';

-- Spec 022 v0.5 — install + usage telemetry.
-- Tracks which signed-in users have which skills (skill_installations)
-- and individual invocation events (skill_usage_events).
-- BYOK / signed-out users are never recorded here — Constitution
-- Principle I: their activity never traverses Atlas infrastructure.
CREATE TABLE IF NOT EXISTS skill_installations (
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id           TEXT NOT NULL REFERENCES skills_catalogue(skill_id) ON DELETE CASCADE,
  installed_version  TEXT NOT NULL,
  installed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at       TIMESTAMPTZ,
  invocation_count   INTEGER NOT NULL DEFAULT 0,
  device_install_id  UUID,
  PRIMARY KEY (user_id, skill_id)
);
CREATE INDEX IF NOT EXISTS skill_installations_skill_idx
  ON skill_installations(skill_id);
CREATE INDEX IF NOT EXISTS skill_installations_recent_idx
  ON skill_installations(skill_id, last_used_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS skill_usage_events (
  id                UUID PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id          TEXT NOT NULL REFERENCES skills_catalogue(skill_id) ON DELETE CASCADE,
  version           TEXT NOT NULL,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger_phrase    TEXT,
  device_install_id UUID,
  context           JSONB
);
CREATE INDEX IF NOT EXISTS skill_usage_events_skill_recent_idx
  ON skill_usage_events(skill_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS skill_usage_events_user_recent_idx
  ON skill_usage_events(user_id, occurred_at DESC);

-- Spec 040 v0.1 — Tool providers (web search, scraping, etc.).
-- API keys are pgcrypto-encrypted at rest; the symmetric passphrase
-- comes from TOOL_KEY_ENCRYPTION_PASSPHRASE (env). In responses we
-- only ever return the LAST 4 chars of the key for verification.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tool_providers (
  name              TEXT PRIMARY KEY,        -- slug e.g. 'brave_search', 'my-custom'
  display_name      TEXT NOT NULL,
  kind              TEXT NOT NULL,           -- 'search' | 'scrape' | 'both' | 'custom'
  provider_type     TEXT NOT NULL,           -- 'brave' | 'tavily' | 'firecrawl' | 'serper' | 'custom_http'
  base_url          TEXT,                    -- only for custom_http
  api_key_encrypted BYTEA,                   -- pgp_sym_encrypt(key, passphrase)
  api_key_hint      TEXT,                    -- last 4 chars, plaintext, for UI confirmation
  auth_scheme       TEXT,                    -- 'bearer' | 'x-api-key' | 'x-subscription-token' | 'query:key' | 'custom'
  config            JSONB NOT NULL DEFAULT '{}',
  rate_limit_rpm    INTEGER,
  enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-tier daily quotas for tool usage. Enforced by the proxy layer
-- BEFORE any upstream call (Constitution Principle V).
CREATE TABLE IF NOT EXISTS tool_quotas (
  tier                TEXT PRIMARY KEY,
  searches_per_day    INTEGER,
  scrapes_per_day     INTEGER,
  budget_usd_per_day  NUMERIC(10, 4),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit + billing log for every forwarded tool call.
CREATE TABLE IF NOT EXISTS tool_usage_events (
  id               UUID PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_name        TEXT NOT NULL,
  provider         TEXT NOT NULL,
  input_size       INTEGER,
  output_size      INTEGER,
  cost_usd         NUMERIC(10, 6) NOT NULL DEFAULT 0,
  status           TEXT NOT NULL,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  context          JSONB
);
CREATE INDEX IF NOT EXISTS tool_usage_events_user_recent_idx
  ON tool_usage_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS tool_usage_events_provider_recent_idx
  ON tool_usage_events(provider, occurred_at DESC);

-- Seed default quotas. ON CONFLICT no-op so admin edits stick.
INSERT INTO tool_quotas (tier, searches_per_day, scrapes_per_day, budget_usd_per_day)
VALUES
  ('free',          10,     5,    0.10),
  ('pro',          500,   200,    5.00),
  ('team',        2000,   800,   20.00),
  ('enterprise',  NULL,  NULL, 1000.00)
ON CONFLICT (tier) DO NOTHING;

-- Spec 011 — Central model catalogue.
-- Source-of-truth for (provider, model) pricing + capabilities. The
-- desktop catalogue ships bundled for offline use; this table is the
-- canonical source for the admin panel and the cloud proxy (spec 003).
-- Org overrides will layer on top once orgs exist (spec 021).
CREATE TABLE IF NOT EXISTS model_catalogue (
  provider              TEXT NOT NULL,
  model                 TEXT NOT NULL,
  display_name          TEXT,
  input_per_million     NUMERIC(10, 4) NOT NULL DEFAULT 0,
  output_per_million    NUMERIC(10, 4) NOT NULL DEFAULT 0,
  context_window        INTEGER,
  capabilities          JSONB NOT NULL DEFAULT '[]',
  currency              TEXT NOT NULL DEFAULT 'USD',
  deprecated            BOOLEAN NOT NULL DEFAULT FALSE,
  notes                 TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, model)
);
CREATE INDEX IF NOT EXISTS model_catalogue_provider_idx ON model_catalogue(provider);

-- ============================================================================
-- Spec 050 v0.1 — Teams & Organization Licensing
-- An Organization is the billable entity. Every user belongs to at least one
-- (their auto-created "personal" org). Every billable event row gets a
-- denormalised organization_id so usage logs aggregate at user OR org grain.
-- ============================================================================

CREATE TABLE IF NOT EXISTS organizations (
  id                 UUID PRIMARY KEY,
  slug               TEXT UNIQUE NOT NULL,
  display_name       TEXT NOT NULL,
  plan               TEXT NOT NULL DEFAULT 'free',
  owner_user_id      UUID NOT NULL REFERENCES users(id),
  max_seats          INTEGER NOT NULL DEFAULT 1,
  monthly_budget_usd NUMERIC(10,2),                  -- NULL = unlimited (enterprise)
  monthly_tools_usd  NUMERIC(10,2),                  -- NULL = unlimited
  is_personal        BOOLEAN NOT NULL DEFAULT FALSE, -- the auto-created org-of-one
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS organizations_owner_idx ON organizations(owner_user_id);
CREATE INDEX IF NOT EXISTS organizations_plan_idx ON organizations(plan);

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,  -- owner | admin | member | viewer
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS organization_members_user_idx ON organization_members(user_id);

CREATE TABLE IF NOT EXISTS organization_invitations (
  id                  UUID PRIMARY KEY,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  role                TEXT NOT NULL,
  invited_by_user_id  UUID NOT NULL REFERENCES users(id),
  token_hash          TEXT NOT NULL,                  -- bcrypt(token); one-shot use
  expires_at          TIMESTAMPTZ NOT NULL,
  accepted_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS organization_invitations_org_idx
  ON organization_invitations(organization_id) WHERE accepted_at IS NULL;

CREATE TABLE IF NOT EXISTS organization_subscriptions (
  organization_id        UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  status                 TEXT NOT NULL DEFAULT 'active',  -- active|past_due|canceled|paused|trialing
  current_period_end     TIMESTAMPTZ,
  seat_count             INTEGER NOT NULL DEFAULT 1,
  trial_ends_at          TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Org-level provider key overrides (extends spec 040). Reuses the same
-- pgcrypto symmetric passphrase as tool_providers. Business+ tier feature.
CREATE TABLE IF NOT EXISTS organization_tool_providers (
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_type        TEXT NOT NULL,
  api_key_encrypted    BYTEA NOT NULL,
  api_key_hint         TEXT NOT NULL,
  enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, provider_type)
);

-- Denormalised org column on every billable event table for fast pivots.
-- Nullable for the brief window before backfill runs; populated by backfill
-- below and by all NEW rows via app-layer write paths.

ALTER TABLE usage_events        ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE tool_usage_events   ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Spec 040 v0.2 / Fix-1 — capture session_id so the admin can pivot
-- "web searches per session" alongside per-user / per-org / per-day.
-- Nullable: only goosed-originated calls have a session; out-of-band
-- proxy calls (admin smoke tests etc.) can leave it NULL.
ALTER TABLE tool_usage_events   ADD COLUMN IF NOT EXISTS session_id TEXT;
CREATE INDEX IF NOT EXISTS tool_usage_events_session_idx
  ON tool_usage_events(session_id, occurred_at DESC) WHERE session_id IS NOT NULL;
ALTER TABLE skill_usage_events  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE skill_installations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE audit_events        ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

CREATE INDEX IF NOT EXISTS usage_events_org_recent_idx
  ON usage_events(organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS tool_usage_events_org_recent_idx
  ON tool_usage_events(organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS skill_usage_events_org_recent_idx
  ON skill_usage_events(organization_id, occurred_at DESC);

-- ----------------------------------------------------------------------------
-- Spec 050 v0.1 backfill — runs idempotently as part of schema migration.
-- For every existing user without a personal org: create one, add owner
-- membership, populate organization_id on historical event rows.
-- ----------------------------------------------------------------------------

-- 1. Create personal org for every user missing one
INSERT INTO organizations (id, slug, display_name, plan, owner_user_id, max_seats, is_personal)
SELECT
  gen_random_uuid(),
  'personal-' || LEFT(u.id::text, 8),
  COALESCE(u.display_name, u.email, 'Personal'),
  'free',
  u.id,
  1,
  TRUE
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM organizations o
  WHERE o.owner_user_id = u.id AND o.is_personal = TRUE
);

-- 2. Owner membership for every personal org
INSERT INTO organization_members (organization_id, user_id, role)
SELECT o.id, o.owner_user_id, 'owner'
FROM organizations o
WHERE o.is_personal = TRUE
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- 3. Backfill organization_id on historical events using each user's personal org
UPDATE usage_events e
SET organization_id = o.id
FROM organizations o
WHERE o.owner_user_id = e.user_id AND o.is_personal = TRUE
  AND e.organization_id IS NULL;

UPDATE tool_usage_events e
SET organization_id = o.id
FROM organizations o
WHERE o.owner_user_id = e.user_id AND o.is_personal = TRUE
  AND e.organization_id IS NULL;

UPDATE skill_usage_events e
SET organization_id = o.id
FROM organizations o
WHERE o.owner_user_id = e.user_id AND o.is_personal = TRUE
  AND e.organization_id IS NULL;

UPDATE skill_installations e
SET organization_id = o.id
FROM organizations o
WHERE o.owner_user_id = e.user_id AND o.is_personal = TRUE
  AND e.organization_id IS NULL;

UPDATE audit_events e
SET organization_id = o.id
FROM organizations o
WHERE o.owner_user_id = e.user_id AND o.is_personal = TRUE
  AND e.organization_id IS NULL
  AND e.user_id IS NOT NULL;

-- 4. Default subscription row (free / active) for every org missing one
INSERT INTO organization_subscriptions (organization_id, status, seat_count)
SELECT o.id, 'active', o.max_seats
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM organization_subscriptions s WHERE s.organization_id = o.id
);
