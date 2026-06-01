/**
 * Atlas Skills view — Spec 022 v0.1.
 *
 * Browses the cloud catalogue at `GET /v1/skills` (atlas-auth-api) and
 * lets the user install/uninstall skills. Installed state is per-user in
 * local settings (`installedSkillIds`). Actual runtime wiring of an
 * installed skill into goosed's extension manager is v0.2 — for v0.1 the
 * install button just toggles the local set so the rest of the platform
 * (admin, future runtime) can act on it.
 *
 * Replaces the upstream Goose SkillsView which read SKILL.md files from
 * disk. That local-skills model still works under the hood; we'll
 * surface it via a sub-tab in a later pass.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  Lock,
  Package,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Verified,
  X,
} from 'lucide-react';
import { AtlasMark } from '../atlas-brand/AtlasMark';
import { EmptyIllustration } from '../atlas-brand/EmptyIllustration';
import { authBackendUrl, useAuth } from '../../auth';
import MarkdownContent from '../MarkdownContent';

/** Render skill prose with the same MarkdownContent component used in chat
 *  bubbles — keeps formatting / code highlighting consistent. */
function SkillMarkdown({ source }: { source: string }) {
  return (
    <div
      className="rounded p-3"
      style={{
        background: 'var(--color-background-secondary)',
        border: '1px solid var(--color-border-primary)',
      }}
    >
      <MarkdownContent content={source} />
    </div>
  );
}

interface SkillRow {
  skill_id: string;
  version: string;
  title: string;
  description: string;
  category: string;
  publisher: { name: string; verified: boolean };
  kind: 'extension' | 'recipe' | 'composite';
  capabilities: string[];
  pricing_tier_min: 'free' | 'pro' | 'team' | 'enterprise';
  manifest: Record<string, unknown>;
  /** Spec 022 v0.3 — SKILL.md content. Null for legacy skills. */
  when_to_use?: string | null;
  instructions_md?: string | null;
  examples_md?: string | null;
  supporting_files?: Record<string, string>;
  updated_at: string;
}

const TIER_ORDER = { free: 0, pro: 1, team: 2, enterprise: 3 } as const;

export default function AtlasSkillsView() {
  const { user } = useAuth();
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [hideLocked, setHideLocked] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailSkill, setDetailSkill] = useState<SkillRow | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resp, installedSetting] = await Promise.all([
        fetch(`${authBackendUrl()}/v1/skills`),
        window.electron.getSetting('installedSkillIds').catch(() => [] as string[]),
      ]);
      if (!resp.ok) throw new Error(`Catalogue HTTP ${resp.status}`);
      const data = (await resp.json()) as SkillRow[];
      setSkills(data);
      setInstalled(new Set(installedSetting ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const userTier = user?.sub_tier ?? 'free';
  const userTierLevel = TIER_ORDER[userTier];

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const s of skills) set.add(s.category);
    return Array.from(set).sort();
  }, [skills]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter((s) => {
      if (category && s.category !== category) return false;
      const isLocked = TIER_ORDER[s.pricing_tier_min] > userTierLevel;
      if (hideLocked && isLocked) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.skill_id.toLowerCase().includes(q) ||
        s.publisher.name.toLowerCase().includes(q)
      );
    });
  }, [skills, query, category, hideLocked, userTierLevel]);

  const persistInstalled = useCallback(async (next: Set<string>) => {
    setInstalled(new Set(next));
    try {
      await window.electron.setSetting('installedSkillIds', Array.from(next));
    } catch (e) {
      console.warn('Failed to persist installedSkillIds', e);
    }
  }, []);

  const install = useCallback(
    async (skill: SkillRow) => {
      setBusyId(skill.skill_id);
      const next = new Set(installed);
      next.add(skill.skill_id);
      await persistInstalled(next);
      setBusyId(null);
    },
    [installed, persistInstalled]
  );

  const uninstall = useCallback(
    async (skill: SkillRow) => {
      setBusyId(skill.skill_id);
      const next = new Set(installed);
      next.delete(skill.skill_id);
      await persistInstalled(next);
      setBusyId(null);
    },
    [installed, persistInstalled]
  );

  return (
    <div
      className="h-full w-full overflow-y-auto"
      style={{ background: 'var(--atlas-gradient-soft)' }}
    >
      <div className="max-w-6xl mx-auto px-8 py-10 pt-16">
        {/* Header */}
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
                Skill catalogue
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
              Skills
            </h1>
            <p
              className="mt-1"
              style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}
            >
              {skills.length} skills available · {installed.size} installed
            </p>
          </div>

          <button
            onClick={() => void loadAll()}
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

        {error && (
          <div
            className="text-sm rounded-lg px-3 py-2 mb-4"
            style={{
              border: '1px solid var(--color-border-danger)',
              background: 'rgba(200, 71, 75, 0.08)',
              color: 'var(--color-text-danger)',
            }}
          >
            Couldn't load skill catalogue — {error}. Is the Atlas auth backend running at{' '}
            <code>{authBackendUrl()}</code>?
          </div>
        )}

        {/* Filter row */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <div
            className="flex items-center gap-2 flex-1 min-w-[260px] rounded-lg px-3 py-1.5"
            style={{ border: '1px solid var(--color-border-secondary)', background: 'var(--color-background-primary)' }}
          >
            <Search className="h-3.5 w-3.5" style={{ color: 'var(--color-text-secondary)' }} />
            <input
              type="text"
              placeholder="Search skills…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: 'var(--atlas-brand-ink)' }}
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-text-tertiary hover:text-text-primary">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div
            className="inline-flex p-1 rounded-lg"
            style={{ background: 'var(--color-background-tertiary)' }}
          >
            <button
              onClick={() => setCategory(null)}
              className="px-3 py-1 text-xs rounded-md transition-colors"
              style={{
                background: category === null ? 'var(--color-background-primary)' : 'transparent',
                color: category === null ? 'var(--atlas-brand-ink)' : 'var(--color-text-secondary)',
                fontWeight: category === null ? 600 : 500,
                boxShadow: category === null ? 'var(--shadow-sm)' : 'none',
              }}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className="px-3 py-1 text-xs rounded-md transition-colors"
                style={{
                  background: category === c ? 'var(--color-background-primary)' : 'transparent',
                  color: category === c ? 'var(--atlas-brand-ink)' : 'var(--color-text-secondary)',
                  fontWeight: category === c ? 600 : 500,
                  boxShadow: category === c ? 'var(--shadow-sm)' : 'none',
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <label
            className="flex items-center gap-2 text-xs px-2 py-1 rounded-md cursor-pointer"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <input
              type="checkbox"
              checked={hideLocked}
              onChange={(e) => setHideLocked(e.target.checked)}
            />
            Hide {userTier === 'free' ? 'paid' : 'higher-tier'} skills
          </label>
        </div>

        {/* Grid */}
        {loading && skills.length === 0 ? (
          <div className="flex items-center justify-center py-16 gap-2" style={{ color: 'var(--color-text-secondary)' }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading skill catalogue…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <EmptyIllustration variant="skills" width={260} />
            <div className="text-center">
              <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--atlas-brand-ink)', marginBottom: 4 }}>
                No matching skills
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                {query ? 'Try a different search term or clear the filter.' : 'No skills in this category yet.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((s) => {
              const isInstalled = installed.has(s.skill_id);
              const isLocked = TIER_ORDER[s.pricing_tier_min] > userTierLevel;
              return (
                <SkillCard
                  key={s.skill_id}
                  skill={s}
                  isInstalled={isInstalled}
                  isLocked={isLocked}
                  busy={busyId === s.skill_id}
                  onInstall={() => void install(s)}
                  onUninstall={() => void uninstall(s)}
                  onOpenDetail={() => setDetailSkill(s)}
                />
              );
            })}
          </div>
        )}

        <p
          className="mt-6 text-center"
          style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}
        >
          Skill manifests served by {authBackendUrl()}. Installed list stored locally.
        </p>
      </div>

      {detailSkill && (
        <SkillDetailModal
          skill={detailSkill}
          isInstalled={installed.has(detailSkill.skill_id)}
          isLocked={TIER_ORDER[detailSkill.pricing_tier_min] > userTierLevel}
          userTier={userTier}
          onClose={() => setDetailSkill(null)}
          onInstall={() => {
            void install(detailSkill);
          }}
          onUninstall={() => {
            void uninstall(detailSkill);
          }}
        />
      )}
    </div>
  );
}

// ---- SkillCard --------------------------------------------------------

interface SkillCardProps {
  skill: SkillRow;
  isInstalled: boolean;
  isLocked: boolean;
  busy: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onOpenDetail: () => void;
}

function SkillCard({ skill, isInstalled, isLocked, busy, onInstall, onUninstall, onOpenDetail }: SkillCardProps) {
  return (
    <div
      className="group relative rounded-xl p-4 transition-all flex flex-col gap-2"
      style={{
        background: 'var(--color-background-primary)',
        border: '1px solid var(--color-border-primary)',
        boxShadow: 'var(--shadow-sm)',
        cursor: 'default',
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'var(--atlas-gradient-card-glow)' }}
      />

      <div className="relative flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpenDetail}
          className="flex items-center gap-2 text-left"
          style={{ cursor: 'pointer' }}
        >
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center text-base font-semibold flex-shrink-0"
            style={{
              background:
                'linear-gradient(135deg, var(--atlas-brand-cobalt) 0%, var(--atlas-brand-amber) 130%)',
              color: 'var(--atlas-brand-cream)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
            }}
          >
            <Package className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div
              className="font-semibold truncate"
              style={{ fontSize: '0.95rem', color: 'var(--atlas-brand-ink)', letterSpacing: '-0.01em' }}
            >
              {skill.title}
            </div>
            <div
              className="flex items-center gap-1 text-xs truncate"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {skill.publisher.name}
              {skill.publisher.verified && (
                <Verified
                  className="h-3 w-3 flex-shrink-0"
                  style={{ color: 'var(--atlas-brand-cobalt)' }}
                />
              )}
            </div>
          </div>
        </button>

        {/* Tier pill */}
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider flex-shrink-0"
          style={
            skill.pricing_tier_min === 'free'
              ? { background: 'rgba(94, 138, 82, 0.12)', color: 'var(--color-text-success)' }
              : { background: 'var(--atlas-brand-amber-soft)', color: 'var(--atlas-brand-amber)' }
          }
        >
          {skill.pricing_tier_min === 'free' ? <Sparkles className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
          {skill.pricing_tier_min}
        </span>
      </div>

      <p
        className="relative"
        style={{
          fontSize: '0.78rem',
          color: 'var(--color-text-secondary)',
          minHeight: '2.8em',
          lineHeight: 1.5,
        }}
      >
        {skill.description.length > 110 ? skill.description.slice(0, 110) + '…' : skill.description}
      </p>

      <div className="relative flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
          <span style={{ textTransform: 'capitalize' }}>{skill.kind}</span>
          {skill.capabilities.length > 0 && <span>· {skill.capabilities.slice(0, 2).join(', ')}</span>}
          <span>· v{skill.version}</span>
        </div>

        {isInstalled ? (
          <button
            type="button"
            onClick={onUninstall}
            disabled={busy}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all"
            style={{
              border: '1px solid var(--color-border-secondary)',
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Uninstall
          </button>
        ) : isLocked ? (
          <span
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium"
            style={{ background: 'var(--color-background-tertiary)', color: 'var(--color-text-tertiary)' }}
          >
            <Lock className="h-3 w-3" />
            Upgrade
          </span>
        ) : (
          <button
            type="button"
            onClick={onInstall}
            disabled={busy}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all"
            style={{
              background: 'linear-gradient(135deg, var(--atlas-brand-cobalt-deep), var(--atlas-brand-cobalt))',
              color: 'var(--atlas-brand-cream)',
              boxShadow: '0 4px 12px -4px rgba(15, 23, 41, 0.25)',
            }}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Install
          </button>
        )}
      </div>
    </div>
  );
}

// ---- SkillDetailModal ------------------------------------------------

interface SkillDetailModalProps {
  skill: SkillRow;
  isInstalled: boolean;
  isLocked: boolean;
  userTier: string;
  onClose: () => void;
  onInstall: () => void;
  onUninstall: () => void;
}

function SkillDetailModal({
  skill,
  isInstalled,
  isLocked,
  userTier,
  onClose,
  onInstall,
  onUninstall,
}: SkillDetailModalProps) {
  const caps = (skill.manifest as { capabilities?: Record<string, unknown> }).capabilities ?? null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-in fade-in duration-150"
      style={{ background: 'rgba(15, 23, 41, 0.55)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{
          background: 'var(--color-background-primary)',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-5 py-4 flex items-start justify-between gap-3"
          style={{ borderBottom: '1px solid var(--color-border-primary)' }}
        >
          <div className="min-w-0 flex items-start gap-3">
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background:
                  'linear-gradient(135deg, var(--atlas-brand-cobalt) 0%, var(--atlas-brand-amber) 130%)',
                color: 'var(--atlas-brand-cream)',
              }}
            >
              <Package className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  color: 'var(--atlas-brand-ink)',
                  lineHeight: 1.15,
                }}
              >
                {skill.title}
              </h3>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                <span>{skill.publisher.name}</span>
                {skill.publisher.verified && <Verified className="h-3 w-3" style={{ color: 'var(--atlas-brand-cobalt)' }} />}
                <span>·</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>v{skill.version}</span>
                <span>·</span>
                <span style={{ textTransform: 'capitalize' }}>{skill.kind}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 transition-colors hover:bg-background-tertiary"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <p style={{ fontSize: '0.88rem', color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
            {skill.description}
          </p>

          {/* SKILL.md prose — the actual capability */}
          {skill.when_to_use && skill.when_to_use.trim() && (
            <div>
              <div
                className="mb-1"
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-secondary)',
                }}
              >
                When to use
              </div>
              <div
                className="px-3 py-2 rounded"
                style={{
                  background: 'var(--atlas-brand-amber-soft)',
                  color: 'var(--atlas-brand-ink)',
                  fontSize: '0.82rem',
                  lineHeight: 1.5,
                  fontStyle: 'italic',
                }}
              >
                {skill.when_to_use}
              </div>
            </div>
          )}

          {skill.instructions_md && skill.instructions_md.trim() && (
            <div>
              <div
                className="mb-1"
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Instructions (SKILL.md)
              </div>
              <SkillMarkdown source={skill.instructions_md} />
            </div>
          )}

          {skill.examples_md && skill.examples_md.trim() && (
            <div>
              <div
                className="mb-1"
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Examples
              </div>
              <SkillMarkdown source={skill.examples_md} />
            </div>
          )}

          <div>
            <div
              className="mb-1"
              style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--color-text-secondary)',
              }}
            >
              Identifier
            </div>
            <code
              className="block px-2 py-1.5 rounded text-xs"
              style={{
                background: 'var(--color-background-tertiary)',
                color: 'var(--atlas-brand-ink)',
              }}
            >
              {skill.skill_id}
            </code>
          </div>

          {caps && (
            <div>
              <div
                className="mb-1"
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Capabilities declared
              </div>
              <pre
                className="text-xs rounded p-2 overflow-x-auto"
                style={{
                  background: 'var(--color-background-tertiary)',
                  color: 'var(--atlas-brand-ink)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {JSON.stringify(caps, null, 2)}
              </pre>
            </div>
          )}

          {skill.capabilities.length > 0 && (
            <div>
              <div
                className="mb-1"
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Tags
              </div>
              <div className="flex flex-wrap gap-1">
                {skill.capabilities.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded-full text-[11px]"
                    style={{ background: 'var(--color-background-tertiary)', color: 'var(--color-text-secondary)' }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderTop: '1px solid var(--color-border-primary)' }}
        >
          <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Requires{' '}
            <strong style={{ textTransform: 'uppercase' }}>{skill.pricing_tier_min}</strong> tier · you're on{' '}
            <strong style={{ textTransform: 'uppercase' }}>{userTier}</strong>
          </div>
          {isInstalled ? (
            <button
              type="button"
              onClick={onUninstall}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium"
              style={{
                border: '1px solid var(--color-border-secondary)',
                background: 'var(--color-background-primary)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <Trash2 className="h-3 w-3" />
              Uninstall
            </button>
          ) : isLocked ? (
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium opacity-60"
              style={{ background: 'var(--color-background-tertiary)', color: 'var(--color-text-tertiary)' }}
            >
              <Lock className="h-3 w-3" />
              Upgrade to install
            </button>
          ) : (
            <button
              type="button"
              onClick={onInstall}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium"
              style={{
                background: 'linear-gradient(135deg, var(--atlas-brand-cobalt-deep), var(--atlas-brand-cobalt))',
                color: 'var(--atlas-brand-cream)',
                boxShadow: '0 4px 12px -4px rgba(15, 23, 41, 0.25)',
              }}
            >
              <CheckCircle2 className="h-3 w-3" />
              Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
