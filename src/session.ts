import { Terminal, type ITerminalAddon, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { CanvasAddon } from "@xterm/addon-canvas";
import "@xterm/xterm/css/xterm.css";
import * as ipc from "./ipc";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { matchShortcut, matchZoom } from "./shortcuts";
import { themeById } from "./themes";
import { useSettings, type Padding } from "./settings";

type Entry = {
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  serialize: SerializeAddon;
  opened: boolean;
  /** Output arriving while restored scrollback is still loading is buffered here. */
  hold: string[] | null;
  /** Output received since the last scrollback save. */
  dirty: boolean;
};
const entries = new Map<string, Entry>();

export const DEFAULT_FONT_SIZE = 13;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;
const FONT_KEY = "kterm.fontSize";

let fontSize = (() => {
  try {
    const n = Number(localStorage.getItem(FONT_KEY));
    return n >= MIN_FONT_SIZE && n <= MAX_FONT_SIZE ? n : DEFAULT_FONT_SIZE;
  } catch {
    return DEFAULT_FONT_SIZE;
  }
})();

export const getFontSize = () => fontSize;

/** Apply one font size to every Terminal; xterm refits through the ResizeObserver/fit below. */
export function setFontSize(size: number) {
  fontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
  try {
    localStorage.setItem(FONT_KEY, String(fontSize));
  } catch {
    /* not persisted */
  }
  for (const e of entries.values()) {
    e.term.options.fontSize = fontSize;
    if (e.opened) doFit(e);
  }
}

export function zoom(action: "in" | "out" | "reset") {
  setFontSize(action === "reset" ? DEFAULT_FONT_SIZE : fontSize + (action === "in" ? 1 : -1));
}

export const DEFAULT_FONT_FAMILY = 'ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace';
const familyOf = (f: string) => f.trim() || DEFAULT_FONT_FAMILY;
let fontFamily = familyOf(useSettings.getState().fontFamily);

/** Apply the font family to every Terminal live (and to Terminals created later). */
export function setFontFamily(family: string) {
  fontFamily = familyOf(family);
  for (const e of entries.values()) {
    e.term.options.fontFamily = fontFamily;
    if (e.opened) doFit(e);
  }
}

/** Apply the terminal padding via a CSS variable; the ResizeObserver refits, doFit covers hidden hosts. */
function applyPadding(p: Padding) {
  document.documentElement.style.setProperty("--term-pad", `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`);
  for (const e of entries.values()) if (e.opened) doFit(e);
}
applyPadding(useSettings.getState().padding);
useSettings.subscribe((s, prev) => {
  if (s.fontFamily !== prev.fontFamily) setFontFamily(s.fontFamily);
  if (s.padding !== prev.padding) applyPadding(s.padding);
});

let theme: ITheme = themeById(useSettings.getState().theme).xterm;
document.documentElement.style.setProperty("--term-bg", theme.background ?? "");

/** Apply an xterm theme live to every Terminal (and to Terminals created later). */
export function applyTheme(t: ITheme) {
  theme = t;
  document.documentElement.style.setProperty("--term-bg", t.background ?? "");
  for (const e of entries.values()) e.term.options.theme = t;
}

function loadCanvas(term: Terminal) {
  try {
    term.loadAddon(new CanvasAddon() as unknown as ITerminalAddon);
  } catch {
    /* DOM renderer */
  }
}

function loadRenderer(term: Terminal) {
  try {
    const gl = new WebglAddon();
    gl.onContextLoss(() => {
      gl.dispose();
      loadCanvas(term);
    });
    term.loadAddon(gl);
  } catch {
    loadCanvas(term);
  }
}

/** Create the xterm instance and the Rust PTY. The xterm exists before output can arrive. */
export function create(id: string, cwd?: string, shell?: string, restoreScrollback = false) {
  const term = new Terminal({
    scrollback: 10000,
    fontFamily,
    fontSize,
    cursorBlink: true,
    allowProposedApi: true,
    theme,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  const search = new SearchAddon();
  term.loadAddon(search);
  const serializeAddon = new SerializeAddon();
  term.loadAddon(serializeAddon);

  const ready = ipc
    .terminalCreate({ id, cwd, shell, cols: term.cols, rows: term.rows })
    .catch((e) => term.write(`\r\n[failed to start shell: ${e}]\r\n`));
  term.onData((d) => void ready.then(() => ipc.terminalWrite(id, d).catch(() => {})));
  term.onResize(({ cols, rows }) => void ready.then(() => ipc.terminalResize(id, cols, rows).catch(() => {})));

  term.attachCustomKeyEventHandler((e) => {
    if (matchShortcut(e) || matchZoom(e)) return false;
    if (e.type === "keydown" && e.ctrlKey && e.shiftKey && !e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === "c" && term.hasSelection()) {
        e.preventDefault();
        void navigator.clipboard.writeText(term.getSelection());
        return false;
      }
      if (k === "v") {
        // Without preventDefault the webview also fires its native paste event, pasting twice.
        e.preventDefault();
        void navigator.clipboard.readText().then((t) => term.paste(t));
        return false;
      }
    }
    return true;
  });

  const entry: Entry = { term, fit, search, serialize: serializeAddon, opened: false, hold: restoreScrollback ? [] : null, dirty: false };
  entries.set(id, entry);
  if (restoreScrollback) {
    void ipc
      .scrollbackLoad(id)
      .catch(() => null)
      .then((text) => {
        if (text) restore(id, text);
        const buf = entry.hold ?? [];
        entry.hold = null;
        buf.forEach((d) => term.write(d));
      });
  }
}

function doFit(e: Entry) {
  const d = e.fit.proposeDimensions();
  if (d && d.cols > 0 && d.rows > 0) e.fit.fit();
}

/** Mount the xterm into a container (once) and keep it fitted. Returns a disposer. */
export function attach(id: string, el: HTMLElement): () => void {
  const e = entries.get(id);
  if (!e) return () => {};
  if (!e.opened) {
    e.term.open(el);
    loadRenderer(e.term);
    e.opened = true;
  }
  let raf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => doFit(e));
  });
  ro.observe(el);
  doFit(e);
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
  };
}

export function write(id: string, data: string) {
  const e = entries.get(id);
  if (!e) return;
  e.dirty = true;
  if (e.hold) e.hold.push(data);
  else e.term.write(data);
}

/** Serialized scrollback + screen (ANSI text), capped to the last `rows` lines of scrollback. */
export const serialize = (id: string, rows = 5000): string | null => {
  const e = entries.get(id);
  return e && !e.hold ? e.serialize.serialize({ scrollback: rows }) : null;
};
/** Write previously saved text into the terminal followed by a dim separator. */
export function restore(id: string, text: string) {
  entries.get(id)?.term.write(text + "\x1b[0m\r\n\x1b[2m\u2500\u2500\u2500\u2500 restored scrollback \u2500\u2500\u2500\u2500\x1b[0m\r\n");
}
/** True once if the terminal produced output since the last call. */
export function takeDirty(id: string): boolean {
  const e = entries.get(id);
  if (!e || !e.dirty) return false;
  e.dirty = false;
  return true;
}
export const notifyExit = (id: string, code: number | null) =>
  entries.get(id)?.term.write(`\r\n\x1b[2m[process exited${code == null ? "" : ` with code ${code}`}]\x1b[0m\r\n`);
const searchDecorations = {
  matchBackground: "#4a4f6a",
  activeMatchBackground: "#8fa4ff",
  matchOverviewRuler: "#4a4f6a",
  activeMatchColorOverviewRuler: "#8fa4ff",
};

export const findNext = (id: string, q: string, caseSensitive: boolean, incremental = false) =>
  q ? (entries.get(id)?.search.findNext(q, { caseSensitive, incremental, decorations: searchDecorations }) ?? false) : false;
export const findPrevious = (id: string, q: string, caseSensitive: boolean) =>
  q ? (entries.get(id)?.search.findPrevious(q, { caseSensitive, decorations: searchDecorations }) ?? false) : false;
export const clearSearch = (id: string) => entries.get(id)?.search.clearDecorations();
export const focus = (id: string) => entries.get(id)?.term.focus();

export function dispose(id: string) {
  const e = entries.get(id);
  if (!e) return;
  entries.delete(id);
  void ipc.terminalClose(id).catch(() => {});
  e.term.dispose();
}
