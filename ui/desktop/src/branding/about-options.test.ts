/**
 * Tests for the About-panel-options builder.
 *
 * Task: T014 (revised — upstream About is native, not a React component, so this
 * test exercises the data builder rather than a rendered DOM snapshot).
 *
 * Run with: `pnpm --filter atlas-app test` (or whichever test command the
 * upstream Vitest config exposes; the test framework is inferred from
 * upstream's existing *.test.ts files).
 *
 * Contracts:
 *   - R-IC-004: the About panel is an attribution surface; literal upstream
 *     project name is permitted here.
 *   - FR-010: the About surface MUST credit upstream Goose.
 */

import { describe, it, expect } from 'vitest';
import { buildAboutPanelOptions } from './about-options';
import { IDENTITY } from './index';

describe('buildAboutPanelOptions', () => {
  it('uses Atlas as the applicationName', () => {
    const opts = buildAboutPanelOptions('1.36.0');
    expect(opts.applicationName).toBe(IDENTITY.displayName);
    expect(opts.applicationName).toBe('Atlas');
  });

  it('includes the upstream attribution in credits (FR-010)', () => {
    const opts = buildAboutPanelOptions('1.36.0');
    expect(opts.credits).toContain(IDENTITY.upstreamProjectName);
    expect(opts.credits).toContain(IDENTITY.upstreamProjectUrl);
  });

  it('carries the supplied app version', () => {
    const opts = buildAboutPanelOptions('1.36.0');
    expect(opts.applicationVersion).toBe('1.36.0');
  });

  it('cites the vendor in copyright', () => {
    const opts = buildAboutPanelOptions('1.36.0');
    expect(opts.copyright).toContain(IDENTITY.vendor);
    expect(opts.copyright).toContain('Apache License 2.0');
  });

  it('points website at the vendor domain', () => {
    const opts = buildAboutPanelOptions('1.36.0');
    expect(opts.website).toBe(`https://${IDENTITY.vendorDomain}`);
  });
});
