/**
 * Atlas illustrated empty-states. Inline SVG, brand cobalt + amber.
 *
 * Each variant is a small (240×160) self-contained scene. No external
 * assets, no asset pipeline — every illustration is composed of basic
 * shapes + the celestial-globe motif from AtlasMark.
 */

import type { CSSProperties } from 'react';

export type EmptyVariant =
  | 'sessions'        // empty session-history list
  | 'usage'           // no activity in usage window
  | 'audit'           // no audit events
  | 'people'          // no users yet
  | 'catalogue'       // empty model catalogue
  | 'skills'          // no skills installed (future)
  | 'generic';        // fallback

interface EmptyIllustrationProps {
  variant: EmptyVariant;
  width?: number;
  className?: string;
  style?: CSSProperties;
}

const COBALT = '#1e2a55';
const COBALT_2 = '#3b4d8f';
const AMBER = '#d4a44a';
const PAPER = '#fafaf7';
const INK = '#0f1729';

export function EmptyIllustration({
  variant,
  width = 240,
  className,
  style,
}: EmptyIllustrationProps) {
  const height = (width * 2) / 3;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 240 160"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <defs>
        <linearGradient id={`atlas-empty-grad-${variant}`} x1="0" y1="0" x2="240" y2="160">
          <stop offset="0%" stopColor={COBALT} stopOpacity="0.9" />
          <stop offset="60%" stopColor={COBALT_2} stopOpacity="0.55" />
          <stop offset="100%" stopColor={AMBER} stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id="atlas-paper-grad" x1="0" y1="0" x2="0" y2="160">
          <stop offset="0%" stopColor={PAPER} stopOpacity="0" />
          <stop offset="100%" stopColor={PAPER} stopOpacity="0.45" />
        </linearGradient>
      </defs>

      {/* Soft stage */}
      <rect x="0" y="0" width="240" height="160" rx="14" fill="rgba(30,42,85,0.04)" />
      <rect x="0" y="0" width="240" height="160" rx="14" fill="url(#atlas-paper-grad)" />

      {/* Variant-specific scene */}
      {variant === 'sessions' && <ScenesSessions />}
      {variant === 'usage' && <ScenesUsage />}
      {variant === 'audit' && <ScenesAudit />}
      {variant === 'people' && <ScenesPeople />}
      {variant === 'catalogue' && <ScenesCatalogue />}
      {variant === 'skills' && <ScenesSkills />}
      {variant === 'generic' && <ScenesGeneric />}

      {/* Star particles — same as HeroBackground but fewer */}
      {[[40, 30, 0.6], [200, 18, 0.5], [220, 105, 0.4], [25, 130, 0.5]].map(([x, y, o], i) => (
        <circle key={i} cx={x as number} cy={y as number} r="0.8" fill={AMBER} fillOpacity={o as number} />
      ))}
    </svg>
  );
}

// --- variant scenes -----------------------------------------------------

function ScenesSessions() {
  // Stack of "cards" tilted slightly, suggesting conversations.
  return (
    <g>
      <rect x="65" y="42" width="110" height="58" rx="10" fill="url(#atlas-empty-grad-sessions)" opacity="0.25" transform="rotate(-6 120 71)" />
      <rect x="70" y="48" width="110" height="58" rx="10" fill="url(#atlas-empty-grad-sessions)" opacity="0.55" />
      <rect x="76" y="56" width="98" height="44" rx="8" fill={PAPER} />
      <rect x="86" y="68" width="60" height="3" rx="1.5" fill={COBALT} opacity="0.35" />
      <rect x="86" y="76" width="78" height="3" rx="1.5" fill={COBALT} opacity="0.18" />
      <rect x="86" y="84" width="38" height="3" rx="1.5" fill={COBALT} opacity="0.18" />
      {/* Plus mark — start a new chat */}
      <circle cx="186" cy="50" r="11" fill={AMBER} />
      <path d="M186 45 L186 55 M181 50 L191 50" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

function ScenesUsage() {
  // Sparkline-ish bars beneath the celestial globe.
  return (
    <g>
      {/* Globe */}
      <circle cx="80" cy="58" r="20" fill="url(#atlas-empty-grad-usage)" />
      <ellipse cx="80" cy="58" rx="20" ry="8" stroke="rgba(255,255,255,0.4)" strokeWidth="1" fill="none" />
      <ellipse cx="80" cy="58" rx="8" ry="20" stroke="rgba(255,255,255,0.35)" strokeWidth="1" fill="none" />
      <path d="M95 41 L97 47 L103 49 L97 51 L95 57 L93 51 L87 49 L93 47 Z" fill={AMBER} />
      {/* Bars */}
      <g transform="translate(120, 80)">
        {[
          [0, 18, 0.4],
          [10, 28, 0.55],
          [20, 14, 0.45],
          [30, 36, 0.7],
          [40, 22, 0.55],
          [50, 44, 0.85],
          [60, 30, 0.6],
        ].map(([x, h, o], i) => (
          <rect key={i} x={x as number} y={50 - (h as number)} width="6" height={h} rx="1" fill={COBALT} opacity={o as number} />
        ))}
      </g>
    </g>
  );
}

function ScenesAudit() {
  // Timeline with three event ticks.
  return (
    <g>
      <line x1="30" y1="80" x2="210" y2="80" stroke={COBALT} strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="3 3" />
      {[60, 110, 160].map((cx, i) => (
        <g key={cx}>
          <circle cx={cx} cy="80" r="6" fill={PAPER} stroke={COBALT} strokeWidth="1.5" />
          {i === 1 && <circle cx={cx} cy="80" r="3" fill={AMBER} />}
          <rect x={cx - 16} y="92" width="32" height="3" rx="1.5" fill={COBALT} opacity="0.3" />
          <rect x={cx - 12} y="100" width="24" height="3" rx="1.5" fill={COBALT} opacity="0.18" />
        </g>
      ))}
    </g>
  );
}

function ScenesPeople() {
  // Three avatars in a row, middle elevated.
  return (
    <g>
      {[[80, 84], [120, 70], [160, 84]].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="18" fill="url(#atlas-empty-grad-people)" opacity={i === 1 ? 1 : 0.5} />
          <circle cx={cx} cy={(cy as number) - 4} r="6" fill={PAPER} opacity="0.85" />
          <path d={`M${(cx as number) - 9} ${(cy as number) + 10} Q${cx} ${(cy as number) + 16} ${(cx as number) + 9} ${(cy as number) + 10}`} fill={PAPER} opacity="0.85" />
        </g>
      ))}
    </g>
  );
}

function ScenesCatalogue() {
  // Stack of tagged price chips
  return (
    <g>
      {[0, 14, 28].map((dy, i) => (
        <g key={dy} transform={`translate(60, ${42 + dy})`}>
          <rect width="120" height="22" rx="11" fill="url(#atlas-empty-grad-catalogue)" opacity={0.85 - i * 0.25} />
          <circle cx="11" cy="11" r="4" fill={AMBER} opacity={1 - i * 0.2} />
          <rect x="22" y="9" width="50" height="4" rx="2" fill={PAPER} opacity={0.8 - i * 0.15} />
          <rect x="78" y="9" width="32" height="4" rx="2" fill={PAPER} opacity={0.55 - i * 0.1} />
        </g>
      ))}
    </g>
  );
}

function ScenesSkills() {
  // Geometric grid of skill tiles
  return (
    <g>
      {[
        [70, 50], [110, 50], [150, 50],
        [70, 90], [110, 90], [150, 90],
      ].map(([x, y], i) => (
        <rect
          key={i}
          x={x as number}
          y={y as number}
          width="32"
          height="32"
          rx="7"
          fill={i === 2 ? AMBER : COBALT}
          opacity={i === 2 ? 0.85 : 0.25 + i * 0.05}
        />
      ))}
    </g>
  );
}

function ScenesGeneric() {
  return (
    <g>
      <circle cx="120" cy="80" r="34" fill="url(#atlas-empty-grad-generic)" />
      <path d="M138 60 L140 66 L146 68 L140 70 L138 76 L136 70 L130 68 L136 66 Z" fill={AMBER} />
    </g>
  );
}
