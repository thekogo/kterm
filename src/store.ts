import { create } from "zustand";
import * as ipc from "./ipc";
import * as session from "./session";
import { basename } from "./path";
import { useSettings } from "./settings";

export type Term = {
  id: string;
  name: string;
  userRenamed: boolean;
  cwd?: string;
  pinned: boolean;
  groupId: string | null;
  exited: boolean;
};
export type Group = { id: string; name: string; cwd?: string; shell?: string; collapsed: boolean; terminalIds: string[] };
export type Activity = "idle" | "output" | "running";
export const MAX_SPLIT = 4;
export type Item = { kind: "terminal" | "group"; id: string };

type State = {
  terminals: Record<string, Term>;
  groups: Record<string, Group>;
  items: Item[];
  activeId: string | null;
  loaded: boolean;
  shell?: string;
  lastCwd?: string;
  switcherOpen: boolean;
  searchOpen: boolean;
  confirm: { message: string; resolve: (ok: boolean) => void } | null;
  /** Split view on/off and the terminals shown side by side (max MAX_SPLIT). The active terminal is always shown. */
  splitOn: boolean;
  splitIds: string[];
  activity: Record<string, Activity>;

  toggleSplit: () => void;
  toggleSplitMember: (id: string) => void;
  /** Show `a` and `b` side by side (joining the current split if `b` is already in it). */
  mergeSplit: (a: string, b: string) => void;
  /** Move split pane `a` to the position of `b`. */
  reorderSplit: (a: string, b: string) => void;
  onOutput: (id: string) => void;
  toggleSidebarMode: () => void;
  init: (layout: ipc.Layout | null) => void;
  addTerminal: (groupId: string | null) => string;
  addGroup: () => string;
  closeTerminal: (id: string) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  setActive: (id: string | null) => void;
  renameTerminal: (id: string, name: string) => void;
  renameGroup: (id: string, name: string) => void;
  setGroupCwd: (id: string, cwd: string) => void;
  togglePin: (id: string) => void;
  toggleCollapse: (id: string) => void;
  onCwd: (id: string, cwd: string) => void;
  onExit: (id: string, code: number | null) => void;
  moveTerminal: (id: string, groupId: string | null, overTerminalId?: string) => void;
  moveGroup: (id: string, overItemId: string) => void;
  setSwitcher: (open: boolean) => void;
  setSearch: (open: boolean) => void;
  ask: (message: string) => Promise<boolean>;
  resolveConfirm: (ok: boolean) => void;
};

const uid = () => crypto.randomUUID();

export function flatOrder(s: Pick<State, "items" | "groups">): string[] {
  return s.items.flatMap((it) => (it.kind === "terminal" ? [it.id] : (s.groups[it.id]?.terminalIds ?? [])));
}

/** Terminals currently shown in the main area, left to right. */
export function visiblePanes(s: Pick<State, "splitOn" | "splitIds" | "activeId">): string[] {
  if (!s.activeId) return [];
  if (!s.splitOn) return [s.activeId];
  // A terminal outside the split is shown alone; clicking a member brings the split back.
  return s.splitIds.includes(s.activeId) ? s.splitIds : [s.activeId];
}

export const useStore = create<State>((set, get) => {
  const newTerm = (id: string, groupId: string | null, p: Partial<Term>): Term => ({
    id,
    name: p.name ?? (p.cwd ? basename(p.cwd) : "Terminal"),
    userRenamed: p.userRenamed ?? false,
    cwd: p.cwd,
    pinned: p.pinned ?? false,
    groupId,
    exited: false,
  });

  const removeTerminal = (id: string) => {
    const s = get();
    const t = s.terminals[id];
    if (!t) return;
    const order = flatOrder(s);
    const idx = order.indexOf(id);
    session.dispose(id);
    const terminals = { ...s.terminals };
    delete terminals[id];
    let groups = s.groups;
    let items = s.items;
    if (t.groupId && groups[t.groupId]) {
      const g = groups[t.groupId];
      groups = { ...groups, [g.id]: { ...g, terminalIds: g.terminalIds.filter((x) => x !== id) } };
    } else {
      items = items.filter((it) => it.id !== id);
    }
    const activeId =
      s.activeId === id ? (order[idx + 1] ?? order[idx - 1] ?? null) : s.activeId;
    if (t.pinned) void ipc.scrollbackDelete(id).catch(() => {});
    const activity = { ...s.activity };
    delete activity[id];
    const splitIds = s.splitIds.filter((x) => x !== id);
    set({ terminals, groups, items, activeId, activity, splitIds, splitOn: s.splitOn && (splitIds.length > 1 || (splitIds.length === 1 && splitIds[0] !== activeId)) });
  };

  return {
    terminals: {},
    groups: {},
    items: [],
    activeId: null,
    loaded: false,
    switcherOpen: false,
    searchOpen: false,
    confirm: null,
    splitOn: false,
    splitIds: [],
    activity: {},

    init: (layout) => {
      const terminals: Record<string, Term> = {};
      const groups: Record<string, Group> = {};
      const items: Item[] = [];
      const restore = (pt: ipc.PinnedTerminal, g: ipc.SidebarItem & { kind: "group" } | null) => {
        const cwd = pt.cwd ?? g?.cwd;
        const userRenamed = pt.renamed ?? false;
        terminals[pt.id] = newTerm(pt.id, g?.id ?? null, { name: pt.name, cwd, userRenamed, pinned: true });
        session.create(pt.id, cwd, g?.shell ?? layout?.shell, useSettings.getState().restoreScrollback);
      };
      for (const it of layout?.items ?? []) {
        if (it.kind === "terminal") {
          restore(it.terminal, null);
          items.push({ kind: "terminal", id: it.terminal.id });
        } else {
          groups[it.id] = { id: it.id, name: it.name, cwd: it.cwd, shell: it.shell, collapsed: false, terminalIds: it.terminals.map((t) => t.id) };
          it.terminals.forEach((t) => restore(t, it));
          items.push({ kind: "group", id: it.id });
        }
      }
      set({ terminals, groups, items, shell: layout?.shell, loaded: true, activeId: flatOrder({ items, groups })[0] ?? null });
    },

    addTerminal: (groupId) => {
      const s = get();
      const g = groupId ? s.groups[groupId] : null;
      const cwd = g ? g.cwd : s.lastCwd;
      const id = uid();
      session.create(id, cwd, g?.shell ?? s.shell);
      const t = newTerm(id, g?.id ?? null, { cwd });
      set({
        terminals: { ...s.terminals, [id]: t },
        groups: g ? { ...s.groups, [g.id]: { ...g, collapsed: false, terminalIds: [...g.terminalIds, id] } } : s.groups,
        items: g ? s.items : [...s.items, { kind: "terminal", id }],
        activeId: id,
      });
      return id;
    },

    addGroup: () => {
      const id = uid();
      const s = get();
      set({
        groups: { ...s.groups, [id]: { id, name: "New group", collapsed: false, terminalIds: [] } },
        items: [...s.items, { kind: "group", id }],
      });
      return id;
    },

    closeTerminal: async (id) => {
      const t = get().terminals[id];
      if (!t) return;
      if (!t.exited) {
        const busy = await ipc.hasForegroundProcess(id).catch(() => false);
        if (busy && !(await get().ask(`"${t.name}" is still running a process. Close it anyway?`))) return;
      }
      removeTerminal(id);
    },

    deleteGroup: async (id) => {
      const s = get();
      const g = s.groups[id];
      if (!g) return;
      if (g.terminalIds.length > 0) {
        const msg = `Delete group "${g.name}"? Its ${g.terminalIds.length} terminal(s) will move out as loose terminals.`;
        if (!(await get().ask(msg))) return;
      }
      const cur = get();
      const members = cur.groups[id]?.terminalIds ?? [];
      const terminals = { ...cur.terminals };
      members.forEach((tid) => {
        if (terminals[tid]) terminals[tid] = { ...terminals[tid], groupId: null };
      });
      const groups = { ...cur.groups };
      delete groups[id];
      const items: Item[] = [];
      for (const it of cur.items) {
        if (it.id === id) members.forEach((tid) => items.push({ kind: "terminal", id: tid }));
        else items.push(it);
      }
      set({ terminals, groups, items });
    },

    setActive: (id) => {
      const s = get();
      const a = id && s.activity[id] && s.activity[id] !== "idle" ? { ...s.activity, [id]: "idle" as const } : s.activity;
      set({ activeId: id, activity: a });
    },

    toggleSplit: () => {
      const s = get();
      if (s.splitOn) return set({ splitOn: false });
      if (!s.activeId) return;
      const order = flatOrder(s);
      const i = order.indexOf(s.activeId);
      const other = order[i + 1] ?? order[i - 1];
      const keep = s.splitIds.filter((x) => s.terminals[x]);
      const ids = keep.includes(s.activeId) ? keep : [s.activeId, ...keep].slice(0, MAX_SPLIT);
      if (ids.length < 2 && other) ids.push(other);
      set({ splitOn: true, splitIds: ids });
    },

    toggleSplitMember: (id) => {
      const s = get();
      if (!s.terminals[id]) return;
      if (s.splitIds.includes(id)) {
        const rest = s.splitIds.filter((x) => x !== id);
        if (!rest.length) return;
        // Removing the focused pane hands focus to a remaining one so the split stays on screen.
        set({ splitIds: rest, activeId: id === s.activeId ? rest[0] : s.activeId });
      } else {
        const base = visiblePanes(s);
        if (base.length < MAX_SPLIT) set({ splitIds: [...base, id], splitOn: true });
      }
    },

    mergeSplit: (a, b) => {
      const s = get();
      if (!s.terminals[a] || !s.terminals[b] || a === b) return;
      // Dropping onto a member of the visible split joins it; dropping onto anything else starts a fresh pair.
      const vis = s.splitOn ? visiblePanes(s) : [];
      const base = vis.includes(b) ? vis : [];
      const ids = [...new Set([...base, b, a])].filter((x) => s.terminals[x]).slice(0, MAX_SPLIT);
      if (!ids.includes(a)) return;
      set({ splitOn: true, splitIds: ids });
    },

    reorderSplit: (a, b) => {
      const s = get();
      const ids = (s.splitOn ? s.splitIds : visiblePanes(s)).slice();
      const from = ids.indexOf(a);
      const to = ids.indexOf(b);
      if (from < 0 || to < 0 || from === to) return;
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      set({ splitIds: ids });
    },

    onOutput: (id) => {
      const s = get();
      if (id === s.activeId || s.activity[id] === "output" || !s.terminals[id]) return;
      if (s.splitOn && s.splitIds.includes(id)) return; // already visible
      set({ activity: { ...s.activity, [id]: "output" } });
    },

    toggleSidebarMode: () => {
      const { sidebarMode, set: setSetting } = useSettings.getState();
      setSetting({ sidebarMode: sidebarMode === "pinned" ? "autohide" : "pinned" });
    },

    renameTerminal: (id, name) => {
      const t = get().terminals[id];
      if (!t) return;
      const n = name.trim();
      const next = n
        ? { ...t, name: n, userRenamed: true }
        : { ...t, userRenamed: false, name: t.cwd ? basename(t.cwd) : "Terminal" };
      set({ terminals: { ...get().terminals, [id]: next } });
    },

    renameGroup: (id, name) => {
      const g = get().groups[id];
      if (g && name.trim()) set({ groups: { ...get().groups, [id]: { ...g, name: name.trim() } } });
    },

    // Only affects terminals created afterwards; existing shells are untouched.
    setGroupCwd: (id, cwd) => {
      const g = get().groups[id];
      if (g) set({ groups: { ...get().groups, [id]: { ...g, cwd: cwd.trim() || undefined } } });
    },

    togglePin: (id) => {
      const t = get().terminals[id];
      if (!t) return;
      if (t.pinned) void ipc.scrollbackDelete(id).catch(() => {});
      set({ terminals: { ...get().terminals, [id]: { ...t, pinned: !t.pinned } } });
    },

    toggleCollapse: (id) => {
      const g = get().groups[id];
      if (g) set({ groups: { ...get().groups, [id]: { ...g, collapsed: !g.collapsed } } });
    },

    onCwd: (id, cwd) => {
      const t = get().terminals[id];
      if (!t) return;
      set({
        lastCwd: cwd,
        terminals: { ...get().terminals, [id]: { ...t, cwd, name: t.userRenamed ? t.name : basename(cwd) } },
      });
    },

    onExit: (id, code) => {
      const t = get().terminals[id];
      if (!t) return;
      session.notifyExit(id, code);
      set({ terminals: { ...get().terminals, [id]: { ...t, exited: true } } });
    },

    // Pure sidebar bookkeeping: never touches the shell.
    moveTerminal: (id, groupId, overId) => {
      const s = get();
      const t = s.terminals[id];
      if (!t || id === overId) return;
      const listOf = (gid: string | null): string[] =>
        gid ? (s.groups[gid]?.terminalIds ?? []) : s.items.map((i) => i.id);
      const target = listOf(groupId);
      const overIdx = overId ? target.indexOf(overId) : -1;
      const insertAt = overIdx >= 0 ? overIdx : Infinity;

      let items = s.items;
      let groups = { ...s.groups };
      // remove from source
      if (t.groupId) {
        const g = groups[t.groupId];
        groups[g.id] = { ...g, terminalIds: g.terminalIds.filter((x) => x !== id) };
      } else {
        items = items.filter((i) => i.id !== id);
      }
      // insert into target
      if (groupId) {
        const g = groups[groupId];
        const ids = [...g.terminalIds];
        ids.splice(Math.min(insertAt, ids.length), 0, id);
        groups[groupId] = { ...g, terminalIds: ids };
      } else {
        items = [...items];
        items.splice(Math.min(insertAt, items.length), 0, { kind: "terminal", id });
      }
      set({ items, groups, terminals: { ...s.terminals, [id]: { ...t, groupId } } });
    },

    moveGroup: (id, overId) => {
      const items = [...get().items];
      const from = items.findIndex((i) => i.id === id);
      const to = items.findIndex((i) => i.id === overId);
      if (from < 0 || to < 0 || from === to) return;
      const [it] = items.splice(from, 1);
      items.splice(to, 0, it);
      set({ items });
    },

    setSwitcher: (open) => set({ switcherOpen: open }),
    setSearch: (open) => set({ searchOpen: open }),
    ask: (message) => new Promise<boolean>((resolve) => set({ confirm: { message, resolve } })),
    resolveConfirm: (ok) => {
      get().confirm?.resolve(ok);
      set({ confirm: null });
    },
  };
});

/** Build the persisted layout: pinned terminals only; groups kept if they have pinned terminals or are empty. */
export function buildLayout(s: State): ipc.Layout {
  const pt = (id: string): ipc.PinnedTerminal => {
    const t = s.terminals[id];
    return { id, name: t.name, ...(t.cwd ? { cwd: t.cwd } : {}), ...(t.userRenamed ? { renamed: true } : {}) };
  };
  const items: ipc.SidebarItem[] = [];
  for (const it of s.items) {
    if (it.kind === "terminal") {
      if (s.terminals[it.id]?.pinned) items.push({ kind: "terminal", terminal: pt(it.id) });
    } else {
      const g = s.groups[it.id];
      if (!g) continue;
      const pinned = g.terminalIds.filter((id) => s.terminals[id]?.pinned);
      if (pinned.length > 0 || g.terminalIds.length === 0) {
        items.push({
          kind: "group",
          id: g.id,
          name: g.name,
          ...(g.cwd ? { cwd: g.cwd } : {}),
          ...(g.shell ? { shell: g.shell } : {}),
          terminals: pinned.map(pt),
        });
      }
    }
  }
  return { version: 1, ...(s.shell ? { shell: s.shell } : {}), items };
}
