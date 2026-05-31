/**
 * Standalone migration script. Run with `pnpm run migrate`.
 */

import 'dotenv/config';
import { migrate } from './index.js';

const url = process.env.DATABASE_URL;
if (!url) {
  // eslint-disable-next-line no-console
  console.error('DATABASE_URL is not set');
  process.exit(2);
}

migrate(url)
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('[atlas-auth-api] migrations applied');
    process.exit(0);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[atlas-auth-api] migration failed:', err);
    process.exit(1);
  });
