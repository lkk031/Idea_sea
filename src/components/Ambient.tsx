import type { CSSProperties } from "react";
import { motion } from "motion/react";

const MOTES = [
  { x: 12, y: 26, size: 2, duration: 15, delay: -2, opacity: 0.44 },
  { x: 83, y: 16, size: 1.5, duration: 19, delay: -11, opacity: 0.36 },
  { x: 32, y: 62, size: 3, duration: 17, delay: -7, opacity: 0.24 },
  { x: 71, y: 48, size: 1.5, duration: 13, delay: -4, opacity: 0.5 },
  { x: 55, y: 76, size: 2, duration: 21, delay: -16, opacity: 0.3 },
  { x: 18, y: 52, size: 1, duration: 14, delay: -8, opacity: 0.58 },
  { x: 91, y: 70, size: 2.5, duration: 23, delay: -13, opacity: 0.22 },
  { x: 43, y: 12, size: 1, duration: 18, delay: -5, opacity: 0.48 },
  { x: 63, y: 90, size: 1.5, duration: 20, delay: -9, opacity: 0.3 },
  { x: 8, y: 86, size: 2, duration: 16, delay: -3, opacity: 0.28 },
  { x: 78, y: 34, size: 1, duration: 22, delay: -18, opacity: 0.42 },
  { x: 48, y: 41, size: 1.5, duration: 18, delay: -12, opacity: 0.3 },
  { x: 5, y: 42, size: 1.5, duration: 24, delay: -14, opacity: 0.34 },
  { x: 92, y: 55, size: 1, duration: 17, delay: -6, opacity: 0.46 },
  { x: 24, y: 8, size: 1.5, duration: 21, delay: -15, opacity: 0.4 },
  { x: 74, y: 6, size: 1, duration: 19, delay: -2, opacity: 0.5 },
  { x: 36, y: 86, size: 1, duration: 23, delay: -10, opacity: 0.36 },
  { x: 57, y: 24, size: 2, duration: 25, delay: -19, opacity: 0.18 },
];

const SPECKS = [
  { x: 23, y: 52, size: 4, duration: 26, delay: -3, opacity: 0.12 },
  { x: 68, y: 34, size: 7, duration: 31, delay: -19, opacity: 0.09 },
  { x: 46, y: 62, size: 3, duration: 24, delay: -12, opacity: 0.13 },
  { x: 88, y: 22, size: 5, duration: 29, delay: -8, opacity: 0.08 },
  { x: 17, y: 28, size: 3, duration: 27, delay: -21, opacity: 0.1 },
  { x: 62, y: 8, size: 6, duration: 33, delay: -17, opacity: 0.06 },
  { x: 9, y: 70, size: 4, duration: 28, delay: -7, opacity: 0.07 },
];

type StyleWithVars = CSSProperties & Record<`--${string}`, string | number>;

export function Motes() {
  return (
    <div className="motes" aria-hidden="true">
      {MOTES.map((mote, index) => (
        <i
          key={`mote-${index}`}
          className="mote"
          style={
            {
              left: `${mote.x}%`,
              top: `${mote.y}%`,
              width: `${mote.size}px`,
              height: `${mote.size}px`,
              "--drift-duration": `${mote.duration}s`,
              "--drift-delay": `${mote.delay}s`,
              "--mote-opacity": mote.opacity,
            } as StyleWithVars
          }
        />
      ))}
      {SPECKS.map((speck, index) => (
        <i
          key={`speck-${index}`}
          className="water-speck"
          style={
            {
              left: `${speck.x}%`,
              top: `${speck.y}%`,
              width: `${speck.size}px`,
              height: `${speck.size}px`,
              "--drift-duration": `${speck.duration}s`,
              "--drift-delay": `${speck.delay}s`,
              "--speck-opacity": speck.opacity,
            } as StyleWithVars
          }
        />
      ))}
    </div>
  );
}

export function WaterSurface({ crossing }: { crossing: boolean }) {
  return (
    <div className={`water-surface${crossing ? " is-bright" : ""}`} aria-hidden="true">
      <span className="surface-haze" />
      <span className="surface-horizon" />
      <span className="surface-line" />
      <svg className="surface-sheen" viewBox="0 0 420 40" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sheen-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="rgba(255,255,255,0)" />
            <stop offset=".22" stopColor="rgba(255,255,255,.4)" />
            <stop offset=".52" stopColor="rgba(255,255,255,.96)" />
            <stop offset=".7" stopColor="rgba(229,250,255,.52)" />
            <stop offset="1" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        <path
          d="M0 20c38 0 48-7.5 87-7.5 41 0 46 12 91 12s47-13 87-13 48 10 87 10c23 0 38-3 68-7"
          fill="none"
          stroke="url(#sheen-line)"
          strokeWidth=".9"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M-40 29.5c52 0 61-6 101-6 43 0 51 9.5 96 9.5s56-7 97-7c37 0 56 4.5 89 4.5"
          fill="none"
          stroke="rgba(237,253,255,.4)"
          strokeWidth=".8"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="surface-ripple surface-ripple-a" />
      <span className="surface-ripple surface-ripple-b" />
      <span className="surface-bloom" />
    </div>
  );
}

export function EmptySea({ onFocus }: { onFocus: () => void }) {
  return (
    <motion.div
      className="empty-sea"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      onClick={onFocus}
    >
      <div className="empty-orb" aria-hidden="true">
        <span className="empty-ring" />
        <span className="empty-seed" />
      </div>
      <p className="empty-title">海面还静着</p>
      <p className="empty-body">把一个小小的想，放进来</p>
    </motion.div>
  );
}
