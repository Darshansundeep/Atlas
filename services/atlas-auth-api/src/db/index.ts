/**
 * Postgres pool + typed query helpers. Spec 002-cloud-auth.
 *
 * Keeps the SQL inline-but-typed so tests can mock the `query` function
 * without monkey-patching `pg`.
 */

import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(databaseUrl: string): pg.Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  pool.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[atlas-auth-api] pg pool error', err.message);
  });
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  databaseUrl: string,
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return getPool(databaseUrl).query<T>(text, params as never);
}

/** One-shot migration runner. Used by `pnpm run migrate`. */
export async function migrate(databaseUrl: string): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(here, 'schema.sql'), 'utf8');
  await query(databaseUrl, sql);
}
