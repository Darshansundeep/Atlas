/**
 * Onboarding tour. Spec 023/Item 11.
 *
 * Shows after the first successful provider configuration. Lightweight
 * 4-step popover anchored at the bottom-right, dismissable, persisted
 * via a settings flag so it never reappears.
 *
 * Storage: `settings.tourCompleted` boolean.
 */

import { useEffect, useState } from 'react';
import { ArrowRight, X, KeyRound, BarChart3, MessageSquarePlus, Settings as SettingsIcon } from 'lucide-react';
import { AtlasMark } from '../atlas-brand/AtlasMark';

type StepIcon = React.ComponentType<{ className?: string }>;

interface Step {
  title: string;
  body: string;
  icon: StepIcon;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Atlas',
    body:
      'Your AI agent by NET Group. Atlas runs as a desktop app and your prompts stay between you and your model provider.',
    icon: MessageSquarePlus as unknown as StepIcon,
  },
  {
    title: 'Two ways to use Atlas',
    body:
      "Bring your own API keys for direct access to your provider, or sign in to Atlas Cloud for our proxy with billing and team features. You're currently in API-key mode.",
    icon: KeyRound as unknown as StepIcon,
  },
  {
    title: 'Track your usage',
    body:
      'The Usage tab in the sidebar shows tokens, cost, and which models you used — aggregated from your local chat history. Nothing leaves your machine.',
    icon: BarChart3 as unknown as StepIcon,
  },
  {
    title: 'Everything else lives in Settings',
    body:
      'Provider keys, model defaults, pricing overrides, theme — all under the gear icon. You can come back to this tour any time from Settings → App.',
    icon: SettingsIcon as unknown as StepIcon,
  },
];

interface OnboardingTourProps {
  /** Override the auto-detection (e.g. when user re-launches from Settings). */
  forceShow?: boolean;
  onComplete?: () => void;
}

export default function OnboardingTour({ forceShow, onComplete }: OnboardingTourProps) {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  // Decide visibility on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (forceShow) {
        setShow(true);
        setStep(0);
        return;
      }
      try {
        const done = await window.electron.getSetting('tourCompleted');
        if (!cancelled && !done) {
          setShow(true);
          setStep(0);
        }
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [forceShow]);

  const finish = async () => {
    setShow(false);
    try {
      await window.electron.setSetting('tourCompleted', true);
    } catch {
      // ignore
    }
    onComplete?.();
  };

  const advance = () => {
    if (step + 1 >= STEPS.length) {
      void finish();
    } else {
      setStep(step + 1);
    }
  };

  if (!show) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step + 1 >= STEPS.length;

  return (
    <div
      className="fixed z-50 animate-in fade-in slide-in-from-bottom-3 duration-300"
      style={{ right: 20, bottom: 20 }}
      data-testid="atlas-onboarding-tour"
    >
      <div
        className="w-80 rounded-2xl overflow-hidden"
        style={{
          background: 'var(--color-background-primary)',
          border: '1px solid var(--color-border-primary)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Header bar */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{
            background:
              'linear-gradient(135deg, var(--atlas-brand-cobalt-deep) 0%, var(--atlas-brand-cobalt) 100%)',
            color: 'var(--atlas-brand-cream)',
          }}
        >
          <div className="flex items-center gap-2">
            <AtlasMark size={18} glyphColor="rgba(255,255,255,0.9)" accentColor="var(--atlas-brand-amber)" />
            <span style={{ fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.04em' }}>
              {step + 1} of {STEPS.length}
            </span>
          </div>
          <button
            onClick={() => void finish()}
            aria-label="Dismiss tour"
            className="rounded-md p-1 hover:bg-white/10 transition-colors"
            style={{ color: 'var(--atlas-brand-cream)' }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          <div className="flex items-start gap-3 mb-3">
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--atlas-brand-amber-soft)', color: 'var(--atlas-brand-amber)' }}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <h4
                style={{
                  fontSize: '1rem',
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  color: 'var(--atlas-brand-ink)',
                  marginBottom: 4,
                  lineHeight: 1.2,
                }}
              >
                {current.title}
              </h4>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                {current.body}
              </p>
            </div>
          </div>

          {/* Step dots */}
          <div className="flex items-center gap-1.5 mb-4">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className="rounded-full transition-all"
                style={{
                  height: 4,
                  width: i === step ? 18 : 4,
                  background:
                    i === step
                      ? 'var(--atlas-brand-cobalt)'
                      : 'var(--color-border-secondary)',
                }}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => void finish()}
              className="text-xs px-2 py-1 rounded-md transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Skip
            </button>
            <button
              onClick={advance}
              data-testid="atlas-tour-next"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all"
              style={{
                background:
                  'linear-gradient(135deg, var(--atlas-brand-cobalt-deep), var(--atlas-brand-cobalt))',
                color: 'var(--atlas-brand-cream)',
                boxShadow: '0 4px 12px -4px rgba(15, 23, 41, 0.30)',
              }}
            >
              {isLast ? 'Got it' : 'Next'}
              {!isLast && <ArrowRight className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
