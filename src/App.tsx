import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EmptySea, Motes, WaterSurface } from "./components/Ambient";
import { Composer } from "./components/Composer";
import { Effects, type EffectKind, type EffectSpec } from "./components/Effects";
import { Flight, type FlightSpec } from "./components/Flight";
import { Header } from "./components/Header";
import { IdeaBubble } from "./components/IdeaBubble";
import { Toast, type ToastSpec } from "./components/Toast";
import {
  chooseSlot,
  chooseShape,
  layoutForCount,
  makeIdea,
  readGestureSeen,
  readIdeas,
  toneForSlot,
  writeGestureSeen,
  writeIdeas,
  type Idea,
} from "./lib/ideas";
import { SeaPhysics, type SeaSpot } from "./lib/seaPhysics";
import { pebbleLayout } from "./lib/pebbleShape";
import { mountMobileViewport } from "./lib/mobileViewport";

type ExitKind = "complete" | "delete";
type LeavingMap = Record<string, ExitKind>;
type UndoSnapshot = { idea: Idea; index: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const waterRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const pendingSpawns = useRef<Map<string, SeaSpot>>(new Map());
  const reducedMotion = useReducedMotion();
  const physicsRef = useRef<SeaPhysics | null>(null);
  if (physicsRef.current === null) {
    physicsRef.current = new SeaPhysics({ motionEnabled: !reducedMotion });
  }

  const [ideas, setIdeas] = useState<Idea[]>(() => readIdeas());
  const initialIdsRef = useRef<Set<string> | null>(null);
  if (initialIdsRef.current === null) {
    initialIdsRef.current = new Set(ideas.map((idea) => idea.id));
  }

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<LeavingMap>({});
  const [crossing, setCrossing] = useState(false);
  const [flight, setFlight] = useState<FlightSpec | null>(null);
  const [effects, setEffects] = useState<EffectSpec[]>([]);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const [hintSeen, setHintSeen] = useState<boolean>(() => readGestureSeen());

  const effectSeq = useRef(0);
  const toastSeq = useRef(0);
  const flightSeq = useRef(0);
  const toastTimer = useRef<number | null>(null);
  const effectTimers = useRef<Set<number>>(new Set());
  const exitTimers = useRef<Map<string, number>>(new Map());
  const undoSnapshot = useRef<UndoSnapshot | null>(null);

  useLayoutEffect(mountMobileViewport, []);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    const physics = physicsRef.current;
    if (!field || !physics) return;
    physics.attachField(field);

    const rect = { width: field.clientWidth, height: field.clientHeight };
    const initialLayout = layoutForCount(Math.max(1, ideas.length));
    const currentIds = new Set(ideas.map((idea) => idea.id));

    ideas.forEach((idea, index) => {
      const anchor = field.querySelector<HTMLElement>(`[data-bubble-id="${idea.id}"]`);
      if (!anchor) return;

      if (!physics.has(idea.id)) {
        const pending = pendingSpawns.current.get(idea.id);
        pendingSpawns.current.delete(idea.id);
        const slot = initialLayout[index] ?? { x: 50, y: 55 };
        const spawn = pending ?? {
          x: (rect.width * slot.x) / 100,
          y: (rect.height * slot.y) / 100,
        };
        physics.addBody({ id: idea.id, el: anchor, x: spawn.x, y: spawn.y,
          shapeKind: pebbleLayout(idea.text, idea.slot, idea.shape).shape });
      }

      physics.updateBodySize(idea.id, anchor.offsetWidth, anchor.offsetHeight);
    });

    physics.removeMissing(currentIds);
  }, [ideas]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => physicsRef.current?.setMotionEnabled(!preference.matches);
    syncMotion();
    preference.addEventListener("change", syncMotion);
    return () => preference.removeEventListener("change", syncMotion);
  }, []);

  useEffect(() => {
    physicsRef.current?.setSelected(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const physics = physicsRef.current;
    return () => physics?.destroy();
  }, []);

  useEffect(() => {
    writeIdeas(ideas);
  }, [ideas]);

  useEffect(() => {
    if (selectedId && !ideas.some((idea) => idea.id === selectedId)) {
      setSelectedId(null);
    }
  }, [ideas, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("[data-bubble]")) {
        setSelectedId(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [selectedId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const effectTimerSet = effectTimers.current;
    const exitTimerMap = exitTimers.current;
    return () => {
      effectTimerSet.forEach((timer) => window.clearTimeout(timer));
      exitTimerMap.forEach((timer) => window.clearTimeout(timer));
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const dismissHint = useCallback(() => {
    setHintSeen((seen) => {
      if (seen) return seen;
      writeGestureSeen();
      return true;
    });
  }, []);

  const addEffect = useCallback((kind: EffectKind, x: number, y: number, tone: number) => {
    const id = (effectSeq.current += 1);
    setEffects((current) => [...current, { id, kind, x, y, tone }]);
    const timer = window.setTimeout(() => {
      effectTimers.current.delete(timer);
      setEffects((current) => current.filter((effect) => effect.id !== id));
    }, 1700);
    effectTimers.current.add(timer);
  }, []);

  const revealToast = useCallback((idea: Idea, index: number, kind: ExitKind) => {
    undoSnapshot.current = { idea, index };
    setToast({
      id: (toastSeq.current += 1),
      message: `「${idea.text}」${kind === "complete" ? "出海了" : "沉入海底"}`,
      detail: kind === "complete" ? "去发生吧" : "这个念头先放下",
    });
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
      undoSnapshot.current = null;
      toastTimer.current = null;
    }, 5200);
  }, []);

  const beginExit = useCallback(
    (idea: Idea, index: number, kind: ExitKind) => {
      if (leaving[idea.id]) return;
      physicsRef.current?.suspend(idea.id);
      setLeaving((current) => ({ ...current, [idea.id]: kind }));
      setSelectedId(null);
      dismissHint();
      const delay = kind === "complete" ? 500 : 340;
      const timer = window.setTimeout(() => {
        exitTimers.current.delete(idea.id);
        setIdeas((current) => current.filter((entry) => entry.id !== idea.id));
        setLeaving((current) => {
          const next = { ...current };
          delete next[idea.id];
          return next;
        });
        revealToast(idea, index, kind);
      }, delay);
      exitTimers.current.set(idea.id, timer);
    },
    [dismissHint, leaving, revealToast],
  );

  const handleComplete = useCallback(
    (id: string, center: { x: number; y: number }) => {
      const idea = ideas.find((entry) => entry.id === id);
      const stage = stageRef.current?.getBoundingClientRect();
      const water = waterRef.current?.getBoundingClientRect();
      if (!idea || !stage || !water) return;
      const index = ideas.findIndex((entry) => entry.id === id);
      addEffect(
        "release",
        clamp(center.x - stage.left, 22, stage.width - 22),
        water.top - stage.top + 4,
        idea.tone,
      );
      addEffect(
        "burst",
        clamp(center.x - stage.left, 42, stage.width - 42),
        clamp(center.y - stage.top, 46, stage.height - 46),
        idea.tone,
      );
      setCrossing(false);
      beginExit(idea, index, "complete");
    },
    [addEffect, beginExit, ideas],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const idea = ideas.find((entry) => entry.id === id);
      if (!idea) return;
      const index = ideas.findIndex((entry) => entry.id === id);
      const node = stageRef.current?.querySelector<HTMLElement>(
        `[data-bubble-id="${id}"] .sea-pebble`,
      );
      const stage = stageRef.current?.getBoundingClientRect();
      const rect = node?.getBoundingClientRect();
      if (stage && rect) {
        addEffect(
          "dissolve",
          rect.left - stage.left + rect.width / 2,
          rect.top - stage.top + rect.height / 2,
          idea.tone,
        );
      }
      beginExit(idea, index, "delete");
    },
    [addEffect, beginExit, ideas],
  );

  const handleUndo = useCallback(() => {
    const snapshot = undoSnapshot.current;
    if (!snapshot) return;
    undoSnapshot.current = null;
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
    setToast(null);
    const layout = pebbleLayout(snapshot.idea.text, snapshot.idea.slot, snapshot.idea.shape);
    const spot = physicsRef.current?.findLandingSpot(layout.width, layout.height);
    if (spot) pendingSpawns.current.set(snapshot.idea.id, spot);
    setIdeas((current) => {
      if (current.some((idea) => idea.id === snapshot.idea.id)) return current;
      let slot = snapshot.idea.slot;
      if (current.some((idea) => idea.slot === slot)) {
        slot = chooseSlot(current);
      }
      const restored = { ...snapshot.idea, slot };
      const next = [...current];
      next.splice(Math.min(snapshot.index, next.length), 0, restored);
      return next;
    });
  }, []);

  const handleThrow = useCallback(
    (text: string, origin: { x: number; y: number }) => {
      if (flight) return;
      const stageNode = stageRef.current;
      const fieldNode = fieldRef.current;
      if (!stageNode || !fieldNode) return;
      const stage = stageNode.getBoundingClientRect();
      const field = fieldNode.getBoundingClientRect();
      const slot = chooseSlot(ideas);
      const tone = toneForSlot(slot);
      const idea = makeIdea(text, slot, tone, chooseShape(ideas));
      const layout = pebbleLayout(idea.text, idea.slot, idea.shape);
      const target =
        physicsRef.current?.findLandingSpot(layout.width, layout.height) ?? {
          x: field.width * 0.64,
          y: field.height * 0.58,
        };
      pendingSpawns.current.set(idea.id, target);
      setSelectedId(null);
      setCrossing(false);
      setFlight({
        key: (flightSeq.current += 1),
        idea,
        tone,
        start: { x: origin.x - stage.left, y: origin.y - stage.top },
        end: {
          x: field.left - stage.left + target.x,
          y: field.top - stage.top + target.y,
        },
      });
    },
    [flight, ideas],
  );

  const handleArrive = useCallback(
    (arrived: FlightSpec) => {
      setFlight((current) => (current?.key === arrived.key ? null : current));
      setIdeas((current) =>
        current.some((idea) => idea.id === arrived.idea.id) ? current : [...current, arrived.idea],
      );
      addEffect("arrival", arrived.end.x, arrived.end.y, arrived.tone);
    },
    [addEffect],
  );

  const focusComposer = useCallback(() => {
    document.getElementById("idea-input")?.focus();
  }, []);

  const handleBubbleDragStart = useCallback(
    (id: string, clientX: number, clientY: number) => {
      physicsRef.current?.hold(id, clientX, clientY);
      setCrossing(false);
      dismissHint();
    },
    [dismissHint],
  );

  const handleBubbleDragMove = useCallback((id: string, clientX: number, clientY: number) => {
    physicsRef.current?.moveHeld(id, clientX, clientY);
    setSelectedId(null);
  }, []);

  const handleBubbleDragRelease = useCallback((id: string, velocityX: number, velocityY: number) => {
    physicsRef.current?.releaseHeld(id, velocityX, velocityY);
  }, []);

  const showHint = !hintSeen && ideas.length > 0;
  const initialIds = initialIdsRef.current;

  return (
    <main className="page">
      <div className="page-atmosphere" aria-hidden="true">
        <span className="page-glow page-glow-a" />
        <span className="page-glow page-glow-b" />
        <span className="page-orbit page-orbit-a" />
        <span className="page-orbit page-orbit-b" />
        <span className="page-horizon" />
      </div>

      <div className="desk-copy desk-copy-brand" aria-hidden="true">
        <span className="desk-wordmark">IDEA SEA</span>
        <span className="desk-sub">私人灵感收纳 / DEVELOPER PREVIEW</span>
      </div>
      <div className="desk-copy desk-copy-edition" aria-hidden="true">
        <span>NO. 01</span>
        <i />
        <span>私人海域</span>
      </div>
      <div className="desk-copy desk-copy-footer" aria-hidden="true">
        <span>一片只给自己看的海</span>
        <i />
        <span>拖动泡泡越过水面，让它去发生</span>
      </div>

      <motion.div
        className="device"
        initial={{ opacity: 0, y: 20, scale: 0.988 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className={`app${crossing ? " is-lifting" : ""}`} ref={stageRef}>
          <div className="sky">
            <div className="sky-aura" aria-hidden="true" />
            <Header count={ideas.length} />
          </div>

          <div className="water" ref={waterRef}>
            <div className="water-ambient" aria-hidden="true">
              <span className="water-aura water-aura-a" />
              <span className="water-aura water-aura-b" />
              <span className="water-aura water-aura-c" />
              <span className="water-aura water-aura-d" />
              <span className="light-shaft" />
              <span className="light-shaft light-shaft-b" />
              <span className="caustic caustic-a" />
              <span className="caustic caustic-b" />
              <span className="depth-ring depth-ring-a" />
              <span className="depth-ring depth-ring-b" />
              <span className="depth-ring depth-ring-c" />
            </div>
            <Motes />
            <div className="water-caustic-foreground" aria-hidden="true" />
            <WaterSurface crossing={crossing} />

            <div className={`idea-field${ideas.length >= 8 ? " is-dense" : ""}`} ref={fieldRef}>
              <AnimatePresence mode="wait">
                {ideas.length === 0 ? <EmptySea key="empty" onFocus={focusComposer} /> : null}
              </AnimatePresence>
              {ideas.map((idea, index) => {
                const isInitial = initialIds?.has(idea.id) ?? false;
                return (
                  <IdeaBubble
                    key={idea.id}
                    idea={idea}
                    index={index}
                    selected={selectedId === idea.id}
                    leaving={leaving[idea.id] ?? null}
                    entranceDelay={isInitial ? 0.3 + index * 0.065 : 0.02}
                    waterRef={waterRef}
                    onToggleSelect={(id) => {
                      dismissHint();
                      setSelectedId((current) => (current === id ? null : id));
                    }}
                    onDragStart={handleBubbleDragStart}
                    onDragMove={handleBubbleDragMove}
                    onDragRelease={handleBubbleDragRelease}
                    onCrossChange={setCrossing}
                    onComplete={handleComplete}
                    onDelete={handleDelete}
                  />
                );
              })}
            </div>

            <AnimatePresence>
              {crossing ? (
                <motion.div
                  className="release-cue"
                  initial={{ opacity: 0, y: 7, x: "-50%" }}
                  animate={{ opacity: 1, y: 0, x: "-50%" }}
                  exit={{ opacity: 0, y: -4, x: "-50%" }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className="release-cue-line" aria-hidden="true" />
                  松手，让它发生
                </motion.div>
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {showHint ? (
                <motion.div
                  className="gesture-hint"
                  initial={{ opacity: 0, y: 10, x: "-50%" }}
                  animate={{ opacity: 1, y: 0, x: "-50%" }}
                  exit={{
                    opacity: 0,
                    y: 6,
                    x: "-50%",
                    transition: { duration: 0.3, ease: [0.4, 0, 1, 1] },
                  }}
                  transition={{ duration: 0.7, delay: 0.85, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className="gesture-icon" aria-hidden="true">
                    <svg viewBox="0 0 16 16" fill="none">
                      <path
                        d="M8 13V4.4M4.5 7.7 8 4.2l3.5 3.5"
                        stroke="currentColor"
                        strokeWidth="1.1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span>拖出水面去完成</span>
                  <i aria-hidden="true" />
                  <span>轻点泡泡可删除</span>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="dock-veil" aria-hidden="true" />
            <Composer disabled={Boolean(flight)} onThrow={handleThrow} />
            <Toast toast={toast} onUndo={handleUndo} />
          </div>

          <Effects effects={effects} />
          {flight ? <Flight key={flight.key} flight={flight} onArrive={handleArrive} /> : null}

          <p id="gesture-instructions" className="sr-only">
            泡泡会在海里慢慢漂动并互相碰撞。轻点泡泡后可以删除。把泡泡向上拖过水面，就能让它出海并完成。
          </p>
        </div>
      </motion.div>
    </main>
  );
}
