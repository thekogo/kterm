import { useEffect, useRef } from "react";
import { useStore } from "../store";
import * as session from "../session";

/** One hidden-but-mounted xterm host per Terminal. */
export function TerminalView({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useStore((s) => s.activeId === id);
  useEffect(() => session.attach(id, ref.current!), [id]);
  useEffect(() => {
    if (active) session.focus(id);
  }, [active, id]);
  return <div ref={ref} className={`term${active ? " active" : ""}`} />;
}
