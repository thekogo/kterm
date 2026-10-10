import { useState } from "react";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useStore } from "../store";
import { InlineEdit } from "./InlineEdit";
import { useDropHint } from "./RowList";
import { RowList } from "./RowList";

export function GroupItem({ id }: { id: string }) {
  const g = useStore((s) => s.groups[id]);
  const { renameGroup, setGroupCwd, toggleCollapse, addTerminal, deleteGroup } = useStore.getState();
  const dropMode = useDropHint((h) => (h.id === id ? h.mode : null));
  const [editing, setEditing] = useState<"name" | "cwd" | null>(null);
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, isDragging } = useSortable({ id });
  if (!g) return null;

  return (
    <div
      ref={setNodeRef}
      className={`group${dropMode ? ` drop-${dropMode}` : ""}`}
      style={{
        // Only the dragged row follows the pointer; the others stay put and a drop indicator shows the target.
        transform: isDragging && transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <div className="row group-head" ref={setActivatorNodeRef} {...attributes} {...listeners}>
        <button className="icon" onPointerDown={(e) => e.stopPropagation()} onClick={() => toggleCollapse(id)}>
          {g.collapsed ? "▸" : "▾"}
        </button>
        {editing === "name" ? (
          <InlineEdit value={g.name} onCommit={(v) => (renameGroup(id, v), setEditing(null))} onCancel={() => setEditing(null)} />
        ) : (
          <span className="label" onDoubleClick={() => setEditing("name")} title={g.cwd ?? "No working directory"}>
            {g.name}
          </span>
        )}
        <button className="icon" title="Set group working directory" onPointerDown={(e) => e.stopPropagation()} onClick={() => setEditing("cwd")}>
          ⌂
        </button>
        <button className="icon" title="New terminal in group" onPointerDown={(e) => e.stopPropagation()} onClick={() => addTerminal(id)}>
          +
        </button>
        <button className="icon close" title="Delete group" onPointerDown={(e) => e.stopPropagation()} onClick={() => void deleteGroup(id)}>
          ×
        </button>
      </div>
      {editing === "cwd" && (
        <div className="row sub">
          <InlineEdit
            value={g.cwd ?? ""}
            placeholder="Working directory (empty = none)"
            onCommit={(v) => (setGroupCwd(id, v), setEditing(null))}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}
      {editing !== "cwd" && g.cwd && !g.collapsed && <div className="cwd-hint">{g.cwd}</div>}
      {!g.collapsed && (
        <div className="group-body">
          <SortableContext items={g.terminalIds} strategy={verticalListSortingStrategy}>
            <RowList scope={id} ids={g.terminalIds} />
          </SortableContext>
        </div>
      )}
    </div>
  );
}
