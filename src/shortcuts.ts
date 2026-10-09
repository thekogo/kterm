export const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
export type ShortcutAction = "switcher" | "new" | "close" | "find";

const keys: Record<ShortcutAction, string> = { switcher: "k", new: "t", close: "w", find: "f" };

/** Cmd+key on macOS, Ctrl+Shift+key elsewhere. */
export function matchShortcut(e: KeyboardEvent): ShortcutAction | null {
  if (e.type !== "keydown" || e.altKey) return null;
  const ok = isMac ? e.metaKey && !e.ctrlKey && !e.shiftKey : e.ctrlKey && e.shiftKey && !e.metaKey;
  if (!ok) return null;
  const k = e.key.toLowerCase();
  return (Object.keys(keys) as ShortcutAction[]).find((a) => keys[a] === k) ?? null;
}

export const switcherHint = isMac ? "⌘K" : "Ctrl+Shift+K";
export const newHint = isMac ? "⌘T" : "Ctrl+Shift+T";

export type ZoomAction = "in" | "out" | "reset";

/** Same modifier rule as the other app shortcuts, but Shift is optional on macOS (Cmd+Plus needs it on many layouts). */
export function matchZoom(e: KeyboardEvent): ZoomAction | null {
  if (e.type !== "keydown" || e.altKey) return null;
  const ok = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && e.shiftKey && !e.metaKey;
  if (!ok) return null;
  if (e.code === "Equal" || e.code === "NumpadAdd") return "in";
  if (e.code === "Minus" || e.code === "NumpadSubtract") return "out";
  if (e.code === "Digit0" || e.code === "Numpad0") return "reset";
  return null;
}

export const findHint = isMac ? "⌘F" : "Ctrl+Shift+F";
