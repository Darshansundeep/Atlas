/**
 * Atlas Account card — Settings → App. Spec 002-cloud-auth.
 *
 * Shows signed-in user + tier when authenticated; shows a "Sign in to
 * Atlas" CTA otherwise. The full screen flow lives in src/auth/SignInScreen.tsx
 * — this card mounts that screen inside a modal for one-click access.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Dialog, DialogContent } from '../../ui/dialog';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../../auth';
import { SignInScreen } from '../../../auth/SignInScreen';

export default function AtlasAccountCard() {
  const { user, subscription, initializing, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <Card className="rounded-lg">
      <CardHeader className="pb-0">
        <CardTitle>Atlas account</CardTitle>
        <CardDescription>
          Sign in to enable Atlas Cloud features (proxy, billing, subscription tier).
          API-key mode keeps working signed-out.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 px-4">
        {initializing ? (
          <div className="text-xs text-text-secondary">Checking session…</div>
        ) : user ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              {user.picture ? (
                <img
                  src={user.picture}
                  alt=""
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-background-muted flex items-center justify-center">
                  <UserIcon className="h-5 w-5 text-text-secondary" />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-prominent truncate">
                  {user.name ?? user.email}
                </div>
                <div className="text-xs text-text-secondary truncate">{user.email}</div>
                <div className="text-[11px] text-text-secondary mt-0.5">
                  Tier: <span className="font-medium uppercase">{user.sub_tier}</span>
                  {subscription?.monthly_token_quota != null && (
                    <>
                      {' · '}
                      {subscription.monthly_tokens_used.toLocaleString()} /{' '}
                      {subscription.monthly_token_quota.toLocaleString()} tokens this month
                    </>
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
            <div className="text-xs text-text-secondary">Not signed in.</div>
            <Button size="sm" onClick={() => setOpen(true)}>
              <LogIn className="h-3 w-3 mr-1" />
              Sign in to Atlas
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0">
          <SignInScreen onContinueBYOK={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
