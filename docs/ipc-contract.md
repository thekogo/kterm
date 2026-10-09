# IPC contract (Rust ⇄ React)

Shared by the backend and frontend. Do not change without updating both sides. Terms follow `CONTEXT.md`.

## Commands (frontend → Rust, `invoke`)

| Command | Args | Returns |
|---|---|---|
| `terminal_create` | `{ id: string, cwd?: string, shell?: string, cols: number, rows: number }` | `void` (the frontend generates `id`, a uuid) |
| `terminal_write` | `{ id, data: string }` | `void` |
| `terminal_resize` | `{ id, cols, rows }` | `void` |
| `terminal_close` | `{ id }` | `void` (kills the PTY) |
| `terminal_has_foreground_process` | `{ id }` | `boolean` (true if a non-shell process is in the foreground; best-effort on Windows) |
| `layout_load` | none | `Layout \| null` |
| `layout_save` | `{ layout: Layout }` | `void` (atomic write: temp file, then rename) |
| `default_shell` | none | `string` |

## Events (Rust → frontend, `listen`)

| Event | Payload |
|---|---|
| `terminal://output` | `{ id: string, data: string }` (UTF-8 text, lossy-decoded at char boundaries) |
| `terminal://exit` | `{ id: string, code: number \| null }` |
| `terminal://cwd` | `{ id: string, cwd: string }` (parsed from OSC 7 in the output stream) |
| `terminal://title` | `{ id: string, title: string }` (from OSC 0/2; optional) |

Rust owns every PTY from `terminal_create` until `terminal_close` or process exit (ADR 0002).
A second app launch focuses the existing window (single instance).

## Layout JSON (`layout.json` in the app-config dir, versioned)

```ts
type Layout = {
  version: 1;
  shell?: string;                 // global shell override
  items: SidebarItem[];           // top-level order: Loose terminals and Groups
};
type SidebarItem =
  | { kind: "terminal"; terminal: PinnedTerminal }
  | { kind: "group"; id: string; name: string; cwd?: string; shell?: string; terminals: PinnedTerminal[] };
type PinnedTerminal = { id: string; name: string; cwd?: string; renamed?: boolean }; // renamed = user chose the name, so auto-naming must not overwrite it 
```

Only pinned terminals are saved. A Group is saved if it has any pinned terminal, or is empty.

## v2 additions

Commands (Rust side):

| Command | Args | Returns |
|---|---|---|
| `list_shells` | none | `{ id: string, name: string, path: string }[]` (detected shells; Windows: PowerShell, pwsh, cmd, WSL distros, Git Bash when present) |
| `scrollback_save` | `{ id: string, data: string }` | `void` (stored in the app-data dir, one file per terminal id; id must be `[A-Za-z0-9-]+`) |
| `scrollback_load` | `{ id }` | `string \| null` |
| `scrollback_delete` | `{ id }` | `void` |

Behaviour changes: shells started by `terminal_create` are made to emit OSC 7 (cwd) on every platform;
`terminal_has_foreground_process` works on Windows (child process of the shell present).

Frontend store API shared between agents (`src/store.ts`):
`toggleSidebarMode()`, `toggleSplit()`, `splitIds: string[]` (terminals shown side by side), `activity: Record<id, "idle"|"output"|"running">`.
Settings live in `src/settings.ts` (`useSettings`).
