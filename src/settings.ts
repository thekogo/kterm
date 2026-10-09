import { create } from "zustand";

/** App-wide user settings, persisted in localStorage (per-viewer conveniences). Owned by the settings agent. */
import type { ThemeId } from "./themes";
export type { ThemeId };
export type Settings = {
  theme: ThemeId;
  /** Persisted action -> key combo overrides. Missing = default. Format: "ctrl+shift+k", "meta+k". */
  shortcuts: Record<string, string>;
  /** Save and restore Pinned terminals' scrollback (opt-in; output may contain secrets). */
  restoreScrollback: boolean;
  /** "pinned" keeps the sidebar visible; "autohide" slides it out until the mouse hits the left edge. */
  sidebarMode: "pinned" | "autohide";
  /** Terminal font family (CSS font-family list). Empty = built-in default stack. */
  fontFamily: string;
};

const KEY = "kterm.settings";
const defaults: Settings = { theme: "dark", shortcuts: {}, restoreScrollback: false, sidebarMode: "pinned", fontFamily: "" };

function load(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return defaults;
  }
}

export const useSettings = create<Settings & { set: (p: Partial<Settings>) => void }>((set, get) => ({
  ...load(),
  set: (p) => {
    set(p);
    const { set: _s, ...rest } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify(rest));
    } catch {
      /* not persisted */
    }
  },
}));
