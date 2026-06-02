/**
 * Atlas Auth context. Spec 002-cloud-auth.
 *
 * Responsibilities:
 *   - hold the in-memory access token + user profile
 *   - rehydrate on startup by exchanging the keychain refresh token
 *   - schedule a refresh ~60s before access-token expiry
 *   - poll /v1/subscription every 5 minutes
 *   - expose a stable `signOut()` that cascades through revoke + keychain wipe
 *
 * The refresh token NEVER touches React state. It lives only in the
 * keychain via the main-process IPC bridge.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AuthApiException,
  exchangeRefresh,
  getMe,
  getSubscription,
  revoke as apiRevoke,
  setBackendUrl,
} from './api';
import type { AuthUser, SubscriptionState, TokenGrantResponse } from './types';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  subscription: SubscriptionState | null;
  loading: boolean;
  /** True until we've finished the rehydrate-from-keychain attempt. */
  initializing: boolean;
}

interface AuthContextValue extends AuthState {
  acceptGrant: (g: TokenGrantResponse) => Promise<void>;
  refresh: () => Promise<boolean>;
  signOut: () => Promise<void>;
  reloadSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SUBSCRIPTION_POLL_MS = 5 * 60 * 1000;
const REFRESH_LEAD_MS = 60_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    subscription: null,
    loading: false,
    initializing: true,
  });
  const refreshTimerRef = useRef<number | null>(null);
  const subscriptionTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (subscriptionTimerRef.current) {
      window.clearInterval(subscriptionTimerRef.current);
      subscriptionTimerRef.current = null;
    }
  }, []);

  const scheduleRefresh = useCallback((expiresInSeconds: number) => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    const ms = Math.max(15_000, expiresInSeconds * 1000 - REFRESH_LEAD_MS);
    refreshTimerRef.current = window.setTimeout(() => {
      void doRefresh();
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
    }, ms);
  }, []);

  const acceptGrant = useCallback(
    async (g: TokenGrantResponse) => {
      // Persist the refresh token in the OS keychain (main-process side).
      await window.atlasAuth.persistGrant({
        refreshToken: g.refresh_token,
        deviceInstallId: g.device_install_id,
      });
      setState({
        user: g.user,
        accessToken: g.access_token,
        subscription: null,
        loading: false,
        initializing: false,
      });
      scheduleRefresh(g.expires_in);
      void reloadSubscriptionInternal(g.access_token);
    },
    [scheduleRefresh]
  );

  const reloadSubscriptionInternal = useCallback(async (token: string) => {
    try {
      const sub = await getSubscription(token);
      setState((s) => (s.accessToken === token ? { ...s, subscription: sub } : s));
    } catch {
      // tolerate transient failure — next poll retries
    }
  }, []);

  // Internal helper that doesn't depend on React state at call time.
  const doRefresh = useCallback(async (): Promise<boolean> => {
    let stored: string | null;
    try {
      stored = await window.atlasAuth.loadRefreshToken();
    } catch {
      stored = null;
    }
    if (!stored) {
      clearTimers();
      setState((s) => ({ ...s, user: null, accessToken: null, subscription: null, initializing: false }));
      return false;
    }
    try {
      const grant = await exchangeRefresh(stored);
      await acceptGrant(grant);
      return true;
    } catch (e) {
      if (e instanceof AuthApiException && (e.status === 401 || e.status === 403)) {
        // refresh token revoked/stolen — drop the user to signed-out.
        await window.atlasAuth.wipe();
      }
      clearTimers();
      setState((s) => ({ ...s, user: null, accessToken: null, subscription: null, initializing: false }));
      return false;
    }
  }, [acceptGrant, clearTimers]);

  const refresh = useCallback(() => doRefresh(), [doRefresh]);

  const reloadSubscription = useCallback(async () => {
    const token = state.accessToken;
    if (!token) return;
    await reloadSubscriptionInternal(token);
  }, [state.accessToken, reloadSubscriptionInternal]);

  const signOut = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    clearTimers();
    try {
      const stored = await window.atlasAuth.loadRefreshToken();
      if (stored) await apiRevoke(stored).catch(() => {});
    } catch {
      // ignore — best-effort
    }
    await window.atlasAuth.wipe().catch(() => {});
    setState({
      user: null,
      accessToken: null,
      subscription: null,
      loading: false,
      initializing: false,
    });
  }, [clearTimers]);

  // On mount: load backend URL from main process, then rehydrate.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = await window.atlasAuth.getBackendUrl();
        if (url) setBackendUrl(url);
      } catch {
        // fall through to defaults
      }
      const ok = await doRefresh();
      if (cancelled) return;
      if (!ok) setState((s) => ({ ...s, initializing: false }));
    })();
    return () => {
      cancelled = true;
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscription polling — re-arms whenever accessToken changes.
  useEffect(() => {
    if (subscriptionTimerRef.current) {
      window.clearInterval(subscriptionTimerRef.current);
      subscriptionTimerRef.current = null;
    }
    if (!state.accessToken) return;
    subscriptionTimerRef.current = window.setInterval(() => {
      if (state.accessToken) void reloadSubscriptionInternal(state.accessToken);
    }, SUBSCRIPTION_POLL_MS);
  }, [state.accessToken, reloadSubscriptionInternal]);

  // Re-fetch profile after rehydrate so display-name/picture changes apply.
  useEffect(() => {
    if (!state.accessToken) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await getMe(state.accessToken!);
        if (cancelled) return;
        setState((s) => (s.accessToken === me.id ? s : {
          ...s,
          user: {
            id: me.id,
            email: me.email,
            name: me.name,
            picture: me.picture,
            sub_tier: me.sub_tier,
          },
        }));
      } catch {
        // ignore — refresh loop will repair
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.accessToken]);

  // Spec 022 v0.5 — expose the current access token to non-AuthContext
  // consumers (e.g. the Skills view's telemetry helpers) via a window
  // escape hatch. The token is rotated/cleared by signing out so the
  // escape hatch tracks it. The token is short-lived (15-min TTL) and
  // never persisted to disk.
  //
  // Spec 040 v0.2 — also push to the Electron main process so new goosed
  // spawns inherit it via ATLAS_ACCESS_TOKEN env (atlas-web-tools reads it).
  useEffect(() => {
    (window as { __atlasAccessToken?: string | null }).__atlasAccessToken =
      state.accessToken;
    const w = window as unknown as {
      atlasAuth?: { setAccessToken?: (t: string | null) => Promise<boolean> };
    };
    w.atlasAuth?.setAccessToken?.(state.accessToken ?? null).catch(() => {});
    return () => {
      (window as { __atlasAccessToken?: string | null }).__atlasAccessToken = null;
    };
  }, [state.accessToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      acceptGrant,
      refresh,
      signOut,
      reloadSubscription,
    }),
    [state, acceptGrant, refresh, signOut, reloadSubscription]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
