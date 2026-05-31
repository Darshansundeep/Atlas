/**
 * Atlas BYOK provider chooser. Spec 023/Item 7.
 *
 * Premium-styled first-run picker. Five provider tiles in a grid; each
 * opens the existing ProviderConfigurationModal (the key-paste flow).
 * On success the same `onConfigured(providerName, modelId)` callback the
 * upstream selector emits — so the OnboardingGuard state machine stays
 * intact.
 *
 * Atlas-side rewrite of the upstream ProviderSelector. The original
 * 229-line component remains available behind FEATURES.legacyProviderSelector
 * for fallback. v1 default is this new screen.
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Coins, KeyRound, Loader2 } from 'lucide-react';
import { useConfig } from '../ConfigContext';
import type { ProviderDetails } from '../../api';
import ProviderConfigurationModal from '../settings/providers/modal/ProviderConfigurationModal';
import { AtlasMark } from '../atlas-brand/AtlasMark';

interface ChooserCard {
  /** Canonical provider id used to look up in `getProviders()`. */
  providerId: string;
  /** Friendly label */
  title: string;
  /** Short tagline */
  tagline: string;
  /** Single letter / glyph used as the avatar (until brand logos are licensed). */
  glyph: string;
  /** Avatar background. */
  avatarBg: string;
  /** "Free" or "API key required" badge text. */
  badge: 'free' | 'paid';
  /** Display order — lower first. */
  order: number;
}

const CARDS: ChooserCard[] = [
  { providerId: 'anthropic', title: 'Anthropic', tagline: 'Claude Opus / Sonnet / Haiku', glyph: 'C', avatarBg: '#cc785c', badge: 'paid', order: 1 },
  { providerId: 'openai',    title: 'OpenAI',    tagline: 'GPT-4o, o3, o4-mini',         glyph: 'G', avatarBg: '#0c6e56', badge: 'paid', order: 2 },
  { providerId: 'google',    title: 'Google',    tagline: 'Gemini 2.5 Pro & Flash',      glyph: 'G', avatarBg: '#4285f4', badge: 'paid', order: 3 },
  { providerId: 'openrouter',title: 'OpenRouter',tagline: 'One key, many models',        glyph: 'R', avatarBg: '#7c3aed', badge: 'paid', order: 4 },
  { providerId: 'ollama',    title: 'Ollama',    tagline: 'Run models locally — free',   glyph: 'O', avatarBg: '#1e2a55', badge: 'free', order: 5 },
];

interface AtlasProviderChooserProps {
  onConfigured: (providerName: string, modelId?: string) => void;
  onFirstSelection?: () => void;
}

export default function AtlasProviderChooser({
  onConfigured,
  onFirstSelection,
}: AtlasProviderChooserProps) {
  const { getProviders } = useConfig();
  const [providers, setProviders] = useState<ProviderDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [openProvider, setOpenProvider] = useState<ProviderDetails | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getProviders(true);
        if (!cancelled) setProviders(list);
      } catch (e) {
        console.error('Failed to load providers', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getProviders]);

  const onCardClick = useCallback(
    (card: ChooserCard) => {
      onFirstSelection?.();
      const provider = providers.find((p) => p.name.toLowerCase() === card.providerId);
      if (!provider) {
        // Provider not surfaced by backend — fall back to a friendly error toast
        console.warn(`Provider ${card.providerId} not available`);
        return;
      }
      setOpenProvider(provider);
    },
    [providers, onFirstSelection]
  );

  const visibleCards = [...CARDS].sort((a, b) => a.order - b.order).filter((c) => {
    if (loading) return true; // show all while loading
    return providers.some((p) => p.name.toLowerCase() === c.providerId);
  });

  return (
    <>
      <div className="w-full max-w-3xl mx-auto px-2">
        <div className="flex items-center gap-2 mb-3">
          <AtlasMark size={20} />
          <span
            style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
            }}
          >
            Bring your own keys
          </span>
        </div>
        <h2
          style={{
            fontSize: '1.75rem',
            fontWeight: 600,
            letterSpacing: '-0.025em',
            color: 'var(--atlas-brand-ink)',
            lineHeight: 1.1,
            marginBottom: '0.5rem',
          }}
        >
          Pick a provider to start
        </h2>
        <p
          style={{
            fontSize: '0.9rem',
            color: 'var(--color-text-secondary)',
            maxWidth: '52ch',
            marginBottom: '1.5rem',
            lineHeight: 1.5,
          }}
        >
          Your API keys stay in your OS keychain. Prompts go directly to the provider — Atlas
          never sees them in API-key mode.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleCards.map((card) => {
            const isAvailable = providers.some((p) => p.name.toLowerCase() === card.providerId);
            const configured = providers.find((p) => p.name.toLowerCase() === card.providerId)?.is_configured;
            return (
              <button
                key={card.providerId}
                onClick={() => onCardClick(card)}
                disabled={!isAvailable && !loading}
                data-testid={`atlas-provider-${card.providerId}`}
                className="group relative text-left rounded-xl p-4 transition-all disabled:opacity-50"
                style={{
                  background: 'var(--color-background-primary)',
                  border: '1px solid var(--color-border-primary)',
                  boxShadow: 'var(--shadow-sm)',
                  cursor: isAvailable || loading ? 'pointer' : 'not-allowed',
                }}
              >
                {/* Hover glow */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 rounded-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: 'var(--atlas-gradient-card-glow)' }}
                />

                <div className="relative">
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center font-semibold"
                      style={{
                        background: card.avatarBg,
                        color: '#ffffff',
                        fontSize: '1rem',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
                      }}
                    >
                      {card.glyph}
                    </div>

                    {configured ? (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                        style={{ background: 'rgba(94, 138, 82, 0.12)', color: 'var(--color-text-success)' }}
                      >
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Ready
                      </span>
                    ) : card.badge === 'free' ? (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                        style={{ background: 'var(--atlas-brand-amber-soft)', color: 'var(--atlas-brand-amber)' }}
                      >
                        <Coins className="h-2.5 w-2.5" />
                        Free
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                        style={{ background: 'var(--color-background-tertiary)', color: 'var(--color-text-secondary)' }}
                      >
                        <KeyRound className="h-2.5 w-2.5" />
                        API key
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: '1rem',
                      fontWeight: 600,
                      letterSpacing: '-0.01em',
                      color: 'var(--atlas-brand-ink)',
                      marginBottom: 2,
                    }}
                  >
                    {card.title}
                  </div>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--color-text-secondary)',
                      minHeight: '2.5em',
                    }}
                  >
                    {card.tagline}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {loading && (
          <div className="flex items-center justify-center mt-4 gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading providers…
          </div>
        )}

        <p
          className="mt-6 text-center"
          style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}
        >
          You can switch or add providers anytime in Settings → Models.
        </p>
      </div>

      {openProvider && (
        <ProviderConfigurationModal
          provider={openProvider}
          onClose={() => setOpenProvider(null)}
          onConfigured={(p) => {
            setOpenProvider(null);
            onConfigured(p.name, p.metadata?.default_model);
          }}
        />
      )}
    </>
  );
}
