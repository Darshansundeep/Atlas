/**
 * Atlas runtime branding overlay.
 *
 * Lets a future admin console (spec 021-admin-console) push per-organisation
 * brand overrides — app name and logo at v1, more later — without requiring
 * a desktop rebuild. The desktop app fetches `BrandingConfig` from
 * `api.atlas.netgroup.ai/v1/branding` on launch and falls back to the
 * compile-time `IDENTITY` constants when offline or when no override exists.
 *
 * Spec 021 is deferred per ATLAS_BUILD_PLAN.md (post-launch, enterprise tier).
 * This module is the PLACEHOLDER: types are defined, the resolve function
 * exists, but the network fetch is stubbed. Until the admin console ships,
 * `getEffectiveBranding()` always returns the compile-time defaults.
 *
 * Contracts: identity-constants.md.
 * Task ref:  forward-references spec 021.
 */

import { IDENTITY } from './index';

export interface BrandingConfig {
  /** Display name shown in UI surfaces. Default: IDENTITY.displayName ("Atlas"). */
  appName: string;
  /** URL to a logo PNG (≥256×256). Default: undefined → use bundled icon. */
  logoUrl?: string;
  /** Brand primary colour as CSS hex. Default: undefined → use design tokens. */
  primaryColor?: string;
  /** When the override was issued (ISO-8601). Used for cache invalidation. */
  issuedAt?: string;
  /** Org identifier the override applies to. Used by the admin console. */
  orgId?: string;
}

const DEFAULTS: BrandingConfig = {
  appName: IDENTITY.displayName,
};

/**
 * Local cache of the last fetched override. Survives a single app session;
 * persistence across restarts is the auth/keychain layer's job (spec 002).
 */
let cachedOverride: BrandingConfig | null = null;

/**
 * Return the branding to use right now. Order of precedence:
 *   1. Runtime override pushed from the admin console (cached).
 *   2. Compile-time IDENTITY defaults.
 *
 * Synchronous and always succeeds — callers should treat the return value
 * as authoritative for the current frame.
 */
export function getEffectiveBranding(): BrandingConfig {
  return { ...DEFAULTS, ...(cachedOverride ?? {}) };
}

/**
 * Stub: fetch the per-org branding override from the admin console's API.
 *
 * **NOT IMPLEMENTED** — depends on:
 *   - spec 002-cloud-auth (auth token to identify the org)
 *   - spec 021-admin-console (the API endpoint and admin UI)
 *
 * Until those land, this function does nothing and returns null. The
 * desktop app should still call it on launch so the wiring is exercised.
 */
export async function fetchRemoteBranding(): Promise<BrandingConfig | null> {
  // Future:
  //   const token = await getAuthToken();
  //   const resp = await fetch(
  //     `https://api.${IDENTITY.vendorDomain}/v1/branding`,
  //     { headers: { Authorization: `Bearer ${token}` } }
  //   );
  //   if (!resp.ok) return null;
  //   const config = (await resp.json()) as BrandingConfig;
  //   cachedOverride = config;
  //   return config;
  return null;
}

/**
 * Test-only: install a synthetic override. Used by `getEffectiveBranding`'s
 * unit tests and by the admin-console placeholder (admin-console/index.html)
 * for the demo "preview branding" button.
 */
export function __setOverrideForTesting(override: BrandingConfig | null): void {
  cachedOverride = override;
}
