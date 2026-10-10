import type { ReactNode } from "react";
import { create } from "zustand";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useStore } from "../store";
import { TerminalRow } from "./TerminalRow";

export type DropMode = "merge" | "before" | "after";
/** What dropping the dragged terminal on a row would do; drives the row's drop indicator. */
export const useDropHint = create<{ id: string | null; mode: DropMode }>(() => ({ id: null, mode: "before" }));

export const CELL = "cell:";
export const SPLIT_ROW = "split-row:";

function SplitCell({ id }: { id: string }) {
  const t = useStore((s) => s.terminals[id]);
  const active = useStore((s) => s.activeId === id);
  const drag = useDraggable({ id: CELL + id });
  const drop = useDroppable({ id: CELL + id });
  const { attributes, listeners, isDragging } = drag;
  const setNodeRef = (el: HTMLElement | null) => {
    drag.setNodeRef(el);
    drop.setNodeRef(el);
  };
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`split-cell${active ? " active" : ""}${t.exited ? " exited" : ""}`}
      style={{ opacity: isDragging ? 0.5 : 1 }}
      title={t.cwd ?? t.name}
      onClick={() => useStore.getState().setActive(id)}
    >
      <span className="label">{t.name}</span>
      <button
        className="icon"
        title="Remove from split"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          useStore.getState().toggleSplitMember(id);
        }}
      >
        ×
      </button>
    </div>
  );
}

function SplitRow({ scope, panes }: { scope: string; panes: string[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: SPLIT_ROW + scope });
  return (
    <div ref={setNodeRef} className={`split-row${isOver ? " over" : ""}`}>
      {panes.map((id) => (
        <SplitCell key={id} id={id} />
      ))}
    </div>
  );
}

/**
 * Rows of one container (the sidebar root or a group). Terminals of the active split that live in this
 * container are shown as one side-by-side row at the position of the first of them, so grouped
 * terminals stay in their group.
 */
export function RowList({ ids, scope, renderOther }: { ids: string[]; scope: string; renderOther?: (id: string) => ReactNode }) {
  const splitOn = useStore((s) => s.splitOn);
  // The split's own members, not what's on screen: viewing a terminal outside the split must not un-merge its row.
  const panesKey = useStore((s) => s.splitIds.join(","));
  const terminals = useStore((s) => s.terminals);
  const panes = splitOn ? panesKey.split(",") : [];
  const members = panes.filter((p) => terminals[p] && ids.includes(p));
  const grouped = members.length >= 1 && panes.length >= 2; // a lone member still shows as a split cell
  const first = ids.find((i) => members.includes(i));
  return (
    <>
      {ids.map((id) => {
        if (!terminals[id]) return renderOther ? renderOther(id) : null;
        if (!grouped || !members.includes(id)) return <TerminalRow key={id} id={id} />;
        return id === first ? <SplitRow key={"split:" + id} scope={scope} panes={members} /> : null;
      })}
    </>
  );
}
