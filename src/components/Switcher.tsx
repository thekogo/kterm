import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";

export function Switcher() {
  const open = useStore((s) => s.switcherOpen);
  const terminals = useStore((s) => s.terminals);
  const groups = useStore((s) => s.groups);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      input.current?.focus();
    }
  }, [open]);

  const list = useMemo(() => {
    const needle = q.toLowerCase();
    return Object.values(terminals)
      .map((t) => ({ t, group: t.groupId ? groups[t.groupId]?.name : undefined }))
      .filter(({ t, group }) => `${t.name} ${t.cwd ?? ""} ${group ?? ""}`.toLowerCase().includes(needle));
  }, [q, terminals, groups]);

  if (!open) return null;
  const close = () => useStore.getState().setSwitcher(false);
  const pick = (id: string) => {
    useStore.getState().setActive(id);
    close();
  };

  return (
    <div className="overlay" onMouseDown={close}>
      <div className="modal switcher" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          value={q}
          placeholder="Switch to terminal..."
          onChange={(e) => (setQ(e.target.value), setSel(0))}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
            else if (e.key === "ArrowDown") (e.preventDefault(), setSel((i) => Math.min(i + 1, list.length - 1)));
            else if (e.key === "ArrowUp") (e.preventDefault(), setSel((i) => Math.max(i - 1, 0)));
            else if (e.key === "Enter" && list[sel]) pick(list[sel].t.id);
          }}
        />
        <div className="results">
          {list.map(({ t, group }, i) => (
            <div key={t.id} className={`result${i === sel ? " sel" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => pick(t.id)}>
              <span>{t.name}</span>
              <span className="meta">{[group, t.cwd].filter(Boolean).join(" · ")}</span>
            </div>
          ))}
          {list.length === 0 && <div className="result meta">No matches</div>}
        </div>
      </div>
    </div>
  );
}
