import { useEffect, useState } from "react";
import { create } from "zustand";
import * as ipc from "../ipc";
import * as session from "../session";
import { useStore } from "../store";
import { useSettings } from "../settings";
import { THEMES } from "../themes";
import { ACTIONS, binding, eventCombo, formatCombo, setCapturing, type AnyAction } from "../shortcuts";
import "./settings.css";

const useUi = create<{ open: boolean }>(() => ({ open: false }));
export const openSettings = () => useUi.setState({ open: true });
export const toggleSettings = () => useUi.setState((s) => ({ open: !s.open }));

function ThemeSection() {
  const theme = useSettings((s) => s.theme);
  const set = useSettings((s) => s.set);
  return (
    <section>
      <h3>Theme</h3>
      <div className="seg">
        {THEMES.map((t) => (
          <button key={t.id} className={theme === t.id ? "on" : ""} onClick={() => set({ theme: t.id })}>
            {t.name}
          </button>
        ))}
      </div>
    </section>
  );
}

function FontSection() {
  const [size, setSize] = useState(session.getFontSize());
  const change = (n: number) => {
    session.setFontSize(n);
    setSize(session.getFontSize());
  };
  return (
    <section>
      <h3>Font size</h3>
      <div className="seg">
        <button onClick={() => change(size - 1)}>-</button>
        <span className="val">{size}px</span>
        <button onClick={() => change(size + 1)}>+</button>
        <button onClick={() => change(session.DEFAULT_FONT_SIZE)}>Reset</button>
      </div>
    </section>
  );
}

const FONT_PRESETS = ["JetBrains Mono", "Fira Code", "Cascadia Code", "Source Code Pro", "Menlo", "Consolas", "monospace"];

function FontFamilySection() {
  const fontFamily = useSettings((s) => s.fontFamily);
  const set = useSettings((s) => s.set);
  return (
    <section>
      <h3>Font family</h3>
      <input
        list="font-presets"
        value={fontFamily}
        placeholder="System default"
        spellCheck={false}
        onChange={(e) => set({ fontFamily: e.target.value })}
      />
      <datalist id="font-presets">
        {FONT_PRESETS.map((f) => (
          <option key={f} value={`"${f}", monospace`} />
        ))}
      </datalist>
      <button className="link" disabled={!fontFamily} onClick={() => set({ fontFamily: "" })}>
        Reset
      </button>
      <p className="note">Any installed font, as a CSS font-family list. Falls back to monospace if missing.</p>
    </section>
  );
}

function ShortcutRow({ id, label }: { id: AnyAction; label: string }) {
  const overrides = useSettings((s) => s.shortcuts);
  const set = useSettings((s) => s.set);
  const [rec, setRec] = useState(false);
  const custom = !!overrides[id];

  useEffect(() => {
    if (!rec) return;
    setCapturing(true);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setRec(false);
      const combo = eventCombo(e);
      if (!combo || combo.split("+").length < 2) return; // need a modifier
      set({ shortcuts: { ...useSettings.getState().shortcuts, [id]: combo } });
      setRec(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      setCapturing(false);
    };
  }, [rec, id, set]);

  const reset = () => {
    const { [id]: _, ...rest } = useSettings.getState().shortcuts;
    set({ shortcuts: rest });
  };
  return (
    <div className="srow">
      <span>{label}</span>
      <button className={"keycap" + (rec ? " rec" : "")} onClick={() => setRec(!rec)}>
        {rec ? "Press keys... (Esc cancels)" : formatCombo(binding(id, overrides))}
      </button>
      <button className="link" disabled={!custom} onClick={reset}>
        Reset
      </button>
    </div>
  );
}

function ShortcutsSection() {
  return (
    <section>
      <h3>Shortcuts</h3>
      {ACTIONS.map((a) => (
        <ShortcutRow key={a.id} id={a.id} label={a.label} />
      ))}
      <button className="link" onClick={() => useSettings.getState().set({ shortcuts: {} })}>
        Reset all
      </button>
    </section>
  );
}

function ShellSection() {
  const shell = useStore((s) => s.shell);
  const [shells, setShells] = useState<ipc.ShellInfo[]>([]);
  useEffect(() => {
    void ipc.listShells().then(setShells).catch(() => setShells([]));
  }, []);
  return (
    <section>
      <h3>Default shell</h3>
      <select value={shell ?? ""} onChange={(e) => useStore.setState({ shell: e.target.value || undefined })}>
        <option value="">System default</option>
        {shell && !shells.some((s) => s.path === shell) && <option value={shell}>{shell}</option>}
        {shells.map((s) => (
          <option key={s.id} value={s.path}>
            {s.name}
          </option>
        ))}
      </select>
      <p className="note">Applies to new terminals; running ones are unchanged. Groups may override it.</p>
    </section>
  );
}

function BehaviourSection() {
  const { restoreScrollback, sidebarMode, set } = useSettings();
  return (
    <section>
      <h3>Behaviour</h3>
      <label className="check">
        <input type="checkbox" checked={restoreScrollback} onChange={(e) => set({ restoreScrollback: e.target.checked })} />
        Restore scrollback of pinned terminals
      </label>
      <p className="note">Scrollback is saved to disk and may contain secrets such as tokens or passwords.</p>
      <label className="check">
        <input
          type="checkbox"
          checked={sidebarMode === "autohide"}
          onChange={(e) => set({ sidebarMode: e.target.checked ? "autohide" : "pinned" })}
        />
        Auto-hide sidebar
      </label>
    </section>
  );
}

export function Settings() {
  const open = useUi((s) => s.open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && useUi.setState({ open: false });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={() => useUi.setState({ open: false })}>
      <div className="modal settings" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>Settings</h2>
          <button className="icon" onClick={() => useUi.setState({ open: false })} aria-label="Close">
            ×
          </button>
        </header>
        <div className="settings-body">
          <ThemeSection />
          <FontSection />
          <FontFamilySection />
          <ShellSection />
          <BehaviourSection />
          <ShortcutsSection />
        </div>
      </div>
    </div>
  );
}
