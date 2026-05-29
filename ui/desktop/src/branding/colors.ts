/**
 * Atlas brand colour tokens (TypeScript constants).
 *
 * Mirrors `ui/desktop/src/branding/tokens.json` — the JSON file is consumed
 * by the build (CSS variable generation, theme manifests); this TS module
 * is consumed at runtime by components needing typed access.
 *
 * Both files MUST stay in sync. CI job `identity-constants-in-sync` checks.
 *
 * Final palette values come from NET Group's design team. The values below
 * are PLACEHOLDERS marked CLEARLY as such — replace before any external
 * release. Acceptance is gated on the design drop landing under
 * `ui/desktop/src/assets/atlas/`.
 */

// PLACEHOLDER — design team to supply final hex values.
export const COLORS = {
  brandPrimary:   '#1F6FEB',  // PLACEHOLDER: Atlas blue
  brandSecondary: '#0B1F3A',  // PLACEHOLDER: Atlas deep navy
  brandAccent:    '#F5A524',  // PLACEHOLDER: Atlas amber accent
  surfaceLight:   '#FFFFFF',
  surfaceDark:    '#0E1116',
  textOnBrand:    '#FFFFFF',
  textPrimary:    '#0E1116',
  textPrimaryDark:'#F6F8FA',
  textMuted:      '#57606A',
  border:         '#D0D7DE',
  success:        '#1A7F37',
  warning:        '#9A6700',
  danger:         '#CF222E',
} as const;

export type ColorToken = keyof typeof COLORS;
