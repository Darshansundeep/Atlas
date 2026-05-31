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
