/**
 * Spec 007: per-(provider, model) pricing override helpers.
 *
 * Override precedence (highest first):
 *   1. user pricingOverrides (this module — local settings.json)
 *   2. org override (TBD, spec 021-admin-console)
 *   3. canonical catalogue (models.dev via getCanonicalModelInfo)
 *
 * Storage is intentionally local-only so signed-out BYOK users can still
 * customise pricing without any cloud round-trip (Constitution Principle I).
 */

import type { PricingOverride, PricingOverrides } from './settings';

export type ModelKey = string;

export function modelKey(provider: string | null | undefined, model: string | null | undefined): ModelKey | null {
  if (!provider || !model) return null;
  return `${provider.trim().toLowerCase()}/${model.trim()}`;
}

export async function loadPricingOverrides(): Promise<PricingOverrides> {
  try {
    const stored = await window.electron.getSetting('pricingOverrides');
    return stored ?? {};
  } catch {
    return {};
  }
}

export async function getOverrideFor(
  provider: string | null | undefined,
  model: string | null | undefined
): Promise<PricingOverride | null> {
  const key = modelKey(provider, model);
  if (!key) return null;
  const all = await loadPricingOverrides();
  return all[key] ?? null;
}

export async function setOverride(
  provider: string,
  model: string,
  override: Omit<PricingOverride, 'updatedAt'>
): Promise<void> {
  const key = modelKey(provider, model);
  if (!key) return;
  const existing = await loadPricingOverrides();
  const next: PricingOverrides = {
    ...existing,
    [key]: { ...override, updatedAt: new Date().toISOString() },
  };
  await window.electron.setSetting('pricingOverrides', next);
  notifyChange();
}

export async function clearOverride(provider: string, model: string): Promise<void> {
  const key = modelKey(provider, model);
  if (!key) return;
  const existing = await loadPricingOverrides();
  if (!(key in existing)) return;
  const next = { ...existing };
  delete next[key];
  await window.electron.setSetting('pricingOverrides', next);
  notifyChange();
}

export const PRICING_OVERRIDES_CHANGED = 'atlasPricingOverridesChanged';

function notifyChange() {
  try {
    window.dispatchEvent(new Event(PRICING_OVERRIDES_CHANGED));
  } catch {
    // SSR / test env — no window
  }
}
