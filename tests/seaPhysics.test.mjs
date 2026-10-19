import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

// Run the actual solver with a small DOM substitute; no timers or browser required.
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 };
const contourSource = readFileSync(new URL('../src/lib/softContour.ts', import.meta.url), 'utf8');
const contourCompiled = ts.transpileModule(contourSource, { compilerOptions: options }).outputText;
const contourUrl = `data:text/javascript;base64,${Buffer.from(contourCompiled).toString('base64')}`;
const contourModule = await import(contourUrl);
const layoutSource = readFileSync(new URL('../src/lib/pebbleShape.ts', import.meta.url), 'utf8');
const layoutUrl = `data:text/javascript;base64,${Buffer.from(ts.transpileModule(layoutSource, { compilerOptions: options }).outputText).toString('base64')}`;
const { PEBBLE_SHAPES, pebbleLayout } = await import(layoutUrl);
const ideasSource = readFileSync(new URL('../src/lib/ideas.ts', import.meta.url), 'utf8').replace('"./pebbleShape"', JSON.stringify(layoutUrl));
const ideasModule = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(ideasSource, { compilerOptions: options }).outputText).toString('base64')}`);
const source = readFileSync(new URL('../src/lib/seaPhysics.ts', import.meta.url), 'utf8').replace('"./softContour"', JSON.stringify(contourUrl));
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { SeaPhysics } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
globalThis.window = { requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
function setup(width = 600, height = 500, motionEnabled = true) {
  const physics = new SeaPhysics({ motionEnabled });
  physics.attachField({ getBoundingClientRect: () => ({ left: 0, top: 0, width, height }) });
  function add(id, x, y, w = 140, h = 60, shapeKind = 'oval') {
    const style = { setProperty(name, value) { this[name] = value; } };
    const bubble = { style };
    physics.addBody({ id, x, y, shapeKind, el: { offsetWidth: w, offsetHeight: h, style: {}, querySelector: () => bubble } });
    const body = physics.bodies.get(id);
    body.vx = body.vy = 0;
    return body;
  }
  function advance(seconds, onStep) {
    for (let i = 0; i < Math.ceil(seconds * 120); i++) {
      physics.step(1 / 120, i / 120);
      onStep?.();
    }
    physics.applyAll();
  }
  return { physics, add, advance };
}

test('character count grows every shape and counts combined emoji as one character', () => {
  for (const shape of PEBBLE_SHAPES) {
    let lastArea = 0;
    for (let length = 1; length <= 24; length++) {
      const layout = pebbleLayout('字'.repeat(length), 0, shape);
      assert.ok(layout.width * layout.height > lastArea);
      lastArea = layout.width * layout.height;
      assert.equal(layout.shape, shape);
    }
  }
  assert.equal(pebbleLayout('👨‍👩‍👧‍👦', 0).count, 1);
  assert.equal(pebbleLayout('  海🌊  ', 0).count, 2);
});

test('saved shapes survive reload and new ideas balance the available shapes', () => {
  const original = window.localStorage;
  let saved = JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ id: `legacy-${i}`, text: '旧念头', slot: i + 1, tone: i })));
  window.localStorage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  try {
    const migrated = ideasModule.readIdeas();
    assert.deepEqual(migrated.map(idea => idea.shape), PEBBLE_SHAPES);
    ideasModule.writeIdeas(migrated);
    assert.deepEqual(ideasModule.readIdeas(), migrated);
    assert.equal(ideasModule.chooseShape(migrated.filter(idea => idea.shape !== 'triangle')), 'triangle');
    assert.equal(pebbleLayout(migrated[0].text, 11, migrated[0].shape).shape, 'square');
  } finally {
    window.localStorage = original;
  }
});

test('triangular corners are empty while the square uses its actual broad sides', () => {
  const { physics, add } = setup();
  const triangle = add('triangle', 200, 200, 100, 100, 'triangle');
  const neighbour = add('small', 244, 165, 12, 12, 'circle');
  assert.equal(physics.contact(triangle, neighbour), null);
  const square = add('square', 200, 200, 100, 100, 'square');
  assert.ok(physics.contact(square, neighbour));
  neighbour.x = 220; neighbour.y = 205;
  assert.ok(physics.contact(triangle, neighbour));
});

test('short and maximum-length text fit all five shapes at a readable scale', () => {
  for (const shape of PEBBLE_SHAPES) for (const length of [2, 9, 24]) {
    const layout = pebbleLayout('字'.repeat(length), 0, shape);
    const nodes = contourModule.createContourNodes();
    const columns = Math.max(1, Math.floor(layout.copyWidth / (13 * 1.018)));
    const height = Math.ceil(length / columns) * 13 * 1.45 + 12.5;
    const contour = contourModule.makeContour(layout.width / 2, layout.height / 2, 1, 1, nodes, 1, 600, 600, shape);
    const fit = contourModule.fitContourContent(contour, layout.copyWidth, height, layout.copyOffset);
    assert.ok(fit.scale >= 0.9, `${shape}/${length} chars shrank to ${fit.scale}`);
    const inside = (x, y) => {
      let found = false;
      contour.points.forEach((a, i) => {
        const b = contour.points[(i + 1) % contour.points.length];
        if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) found = !found;
      });
      return found;
    };
    for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) {
      assert.ok(inside(fit.x + x * layout.copyWidth * fit.scale, fit.y + y * height * fit.scale), `${shape} text escaped`);
    }
  }
});

test('different shapes stay separated during a sustained push', () => {
  const { physics, add, advance } = setup(600, 800);
  const bodies = PEBBLE_SHAPES.map((shape, i) => {
    const layout = pebbleLayout('去海边等一次日出', i, shape);
    return add(shape, i % 2 ? 390 : 170, 125 + i * 130, layout.width, layout.height, shape);
  });
  const held = bodies[4];
  physics.hold(held.id, held.x, held.y);
  let worst = 0;
  for (let step = 0; step < 180; step++) {
    physics.moveHeld(held.id, 270 + Math.sin(step / 24) * 120, 620 - step * 2);
    advance(1 / 120, () => {
      for (const a of bodies) {
        const g = physics.geometry(a);
        assert.ok(a.x + g.left >= 7.5 && a.x + g.right <= 592.5);
        assert.ok(Number.isFinite(a.x + a.y));
        for (const b of bodies) if (a !== b) worst = Math.max(worst, physics.contact(a, b)?.depth ?? 0);
      }
    });
  }
  assert.ok(worst < 2.25, `mixed shapes overlap ${worst - 2}px`);
});

test('rounded corners allow a visible gap without a rectangular ghost collision', () => {
  const { physics, add } = setup();
  const a = add('a', 200, 200), b = add('b', 335, 255);
  assert.equal(physics.contact(a, b), null);
  b.x = 305; b.y = 235;
  const c = physics.contact(a, b);
  assert.ok(c && c.nx > 0 && c.ny > 0);
});

test('extreme strain is capped while rendered geometry still governs contacts and walls', () => {
  const { physics, add } = setup();
  const a = add('a', 200, 200), b = add('b', 315, 200);
  a.strain = -Math.log(1.9);
  a.shape = null;
  const g = physics.geometry(a);
  assert.ok(g.sx >= 1 / 1.1 - 1e-10 && g.sx < 1 && g.sy <= 1.1 + 1e-10);
  assert.ok(Math.abs(g.sx * g.sy - 1) < 1e-10);
  b.x = 335;
  assert.equal(physics.contact(a, b), null, 'squeezed edge must not use the original hitbox');
  a.strain = 0; a.shape = null;
  assert.ok(physics.contact(a, b), 'the same position should touch the unsqueezed rim');
  a.strain = -Math.log(1.9); a.shape = null;
  a.x = -20; a.y = 600;
  physics.bounceBounds(a);
  physics.applyAll();
  assert.equal(a.bubbleEl.style.transform, 'none');
  assert.ok(a.x + g.left >= 7.99 && a.y + g.bottom <= 492.01);
});

test('slow sustained pushing stays gently compressed without overlap', () => {
  const { physics, add, advance } = setup(390, 590);
  const a = add('a', 90, 280), b = add('b', 245, 280);
  physics.hold('a', a.x, a.y);
  let peak = 0, overlap = 0;
  for (let i = 0; i < 150; i++) {
    physics.moveHeld('a', 90 + i * 0.65, 280);
    advance(1 / 120, () => {
      peak = Math.max(peak, Math.abs(a.strain), Math.abs(b.strain));
      overlap = Math.max(overlap, physics.contact(a, b)?.depth ?? 0);
    });
  }
  assert.ok(peak > 0.015 && peak < 0.096, `expected restrained, visible compression, got ${peak}`);
  assert.ok(overlap < 0.5, `visible overlap ${overlap}px`);
});

test('ordinary collisions yield locally while keeping width and height within six percent', () => {
  for (const [dx, dy, vx, vy] of [[150, 0, 35, 0], [0, 80, 0, 35], [135, 50, 30, 12]]) {
    const { physics, add, advance } = setup(1000, 800);
    const a = add('soft-a', 350, 300), b = add('soft-b', 350 + dx, 300 + dy);
    const bodies = [a, b];
    const rest = bodies.map(body => physics.geometry(body));
    a.vx = vx; a.vy = vy; b.vx = -vx; b.vy = -vy;
    let dent = 0, sizeChange = 0;
    advance(1.6, () => {
      bodies.forEach((body, i) => {
        const shape = physics.geometry(body);
        sizeChange = Math.max(sizeChange,
          Math.abs((shape.right - shape.left) / (rest[i].right - rest[i].left) - 1),
          Math.abs((shape.bottom - shape.top) / (rest[i].bottom - rest[i].top) - 1));
        dent = Math.max(dent, ...body.nodes.map(node => -node.offset));
      });
    });
    assert.ok(dent > 0.008, 'ordinary contact must still visibly yield');
    assert.ok(sizeChange < 0.06, `ordinary collision stretched the silhouette by ${sizeChange * 100}%`);
    assert.ok(dent < 0.08, `ordinary contact left a deep dent: ${dent}`);
  }
});

test('impact strength grows gently and saturates even under an extreme throw', () => {
  const peaks = [];
  for (const speed of [20, 70, 800, 8000]) {
    const { physics, add } = setup();
    const body = add('soft-a', 250, 250);
    const rest = physics.geometry(body);
    physics.press(body, 1, 0, speed);
    let peak = 0, sizeChange = 0;
    for (let i = 0; i < 180; i++) {
      physics.updateShape(1 / 120);
      const shape = physics.geometry(body);
      peak = Math.max(peak, ...body.nodes.map(node => -node.offset));
      sizeChange = Math.max(sizeChange,
        Math.abs((shape.right - shape.left) / (rest.right - rest.left) - 1),
        Math.abs((shape.bottom - shape.top) / (rest.bottom - rest.top) - 1));
    }
    peaks.push(peak);
    assert.ok(sizeChange < 0.07, `an isolated impact exaggerated the shape: ${sizeChange}`);
  }
  assert.ok(peaks[0] > 0.008 && peaks[1] > peaks[0] * 1.2);
  assert.ok(peaks[2] > peaks[1] && peaks[3] < peaks[2] * 1.02, 'extreme speeds must saturate smoothly');
});

test('a rapid drag sweeps through a neighbour and transfers pressure', () => {
  const { physics, add, advance } = setup(800, 500);
  const a = add('a', 100, 250), b = add('b', 350, 250);
  physics.hold('a', 100, 250);
  physics.moveHeld('a', 650, 250);
  let peak = 0;
  advance(0.6, () => { peak = Math.max(peak, Math.abs(b.strain)); });
  assert.ok(b.x > 450, `neighbour was skipped at ${b.x}`);
  assert.ok(peak > 0.015 && peak < 0.096, `fast drag must stay soft without excessive stretch: ${peak}`);
  assert.ok((physics.contact(a, b)?.depth ?? 0) < 0.5);
});

test('recovery settles and selected bodies remain pinned under collision', () => {
  const { physics, add, advance } = setup();
  const a = add('a', 200, 200), b = add('b', 200, 260);
  physics.setSelected('a');
  b.vy = -120;
  advance(0.4);
  assert.equal(a.x, 200); assert.equal(a.y, 200);
  physics.remove('b');
  advance(3);
  assert.ok(Math.abs(a.strain) < 0.001);
  assert.ok(Math.abs(a.strainVelocity) < 0.002);
});

test('reduced motion retains collision-aware dragging without deformation', () => {
  const { physics, add } = setup(800, 500, false);
  const a = add('a', 100, 250), b = add('b', 350, 250);
  physics.hold('a', 100, 250);
  physics.moveHeld('a', 600, 250);
  assert.ok(b.x > 500);
  assert.ok((physics.contact(a, b)?.depth ?? 0) < 0.5);
  assert.equal(a.strain, 0); assert.equal(b.strain, 0);
});

test('held top edge stays open for completing an idea', () => {
  const { physics, add, advance } = setup();
  const a = add('a', 200, 200);
  physics.hold('a', 200, 200);
  physics.moveHeld('a', 200, -60);
  advance(0.6);
  assert.ok(a.y < -50);
  physics.releaseHeld('a', 0, 0);
  assert.ok(a.y >= physics.geometry(a).hh + 6);
});

test('dense chain against a wall remains finite, separated, and contained', () => {
  const { physics, add, advance } = setup(390, 590);
  const bodies = Array.from({length:8}, (_, i) => add(`b${i}`, i % 2 ? 270 : 110, 55 + i * 65, 132, 56));
  physics.hold('b7', bodies[7].x, bodies[7].y);
  let worst = 0, worstRendered = 0;
  for (let i = 0; i < 240; i++) {
    physics.moveHeld('b7', 180 + Math.sin(i / 25) * 120, 460 - i * 1.2);
    advance(1 / 120, () => {
      for (const a of bodies) {
        const g = physics.geometry(a);
        assert.ok(Number.isFinite(a.x + a.y + a.strain));
        assert.ok(a.x + g.left >= 7.5 && a.x + g.right <= 382.5, `wall escape ${a.id}`);
        for (const b of bodies) if (a !== b) worst = Math.max(worst, physics.contact(a, b)?.depth ?? 0);
      }
      const rendered = bodies.map(body => ({
        shape: physics.geometry(body, 0.5),
        x: (body.previous.x + body.x) / 2,
        y: (body.previous.y + body.y) / 2,
      }));
      for (let j = 0; j < rendered.length; j++) {
        const a = rendered[j];
        assert.ok(a.x + a.shape.left >= 7.5 && a.x + a.shape.right <= 382.5, 'interpolated skin escaped the wall');
        for (let k = j + 1; k < rendered.length; k++) {
          const b = rendered[k];
          worstRendered = Math.max(worstRendered,
            contourModule.contourContact(a.shape, a.x, a.y, b.shape, b.x, b.y, 2)?.depth ?? 0);
        }
      }
    });
  }
  // The solver reserves a 2px gap; allow at most a quarter-pixel of contour error.
  assert.ok(worst < 2.25, `dense contour overlap ${Math.max(0, worst - 2)}px`);
  assert.ok(worstRendered < 2.25, `interpolated contour overlap ${Math.max(0, worstRendered - 2)}px`);
});


test('an off-centre impact makes a shallow dent with small rounded shoulders', () => {
  const { physics, add } = setup();
  const a = add('soft-a', 250, 250);
  physics.press(a, 1, 0, 200, true, {x:315,y:237});
  for (let i=0;i<20;i++) physics.updateShape(1/120);
  const offsets = a.nodes.map(n=>n.offset);
  assert.ok(Math.min(...offsets) < -0.04 && Math.min(...offsets) > -0.12, 'the surface should yield without a deep notch');
  assert.ok(Math.max(...offsets) > 0.005 && Math.max(...offsets) < 0.03, 'shoulders should stay small');
  assert.ok(Math.abs(offsets[3] - offsets[21]) > 0.003, 'the contact should remain local and asymmetric');
  assert.ok(Math.abs(offsets[12]) < 0.01, 'the far side must stay almost at rest');
  for (let i=0;i<500;i++) physics.updateShape(1/120);
  assert.ok(a.nodes.every(n=>Math.abs(n.offset)<0.001 && Math.abs(n.velocity)<0.002));
});

test('a neighbour can approach the shallow dent without hitting the original outline', () => {
  const {createContourNodes,loadContour,stepContour,makeContour,contourContact} = contourModule;
  const nodes=createContourNodes();
  loadContour(nodes,0,0.85,1.2);
  for(let i=0;i<20;i++)stepContour(nodes,1/120,1.2);
  const a=makeContour(50,50,1,1,nodes,1.2,600,500);
  const b=makeContour(6,6,1,1,createContourNodes(),2,600,500);
  assert.equal(contourContact(a,0,0,b,52,0,2),null);
  const rest=makeContour(50,50,1,1,createContourNodes(),1.2,600,500);
  assert.ok(contourContact(rest,0,0,b,52,0,2),'the unsqueezed outline would touch here');
  assert.ok(contourContact(a,0,0,b,45,0,2),'the actual dent surface must still collide');
});

test('multiple local loads keep a simple smooth rim and approximately preserve area', () => {
  const {createContourNodes,loadContour,stepContour,makeContour} = contourModule;
  const nodes=createContourNodes();
  const rest=makeContour(75,32,1,1,nodes,1,600,500);
  loadContour(nodes,-0.4,0.8,1); loadContour(nodes,2.2,0.7,1);
  for(let i=0;i<24;i++)stepContour(nodes,1/120,1);
  const shape=makeContour(75,32,1,1,nodes,1,600,500);
  const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.y-b.x*a.y;},0))/2;
  assert.ok(Math.abs(area(shape.points)/area(rest.points)-1)<0.03);
  shape.points.forEach((p,i)=>{const q=shape.points[(i+1)%shape.points.length];assert.ok(p.x*q.y-p.y*q.x>0,'rim must remain star-shaped, without folds');});
  assert.ok(shape.path.includes('Q') && !shape.path.includes('NaN'));
});


test('text fits inside a deep local dent and returns to its original size', () => {
  const {createContourNodes,loadContour,stepContour,makeContour,fitContourContent} = contourModule;
  const nodes=createContourNodes();
  loadContour(nodes,0.25,0.85,1.2);
  for(let i=0;i<20;i++)stepContour(nodes,1/120,1.2);
  const a=makeContour(75,32,0.8,1.25,nodes,1.2,600,500);
  const fit=fitContourContent(a,116,34);
  const inside=(x,y)=>{let result=false;for(let i=0;i<a.points.length;i++){const p=a.points[i],q=a.points[(i+1)%a.points.length];if((p.y>y)!==(q.y>y)&&x<(q.x-p.x)*(y-p.y)/(q.y-p.y)+p.x)result=!result;}return result;};
  for(const x of [-58,0,58])for(const y of [-17,0,17]){
    assert.ok(inside(fit.x+x*fit.scale,fit.y+y*fit.scale),'text must stay inside the material');
  }
  assert.ok(fit.scale<1 && fit.x<0);
  const rest=makeContour(75,32,1,1,createContourNodes(),1.2,600,500);
  assert.ok(fitContourContent(rest,116,34).scale>0.97);
});

test('switching to reduced motion clears all surface waves immediately', () => {
  const {physics,add,advance}=setup();
  const a=add('a',200,200);
  physics.press(a,1,0,200,true);
  advance(0.12);
  assert.ok(a.nodes.some(n=>Math.abs(n.offset)>0.01));
  physics.setMotionEnabled(false);
  assert.ok(a.nodes.every(n=>n.offset===0&&n.velocity===0&&n.load===0));
  assert.equal(a.strain,0);
});

test('a sliding contact releases the old dent while keeping the new contact compressed', () => {
  const { createContourNodes, loadContour, stepContour } = contourModule;
  const nodes = createContourNodes();
  for (let i = 0; i < 90; i++) {
    loadContour(nodes, 0, 0.3, 1.2);
    stepContour(nodes, 1 / 120, 1.2);
  }
  assert.ok(nodes[0].offset < -0.08 && nodes[0].offset >= -0.18);
  let largestChange = 0;
  for (let i = 0; i < 120; i++) {
    const previous = nodes.map(node => node.offset);
    loadContour(nodes, Math.min(1, i / 40) * Math.PI, 0.3, 1.2);
    stepContour(nodes, 1 / 120, 1.2);
    largestChange = Math.max(largestChange, ...nodes.map((node, j) => Math.abs(node.offset - previous[j])));
  }
  assert.ok(Math.abs(nodes[0].offset) < 0.04, 'old compression must not stay latched during continued contact');
  assert.ok(nodes[12].offset < -0.08, 'the contact must travel to the other side');
  assert.ok(largestChange < 0.02, `surface changed too abruptly: ${largestChange}`);
});

test('simultaneous contacts produce the same deformation in either solver order', () => {
  const { createContourNodes, loadContour, stepContour } = contourModule;
  const forward = createContourNodes(), reverse = createContourNodes();
  const loads = [[-0.4, 0.8], [1.2, 0.5], [2.2, 0.7]];
  for (let i = 0; i < 80; i++) {
    for (const [angle, amount] of loads) loadContour(forward, angle, amount, 1);
    for (const [angle, amount] of [...loads].reverse()) loadContour(reverse, angle, amount, 1);
    stepContour(forward, 1 / 120, 1);
    stepContour(reverse, 1 / 120, 1);
  }
  assert.deepEqual(forward, reverse);
});

test('contact pressure remains continuous across the angle seam', () => {
  const { createContourNodes, loadContour, stepContour } = contourModule;
  const left = createContourNodes(), right = createContourNodes();
  for (let i = 0; i < 60; i++) {
    loadContour(left, Math.PI - 0.0001, 0.7, 1.2);
    loadContour(right, -Math.PI + 0.0001, 0.7, 1.2);
    stepContour(left, 1 / 120, 1.2);
    stepContour(right, 1 / 120, 1.2);
  }
  assert.ok(left.every((node, i) => Math.abs(node.offset - right[i].offset) < 0.0005));
});

test('sustained compression releases without a large reverse snap', () => {
  const { physics, add } = setup();
  const body = add('soft-a', 250, 250);
  for (let i = 0; i < 90; i++) {
    physics.press(body, 1, 0, 140, true);
    physics.updateShape(1 / 120);
  }
  assert.ok(body.strain < -0.03 && body.strain >= -0.096 && body.nodes[0].offset < -0.07);
  let rebound = 0;
  for (let i = 0; i < 360; i++) {
    physics.updateShape(1 / 120);
    rebound = Math.max(rebound, body.strain, body.nodes[0].offset);
  }
  assert.ok(rebound < 0.01, `release snapped past the resting contour: ${rebound}`);
  assert.ok(Math.abs(body.strain) < 0.001 && Math.abs(body.nodes[0].offset) < 0.001);
});

test('rendering moves on every high-refresh frame, with cadence-independent physics', () => {
  const states = [];
  for (const rate of [60, 90, 144, 165]) {
    const { physics, add } = setup(2000, 1000);
    const body = add('steady', 600, 400);
    body.vx = 35; body.vy = 5;
    physics.tick(1000);
    let previousX = body.x, smallestStep = Infinity, largestStep = 0;
    for (let frame = 1; frame <= rate; frame++) {
      physics.tick(1000 + frame * 1000 / rate);
      const renderedX = Number(body.el.style.transform.match(/translate3d\(([^p]+)px/)[1]);
      if (frame > 2) {
        smallestStep = Math.min(smallestStep, renderedX - previousX);
        largestStep = Math.max(largestStep, renderedX - previousX);
      }
      previousX = renderedX;
    }
    assert.ok(smallestStep > 0, `${rate}Hz repeated a physics frame`);
    assert.ok(largestStep / smallestStep < 1.15, `${rate}Hz has uneven frame pacing`);
    states.push([body.x, body.y]);
  }
  for (const [x, y] of states) {
    assert.ok(Math.abs(x - states[0][0]) < 0.35 && Math.abs(y - states[0][1]) < 0.1);
  }
});

test('rendered skin interpolates with the centre and size updates reset the previous pose', () => {
  const { physics, add } = setup();
  const body = add('a', 200, 200);
  let path;
  body.skinPaths = [{ setAttribute: (_, value) => { path = value; } }];
  physics.snapshot(body);
  body.x += 12;
  body.strain = -0.4;
  body.nodes[0].offset = -0.25;
  body.shape = null;
  physics.applyAll(0.5);
  assert.ok(body.el.style.transform.startsWith('translate3d(206px, 200px'));
  assert.equal(path, physics.geometry(body, 0.5).path);
  assert.notEqual(path, physics.geometry(body).path);
  physics.updateBodySize('a', 200, 80);
  physics.applyAll(0);
  assert.ok(body.el.style.transform.startsWith('translate3d(212px, 200px'));
  assert.equal(path, physics.geometry(body).path);
});

test('overfilled sea bounds collision work instead of retrying impossible packing', () => {
  const { physics, add } = setup(360, 260);
  const bodies = Array.from({ length: 8 }, (_, i) =>
    add(`crowded-${i}`, 100 + i % 2 * 140, 80 + Math.floor(i / 2) * 45, 200, 180, 'square'));
  const contact = physics.contactWithRoom.bind(physics);
  let calls = 0;
  physics.contactWithRoom = (...args) => { calls++; return contact(...args); };
  for (let frame = 0; frame < 120; frame++) {
    calls = 0;
    physics.step(1 / 120, frame / 120);
    assert.ok(calls <= 512, `unresolved contacts ran ${calls} checks in one step`);
    for (const body of bodies) {
      assert.ok(Number.isFinite(body.x + body.y + body.vx + body.vy));
      const g = physics.geometry(body);
      assert.ok(body.x + g.left >= 7.5 && body.x + g.right <= 352.5);
      assert.ok(body.y + g.top >= 5.5 && body.y + g.bottom <= 252.5);
    }
  }
});

test('a keyboard-sized frame interruption does not leave catch-up debt', () => {
  const { physics, add } = setup();
  add('steady', 200, 200);
  const step = physics.step.bind(physics);
  let steps = 0;
  physics.step = (...args) => { steps++; return step(...args); };
  physics.tick(1000);
  physics.tick(1200);
  assert.ok(steps <= 4, `stalled frame ran ${steps} catch-up steps`);
  steps = 0;
  physics.tick(1216.667);
  assert.equal(steps, 2, 'next normal frame must resume normal work');
});

test('animation frames do not read layout and remeasurement updates text fitting', () => {
  const { physics, add } = setup();
  const body = add('a', 200, 200);
  let reads = 0;
  const metrics = { offsetWidth: 100, offsetHeight: 32, offsetLeft: 20, offsetTop: 13 };
  body.copyEl = Object.fromEntries(Object.keys(metrics).map(key => [key, 0]));
  for (const key of Object.keys(metrics)) {
    Object.defineProperty(body.copyEl, key, { get() { reads++; return metrics[key]; } });
  }
  physics.updateBodySize('a', 140, 60);
  const measuredReads = reads;
  const initialCopy = body.bubbleEl.style['--copy-transform'];
  for (let i = 0; i < 120; i++) {
    physics.step(1 / 120, i / 120);
    physics.applyAll(0.5);
  }
  assert.equal(reads, measuredReads, 'the animation loop must not force DOM layout');
  metrics.offsetWidth = 170;
  physics.updateBodySize('a', 140, 60);
  assert.ok(reads > measuredReads);
  assert.notEqual(body.bubbleEl.style['--copy-transform'], initialCopy);
});
