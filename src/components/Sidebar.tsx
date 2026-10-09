import {
  DndContext,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useStore } from "../store";
import { GroupItem } from "./GroupItem";
import { TerminalRow } from "./TerminalRow";
import { newHint, switcherHint } from "../shortcuts";

const collision: CollisionDetection = (args) => {
  const { terminals, groups } = useStore.getState();
  const activeIsGroup = !!groups[args.active.id as string];
  if (activeIsGroup) {
    // Only top-level slots: groups and loose terminals.
    const containers = args.droppableContainers.filter((c) => !terminals[c.id as string]?.groupId);
    return closestCenter({ ...args, droppableContainers: containers });
  }
  const hits = pointerWithin(args);
  const termHits = hits.filter((h) => terminals[h.id as string]);
  if (termHits.length) return termHits;
  if (hits.length) return hits;
  return closestCenter(args);
};

function onDragEnd({ active, over }: DragEndEvent) {
  if (!over || active.id === over.id) return;
  const s = useStore.getState();
  const a = active.id as string;
  const o = over.id as string;
  if (s.terminals[a]) {
    if (s.terminals[o]) s.moveTerminal(a, s.terminals[o].groupId, o);
    else if (s.groups[o]) s.moveTerminal(a, o);
  } else if (s.groups[a]) {
    const target = s.terminals[o]?.groupId ?? o; // dropped over a grouped terminal -> its group's slot
    s.moveGroup(a, target);
  }
}

export function Sidebar() {
  const items = useStore((s) => s.items);
  const { addTerminal, addGroup, setSwitcher } = useStore.getState();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <button className="switch" onClick={() => setSwitcher(true)}>
          Search terminals <kbd>{switcherHint}</kbd>
        </button>
      </div>
      <div className="sidebar-list">
        <DndContext sensors={sensors} collisionDetection={collision} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((it) =>
              it.kind === "group" ? <GroupItem key={it.id} id={it.id} /> : <TerminalRow key={it.id} id={it.id} />,
            )}
          </SortableContext>
        </DndContext>
      </div>
      <div className="sidebar-foot">
        <button onClick={() => addTerminal(null)} title={newHint}>
          + New terminal
        </button>
        <button onClick={() => addGroup()}>+ Group</button>
      </div>
    </aside>
  );
}
