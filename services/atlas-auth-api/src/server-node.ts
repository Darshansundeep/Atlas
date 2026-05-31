/**
 * Node.js entrypoint. Spec 002-cloud-auth.
 *
 * For Cloudflare Workers, we'd export `default { fetch }` from a separate
 * `worker.ts`. The Hono app itself is portable.
 */

import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  JWT_SIGNING_SECRET: process.env.JWT_SIGNING_SECRET ?? '',
  STUB_IDP: process.env.STUB_IDP,
  WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID,
  WORKOS_API_KEY: process.env.WORKOS_API_KEY,
  CORS_ORIGINS: process.env.CORS_ORIGINS,
};

if (!env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.error('DATABASE_URL is not set; copy .dev.vars.example → .dev.vars and adjust.');
  process.exit(2);
}
if (!env.JWT_SIGNING_SECRET || env.JWT_SIGNING_SECRET.length < 32) {
  // eslint-disable-next-line no-console
  console.error('JWT_SIGNING_SECRET must be set and at least 32 chars');
  process.exit(2);
}

const app = createApp(env);
const port = Number(process.env.PORT ?? '8787');

serve({ fetch: app.fetch, port }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`[atlas-auth-api] listening on http://127.0.0.1:${info.port}  (STUB_IDP=${env.STUB_IDP ?? 'false'})`);
});
