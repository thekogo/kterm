import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Custom title bar; the native one is disabled on Windows/Linux (see tauri.*.conf.json). */
export const hasCustomTitlebar = !/Mac/i.test(navigator.userAgent);

export function Titlebar() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const w = getCurrentWindow();
    const sync = () => void w.isMaximized().then(setMaximized).catch(() => {});
    sync();
    const un = w.onResized(sync);
    return () => void un.then((f) => f());
  }, []);
  const w = () => getCurrentWindow();
  return (
    <header className="titlebar" data-tauri-drag-region onDoubleClick={() => void w().toggleMaximize()}>
      <span className="titlebar-title" data-tauri-drag-region>kterm</span>
      <div className="titlebar-controls" onDoubleClick={(e) => e.stopPropagation()}>
        <button aria-label="Minimize" onClick={() => void w().minimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 5h8" stroke="currentColor" /></svg>
        </button>
        <button aria-label={maximized ? "Restore" : "Maximize"} onClick={() => void w().toggleMaximize()}>
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"><path d="M3 3V1.5h5.5V7H7" /><rect x="1.5" y="3" width="5.5" height="5.5" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"><rect x="1.5" y="1.5" width="7" height="7" /></svg>
          )}
        </button>
        <button className="close" aria-label="Close" onClick={() => void w().close()}>
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" /></svg>
        </button>
      </div>
    </header>
  );
}
