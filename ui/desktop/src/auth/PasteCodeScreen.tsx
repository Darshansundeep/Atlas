/**
 * Paste-the-code fallback. Spec 002-cloud-auth, clarify Q3 answer:
 * paste-code is the PRIMARY firewall fallback (loopback runs in parallel
 * but is wired in the main process — no UI required for it).
 */

import { useCallback, useState } from 'react';
import { ArrowLeft, ClipboardPaste } from 'lucide-react';

interface PasteCodeScreenProps {
  onSubmit: (code: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCancel: () => void;
}

export function PasteCodeScreen({ onSubmit, onCancel }: PasteCodeScreenProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async () => {
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      setError('Code is too short');
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await onSubmit(trimmed);
    if (!res.ok) {
      setError(humanizeError(res.error));
      setSubmitting(false);
    }
  }, [code, onSubmit]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void submit();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] w-full p-8">
      <div className="max-w-md w-full space-y-5">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </button>

        <h2 className="text-2xl font-light text-text-prominent">Finish signing in</h2>
        <p className="text-sm text-text-secondary leading-relaxed">
          Your browser is showing a sign-in code on the Atlas page. Paste it below to
          finish. You can use this method on any network — it doesn&rsquo;t need an open
          loopback port.
        </p>

        <div className="space-y-2">
          <label htmlFor="atlas-paste-code" className="block text-xs font-medium text-text-secondary">
            Sign-in code
          </label>
          <input
            id="atlas-paste-code"
            type="text"
            autoFocus
            spellCheck={false}
            autoComplete="off"
            value={code}
            disabled={submitting}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="paste the code from your browser"
            data-testid="auth-paste-code-input"
            className="w-full px-3 py-2 text-base font-mono rounded-md border border-border-default bg-background-default text-text-prominent"
          />
        </div>

        {error && (
          <div className="text-xs rounded-md border border-border-error bg-background-error/30 px-3 py-2 text-text-error">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting || code.trim().length === 0}
          data-testid="auth-paste-code-submit"
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-border-default bg-background-prominent text-text-on-prominent px-4 py-2.5 hover:bg-background-prominent/90 disabled:opacity-50"
        >
          <ClipboardPaste className="h-4 w-4" />
          {submitting ? 'Finishing sign-in…' : 'Finish sign-in'}
        </button>
      </div>
    </div>
  );
}

function humanizeError(code: string): string {
  switch (code) {
    case 'invalid_grant':
      return 'That code is invalid or has expired. Start the sign-in flow again.';
    case 'token_theft_suspected':
      return 'Atlas detected a sign-in problem. Please start the sign-in flow again.';
    case 'idp_upstream_error':
      return 'The sign-in service is temporarily unavailable. Try again in a moment.';
    case 'idp_not_configured':
      return 'The Atlas backend is not configured. Contact your administrator.';
    default:
      return `Sign-in failed (${code}). Try again or use API keys instead.`;
  }
}
