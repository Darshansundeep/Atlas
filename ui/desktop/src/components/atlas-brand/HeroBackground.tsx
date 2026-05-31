/**
 * HeroBackground — full-bleed gradient backdrop with subtle star particles.
 * Used by WelcomeScreen and SignInScreen for the premium-commercial feel.
 *
 * Stars are deterministic (seeded layout) so the same composition renders
 * every time — no flicker on remount.
 */

import { useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';

interface HeroBackgroundProps {
  children: ReactNode;
  /** When true, uses the deep midnight gradient (intended for full-screen). */
  intense?: boolean;
  className?: string;
  style?: CSSProperties;
}

interface Star {
  cx: number;
  cy: number;
  r: number;
  o: number;
}

function deterministicStars(count: number, seed: number): Star[] {
  // Tiny LCG so the layout is stable across renders.
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s & 0xffffffff) / 0xffffffff;
  };
  const out: Star[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      cx: rand() * 100,
      cy: rand() * 100,
      r: 0.3 + rand() * 1.1,
      o: 0.18 + rand() * 0.42,
    });
  }
  return out;
}

export function HeroBackground({
  children,
  intense = true,
  className,
  style,
}: HeroBackgroundProps) {
  const stars = useMemo(() => deterministicStars(70, 0xa71a5), []);

  const gradient = intense
    ? 'var(--atlas-gradient-hero)'
    : 'var(--atlas-gradient-soft)';

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        background: gradient,
        ...style,
      }}
    >
      {/* Star field — only visible on the intense (dark) gradient */}
      {intense && (
        <svg
          aria-hidden="true"
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            mixBlendMode: 'screen',
          }}
        >
          {stars.map((s, i) => (
            <circle
              key={i}
              cx={s.cx}
              cy={s.cy}
              r={s.r * 0.18}
              fill="white"
              fillOpacity={s.o}
            />
          ))}
        </svg>
      )}

      {/* Soft amber bloom radiating from top */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(60% 40% at 50% -10%, rgba(212, 164, 74, 0.18), transparent 70%)',
        }}
      />

      <div style={{ position: 'relative', width: '100%', height: '100%' }}>{children}</div>
    </div>
  );
}
