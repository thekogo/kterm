import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import * as session from "../session";

/** Find-in-terminal bar for the active Terminal. Remounted per Terminal via `key`. */
export function SearchBar({ id }: { id: string }) {
  const open = useStore((s) => s.searchOpen);
  const [q, setQ] = useState("");
  const [cs, setCs] = useState(false);
  const [res, setRes] = useState({ index: -1, count: 0 });
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      input.current?.focus();
      input.current?.select();
    }
  }, [open]);

  useEffect(() => {
    const d = session.onSearchResults(id, (index, count) => setRes({ index, count }));
    return () => d?.dispose();
  }, [id]);

  if (!open) return null;

  const close = () => {
    session.clearSearch(id);
    setRes({ index: -1, count: 0 });
    useStore.getState().setSearch(false);
    session.focus(id);
  };

  return (
    <div className="searchbar" onKeyDown={(e) => e.stopPropagation()}>
      <input
        ref={input}
        value={q}
        placeholder="Find"
        onChange={(e) => {
          setQ(e.target.value);
          if (!e.target.value) setRes({ index: -1, count: 0 });
          session.findNext(id, e.target.value, cs, true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          else if (e.key === "Enter") e.shiftKey ? session.findPrevious(id, q, cs) : session.findNext(id, q, cs);
        }}
      />
      {q && (
        <span className="search-count">{res.count ? `${res.index < 0 ? "?" : res.index + 1}/${res.count}` : "0/0"}</span>
      )}
      <button className={`icon${cs ? " on" : ""}`} title="Match case" onClick={() => { setCs(!cs); session.findNext(id, q, !cs, true); }}>Aa</button>
      <button className="icon" title="Previous (Shift+Enter)" onClick={() => session.findPrevious(id, q, cs)}>↑</button>
      <button className="icon" title="Next (Enter)" onClick={() => session.findNext(id, q, cs)}>↓</button>
      <button className="icon" title="Close (Esc)" onClick={close}>×</button>
    </div>
  );
}
