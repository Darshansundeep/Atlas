/**
 * AtlasMark — Atlas in-app brand mark. Inline SVG, color-aware.
 *
 * Stylised celestial sphere (a "globe held aloft") with a single accent
 * star. NOT the macOS/Windows installer icon — those live in src/images/
 * and use the legacy silhouette for backwards compatibility (will be
 * replaced when a real brand logo is commissioned).
 */

import type { CSSProperties } from 'react';

interface AtlasMarkProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** When true, draws the wordmark "Atlas" to the right of the glyph. */
  withWordmark?: boolean;
  /** Override the glyph's primary fill (defaults to brand cobalt). */
  glyphColor?: string;
  /** Override the accent star fill (defaults to brand amber). */
  accentColor?: string;
  /** Override the wordmark color (defaults to current text color). */
  wordmarkColor?: string;
}

export function AtlasMark({
  size = 32,
  className,
  style,
  withWordmark = false,
  glyphColor,
  accentColor,
  wordmarkColor,
}: AtlasMarkProps) {
  const glyph = glyphColor ?? 'var(--atlas-brand-cobalt)';
  const accent = accentColor ?? 'var(--atlas-brand-amber)';
  const word = wordmarkColor ?? 'currentColor';

  const glyphSvg = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="img"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="atlas-glyph-grad" x1="4" y1="4" x2="28" y2="28">
          <stop offset="0%" stopColor={glyph} stopOpacity="1" />
          <stop offset="100%" stopColor={glyph} stopOpacity="0.78" />
        </linearGradient>
      </defs>
      {/* Globe — circle with longitude/latitude arcs evoking a celestial atlas */}
      <circle cx="16" cy="17" r="11" fill="url(#atlas-glyph-grad)" />
      <ellipse
        cx="16"
        cy="17"
        rx="11"
        ry="5"
        stroke="rgba(255,255,255,0.32)"
        strokeWidth="1"
        fill="none"
      />
      <ellipse
        cx="16"
        cy="17"
        rx="5"
        ry="11"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="1"
        fill="none"
      />
      {/* Accent star — top-right */}
      <path
        d="M24 6.5 L25 9 L27.5 10 L25 11 L24 13.5 L23 11 L20.5 10 L23 9 Z"
        fill={accent}
      />
    </svg>
  );

  if (!withWordmark) {
    return (
      <span className={className} style={style}>
        {glyphSvg}
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.max(6, Math.round(size * 0.25)),
        ...style,
      }}
    >
      {glyphSvg}
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
          fontSize: Math.round(size * 0.65),
          letterSpacing: '-0.01em',
          color: word,
          lineHeight: 1,
        }}
      >
        Atlas
      </span>
    </span>
  );
}
