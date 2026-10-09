import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { useStore } from "../store";
import { InlineEdit } from "./InlineEdit";

export function TerminalRow({ id }: { id: string }) {
  const t = useStore((s) => s.terminals[id]);
  const active = useStore((s) => s.activeId === id);
  const { setActive, renameTerminal, togglePin, closeTerminal } = useStore.getState();
  const [editing, setEditing] = useState(false);
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id });
  if (!t) return null;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`row term-row${active ? " active" : ""}${t.exited ? " exited" : ""}`}
      style={{
        transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined,
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      onClick={() => setActive(id)}
      onDoubleClick={() => setEditing(true)}
    >
      {editing ? (
        <InlineEdit
          value={t.name}
          onCommit={(v) => {
            renameTerminal(id, v);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <span className="label" title={t.cwd ?? t.name}>
          {t.name}
        </span>
      )}
      <button
        className={`icon pin${t.pinned ? " on" : ""}`}
        title={t.pinned ? "Unpin (will be discarded on exit)" : "Pin (restore on restart)"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          togglePin(id);
        }}
      >
        {t.pinned ? "◆" : "◇"}
      </button>
      <button
        className="icon close"
        title="Close terminal"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          void closeTerminal(id);
        }}
      >
        ×
      </button>
    </div>
  );
}
