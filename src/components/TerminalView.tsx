import { useEffect, useRef } from "react";
import { useStore } from "../store";
import * as session from "../session";

/** One hidden-but-mounted xterm host per Terminal. `slot` places it as a split column; null = hidden. */
export function TerminalView({ id, slot }: { id: string; slot: { index: number; count: number } | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useStore((s) => s.activeId === id);
  useEffect(() => session.attach(id, ref.current!), [id]);
  useEffect(() => {
    if (active) session.focus(id);
  }, [active, id]);
  const split = !!slot && slot.count > 1;
  return (
    <div
      ref={ref}
      className={`term${slot ? " shown" : ""}${active ? " active" : ""}${split ? " split" : ""}${split && slot.index === 0 ? " first" : ""}`}
      style={slot ? { left: `${(slot.index / slot.count) * 100}%`, width: `${100 / slot.count}%` } : undefined}
      onMouseDownCapture={() => {
        if (!active) useStore.getState().setActive(id);
      }}
    />
  );
}
