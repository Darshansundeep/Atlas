/**
 * Spec 008 — Usage Analytics page.
 *
 * Reads existing sessions via the listSessions API and aggregates over
 * windows (today / 7 days / 30 days) by provider × model. Resolves prices
 * via the catalogue first, user pricingOverrides second.
 *
 * No new storage layer at v1 — everything comes from data Atlas already
 * persists per-session. Tool-call counts are not included at v1 because
 * they live inside each session's `conversation` (per-message metadata)
 * and reading every full session is wasteful for the dashboard. A future
 * pass can record tool-call counts at session-close time into a fast
 * column or sidecar JSON.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Coins, MessageSquare, RefreshCw, Wrench } from 'lucide-react';
import { listSessions } from '../../api';
import type { Session } from '../../api';
import { useAuth } from '../../auth';
import { AtlasMark } from '../atlas-brand/AtlasMark';
import { EmptyIllustration } from '../atlas-brand/EmptyIllustration';
import { fetchCanonicalModelInfo } from '../../utils/canonical';
import { getOverrideFor, PRICING_OVERRIDES_CHANGED } from '../../utils/pricing';

type WindowKey = 'today' | 'week' | 'month' | 'all';

const WINDOW_MS: Record<WindowKey, number | null> = {
  today: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  all: null,
};

const WINDOW_LABEL: Record<WindowKey, string> = {
  today: 'Today',
  week: 'Last 7 days',
  month: 'Last 30 days',
  all: 'All time',
};

interface AggRow {
  provider: string;
  model: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** USD, computed from override→catalogue cascade. */
  cost: number;
}

interface DayBucket {
  date: string;    // YYYY-MM-DD
  tokens: number;
  cost: number;
}

interface ToolRow {
  name: string;
  count: number;
}

interface Aggregated {
  rows: AggRow[];
  totalSessions: number;
  totalInput: number;
  totalOutput: number;
  totalCost: number;
  totalToolCalls: number;
  daily: DayBucket[];
  topTools: ToolRow[];
}

/** Pull canonical price (or override) per (provider, model). Cached. */
async function priceFor(provider: string, model: string): Promise<{ input: number; output: number }> {
  const override = await getOverrideFor(provider, model);
  if (override) {
    return { input: override.inputPerMillion, output: override.outputPerMillion };
  }
  const cat = await fetchCanonicalModelInfo(provider, model);
  return {
    input: cat?.input_token_cost ?? 0,
    output: cat?.output_token_cost ?? 0,
  };
}

async function aggregate(sessions: Session[], windowKey: WindowKey): Promise<Aggregated> {
  const ms = WINDOW_MS[windowKey];
  const cutoff = ms !== null ? Date.now() - ms : 0;
  const inWindow = sessions.filter((s) => {
    if (!ms) return true;
    const t = new Date(s.updated_at ?? s.created_at ?? 0).getTime();
    return t >= cutoff;
  });

  // Resolve prices once per unique key.
  const priceCache = new Map<string, { input: number; output: number }>();
  const keyFor = (s: Session) =>
    `${(s.provider_name ?? 'unknown').toLowerCase()}/${s.model_config?.model_name ?? 'unknown'}`;
  const unique = new Set<string>();
  for (const s of inWindow) unique.add(keyFor(s));
  await Promise.all(
    Array.from(unique).map(async (k) => {
      const [p, ...rest] = k.split('/');
      const m = rest.join('/');
      priceCache.set(k, await priceFor(p, m));
    })
  );

  const grouped = new Map<string, AggRow>();
  const daily = new Map<string, DayBucket>();
  const tools = new Map<string, number>();
  let totalSessions = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;
  let totalToolCalls = 0;

  for (const s of inWindow) {
    totalSessions++;
    const provider = (s.provider_name ?? 'unknown').toLowerCase();
    const model = s.model_config?.model_name ?? 'unknown';
    const key = `${provider}/${model}`;
    const inT = s.accumulated_input_tokens ?? 0;
    const outT = s.accumulated_output_tokens ?? 0;
    const total = s.accumulated_total_tokens ?? inT + outT;
    const price = priceCache.get(key) ?? { input: 0, output: 0 };
    const cost = (inT * price.input + outT * price.output) / 1_000_000;

    totalInput += inT;
    totalOutput += outT;
    totalCost += cost;

    const existing = grouped.get(key);
    if (existing) {
      existing.sessions++;
      existing.inputTokens += inT;
      existing.outputTokens += outT;
      existing.totalTokens += total;
      existing.cost += cost;
    } else {
      grouped.set(key, {
        provider, model, sessions: 1,
        inputTokens: inT, outputTokens: outT, totalTokens: total, cost,
      });
    }

    // Daily bucket
    const d = new Date(s.updated_at ?? s.created_at ?? Date.now()).toISOString().slice(0, 10);
    const bucket = daily.get(d);
    if (bucket) {
      bucket.tokens += total;
      bucket.cost += cost;
    } else {
      daily.set(d, { date: d, tokens: total, cost });
    }

    // Tool-call counting — best-effort, only works when session.conversation
    // is hydrated by the backend.
    if (Array.isArray(s.conversation)) {
      for (const msg of s.conversation) {
        if (!msg || !Array.isArray(msg.content)) continue;
        for (const c of msg.content) {
          if (c && (c as { type?: string }).type === 'toolRequest') {
            totalToolCalls++;
            // Try to extract a friendly tool name.
            const tc = (c as { toolCall?: Record<string, unknown> }).toolCall;
            const rawName =
              (tc?.name as string | undefined) ??
              (tc?.tool_name as string | undefined) ??
              ((tc?.params as Record<string, unknown> | undefined)?.name as string | undefined);
            const name = rawName ?? 'unknown';
            tools.set(name, (tools.get(name) ?? 0) + 1);
          }
        }
      }
    }
  }

  const rows = Array.from(grouped.values()).sort((a, b) => b.totalTokens - a.totalTokens);
  const dailyArr = Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date));
  const topTools: ToolRow[] = Array.from(tools.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    rows, totalSessions, totalInput, totalOutput, totalCost,
    totalToolCalls, daily: dailyArr, topTools,
  };
}

function fmtTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return (n / 1000).toFixed(1) + 'K';
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  return (n / 1_000_000_000).toFixed(2) + 'B';
}
function fmtCost(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return '<$0.01';
  return '$' + n.toFixed(2);
}

export default function UsagePage() {
  const { user, subscription } = useAuth();
  const [windowKey, setWindowKey] = useState<WindowKey>('week');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [agg, setAgg] = useState<Aggregated | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listSessions({ throwOnError: true });
      const s = (res.data?.sessions ?? []) as Session[];
      setSessions(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-aggregate when sessions or window change. Re-runs when pricing
  // overrides change so the UI reflects the new prices live.
  useEffect(() => {
    let cancelled = false;
    aggregate(sessions, windowKey).then((a) => {
      if (!cancelled) setAgg(a);
    });
    const onChange = () => {
      aggregate(sessions, windowKey).then((a) => {
        if (!cancelled) setAgg(a);
      });
    };
    window.addEventListener(PRICING_OVERRIDES_CHANGED, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(PRICING_OVERRIDES_CHANGED, onChange);
    };
  }, [sessions, windowKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const cards = useMemo(() => {
    if (!agg) return [];
    return [
      {
        label: 'Sessions',
        value: agg.totalSessions.toLocaleString(),
        hint: `${WINDOW_LABEL[windowKey].toLowerCase()}`,
        icon: MessageSquare,
      },
      {
        label: 'Tokens in',
        value: fmtTokens(agg.totalInput),
        hint: 'sent to models',
        icon: BarChart3,
      },
      {
        label: 'Tokens out',
        value: fmtTokens(agg.totalOutput),
        hint: 'received from models',
        icon: BarChart3,
      },
      {
        label: 'Cost',
        value: fmtCost(agg.totalCost),
        hint: 'USD, override-aware',
        icon: Coins,
      },
      {
        label: 'Tool calls',
        value: agg.totalToolCalls.toLocaleString(),
        hint: agg.topTools.length === 0 && agg.totalToolCalls === 0 ? 'no tool data yet' : 'recorded invocations',
        icon: Wrench,
      },
    ];
  }, [agg, windowKey]);

  return (
    <div
      className="h-full w-full overflow-y-auto"
      style={{ background: 'var(--atlas-gradient-soft)' }}
    >
      <div className="max-w-5xl mx-auto px-8 py-10 pt-16">
        {/* Page header */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AtlasMark size={18} />
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Usage analytics
              </span>
            </div>
            <h1
              style={{
                fontSize: '2.25rem',
                fontWeight: 600,
                letterSpacing: '-0.025em',
                color: 'var(--atlas-brand-ink)',
                lineHeight: 1.1,
              }}
            >
              Your activity
            </h1>
            {user && (
              <p
                className="mt-1"
                style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}
              >
                Signed in as <strong>{user.email}</strong> — Tier <strong className="uppercase">{user.sub_tier}</strong>
                {subscription?.monthly_token_quota != null && (
                  <> · {subscription.monthly_tokens_used.toLocaleString()} / {subscription.monthly_token_quota.toLocaleString()} tokens this billing month</>
                )}
              </p>
            )}
          </div>

          {/* Window picker */}
          <div className="flex items-center gap-2">
            <div
              className="inline-flex p-1 rounded-lg"
              style={{ background: 'var(--color-background-tertiary)' }}
            >
              {(['today', 'week', 'month', 'all'] as WindowKey[]).map((w) => (
                <button
                  key={w}
                  onClick={() => setWindowKey(w)}
                  className="px-3 py-1 text-xs rounded-md transition-colors"
                  style={{
                    background:
                      windowKey === w
                        ? 'var(--color-background-primary)'
                        : 'transparent',
                    color:
                      windowKey === w
                        ? 'var(--atlas-brand-ink)'
                        : 'var(--color-text-secondary)',
                    fontWeight: windowKey === w ? 600 : 500,
                    boxShadow: windowKey === w ? 'var(--shadow-sm)' : 'none',
                  }}
                >
                  {WINDOW_LABEL[w]}
                </button>
              ))}
            </div>
            <button
              onClick={() => void reload()}
              disabled={loading}
              title="Refresh"
              className="p-2 rounded-md transition-colors"
              style={{
                border: '1px solid var(--color-border-secondary)',
                background: 'var(--color-background-primary)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {error && (
          <div
            className="text-sm rounded-lg px-3 py-2 mb-4"
            style={{
              border: '1px solid var(--color-border-danger)',
              background: 'rgba(200, 71, 75, 0.08)',
              color: 'var(--color-text-danger)',
            }}
          >
            {error}
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {cards.map((c) => (
            <div
              key={c.label}
              className="rounded-xl p-4 relative overflow-hidden"
              style={{
                background: 'var(--color-background-primary)',
                border: '1px solid var(--color-border-primary)',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute', inset: 0,
                  background: 'var(--atlas-gradient-card-glow)',
                  pointerEvents: 'none',
                }}
              />
              <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                  <c.icon className="h-3.5 w-3.5" style={{ color: 'var(--color-text-secondary)' }} />
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {c.label}
                  </span>
                </div>
                <div
                  className="tabular-nums"
                  style={{
                    fontSize: '1.6rem',
                    fontWeight: 600,
                    letterSpacing: '-0.02em',
                    color: 'var(--atlas-brand-ink)',
                  }}
                >
                  {c.value}
                </div>
                <div
                  style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)', marginTop: 2 }}
                >
                  {c.hint}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Daily sparkline */}
        {agg && agg.daily.length > 0 && (
          <div
            className="rounded-xl p-4 mb-6"
            style={{
              background: 'var(--color-background-primary)',
              border: '1px solid var(--color-border-primary)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Daily tokens
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}>
                {agg.daily.length} day{agg.daily.length === 1 ? '' : 's'} with activity
              </span>
            </div>
            <DailyChart buckets={agg.daily} />
          </div>
        )}

        {/* Top models */}
        <div
          className="rounded-xl"
          style={{
            background: 'var(--color-background-primary)',
            border: '1px solid var(--color-border-primary)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div className="px-4 py-3 flex items-center justify-between" style={{
            borderBottom: '1px solid var(--color-border-primary)',
          }}>
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--color-text-secondary)',
              }}
            >
              Models used
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}>
              {agg?.rows.length ?? 0} distinct model{(agg?.rows.length ?? 0) === 1 ? '' : 's'}
            </span>
          </div>

          {!agg || agg.rows.length === 0 ? (
            <div className="px-4 py-10 flex flex-col items-center gap-3">
              <EmptyIllustration variant="usage" width={220} />
              <div className="text-center">
                <div
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: 'var(--atlas-brand-ink)',
                    marginBottom: 4,
                  }}
                >
                  {loading ? 'Loading sessions…' : 'No activity yet in this window'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', maxWidth: '36ch' }}>
                  Start a chat to see token usage, cost, and model breakdowns here.
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: 'var(--color-text-secondary)' }}>
                    <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wider">Provider</th>
                    <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wider">Model</th>
                    <th className="text-right px-4 py-2 text-xs font-medium uppercase tracking-wider">Sessions</th>
                    <th className="text-right px-4 py-2 text-xs font-medium uppercase tracking-wider">Tokens in</th>
                    <th className="text-right px-4 py-2 text-xs font-medium uppercase tracking-wider">Tokens out</th>
                    <th className="text-right px-4 py-2 text-xs font-medium uppercase tracking-wider">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {agg.rows.map((r) => (
                    <tr
                      key={`${r.provider}/${r.model}`}
                      style={{ borderTop: '1px solid var(--color-border-primary)' }}
                    >
                      <td className="px-4 py-2.5" style={{ color: 'var(--color-text-secondary)' }}>{r.provider}</td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: 'var(--atlas-brand-ink)' }}>{r.model}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.sessions}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{fmtTokens(r.inputTokens)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{fmtTokens(r.outputTokens)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium" style={{ color: 'var(--atlas-brand-ink)' }}>{fmtCost(r.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top tools — only show if we actually have data */}
        {agg && agg.topTools.length > 0 && (
          <div
            className="rounded-xl mt-4"
            style={{
              background: 'var(--color-background-primary)',
              border: '1px solid var(--color-border-primary)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--color-border-primary)' }}
            >
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Top tools
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}>
                top 10 by invocations
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: 'var(--color-text-secondary)' }}>
                    <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wider">Tool</th>
                    <th className="text-right px-4 py-2 text-xs font-medium uppercase tracking-wider">Invocations</th>
                  </tr>
                </thead>
                <tbody>
                  {agg.topTools.map((t) => (
                    <tr
                      key={t.name}
                      style={{ borderTop: '1px solid var(--color-border-primary)' }}
                    >
                      <td className="px-4 py-2.5 font-mono" style={{ color: 'var(--atlas-brand-ink)' }}>
                        {t.name}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{t.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p
          className="mt-4 text-center"
          style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}
        >
          Prices resolved from your local pricing overrides → bundled catalogue. Stored locally; nothing leaves your machine.
        </p>
      </div>
    </div>
  );
}

interface DailyChartProps {
  buckets: DayBucket[];
}

function DailyChart({ buckets }: DailyChartProps) {
  const max = buckets.reduce((m, b) => Math.max(m, b.tokens), 0) || 1;
  const w = 800;
  const h = 60;
  const barW = Math.max(2, Math.min(20, (w - (buckets.length - 1) * 4) / buckets.length));
  const gap = 4;

  return (
    <svg
      viewBox={`0 0 ${buckets.length * (barW + gap)} ${h}`}
      preserveAspectRatio="none"
      width="100%"
      height={h}
      style={{ display: 'block' }}
    >
      {buckets.map((b, i) => {
        const bh = (b.tokens / max) * (h - 4);
        return (
          <g key={b.date}>
            <rect
              x={i * (barW + gap)}
              y={h - bh}
              width={barW}
              height={bh}
              rx={1.5}
              fill="var(--atlas-brand-cobalt)"
              opacity={0.85}
            >
              <title>{b.date} — {fmtTokens(b.tokens)} tokens, {fmtCost(b.cost)}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}
