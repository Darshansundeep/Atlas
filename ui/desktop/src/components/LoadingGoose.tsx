import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Square, AlertCircle, Clipboard, ClipboardCheck } from 'lucide-react';
import GooseLogo from './GooseLogo';
import AnimatedIcons from './AnimatedIcons';
import FlyingBird from './FlyingBird';
import { ChatState } from '../types/chatState';
import { defineMessages, useIntl } from '../i18n';
import { FEATURES } from '../branding';

interface LoadingGooseProps {
  message?: string;
  chatState?: ChatState;
  /**
   * Spec 005: when set, the loading indicator surfaces a Cancel button after
   * ~15s of continuous activity. Wire this to the existing useChatStream
   * `stopStreaming` callback.
   */
  onCancel?: () => void;
  /**
   * Spec 005: identifies the conversation for the diagnose-bundle.
   */
  sessionId?: string;
}

const i18n = defineMessages({
  loadingConversation: {
    id: 'loadingGoose.loadingConversation',
    defaultMessage: 'loading conversation...',
  },
  thinking: {
    id: 'loadingGoose.thinking',
    defaultMessage: 'Atlas is thinking…', // brand-allow: react-intl defaultMessage
  },
  streaming: {
    id: 'loadingGoose.streaming',
    defaultMessage: 'Atlas is working on it…', // brand-allow: react-intl defaultMessage
  },
  waiting: {
    id: 'loadingGoose.waiting',
    defaultMessage: 'Atlas is waiting…', // brand-allow: react-intl defaultMessage
  },
  compacting: {
    id: 'loadingGoose.compacting',
    defaultMessage: 'Atlas is compacting the conversation...', // brand-allow
  },
  idle: {
    id: 'loadingGoose.idle',
    defaultMessage: 'Atlas is working on it…', // brand-allow: react-intl defaultMessage
  },
  restartingAgent: {
    id: 'loadingGoose.restartingAgent',
    defaultMessage: 'restarting session...',
  },
  takingLonger: {
    id: 'loadingGoose.takingLonger',
    defaultMessage: 'this is taking longer than usual…',
  },
  likelyStuck: {
    id: 'loadingGoose.likelyStuck',
    defaultMessage: 'Likely stuck.',
  },
  cancelAndReport: {
    id: 'loadingGoose.cancelAndReport',
    defaultMessage: 'Cancel and report',
  },
  continueWaiting: {
    id: 'loadingGoose.continueWaiting',
    defaultMessage: 'Continue waiting',
  },
  cancel: {
    id: 'loadingGoose.cancel',
    defaultMessage: 'Cancel',
  },
  diagnose: {
    id: 'loadingGoose.diagnose',
    defaultMessage: 'Diagnose',
  },
  diagnoseCopied: {
    id: 'loadingGoose.diagnoseCopied',
    defaultMessage: 'Diagnostic info copied',
  },
});

const STATE_ICONS: Record<ChatState, React.ReactNode> = {
  [ChatState.LoadingConversation]: <AnimatedIcons className="flex-shrink-0" cycleInterval={600} />,
  [ChatState.Thinking]: <AnimatedIcons className="flex-shrink-0" cycleInterval={600} />,
  [ChatState.Streaming]: <FlyingBird className="flex-shrink-0" cycleInterval={150} />,
  [ChatState.WaitingForUserInput]: (
    <AnimatedIcons className="flex-shrink-0" cycleInterval={600} variant="waiting" />
  ),
  [ChatState.Compacting]: <AnimatedIcons className="flex-shrink-0" cycleInterval={600} />,
  [ChatState.Idle]: <GooseLogo size="small" hover={false} />,
  [ChatState.RestartingAgent]: <AnimatedIcons className="flex-shrink-0" cycleInterval={600} />,
};

const STATE_MESSAGE_KEYS: Record<ChatState, keyof typeof i18n> = {
  [ChatState.LoadingConversation]: 'loadingConversation',
  [ChatState.Thinking]: 'thinking',
  [ChatState.Streaming]: 'streaming',
  [ChatState.WaitingForUserInput]: 'waiting',
  [ChatState.Compacting]: 'compacting',
  [ChatState.Idle]: 'idle',
  [ChatState.RestartingAgent]: 'restartingAgent',
};

// Spec 005 thresholds (seconds).
const STAGE = {
  SHOW_ELAPSED: 3,
  SHOW_CANCEL: 15,
  SOFTEN_COPY: 60,
  PRESUME_STUCK: 300,
} as const;

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function useElapsedSeconds(active: boolean, resetKey: unknown): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      startRef.current = null;
      setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => {
      if (startRef.current !== null) {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, resetKey]);

  return elapsed;
}

const LoadingGoose = ({
  message,
  chatState = ChatState.Idle,
  onCancel,
  sessionId,
}: LoadingGooseProps) => {
  const intl = useIntl();
  const baseMessage =
    message || intl.formatMessage(i18n[STATE_MESSAGE_KEYS[chatState]]);
  const icon = STATE_ICONS[chatState];

  const active =
    FEATURES.toolCallProgress &&
    chatState !== ChatState.Idle &&
    chatState !== ChatState.LoadingConversation;

  const elapsed = useElapsedSeconds(active, chatState);

  const [continueWaitingAt, setContinueWaitingAt] = useState<number | null>(null);
  const [diagnoseCopied, setDiagnoseCopied] = useState(false);
  const copiedTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // Reset the "continue waiting" override whenever a new activity begins.
    setContinueWaitingAt(null);
    setDiagnoseCopied(false);
  }, [chatState]);

  const effectiveElapsed = continueWaitingAt
    ? Math.max(0, elapsed - continueWaitingAt)
    : elapsed;

  const showElapsed = active && elapsed >= STAGE.SHOW_ELAPSED;
  const showCancel = active && elapsed >= STAGE.SHOW_CANCEL && !!onCancel;
  const useSoftCopy = active && effectiveElapsed >= STAGE.SOFTEN_COPY;
  const presumeStuck = active && effectiveElapsed >= STAGE.PRESUME_STUCK;

  const copyDiagnostics = useCallback(async () => {
    const blob = {
      timestamp: new Date().toISOString(),
      sessionId: sessionId ?? null,
      chatState,
      elapsedSeconds: elapsed,
      message: baseMessage,
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(blob, null, 2));
      setDiagnoseCopied(true);
      if (copiedTimeoutRef.current) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
      copiedTimeoutRef.current = window.setTimeout(() => setDiagnoseCopied(false), 2500);
    } catch (e) {
      console.warn('Failed to copy diagnostics', e);
    }
  }, [sessionId, chatState, elapsed, baseMessage]);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) window.clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  const displayMessage = useSoftCopy
    ? intl.formatMessage(i18n.takingLonger)
    : baseMessage;

  const stuckBlock = useMemo(() => {
    if (!presumeStuck) return null;
    return (
      <div className="mt-2 flex flex-col gap-2 rounded-md border border-border-default bg-background-muted p-2">
        <div className="flex items-center gap-2 text-text-prominent">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="font-medium">
            {intl.formatMessage(i18n.likelyStuck)} {formatElapsed(elapsed)} elapsed.
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {onCancel && (
            <button
              type="button"
              onClick={async () => {
                await copyDiagnostics();
                onCancel();
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border-default bg-background-default px-2 py-1 text-xs hover:bg-background-subtle"
            >
              <Square className="h-3 w-3" />
              {intl.formatMessage(i18n.cancelAndReport)}
            </button>
          )}
          <button
            type="button"
            onClick={() => setContinueWaitingAt(elapsed)}
            className="inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-border-default"
          >
            {intl.formatMessage(i18n.continueWaiting)}
          </button>
        </div>
      </div>
    );
  }, [presumeStuck, elapsed, onCancel, copyDiagnostics, intl]);

  return (
    <div className="w-full animate-fade-slide-up">
      <div
        data-testid="loading-indicator"
        className="flex items-center gap-2 text-xs text-text-primary py-2 flex-wrap"
      >
        {icon}
        <span>{displayMessage}</span>
        {showElapsed && (
          <span className="text-text-secondary tabular-nums" data-testid="loading-elapsed">
            · {formatElapsed(elapsed)}
          </span>
        )}
        {showCancel && !presumeStuck && (
          <button
            type="button"
            onClick={onCancel}
            data-testid="loading-cancel"
            className="ml-1 inline-flex items-center gap-1 rounded-md border border-border-subtle px-1.5 py-0.5 text-xs text-text-secondary hover:text-text-primary hover:border-border-default"
            title={intl.formatMessage(i18n.cancel)}
          >
            <Square className="h-3 w-3" />
            {intl.formatMessage(i18n.cancel)}
          </button>
        )}
        {useSoftCopy && !presumeStuck && (
          <button
            type="button"
            onClick={copyDiagnostics}
            data-testid="loading-diagnose"
            className="inline-flex items-center gap-1 rounded-md border border-border-subtle px-1.5 py-0.5 text-xs text-text-secondary hover:text-text-primary hover:border-border-default"
            title={
              diagnoseCopied
                ? intl.formatMessage(i18n.diagnoseCopied)
                : intl.formatMessage(i18n.diagnose)
            }
          >
            {diagnoseCopied ? (
              <ClipboardCheck className="h-3 w-3" />
            ) : (
              <Clipboard className="h-3 w-3" />
            )}
            {intl.formatMessage(i18n.diagnose)}
          </button>
        )}
      </div>
      {stuckBlock}
    </div>
  );
};

export default LoadingGoose;
