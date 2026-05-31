/**
 * Theme tokens — the single source of truth for all MCP semantic token values.
 *
 * Every key in McpUiStyleVariableKey must be present in both lightTokens and
 * darkTokens. The TypeScript compiler enforces this: if the SDK adds a new key,
 * the build breaks until both maps are updated.
 *
 * Values are applied to :root via style.setProperty() before first paint
 * (see renderer.tsx). main.css only registers the variable names for Tailwind
 * class generation — it does NOT define values.
 *
 * These tokens serve two purposes:
 *  1. The desktop client — applied to :root per resolved theme. // brand-allow
 *  2. MCP apps — encoded as light-dark() in hostContext.styles.variables.
 */
import type {
  McpUiHostStyles,
  McpUiStyleVariableKey,
  McpUiStyles,
} from '@modelcontextprotocol/ext-apps/app-bridge';

type ThemeTokens = Record<McpUiStyleVariableKey, string>;

// Subset of keys that are the same across both themes.
type BaseTokenKey = Extract<
  McpUiStyleVariableKey,
  `--font-${string}` | `--border-radius-${string}` | `--border-width-${string}`
>;

type ColorTokenKey = Exclude<McpUiStyleVariableKey, BaseTokenKey>;

// ---------------------------------------------------------------------------
// Base tokens — shared across light and dark themes
// ---------------------------------------------------------------------------
const baseTokens: Pick<ThemeTokens, BaseTokenKey> = {
  // Typography — Atlas uses Inter (modern, premium, broadly available),
  // falling back to the platform's system font stack. Cash Sans was the
  // upstream Square brand font and is intentionally removed.
  '--font-sans':
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif",
  '--font-mono': "'JetBrains Mono', 'SF Mono', 'Monaco', 'Consolas', monospace",

  // Typography — weights
  '--font-weight-normal': '400',
  '--font-weight-medium': '500',
  '--font-weight-semibold': '600',
  '--font-weight-bold': '700',

  // Typography — text sizes
  '--font-text-xs-size': '0.75rem',
  '--font-text-sm-size': '0.875rem',
  '--font-text-md-size': '1rem',
  '--font-text-lg-size': '1.125rem',

  // Typography — heading sizes
  '--font-heading-xs-size': '1rem',
  '--font-heading-sm-size': '1.125rem',
  '--font-heading-md-size': '1.25rem',
  '--font-heading-lg-size': '1.5rem',
  '--font-heading-xl-size': '1.875rem',
  '--font-heading-2xl-size': '2.25rem',
  '--font-heading-3xl-size': '3rem',

  // Typography — text line heights
  '--font-text-xs-line-height': '1rem',
  '--font-text-sm-line-height': '1.25rem',
  '--font-text-md-line-height': '1.5rem',
  '--font-text-lg-line-height': '1.75rem',

  // Typography — heading line heights
  '--font-heading-xs-line-height': '1.5rem',
  '--font-heading-sm-line-height': '1.75rem',
  '--font-heading-md-line-height': '1.75rem',
  '--font-heading-lg-line-height': '2rem',
  '--font-heading-xl-line-height': '2.25rem',
  '--font-heading-2xl-line-height': '2.5rem',
  '--font-heading-3xl-line-height': '3.5rem',

  // Border radius
  '--border-radius-xs': '2px',
  '--border-radius-sm': '4px',
  '--border-radius-md': '8px',
  '--border-radius-lg': '12px',
  '--border-radius-xl': '16px',
  '--border-radius-full': '9999px',

  // Border width
  '--border-width-regular': '1px',
};

// Theme-specific color/shadow tokens only.
type ColorTokens = Pick<ThemeTokens, ColorTokenKey>;

// ---------------------------------------------------------------------------
// Light theme — Atlas Premium palette: warm-paper backgrounds, midnight ink,
// cobalt brand signals, amber accents. Shadows are tinted with the brand
// indigo (#1e2a55) instead of pure black so elevation feels intentional.
// ---------------------------------------------------------------------------
const lightColorTokens: ColorTokens = {
  // Backgrounds
  '--color-background-primary': '#ffffff',
  '--color-background-secondary': '#fafaf7',     // warm off-white, parchment hint
  '--color-background-tertiary': '#f1efe6',      // subtle paper warmth
  '--color-background-inverse': '#0f1729',       // brand midnight
  '--color-background-ghost': 'transparent',
  '--color-background-info': '#3b4d8f',          // cobalt
  '--color-background-danger': '#c8474b',
  '--color-background-success': '#5e8a52',
  '--color-background-warning': '#c8924a',
  '--color-background-disabled': '#ebe9e0',

  // Text
  '--color-text-primary': '#0f1729',             // brand ink
  '--color-text-secondary': '#5b6478',
  '--color-text-tertiary': '#9098a8',
  '--color-text-inverse': '#fafaf7',
  '--color-text-ghost': '#5b6478',
  '--color-text-info': '#3b4d8f',
  '--color-text-danger': '#c8474b',
  '--color-text-success': '#5e8a52',
  '--color-text-warning': '#a87a37',
  '--color-text-disabled': '#c5cad4',

  // Borders
  '--color-border-primary': '#ebe9e0',           // warm hairline
  '--color-border-secondary': '#dad7cc',
  '--color-border-tertiary': '#cbd1d6',
  '--color-border-inverse': '#0f1729',
  '--color-border-ghost': 'transparent',
  '--color-border-info': '#3b4d8f',
  '--color-border-danger': '#c8474b',
  '--color-border-success': '#5e8a52',
  '--color-border-warning': '#c8924a',
  '--color-border-disabled': '#ebe9e0',

  // Rings — focus & selection
  '--color-ring-primary': '#1e2a55',             // brand cobalt for keyboard focus
  '--color-ring-secondary': '#cbd1d6',
  '--color-ring-inverse': '#ffffff',
  '--color-ring-info': '#3b4d8f',
  '--color-ring-danger': '#c8474b',
  '--color-ring-success': '#5e8a52',
  '--color-ring-warning': '#c8924a',

  // Shadows — tinted with brand indigo so elevation feels intentional
  '--shadow-hairline': '0 0 0 1px rgba(15, 23, 41, 0.06)',
  '--shadow-sm': '0 1px 2px 0 rgba(15, 23, 41, 0.04)',
  '--shadow-md':
    '0 4px 12px -2px rgba(15, 23, 41, 0.06), 0 2px 4px -2px rgba(15, 23, 41, 0.04)',
  '--shadow-lg':
    '0 18px 38px -12px rgba(15, 23, 41, 0.10), 0 6px 16px -6px rgba(15, 23, 41, 0.06)',
};

// ---------------------------------------------------------------------------
// Dark theme — Atlas Premium night sky: deep navy backgrounds, warm cream
// text, brand cobalt for primary surfaces. Shadows go truly dark with a
// subtle indigo cast.
// ---------------------------------------------------------------------------
const darkColorTokens: ColorTokens = {
  // Backgrounds
  '--color-background-primary': '#0a0e1a',       // deep night sky
  '--color-background-secondary': '#101526',     // slightly lifted
  '--color-background-tertiary': '#171d33',      // hover / card
  '--color-background-inverse': '#faf8f2',       // cream
  '--color-background-ghost': 'transparent',
  '--color-background-info': '#6e83c8',
  '--color-background-danger': '#dd6064',
  '--color-background-success': '#7fb277',
  '--color-background-warning': '#d4a44a',
  '--color-background-disabled': '#171d33',

  // Text
  '--color-text-primary': '#f4ede0',             // warm cream
  '--color-text-secondary': '#a5a395',
  '--color-text-tertiary': '#6e6c63',
  '--color-text-inverse': '#0a0e1a',
  '--color-text-ghost': '#a5a395',
  '--color-text-info': '#9ab0f0',
  '--color-text-danger': '#e88a8e',
  '--color-text-success': '#a8d49f',
  '--color-text-warning': '#e0bd72',
  '--color-text-disabled': '#3a3f55',

  // Borders
  '--color-border-primary': '#1f2640',
  '--color-border-secondary': '#2a3258',
  '--color-border-tertiary': '#171d33',
  '--color-border-inverse': '#faf8f2',
  '--color-border-ghost': 'transparent',
  '--color-border-info': '#6e83c8',
  '--color-border-danger': '#dd6064',
  '--color-border-success': '#7fb277',
  '--color-border-warning': '#d4a44a',
  '--color-border-disabled': '#1f2640',

  // Rings
  '--color-ring-primary': '#d4a44a',             // amber focus on dark mode
  '--color-ring-secondary': '#2a3258',
  '--color-ring-inverse': '#0a0e1a',
  '--color-ring-info': '#6e83c8',
  '--color-ring-danger': '#dd6064',
  '--color-ring-success': '#7fb277',
  '--color-ring-warning': '#d4a44a',

  // Shadows — dark + indigo cast, more pronounced than light
  '--shadow-hairline': '0 0 0 1px rgba(0, 0, 0, 0.4)',
  '--shadow-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.4)',
  '--shadow-md':
    '0 4px 12px -2px rgba(0, 0, 0, 0.5), 0 2px 4px -2px rgba(0, 0, 0, 0.3)',
  '--shadow-lg':
    '0 18px 38px -12px rgba(0, 0, 0, 0.6), 0 6px 16px -6px rgba(0, 0, 0, 0.35)',
};

// ---------------------------------------------------------------------------
// Merged token maps — used by applyThemeTokens() and buildMcpHostStyles()
// ---------------------------------------------------------------------------
export const lightTokens: ThemeTokens = { ...baseTokens, ...lightColorTokens };
export const darkTokens: ThemeTokens = { ...baseTokens, ...darkColorTokens };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Empty @font-face block — Atlas relies on the system font stack defined in
// `--font-sans` (Inter when available, falling back to platform UI fonts).
// MCP apps still receive this block (currently empty) for API stability.
const HOST_FONT_CSS = ``.trim();

/**
 * Build the McpUiHostStyles object for MCP apps.
 * Color keys use light-dark() so a single payload works for both themes.
 * Non-color keys (fonts, radii, shadows) use plain values from baseTokens
 * (or light as the default when values differ, e.g. shadows).
 * css.fonts provides @font-face rules so sandboxed apps can load host fonts.
 */
export function buildMcpHostStyles(): McpUiHostStyles {
  const variables: McpUiStyles = {} as McpUiStyles;
  for (const key of Object.keys(lightTokens) as McpUiStyleVariableKey[]) {
    const light = lightTokens[key];
    const dark = darkTokens[key];
    if (key.startsWith('--color-')) {
      variables[key] = `light-dark(${light}, ${dark})`;
    } else {
      variables[key] = light;
    }
  }
  return { variables, css: { fonts: HOST_FONT_CSS } };
}

/**
 * Resolve the current theme from localStorage / system preference.
 */
export function getResolvedTheme(): 'light' | 'dark' {
  const useSystem = localStorage.getItem('use_system_theme') !== 'false';
  if (useSystem) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
}

/**
 * Apply theme tokens to the document root as CSS custom properties.
 * When called without an argument, resolves the theme from localStorage.
 */
export function applyThemeTokens(theme?: 'light' | 'dark'): void {
  const resolved = theme ?? getResolvedTheme();
  const tokens = resolved === 'dark' ? darkTokens : lightTokens;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(key, value);
  }
}
