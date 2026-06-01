/**
 * Atlas Account card — Settings → App. Spec 002-cloud-auth.
 *
 * Shows signed-in user + tier when authenticated; shows a "Sign in to
 * Atlas" CTA otherwise. The full screen flow lives in src/auth/SignInScreen.tsx
 * — this card mounts that screen inside a modal for one-click access.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Dialog, DialogContent } from '../../ui/dialog';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../../auth';
import { SignInScreen } from '../../../auth/SignInScreen';
import { AtlasMark } from '../../atlas-brand/AtlasMark';

export default function AtlasAccountCard() {
  const { user, subscription, initializing, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  // Close the sign-in dialog automatically once auth completes. Without
  // this, PasteCodeScreen's "Finishing sign-in…" spinner stays up after
  // acceptGrant updates AuthContext.
  useEffect(() => {
    if (user && open) setOpen(false);
  }, [user, open]);

  // Premium card: subtle amber glow on the top edge to call attention.
  return (
    <Card
      className="rounded-lg relative overflow-hidden"
      style={{
        background: 'var(--color-background-primary)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      {/* Glow ribbon */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--atlas-gradient-card-glow)',
          pointerEvents: 'none',
        }}
      />
      <CardContent className="pt-5 pb-5 px-5 relative">
        <div className="flex items-center gap-2 mb-2">
          <AtlasMark size={18} />
          <span
            style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
            }}
          >
            Atlas account
          </span>
        </div>
        <p
          className="mb-4"
          style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}
        >
          Sign in to unlock Atlas Cloud features (proxy, billing, subscription tier).
          API-key mode keeps working signed-out.
        </p>

        {initializing ? (
          <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Checking session…
          </div>
        ) : user ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              {user.picture ? (
                <img
                  src={user.picture}
                  alt=""
                  className="h-11 w-11 rounded-full object-cover"
                  style={{ border: '1px solid var(--color-border-primary)' }}
                />
              ) : (
                <div
                  className="h-11 w-11 rounded-full flex items-center justify-center"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--atlas-brand-cobalt) 0%, var(--atlas-brand-amber) 130%)',
                    color: 'var(--atlas-brand-cream)',
                  }}
                >
                  <UserIcon className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0">
                <div
                  className="truncate"
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: 'var(--atlas-brand-ink)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {user.name ?? user.email}
                </div>
                <div
                  className="truncate"
                  style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}
                >
                  {user.email}
                </div>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                    style={{
                      background: 'var(--atlas-brand-amber-soft)',
                      color: 'var(--atlas-brand-amber)',
                    }}
                  >
                    {user.sub_tier}
                  </span>
                  {subscription?.monthly_token_quota != null && (
                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                      {subscription.monthly_tokens_used.toLocaleString()} /{' '}
                      {subscription.monthly_token_quota.toLocaleString()} tokens
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              <LogOut className="h-3 w-3 mr-1" />
              Sign out
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Not signed in.
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all"
              style={{
                background:
                  'linear-gradient(135deg, var(--atlas-brand-cobalt-deep), var(--atlas-brand-cobalt))',
                color: 'var(--atlas-brand-cream)',
                boxShadow:
                  '0 4px 12px -4px rgba(15, 23, 41, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
              }}
            >
              <LogIn className="h-3 w-3" />
              Sign in
            </button>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <SignInScreen compact onContinueBYOK={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
