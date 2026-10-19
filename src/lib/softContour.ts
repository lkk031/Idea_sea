import type { PebbleShape } from "./pebbleShape";

export type Point = { x: number; y: number };
export type ContourNode = {
  offset: number;
  velocity: number;
  load: number;
  hold: number;
  target: number;
  compression: number;
  expansion: number;
  loaded: boolean;
};
export type Contour = {
  points: Point[];
  path: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
};
export type Contact = { nx: number; ny: number; depth: number; px: number; py: number };

export const CONTOUR_NODES = 24;
const TAU = Math.PI * 2;

export function createContourNodes(): ContourNode[] {
  return Array.from({ length: CONTOUR_NODES }, () => ({
    offset: 0, velocity: 0, load: 0, hold: 0, target: 0,
    compression: 0, expansion: 0, loaded: false,
  }));
}

export function stepContour(nodes: ContourNode[], dt: number, phase: number): void {
  for (const node of nodes) {
    // Rebuild the load from this step's contacts, including unloaded sections.
    // A moving contact can then release its old dent instead of leaving peak loads behind.
    if (node.loaded) {
      node.target = node.compression + node.expansion;
      node.hold = 0.045;
    } else {
      node.hold = Math.max(0, node.hold - dt);
      if (node.hold === 0) node.target *= Math.exp(-10 * dt);
    }
    node.load += (node.target - node.load) * (1 - Math.exp(-22 * dt));
    node.compression = node.expansion = 0;
    node.loaded = false;
  }
  const acceleration = nodes.map((node, i) => {
    const material = 1 + Math.sin(i * 1.7 + phase) * 0.08;
    const neighbours = nodes[(i + nodes.length - 1) % nodes.length].offset +
      nodes[(i + 1) % nodes.length].offset - 2 * node.offset;
    return (node.load - node.offset) * 170 * material + neighbours * 72 -
      node.velocity * (25.5 + Math.cos(i * 0.9 + phase) * 0.6);
  });
  nodes.forEach((node, i) => {
    node.velocity += acceleration[i] * dt;
    node.offset += node.velocity * dt;
    const limited = Math.max(-0.18, Math.min(0.07, node.offset));
    if (limited !== node.offset) node.velocity = 0;
    node.offset = limited;
    if (Math.abs(node.offset) < 0.0001 && Math.abs(node.velocity) < 0.001 &&
        Math.abs(node.load) < 0.0001 && Math.abs(node.target) < 0.0001) {
      node.offset = node.velocity = node.load = node.target = 0;
    }
  });
}

export function loadContour(nodes: ContourNode[], angle: number, amount: number, phase: number): void {
  // Spread a shallow dent over a broad patch, with small, rounded shoulders.
  // Periodic around the rim, so crossing atan2's -π/π seam cannot flip the shoulders.
  const bias = Math.sin(phase * 2.3 + Math.sin(angle) * 1.6 + Math.cos(angle) * 0.4) * 0.3;
  nodes.forEach((node, i) => {
    const delta = Math.atan2(Math.sin(i / nodes.length * TAU - angle), Math.cos(i / nodes.length * TAU - angle));
    const dent = -0.6 * Math.exp(-Math.pow(delta / 0.58, 2));
    const shoulderA = (0.12 + bias * 0.06) * Math.exp(-Math.pow((delta - 1.15) / 0.72, 2));
    const shoulderB = (0.1 - bias * 0.06) * Math.exp(-Math.pow((delta + 1.25) / 0.78, 2));
    const farLobe = 0.025 * Math.exp(-Math.pow((Math.abs(delta) - 2.25) / 0.8, 2));
    const load = (dent + shoulderA + shoulderB + farLobe) * amount;
    // Merge simultaneous contacts without depending on pair/solver order.
    node.compression = Math.min(node.compression, load);
    node.expansion = Math.max(node.expansion, load);
    node.loaded = true;
  });
}

function area(points: Point[]): number {
  return Math.abs(points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0)) / 2;
}

// A real rounded triangle: straight sides joined by three circular corner
// arcs. The three corners share one radius, so making them softer does not
// inflate the flat sides into a circular blob.
const TRIANGLE_CORNER_RADIUS = 0.28;
const triangleGeometry = (() => {
  const vertices: Point[] = [
    { x: 0, y: -1 },
    { x: 0.96, y: 0.94 },
    { x: -0.96, y: 0.94 },
  ];
  const normalized = (p: Point): Point => {
    const length = Math.hypot(p.x, p.y) || 1;
    return { x: p.x / length, y: p.y / length };
  };
  const corners = vertices.map((vertex, i) => {
    const next = vertices[(i + 1) % 3], previous = vertices[(i + 2) % 3];
    const toNext = normalized({ x: next.x - vertex.x, y: next.y - vertex.y });
    const toPrevious = normalized({ x: previous.x - vertex.x, y: previous.y - vertex.y });
    const interior = Math.acos(Math.max(-1, Math.min(1, toNext.x * toPrevious.x + toNext.y * toPrevious.y)));
    const half = interior / 2;
    const tangent = TRIANGLE_CORNER_RADIUS / Math.tan(half);
    const bisector = normalized({ x: toNext.x + toPrevious.x, y: toNext.y + toPrevious.y });
    const center = {
      x: vertex.x + bisector.x * TRIANGLE_CORNER_RADIUS / Math.sin(half),
      y: vertex.y + bisector.y * TRIANGLE_CORNER_RADIUS / Math.sin(half),
    };
    const first = { x: vertex.x + toNext.x * tangent, y: vertex.y + toNext.y * tangent };
    const second = { x: vertex.x + toPrevious.x * tangent, y: vertex.y + toPrevious.y * tangent };
    const startAngle = Math.atan2(first.y - center.y, first.x - center.x);
    const rawSpan = Math.atan2(second.y - center.y, second.x - center.x) - startAngle;
    const span = Math.atan2(Math.sin(rawSpan), Math.cos(rawSpan));
    return { center, radius: TRIANGLE_CORNER_RADIUS, startAngle, span, tangent };
  });
  const sides = vertices.map((vertex, i) => {
    const next = vertices[(i + 1) % 3];
    const length = Math.hypot(next.x - vertex.x, next.y - vertex.y);
    return {
      a: vertex,
      b: next,
      start: corners[i].tangent / length,
      end: 1 - corners[(i + 1) % 3].tangent / length,
    };
  });
  return { corners, sides };
})();

function roundedTrianglePoint(c: number, s: number): Point {
  const ray = { x: c, y: s };
  let nearest = Infinity;
  // Straight sections between corner tangent points.
  for (const side of triangleGeometry.sides) {
    const ex = side.b.x - side.a.x, ey = side.b.y - side.a.y;
    const denominator = ray.x * ey - ray.y * ex;
    if (Math.abs(denominator) < 1e-9) continue;
    const t = (side.a.x * ey - side.a.y * ex) / denominator;
    if (t <= 1e-6) continue;
    const along = Math.abs(ex) > Math.abs(ey)
      ? (ray.x * t - side.a.x) / ex
      : (ray.y * t - side.a.y) / ey;
    if (along >= side.start - 1e-6 && along <= side.end + 1e-6) nearest = Math.min(nearest, t);
  }
  // Circular arcs at the three vertices.
  for (const corner of triangleGeometry.corners) {
    const projection = ray.x * corner.center.x + ray.y * corner.center.y;
    const offset = corner.center.x ** 2 + corner.center.y ** 2 - corner.radius ** 2;
    const discriminant = projection ** 2 - offset;
    if (discriminant < 0) continue;
    const root = Math.sqrt(discriminant);
    for (const t of [projection - root, projection + root]) {
      if (t <= 1e-6) continue;
      const angle = Math.atan2(ray.y * t - corner.center.y, ray.x * t - corner.center.x);
      const rawDelta = angle - corner.startAngle;
      const delta = Math.atan2(Math.sin(rawDelta), Math.cos(rawDelta));
      if (delta * corner.span < -1e-6 || Math.abs(delta) > Math.abs(corner.span) + 1e-6) continue;
      nearest = Math.min(nearest, t);
    }
  }
  if (Number.isFinite(nearest)) return { x: ray.x * nearest, y: ray.y * nearest };
  const sharp = 0.86 / Math.max(s, 2 * c - s, -2 * c - s) + 0.14;
  return { x: c * sharp, y: s * sharp };
}

export function makeContour(hw: number, hh: number, sx: number, sy: number,
  nodes: ReadonlyArray<{ offset: number }>, phase: number, availableW: number, availableH: number,
  kind: PebbleShape = "oval"): Contour {
  let rest = nodes.map((_, i) => {
    const angle = i / nodes.length * TAU;
    const c = Math.cos(angle), s = Math.sin(angle);
    if (kind === "triangle") return roundedTrianglePoint(c, s);
    if (kind !== "oval") {
      let radius = 1;
      if (kind === "square") {
        radius = 1 / Math.pow(Math.abs(c) ** 5 + Math.abs(s) ** 5, 1 / 5);
      } else if (kind === "pentagon") {
        const sector = TAU / 5;
        const normalAngle = -Math.PI / 2 + sector / 2;
        // Use edge normals of an upright regular pentagon.
        const edgeDelta = Math.atan2(Math.sin(angle - normalAngle), Math.cos(angle - normalAngle));
        const local = edgeDelta - Math.round(edgeDelta / sector) * sector;
        radius = Math.cos(Math.PI / 5) / Math.cos(local);
      }
      return { x: c * radius * hw, y: s * radius * hh };
    }
    // Slight, stable material variation at rest; no frame-by-frame random noise.
    const irregularity = 1 + 0.028 * Math.sin(angle * 3 + phase) * Math.sin(angle * 2);
    return { x: Math.sign(c) * Math.pow(Math.abs(c), 0.66) * hw * irregularity,
      y: Math.sign(s) * Math.pow(Math.abs(s), 0.82) * hh * irregularity };
  });
  if (kind === "triangle") {
    // Corner rounding trims the sharp tips; recenter and fill the same box so
    // the pebble does not shrink just because its corners became softer.
    const minX = Math.min(...rest.map(p => p.x)), maxX = Math.max(...rest.map(p => p.x));
    const minY = Math.min(...rest.map(p => p.y)), maxY = Math.max(...rest.map(p => p.y));
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    const scaleX = 2 * hw / Math.max(maxX - minX, 1e-6);
    const scaleY = 2 * hh / Math.max(maxY - minY, 1e-6);
    rest = rest.map(p => ({ x: (p.x - centerX) * scaleX, y: (p.y - centerY) * scaleY }));
  }
  const deformed = rest.map((p, i) => ({ x: p.x * (1 + nodes[i].offset), y: p.y * (1 + nodes[i].offset) }));
  const preserveArea = Math.sqrt(area(rest) / Math.max(1, area(deformed)));
  const controls = deformed.map(p => ({ x: p.x * sx * preserveArea, y: p.y * sy * preserveArea }));
  const width = Math.max(...controls.map(p => Math.abs(p.x))) * 2;
  const height = Math.max(...controls.map(p => Math.abs(p.y))) * 2;
  const fitX = Math.min(1, availableW / width);
  const fitY = Math.min(1, availableH / height);
  controls.forEach(p => { p.x *= fitX; p.y *= fitY; });
  const midpoint = (p: Point, q: Point): Point => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  let start = midpoint(controls[controls.length - 1], controls[0]);
  const format = (p: Point) => `${(p.x + hw).toFixed(2)},${(p.y + hh).toFixed(2)}`;
  let path = `M${format(start)}`;
  const points: Point[] = [];
  const extrema: Point[] = [];
  controls.forEach((control, i) => {
    const end = midpoint(control, controls[(i + 1) % controls.length]);
    const at = (t: number): Point => ({ x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * control.x + t * t * end.x,
      y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * control.y + t * t * end.y });
    path += `Q${format(control)} ${format(end)}`;
    // The contact polygon samples the same smooth quadratic curves as the SVG.
    points.push(at(0.5), end);
    extrema.push(end);
    for (const axis of ["x", "y"] as const) {
      const divisor = start[axis] - 2 * control[axis] + end[axis];
      const t = (start[axis] - control[axis]) / divisor;
      if (t > 0 && t < 1) extrema.push(at(t));
    }
    start = end;
  });
  return { points, path: `${path}Z`, left: Math.min(...extrema.map(p => p.x)),
    right: Math.max(...extrema.map(p => p.x)), top: Math.min(...extrema.map(p => p.y)),
    bottom: Math.max(...extrema.map(p => p.y)) };
}

function nearest(p: Point, points: Point[]): { distance: number; inside: boolean; point: Point; nx: number; ny: number } {
  let inside = false, best = Infinity;
  let point = points[0], nx = 1, ny = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    const ex = b.x - a.x, ey = b.y - a.y;
    const length = ex * ex + ey * ey;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / Math.max(length, 1e-10)));
    const q = { x: a.x + ex * t, y: a.y + ey * t };
    const distance = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
    if (distance < best) {
      best = distance; point = q;
      const edgeLength = Math.sqrt(length) || 1;
      nx = -ey / edgeLength; ny = ex / edgeLength;
    }
  }
  return { distance: Math.sqrt(best), inside, point, nx, ny };
}

export function contourContact(a: Contour, ax: number, ay: number,
  b: Contour, bx: number, by: number, gap: number): Contact | null {
  if (ax + a.right + gap < bx + b.left || bx + b.right + gap < ax + a.left ||
      ay + a.bottom + gap < by + b.top || by + b.bottom + gap < ay + a.top) return null;
  let contact: Contact | null = null;
  let weight = 0, pointX = 0, pointY = 0;
  const sample = (from: Contour, fx: number, fy: number, to: Contour, tx: number, ty: number, flip: number) => {
    for (const p of from.points) {
      const q = { x: p.x + fx - tx, y: p.y + fy - ty };
      if (q.x < to.left - gap || q.x > to.right + gap || q.y < to.top - gap || q.y > to.bottom + gap) continue;
      const hit = nearest(q, to.points);
      const depth = hit.inside ? hit.distance + gap : gap - hit.distance;
      if (depth <= 0) continue;
      const direction = hit.inside ? 1 : -1;
      const nx = (hit.distance > 1e-8 ? (q.x - hit.point.x) / hit.distance * direction : hit.nx) * flip;
      const ny = (hit.distance > 1e-8 ? (q.y - hit.point.y) / hit.distance * direction : hit.ny) * flip;
      // Ignore the far side of a deeply intersecting shape.
      if (nx * (bx - ax) + ny * (by - ay) < -0.01) continue;
      const px = (q.x + hit.point.x) / 2 + tx, py = (q.y + hit.point.y) / 2 + ty;
      const influence = depth * depth;
      weight += influence;
      pointX += px * influence;
      pointY += py * influence;
      if (!contact || depth > contact.depth) contact = { nx, ny, depth, px, py };
    }
  };
  sample(a, ax, ay, b, bx, by, 1);
  sample(b, bx, by, a, ax, ay, -1);
  // Keep the deepest normal for separation, but distribute deformation around
  // the contact patch rather than snapping to a different vertex each frame.
  const result = contact as Contact | null;
  if (result) {
    result.px = pointX / weight;
    result.py = pointY / weight;
  }
  return result;
}

export function fitContourContent(contour: Contour, width: number, height: number, centerY = -1): { x: number; y: number; scale: number } {
  let scale = Math.min(1, (contour.bottom - contour.top - 14) / height);
  let left = contour.left, right = contour.right;
  let y = centerY;
  for (let pass = 0; pass < 4; pass++) {
    y = Math.max(contour.top + height * scale / 2 + 5,
      Math.min(contour.bottom - height * scale / 2 - 5, centerY));
    left = contour.left; right = contour.right;
    for (let row = 0; row <= 6; row++) {
      const sampleY = y + (row / 6 - 0.5) * height * scale;
      const intersections: number[] = [];
      for (let i = 0; i < contour.points.length; i++) {
        const a = contour.points[i], b = contour.points[(i + 1) % contour.points.length];
        if ((a.y > sampleY) !== (b.y > sampleY)) intersections.push(a.x + (b.x - a.x) * (sampleY - a.y) / (b.y - a.y));
      }
      intersections.sort((a, b) => a - b);
      // The ring is star-shaped. Prefer the interior span surrounding its centre.
      for (let i = 0; i + 1 < intersections.length; i += 2) {
        if (intersections[i] <= 0 && intersections[i + 1] >= 0) {
          left = Math.max(left, intersections[i]);
          right = Math.min(right, intersections[i + 1]);
          break;
        }
      }
    }
    scale = Math.max(0.4, Math.min(scale, (right - left - 14) / width));
  }
  return { x: (left + right) / 2, y, scale };
}
