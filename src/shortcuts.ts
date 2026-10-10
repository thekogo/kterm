import { useSettings } from "./settings";

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
export type ShortcutAction =
  | "switcher" | "new" | "close" | "find" | "toggleSidebar" | "toggleSplit" | "settings"
  | "goto1" | "goto2" | "goto3" | "goto4" | "goto5" | "goto6" | "goto7" | "goto8" | "goto9";
export type ZoomAction = "in" | "out" | "reset";
export type AnyAction = ShortcutAction | "zoomIn" | "zoomOut" | "zoomReset";

const base = isMac ? "meta" : "ctrl+shift";
/** Combo format: modifiers in order ctrl, alt, shift, meta, then the key ("k", "backslash", "equal", "f5"...). */
export const ACTIONS: { id: AnyAction; label: string; def: string }[] = [
  { id: "switcher", label: "Search terminals", def: `${base}+k` },
  { id: "new", label: "New terminal", def: `${base}+t` },
  { id: "close", label: "Close terminal", def: `${base}+w` },
  { id: "find", label: "Find in terminal", def: `${base}+f` },
  { id: "zoomIn", label: "Zoom in", def: `${base}+equal` },
  { id: "zoomOut", label: "Zoom out", def: `${base}+minus` },
  { id: "zoomReset", label: "Reset zoom", def: `${base}+0` },
  { id: "toggleSidebar", label: "Toggle sidebar", def: `${base}+b` },
  { id: "toggleSplit", label: "Toggle split view", def: `${base}+backslash` },
  { id: "settings", label: "Settings", def: `${base}+comma` },
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((n) => ({
    id: `goto${n}` as AnyAction, label: `Go to terminal ${n}`, def: `alt+${n}`,
  })),
];

const MODS = ["ctrl", "alt", "shift", "meta"] as const;
const CODE_KEYS: Record<string, string> = {
  Equal: "equal", NumpadAdd: "equal", Minus: "minus", NumpadSubtract: "minus", Backslash: "backslash",
  Comma: "comma", Period: "period", Slash: "slash", Semicolon: "semicolon", Quote: "quote",
  BracketLeft: "bracketleft", BracketRight: "bracketright", Backquote: "backquote", Space: "space",
  Enter: "enter", Tab: "tab", Numpad0: "0",
};

/** Normalise a keydown to a combo string, or null for a bare modifier press. */
export function eventCombo(e: KeyboardEvent, ignoreShift = false): string | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;
  let key = CODE_KEYS[e.code] ?? /^Digit(\d)$/.exec(e.code)?.[1];
  if (!key) key = e.key.length === 1 ? e.key.toLowerCase() : e.code ? e.code.replace(/^(Key|Digit)/, "").toLowerCase() : e.key.toLowerCase();
  const on = [e.ctrlKey, e.altKey, e.shiftKey && !ignoreShift, e.metaKey];
  return [...MODS.filter((_, i) => on[i]), key].join("+");
}

/** True while the settings UI is recording a new binding: global shortcuts stay quiet. */
let capturing = false;
export const setCapturing = (v: boolean) => (capturing = v);

export function binding(a: AnyAction, overrides = useSettings.getState().shortcuts): string {
  return overrides[a] || ACTIONS.find((x) => x.id === a)!.def;
}

export function matchAction(e: KeyboardEvent): AnyAction | null {
  if (capturing || e.type !== "keydown") return null;
  const { shortcuts } = useSettings.getState();
  const full = eventCombo(e);
  const noShift = e.shiftKey ? eventCombo(e, true) : null;
  for (const a of ACTIONS) {
    const b = binding(a.id, shortcuts);
    if (b === full) return a.id;
    // Cmd+Plus needs Shift on many layouts: zoom bindings tolerate it.
    if (a.id.startsWith("zoom") && noShift === b) return a.id;
  }
  return null;
}

/** Non-zoom app shortcuts. */
export function matchShortcut(e: KeyboardEvent): ShortcutAction | null {
  const a = matchAction(e);
  return a && !a.startsWith("zoom") ? (a as ShortcutAction) : null;
}

export function matchZoom(e: KeyboardEvent): ZoomAction | null {
  const a = matchAction(e);
  return a === "zoomIn" ? "in" : a === "zoomOut" ? "out" : a === "zoomReset" ? "reset" : null;
}

const KEY_LABEL: Record<string, string> = {
  equal: "+", minus: "-", backslash: "\\", comma: ",", period: ".", slash: "/", semicolon: ";",
  quote: "'", bracketleft: "[", bracketright: "]", backquote: "`", space: "Space", enter: "Enter", tab: "Tab",
};

export function formatCombo(combo: string): string {
  const parts = combo.split("+");
  const key = parts.pop()!;
  const k = KEY_LABEL[key] ?? (key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1));
  if (isMac) {
    const sym: Record<string, string> = { ctrl: "⌃", alt: "⌥", shift: "⇧", meta: "⌘" };
    return parts.map((m) => sym[m]).join("") + k;
  }
  const name: Record<string, string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Win" };
  return [...parts.map((m) => name[m]), k].join("+");
}

export const getHint = (a: AnyAction) => formatCombo(binding(a));
/** Reactive hint: re-renders when the binding is rebound. */
export function useHint(a: AnyAction): string {
  const overrides = useSettings((s) => s.shortcuts);
  return formatCombo(binding(a, overrides));
}

// Legacy constants (default bindings only); prefer useHint()/getHint().
export const switcherHint = formatCombo(`${base}+k`);
export const newHint = formatCombo(`${base}+t`);
export const findHint = formatCombo(`${base}+f`);
