export function basename(p: string): string {
  const t = p.replace(/[\\/]+$/, "");
  if (!t) return p || "/";
  const i = Math.max(t.lastIndexOf("/"), t.lastIndexOf("\\"));
  return i >= 0 ? t.slice(i + 1) || t : t;
}
