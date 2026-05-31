/**
 * IdP adapter. Spec 002-cloud-auth, R-002-001 (WorkOS) + dev-loop stub.
 *
 * Real production path: exchange the OAuth code for a profile via WorkOS
 * AuthKit. The desktop never speaks to WorkOS directly — only this server
 * does, holding WORKOS_API_KEY.
 *
 * Dev path (STUB_IDP=true): accept any code shaped `dev-<email>` and return
 * a deterministic profile keyed on the email. Lets us exercise the full
 * desktop flow end-to-end without a WorkOS account.
 */

export interface IdpProfile {
  id: string;            // canonical user id (uuid v4)
  email: string;
  display_name: string | null;
  picture_url: string | null;
}

export interface IdpExchangeRequest {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface IdpAdapter {
  exchange(req: IdpExchangeRequest): Promise<IdpProfile>;
  /**
   * URL the desktop opens in the browser to sign in. The desktop knows the
   * state + code_challenge; this builds the full authorization-endpoint
   * URL with those params.
   */
  authorizationUrl(args: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string;
}

import { createStubIdp } from './stub.js';
import { createWorkosIdp } from './workos.js';

export function pickIdp(env: NodeJS.ProcessEnv): IdpAdapter {
  if (env.STUB_IDP === 'true') return createStubIdp();
  return createWorkosIdp({
    clientId: env.WORKOS_CLIENT_ID ?? '',
    apiKey: env.WORKOS_API_KEY ?? '',
  });
}
