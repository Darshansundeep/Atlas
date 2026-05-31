# Feature Specification: Atlas Premium UI Refresh

**Feature Branch**: `023-ui-refresh`
**Status**: v1 shipped (theme tokens + brand assets + welcome/signin/Hub/account-card + sidebar + bubbles + empty illustrations + onboarding tour + BYOK chooser)
**Created**: 2026-05-31 (after the work shipped — written retrospectively for the spec-kit)

## Problem

After spec 001's rebrand pass, every visible string and asset said "Atlas"
but the **visual language** — palette, typography, layout, shadows, font
loading — was still upstream Goose's. The product felt like a recoloured
Goose, not a distinct Atlas. Specifically:

- Cash Sans font loaded from `cash-f.squarecdn.com` (Square's CDN) — both
  a brand-debt issue and a privacy concern in a packaged desktop app.
- Flat grey palette inherited from upstream.
- No brand mark in the chrome.
- No hero / first-impression surface.
- Settings, Sessions, Skills, Usage all used the same upstream
  components with no Atlas styling.
- No animations, no illustrated empty states, no premium-feel touches.

## Desired behaviour

Atlas should look like a finished commercial AI agent product —
specifically the **premium-commercial** direction picked from three
options (vs. minimalist or distinctive/branded).

Reference points: Cursor, Notion AI, Linear.

Concretely:

1. **Palette** — Atlas Premium:
   - Light: warm-paper backgrounds (#fafaf7 / #f1efe6), deep ink text
     (#0f1729), brand cobalt (#1e2a55), amber accent (#d4a44a), shadows
     tinted with brand indigo.
   - Dark: deep night-sky (#0a0e1a / #101526), warm cream text
     (#f4ede0), amber focus rings.
2. **Typography** — Inter with system-font fallback. NO external CDN.
3. **Brand mark** — celestial globe + star, inline SVG, scales 18px to 48px.
4. **Hero surfaces** — Welcome + Sign-in get full-bleed dark gradient
   backdrop with seeded starfield + amber bloom.
5. **Card surfaces** — paper backgrounds + soft brand-tinted shadows.
6. **Active states** — cobalt left-rail on nav rows, white-card-on-cobalt-text
   on settings tabs.
7. **Message bubbles** — user gets cobalt-gradient bubble with cream text;
   assistant gets paper-card framing.
8. **Empty states** — illustrated SVG (cobalt + amber palette) for
   Sessions, Usage, Audit, People, Catalogue, Skills, generic.
9. **Onboarding tour** — 4-step bottom-right popover on first launch;
   persisted via settings.tourCompleted.
10. **BYOK chooser** — purpose-built Atlas-styled 5-card chooser
    (Anthropic / OpenAI / Google / OpenRouter / Ollama) instead of the
    upstream `ProviderSelector`.

## What shipped (v1)

All 10 items above. Files touched:

  ui/desktop/src/theme/theme-tokens.ts      palette + font stack swap
  ui/desktop/src/styles/main.css            Atlas-brand CSS variables,
                                             gradients, removed Cash Sans
                                             CDN @font-face block
  ui/desktop/src/components/atlas-brand/
    AtlasMark.tsx                            inline SVG glyph + wordmark
    HeroBackground.tsx                       starfield + bloom backdrop
    EmptyIllustration.tsx                    7 variants
  ui/desktop/src/auth/SignInScreen.tsx       full-bleed hero + 2 CTAs
  ui/desktop/src/auth/PasteCodeScreen.tsx    matching premium card
  ui/desktop/src/components/Hub.tsx          gradient page bg, refined
                                             time + greeting
  ui/desktop/src/components/ChatInputCard.tsx  brand-tinted shadow + focus
  ui/desktop/src/components/UserMessage.tsx  cobalt-gradient bubble
  ui/desktop/src/components/GooseMessage.tsx assistant card framing
  ui/desktop/src/components/Layout/
    NavigationPanel.tsx                      AtlasMark + cobalt active rail
  ui/desktop/src/components/ui/tabs.tsx      pill-track tabs
  ui/desktop/src/components/settings/app/
    AtlasAccountCard.tsx                     glow-ribbon + gradient avatar
  ui/desktop/src/components/onboarding/
    AtlasProviderChooser.tsx                 5-card BYOK picker
    OnboardingTour.tsx                       4-step floating tour
    OnboardingGuard.tsx                      premium hero + chooser route

## Out of scope for v1 (deferred to v2)

- Settings tab chrome — still some upstream patterns inside individual
  settings sections. The tab bar (TabsList/TabsTrigger) is premium; the
  panels inside each tab are partial.
- Animated page-transitions — currently only the fade-slide on Hub +
  fade-in slides on the tour.
- Per-platform dark-mode test pass (light mode is the more polished
  surface today).
- Installer .icns / .ico icons — still the legacy upstream Goose
  silhouette. Replaces when the commissioned brand logo lands.

## Design decisions (FYI for v2)

Why these palette choices:
- "Atlas" → celestial / map / navigation → midnight + amber + parchment.
- Cobalt as the primary CTA matches the Linear/Cursor visual lineage
  without copying it (Cursor uses violet; Linear uses an off-blue;
  Cobalt is its own lane).
- Amber as the *accent only* — never as background. Keeps cards calm.

Why Inter, not Cash Sans:
- Cash Sans is Square's brand asset, served from Square's CDN. Both
  brand-debt and privacy concerns for an offline desktop app.
- Inter is open-source, premium-feeling, broadly system-installed.
- Falls back through Apple's San Francisco / Windows Segoe UI Variable
  if Inter isn't installed locally.

## Acceptance criteria (already met)

- ✓ No `cash-f.squarecdn.com` URLs anywhere in the bundle.
- ✓ No `block.xyz` URLs anywhere in shipped code.
- ✓ Welcome screen renders with hero gradient + starfield within 1s.
- ✓ Inter loads without network round-trip when available.
- ✓ Light + dark theme both bind to the new palette.
- ✓ Onboarding tour appears once per user, never again after dismiss.

## Test plan

- Visual regression on Hub, Sign-in, Settings → App (Atlas account card),
  Usage, Skills, Sessions, admin Overview.
- Onboarding tour: first launch → appears; dismiss → never returns.
- Theme tokens applied: inspect `:root` style after `applyThemeTokens()`.
- Inter font present: `getComputedStyle(document.body).fontFamily`
  includes 'Inter'.
- No Cash Sans / Square CDN URLs: `strings out/Atlas-darwin-arm64/...asar`
  grep should return 0.
