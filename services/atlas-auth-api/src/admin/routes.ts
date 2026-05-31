/**
 * Admin routes — mounted at /admin/* by the main app.
 *
 * Auth model (v0.1): a shared bearer token in `ADMIN_TOKEN`. Anyone with
 * that token has full admin access. This is intentionally minimal — when
 * spec 021-admin-console lands, real role-based admin auth (org-scoped,
 * MFA-required) replaces it.
 *
 * The HTML page at /admin is public — it gates itself client-side and
 * proxies all data fetches through Bearer-authenticated JSON endpoints.
 */

import { Hono, type MiddlewareHandler } from 'hono';
import { getPool } from '../db/index.js';
import { adminHtml } from './page.js';
import {
  getStats,
  listActiveSessions,
  listAuditEvents,
  listUsers,
  revokeAllForUserAdmin,
  setUserTier,
} from './queries.js';
import { emit as auditEmit } from '../audit.js';

interface AdminEnv {
  DATABASE_URL: string;
  ADMIN_TOKEN?: string;
}

// `app` is the outer typed Hono (with Variables: Vars). We accept it as
// `any` because Hono's nested-route typing is over-strict for our purposes.
// The router is otherwise fully type-checked inside.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mountAdmin(app: any, env: AdminEnv): void {
  const pool = getPool(env.DATABASE_URL);
  const admin = new Hono();

  // The HTML shell is public — the page itself prompts for a token.
  admin.get('/', (c) => c.html(adminHtml()));

  // All /admin/v1/* requires ADMIN_TOKEN as bearer.
  const requireAdmin: MiddlewareHandler = async (c, next) => {
    if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 8) {
      return c.json({ error: 'admin_disabled', detail: 'ADMIN_TOKEN not configured' }, 503);
    }
    const auth = c.req.header('authorization') ?? '';
    const m = /^Bearer (.+)$/.exec(auth);
    if (!m || m[1] !== env.ADMIN_TOKEN) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    await next();
  };

  admin.use('/v1/*', requireAdmin);

  admin.get('/v1/stats', async (c) => c.json(await getStats(pool)));
  admin.get('/v1/users', async (c) => c.json(await listUsers(pool)));
  admin.get('/v1/sessions', async (c) => c.json(await listActiveSessions(pool)));
  admin.get('/v1/audit', async (c) => c.json(await listAuditEvents(pool)));

  admin.post('/v1/users/:id/revoke-all', async (c) => {
    const id = c.req.param('id');
    const n = await revokeAllForUserAdmin(pool, id);
    await auditEmit(pool, {
      userId: id,
      type: 'revoke_all',
      errorCode: `admin_action,n=${n}`,
    }).catch(() => {});
    return c.json({ ok: true, revoked: n });
  });

  admin.post('/v1/users/:id/tier', async (c) => {
    const id = c.req.param('id');
    const body = (await c.req.json().catch(() => null)) as { tier?: string } | null;
    const tier = body?.tier;
    if (tier !== 'free' && tier !== 'pro' && tier !== 'team' && tier !== 'enterprise') {
      return c.json({ error: 'invalid_tier' }, 400);
    }
    await setUserTier(pool, id, tier);
    return c.json({ ok: true });
  });

  app.route('/admin', admin);
}
