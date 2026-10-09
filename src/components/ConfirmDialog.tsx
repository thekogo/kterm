import { useEffect } from "react";
import { useStore } from "../store";

export function ConfirmDialog() {
  const c = useStore((s) => s.confirm);
  const resolve = useStore.getState().resolveConfirm;
  useEffect(() => {
    if (!c) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") resolve(false);
      else if (e.key === "Enter") resolve(true);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [c, resolve]);
  if (!c) return null;
  return (
    <div className="overlay">
      <div className="modal confirm">
        <p>{c.message}</p>
        <div className="actions">
          <button onClick={() => resolve(false)}>Cancel</button>
          <button className="danger" autoFocus onClick={() => resolve(true)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
