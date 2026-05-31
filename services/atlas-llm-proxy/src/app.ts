/**
 * Atlas LLM proxy — Hono app. Spec 003.
 *
 * Endpoints:
 *   POST /v1/messages         Anthropic-Messages compatible
 *   GET  /v1/quota            current tier + remaining daily USD
 *   GET  /healthz             liveness
 *
 * The /v1/messages flow:
 *   1. verify Atlas Bearer JWT
 *   2. quota preflight (Constitution Principle V — NON-NEGOTIABLE)
 *   3. resolve provider+model from body, look up catalogue price
 *   4. forward to provider with the server-held API key
 *   5. record usage_event (cost computed from catalogue)
 *
 * v0.1 supports Anthropic only (the most-deployed Messages API shape).
 * OpenAI and Google adapters land in v0.2 by adding a router on
 * body.atlas_provider or by content-type sniffing.
 */

import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { verifyAtlasAccess } from './auth.js';
import { preflight, capFor, todaysSpend, type Tier, type QuotaEnv } from './quota.js';
import { forwardAnthropic } from './providers/anthropic.js';
import { computeCost, getCataloguePrice, recordUsage } from './usage.js';

const { Pool } = pg;

interface Env {
  DATABASE_URL: string;
  JWT_SIGNING_SECRET: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  DAILY_USD_CAP_FREE: string;
  DAILY_USD_CAP_PRO: string;
  DAILY_USD_CAP_TEAM: string;
  DAILY_USD_CAP_ENTERPRISE: string;
}

export function createApp(env: Env) {
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
  const quotaEnv: QuotaEnv = {
    dailyCaps: {
      free: Number(env.DAILY_USD_CAP_FREE ?? '2'),
      pro: Number(env.DAILY_USD_CAP_PRO ?? '50'),
      team: Number(env.DAILY_USD_CAP_TEAM ?? '200'),
      enterprise: Number(env.DAILY_USD_CAP_ENTERPRISE ?? '1000'),
    },
  };

  const app = new Hono();

  app.get('/healthz', (c) => c.text('ok'));

  // --- Bearer middleware ----------------------------------------------------
  app.use('/v1/*', async (c, next) => {
    const auth = c.req.header('authorization') ?? '';
    const m = /^Bearer (.+)$/.exec(auth);
    if (!m) return c.json({ error: 'unauthenticated' }, 401);
    try {
      const claims = await verifyAtlasAccess(m[1], env.JWT_SIGNING_SECRET);
      c.set('claims' as never, claims as never);
      await next();
    } catch {
      return c.json({ error: 'unauthenticated' }, 401);
    }
  });

  app.get('/v1/quota', async (c) => {
    const claims = c.get('claims' as never) as { sub: string; sub_tier: Tier };
    const tier = claims.sub_tier;
    const cap = capFor(tier, quotaEnv);
    const used = await todaysSpend(pool, claims.sub);
    return c.json({
      tier,
      daily_cap_usd: cap,
      used_today_usd: used,
      remaining_today_usd: Math.max(0, cap - used),
    });
  });

  // --- POST /v1/messages -----------------------------------------------------
  app.post('/v1/messages', async (c) => {
    const claims = c.get('claims' as never) as { sub: string; sub_tier: Tier };
    const body = (await c.req.json().catch(() => null)) as
      | { model?: string; stream?: boolean }
      | null;
    if (!body || typeof body.model !== 'string') {
      return c.json({ error: 'invalid_request', detail: 'model required' }, 400);
    }

    // Quota preflight — NON-NEGOTIABLE (Principle V).
    const pre = await preflight(pool, claims.sub, quotaEnv);
    if (!pre.ok) {
      await recordUsage(pool, {
        userId: claims.sub,
        provider: 'anthropic',
        model: body.model,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        status: 'quota_exceeded',
        requestId: c.req.header('x-atlas-request-id') ?? randomUUID(),
      }).catch(() => {});
      return c.json(
        {
          error: 'quota_exceeded',
          tier: pre.tier,
          daily_cap_usd: pre.cap,
          used_today_usd: pre.usedToday,
        },
        402
      );
    }

    if (!env.ANTHROPIC_API_KEY) {
      return c.json({ error: 'provider_not_configured', provider: 'anthropic' }, 503);
    }

    const stream = body.stream === true;
    const upstream = await forwardAnthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      body,
      stream,
    });

    // Post-call accounting (non-stream only at v0.1).
    if (!stream && upstream.usage) {
      const price = await getCataloguePrice(pool, 'anthropic', body.model);
      const cost = computeCost(upstream.usage.input_tokens, upstream.usage.output_tokens, price);
      await recordUsage(pool, {
        userId: claims.sub,
        provider: 'anthropic',
        model: body.model,
        inputTokens: upstream.usage.input_tokens,
        outputTokens: upstream.usage.output_tokens,
        costUsd: cost,
        requestId: upstream.rawId ?? null,
        status: upstream.status >= 200 && upstream.status < 300 ? 'ok' : 'provider_error',
      }).catch(() => {});
    }

    // Build the response — pass through the body verbatim plus a tag header.
    const respHeaders = new Headers(upstream.headers);
    respHeaders.set('x-atlas-tier', pre.tier);
    respHeaders.set(
      'x-atlas-remaining-usd',
      Math.max(0, pre.remaining - (upstream.usage
        ? computeCost(upstream.usage.input_tokens, upstream.usage.output_tokens,
                      await getCataloguePrice(pool, 'anthropic', body.model))
        : 0)).toFixed(4)
    );

    if (stream) {
      return new Response(upstream.body as ReadableStream, {
        status: upstream.status,
        headers: respHeaders,
      });
    }
    return new Response(upstream.body as ArrayBuffer, {
      status: upstream.status,
      headers: respHeaders,
    });
  });

  return app;
}
