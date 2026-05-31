/**
 * Local-dev stub IdP. Spec 002-cloud-auth (T014).
 *
 * Pretends to be WorkOS. Accepts any code shaped `dev-<email>` and returns
 * a deterministic profile.  Codes shaped `dev-<email>:<uuid>` also work —
 * the trailing uuid is taken as the user id so the same email always
 * resolves to the same user across server restarts (in-memory map alone
 * would not persist).
 */

import { createHash } from 'node:crypto';
import type { IdpAdapter, IdpProfile } from './index.js';

function uuidFromEmail(email: string): string {
  // Deterministic UUID v4-shaped string. Same email → same id every time.
  const h = createHash('sha256').update(email.toLowerCase()).digest('hex');
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    '4' + h.slice(13, 16),
    ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ].join('-');
}

export function createStubIdp(): IdpAdapter {
  return {
    async exchange({ code }) {
      const match = /^dev-([^:]+@[^:]+)(?::(.+))?$/.exec(code);
      if (!match) {
        const err = new Error('stub_idp: code must look like "dev-user@example.com"');
        (err as Error & { code?: string }).code = 'invalid_grant';
        throw err;
      }
      const email = match[1];
      const id = match[2] ?? uuidFromEmail(email);
      const profile: IdpProfile = {
        id,
        email,
        display_name: email.split('@')[0],
        picture_url: null,
      };
      return profile;
    },
    authorizationUrl({ state, codeChallenge, redirectUri }) {
      // Reflect the params so an integrator can see them; not actually used.
      const u = new URL('http://127.0.0.1:0/stub-idp/authorize');
      u.searchParams.set('state', state);
      u.searchParams.set('code_challenge', codeChallenge);
      u.searchParams.set('redirect_uri', redirectUri);
      return u.toString();
    },
  };
}
