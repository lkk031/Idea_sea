import { useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { IdeaBubble } from "../src/components/IdeaBubble";
import { PEBBLE_SHAPES, pebbleLayout, type PebbleShape } from "../src/lib/pebbleShape";
import { SeaPhysics } from "../src/lib/seaPhysics";

const noop = () => {};

function Specimen({ shape, text, index }: { shape: PebbleShape; text: string; index: number }) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const idea = { id: `${shape}-${index}`, text, slot: index, tone: index % 5, shape, createdAt: 0 };
  useLayoutEffect(() => {
    const field = fieldRef.current!;
    const physics = new SeaPhysics({ motionEnabled: false });
    physics.attachField(field);
    physics.addBody({ id: idea.id, el: field.querySelector<HTMLElement>(".bubble-anchor")!,
      x: field.clientWidth / 2, y: field.clientHeight / 2, shapeKind: shape });
    return () => physics.destroy();
  }, []);
  return <section className="specimen">
    <p>{shape} · {pebbleLayout(text, index, shape).count} 字</p>
    <div className="idea-field" ref={fieldRef}>
      <IdeaBubble idea={idea} index={index} selected={false} leaving={null} entranceDelay={0}
        waterRef={fieldRef} onToggleSelect={noop} onDragStart={noop} onDragMove={noop}
        onDragRelease={noop} onCrossChange={noop} onComplete={noop} onDelete={noop} />
    </div>
  </section>;
}

createRoot(document.getElementById("root")!).render(<div className="specimens">
  {PEBBLE_SHAPES.flatMap((shape, index) => ["看海", "找一个晴朗的周末坐慢车去海边看日出再慢慢走回家休息"].map((text, i) =>
    <Specimen key={`${shape}-${i}`} shape={shape} text={text} index={index} />))}
</div>);
