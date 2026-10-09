import { useEffect, useRef } from "react";

export function InlineEdit(p: { value: string; placeholder?: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) p.onCommit(ref.current!.value);
    else p.onCancel();
  };
  return (
    <input
      ref={ref}
      className="inline-edit"
      defaultValue={p.value}
      placeholder={p.placeholder}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        else if (e.key === "Escape") finish(false);
        e.stopPropagation();
      }}
      onBlur={() => finish(true)}
    />
  );
}
