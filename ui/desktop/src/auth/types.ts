/**
 * Auth types — wire shapes + in-renderer state. Spec 002-cloud-auth.
 *
 * Keys MUST match crates/atlas-auth-client/src/lib.rs constants.
 * Keep this file thin — anything that grows should move to a sibling.
 */

export const AUTH_ISSUER = 'https://api.atlas.netgroup.ai';
export const AUTH_AUDIENCE = 'atlas-desktop';
export const AUTH_REDIRECT_DEEPLINK = 'atlas://auth';
export const KEYCHAIN_SERVICE = 'ai.netgroup.atlas';
export const KEYCHAIN_ITEM_REFRESH = 'atlas-auth-refresh-token';
export const KEYCHAIN_ITEM_DEVICE = 'atlas-device-install-id';

export type SubTier = 'free' | 'pro' | 'team' | 'enterprise';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  sub_tier: SubTier;
}

export interface TokenGrantResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: AuthUser;
  device_install_id: string;
}

export interface SubscriptionState {
  tier: SubTier;
  monthly_token_quota: number | null;
  monthly_tokens_used: number;
  renews_at: number | null;
  entitlements: string[];
}

/** State held only in renderer memory — never persisted. */
export interface SignInAttempt {
  state: string;                 // CSRF token
  codeVerifier: string;          // PKCE
  codeChallenge: string;
  redirectUri: string;
  startedAt: number;
  loopbackPort?: number;
}
