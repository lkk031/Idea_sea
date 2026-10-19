import {
  useRef,
  useState,
  useId,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { motion } from "motion/react";
import { type Idea } from "../lib/ideas";
import { pebbleLayout } from "../lib/pebbleShape";

type LeavingKind = "complete" | "delete" | null;

type IdeaBubbleProps = {
  idea: Idea;
  index: number;
  selected: boolean;
  leaving: LeavingKind;
  entranceDelay: number;
  waterRef: RefObject<HTMLDivElement | null>;
  onToggleSelect: (id: string) => void;
  onDragStart: (id: string, clientX: number, clientY: number) => void;
  onDragMove: (id: string, clientX: number, clientY: number) => void;
  onDragRelease: (id: string, velocityX: number, velocityY: number) => void;
  onCrossChange: (crossing: boolean) => void;
  onComplete: (id: string, center: { x: number; y: number }) => void;
  onDelete: (id: string) => void;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  rect: DOMRect;
  moved: boolean;
  lastX: number;
  lastY: number;
  lastTime: number;
  velocityX: number;
  velocityY: number;
};

const TONE_NAMES = ["seafoam", "bone", "rose", "mist", "iris"] as const;
const SKIN_COLORS = [
  ["#fcfffd", "#e4f7ee", "#b3d9c9"],
  ["#fffdf8", "#f9f1dd", "#e9d9b8"],
  ["#fffbf9", "#fcebe4", "#eccfc4"],
  ["#fbfeff", "#edf7fb", "#d2e4ec"],
  ["#fdfbff", "#f5edfa", "#e1d4ec"],
];

export function IdeaBubble({
  idea,
  index,
  selected,
  leaving,
  entranceDelay,
  waterRef,
  onToggleSelect,
  onDragStart,
  onDragMove,
  onDragRelease,
  onCrossChange,
  onComplete,
  onDelete,
}: IdeaBubbleProps) {
  const dragRef = useRef<DragState | null>(null);
  const crossingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [crossing, setCrossing] = useState(false);
  const [entered, setEntered] = useState(false);

  const tone = TONE_NAMES[idea.tone % TONE_NAMES.length];
  const skinId = useId().replace(/:/g, "");
  const skinColors = SKIN_COLORS[idea.tone % SKIN_COLORS.length];
  const layout = pebbleLayout(idea.text, idea.slot, idea.shape);

  function updateCrossing(next: boolean) {
    if (crossingRef.current === next) return;
    crossingRef.current = next;
    setCrossing(next);
    onCrossChange(next);
  }

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (leaving) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    const rect = element.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rect,
      moved: false,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: performance.now(),
      velocityX: 0,
      velocityY: 0,
    };
    setDragging(true);
    setEntered(true);
    onDragStart(idea.id, event.clientX, event.clientY);
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!drag.moved && Math.hypot(dx, dy) > 4) {
      drag.moved = true;
    }
    if (!drag.moved) return;

    onDragMove(idea.id, event.clientX, event.clientY);

    const now = performance.now();
    const elapsed = Math.max(now - drag.lastTime, 8);
    drag.velocityX = ((event.clientX - drag.lastX) / elapsed) * 1000;
    drag.velocityY = ((event.clientY - drag.lastY) / elapsed) * 1000;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastTime = now;

    const surfaceTop = waterRef.current?.getBoundingClientRect().top ?? 0;
    const centerY = drag.rect.top + drag.rect.height / 2 + dy;
    updateCrossing(centerY < surfaceTop + 2);
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);

    if (!drag.moved) {
      updateCrossing(false);
      onDragRelease(idea.id, 0, 0);
      onToggleSelect(idea.id);
      return;
    }

    if (crossingRef.current) {
      const center = {
        x: drag.rect.left + drag.rect.width / 2 + (event.clientX - drag.startX),
        y: drag.rect.top + drag.rect.height / 2 + (event.clientY - drag.startY),
      };
      updateCrossing(false);
      onComplete(idea.id, center);
      return;
    }

    updateCrossing(false);
    const paused = performance.now() - drag.lastTime > 100;
    onDragRelease(idea.id, paused ? 0 : drag.velocityX, paused ? 0 : drag.velocityY);
  }

  function cancelDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    updateCrossing(false);
    onDragRelease(idea.id, 0, 0);
  }

  function completeFromKeyboard() {
    const node = document.querySelector<HTMLElement>(`[data-bubble-id="${idea.id}"]`);
    const rect = node?.getBoundingClientRect();
    if (!rect) return;
    onComplete(idea.id, {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }

  const normalPose = {
    opacity: 1,
    scale: 1,
    y: 0,
    filter: "blur(0px)",
    rotate: 0,
  };
  const leavingPose =
    leaving === "complete"
      ? {
          opacity: [1, 1, 0],
          scale: [1, 1.08, 0.12],
          y: [0, -16, -74],
          filter: ["blur(0px)", "blur(0px)", "blur(8px)"],
          rotate: [0, 2, 11],
        }
      : leaving === "delete"
        ? {
            opacity: [1, 0.78, 0],
            scale: [1, 0.88, 0.06],
            y: [0, 9, 34],
            filter: ["blur(0px)", "blur(2px)", "blur(10px)"],
            rotate: [0, -2, -7],
          }
        : normalPose;

  return (
    <div
      className={`bubble-anchor${dragging ? " is-dragging" : ""}${crossing ? " is-crossing" : ""}${
        selected ? " is-selected" : ""
      }${leaving ? " is-leaving" : ""}`}
      style={{
        zIndex: selected || dragging || leaving ? 9 : 3,
        "--pebble-width": `${layout.width}px`,
        "--pebble-height": `${layout.height}px`,
        "--pebble-ratio": layout.width / layout.height,
        "--pebble-copy-width": `${layout.copyWidth / layout.width * 100}%`,
        "--pebble-copy-offset": `${layout.copyOffset / layout.height * 100}%`,
      } as CSSProperties}
      data-pebble-shape={layout.shape}
      data-bubble="true"
      data-bubble-id={idea.id}
    >
      <motion.div
        className="bubble-enter"
        initial={{ opacity: 0, scale: 0.52, y: 17, filter: "blur(7px)", rotate: 0 }}
        animate={leavingPose}
        transition={
          leaving === "complete"
            ? { duration: 0.46, times: [0, 0.3, 1], ease: [0.24, 0, 0.72, 1] }
            : leaving === "delete"
              ? { duration: 0.3, times: [0, 0.3, 1], ease: [0.4, 0, 1, 1] }
              : !entered
                ? {
                    type: "spring",
                    stiffness: 245,
                    damping: 22,
                    mass: 0.9,
                    delay: entranceDelay,
                  }
                : {
                    type: "spring",
                    stiffness: 310,
                    damping: 24,
                    mass: 0.75,
                  }
        }
        onAnimationComplete={() => {
          if (!entered) setEntered(true);
        }}
      >
        <div className={`bubble-bob tone-${tone}`}>
          <span className="pebble-halo" aria-hidden="true" />
          <div
            className={`sea-pebble shape-${layout.shape}`}
            role="button"
            tabIndex={leaving ? -1 : 0}
            aria-label={`${idea.text}，${selected ? "已选中" : "待发生"}`}
            aria-pressed={selected}
            aria-describedby="gesture-instructions"
            title="拖出水面完成 · 轻点后可以删除"
            data-bubble="true"
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
            onClick={(event) => {
              if (event.detail === 0) onToggleSelect(idea.id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (selected) completeFromKeyboard();
                else onToggleSelect(idea.id);
              } else if (event.key === " ") {
                event.preventDefault();
                onToggleSelect(idea.id);
              } else if (event.key === "Escape") {
                if (selected) onToggleSelect(idea.id);
              } else if ((event.key === "Delete" || event.key === "Backspace") && selected) {
                event.preventDefault();
                onDelete(idea.id);
              }
            }}
          >
            <svg className="pebble-skin" aria-hidden="true" focusable="false" preserveAspectRatio="none">
              <defs>
                <linearGradient id={`${skinId}-fill`} x1="0" y1="0" x2="0.7" y2="1">
                  <stop offset="0" stopColor={skinColors[0]} />
                  <stop offset="0.42" stopColor={skinColors[1]} />
                  <stop offset="1" stopColor={skinColors[2]} />
                </linearGradient>
                <radialGradient id={`${skinId}-sheen`} cx="0.24" cy="0.05" r="0.9">
                  <stop offset="0" stopColor="white" stopOpacity="0.75" />
                  <stop offset="0.65" stopColor="white" stopOpacity="0" />
                </radialGradient>
                <linearGradient id={`${skinId}-shade`} x1="0" y1="0" x2="0.2" y2="1">
                  <stop offset="0.52" stopColor={skinColors[2]} stopOpacity="0" />
                  <stop offset="1" stopColor="var(--tone-shade)" stopOpacity="0.55" />
                </linearGradient>
              </defs>
              <path className="pebble-skin-fill" fill={`url(#${skinId}-fill)`} />
              <path className="pebble-skin-sheen" fill={`url(#${skinId}-sheen)`} />
              <path className="pebble-skin-shade" fill={`url(#${skinId}-shade)`} />
            </svg>
            <span className="pebble-copy">
              <span className="pebble-meta">
                <i aria-hidden="true" />
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="pebble-text">{idea.text}</span>
            </span>
          </div>

          {selected && !leaving && !dragging ? (
            <motion.button
              className="bubble-delete"
              type="button"
              aria-label={`删除「${idea.text}」`}
              title="沉入海底"
              initial={{ opacity: 0, scale: 0.4, rotate: -18 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.3 }}
              transition={{ type: "spring", stiffness: 430, damping: 23 }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(idea.id);
              }}
            >
              <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="m3.7 3.7 6.6 6.6M10.3 3.7l-6.6 6.6"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </motion.button>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}
