import { useEffect } from "react";
import * as ipc from "./ipc";
import * as session from "./session";
import { useStore } from "./store";
import { startPersistence } from "./persistence";
import { matchAction } from "./shortcuts";
import { SidebarHost } from "./components/SidebarHost";
import { MainArea } from "./components/MainArea";
import { Switcher } from "./components/Switcher";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Settings, toggleSettings } from "./components/Settings";
import { useSettings } from "./settings";
import { themeById } from "./themes";
import "./App.css";
import "./theme.css";

let initStarted = false;

export default function App() {
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const stopSave = startPersistence();

    void ipc
      .listenAll({
        output: ({ id, data }) => {
          session.write(id, data);
          useStore.getState().onOutput(id);
        },
        exit: ({ id, code }) => useStore.getState().onExit(id, code),
        cwd: ({ id, cwd }) => useStore.getState().onCwd(id, cwd),
      })
      .then((u) => (cancelled ? u() : (unlisten = u)));

    if (!initStarted) {
      initStarted = true;
      void ipc
        .layoutLoad()
        .catch(() => null)
        .then((layout) => useStore.getState().init(layout));
    }

    const onKey = (e: KeyboardEvent) => {
      const a = matchAction(e);
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      const s = useStore.getState() as ReturnType<typeof useStore.getState> & {
        toggleSidebarMode?: () => void;
        toggleSplit?: () => void;
      };
      if (a === "zoomIn") session.zoom("in");
      else if (a === "zoomOut") session.zoom("out");
      else if (a === "zoomReset") session.zoom("reset");
      else if (a === "toggleSidebar") s.toggleSidebarMode?.();
      else if (a === "toggleSplit") s.toggleSplit?.();
      else if (a === "settings") toggleSettings();
      else if (a === "find") {
        if (s.activeId) s.setSearch(true);
      } else if (a === "switcher") s.setSwitcher(!s.switcherOpen);
      else if (a === "new") s.addTerminal(s.activeId ? (s.terminals[s.activeId]?.groupId ?? null) : null);
      else if (s.activeId) void s.closeTerminal(s.activeId);
    };
    window.addEventListener("keydown", onKey, true);

    return () => {
      cancelled = true;
      unlisten?.();
      stopSave();
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    session.applyTheme(themeById(theme).xterm);
  }, [theme]);

  return (
    <div className="app">
      <SidebarHost />
      <MainArea />
      <Switcher />
      <ConfirmDialog />
      <Settings />
    </div>
  );
}
