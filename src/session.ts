import { Terminal, type ITerminalAddon } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { CanvasAddon } from "@xterm/addon-canvas";
import "@xterm/xterm/css/xterm.css";
import * as ipc from "./ipc";
import { SearchAddon } from "@xterm/addon-search";
import { matchShortcut, matchZoom } from "./shortcuts";

type Entry = { term: Terminal; fit: FitAddon; search: SearchAddon; opened: boolean };
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

const theme = {
  background: "#14151a",
  foreground: "#d6d9e0",
  cursor: "#d6d9e0",
  selectionBackground: "#3a4160",
};

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
export function create(id: string, cwd?: string, shell?: string) {
  const term = new Terminal({
    scrollback: 10000,
    fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace',
    fontSize,
    cursorBlink: true,
    allowProposedApi: true,
    theme,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  const search = new SearchAddon();
  term.loadAddon(search);

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
        void navigator.clipboard.writeText(term.getSelection());
        return false;
      }
      if (k === "v") {
        void navigator.clipboard.readText().then((t) => term.paste(t));
        return false;
      }
    }
    return true;
  });

  entries.set(id, { term, fit, search, opened: false });
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

export const write = (id: string, data: string) => entries.get(id)?.term.write(data);
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
