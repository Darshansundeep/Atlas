/**
 * Usage event recording + catalogue-based cost lookup. Spec 003 + 011.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export interface CataloguePrice {
  input_per_million: number;
  output_per_million: number;
}

const priceCache = new Map<string, { p: CataloguePrice; at: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getCataloguePrice(
  pool: pg.Pool,
  provider: string,
  model: string
): Promise<CataloguePrice> {
  const key = `${provider}/${model}`;
  const cached = priceCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.p;

  const { rows } = await pool.query<{ input_per_million: string; output_per_million: string }>(
    `SELECT input_per_million::text, output_per_million::text
       FROM model_catalogue
      WHERE provider = $1 AND model = $2 AND deprecated = FALSE`,
    [provider.toLowerCase(), model]
  );
  const p: CataloguePrice = rows[0]
    ? { input_per_million: Number(rows[0].input_per_million), output_per_million: Number(rows[0].output_per_million) }
    : { input_per_million: 0, output_per_million: 0 };
  priceCache.set(key, { p, at: Date.now() });
  return p;
}

export function computeCost(
  inputTokens: number,
  outputTokens: number,
  price: CataloguePrice
): number {
  return (inputTokens * price.input_per_million + outputTokens * price.output_per_million) / 1_000_000;
}

export interface RecordUsageInput {
  userId: string;
  organizationId?: string | null;   // Spec 050 v0.1 — populated from JWT
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  requestId?: string | null;
  status: 'ok' | 'quota_exceeded' | 'provider_error' | 'org_budget_exceeded';
}

export async function recordUsage(pool: pg.Pool, ev: RecordUsageInput): Promise<void> {
  await pool.query(
    `INSERT INTO usage_events
       (id, user_id, organization_id, provider, model,
        input_tokens, output_tokens, cost_usd, request_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      randomUUID(),
      ev.userId,
      ev.organizationId ?? null,
      ev.provider.toLowerCase(),
      ev.model,
      ev.inputTokens,
      ev.outputTokens,
      ev.costUsd,
      ev.requestId ?? null,
      ev.status,
    ]
  );
}
