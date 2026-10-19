export const PEBBLE_SHAPES = ["square", "triangle", "circle", "oval", "pentagon"] as const;
export type PebbleShape = typeof PEBBLE_SHAPES[number];

const characters = new Intl.Segmenter("zh", { granularity: "grapheme" });

export function pebbleLayout(text: string, slot: number, assignedShape?: PebbleShape) {
  const count = Math.max(1, [...characters.segment(text.trim())].length);
  const root = Math.sqrt(count);
  const tail = Math.max(0, count - 12);
  const shape = assignedShape ?? PEBBLE_SHAPES[((Math.trunc(slot) % PEBBLE_SHAPES.length) + PEBBLE_SHAPES.length) % PEBBLE_SHAPES.length];
  // Short thoughts get a genuinely narrower copy box, so the whole pebble can
  // stay small. The box widens with the text, and the shapes below add just
  // enough material around that box to remain readable.
  const copyWidth = shape === "oval"
    ? 43 + (count - 1) * 3.1
    : shape === "pentagon"
      ? Math.max(30 + 86 * (1 - Math.exp(-(count - 1) / 10)), count >= 18 ? 106 : 0)
      : 26 + 64 * (1 - Math.exp(-(count - 1) / 6.5));
  const columns = Math.max(1, Math.floor(copyWidth / (13 * 1.018)));
  const blockHeight = Math.ceil(count / columns) * 13 * 1.45 + 12.5;
  let width: number, height: number, copyOffset = 0;
  switch (shape) {
    case "square":
      width = height = Math.max(44 + root * 13, copyWidth + 16, blockHeight * 1.12 + 16) + count * 0.25;
      break;
    case "triangle":
      width = Math.max(72, copyWidth * 1.55 + 14, blockHeight * 1.7 + 16, 50 + root * 23) + count * 0.4;
      height = width * 0.9;
      copyOffset = height * 0.2;
      break;
    case "circle":
      width = height = Math.max(52 + root * 16, copyWidth * 1.3 + 10, blockHeight * 1.3 + 14) + count * 0.3;
      break;
    case "pentagon":
      width = Math.max(72, copyWidth * 1.45 + 8, blockHeight * 1.98 + 16, 47 + root * 21.5 + tail * 0.8) + count * 0.05;
      height = width * 0.9;
      break;
    default:
      width = Math.max(58, copyWidth * 1.35, copyWidth + blockHeight * 0.65, 44 + root * 14) + count * 0.4;
      height = Math.max(44, blockHeight * 1.22 + 8, 38 + root * 5) + count * 0.2;
  }
  return { shape, count, width, height, copyWidth, copyOffset };
}
