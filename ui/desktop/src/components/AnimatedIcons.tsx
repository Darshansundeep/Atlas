// Atlas-branded thinking/waiting indicator. Replaces upstream's cycling icons
// (Cog, Fuel, Watch faces, etc.) with the Atlas mark — rotating during
// thinking, gently pulsing during waiting.
//
// Component name retained as AnimatedIcons for upstream-merge minimality.
// brand-allow: legacy component identifier; visual is rebranded.
import atlasMark from '../images/icon-512.png';

interface AnimatedIconsProps {
  className?: string;
  cycleInterval?: number; // retained for API compatibility
  variant?: 'thinking' | 'waiting';
}

export default function AnimatedIcons({
  className = '',
  variant = 'thinking',
}: AnimatedIconsProps) {
  const animation =
    variant === 'thinking'
      ? 'atlas-orbit 2.2s linear infinite, atlas-pulse 1.4s ease-in-out infinite'
      : 'atlas-pulse 1.8s ease-in-out infinite';

  return (
    <div className={`flex-shrink-0 ${className}`}>
      <img
        src={atlasMark}
        alt={variant === 'thinking' ? 'Atlas is thinking' : 'Atlas is waiting'} // brand-allow
        width={16}
        height={16}
        style={{ objectFit: 'contain', animation }}
        draggable={false}
      />
      <style>{`
        @keyframes atlas-orbit {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes atlas-pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
