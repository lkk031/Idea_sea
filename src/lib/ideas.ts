import { PEBBLE_SHAPES, type PebbleShape } from "./pebbleShape";

export type Idea = {
  id: string;
  text: string;
  createdAt: number;
  slot: number;
  tone: number;
  shape?: PebbleShape;
};

export type Slot = {
  x: number;
  y: number;
};

export const MAX_IDEA_LENGTH = 24;
export const STORAGE_KEY = "idea-sea.v1";
export const GESTURE_KEY = "idea-sea.gesture.v1";

/**
 * Hand-tuned resting places inside the little bay.
 * x / y are percentages of the field that sits under the waterline.
 * The first five are reserved for the first visit, so the sea opens composed.
 */
export const SLOTS: Slot[] = [
  { x: 30, y: 15 },
  { x: 68, y: 28 },
  { x: 39, y: 45 },
  { x: 67, y: 62 },
  { x: 31, y: 78 },
  { x: 68, y: 45 },
  { x: 67, y: 84 },
  { x: 49, y: 31 },
  { x: 31, y: 57 },
  { x: 49, y: 66 },
  { x: 66, y: 14 },
  { x: 33, y: 31 },
];

const NEW_IDEA_SLOT_ORDER = [6, 8, 5, 7, 9, 11, 10];

const HAND_LAYOUTS: Record<number, Slot[]> = {
  1: [{ x: 50, y: 46 }],
  2: [
    { x: 34, y: 33 },
    { x: 66, y: 65 },
  ],
  3: [
    { x: 30, y: 19 },
    { x: 67, y: 43 },
    { x: 38, y: 72 },
  ],
  4: [
    { x: 30, y: 17 },
    { x: 67, y: 36 },
    { x: 38, y: 56 },
    { x: 66, y: 77 },
  ],
  5: [
    { x: 30, y: 14 },
    { x: 68, y: 28 },
    { x: 39, y: 45 },
    { x: 67, y: 62 },
    { x: 31, y: 78 },
  ],
};

const X_PATTERN = [30, 67, 39, 66, 31, 68, 38, 66, 33, 67, 40, 64];

/**
 * Initial resting points for a newly opened sea. After that the water takes over:
 * the physics layer lets every idea drift and knock into its neighbours.
 */
export function layoutForCount(count: number): Slot[] {
  if (count <= 5) {
    return HAND_LAYOUTS[Math.max(1, count)] ?? HAND_LAYOUTS[1];
  }

  const top = count <= 6 ? 10 : 8;
  const bottom = count <= 7 ? 90 : 91;
  const step = (bottom - top) / (count - 1);

  return Array.from({ length: count }, (_, index) => ({
    x: X_PATTERN[index % X_PATTERN.length] + (index % 3 === 0 ? -0.5 : 0.5),
    y: top + index * step,
  }));
}

const SEED_TEXT: Array<{ text: string; tone: number }> = [
  { text: "烫一个软软的羊毛卷", tone: 0 },
  { text: "去海边等一次日出", tone: 2 },
  { text: "学做一块提拉米苏", tone: 1 },
  { text: "给房间换一盏落日灯", tone: 3 },
  { text: "坐慢车去一座小城", tone: 4 },
];

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function makeIdea(text: string, slot: number, tone?: number, shape = PEBBLE_SHAPES[slot % PEBBLE_SHAPES.length]): Idea {
  return {
    id: createId(),
    text: text.trim().slice(0, MAX_IDEA_LENGTH),
    createdAt: Date.now(),
    slot,
    tone: tone ?? Math.abs(slot + text.length) % 5,
    shape,
  };
}

export function createSeedIdeas(): Idea[] {
  const now = Date.now();
  return SEED_TEXT.map((seed, index) => ({
    id: createId(),
    text: seed.text,
    createdAt: now - (SEED_TEXT.length - index) * 1000 * 60 * 37,
    slot: index,
    tone: seed.tone,
    shape: PEBBLE_SHAPES[index % PEBBLE_SHAPES.length],
  }));
}

export function readIdeas(): Idea[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return createSeedIdeas();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return createSeedIdeas();
    return parsed
      .filter(
        (idea): idea is Idea =>
          typeof idea === "object" &&
          idea !== null &&
          typeof (idea as Idea).id === "string" &&
          typeof (idea as Idea).text === "string" &&
          (idea as Idea).text.trim().length > 0 &&
          typeof (idea as Idea).slot === "number" &&
          typeof (idea as Idea).tone === "number",
      )
      .map((idea, index) => ({
        ...idea,
        text: idea.text.slice(0, MAX_IDEA_LENGTH),
        slot: Math.max(0, Math.min(SLOTS.length - 1, idea.slot)),
        shape: PEBBLE_SHAPES.includes(idea.shape as PebbleShape)
          ? idea.shape : PEBBLE_SHAPES[index % PEBBLE_SHAPES.length],
      }));
  } catch {
    return createSeedIdeas();
  }
}

export function writeIdeas(ideas: Idea[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas));
  } catch {
    // The sea still works for this session when storage is unavailable.
  }
}

export function chooseSlot(ideas: Idea[]): number {
  const occupied = new Set(ideas.map((idea) => idea.slot));
  for (const slot of NEW_IDEA_SLOT_ORDER) {
    if (!occupied.has(slot)) return slot;
  }
  for (let index = 0; index < SLOTS.length; index += 1) {
    if (!occupied.has(index)) return index;
  }
  return ideas.length % SLOTS.length;
}

export function toneForSlot(slot: number): number {
  return (slot + 1) % 5;
}

export function chooseShape(ideas: Idea[]): PebbleShape {
  const counts = PEBBLE_SHAPES.map(shape => ideas.filter(idea => idea.shape === shape).length);
  return PEBBLE_SHAPES[counts.indexOf(Math.min(...counts))];
}

export function tiltFor(idea: Idea): number {
  let hash = idea.slot * 13 + idea.text.length * 7 + idea.id.charCodeAt(0);
  for (let i = 0; i < idea.text.length; i += 1) {
    hash += idea.text.charCodeAt(i);
  }
  return ((hash % 9) - 4) * 0.55;
}

export function readGestureSeen(): boolean {
  try {
    return window.localStorage.getItem(GESTURE_KEY) === "seen";
  } catch {
    return false;
  }
}

export function writeGestureSeen(): void {
  try {
    window.localStorage.setItem(GESTURE_KEY, "seen");
  } catch {
    // Non-essential nicety.
  }
}
