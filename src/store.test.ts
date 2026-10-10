import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ipc", () => ({
  hasForegroundProcess: vi.fn(async () => false),
  scrollbackDelete: vi.fn(async () => {}),
  layoutSave: vi.fn(async () => {}),
}));
vi.mock("./session", () => ({
  create: vi.fn(),
  dispose: vi.fn(),
  notifyExit: vi.fn(),
}));

import * as ipc from "./ipc";
import * as session from "./session";
import { MAX_SPLIT, buildLayout, flatOrder, useStore, visiblePanes } from "./store";
import { useSettings } from "./settings";

const reset = () =>
  useStore.setState({
    terminals: {}, groups: {}, items: [], activeId: null, loaded: false, shell: undefined, lastCwd: undefined,
    switcherOpen: false, searchOpen: false, confirm: null, splitOn: false, splitIds: [], activity: {},
  });
const st = () => useStore.getState();

beforeEach(() => {
  reset();
  vi.clearAllMocks();
  localStorage.clear();
  useSettings.setState({ sidebarMode: "pinned" });
});

describe("init", () => {
  it("creates empty state without a layout", () => {
    st().init(null);
    expect(st().loaded).toBe(true);
    expect(st().items).toEqual([]);
    expect(st().activeId).toBeNull();
  });

  it("restores pinned terminals and groups, activating the first", () => {
    st().init({
      version: 1,
      shell: "/bin/zsh",
      items: [
        { kind: "terminal", terminal: { id: "a", name: "A", cwd: "/x" } },
        { kind: "group", id: "g", name: "G", cwd: "/g", shell: "/bin/sh", terminals: [{ id: "b", name: "B", renamed: true }] },
      ],
    });
    expect(st().items).toEqual([{ kind: "terminal", id: "a" }, { kind: "group", id: "g" }]);
    expect(st().terminals.a).toMatchObject({ pinned: true, groupId: null, cwd: "/x" });
    expect(st().terminals.b).toMatchObject({ pinned: true, groupId: "g", cwd: "/g", userRenamed: true });
    expect(st().groups.g.terminalIds).toEqual(["b"]);
    expect(st().activeId).toBe("a");
    expect(session.create).toHaveBeenCalledWith("b", "/g", "/bin/sh", false);
    expect(session.create).toHaveBeenCalledWith("a", "/x", "/bin/zsh", false);
  });
});

describe("add / close", () => {
  it("adds a loose terminal and activates it", () => {
    const id = st().addTerminal(null);
    expect(st().items).toEqual([{ kind: "terminal", id }]);
    expect(st().activeId).toBe(id);
    expect(st().terminals[id]).toMatchObject({ name: "Terminal", pinned: false, groupId: null });
  });

  it("adds a terminal into a group using the group's cwd and expands it", () => {
    const g = st().addGroup();
    st().setGroupCwd(g, " /work ");
    st().toggleCollapse(g);
    const id = st().addTerminal(g);
    expect(st().groups[g].terminalIds).toEqual([id]);
    expect(st().groups[g].collapsed).toBe(false);
    expect(st().terminals[id]).toMatchObject({ groupId: g, cwd: "/work", name: "work" });
    expect(st().items).toEqual([{ kind: "group", id: g }]);
  });

  it("new loose terminals inherit the last reported cwd", () => {
    const a = st().addTerminal(null);
    st().onCwd(a, "/last/dir");
    const b = st().addTerminal(null);
    expect(st().terminals[b].cwd).toBe("/last/dir");
  });

  it("closing activates the next terminal, else previous, else null", async () => {
    const a = st().addTerminal(null);
    const b = st().addTerminal(null);
    const c = st().addTerminal(null);
    st().setActive(b);
    await st().closeTerminal(b);
    expect(st().activeId).toBe(c);
    await st().closeTerminal(c);
    expect(st().activeId).toBe(a);
    await st().closeTerminal(a);
    expect(st().activeId).toBeNull();
    expect(session.dispose).toHaveBeenCalledTimes(3);
  });

  it("closing a grouped terminal keeps the group", async () => {
    const g = st().addGroup();
    const t = st().addTerminal(g);
    await st().closeTerminal(t);
    expect(st().groups[g].terminalIds).toEqual([]);
    expect(st().items).toEqual([{ kind: "group", id: g }]);
  });

  it("asks before closing a busy terminal and respects 'no'", async () => {
    vi.mocked(ipc.hasForegroundProcess).mockResolvedValueOnce(true);
    const t = st().addTerminal(null);
    const p = st().closeTerminal(t);
    await vi.waitFor(() => expect(st().confirm).not.toBeNull());
    st().resolveConfirm(false);
    await p;
    expect(st().terminals[t]).toBeDefined();
    expect(st().confirm).toBeNull();
  });

  it("closes a busy terminal on 'yes'", async () => {
    vi.mocked(ipc.hasForegroundProcess).mockResolvedValueOnce(true);
    const t = st().addTerminal(null);
    const p = st().closeTerminal(t);
    await vi.waitFor(() => expect(st().confirm).not.toBeNull());
    st().resolveConfirm(true);
    await p;
    expect(st().terminals[t]).toBeUndefined();
  });

  it("does not ask for exited terminals", async () => {
    const t = st().addTerminal(null);
    st().onExit(t, 0);
    await st().closeTerminal(t);
    expect(ipc.hasForegroundProcess).not.toHaveBeenCalled();
    expect(st().terminals[t]).toBeUndefined();
  });

  it("deletes scrollback when closing a pinned terminal", async () => {
    const t = st().addTerminal(null);
    st().togglePin(t);
    await st().closeTerminal(t);
    expect(ipc.scrollbackDelete).toHaveBeenCalledWith(t);
  });
});

describe("groups", () => {
  it("deleting a group moves terminals out in place after confirmation", async () => {
    const x = st().addTerminal(null);
    const g = st().addGroup();
    const a = st().addTerminal(g);
    const b = st().addTerminal(g);
    const p = st().deleteGroup(g);
    await vi.waitFor(() => expect(st().confirm).not.toBeNull());
    st().resolveConfirm(true);
    await p;
    expect(st().groups[g]).toBeUndefined();
    expect(st().items.map((i) => i.id)).toEqual([x, a, b]);
    expect(st().terminals[a].groupId).toBeNull();
  });

  it("cancelling group delete changes nothing", async () => {
    const g = st().addGroup();
    st().addTerminal(g);
    const p = st().deleteGroup(g);
    await vi.waitFor(() => expect(st().confirm).not.toBeNull());
    st().resolveConfirm(false);
    await p;
    expect(st().groups[g]).toBeDefined();
  });

  it("deletes an empty group without asking", async () => {
    const g = st().addGroup();
    await st().deleteGroup(g);
    expect(st().groups[g]).toBeUndefined();
    expect(st().items).toEqual([]);
  });

  it("renames groups, ignoring blank names", () => {
    const g = st().addGroup();
    st().renameGroup(g, "  Work ");
    expect(st().groups[g].name).toBe("Work");
    st().renameGroup(g, "   ");
    expect(st().groups[g].name).toBe("Work");
  });

  it("clears a group cwd when set blank", () => {
    const g = st().addGroup();
    st().setGroupCwd(g, "/a");
    st().setGroupCwd(g, " ");
    expect(st().groups[g].cwd).toBeUndefined();
  });

  it("toggles collapse", () => {
    const g = st().addGroup();
    st().toggleCollapse(g);
    expect(st().groups[g].collapsed).toBe(true);
    st().toggleCollapse(g);
    expect(st().groups[g].collapsed).toBe(false);
  });
});

describe("terminal state", () => {
  it("renames and resets to cwd basename when blank", () => {
    const t = st().addTerminal(null);
    st().onCwd(t, "/a/proj");
    expect(st().terminals[t].name).toBe("proj");
    st().renameTerminal(t, " Mine ");
    expect(st().terminals[t]).toMatchObject({ name: "Mine", userRenamed: true });
    st().onCwd(t, "/a/other");
    expect(st().terminals[t].name).toBe("Mine");
    st().renameTerminal(t, "");
    expect(st().terminals[t]).toMatchObject({ name: "other", userRenamed: false });
  });

  it("blank rename without cwd falls back to 'Terminal'", () => {
    const t = st().addTerminal(null);
    st().renameTerminal(t, "x");
    st().renameTerminal(t, "");
    expect(st().terminals[t].name).toBe("Terminal");
  });

  it("toggles pin and deletes scrollback when unpinning", () => {
    const t = st().addTerminal(null);
    st().togglePin(t);
    expect(st().terminals[t].pinned).toBe(true);
    expect(ipc.scrollbackDelete).not.toHaveBeenCalled();
    st().togglePin(t);
    expect(st().terminals[t].pinned).toBe(false);
    expect(ipc.scrollbackDelete).toHaveBeenCalledWith(t);
  });

  it("marks exit and notifies the session", () => {
    const t = st().addTerminal(null);
    st().onExit(t, 3);
    expect(st().terminals[t].exited).toBe(true);
    expect(session.notifyExit).toHaveBeenCalledWith(t, 3);
  });

  it("ignores events for unknown terminals", () => {
    st().onCwd("nope", "/x");
    st().onExit("nope", 1);
    st().onOutput("nope");
    st().renameTerminal("nope", "x");
    st().togglePin("nope");
    expect(st().terminals).toEqual({});
    expect(st().lastCwd).toBeUndefined();
  });
});

describe("activity", () => {
  it("flags output on background terminals and clears when activated", () => {
    const a = st().addTerminal(null);
    const b = st().addTerminal(null);
    st().onOutput(a);
    expect(st().activity[a]).toBe("output");
    st().onOutput(b); // active
    expect(st().activity[b]).toBeUndefined();
    st().setActive(a);
    expect(st().activity[a]).toBe("idle");
  });

  it("does not flag terminals visible in the split", () => {
    const a = st().addTerminal(null);
    const b = st().addTerminal(null);
    st().setActive(a);
    st().toggleSplit();
    expect(st().splitIds).toContain(b);
    st().onOutput(b);
    expect(st().activity[b]).toBeUndefined();
  });
});

describe("moveTerminal", () => {
  it("moves a terminal out of a group to the end of the root list (single group case)", () => {
    const g = st().addGroup();
    const t = st().addTerminal(g);
    st().moveTerminal(t, null);
    expect(st().items).toEqual([{ kind: "group", id: g }, { kind: "terminal", id: t }]);
    expect(st().groups[g].terminalIds).toEqual([]);
    expect(st().terminals[t].groupId).toBeNull();
  });

  it("moves into a group at a position", () => {
    const g = st().addGroup();
    const a = st().addTerminal(g);
    const b = st().addTerminal(g);
    const x = st().addTerminal(null);
    st().moveTerminal(x, g, b);
    expect(st().groups[g].terminalIds).toEqual([a, x, b]);
    expect(st().items).toEqual([{ kind: "group", id: g }]);
    expect(st().terminals[x].groupId).toBe(g);
  });

  it("reorders within the root list", () => {
    const a = st().addTerminal(null);
    const b = st().addTerminal(null);
    const c = st().addTerminal(null);
    st().moveTerminal(c, null, a);
    expect(st().items.map((i) => i.id)).toEqual([c, a, b]);
  });

  it("is a no-op for itself or unknown ids", () => {
    const a = st().addTerminal(null);
    st().moveTerminal(a, null, a);
    st().moveTerminal("nope", null);
    expect(st().items).toEqual([{ kind: "terminal", id: a }]);
  });

  it("never touches the session", () => {
    const g = st().addGroup();
    const t = st().addTerminal(g);
    vi.clearAllMocks();
    st().moveTerminal(t, null);
    expect(session.create).not.toHaveBeenCalled();
    expect(session.dispose).not.toHaveBeenCalled();
  });
});

describe("moveGroup", () => {
  it("reorders items", () => {
    const g1 = st().addGroup();
    const g2 = st().addGroup();
    const t = st().addTerminal(null);
    st().moveGroup(t, g1);
    expect(st().items.map((i) => i.id)).toEqual([t, g1, g2]);
    st().moveGroup(g1, g2);
    expect(st().items.map((i) => i.id)).toEqual([t, g2, g1]);
  });
  it("ignores unknown targets", () => {
    const g = st().addGroup();
    st().moveGroup(g, "nope");
    expect(st().items).toEqual([{ kind: "group", id: g }]);
  });
});

describe("split view", () => {
  const three = () => [st().addTerminal(null), st().addTerminal(null), st().addTerminal(null)];

  it("visiblePanes", () => {
    expect(visiblePanes({ activeId: null, splitOn: true, splitIds: ["a"] })).toEqual([]);
    expect(visiblePanes({ activeId: "a", splitOn: false, splitIds: ["a", "b"] })).toEqual(["a"]);
    expect(visiblePanes({ activeId: "a", splitOn: true, splitIds: ["a", "b"] })).toEqual(["a", "b"]);
    expect(visiblePanes({ activeId: "c", splitOn: true, splitIds: ["a", "b"] })).toEqual(["c"]);
  });

  it("toggleSplit pairs the active terminal with a neighbour and toggles off", () => {
    const [a, b] = three();
    st().setActive(a);
    st().toggleSplit();
    expect(st().splitOn).toBe(true);
    expect(st().splitIds).toEqual([a, b]);
    st().toggleSplit();
    expect(st().splitOn).toBe(false);
  });

  it("toggleSplit does nothing without an active terminal", () => {
    st().toggleSplit();
    expect(st().splitOn).toBe(false);
  });

  it("adds and removes members, capped at MAX_SPLIT", () => {
    const ids = Array.from({ length: MAX_SPLIT + 1 }, () => st().addTerminal(null));
    st().setActive(ids[0]);
    ids.slice(1, MAX_SPLIT).forEach((id) => st().toggleSplitMember(id));
    expect(st().splitIds).toHaveLength(MAX_SPLIT);
    st().toggleSplitMember(ids[MAX_SPLIT]);
    expect(st().splitIds).toHaveLength(MAX_SPLIT);
    st().toggleSplitMember(ids[1]);
    expect(st().splitIds).not.toContain(ids[1]);
  });

  it("removing the focused pane moves focus; the last pane cannot be removed", () => {
    const [a, b] = three();
    st().setActive(a);
    st().toggleSplit();
    st().toggleSplitMember(a);
    expect(st().activeId).toBe(b);
    st().toggleSplitMember(b);
    expect(st().splitIds).toEqual([b]);
  });

  it("mergeSplit shows two terminals side by side", () => {
    const [a, b, c] = three();
    st().setActive(a);
    st().mergeSplit(a, c);
    expect(st().splitOn).toBe(true);
    expect(new Set(st().splitIds)).toEqual(new Set([a, c]));
    st().mergeSplit(b, c);
    expect(st().splitIds).toContain(b);
    st().mergeSplit(a, a);
    st().mergeSplit("nope", a);
  });

  it("mergeSplit onto a terminal outside the visible split makes a fresh pair", () => {
    const [a, b, c] = three();
    st().setActive(a);
    st().mergeSplit(a, b);
    expect(new Set(st().splitIds)).toEqual(new Set([a, b]));
    st().mergeSplit(b, c);
    expect(new Set(st().splitIds)).toEqual(new Set([b, c]));
  });

  it("reorderSplit moves a pane to another's position", () => {
    const [a, b, c] = three();
    st().setActive(a);
    useStore.setState({ splitOn: true, splitIds: [a, b, c] });
    st().reorderSplit(c, a);
    expect(st().splitIds).toEqual([c, a, b]);
    st().reorderSplit(c, c);
    st().reorderSplit("nope", a);
    expect(st().splitIds).toEqual([c, a, b]);
  });

  it("closing a split member shrinks the split and turns it off when alone", async () => {
    const [a, b] = three();
    st().setActive(a);
    st().toggleSplit();
    await st().closeTerminal(b);
    expect(st().splitIds).toEqual([a]);
    expect(st().splitOn).toBe(false);
  });
});

describe("misc", () => {
  it("toggles sidebar mode via settings", () => {
    st().toggleSidebarMode();
    expect(useSettings.getState().sidebarMode).toBe("autohide");
    st().toggleSidebarMode();
    expect(useSettings.getState().sidebarMode).toBe("pinned");
  });

  it("switcher and search flags", () => {
    st().setSwitcher(true);
    st().setSearch(true);
    expect(st().switcherOpen && st().searchOpen).toBe(true);
  });

  it("flatOrder lists loose terminals and group members in sidebar order", () => {
    const x = st().addTerminal(null);
    const g = st().addGroup();
    const a = st().addTerminal(g);
    const y = st().addTerminal(null);
    expect(flatOrder(st())).toEqual([x, a, y]);
  });
});

describe("buildLayout", () => {
  it("persists only pinned terminals, keeps empty groups and groups with pinned members", () => {
    const loose = st().addTerminal(null);
    const unpinned = st().addTerminal(null);
    const gPinned = st().addGroup();
    const gEmpty = st().addGroup();
    const gNone = st().addGroup();
    const p = st().addTerminal(gPinned);
    st().addTerminal(gNone);
    st().togglePin(loose);
    st().togglePin(p);
    st().renameTerminal(p, "Named");
    st().setGroupCwd(gPinned, "/g");
    useStore.setState({ shell: "/bin/sh" });

    const layout = buildLayout(useStore.getState() as never);
    expect(layout.version).toBe(1);
    expect(layout.shell).toBe("/bin/sh");
    expect(layout.items).toEqual([
      { kind: "terminal", terminal: { id: loose, name: "Terminal" } },
      { kind: "group", id: gPinned, name: "New group", cwd: "/g", terminals: [{ id: p, name: "Named", renamed: true }] },
      { kind: "group", id: gEmpty, name: "New group", terminals: [] },
    ]);
    expect(layout.items.some((i) => i.kind === "terminal" && i.terminal.id === unpinned)).toBe(false);
  });
});
