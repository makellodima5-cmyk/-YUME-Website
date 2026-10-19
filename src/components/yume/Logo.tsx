type MarkProps = { className?: string; id?: string };

/**
 * YUME brand mark: luminous pink-to-lavender crescent moon with sakura
 * petals near the tip. Pure SVG vector, scales crisply. No kanji.
 */
export function MoonMark({ className, id = "moon" }: MarkProps) {
  const g = `${id}-grad`;
  const m = `${id}-mask`;
  const glow = `${id}-glow`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.82 0.16 350)" />
          <stop offset="55%" stopColor="oklch(0.7 0.2 330)" />
          <stop offset="100%" stopColor="oklch(0.68 0.18 300)" />
        </linearGradient>
        <mask id={m}>
          <rect width="64" height="64" fill="black" />
          <circle cx="30" cy="34" r="22" fill="white" />
          <circle cx="40" cy="28" r="19" fill="black" />
        </mask>
        <filter id={glow} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle cx="30" cy="34" r="22" fill={`url(#${g})`} mask={`url(#${m})`} filter={`url(#${glow})`} />
      {/* sakura petals near the crescent tip */}
      <g fill="oklch(0.85 0.12 350)">
        <ellipse cx="47" cy="13" rx="3.4" ry="2" transform="rotate(-35 47 13)" />
        <ellipse cx="54" cy="20" rx="2.6" ry="1.6" transform="rotate(-15 54 20)" />
        <ellipse cx="50" cy="26" rx="2" ry="1.2" transform="rotate(-55 50 26)" />
      </g>
    </svg>
  );
}

/**
 * Header wordmark: plain text YUME only — no moon, no kanji, no icon.
 * Non-interactive by design (not a button/link, no click handler).
 */
export function Logo() {
  return <span className="font-display text-xl font-bold tracking-widest text-foreground select-none">YUME</span>;
}