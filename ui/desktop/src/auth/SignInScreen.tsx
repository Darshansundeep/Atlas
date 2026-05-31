/**
 * Sign-in entry point. Spec 002-cloud-auth user-story 1.
 *
 * Two equal-weight choices:
 *   - "Sign in to Atlas" — opens the WorkOS-hosted browser flow
 *   - "Use my own API keys" — closes the screen, lets the user reach
 *     the provider-config flow (current BYOK path).
 *
 * Atlas Cloud features will only be enabled after sign-in. BYOK works
 * forever, signed-out — that's the Constitution Principle I guarantee.
 */

import { useCallback, useEffect, useState } from 'react';
import { LogIn, KeyRound } from 'lucide-react';
import { generatePkcePair } from './pkce';
import { AUTH_REDIRECT_DEEPLINK } from './types';
import { PasteCodeScreen } from './PasteCodeScreen';
import { useAuth } from './AuthContext';
import { exchangeCode, AuthApiException } from './api';

interface SignInScreenProps {
  /** Called when the user picks "Use my own API keys". */
  onContinueBYOK: () => void;
}

export function SignInScreen({ onContinueBYOK }: SignInScreenProps) {
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
      // The main process opens the system browser at the hosted sign-in
      // page; the page renders a 6-char "device code" the user can paste
      // back. Loopback in parallel is wired up but not exposed in v1 UI.
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
    // 1. Catch anything queued before window existed.
    void window.atlasAuth.pendingDeeplink().then((p) => {
      if (p) tryDeliver(p);
    });
    // 2. Live listener.
    const off = window.atlasAuth.onDeeplink(tryDeliver);
    return () => {
      cancelled = true;
      off();
    };
  }, [step, pkceVerifier, onCodeSubmit]);

  if (step === 'paste') {
    return (
      <PasteCodeScreen
        onSubmit={onCodeSubmit}
        onCancel={() => {
          setStep('idle');
          setPkceVerifier(null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] w-full p-8">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-light text-text-prominent">Welcome to Atlas</h1>
          <p className="text-sm text-text-secondary">
            Choose how you want to use Atlas. You can change this later in Settings.
          </p>
        </div>

        {error && (
          <div className="text-xs rounded-md border border-border-error bg-background-error/30 px-3 py-2 text-text-error">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={startSignIn}
          disabled={busy}
          data-testid="auth-signin-primary"
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-border-default bg-background-prominent text-text-on-prominent px-4 py-3 hover:bg-background-prominent/90 disabled:opacity-50"
        >
          <LogIn className="h-4 w-4" />
          {busy ? 'Opening browser…' : 'Sign in to Atlas'}
        </button>

        <button
          type="button"
          onClick={onContinueBYOK}
          data-testid="auth-byok"
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-border-default px-4 py-3 hover:bg-background-muted"
        >
          <KeyRound className="h-4 w-4" />
          Use my own API keys
        </button>

        <div className="text-[11px] text-text-secondary text-center leading-relaxed">
          Sign-in unlocks Atlas Cloud features (proxy, billing, subscription tier).
          API-key mode works fully signed-out — your prompts never transit Atlas
          infrastructure in that mode.
        </div>
      </div>
    </div>
  );
}
