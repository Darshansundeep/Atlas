// brand-allow: header comment. Streaming indicator with Atlas mark
// (replaces upstream's 6-frame flying-bird animation; renders a rotating
// + pulsing mark so the user sees an "I'm working" cue).
//
// Component name kept as FlyingBird to minimise upstream-merge surface.
// brand-allow: legacy component identifier; visual is rebranded.
import atlasMark from '../images/icon-512.png';

interface FlyingBirdProps {
  className?: string;
  cycleInterval?: number; // retained for API compatibility; unused now
}

export default function FlyingBird({ className = '' }: FlyingBirdProps) {
  return (
    <div className={`flex-shrink-0 ${className}`}>
      <img
        src={atlasMark}
        alt="Atlas is working" // brand-allow: alt text identifies the brand
        width={16}
        height={16}
        style={{
          objectFit: 'contain',
          animation: 'atlas-orbit 2.2s linear infinite, atlas-pulse 1.4s ease-in-out infinite',
        }}
        draggable={false}
      />
      <style>{`
        @keyframes atlas-orbit {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes atlas-pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
