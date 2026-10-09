import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import { TerminalView } from "./TerminalView";
import { newHint } from "../shortcuts";

export function MainArea() {
  const ids = useStore(useShallow((s) => Object.keys(s.terminals)));
  const activeId = useStore((s) => s.activeId);
  return (
    <main className="main">
      {ids.map((id) => (
        <TerminalView key={id} id={id} />
      ))}
      {!activeId && (
        <div className="empty">
          <button onClick={() => useStore.getState().addTerminal(null)}>New terminal</button>
          <p>{newHint}</p>
        </div>
      )}
    </main>
  );
}
