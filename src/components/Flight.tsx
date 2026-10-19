import { useRef } from "react";
import { motion } from "motion/react";
import type { Idea } from "../lib/ideas";

const TONE_NAMES = ["seafoam", "bone", "rose", "mist", "iris"] as const;

export type FlightSpec = {
  key: number;
  idea: Idea;
  start: { x: number; y: number };
  end: { x: number; y: number };
  tone: number;
};

type FlightProps = {
  flight: FlightSpec;
  onArrive: (flight: FlightSpec) => void;
};

export function Flight({ flight, onArrive }: FlightProps) {
  const arrived = useRef(false);
  const dx = flight.end.x - flight.start.x;
  const apexY = Math.max(78, Math.min(flight.start.y, flight.end.y) - 190);
  const bendX = flight.start.x + dx * 0.45;
  const toneIndex = flight.tone % 5;
  const tone = TONE_NAMES[toneIndex];

  const path = {
    x: [flight.start.x, flight.start.x - 28, bendX, flight.end.x, flight.end.x],
    y: [flight.start.y, flight.start.y - 26, apexY, flight.end.y - 26, flight.end.y],
  };

  return (
    <div className="flight-layer" aria-hidden="true">
      <motion.span
        className="flight-launch"
        style={{ left: flight.start.x - 30, top: flight.start.y - 10 }}
        initial={{ opacity: 0.55, scaleX: 0.3, scaleY: 0.6 }}
        animate={{ opacity: 0, scaleX: 1.7, scaleY: 1.4 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      />

      {[
        { delay: 0.05, size: 24, opacity: 0.58, blur: 6 },
        { delay: 0.1, size: 15, opacity: 0.42, blur: 5 },
        { delay: 0.16, size: 9, opacity: 0.3, blur: 3 },
      ].map((trail, index) => (
        <motion.span
          key={index}
          className={`flight-ghost glow-${toneIndex}`}
          style={{
            width: trail.size,
            height: trail.size,
            filter: `blur(${trail.blur}px)`,
          }}
          initial={{ x: flight.start.x, y: flight.start.y, opacity: 0, scale: 0.25 }}
          animate={{
            ...path,
            opacity: [0, trail.opacity, trail.opacity * 0.6, 0.08, 0],
            scale: [0.25, 0.95, 0.55, 0.2, 0.1],
          }}
          transition={{
            duration: 1.04,
            delay: trail.delay,
            times: [0, 0.12, 0.52, 0.88, 1],
            ease: ["easeOut", "easeInOut", "easeInOut", "easeIn"],
          }}
        />
      ))}

      <motion.div
        className={`flight-capsule tone-${tone}`}
        initial={{ x: flight.start.x, y: flight.start.y, opacity: 0, scale: 0.55 }}
        animate={{
          ...path,
          opacity: [0, 1, 1, 0.94, 0],
          scale: [0.55, 0.86, 0.82, 0.46, 0.2],
          rotate: [-7, 1, 7, 13, 18],
        }}
        transition={{
          duration: 1.06,
          times: [0, 0.12, 0.52, 0.88, 1],
          ease: ["easeOut", "easeInOut", "easeInOut", "easeIn"],
        }}
        onAnimationComplete={() => {
          if (arrived.current) return;
          arrived.current = true;
          onArrive(flight);
        }}
      >
        <span className="flight-capsule-inner">
          <i className="flight-spark" aria-hidden="true" />
          <span className="flight-text">{flight.idea.text}</span>
        </span>
      </motion.div>
    </div>
  );
}
