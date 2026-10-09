import { useShallow } from "zustand/react/shallow";
import { useStore, visiblePanes } from "../store";
import { TerminalView } from "./TerminalView";
import { SearchBar } from "./SearchBar";
import "../layout.css";
import { useHint } from "../shortcuts";

export function MainArea() {
  const newHintText = useHint("new");
  const ids = useStore(useShallow((s) => Object.keys(s.terminals)));
  const activeId = useStore((s) => s.activeId);
  const panes = useStore(useShallow(visiblePanes));
  return (
    <main className="main">
      {ids.map((id) => (
        <TerminalView key={id} id={id} slot={panes.includes(id) ? { index: panes.indexOf(id), count: panes.length } : null} />
      ))}
      {activeId && <SearchBar key={activeId} id={activeId} />}
      {!activeId && (
        <div className="empty">
          <button onClick={() => useStore.getState().addTerminal(null)}>New terminal</button>
          <p>{newHintText}</p>
        </div>
      )}
    </main>
  );
}
