export const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
export type ShortcutAction = "switcher" | "new" | "close";

const keys: Record<ShortcutAction, string> = { switcher: "k", new: "t", close: "w" };

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
