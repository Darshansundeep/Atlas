/**
 * WorkOS AuthKit adapter. Spec 002-cloud-auth, R-002-001.
 *
 * Wraps two WorkOS REST calls:
 *   - GET  /sso/authorize         (we just compose the URL, no network call)
 *   - POST /user_management/authenticate  (exchange code → profile)
 *
 * Set WORKOS_CLIENT_ID + WORKOS_API_KEY in env. We do NOT use the
 * @workos-inc/node SDK at v1 — direct fetch keeps the worker bundle small
 * and the auth surface auditable.
 */

import type { IdpAdapter, IdpExchangeRequest, IdpProfile } from './index.js';

const WORKOS_API = 'https://api.workos.com';
const AUTHORIZE_URL = `${WORKOS_API}/sso/authorize`;
const AUTHENTICATE_URL = `${WORKOS_API}/user_management/authenticate`;

interface WorkOSCfg {
  clientId: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

interface WorkOSAuthenticateResponse {
  user: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    profile_picture_url: string | null;
  };
}

export function createWorkosIdp(cfg: WorkOSCfg): IdpAdapter {
  const f = cfg.fetchImpl ?? fetch;

  return {
    async exchange(req: IdpExchangeRequest): Promise<IdpProfile> {
      if (!cfg.clientId || !cfg.apiKey) {
        const err = new Error('workos: WORKOS_CLIENT_ID and WORKOS_API_KEY must be set');
        (err as Error & { code?: string }).code = 'idp_not_configured';
        throw err;
      }

      const body = {
        grant_type: 'authorization_code',
        client_id: cfg.clientId,
        client_secret: cfg.apiKey,
        code: req.code,
        code_verifier: req.codeVerifier,
        redirect_uri: req.redirectUri,
      };

      const res = await f(AUTHENTICATE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        // Don't leak the body — but DO leak its first 200 chars so support
        // can correlate. Token values do not appear in WorkOS error bodies.
        const err = new Error(
          `workos: authenticate failed (${res.status}): ${text.slice(0, 200)}`
        );
        (err as Error & { code?: string }).code =
          res.status === 401 ? 'invalid_grant' : 'idp_upstream_error';
        throw err;
      }

      const data = (await res.json()) as WorkOSAuthenticateResponse;
      const u = data.user;
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
      return {
        id: u.id,
        email: u.email,
        display_name: name || u.email.split('@')[0],
        picture_url: u.profile_picture_url ?? null,
      };
    },

    authorizationUrl({ state, codeChallenge, redirectUri }) {
      const u = new URL(AUTHORIZE_URL);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('client_id', cfg.clientId);
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('state', state);
      u.searchParams.set('code_challenge', codeChallenge);
      u.searchParams.set('code_challenge_method', 'S256');
      u.searchParams.set('provider', 'authkit');
      return u.toString();
    },
  };
}
