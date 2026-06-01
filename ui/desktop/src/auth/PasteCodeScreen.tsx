/**
 * Paste-the-code fallback. Spec 002-cloud-auth, clarify Q3 answer:
 * paste-code is the PRIMARY firewall fallback (loopback runs in parallel
 * but is wired in the main process — no UI required for it).
 */

import { useCallback, useState } from 'react';
import { ArrowLeft, ClipboardPaste, Loader2 } from 'lucide-react';
import { AtlasMark } from '../components/atlas-brand/AtlasMark';
import { HeroBackground } from '../components/atlas-brand/HeroBackground';

interface PasteCodeScreenProps {
  onSubmit: (code: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCancel: () => void;
  compact?: boolean;
}

export function PasteCodeScreen({ onSubmit, onCancel, compact = false }: PasteCodeScreenProps) {
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
    // Reset regardless — on success the parent unmounts us anyway, but
    // belt-and-suspenders in case the modal stays open for a re-render
    // tick. (Bug: spinner used to be stuck on "Finishing sign-in…".)
    setSubmitting(false);
    if (!res.ok) {
      setError(humanizeError(res.error));
    }
  }, [code, onSubmit]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void submit();
  };

  const card = (
    <div
      className="w-full max-w-md flex flex-col gap-6 rounded-2xl p-8"
      style={{
        backgroundColor: compact ? 'transparent' : 'rgba(255, 255, 255, 0.96)',
        boxShadow: compact ? 'none' : 'var(--shadow-lg)',
        backdropFilter: compact ? 'none' : 'blur(12px)',
      }}
    >
      <button
        type="button"
        onClick={onCancel}
        className="flex items-center gap-1 text-xs self-start"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <ArrowLeft className="h-3 w-3" /> Back
      </button>

      <div className="flex flex-col items-center text-center gap-3">
        <AtlasMark size={40} />
        <h2
          style={{
            fontSize: '1.5rem',
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: 'var(--atlas-brand-ink)',
            lineHeight: 1.15,
          }}
        >
          Finish signing in
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', maxWidth: '36ch', lineHeight: 1.5 }}>
          Your browser is showing a sign-in code. Paste it here to finish — works on any network.
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="atlas-paste-code"
          className="block text-xs font-medium"
          style={{ color: 'var(--color-text-secondary)' }}
        >
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
          placeholder="paste from your browser"
          data-testid="auth-paste-code-input"
          className="w-full px-3 py-2.5 text-sm font-mono rounded-lg outline-none transition-shadow"
          style={{
            border: '1px solid var(--color-border-secondary)',
            background: 'var(--color-background-primary)',
            color: 'var(--atlas-brand-ink)',
          }}
        />
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

      <button
        type="button"
        onClick={submit}
        disabled={submitting || code.trim().length === 0}
        data-testid="auth-paste-code-submit"
        className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 disabled:opacity-50"
        style={{
          background: 'linear-gradient(135deg, var(--atlas-brand-cobalt-deep), var(--atlas-brand-cobalt))',
          color: 'var(--atlas-brand-cream)',
          fontWeight: 500,
          fontSize: '0.95rem',
          boxShadow:
            '0 6px 18px -6px rgba(15, 23, 41, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        }}
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />}
        {submitting ? 'Finishing sign-in…' : 'Finish sign-in'}
      </button>
    </div>
  );

  if (compact) {
    return <div className="flex items-center justify-center w-full p-6">{card}</div>;
  }

  return (
    <HeroBackground intense className="min-h-screen">
      <div className="flex items-center justify-center w-full min-h-screen p-6">{card}</div>
    </HeroBackground>
  );
}

function humanizeError(code: string): string {
  switch (code) {
    case 'invalid_grant':
      return 'That code is invalid or has expired. Start sign-in again.';
    case 'token_theft_suspected':
      return 'Atlas detected a sign-in problem. Please start sign-in again.';
    case 'idp_upstream_error':
      return 'The sign-in service is temporarily unavailable. Try again in a moment.';
    case 'idp_not_configured':
      return 'The Atlas backend is not configured. Contact your administrator.';
    default:
      return `Sign-in failed (${code}). Try again or use API keys.`;
  }
}
