/**
 * Atlas auth backend — Hono app. Spec 002-cloud-auth.
 *
 * Endpoints (per contracts/auth-backend-api.md):
 *   POST /v1/auth/token            — code or refresh grant
 *   POST /v1/auth/revoke           — sign-out (cascading revoke)
 *   GET  /v1/me                    — profile + tier (Bearer)
 *   GET  /v1/subscription          — tier + quota (Bearer, 4-min cache)
 *   GET  /healthz                  — liveness
 *   GET  /.well-known/jwks.json    — 404 at v1 (HS256, no public key)
 */

import { Hono, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { randomUUID } from 'node:crypto';
import { getPool } from './db/index.js';
import { signAccessToken, verifyAccessToken } from './jwt.js';
import {
  findRefreshTokenRow,
  issueRefreshToken,
  revokeAllForUser,
  revokeOne,
  rotate,
} from './refresh.js';
import { pickIdp } from './idp/index.js';
import { emit as auditEmit } from './audit.js';
import { stubAuthStartHtml } from './stub-page.js';
import { mountAdmin } from './admin/routes.js';
import { listSkills, recordInstall, recordUninstall, recordUsage } from './admin/queries.js';
import { ensurePersonalOrg } from './admin/organizations.js';
import {
  acceptInvitation,
  createInvitation,
  createTeamOrganization,
  listMyOrganizations,
  userIsMemberWithRole,
} from './admin/invitations.js';
import {
  decryptApiKey,
  getToolProvider,
  type ToolProviderType,
} from './admin/tool-providers.js';
import {
  callCustomHttp,
  scrapeFirecrawl,
  searchBrave,
  searchSerper,
  searchTavily,
  type AdapterResult,
} from './tools/adapters.js';
import { preflight, recordToolUsage } from './tools/preflight.js';
import {
  entitlementsFor,
  getSubscription,
  upsertUser,
} from './users.js';

interface Env {
  DATABASE_URL: string;
  JWT_SIGNING_SECRET: string;
  STUB_IDP?: string;
  WORKOS_CLIENT_ID?: string;
  WORKOS_API_KEY?: string;
  CORS_ORIGINS?: string;
  ADMIN_TOKEN?: string;
  TOOL_KEY_ENCRYPTION_PASSPHRASE?: string;
}

type Vars = {
  reqId: string;
  claims: import('./jwt.js').AccessTokenClaims;
};

export function createApp(env: Env) {
  const app = new Hono<{ Variables: Vars }>();
  const pool = getPool(env.DATABASE_URL);
  const idp = pickIdp(env as unknown as NodeJS.ProcessEnv);

  const allowedOrigins = (env.CORS_ORIGINS ?? '').split(',').filter(Boolean);
  app.use(
    '/v1/*',
    cors({
      origin: (origin) => {
        if (!origin) return undefined;
        if (allowedOrigins.includes(origin)) return origin;
        // Permit Atlas desktop loopback (R-API-003).
        if (/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) return origin;
        return undefined;
      },
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['authorization', 'content-type'],
      maxAge: 600,
    })
  );

  // R-API-002 + R-API-005
  app.use('*', async (c, next) => {
    const reqId = c.req.header('x-atlas-request-id') ?? randomUUID();
    c.set('reqId', reqId);
    await next();
    c.header('X-Atlas-Request-Id', reqId);
    c.header(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  });

  // Admin panel — HTML page + JSON endpoints. ADMIN_TOKEN gates the JSON;
  // the page itself is public and self-gates client-side.
  mountAdmin(app, env);

  app.get('/healthz', (c) => c.text('ok'));
  app.get('/.well-known/jwks.json', (c) =>
    c.json({ error: 'jwks_unavailable_at_v1', hint: 'use GET /v1/me' }, 404)
  );

  // GET /v1/auth/start — the URL the desktop opens in the user's browser.
  // In production this redirects to WorkOS AuthKit with PKCE; in stub mode
  // we serve a dev-only HTML page that lets the developer mint a fake code
  // and finish the loop on the same machine.
  app.get('/v1/auth/start', (c) => {
    if (env.STUB_IDP === 'true') {
      const state = c.req.query('state') ?? '';
      const redirect = c.req.query('redirect_uri') ?? 'atlas://auth';
      return c.html(stubAuthStartHtml({ state, redirect }));
    }
    const idp2 = idp;
    const url = idp2.authorizationUrl({
      state: c.req.query('state') ?? '',
      codeChallenge: c.req.query('code_challenge') ?? '',
      redirectUri: c.req.query('redirect_uri') ?? '',
    });
    return c.redirect(url, 302);
  });

  // --- POST /v1/auth/token --------------------------------------------------
  app.post('/v1/auth/token', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: 'invalid_request' }, 400);
    }
    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null;

    if (body.grant_type === 'authorization_code') {
      const { code, code_verifier, redirect_uri } = body as {
        code?: string;
        code_verifier?: string;
        redirect_uri?: string;
      };
      if (!code || !code_verifier || !redirect_uri) {
        return c.json({ error: 'invalid_request', detail: 'missing code/code_verifier/redirect_uri' }, 400);
      }

      let profile;
      try {
        profile = await idp.exchange({ code, codeVerifier: code_verifier, redirectUri: redirect_uri });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'idp_error';
        const code = (e as Error & { code?: string }).code ?? 'idp_error';
        await auditEmit(pool, {
          userId: null,
          type: 'sign_in_failure',
          errorCode: code,
          ip: ip ?? undefined,
        }).catch(() => {});
        if (code === 'idp_upstream_error') {
          return c.json({ error: 'upstream', detail: msg }, 500);
        }
        return c.json({ error: code }, 401);
      }

      const user = await upsertUser(pool, profile);
      const deviceInstallId = randomUUID();
      const refresh = await issueRefreshToken(pool, user.id, deviceInstallId);
      const sub = (await getSubscription(pool, user.id)) ?? {
        user_id: user.id, tier: 'free', monthly_token_quota: null,
        monthly_tokens_used: 0, renews_at: null, entitlements: [],
      };
      const activeOrg = await ensurePersonalOrg(
        pool,
        user.id,
        user.display_name ?? user.email
      );
      const access = await signAccessToken(env.JWT_SIGNING_SECRET, {
        sub: user.id,
        email: user.email,
        sub_tier: sub.tier,
        device_install_id: deviceInstallId,
        org: activeOrg,
      });

      await auditEmit(pool, {
        userId: user.id, type: 'sign_in_success', ip: ip ?? undefined,
      }).catch(() => {});

      return c.json({
        access_token: access,
        refresh_token: refresh.raw,
        token_type: 'Bearer',
        expires_in: 900,
        user: {
          id: user.id,
          email: user.email,
          name: user.display_name,
          picture: user.picture_url,
          sub_tier: sub.tier,
        },
        device_install_id: deviceInstallId,
      });
    }

    if (body.grant_type === 'refresh_token') {
      const raw = (body as { refresh_token?: string }).refresh_token;
      if (!raw) return c.json({ error: 'invalid_request' }, 400);

      const row = await findRefreshTokenRow(pool, raw);
      if (!row) return c.json({ error: 'invalid_grant' }, 401);

      // Rotation theft: previously rotated OR revoked → revoke everything.
      if (row.revoked_at !== null || row.rotated_to_id !== null) {
        await revokeAllForUser(pool, row.user_id);
        await auditEmit(pool, {
          userId: row.user_id, type: 'token_theft_suspected',
          ip: ip ?? undefined,
        }).catch(() => {});
        return c.json({ error: 'token_theft_suspected' }, 403);
      }

      const newRefresh = await rotate(pool, row);

      // Load user + sub for fresh JWT.
      const { rows: userRows } = await pool.query<{
        id: string; email: string; display_name: string | null; picture_url: string | null;
      }>(`SELECT id, email, display_name, picture_url FROM users WHERE id = $1`, [row.user_id]);
      const user = userRows[0];
      if (!user) return c.json({ error: 'user_missing' }, 401);
      const sub = (await getSubscription(pool, user.id)) ?? {
        user_id: user.id, tier: 'free' as const, monthly_token_quota: null,
        monthly_tokens_used: 0, renews_at: null, entitlements: [],
      };
      const activeOrg = await ensurePersonalOrg(
        pool,
        user.id,
        user.display_name ?? user.email
      );
      const access = await signAccessToken(env.JWT_SIGNING_SECRET, {
        sub: user.id,
        email: user.email,
        sub_tier: sub.tier,
        device_install_id: row.device_install_id,
        org: activeOrg,
      });

      await auditEmit(pool, {
        userId: user.id, type: 'token_refresh', ip: ip ?? undefined,
      }).catch(() => {});

      return c.json({
        access_token: access,
        refresh_token: newRefresh.raw,
        token_type: 'Bearer',
        expires_in: 900,
        user: {
          id: user.id,
          email: user.email,
          name: user.display_name,
          picture: user.picture_url,
          sub_tier: sub.tier,
        },
        device_install_id: row.device_install_id,
      });
    }

    return c.json({ error: 'unsupported_grant_type' }, 400);
  });

  // --- POST /v1/auth/revoke -------------------------------------------------
  app.post('/v1/auth/revoke', async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | { refresh_token?: string }
      | null;
    const raw = body?.refresh_token;
    if (!raw) return c.body(null, 204); // idempotent
    const row = await findRefreshTokenRow(pool, raw);
    if (row) {
      await revokeOne(pool, row.id);
      // Cascade — sign out everywhere.
      await revokeAllForUser(pool, row.user_id);
      await auditEmit(pool, {
        userId: row.user_id, type: 'sign_out',
      }).catch(() => {});
    }
    return c.body(null, 204);
  });

  // --- Bearer middleware for /v1/me + /v1/subscription ---------------------
  const requireAccess: MiddlewareHandler<{ Variables: Vars }> = async (c, next) => {
    const auth = c.req.header('authorization') ?? '';
    const m = /^Bearer (.+)$/.exec(auth);
    if (!m) return c.json({ error: 'unauthenticated' }, 401);
    try {
      const claims = await verifyAccessToken(env.JWT_SIGNING_SECRET, m[1]);
      c.set('claims', claims);
      await next();
      return;
    } catch {
      return c.json({ error: 'unauthenticated' }, 401);
    }
  };

  app.get('/v1/me', requireAccess, async (c) => {
    const claims = c.get('claims');
    const { rows } = await pool.query<{
      id: string; email: string; display_name: string | null; picture_url: string | null;
    }>(`SELECT id, email, display_name, picture_url FROM users WHERE id = $1`, [claims.sub]);
    const u = rows[0];
    if (!u) return c.json({ error: 'user_missing' }, 401);
    const sub = (await getSubscription(pool, u.id)) ?? null;
    const tier = sub?.tier ?? 'free';
    return c.json({
      id: u.id,
      email: u.email,
      name: u.display_name,
      picture: u.picture_url,
      sub_tier: tier,
      entitlements: sub?.entitlements?.length ? sub.entitlements : entitlementsFor(tier),
      device_install_id: claims.device_install_id,
    });
  });

  // Spec 022 v0.1 — public skill catalogue listing. The desktop reads
  // this to populate its Skills tab. No Bearer required for read-only
  // browse (matches how an app store's catalogue is public).
  // Cache 60s — catalogue changes are infrequent.
  app.get('/v1/skills', async (c) => {
    const skills = await listSkills(pool);
    c.header('Cache-Control', 'public, max-age=60');
    return c.json(
      skills.filter((s) => !s.deprecated).map((s) => ({
        skill_id: s.skill_id,
        version: s.version,
        title: s.title,
        description: s.description,
        category: s.category,
        publisher: { name: s.publisher_name, verified: s.publisher_verified },
        kind: s.kind,
        capabilities: s.capabilities,
        pricing_tier_min: s.pricing_tier_min,
        manifest: s.manifest,
        when_to_use: s.when_to_use,
        instructions_md: s.instructions_md,
        examples_md: s.examples_md,
        supporting_files: s.supporting_files,
        updated_at: s.updated_at,
      }))
    );
  });

  // Spec 022 v0.5 — install / uninstall / usage telemetry. Bearer-authed
  // so only signed-in users are recorded. BYOK / signed-out users never
  // hit these endpoints (Constitution Principle I).
  app.post('/v1/skills/:id/install', requireAccess, async (c) => {
    const claims = c.get('claims');
    const skillId = c.req.param('id');
    const body = (await c.req.json().catch(() => null)) as { version?: string } | null;
    if (!body || typeof body.version !== 'string') {
      return c.json({ error: 'invalid_request', detail: 'version required' }, 400);
    }
    await recordInstall(pool, claims.sub, skillId, body.version, claims.device_install_id ?? null);
    return c.json({ ok: true });
  });

  app.post('/v1/skills/:id/uninstall', requireAccess, async (c) => {
    const claims = c.get('claims');
    await recordUninstall(pool, claims.sub, c.req.param('id'));
    return c.json({ ok: true });
  });

  app.post('/v1/skills/:id/used', requireAccess, async (c) => {
    const claims = c.get('claims');
    const skillId = c.req.param('id');
    const body = (await c.req.json().catch(() => null)) as {
      version?: string;
      trigger_phrase?: string;
      context?: Record<string, unknown>;
    } | null;
    if (!body || typeof body.version !== 'string') {
      return c.json({ error: 'invalid_request', detail: 'version required' }, 400);
    }
    await recordUsage(
      pool,
      claims.sub,
      skillId,
      body.version,
      typeof body.trigger_phrase === 'string' ? body.trigger_phrase : null,
      claims.device_install_id ?? null,
      body.context ?? null
    );
    return c.json({ ok: true });
  });

  // --- Spec 040 v0.2 — Web tools (Bearer + quota preflight + adapters) ---

  async function callProviderAdapter(
    providerName: string,
    op: 'search' | 'scrape',
    query: string,
    count: number
  ): Promise<{ adapter: AdapterResult; providerType: string }> {
    const provider = await getToolProvider(pool, providerName);
    if (!provider || !provider.enabled) {
      throw Object.assign(new Error('provider_not_configured'), { httpStatus: 503 });
    }
    if (!env.TOOL_KEY_ENCRYPTION_PASSPHRASE) {
      throw Object.assign(new Error('encryption_not_configured'), { httpStatus: 503 });
    }
    const apiKey = await decryptApiKey(
      pool,
      env.TOOL_KEY_ENCRYPTION_PASSPHRASE,
      providerName
    );
    if (!apiKey) {
      throw Object.assign(new Error('provider_key_missing'), { httpStatus: 503 });
    }

    const type = provider.provider_type as ToolProviderType;
    let adapter: AdapterResult;
    if (op === 'search') {
      switch (type) {
        case 'brave':  adapter = await searchBrave(apiKey, query, count); break;
        case 'tavily': adapter = await searchTavily(apiKey, query, count); break;
        case 'serper': adapter = await searchSerper(apiKey, query, count); break;
        case 'custom_http':
          adapter = await callCustomHttp({
            apiKey, baseUrl: provider.base_url ?? '',
            authScheme: provider.auth_scheme ?? 'bearer',
            op: 'search', query, count,
          });
          break;
        default:
          throw Object.assign(new Error('provider_does_not_support_search'), { httpStatus: 400 });
      }
    } else {
      switch (type) {
        case 'firecrawl':
          adapter = await scrapeFirecrawl(apiKey, query); break;
        case 'custom_http':
          adapter = await callCustomHttp({
            apiKey, baseUrl: provider.base_url ?? '',
            authScheme: provider.auth_scheme ?? 'bearer',
            op: 'scrape', url: query,
          });
          break;
        default:
          throw Object.assign(new Error('provider_does_not_support_scrape'), { httpStatus: 400 });
      }
    }
    return { adapter, providerType: type };
  }

  app.post('/v1/tools/web/search', requireAccess, async (c) => {
    const claims = c.get('claims');
    const body = (await c.req.json().catch(() => null)) as {
      query?: string;
      count?: number;
      provider?: string;
      session_id?: string;
    } | null;
    if (!body || typeof body.query !== 'string' || !body.query.trim()) {
      return c.json({ error: 'invalid_request', detail: 'query required' }, 400);
    }
    const providerName = body.provider ?? 'brave';
    const count = typeof body.count === 'number' ? body.count : 10;
    const orgId = claims.org?.id ?? null;
    const sessionId = typeof body.session_id === 'string' && body.session_id ? body.session_id : null;

    // Preflight (Principle V — refuse BEFORE upstream)
    const pf = await preflight(pool, {
      userId: claims.sub,
      organizationId: orgId,
      tier: claims.sub_tier,
      op: 'search',
    });
    if (!pf.ok) {
      await recordToolUsage(pool, {
        userId: claims.sub, organizationId: orgId, sessionId,
        toolName: 'web_search', provider: providerName,
        inputSize: body.query.length, outputSize: 0,
        costUsd: 0, status: 'quota_exceeded',
        context: { reason: pf.reason, detail: pf.detail, query: body.query },
      });
      return c.json({ error: pf.reason, detail: pf.detail }, 402);
    }

    try {
      const { adapter, providerType } = await callProviderAdapter(
        providerName, 'search', body.query, count
      );
      await recordToolUsage(pool, {
        userId: claims.sub, organizationId: orgId, sessionId,
        toolName: 'web_search', provider: providerType,
        inputSize: adapter.input_size, outputSize: adapter.output_size,
        costUsd: adapter.cost_usd, status: adapter.status,
        context: { query: body.query, count,
          ...(adapter.upstream_error ? { upstream_error: adapter.upstream_error } : {}) },
      });
      if (adapter.status !== 'ok') {
        return c.json({ error: 'upstream_error', detail: adapter.upstream_error }, 502);
      }
      return c.json({ results: adapter.results, cost_usd: adapter.cost_usd });
    } catch (e) {
      const err = e as { message?: string; httpStatus?: number };
      return c.json({ error: err.message ?? 'unknown' }, (err.httpStatus ?? 500) as 500);
    }
  });

  app.post('/v1/tools/web/scrape', requireAccess, async (c) => {
    const claims = c.get('claims');
    const body = (await c.req.json().catch(() => null)) as {
      url?: string;
      provider?: string;
      session_id?: string;
    } | null;
    if (!body || typeof body.url !== 'string' || !body.url.startsWith('http')) {
      return c.json({ error: 'invalid_request', detail: 'http(s) url required' }, 400);
    }
    const providerName = body.provider ?? 'firecrawl';
    const orgId = claims.org?.id ?? null;
    const sessionId = typeof body.session_id === 'string' && body.session_id ? body.session_id : null;

    const pf = await preflight(pool, {
      userId: claims.sub,
      organizationId: orgId,
      tier: claims.sub_tier,
      op: 'scrape',
    });
    if (!pf.ok) {
      await recordToolUsage(pool, {
        userId: claims.sub, organizationId: orgId, sessionId,
        toolName: 'web_scrape', provider: providerName,
        inputSize: body.url.length, outputSize: 0,
        costUsd: 0, status: 'quota_exceeded',
        context: { reason: pf.reason, detail: pf.detail, url: body.url },
      });
      return c.json({ error: pf.reason, detail: pf.detail }, 402);
    }

    try {
      const { adapter, providerType } = await callProviderAdapter(
        providerName, 'scrape', body.url, 1
      );
      await recordToolUsage(pool, {
        userId: claims.sub, organizationId: orgId, sessionId,
        toolName: 'web_scrape', provider: providerType,
        inputSize: adapter.input_size, outputSize: adapter.output_size,
        costUsd: adapter.cost_usd, status: adapter.status,
        context: { url: body.url,
          ...(adapter.upstream_error ? { upstream_error: adapter.upstream_error } : {}) },
      });
      if (adapter.status !== 'ok') {
        return c.json({ error: 'upstream_error', detail: adapter.upstream_error }, 502);
      }
      return c.json({ result: adapter.results, cost_usd: adapter.cost_usd });
    } catch (e) {
      const err = e as { message?: string; httpStatus?: number };
      return c.json({ error: err.message ?? 'unknown' }, (err.httpStatus ?? 500) as 500);
    }
  });

  // --- Spec 050 v0.2 — Self-serve teams + invitations ---

  // List the orgs the current user belongs to (personal + every team).
  app.get('/v1/organizations/me', requireAccess, async (c) => {
    const claims = c.get('claims');
    const orgs = await listMyOrganizations(pool, claims.sub);
    return c.json({
      active_org_id: claims.org?.id ?? null,
      organizations: orgs,
    });
  });

  // Create a new team org. The caller becomes its `owner`.
  app.post('/v1/organizations', requireAccess, async (c) => {
    const claims = c.get('claims');
    const body = (await c.req.json().catch(() => null)) as {
      display_name?: string;
      plan?: 'free' | 'pro' | 'team' | 'business' | 'enterprise';
    } | null;
    if (!body || typeof body.display_name !== 'string' || !body.display_name.trim()) {
      return c.json({ error: 'invalid_request', detail: 'display_name required' }, 400);
    }
    const result = await createTeamOrganization(pool, {
      ownerUserId: claims.sub,
      displayName: body.display_name.trim().slice(0, 80),
      plan: body.plan ?? 'free',
    });
    return c.json({ id: result.id, slug: result.slug, role: 'owner' as const });
  });

  // Generate an invite code for an org you own/admin. Code is paste-shared.
  app.post('/v1/organizations/:id/invitations', requireAccess, async (c) => {
    const claims = c.get('claims');
    const orgId = c.req.param('id');
    const role = await userIsMemberWithRole(pool, claims.sub, orgId);
    if (role !== 'owner' && role !== 'admin') {
      return c.json({ error: 'forbidden', detail: 'owner or admin role required' }, 403);
    }
    const body = (await c.req.json().catch(() => null)) as {
      email?: string;
      role?: 'admin' | 'member' | 'viewer';
    } | null;
    if (!body || typeof body.email !== 'string' || !body.email.includes('@')) {
      return c.json({ error: 'invalid_request', detail: 'email required' }, 400);
    }
    const inv = await createInvitation(pool, {
      organizationId: orgId,
      inviterUserId: claims.sub,
      email: body.email,
      role: body.role ?? 'member',
    });
    return c.json({
      id: inv.id,
      code: inv.code,                   // ONLY returned at creation time
      expires_at: inv.expires_at,
    });
  });

  // Accept an invite code. Caller is signed in; the code identifies the org.
  app.post('/v1/invitations/accept', requireAccess, async (c) => {
    const claims = c.get('claims');
    const body = (await c.req.json().catch(() => null)) as { code?: string } | null;
    if (!body || typeof body.code !== 'string') {
      return c.json({ error: 'invalid_request', detail: 'code required' }, 400);
    }
    const result = await acceptInvitation(pool, claims.sub, body.code);
    if (!result.ok) {
      const code = result.reason;
      return c.json({ error: code }, code === 'invalid_code' ? 404 : 409);
    }
    return c.json({
      ok: true,
      organization_id: result.organization_id,
      role: result.role,
    });
  });

  // Switch the access token's active org. Re-signs immediately; client
  // replaces its token. Verifies membership first.
  app.post('/v1/auth/switch-org', requireAccess, async (c) => {
    const claims = c.get('claims');
    const body = (await c.req.json().catch(() => null)) as { organization_id?: string } | null;
    if (!body || typeof body.organization_id !== 'string') {
      return c.json({ error: 'invalid_request', detail: 'organization_id required' }, 400);
    }
    const role = await userIsMemberWithRole(pool, claims.sub, body.organization_id);
    if (!role) return c.json({ error: 'not_a_member' }, 403);

    const sub = (await getSubscription(pool, claims.sub)) ?? null;
    const tier = sub?.tier ?? 'free';
    const fresh = await signAccessToken(env.JWT_SIGNING_SECRET, {
      sub: claims.sub,
      email: claims.email,
      sub_tier: tier,
      device_install_id: claims.device_install_id,
      org: { id: body.organization_id, role },
    });
    return c.json({
      access_token: fresh,
      token_type: 'Bearer',
      expires_in: 900,
      org: { id: body.organization_id, role },
    });
  });

  app.get('/v1/subscription', requireAccess, async (c) => {
    const claims = c.get('claims');
    const sub = await getSubscription(pool, claims.sub);
    const tier = sub?.tier ?? 'free';
    c.header('Cache-Control', 'private, max-age=240');
    return c.json({
      tier,
      monthly_token_quota: sub?.monthly_token_quota ?? null,
      monthly_tokens_used: sub?.monthly_tokens_used ?? 0,
      renews_at: sub?.renews_at ? new Date(sub.renews_at).getTime() : null,
      entitlements: sub?.entitlements?.length ? sub.entitlements : entitlementsFor(tier),
    });
  });

  return app;
}
