import * as ipc from "./ipc";
import { buildLayout, useStore } from "./store";

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
  return () => {
    clearTimeout(timer);
    unsub();
  };
}
