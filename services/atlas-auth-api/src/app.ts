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
      const access = await signAccessToken(env.JWT_SIGNING_SECRET, {
        sub: user.id,
        email: user.email,
        sub_tier: sub.tier,
        device_install_id: deviceInstallId,
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
      const access = await signAccessToken(env.JWT_SIGNING_SECRET, {
        sub: user.id,
        email: user.email,
        sub_tier: sub.tier,
        device_install_id: row.device_install_id,
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
