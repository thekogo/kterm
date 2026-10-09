import * as ipc from "./ipc";
import * as session from "./session";
import { useSettings } from "./settings";
import { buildLayout, useStore } from "./store";

const SCROLLBACK_INTERVAL_MS = 5000;

/** Save scrollback of pinned terminals (only those with new output unless `force`). Opt-in via settings. */
function saveScrollback(force = false) {
  if (!useSettings.getState().restoreScrollback) return;
  const s = useStore.getState();
  if (!s.loaded) return;
  for (const t of Object.values(s.terminals)) {
    if (!t.pinned) continue;
    if (!session.takeDirty(t.id) && !force) continue;
    const data = session.serialize(t.id);
    if (data != null) void ipc.scrollbackSave(t.id, data).catch(() => {});
  }
}

/** Debounced layout_save on any change that alters the persisted layout. */
export function startPersistence(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = "";
  const unsub = useStore.subscribe((s) => {
    if (!s.loaded) return;
    const layout = buildLayout(s);
    const json = JSON.stringify(layout);
    if (json === last) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      last = json;
      void ipc.layoutSave(layout).catch((e) => console.error("layout_save failed", e));
    }, 500);
  });
  const onUnload = () => saveScrollback(true);
  window.addEventListener("beforeunload", onUnload);
  const poll = setInterval(() => saveScrollback(), SCROLLBACK_INTERVAL_MS);
  return () => {
    clearTimeout(timer);
    clearInterval(poll);
    window.removeEventListener("beforeunload", onUnload);
    unsub();
  };
}
