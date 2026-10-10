import {
  DndContext,
  useDroppable,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type Modifier,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useStore, visiblePanes } from "../store";
import { GroupItem } from "./GroupItem";
import { CELL, SPLIT_ROW, RowList, useDropHint, type DropMode } from "./RowList";
import { useHint } from "../shortcuts";
import { openSettings } from "./Settings";

const ROOT_END = "root-end";

/** Empty space below the list: dropping a terminal here moves it out of its group. */
function RootDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_END });
  return <div ref={setNodeRef} className={`root-drop${isOver ? " over" : ""}`} />;
}

const collision: CollisionDetection = (args) => {
  const { terminals, groups } = useStore.getState();
  if (String(args.active.id).startsWith(CELL)) {
    const hits = pointerWithin(args);
    const cells = hits.filter((h) => String(h.id).startsWith(CELL));
    return cells.length ? cells : hits;
  }
  const activeIsGroup = !!groups[args.active.id as string];
  if (activeIsGroup) {
    // Only top-level slots: groups and loose terminals.
    const containers = args.droppableContainers.filter((c) => c.id !== ROOT_END && !terminals[c.id as string]?.groupId);
    return closestCenter({ ...args, droppableContainers: containers });
  }
  const hits = pointerWithin(args);
  const termHits = hits.filter((h) => terminals[h.id as string]);
  if (termHits.length) return termHits;
  if (hits.length) return hits;
  return closestCenter(args);
};

/** Middle of a row merges into a split; its top/bottom quarters keep reordering. */
function dropMode(ev: Event, delta: { y: number }, rect: { top: number; height: number }): DropMode {
  if (!("clientY" in ev)) return "before";
  const y = ((ev as PointerEvent).clientY + delta.y - rect.top) / rect.height;
  return y < 0.25 ? "before" : y > 0.75 ? "after" : "merge";
}

/** Sidebar rows slide only up/down while dragged; split cells keep free horizontal movement. */
const verticalOnly: Modifier = ({ transform, active }) =>
  String(active?.id).startsWith(CELL) ? transform : { ...transform, x: 0 };

const clearHint = () => useDropHint.setState({ id: null });

function onDragMove({ active, over, activatorEvent, delta }: DragMoveEvent) {
  const { terminals, groups, items } = useStore.getState();
  const a = String(active.id);
  if (groups[a]) {
    // Group reorder: the bar goes on the side the group will land (below when moving down).
    const slot = (id: string) => items.findIndex((i) => i.id === (terminals[id]?.groupId ?? id));
    const to = over ? slot(over.id as string) : -1;
    const from = slot(a);
    if (!over || to < 0 || to === from) return clearHint();
    const id = items[to].id;
    const mode = to > from ? "after" : "before";
    const h = useDropHint.getState();
    if (h.id !== id || h.mode !== mode) useDropHint.setState({ id, mode });
    return;
  }
  if (!over || over.id === active.id || !terminals[a] || !terminals[over.id as string]) return clearHint();
  const id = over.id as string;
  const mode = dropMode(activatorEvent, delta, over.rect);
  const h = useDropHint.getState();
  if (h.id !== id || h.mode !== mode) useDropHint.setState({ id, mode });
}

function onDragEnd({ active, over, activatorEvent, delta }: DragEndEvent) {
  clearHint();
  const s = useStore.getState();
  const a = active.id as string;
  if (a.startsWith(CELL)) {
    const o = over?.id as string | undefined;
    if (o === a || o?.startsWith(SPLIT_ROW)) return;
    // Onto another cell: reorder. Anywhere else: unsplit.
    if (o?.startsWith(CELL)) s.reorderSplit(a.slice(CELL.length), o.slice(CELL.length));
    else s.toggleSplitMember(a.slice(CELL.length));
    return;
  }
  if (!over || active.id === over.id) return;
  const o = over.id as string;
  if (o === ROOT_END) {
    if (s.terminals[a]) s.moveTerminal(a, null);
    else if (s.groups[a]) s.moveGroup(a, s.items[s.items.length - 1].id);
    return;
  }
  if (o.startsWith(SPLIT_ROW) || o.startsWith(CELL)) {
    // Dropped a terminal onto the split row: merge it into the split.
    if (s.terminals[a] && !visiblePanes(s).includes(a)) s.toggleSplitMember(a);
    return;
  }
  if (s.terminals[a]) {
    if (s.terminals[o] && dropMode(activatorEvent, delta, over.rect) === "merge") s.mergeSplit(a, o);
    else if (s.terminals[o]) s.moveTerminal(a, s.terminals[o].groupId, o);
    else if (s.groups[o]) s.moveTerminal(a, o);
  } else if (s.groups[a]) {
    const target = s.terminals[o]?.groupId ?? o; // dropped over a grouped terminal -> its group's slot
    s.moveGroup(a, target);
  }
}

export function Sidebar() {
  const items = useStore((s) => s.items);
  const { addTerminal, addGroup, setSwitcher } = useStore.getState();
  const switcherHint = useHint("switcher");
  const newHint = useHint("new");
  const settingsHint = useHint("settings");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <button className="switch" onClick={() => setSwitcher(true)}>
          Search terminals <kbd>{switcherHint}</kbd>
        </button>
      </div>
      <div className="sidebar-list">
        <DndContext sensors={sensors} collisionDetection={collision} modifiers={[verticalOnly]} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={clearHint}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <RowList scope="root" ids={items.map((i) => i.id)} renderOther={(id) => <GroupItem key={id} id={id} />} />
          </SortableContext>
          <RootDropZone />
        </DndContext>
      </div>
      <div className="sidebar-foot">
        <button onClick={() => addTerminal(null)} title={newHint} aria-label="New terminal">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><path d="M4.5 6l2 2-2 2M8 10h3" /></svg>
        </button>
        <button onClick={() => addGroup()} title="New group" aria-label="New group">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 4.5a1 1 0 011-1H6l1.5 1.5h6a1 1 0 011 1v6a1 1 0 01-1 1h-11a1 1 0 01-1-1z" /><path d="M8 7.5v3M6.5 9h3" /></svg>
        </button>
        <button onClick={() => useStore.getState().toggleSidebarMode()} title="Toggle auto-hide sidebar" aria-label="Toggle auto-hide sidebar">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 2.5v11M13 8H5.5M8.5 5l-3 3 3 3" /></svg>
        </button>
        <button onClick={openSettings} title={`Settings (${settingsHint})`} aria-label="Settings">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M13.04 6.71L14.71 6.89L14.71 9.11L13.04 9.29L12.48 10.65L13.53 11.96L11.96 13.53L10.65 12.48L9.29 13.04L9.11 14.71L6.89 14.71L6.71 13.04L5.35 12.48L4.04 13.53L2.47 11.96L3.52 10.65L2.96 9.29L1.29 9.11L1.29 6.89L2.96 6.71L3.52 5.35L2.47 4.04L4.04 2.47L5.35 3.52L6.71 2.96L6.89 1.29L9.11 1.29L9.29 2.96L10.65 3.52L11.96 2.47L13.53 4.04L12.48 5.35Z" /><circle cx="8" cy="8" r="2" /></svg>
        </button>
      </div>
    </aside>
  );
}
