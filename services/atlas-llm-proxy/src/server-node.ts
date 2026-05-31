import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  JWT_SIGNING_SECRET: process.env.JWT_SIGNING_SECRET ?? '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  DAILY_USD_CAP_FREE: process.env.DAILY_USD_CAP_FREE ?? '2',
  DAILY_USD_CAP_PRO: process.env.DAILY_USD_CAP_PRO ?? '50',
  DAILY_USD_CAP_TEAM: process.env.DAILY_USD_CAP_TEAM ?? '200',
  DAILY_USD_CAP_ENTERPRISE: process.env.DAILY_USD_CAP_ENTERPRISE ?? '1000',
};

if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
if (!env.JWT_SIGNING_SECRET || env.JWT_SIGNING_SECRET.length < 32) {
  console.error('JWT_SIGNING_SECRET must match atlas-auth-api');
  process.exit(2);
}

const app = createApp(env);
const port = Number(process.env.PORT ?? '8788');
serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    `[atlas-llm-proxy] listening on http://127.0.0.1:${info.port}  (anthropic=${env.ANTHROPIC_API_KEY ? 'on' : 'off'})`
  );
});
