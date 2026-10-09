import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type PinnedTerminal = { id: string; name: string; cwd?: string; renamed?: boolean };
export type SidebarItem =
  | { kind: "terminal"; terminal: PinnedTerminal }
  | { kind: "group"; id: string; name: string; cwd?: string; shell?: string; terminals: PinnedTerminal[] };
export type Layout = { version: 1; shell?: string; items: SidebarItem[] };

export const terminalCreate = (a: { id: string; cwd?: string; shell?: string; cols: number; rows: number }) =>
  invoke<void>("terminal_create", a);
export const terminalWrite = (id: string, data: string) => invoke<void>("terminal_write", { id, data });
export const terminalResize = (id: string, cols: number, rows: number) =>
  invoke<void>("terminal_resize", { id, cols, rows });
export const terminalClose = (id: string) => invoke<void>("terminal_close", { id });
export const hasForegroundProcess = (id: string) => invoke<boolean>("terminal_has_foreground_process", { id });
export const layoutLoad = () => invoke<Layout | null>("layout_load");
export const layoutSave = (layout: Layout) => invoke<void>("layout_save", { layout });
export const defaultShell = () => invoke<string>("default_shell");
export type ShellInfo = { id: string; name: string; path: string };
export const listShells = () => invoke<ShellInfo[]>("list_shells");
export const scrollbackSave = (id: string, data: string) => invoke<void>("scrollback_save", { id, data });
export const scrollbackLoad = (id: string) => invoke<string | null>("scrollback_load", { id });
export const scrollbackDelete = (id: string) => invoke<void>("scrollback_delete", { id });

export type Handlers = {
  output: (p: { id: string; data: string }) => void;
  exit: (p: { id: string; code: number | null }) => void;
  cwd: (p: { id: string; cwd: string }) => void;
  title?: (p: { id: string; title: string }) => void;
};

/** Subscribe to all terminal events; returns a disposer. */
export async function listenAll(h: Handlers): Promise<() => void> {
  const un: UnlistenFn[] = await Promise.all([
    listen<{ id: string; data: string }>("terminal://output", (e) => h.output(e.payload)),
    listen<{ id: string; code: number | null }>("terminal://exit", (e) => h.exit(e.payload)),
    listen<{ id: string; cwd: string }>("terminal://cwd", (e) => h.cwd(e.payload)),
    listen<{ id: string; title: string }>("terminal://title", (e) => h.title?.(e.payload)),
  ]);
  return () => un.forEach((f) => f());
}
