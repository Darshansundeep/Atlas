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
  deleteCatalogue,
  deleteSkill,
  getStats,
  listActiveSessions,
  listAuditEvents,
  listCatalogue,
  listSkillVersions,
  listSkills,
  listUsers,
  publishNewSkillVersion,
  revokeAllForUserAdmin,
  rollbackSkillToVersion,
  saveSkillInPlace,
  setUserTier,
  upsertCatalogue,
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

  // Spec 011 — model catalogue endpoints
  admin.get('/v1/catalogue', async (c) => c.json(await listCatalogue(pool)));

  admin.post('/v1/catalogue', async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.provider !== 'string' || typeof body.model !== 'string') {
      return c.json({ error: 'invalid_request', detail: 'provider + model required' }, 400);
    }
    const i = body.input_per_million as number | undefined;
    const o = body.output_per_million as number | undefined;
    if ((i !== undefined && (typeof i !== 'number' || i < 0 || i > 1000)) ||
        (o !== undefined && (typeof o !== 'number' || o < 0 || o > 1000))) {
      return c.json({ error: 'invalid_price' }, 400);
    }
    await upsertCatalogue(pool, {
      provider: body.provider,
      model: body.model,
      display_name: (body.display_name as string | null | undefined) ?? null,
      input_per_million: i,
      output_per_million: o,
      context_window: (body.context_window as number | null | undefined) ?? null,
      capabilities: Array.isArray(body.capabilities) ? (body.capabilities as string[]) : undefined,
      deprecated: typeof body.deprecated === 'boolean' ? body.deprecated : undefined,
      notes: (body.notes as string | null | undefined) ?? null,
    });
    return c.json({ ok: true });
  });

  admin.delete('/v1/catalogue/:provider/:model', async (c) => {
    await deleteCatalogue(pool, c.req.param('provider'), c.req.param('model'));
    return c.json({ ok: true });
  });

  // ----- Spec 022 v0.1 + v0.2 — skills catalogue + version history -----
  admin.get('/v1/skills', async (c) => c.json(await listSkills(pool)));

  /**
   * Publish a NEW version. The version field must NOT already exist for
   * this skill. On first-publish, also creates the catalogue row.
   * 409 if the version already exists in history.
   */
  admin.post('/v1/skills', async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (
      !body ||
      typeof body.skill_id !== 'string' ||
      typeof body.title !== 'string' ||
      typeof body.version !== 'string' ||
      body.version.trim() === ''
    ) {
      return c.json({ error: 'invalid_request', detail: 'skill_id + version + title required' }, 400);
    }
    const kind = body.kind;
    if (kind !== 'extension' && kind !== 'recipe' && kind !== 'composite') {
      return c.json({ error: 'invalid_kind', detail: 'kind must be extension|recipe|composite' }, 400);
    }
    const res = await publishNewSkillVersion(pool, {
      skill_id: body.skill_id,
      version: body.version,
      title: body.title,
      description: (body.description as string) ?? '',
      category: (body.category as string) ?? 'general',
      publisher_name: (body.publisher_name as string) ?? 'Unknown',
      publisher_verified: typeof body.publisher_verified === 'boolean' ? body.publisher_verified : false,
      kind,
      manifest: (body.manifest as Record<string, unknown>) ?? {},
      capabilities: Array.isArray(body.capabilities) ? (body.capabilities as string[]) : [],
      pricing_tier_min:
        body.pricing_tier_min === 'pro' || body.pricing_tier_min === 'team' || body.pricing_tier_min === 'enterprise'
          ? body.pricing_tier_min
          : 'free',
      deprecated: typeof body.deprecated === 'boolean' ? body.deprecated : false,
      changelog: typeof body.changelog === 'string' ? body.changelog : undefined,
    });
    if (!res.ok) {
      return c.json({ error: res.error }, res.error === 'version_already_published' ? 409 : 400);
    }
    return c.json({ ok: true });
  });

  /**
   * In-place edit of the CURRENT version (typo / description fixes that
   * don't warrant a new published version). Version field must match
   * what's currently active.
   */
  admin.put('/v1/skills/:id', async (c) => {
    const id = c.req.param('id');
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (
      !body ||
      typeof body.version !== 'string' ||
      typeof body.title !== 'string'
    ) {
      return c.json({ error: 'invalid_request', detail: 'version + title required' }, 400);
    }
    const kind = body.kind;
    if (kind !== 'extension' && kind !== 'recipe' && kind !== 'composite') {
      return c.json({ error: 'invalid_kind' }, 400);
    }
    const res = await saveSkillInPlace(pool, {
      skill_id: id,
      version: body.version,
      title: body.title,
      description: (body.description as string) ?? '',
      category: (body.category as string) ?? 'general',
      publisher_name: (body.publisher_name as string) ?? 'Unknown',
      publisher_verified: typeof body.publisher_verified === 'boolean' ? body.publisher_verified : false,
      kind,
      manifest: (body.manifest as Record<string, unknown>) ?? {},
      capabilities: Array.isArray(body.capabilities) ? (body.capabilities as string[]) : [],
      pricing_tier_min:
        body.pricing_tier_min === 'pro' || body.pricing_tier_min === 'team' || body.pricing_tier_min === 'enterprise'
          ? body.pricing_tier_min
          : 'free',
      deprecated: typeof body.deprecated === 'boolean' ? body.deprecated : false,
    });
    if (!res.ok) {
      return c.json(
        { error: res.error },
        res.error === 'skill_not_found' ? 404 : 409
      );
    }
    return c.json({ ok: true });
  });

  admin.delete('/v1/skills/:id', async (c) => {
    await deleteSkill(pool, c.req.param('id'));
    return c.json({ ok: true });
  });

  admin.get('/v1/skills/:id/versions', async (c) =>
    c.json(await listSkillVersions(pool, c.req.param('id')))
  );

  admin.post('/v1/skills/:id/rollback/:version', async (c) => {
    const res = await rollbackSkillToVersion(pool, c.req.param('id'), c.req.param('version'));
    if (!res.ok) {
      return c.json({ error: res.error }, res.error === 'version_not_found' ? 404 : 400);
    }
    return c.json({ ok: true });
  });

  app.route('/admin', admin);
}
