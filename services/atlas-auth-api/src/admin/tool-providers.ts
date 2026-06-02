/**
 * Spec 040 v0.1 — Tool-provider admin queries.
 *
 * API keys are encrypted at rest via pgcrypto's pgp_sym_encrypt with a
 * symmetric passphrase from TOOL_KEY_ENCRYPTION_PASSPHRASE. Admin reads
 * never return the plaintext key — only `api_key_hint` (last 4 chars).
 * The proxy layer (next session) decrypts at call time using the same
 * passphrase.
 *
 * Rotating the passphrase requires re-saving every provider's API key.
 */

import type pg from 'pg';

export type ToolProviderType = 'brave' | 'tavily' | 'firecrawl' | 'serper' | 'custom_http';
export type ToolProviderKind = 'search' | 'scrape' | 'both' | 'custom';
export type AuthScheme =
  | 'bearer'
  | 'x-api-key'
  | 'x-subscription-token'
  | 'query:key'
  | 'custom';

export interface ToolProviderRow {
  name: string;
  display_name: string;
  kind: ToolProviderKind;
  provider_type: ToolProviderType;
  base_url: string | null;
  api_key_hint: string | null;     // last 4 chars; plaintext-safe
  auth_scheme: AuthScheme | null;
  config: Record<string, unknown>;
  rate_limit_rpm: number | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  has_api_key: boolean;            // computed in SQL
}

/**
 * Built-in provider templates. Used by the admin UI to pre-fill the
 * "Add provider" form. A user can always pick `custom_http` and bring
 * their own base_url + auth scheme.
 */
export const PROVIDER_TEMPLATES: Array<{
  provider_type: ToolProviderType;
  display_name: string;
  kind: ToolProviderKind;
  base_url: string;
  auth_scheme: AuthScheme;
  notes: string;
  signup_url: string;
}> = [
  {
    provider_type: 'brave',
    display_name: 'Brave Search',
    kind: 'search',
    base_url: 'https://api.search.brave.com/res/v1/web/search',
    auth_scheme: 'x-subscription-token',
    notes: 'Free tier: 2,000 queries/month. Paid plans start $5/mo.',
    signup_url: 'https://brave.com/search/api/',
  },
  {
    provider_type: 'tavily',
    display_name: 'Tavily',
    kind: 'search',
    base_url: 'https://api.tavily.com/search',
    auth_scheme: 'bearer',
    notes: 'AI-agent-tuned search. Free tier: 1,000 queries/month.',
    signup_url: 'https://tavily.com',
  },
  {
    provider_type: 'serper',
    display_name: 'Serper',
    kind: 'search',
    base_url: 'https://google.serper.dev/search',
    auth_scheme: 'x-api-key',
    notes: 'Google SERP scraper. 2,500 free queries on signup.',
    signup_url: 'https://serper.dev',
  },
  {
    provider_type: 'firecrawl',
    display_name: 'Firecrawl',
    kind: 'scrape',
    base_url: 'https://api.firecrawl.dev/v1/scrape',
    auth_scheme: 'bearer',
    notes: 'Returns clean markdown from any URL. Free 500 scrapes/mo.',
    signup_url: 'https://firecrawl.dev',
  },
  {
    provider_type: 'custom_http',
    display_name: 'Custom HTTP',
    kind: 'custom',
    base_url: '',
    auth_scheme: 'bearer',
    notes: 'Roll your own — point at any HTTP endpoint with your auth.',
    signup_url: '',
  },
];

const SELECT_PROVIDER = `
  SELECT name, display_name, kind, provider_type, base_url, api_key_hint,
         auth_scheme, config, rate_limit_rpm, enabled, created_at, updated_at,
         (api_key_encrypted IS NOT NULL) AS has_api_key
    FROM tool_providers
`;

export async function listToolProviders(pool: pg.Pool): Promise<ToolProviderRow[]> {
  const { rows } = await pool.query<ToolProviderRow>(
    `${SELECT_PROVIDER} ORDER BY enabled DESC, display_name ASC`
  );
  return rows;
}

export async function getToolProvider(
  pool: pg.Pool,
  name: string
): Promise<ToolProviderRow | null> {
  const { rows } = await pool.query<ToolProviderRow>(
    `${SELECT_PROVIDER} WHERE name = $1`,
    [name]
  );
  return rows[0] ?? null;
}

export interface ToolProviderUpsert {
  name: string;
  display_name: string;
  kind: ToolProviderKind;
  provider_type: ToolProviderType;
  base_url?: string | null;
  /** When null/undefined the existing key is preserved. Pass '' to unset. */
  api_key?: string | null;
  auth_scheme?: AuthScheme | null;
  config?: Record<string, unknown>;
  rate_limit_rpm?: number | null;
  enabled?: boolean;
}

/**
 * Upsert a provider. If api_key is null/undefined, the existing encrypted
 * key is preserved. If api_key is an empty string, the key is cleared.
 * Otherwise the key is re-encrypted.
 */
export async function upsertToolProvider(
  pool: pg.Pool,
  passphrase: string,
  p: ToolProviderUpsert
): Promise<void> {
  const existing = await getToolProvider(pool, p.name);
  const keyAction: 'preserve' | 'set' | 'clear' =
    p.api_key == null ? 'preserve' : p.api_key.length === 0 ? 'clear' : 'set';
  const hint =
    keyAction === 'preserve'
      ? existing?.api_key_hint ?? null
      : keyAction === 'clear'
        ? null
        : p.api_key!.slice(-4);

  if (keyAction === 'preserve') {
    await pool.query(
      `INSERT INTO tool_providers
         (name, display_name, kind, provider_type, base_url, auth_scheme,
          config, rate_limit_rpm, enabled, api_key_hint, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,NOW())
       ON CONFLICT (name) DO UPDATE SET
         display_name   = EXCLUDED.display_name,
         kind           = EXCLUDED.kind,
         provider_type  = EXCLUDED.provider_type,
         base_url       = EXCLUDED.base_url,
         auth_scheme    = EXCLUDED.auth_scheme,
         config         = EXCLUDED.config,
         rate_limit_rpm = EXCLUDED.rate_limit_rpm,
         enabled        = EXCLUDED.enabled,
         updated_at     = NOW()`,
      [
        p.name,
        p.display_name,
        p.kind,
        p.provider_type,
        p.base_url ?? null,
        p.auth_scheme ?? null,
        JSON.stringify(p.config ?? {}),
        p.rate_limit_rpm ?? null,
        p.enabled ?? false,
        hint,
      ]
    );
    return;
  }

  if (keyAction === 'clear') {
    await pool.query(
      `INSERT INTO tool_providers
         (name, display_name, kind, provider_type, base_url, auth_scheme,
          config, rate_limit_rpm, enabled, api_key_encrypted, api_key_hint,
          updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,NULL,NULL,NOW())
       ON CONFLICT (name) DO UPDATE SET
         display_name      = EXCLUDED.display_name,
         kind              = EXCLUDED.kind,
         provider_type     = EXCLUDED.provider_type,
         base_url          = EXCLUDED.base_url,
         auth_scheme       = EXCLUDED.auth_scheme,
         config            = EXCLUDED.config,
         rate_limit_rpm    = EXCLUDED.rate_limit_rpm,
         enabled           = EXCLUDED.enabled,
         api_key_encrypted = NULL,
         api_key_hint      = NULL,
         updated_at        = NOW()`,
      [
        p.name,
        p.display_name,
        p.kind,
        p.provider_type,
        p.base_url ?? null,
        p.auth_scheme ?? null,
        JSON.stringify(p.config ?? {}),
        p.rate_limit_rpm ?? null,
        p.enabled ?? false,
      ]
    );
    return;
  }

  // keyAction === 'set' — pgp_sym_encrypt the new key.
  await pool.query(
    `INSERT INTO tool_providers
       (name, display_name, kind, provider_type, base_url, auth_scheme,
        config, rate_limit_rpm, enabled,
        api_key_encrypted, api_key_hint, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,
             pgp_sym_encrypt($10, $11), $12, NOW())
     ON CONFLICT (name) DO UPDATE SET
       display_name      = EXCLUDED.display_name,
       kind              = EXCLUDED.kind,
       provider_type     = EXCLUDED.provider_type,
       base_url          = EXCLUDED.base_url,
       auth_scheme       = EXCLUDED.auth_scheme,
       config            = EXCLUDED.config,
       rate_limit_rpm    = EXCLUDED.rate_limit_rpm,
       enabled           = EXCLUDED.enabled,
       api_key_encrypted = EXCLUDED.api_key_encrypted,
       api_key_hint      = EXCLUDED.api_key_hint,
       updated_at        = NOW()`,
    [
      p.name,
      p.display_name,
      p.kind,
      p.provider_type,
      p.base_url ?? null,
      p.auth_scheme ?? null,
      JSON.stringify(p.config ?? {}),
      p.rate_limit_rpm ?? null,
      p.enabled ?? false,
      p.api_key,
      passphrase,
      hint,
    ]
  );
}

export async function deleteToolProvider(pool: pg.Pool, name: string): Promise<void> {
  await pool.query(`DELETE FROM tool_providers WHERE name = $1`, [name]);
}

/**
 * Decrypt and return the plaintext API key for runtime use ONLY. Never
 * expose this through an HTTP route — callers should be in-process
 * server code that needs the key to call upstream.
 */
export async function decryptApiKey(
  pool: pg.Pool,
  passphrase: string,
  name: string
): Promise<string | null> {
  const { rows } = await pool.query<{ key: string | null }>(
    `SELECT pgp_sym_decrypt(api_key_encrypted, $2)::text AS key
       FROM tool_providers
      WHERE name = $1 AND api_key_encrypted IS NOT NULL`,
    [name, passphrase]
  );
  return rows[0]?.key ?? null;
}

// ----- Quotas ----------------------------------------------------------

export interface ToolQuotaRow {
  tier: 'free' | 'pro' | 'team' | 'enterprise';
  searches_per_day: number | null;
  scrapes_per_day: number | null;
  budget_usd_per_day: string;       // numeric → string via pg
  updated_at: string;
}

export async function listToolQuotas(pool: pg.Pool): Promise<ToolQuotaRow[]> {
  const { rows } = await pool.query<ToolQuotaRow>(
    `SELECT tier, searches_per_day, scrapes_per_day,
            budget_usd_per_day::text, updated_at
       FROM tool_quotas
       ORDER BY CASE tier
         WHEN 'free' THEN 0
         WHEN 'pro' THEN 1
         WHEN 'team' THEN 2
         WHEN 'enterprise' THEN 3
         ELSE 4
       END`
  );
  return rows;
}

export async function updateToolQuota(
  pool: pg.Pool,
  tier: string,
  patch: {
    searches_per_day?: number | null;
    scrapes_per_day?: number | null;
    budget_usd_per_day?: number;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!['free', 'pro', 'team', 'enterprise'].includes(tier)) {
    return { ok: false, error: 'invalid_tier' };
  }
  await pool.query(
    `UPDATE tool_quotas
        SET searches_per_day  = COALESCE($2, searches_per_day),
            scrapes_per_day   = COALESCE($3, scrapes_per_day),
            budget_usd_per_day = COALESCE($4, budget_usd_per_day),
            updated_at        = NOW()
      WHERE tier = $1`,
    [
      tier,
      patch.searches_per_day === undefined ? null : patch.searches_per_day,
      patch.scrapes_per_day === undefined ? null : patch.scrapes_per_day,
      patch.budget_usd_per_day ?? null,
    ]
  );
  return { ok: true };
}
