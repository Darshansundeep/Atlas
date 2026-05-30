/**
 * Build the macOS About-panel options. Extracted from main.ts so it's
 * unit-testable (T014). The actual installation (`app.setAboutPanelOptions(...)`)
 * still happens in main.ts; this module just constructs the payload.
 *
 * Contract: R-IC-004 — the About panel is one of the few surfaces where the
 * literal upstream project name is permitted (attribution).
 */

import { IDENTITY } from './index';
import { getEffectiveBranding } from './runtime';

export interface AboutPanelOptions {
  applicationName: string;
  applicationVersion: string;
  copyright: string;
  credits: string;
  website: string;
}

export function buildAboutPanelOptions(appVersion: string): AboutPanelOptions {
  // App name comes from the runtime overlay (admin-console-pushed, with
  // IDENTITY default fallback). Attribution stays anchored to upstream
  // IDENTITY values — admins MAY rebrand the product name, but they MUST
  // NOT erase the upstream Goose attribution (Apache 2.0 §4(c)/(d)).
  const branding = getEffectiveBranding();
  return {
    applicationName: branding.appName,
    applicationVersion: appVersion,
    copyright: `© ${new Date().getFullYear()} ${IDENTITY.vendor}. Apache License 2.0.`,
    credits: `Built on ${IDENTITY.upstreamProjectName}\n${IDENTITY.upstreamProjectUrl}`,
    website: `https://${IDENTITY.vendorDomain}`,
  };
}
