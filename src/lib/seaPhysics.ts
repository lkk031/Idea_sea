import {
  createContourNodes,
  stepContour,
  loadContour,
  makeContour,
  contourContact,
  fitContourContent,
  type ContourNode,
  type Contour,
  type Contact,
} from "./softContour";
import type { PebbleShape } from "./pebbleShape";

type ShapeGeometry = Contour & { sx: number; sy: number; hw: number; hh: number };

export type SeaSpot = { x: number; y: number };

export type AddSeaBody = {
  id: string;
  el: HTMLElement;
  x: number;
  y: number;
  shapeKind?: PebbleShape;
};

type Body = {
  id: string;
  el: HTMLElement;
  bubbleEl: HTMLElement;
  skinEl: SVGSVGElement | null;
  skinPaths: SVGPathElement[];
  copyEl: HTMLElement | null;
  nodes: ContourNode[];
  shape: ShapeGeometry | null;
  shapeKind: PebbleShape;
  previous: { x: number; y: number; strain: number; offsets: number[] };
  copyMetrics: { width: number; height: number; x: number; y: number };
  renderedPath: string;
  renderedCopy: string;
  renderedViewBox: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  halfW: number;
  halfH: number;
  phase: number;
  cruise: number;
  suspended: boolean;
  strain: number;
  strainVelocity: number;
  pressure: number;
  pressureTime: number;
  pressureTarget: number;
  pressureMin: number;
  pressureMax: number;
  hasPressure: boolean;
  dragTargetX: number;
  dragTargetY: number;
};

const EDGE_SIDE = 8;
const EDGE_TOP = 6;
const EDGE_BOTTOM = 8;
const COLLISION_PAD_X = 2;
const COLLISION_PAD_Y = 2;
const MIN_SPEED = 13;
const MAX_SPEED = 62;
const RESTITUTION = 0.22;
// Logarithmic strain preserves area: squeeze one axis, bulge along the other.
const SHAPE_STIFFNESS = 180;
const SHAPE_DAMPING = 27;
const STRAIN_LIMIT = Math.log(1.1);
const CONTACT_LOAD_LIMIT = 0.4;
const FIXED_STEP = 1 / 120;
const CONTACT_GAP = 2;
const SOLVER_PASSES = 64;
// Bound work when the shapes cannot all fit. More bodies must not multiply
// the same unresolved contacts by 64 on every fixed simulation step.
const SOLVER_PAIR_BUDGET = 512;
const MAX_CATCHUP_STEPS = 4;

export class SeaPhysics {
  private field: HTMLElement | null = null;
  private fieldObserver: ResizeObserver | null = null;
  private bodyObserver: ResizeObserver | null = null;
  private bodies = new Map<string, Body>();
  private bounds = { width: 0, height: 0 };
  private raf = 0;
  private lastTime = 0;
  private accumulator = 0;
  private motionEnabled: boolean;
  private selectedId: string | null = null;
  private heldId: string | null = null;
  private grab = { x: 0, y: 0 };

  constructor(options: { motionEnabled?: boolean } = {}) {
    this.motionEnabled = options.motionEnabled ?? true;
  }

  attachField(field: HTMLElement): void {
    const changed = this.field !== field;
    this.field = field;
    this.measureBounds();
    if (changed) {
      this.fieldObserver?.disconnect();
      if (typeof ResizeObserver !== "undefined") {
        this.fieldObserver = new ResizeObserver(() => {
          this.measureBounds();
          this.remeasureAll();
          this.containAll();
          this.snapshotAll();
          this.applyAll();
        });
        this.fieldObserver.observe(field);
      }
    }
    this.ensureRunning();
  }

  setMotionEnabled(enabled: boolean): void {
    this.motionEnabled = enabled;
    if (enabled) {
      this.ensureRunning();
    } else {
      this.stopLoop();
      for (const body of this.bodies.values()) {
        body.strain = body.strainVelocity = body.pressure = body.pressureTime = 0;
        body.pressureTarget = body.pressureMin = body.pressureMax = 0;
        body.hasPressure = false;
        body.nodes = createContourNodes();
        body.shape = null;
      }
      this.containAll();
      this.resolveCollisions();
      this.snapshotAll();
      this.applyAll();
    }
  }

  has(id: string): boolean {
    return this.bodies.has(id);
  }

  addBody({ id, el, x, y, shapeKind = "oval" }: AddSeaBody): void {
    if (this.bodies.has(id)) return;
    const bubbleEl = el.querySelector<HTMLElement>(".sea-pebble") ?? el;
    const seed = hash(id);
    const phase = (seed % 6283) / 1000;
    const cruise = 23 + ((seed >>> 9) % 15);
    const angle = ((seed >>> 5) % 6283) / 1000;

    const body: Body = {
      id,
      el,
      bubbleEl,
      skinEl: el.querySelector<SVGSVGElement>(".pebble-skin"),
      skinPaths: Array.from(el.querySelectorAll?.<SVGPathElement>(".pebble-skin path") ?? []),
      copyEl: el.querySelector<HTMLElement>(".pebble-copy"),
      nodes: createContourNodes(),
      shape: null,
      shapeKind,
      previous: { x, y, strain: 0, offsets: createContourNodes().map(() => 0) },
      copyMetrics: { width: 106, height: 34, x: 0, y: -1 },
      renderedPath: "",
      renderedCopy: "",
      renderedViewBox: "",
      x,
      y,
      vx: Math.cos(angle) * cruise * 0.72 + (seed % 2 === 0 ? 9 : -9),
      vy: Math.sin(angle) * cruise * 0.42,
      halfW: 70,
      halfH: 30,
      phase,
      cruise,
      suspended: false,
      strain: 0,
      strainVelocity: 0,
      pressure: 0,
      pressureTime: 0,
      pressureTarget: 0,
      pressureMin: 0,
      pressureMax: 0,
      hasPressure: false,
      dragTargetX: 0,
      dragTargetY: 0,
    };

    this.measureBody(body);
    this.normalizeSpeed(body, cruise);
    this.bodies.set(id, body);
    this.placeInside(body, true);
    this.snapshot(body);
    this.apply(body);
    if (typeof ResizeObserver !== "undefined") {
      this.bodyObserver ??= new ResizeObserver((entries) => {
        const resized = new Set(entries.map(entry => entry.target));
        // Read all layout metrics before any DOM writes, including font/wrap changes.
        const changed = [...this.bodies.values()].filter(item => resized.has(item.el));
        for (const item of changed) this.measureBody(item);
        for (const item of changed) {
          this.placeInside(item, false);
          this.snapshot(item);
          this.apply(item);
        }
      });
      this.bodyObserver.observe(el);
    }
    this.ensureRunning();
  }

  updateBodySize(id: string, width: number, height: number): void {
    const body = this.bodies.get(id);
    if (!body) return;
    body.shape = null;
    body.halfW = Math.max(width, 10) / 2 + COLLISION_PAD_X;
    body.halfH = Math.max(height, 10) / 2 + COLLISION_PAD_Y;
    this.measureCopy(body);
    this.placeInside(body, false);
    this.snapshot(body);
    this.apply(body);
  }

  remove(id: string): void {
    const body = this.bodies.get(id);
    if (body) this.bodyObserver?.unobserve(body.el);
    this.bodies.delete(id);
    if (this.heldId === id) this.heldId = null;
    if (this.selectedId === id) this.selectedId = null;
    if (this.bodies.size === 0) this.stopLoop();
  }

  removeMissing(ids: Set<string>): void {
    for (const id of [...this.bodies.keys()]) {
      if (!ids.has(id)) this.remove(id);
    }
  }

  setSelected(id: string | null): void {
    if (this.selectedId === id) return;
    const previous = this.selectedId ? this.bodies.get(this.selectedId) : undefined;
    if (previous && !previous.suspended) {
      previous.vx = 0;
      previous.vy = 0;
      this.normalizeSpeed(previous, previous.cruise * 0.55);
    }
    if (previous) previous.shape = null;
    this.selectedId = id;
    const body = id ? this.bodies.get(id) : null;
    if (body) {
      body.shape = null;
      body.vx = 0;
      body.vy = 0;
    }
  }

  suspend(id: string): void {
    const body = this.bodies.get(id);
    if (!body) return;
    body.suspended = true;
    body.vx = 0;
    body.vy = 0;
    body.dragTargetX = body.x;
    body.dragTargetY = body.y;
    if (this.heldId === id) this.heldId = null;
  }

  hold(id: string, clientX: number, clientY: number): void {
    const body = this.bodies.get(id);
    const field = this.field;
    if (!body || !field) return;
    const rect = field.getBoundingClientRect();
    this.heldId = id;
    this.grab.x = clientX - rect.left - body.x;
    this.grab.y = clientY - rect.top - body.y;
    body.vx = 0;
    body.vy = 0;
    body.dragTargetX = body.x;
    body.dragTargetY = body.y;
  }

  moveHeld(id: string, clientX: number, clientY: number): void {
    if (this.heldId !== id) return;
    const body = this.bodies.get(id);
    const field = this.field;
    if (!body || !field) return;
    const rect = field.getBoundingClientRect();
    const nextX = clientX - rect.left - this.grab.x;
    const nextY = clientY - rect.top - this.grab.y;
    body.dragTargetX = nextX;
    body.dragTargetY = nextY;
    // Reduced motion still needs swept collision handling while dragging.
    if (!this.motionEnabled) {
      const distance = Math.hypot(nextX - body.x, nextY - body.y);
      const steps = Math.max(1, Math.ceil(distance / 8));
      const startX = body.x;
      const startY = body.y;
      for (let i = 1; i <= steps; i += 1) {
        body.x = startX + (nextX - startX) * i / steps;
        body.y = startY + (nextY - startY) * i / steps;
        this.containHeld(body);
        this.resolveCollisions();
      }
      this.applyAll();
      this.snapshotAll();
    }
  }

  releaseHeld(id: string, velocityX: number, velocityY: number): void {
    const body = this.bodies.get(id);
    if (!body) return;
    if (this.heldId === id) this.heldId = null;
    body.vx = clamp(velocityX * 0.25, -240, 240);
    body.vy = clamp(velocityY * 0.25, -240, 240);
    if (Math.hypot(body.vx, body.vy) < 7) {
      const angle = body.phase + (hash(id) % 100) / 100;
      body.vx = Math.cos(angle) * body.cruise * 0.62;
      body.vy = Math.sin(angle) * body.cruise * 0.38;
    }
    if (this.selectedId === id) body.vx = body.vy = 0;
    this.placeInside(body, true);
    this.snapshot(body);
    this.apply(body);
    this.ensureRunning();
  }

  findLandingSpot(estimatedWidth = 176, estimatedHeight = 66): SeaSpot | null {
    if (!this.field || this.bounds.width < 1 || this.bounds.height < 1) return null;
    const hw = Math.min(estimatedWidth / 2 + COLLISION_PAD_X, this.bounds.width / 2 - 12);
    const hh = Math.min(estimatedHeight / 2 + COLLISION_PAD_Y, this.bounds.height / 2 - 12);
    const bodies = [...this.bodies.values()].filter((body) => !body.suspended);
    const xFractions = [0.28, 0.44, 0.6, 0.76];
    const yFractions = [0.16, 0.31, 0.46, 0.61, 0.76, 0.88];

    let best: SeaSpot | null = null;
    let bestScore = -Infinity;

    for (const fy of yFractions) {
      for (const fx of xFractions) {
        const x = clamp(this.bounds.width * fx, hw + EDGE_SIDE + 2, this.bounds.width - hw - EDGE_SIDE - 2);
        const y = clamp(this.bounds.height * fy, hh + EDGE_TOP + 2, this.bounds.height - hh - EDGE_BOTTOM - 2);
        let nearest = Number.POSITIVE_INFINITY;
        for (const body of bodies) {
          const gap = Math.hypot(
            (x - body.x) / (hw + body.halfW),
            (y - body.y) / (hh + body.halfH),
          );
          nearest = Math.min(nearest, gap);
        }
        const edge = Math.min(
          x - hw - EDGE_SIDE,
          y - hh - EDGE_TOP,
          this.bounds.width - x - hw - EDGE_SIDE,
          this.bounds.height - y - hh - EDGE_BOTTOM,
        );
        const score = (Number.isFinite(nearest) ? nearest * 4.2 : 4) + edge / 38 + fy * 0.2;
        if (score > bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    }

    if (best) {
      best.x += (hash(`spot-${bodies.length}`) % 17) - 8;
      best.y += (hash(`wave-${bodies.length}`) % 13) - 6;
      best.x = clamp(best.x, hw + 12, this.bounds.width - hw - 12);
      best.y = clamp(best.y, hh + 12, this.bounds.height - hh - 12);
    }
    return best;
  }

  destroy(): void {
    this.stopLoop();
    this.fieldObserver?.disconnect();
    this.fieldObserver = null;
    this.bodyObserver?.disconnect();
    this.bodyObserver = null;
    this.bodies.clear();
    this.field = null;
  }

  private measureBounds(): void {
    if (!this.field) return;
    const rect = this.field.getBoundingClientRect();
    // Opening transforms affect the screen rectangle, not the collision world.
    this.bounds.width = this.field.clientWidth ?? rect.width;
    this.bounds.height = this.field.clientHeight ?? rect.height;
  }

  private measureBody(body: Body): void {
    body.shape = null;
    const width = body.el.offsetWidth || 156;
    const height = body.el.offsetHeight || 58;
    body.halfW = width / 2 + COLLISION_PAD_X;
    body.halfH = height / 2 + COLLISION_PAD_Y;
    this.measureCopy(body);
  }

  private measureCopy(body: Body): void {
    body.renderedPath = "";
    const copy = body.copyEl;
    const measuredWidth = copy?.offsetWidth ?? 0;
    const measuredHeight = copy?.offsetHeight ?? 0;
    const width = measuredWidth || (body.halfW - COLLISION_PAD_X) * 2 - 34;
    const height = measuredHeight || (body.halfH - COLLISION_PAD_Y) * 2 - 26;
    body.copyMetrics = {
      width, height,
      x: measuredWidth ? copy!.offsetLeft + width / 2 - body.halfW + COLLISION_PAD_X : 0,
      y: measuredHeight ? copy!.offsetTop + height / 2 - body.halfH + COLLISION_PAD_Y : -1,
    };
  }

  private remeasureAll(): void {
    for (const body of this.bodies.values()) this.measureBody(body);
  }

  private placeInside(body: Body, zeroVelocityAtEdge: boolean): void {
    const limits = this.limitsFor(body);
    const x = clamp(body.x, limits.minX, limits.maxX);
    const y = clamp(body.y, limits.minY, limits.maxY);
    if (zeroVelocityAtEdge) {
      if (x !== body.x) body.vx = 0;
      if (y !== body.y) body.vy = 0;
    }
    body.x = x;
    body.y = y;
  }

  private containAll(): void {
    for (const body of this.bodies.values()) {
      this.placeInside(body, false);
    }
  }

  private limitsFor(body: Body): { minX: number; maxX: number; minY: number; maxY: number } {
    const shape = this.geometry(body);
    const minX = -shape.left + EDGE_SIDE;
    const maxX = Math.max(minX, this.bounds.width - shape.right - EDGE_SIDE);
    const minY = -shape.top + EDGE_TOP;
    const maxY = Math.max(minY, this.bounds.height - shape.bottom - EDGE_BOTTOM);
    return { minX, maxX, minY, maxY };
  }

  private normalizeSpeed(body: Body, target: number): void {
    if (target === 0) {
      body.vx = body.vy = 0;
      return;
    }
    const speed = Math.hypot(body.vx, body.vy);
    if (speed < 0.001) {
      const angle = body.phase;
      body.vx = Math.cos(angle) * MIN_SPEED;
      body.vy = Math.sin(angle) * MIN_SPEED * 0.55;
      return;
    }
    const max = Math.max(target * 1.35, MIN_SPEED);
    const desired = target === 0 ? 0 : Math.min(max, Math.max(MIN_SPEED, speed));
    const scale = desired / speed;
    body.vx *= scale;
    body.vy *= scale;
  }

  private ensureRunning(): void {
    if (!this.motionEnabled || this.bodies.size === 0 || this.raf !== 0) return;
    this.lastTime = 0;
    this.accumulator = 0;
    this.raf = window.requestAnimationFrame(this.tick);
  }

  private stopLoop(): void {
    if (this.raf !== 0) {
      window.cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.lastTime = 0;
    this.accumulator = 0;
  }

  private tick = (time: number): void => {
    this.raf = 0;
    if (!this.motionEnabled || this.bodies.size === 0) return;
    if (this.lastTime === 0) {
      this.lastTime = time;
      this.raf = window.requestAnimationFrame(this.tick);
      return;
    }
    const dt = Math.min(FIXED_STEP * MAX_CATCHUP_STEPS, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    this.accumulator += dt;
    while (this.accumulator >= FIXED_STEP) {
      this.step(FIXED_STEP, time / 1000 - this.accumulator + FIXED_STEP);
      this.accumulator -= FIXED_STEP;
    }
    this.applyAll(this.accumulator / FIXED_STEP);
    this.raf = window.requestAnimationFrame(this.tick);
  };

  private step(dt: number, time: number): void {
    this.snapshotAll();
    this.updateShape(dt);
    for (const body of this.bodies.values()) {
      if (body.suspended) continue;
      if (body.id === this.heldId) {
        const oldX = body.x;
        const oldY = body.y;
        // Follow the hand through small physics steps, never teleport through neighbours.
        const dx = body.dragTargetX - body.x;
        const dy = body.dragTargetY - body.y;
        const distance = Math.hypot(dx, dy);
        const follow = Math.min(1 - Math.exp(-38 * dt), 1400 * dt / Math.max(distance, 1));
        body.x += dx * follow;
        body.y += dy * follow;
        this.containHeld(body);
        body.vx = (body.x - oldX) / dt;
        body.vy = (body.y - oldY) / dt;
        // A small directional stretch while travelling; contact pressure takes precedence.
        if (Math.abs(body.pressure) < 0.04) {
          body.pressureTarget = clamp((Math.abs(body.vx) - Math.abs(body.vy)) / 9000, -0.025, 0.025);
        }
        continue;
      }
      if (body.id === this.selectedId) continue;
      body.vx += (Math.sin(time * 0.55 + body.phase) * 2.6 +
        Math.cos(time * 0.19 + body.phase * 1.8) * 1.35) * dt;
      body.vy += Math.cos(time * 0.43 + body.phase * 1.25) * 1.75 * dt;
      // Fast throws and collision impulses decay naturally instead of being clipped next frame.
      const speed = Math.hypot(body.vx, body.vy);
      const max = Math.min(MAX_SPEED, body.cruise * 1.6);
      if (speed > max) {
        const decay = Math.exp(-2.8 * dt);
        body.vx *= decay;
        body.vy *= decay;
      } else if (speed < body.cruise * 0.55 && speed > 0.001) {
        const lift = 1 + dt * 0.65;
        body.vx *= lift;
        body.vy *= lift;
      }
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      this.bounceBounds(body);
    }
    this.resolveCollisions();
  }

  private updateShape(dt: number): void {
    for (const body of this.bodies.values()) {
      if (body.suspended) continue;
      stepContour(body.nodes, dt, body.phase);
      body.shape = null;
      if (body.hasPressure) {
        body.pressureTarget = body.pressureMin + body.pressureMax;
        body.pressureTime = 0.045;
      } else {
        body.pressureTime = Math.max(0, body.pressureTime - dt);
        if (body.pressureTime === 0) body.pressureTarget *= Math.exp(-10 * dt);
      }
      body.pressure += (body.pressureTarget - body.pressure) * (1 - Math.exp(-22 * dt));
      body.pressureMin = body.pressureMax = 0;
      body.hasPressure = false;
      const acceleration = (body.pressure - body.strain) * SHAPE_STIFFNESS -
        body.strainVelocity * SHAPE_DAMPING;
      body.strainVelocity += acceleration * dt;
      body.strain += body.strainVelocity * dt;
      const limited = clamp(body.strain, -STRAIN_LIMIT, STRAIN_LIMIT);
      if (limited !== body.strain) body.strainVelocity = 0;
      body.strain = limited;
      if (Math.abs(body.strain) < 0.0002 && Math.abs(body.strainVelocity) < 0.002 &&
          Math.abs(body.pressure) < 0.0002 && Math.abs(body.pressureTarget) < 0.0002) {
        body.strain = body.strainVelocity = body.pressure = body.pressureTarget = 0;
      }
    }
  }

  private press(body: Body, nx: number, ny: number, speed: number, heldContact = false,
    point?: { x: number; y: number }, depth = 0): void {
    if (body.suspended || !this.motionEnabled) return;
    // A rounded corner distributes pressure continuously, avoiding x/y axis flips.
    const direction = ny * ny - nx * nx;
    // Light bumps only soften the contact patch. Stronger, sustained pushing
    // adds load gradually; even a fast throw cannot turn the whole body into a lobe.
    const impact = 1 - Math.exp(-Math.max(0, speed) / 160);
    const push = heldContact ? 0.07 + 0.08 * (1 - Math.exp(-depth / 5)) : 0;
    const amount = Math.min(CONTACT_LOAD_LIMIT, 0.08 + 0.24 * impact + push);
    const target = direction * amount * 0.35;
    const angle = point
      ? Math.atan2((point.y - body.y) / body.halfH, (point.x - body.x) / body.halfW)
      : Math.atan2(ny, nx);
    loadContour(body.nodes, angle, amount, body.phase);
    body.pressureMin = Math.min(body.pressureMin, target);
    body.pressureMax = Math.max(body.pressureMax, target);
    body.hasPressure = true;
  }

  private geometry(body: Body, alpha = 1): ShapeGeometry {
    if (alpha === 1 && body.shape) return body.shape;
    const baseW = body.halfW - COLLISION_PAD_X;
    const baseH = body.halfH - COLLISION_PAD_Y;
    const pinned = body.id === this.selectedId && body.id !== this.heldId;
    const availableW = pinned
      ? 2 * Math.min(body.x - EDGE_SIDE, this.bounds.width - EDGE_SIDE - body.x)
      : this.bounds.width - EDGE_SIDE * 2;
    const availableH = pinned
      ? 2 * Math.min(body.y - EDGE_TOP, this.bounds.height - EDGE_BOTTOM - body.y)
      : this.bounds.height - EDGE_TOP - EDGE_BOTTOM;
    const minStrain = Math.max(-STRAIN_LIMIT,
      -Math.log(Math.max(1, availableH / (baseH * 2))));
    const maxStrain = Math.min(STRAIN_LIMIT,
      Math.log(Math.max(1, availableW / (baseW * 2))));
    const strain = clamp((body.previous.strain + (body.strain - body.previous.strain) * alpha) * 0.55, minStrain, maxStrain);
    const sx = Math.exp(strain);
    const sy = Math.exp(-strain);
    const nodes = alpha === 1 ? body.nodes : body.nodes.map((node, i) => ({
      offset: body.previous.offsets[i] + (node.offset - body.previous.offsets[i]) * alpha,
    }));
    const contour = makeContour(baseW, baseH, sx, sy, nodes, body.phase,
      Math.max(baseW * 2, availableW), Math.max(baseH * 2, availableH), body.shapeKind);
    const shape = { ...contour, sx, sy, hw: Math.max(-contour.left, contour.right),
      hh: Math.max(-contour.top, contour.bottom) };
    if (alpha === 1) body.shape = shape;
    return shape;
  }

  private containHeld(body: Body): void {
    const limits = this.limitsFor(body);
    const overX = Math.max(limits.minX - body.x, body.x - limits.maxX, 0);
    const overY = Math.max(body.y - limits.maxY, 0);
    if (overX > 0.1) this.press(body, body.x < limits.minX ? -1 : 1, 0, overX * 16, true, undefined, overX);
    if (overY > 0.1) this.press(body, 0, 1, overY * 16, true, undefined, overY);
    body.x = clamp(body.x, limits.minX, limits.maxX);
    // The upper edge stays open while held, preserving the drag-to-complete gesture.
    body.y = Math.min(body.y, limits.maxY);
  }

  private bounceBounds(body: Body): void {
    if (body.suspended || body.id === this.selectedId || body.id === this.heldId) return;
    const limits = this.limitsFor(body);
    if (body.x < limits.minX || body.x > limits.maxX) {
      const side = body.x < limits.minX ? 1 : -1;
      if (body.vx * side < 0) {
        if (Math.abs(body.vx) > 5) this.press(body, -side, 0, Math.abs(body.vx));
        body.vx = Math.abs(body.vx) * side * RESTITUTION;
      }
      body.x = clamp(body.x, limits.minX, limits.maxX);
    }
    if (body.y < limits.minY || body.y > limits.maxY) {
      const side = body.y < limits.minY ? 1 : -1;
      if (body.vy * side < 0) {
        if (Math.abs(body.vy) > 5) this.press(body, 0, -side, Math.abs(body.vy));
        body.vy = Math.abs(body.vy) * side * RESTITUTION;
      }
      body.y = clamp(body.y, limits.minY, limits.maxY);
    }
  }

  private contact(a: Body, b: Body): Contact | null {
    return contourContact(this.geometry(a), a.x, a.y, this.geometry(b), b.x, b.y, CONTACT_GAP);
  }

  private inverseMass(body: Body): number {
    // Let a grabbed ball yield slightly when pushed against a pinned neighbour or wall.
    if (body.id === this.heldId) return 0.08;
    if (body.id === this.selectedId) return 0;
    return 1 / Math.max(0.7, (body.halfW * body.halfH) / 3600);
  }

  private contactWithRoom(a: Body, b: Body): Contact | null {
    const contact = this.contact(a, b);
    if (!contact) return null;
    const la = this.limitsFor(a), lb = this.limitsFor(b);
    const invA = this.inverseMass(a), invB = this.inverseMass(b);
    const { nx, ny, depth } = contact;
    const roomX = (invA ? nx >= 0 ? a.x - la.minX : la.maxX - a.x : 0) +
      (invB ? nx >= 0 ? lb.maxX - b.x : b.x - lb.minX : 0);
    const roomY = (invA ? ny >= 0 ? a.y - la.minY : la.maxY - a.y : 0) +
      (invB ? ny >= 0 ? lb.maxY - b.y : b.y - lb.minY : 0);
    const ga = this.geometry(a), gb = this.geometry(b);
    if (Math.abs(nx) > 0.7 && roomX < depth * Math.abs(nx) + 0.1) {
      const sign = b.y >= a.y ? 1 : -1;
      return { ...contact, nx: 0, ny: sign,
        depth: Math.max(0, (sign > 0 ? ga.bottom - gb.top : gb.bottom - ga.top) + CONTACT_GAP - Math.abs(b.y - a.y)) };
    }
    if (Math.abs(ny) > 0.7 && roomY < depth * Math.abs(ny) + 0.1) {
      const sign = b.x >= a.x ? 1 : -1;
      return { ...contact, nx: sign, ny: 0,
        depth: Math.max(0, (sign > 0 ? ga.right - gb.left : gb.right - ga.left) + CONTACT_GAP - Math.abs(b.x - a.x)) };
    }
    return contact;
  }

  private resolveCollisions(): void {
    const list = [...this.bodies.values()].filter((body) => !body.suspended);
    const pairs = list.length * (list.length - 1) / 2;
    const passes = Math.min(SOLVER_PASSES, Math.max(1, Math.floor(SOLVER_PAIR_BUDGET / Math.max(1, pairs))));
    let bestDepth = Infinity;
    let stalled = 0;
    for (let pass = 0; pass < passes; pass += 1) {
      let maxDepth = 0;
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const a = list[i];
          const b = list[j];
          const contact = this.contactWithRoom(a, b);
          if (!contact) continue;
          const { nx, ny, depth } = contact;
          maxDepth = Math.max(maxDepth, depth);
          const invA = this.inverseMass(a);
          const invB = this.inverseMass(b);
          const total = invA + invB;
          if (!total) continue;
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (pass === 0) {
            const heldContact = a.id === this.heldId || b.id === this.heldId;
            if (rel < -3 || heldContact) {
              this.press(a, nx, ny, Math.max(0, -rel), heldContact, { x: contact.px, y: contact.py }, depth);
              this.press(b, -nx, -ny, Math.max(0, -rel), heldContact, { x: contact.px, y: contact.py }, depth);
            }
            if (rel < 0) {
              const impulse = -(1 + (heldContact ? 0.06 : RESTITUTION)) * rel / total;
              a.vx -= impulse * invA * nx;
              a.vy -= impulse * invA * ny;
              b.vx += impulse * invB * nx;
              b.vy += impulse * invB * ny;
            }
          }
          a.x -= nx * depth * invA / total;
          a.y -= ny * depth * invA / total;
          b.x += nx * depth * invB / total;
          b.y += ny * depth * invB / total;
          // Transfer any separation blocked by a wall back to the other ball.
          const ax = a.x, ay = a.y, bx = b.x, by = b.y;
          if (a.id === this.heldId) this.containHeld(a);
          else if (invA) this.placeInside(a, false);
          if (b.id === this.heldId) this.containHeld(b);
          else if (invB) this.placeInside(b, false);
          const correctionAX = a.x - ax, correctionAY = a.y - ay;
          const correctionBX = b.x - bx, correctionBY = b.y - by;
          if (invB) { b.x += correctionAX; b.y += correctionAY; }
          if (invA) { a.x += correctionBX; a.y += correctionBY; }
        }
      }
      for (const body of list) {
        if (body.id === this.heldId) this.containHeld(body);
        else this.bounceBounds(body);
      }
      if (maxDepth < 0.05) break;
      if (maxDepth < bestDepth - 0.05) { bestDepth = maxDepth; stalled = 0; }
      else stalled += 1;
      // Another physics step lets the contours relax; repeating an unchanged
      // packing conflict in this step only consumes the next rendered frame.
      if (pass >= 3 && stalled >= 3) break;
    }
  }

  private snapshot(body: Body): void {
    body.previous.x = body.x;
    body.previous.y = body.y;
    body.previous.strain = body.strain;
    body.nodes.forEach((node, i) => { body.previous.offsets[i] = node.offset; });
  }

  private snapshotAll(): void {
    for (const body of this.bodies.values()) this.snapshot(body);
  }

  private applyAll(alpha = 1): void {
    for (const body of this.bodies.values()) this.apply(body, body.suspended ? 1 : alpha);
  }

  private apply(body: Body, alpha = 1): void {
    const x = body.previous.x + (body.x - body.previous.x) * alpha;
    const y = body.previous.y + (body.y - body.previous.y) * alpha;
    body.el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    const shape = this.geometry(body, alpha);
    const { path } = shape;
    body.bubbleEl.style.transform = "none";
    const viewBox = `0 0 ${(body.halfW - COLLISION_PAD_X) * 2} ${(body.halfH - COLLISION_PAD_Y) * 2}`;
    if (viewBox !== body.renderedViewBox) {
      body.skinEl?.setAttribute?.("viewBox", viewBox);
      body.renderedViewBox = viewBox;
    }
    if (path === body.renderedPath) return;
    for (const skin of body.skinPaths) skin.setAttribute("d", path);
    body.renderedPath = path;
    // Keep the content legible while the surrounding material deforms locally.
    const { width, height, x: originalX, y: originalY } = body.copyMetrics;
    const content = fitContourContent(shape, width, height, originalY);
    const copyTransform = `translate(${(content.x - originalX).toFixed(3)}px, ${(content.y - originalY).toFixed(3)}px) scale(${content.scale.toFixed(5)})`;
    if (copyTransform !== body.renderedCopy) {
      body.bubbleEl.style.setProperty("--copy-transform", copyTransform);
      body.renderedCopy = copyTransform;
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hash(input: string): number {
  let value = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}
