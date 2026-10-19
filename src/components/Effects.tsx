import { motion } from "motion/react";

export type EffectKind = "arrival" | "release" | "dissolve" | "burst";

export type EffectSpec = {
  id: number;
  kind: EffectKind;
  x: number;
  y: number;
  tone: number;
};

const PARTICLES = [
  { x: -20, y: -24, delay: 0 },
  { x: 16, y: -31, delay: 0.04 },
  { x: -31, y: -21, delay: 0.02 },
  { x: 30, y: -19, delay: 0.07 },
  { x: 4, y: -39, delay: 0.05 },
  { x: 24, y: -33, delay: 0.1 },
];

const DUST = [
  { x: -13, y: 20, delay: 0 },
  { x: 10, y: 25, delay: 0.03 },
  { x: -4, y: 30, delay: 0.06 },
  { x: 18, y: 17, delay: 0.02 },
  { x: -21, y: 12, delay: 0.05 },
  { x: 5, y: 14, delay: 0.08 },
  { x: -8, y: 37, delay: 0.09 },
  { x: 23, y: 32, delay: 0.11 },
];

const RELEASE_SPARKS = [
  { x: -34, y: -34, size: 3.5, delay: 0.01 },
  { x: -18, y: -58, size: 2.5, delay: 0.06 },
  { x: -6, y: -40, size: 4, delay: 0.02 },
  { x: 8, y: -66, size: 2.5, delay: 0.1 },
  { x: 22, y: -38, size: 3.5, delay: 0.04 },
  { x: 36, y: -52, size: 2, delay: 0.12 },
  { x: 12, y: -24, size: 2, delay: 0.09 },
  { x: -26, y: -18, size: 2.5, delay: 0.07 },
  { x: 44, y: -22, size: 2, delay: 0.14 },
  { x: -48, y: -13, size: 1.8, delay: 0.16 },
];

const BURST_DOTS = [
  { x: -30, y: -15, size: 4, delay: 0 },
  { x: 26, y: -24, size: 3, delay: 0.03 },
  { x: 39, y: 10, size: 4.5, delay: 0.05 },
  { x: -19, y: 27, size: 3, delay: 0.02 },
  { x: 7, y: 34, size: 2.5, delay: 0.08 },
  { x: -41, y: 3, size: 2.5, delay: 0.06 },
  { x: 14, y: -39, size: 2.5, delay: 0.09 },
  { x: 34, y: 33, size: 2, delay: 0.12 },
];

function BurstEffect({ effect }: { effect: EffectSpec }) {
  const tone = effect.tone % 5;
  return (
    <div className={`fx-anchor fx-burst glow-${tone}`} style={{ left: effect.x, top: effect.y }}>
      <motion.span
        className="fx-burst-glow"
        initial={{ opacity: 0, scale: 0.18 }}
        animate={{ opacity: [0, 0.92, 0.32, 0], scale: [0.18, 0.8, 1.2, 1.55] }}
        transition={{ duration: 1.2, times: [0, 0.14, 0.58, 1], ease: ["easeOut", "easeOut", "easeIn"] }}
      />
      <motion.span
        className="fx-burst-ring"
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: [0, 0.82, 0.28, 0], scale: [0.2, 0.72, 1.05, 1.4] }}
        transition={{ duration: 1.25, times: [0, 0.16, 0.62, 1], ease: ["easeOut", "easeOut", "easeIn"] }}
      />
      <motion.span
        className="fx-burst-star"
        initial={{ opacity: 0, scale: 0.2, rotate: -18 }}
        animate={{
          opacity: [0, 1, 0.94, 0],
          scale: [0.2, 0.88, 1.05, 1.55],
          rotate: [-18, -5, 3, 11],
        }}
        transition={{ duration: 1.18, times: [0, 0.17, 0.58, 1], ease: ["easeOut", "easeOut", "easeIn"] }}
      />
      {BURST_DOTS.map((dot, index) => (
        <motion.i
          key={index}
          className="fx-burst-dot"
          style={{ width: dot.size, height: dot.size }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.6 }}
          animate={{
            x: dot.x * 1.25,
            y: dot.y * 1.25,
            opacity: [0, 1, 0],
            scale: [0.5, 1, 0.25],
          }}
          transition={{
            duration: 1 + (index % 3) * 0.12,
            delay: dot.delay,
            times: [0, 0.2, 1],
            ease: [0.14, 0.8, 0.3, 1],
          }}
        />
      ))}
    </div>
  );
}

function ArrivalEffect({ effect }: { effect: EffectSpec }) {
  const tone = effect.tone % 5;

  return (
    <div className={`fx-anchor fx-arrival glow-${tone}`} style={{ left: effect.x, top: effect.y }}>
      <motion.span
        className="fx-bloom"
        initial={{ opacity: 0.72, scale: 0.1 }}
        animate={{ opacity: 0, scale: 1.9 }}
        transition={{ duration: 1.05, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.span
        className="fx-flash-core"
        initial={{ opacity: 0.6, scale: 0.2 }}
        animate={{ opacity: 0, scale: 1.5 }}
        transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.span
        className="fx-ripple"
        initial={{ opacity: 0.64, scaleX: 0.18, scaleY: 0.4 }}
        animate={{ opacity: 0, scaleX: 2.45, scaleY: 1.5 }}
        transition={{ duration: 1.18, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.span
        className="fx-ripple fx-ripple-late"
        initial={{ opacity: 0.35, scaleX: 0.1, scaleY: 0.25 }}
        animate={{ opacity: 0, scaleX: 1.7, scaleY: 1 }}
        transition={{ duration: 1.08, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
      />
      {PARTICLES.map((particle, index) => (
        <motion.i
          key={index}
          className="fx-bead"
          initial={{ x: 0, y: 0, opacity: 0.8, scale: 0.5 }}
          animate={{
            x: particle.x,
            y: particle.y,
            opacity: 0,
            scale: 1.15,
          }}
          transition={{
            duration: 0.82 + (index % 3) * 0.14,
            delay: particle.delay,
            ease: [0.16, 1, 0.3, 1],
          }}
        />
      ))}
    </div>
  );
}

function ReleaseEffect({ effect }: { effect: EffectSpec }) {
  const tone = effect.tone % 5;

  return (
    <div className={`fx-anchor fx-release glow-${tone}`} style={{ left: effect.x, top: effect.y }}>
      <motion.span
        className="fx-release-flash"
        initial={{ opacity: 0.82, scaleX: 0.2, scaleY: 0.35 }}
        animate={{ opacity: 0, scaleX: 2.1, scaleY: 1.7 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.span
        className="fx-surface-ring"
        initial={{ opacity: 0.86, scaleX: 0.18, scaleY: 0.5 }}
        animate={{ opacity: 0, scaleX: 2.75, scaleY: 2 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.span
        className="fx-surface-ring fx-surface-ring-late"
        initial={{ opacity: 0.46, scaleX: 0.05, scaleY: 0.35 }}
        animate={{ opacity: 0, scaleX: 1.85, scaleY: 1.2 }}
        transition={{ duration: 1.1, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.span
        className="fx-light-column"
        initial={{ opacity: 0, scaleY: 0.1 }}
        animate={{ opacity: [0, 0.56, 0], scaleY: [0.1, 1.25, 1.75] }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
      <motion.span
        className="fx-comet"
        initial={{ x: 0, y: 0, opacity: 0, scaleY: 0.3 }}
        animate={{ x: 14, y: -198, opacity: [0, 1, 0.7, 0], scaleY: [0.3, 1, 1.35, 0.4] }}
        transition={{ duration: 1.02, times: [0, 0.14, 0.65, 1], ease: [0.18, 0.65, 0.26, 1] }}
      />
      <motion.span
        className="fx-escape"
        initial={{ x: 0, y: 0, opacity: 0.95, scale: 0.9 }}
        animate={{ x: 14, y: -196, opacity: 0, scale: 0.25 }}
        transition={{ duration: 0.95, ease: [0.18, 0.65, 0.26, 1] }}
      />
      {RELEASE_SPARKS.map((spark, index) => (
        <motion.i
          key={index}
          className="fx-spark"
          style={{ width: spark.size, height: spark.size }}
          initial={{ x: 0, y: 0, opacity: 0.9, scale: 0.45 }}
          animate={{
            x: spark.x,
            y: spark.y * 2,
            opacity: 0,
            scale: 0.85,
          }}
          transition={{
            duration: 0.78 + (index % 3) * 0.16,
            delay: spark.delay,
            ease: [0.14, 0.8, 0.3, 1],
          }}
        />
      ))}
    </div>
  );
}

function DissolveEffect({ effect }: { effect: EffectSpec }) {
  const tone = effect.tone % 5;

  return (
    <div className={`fx-anchor fx-dissolve glow-${tone}`} style={{ left: effect.x, top: effect.y }}>
      <motion.span
        className="fx-dissolve-flash"
        initial={{ opacity: 0.4, scale: 0.5 }}
        animate={{ opacity: 0, scale: 1.4 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      />
      <motion.span
        className="fx-dissolve-ring"
        initial={{ opacity: 0.32, scale: 0.4 }}
        animate={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.8, ease: [0.3, 0, 0.6, 1] }}
      />
      {DUST.map((dust, index) => (
        <motion.i
          key={index}
          className="fx-dust"
          initial={{ x: 0, y: 0, opacity: 0.75, scale: 0.8 }}
          animate={{
            x: dust.x,
            y: dust.y,
            opacity: 0,
            scale: 0.25,
          }}
          transition={{
            duration: 0.9 + (index % 3) * 0.12,
            delay: dust.delay,
            ease: [0.3, 0, 0.6, 1],
          }}
        />
      ))}
    </div>
  );
}

export function Effects({ effects }: { effects: EffectSpec[] }) {
  return (
    <div className="fx-layer" aria-hidden="true">
      {effects.map((effect) => {
        if (effect.kind === "arrival") return <ArrivalEffect key={effect.id} effect={effect} />;
        if (effect.kind === "release") return <ReleaseEffect key={effect.id} effect={effect} />;
        if (effect.kind === "burst") return <BurstEffect key={effect.id} effect={effect} />;
        return <DissolveEffect key={effect.id} effect={effect} />;
      })}
    </div>
  );
}
