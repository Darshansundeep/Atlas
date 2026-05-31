/**
 * Sign-in entry point. Spec 002-cloud-auth user-story 1.
 *
 * The premium-commercial direction for the redesign: full-bleed hero on a
 * dark midnight gradient with subtle starfield, an inset light card with
 * the two equal-weight choices.
 *
 * Two paths:
 *   - "Sign in to Atlas" — opens the WorkOS-hosted browser flow
 *   - "Use my own API keys" — calls onContinueBYOK so the caller can route
 *     into the provider-config flow (BYOK keeps working signed-out).
 */

import { useCallback, useEffect, useState } from 'react';
import { LogIn, KeyRound, Loader2 } from 'lucide-react';
import { generatePkcePair } from './pkce';
import { AUTH_REDIRECT_DEEPLINK } from './types';
import { PasteCodeScreen } from './PasteCodeScreen';
import { useAuth } from './AuthContext';
import { exchangeCode, AuthApiException } from './api';
import { AtlasMark } from '../components/atlas-brand/AtlasMark';
import { HeroBackground } from '../components/atlas-brand/HeroBackground';

interface SignInScreenProps {
  /** Called when the user picks "Use my own API keys". */
  onContinueBYOK: () => void;
  /** When true, render as a compact modal-friendly variant (no hero bg). */
  compact?: boolean;
}

export function SignInScreen({ onContinueBYOK, compact = false }: SignInScreenProps) {
  const { acceptGrant } = useAuth();
  const [step, setStep] = useState<'idle' | 'paste'>('idle');
  const [pkceVerifier, setPkceVerifier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startSignIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const pair = await generatePkcePair();
      setPkceVerifier(pair.verifier);
      const state = crypto.randomUUID();
      await window.atlasAuth.startSignIn({
        state,
        codeChallenge: pair.challenge,
        redirectUri: AUTH_REDIRECT_DEEPLINK,
      });
      setStep('paste');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start sign-in');
    } finally {
      setBusy(false);
    }
  }, []);

  const onCodeSubmit = useCallback(
    async (code: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!pkceVerifier) return { ok: false, error: 'no_pkce_state' };
      try {
        const grant = await exchangeCode({
          code,
          codeVerifier: pkceVerifier,
          redirectUri: AUTH_REDIRECT_DEEPLINK,
        });
        await acceptGrant(grant);
        return { ok: true };
      } catch (e) {
        if (e instanceof AuthApiException) return { ok: false, error: e.code };
        return { ok: false, error: e instanceof Error ? e.message : 'unknown_error' };
      }
    },
    [pkceVerifier, acceptGrant]
  );

  // atlas://auth deep-link auto-finish. Runs whenever a sign-in is in flight.
  useEffect(() => {
    if (step !== 'paste' || !pkceVerifier) return;
    let cancelled = false;
    const tryDeliver = (payload: { code: string; state: string }) => {
      if (cancelled || !payload.code) return;
      void onCodeSubmit(payload.code);
    };
    void window.atlasAuth.pendingDeeplink().then((p) => {
      if (p) tryDeliver(p);
    });
    const off = window.atlasAuth.onDeeplink(tryDeliver);
    return () => {
      cancelled = true;
      off();
    };
  }, [step, pkceVerifier, onCodeSubmit]);

  if (step === 'paste') {
    return (
      <PasteCodeScreen
        compact={compact}
        onSubmit={onCodeSubmit}
        onCancel={() => {
          setStep('idle');
          setPkceVerifier(null);
        }}
      />
    );
  }

  const inner = (
    <div
      className="w-full max-w-md flex flex-col gap-7 rounded-2xl p-8"
      style={{
        backgroundColor: compact
          ? 'transparent'
          : 'rgba(255, 255, 255, 0.96)',
        boxShadow: compact ? 'none' : 'var(--shadow-lg)',
        backdropFilter: compact ? 'none' : 'blur(12px)',
      }}
    >
      <div className="flex flex-col items-center text-center gap-3">
        <AtlasMark size={48} />
        <h1
          style={{
            fontSize: '1.75rem',
            fontWeight: 600,
            letterSpacing: '-0.025em',
            color: 'var(--atlas-brand-ink)',
            lineHeight: 1.1,
          }}
        >
          Welcome to Atlas
        </h1>
        <p
          style={{
            fontSize: '0.9rem',
            color: 'var(--color-text-secondary)',
            maxWidth: '34ch',
            lineHeight: 1.5,
          }}
        >
          Your AI agent by NET Group. Pick a way to sign in — you can switch later.
        </p>
      </div>

      {error && (
        <div
          className="text-xs rounded-lg px-3 py-2"
          style={{
            border: '1px solid var(--color-border-danger)',
            background: 'rgba(200, 71, 75, 0.08)',
            color: 'var(--color-text-danger)',
          }}
        >
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={startSignIn}
          disabled={busy}
          data-testid="auth-signin-primary"
          className="group w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 transition-all disabled:opacity-60"
          style={{
            background: 'linear-gradient(135deg, var(--atlas-brand-cobalt-deep), var(--atlas-brand-cobalt))',
            color: 'var(--atlas-brand-cream)',
            fontWeight: 500,
            fontSize: '0.95rem',
            boxShadow:
              '0 6px 18px -6px rgba(15, 23, 41, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
          }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {busy ? 'Opening browser…' : 'Sign in to Atlas'}
        </button>

        <button
          type="button"
          onClick={onContinueBYOK}
          data-testid="auth-byok"
          className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 transition-colors hover:brightness-95"
          style={{
            background: 'transparent',
            border: '1px solid var(--color-border-secondary)',
            color: 'var(--atlas-brand-ink)',
            fontWeight: 500,
            fontSize: '0.95rem',
          }}
        >
          <KeyRound className="h-4 w-4" style={{ color: 'var(--atlas-brand-amber)' }} />
          Use my own API keys
        </button>
      </div>

      <div
        className="text-[11px] text-center leading-relaxed"
        style={{ color: 'var(--color-text-tertiary)', maxWidth: '38ch', alignSelf: 'center' }}
      >
        Atlas Cloud unlocks the proxy, billing, and team features.
        API-key mode keeps everything local — your prompts never transit Atlas infrastructure.
      </div>
    </div>
  );

  if (compact) {
    return (
      <div className="flex items-center justify-center w-full p-6">{inner}</div>
    );
  }

  return (
    <HeroBackground intense className="min-h-screen">
      <div className="flex items-center justify-center w-full min-h-screen p-6">
        {inner}
      </div>
    </HeroBackground>
  );
}
