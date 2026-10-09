import { useEffect } from "react";
import * as ipc from "./ipc";
import * as session from "./session";
import { useStore } from "./store";
import { startPersistence } from "./persistence";
import { matchShortcut } from "./shortcuts";
import { Sidebar } from "./components/Sidebar";
import { MainArea } from "./components/MainArea";
import { Switcher } from "./components/Switcher";
import { ConfirmDialog } from "./components/ConfirmDialog";
import "./App.css";

let initStarted = false;

export default function App() {
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const stopSave = startPersistence();

    void ipc
      .listenAll({
        output: ({ id, data }) => session.write(id, data),
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
      const a = matchShortcut(e);
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      const s = useStore.getState();
      if (a === "switcher") s.setSwitcher(!s.switcherOpen);
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

  return (
    <div className="app">
      <Sidebar />
      <MainArea />
      <Switcher />
      <ConfirmDialog />
    </div>
  );
}
