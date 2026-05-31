/**
 * Atlas Identity Constants — single source of truth for the desktop UI.
 *
 * Every UI component that needs to render the product name, vendor, URL
 * scheme, env-var prefix, or other identity attribute MUST import from
 * here. No identity string MAY be embedded as a literal anywhere else
 * in `ui/desktop/src/`.
 *
 * Contract: see `specs/001-rebrand-pass/contracts/identity-constants.md`.
 * Rust-side equivalent: `crates/atlas-branding/src/lib.rs`.
 *
 * If you need to add an identity attribute, add it here AND in the Rust
 * branding crate in the SAME commit, and update the `identity-constants-in-sync`
 * CI job. The lockstep is enforced.
 */

/**
 * Atlas feature flags — controls which capabilities are visible in the UI.
 *
 * v1 ship plan: Claude-Code-style minimal default (chat + sessions + settings).
 * Advanced Goose features (Recipes, Skills, Apps, Scheduler, Extensions) are
 * SHIPPED but HIDDEN. Each can be turned on independently per release as the
 * product matures.
 *
 * Future: spec 021-admin-console will let an org admin push per-org overrides
 * via runtime.ts → BrandingConfig.features. The defaults here are the offline
 * fallback / pre-auth defaults.
 */
export const FEATURES = {
  // Always on at v1 — the Claude-Code default surface
  newChat: true,
  sessionHistory: true,
  settings: true,

  // Hidden at v1 — re-enable per future release
  recipes: false,
  skills: false,
  apps: false,
  scheduler: false,
  extensions: false,

  // Chat-input footer indicators — hidden at v1 for a clean minimal look
  contextWindowIndicator: false,    // the 0↑/0↓ + 0/128k token counter
  extensionCountBadge: false,       // the puzzle-piece "15" badge in the input footer

  // Settings tabs / sub-sections — hidden at v1, release per future update
  meshTab: false,                   // "Mesh" tab (Inference Mesh / distributed LLM)
  systemPromptsTab: false,          // "Prompts" tab — admin-managed in future, not user-facing
  atlasServerConnect: false,        // Settings > Sessions > "Atlas server" external-backend connector
  tunnelRemote: false,              // Settings > Sessions > Tunnel (remote control)
  telegramGateway: false,           // Settings > Sessions > Telegram gateway
} as const;

export type FeatureFlag = keyof typeof FEATURES;

export const IDENTITY = {
  displayName: 'Atlas',
  productSlug: 'atlas',
  vendor: 'NET Group',
  vendorDomain: 'netgroup.ai',

  bundleIdMacos: 'ai.netgroup.atlas',
  appUserModelIdWindows: 'NETGroup.Atlas',
  desktopEntryLinux: 'atlas',

  urlScheme: 'atlas',
  envVarPrefix: 'ATLAS_',

  // Template variables interpolated at call site: ${version}, ${os}.
  userAgentTemplate: 'Atlas/${version} (${os}; NET Group)',

  // Upstream attribution — for the About screen ONLY. Any other use is a
  // contract violation per R-IC-004.
  upstreamProjectName: 'Goose',
  upstreamProjectUrl: 'https://github.com/block/goose',
  upstreamPinnedVersion: 'v1.36.0',
} as const;

export type Identity = typeof IDENTITY;

/**
 * Build a User-Agent string from the template. Pass the runtime app version
 * and the OS identifier (`darwin` / `win32` / `linux` etc.).
 */
export function userAgent(version: string, os: string): string {
  return IDENTITY.userAgentTemplate
    .replace('${version}', version)
    .replace('${os}', os);
}
