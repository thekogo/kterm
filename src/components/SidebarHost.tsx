import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { useSettings } from "../settings";
import { Sidebar } from "./Sidebar";
import "../layout.css";

/** Pinned: sidebar in the flow. Auto-hide: overlay that slides out from a thin hover zone at the left edge. */
export function SidebarHost() {
  const mode = useSettings((s) => s.sidebarMode);
  const modalOpen = useStore((s) => s.switcherOpen || !!s.confirm);
  const [open, setOpen] = useState(false);
  const hover = useRef(false);
  const pressed = useRef(false);
  const host = useRef<HTMLDivElement>(null);

  // Keeps the sidebar open while dragging, editing inline, or any modal/overlay is up.
  const shouldStay = useCallback(() => {
    if (hover.current || pressed.current) return true;
    const st = useStore.getState();
    if (st.switcherOpen || st.confirm) return true;
    if (document.querySelector(".overlay, .modal")) return true;
    const a = document.activeElement;
    return !!(a && host.current?.contains(a) && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"));
  }, []);

  const maybeClose = useCallback(() => {
    if (!shouldStay()) setOpen(false);
  }, [shouldStay]);

  useEffect(() => {
    const up = () => {
      pressed.current = false;
      setTimeout(maybeClose, 50);
    };
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, [maybeClose]);

  useEffect(() => {
    if (!modalOpen) setTimeout(maybeClose, 50);
  }, [modalOpen, maybeClose]);

  if (mode === "pinned") return <Sidebar />;

  return (
    <>
      <div className="sidebar-zone" onMouseEnter={() => ((hover.current = true), setOpen(true))} />
      <div
        ref={host}
        className={`sidebar-host autohide${open ? " open" : ""}`}
        onMouseEnter={() => ((hover.current = true), setOpen(true))}
        onMouseLeave={() => {
          hover.current = false;
          setTimeout(maybeClose, 150);
        }}
        onPointerDownCapture={() => (pressed.current = true)}
        onBlurCapture={() => setTimeout(maybeClose, 50)}
      >
        <Sidebar />
      </div>
    </>
  );
}
