# kterm

A terminal manager whose sidebar organises terminals into groups, in the style of the Arc browser. Built with [Tauri 2](https://tauri.app), React and [xterm.js](https://xtermjs.org).

## Features

- **Groups** – organise terminals in the sidebar; a group can have a working directory that new terminals start in.
- **Pinned terminals** – kept in the sidebar and restored (layout and working directory) on restart; optionally restore scrollback too. Unpinned terminals are discarded on exit.
- **Split view** – show several terminals side by side. Drag a terminal onto another in the sidebar to merge them, or Ctrl/Cmd+click a row to add or remove it.
- **Drag and drop** – reorder terminals and groups, move terminals between groups.
- **Terminal switcher** – fuzzy-jump to any terminal by name.
- **Find in terminal** – with a `current/total` match counter and match-case toggle.
- **Customisation** – themes, font family, terminal padding, zoom, auto-hiding sidebar and rebindable keyboard shortcuts.

## Default shortcuts

On macOS the modifier is `Cmd`; elsewhere it is `Ctrl+Shift`. All are rebindable in Settings.

| Action | Shortcut |
| --- | --- |
| Search terminals | `Mod+K` |
| New terminal | `Mod+T` |
| Close terminal | `Mod+W` |
| Find in terminal | `Mod+F` |
| Toggle sidebar | `Mod+B` |
| Toggle split view | `Mod+\` |
| Zoom in / out / reset | `Mod+=` / `Mod+-` / `Mod+0` |
| Settings | `Mod+,` |
| Go to terminal 1–9 | `Alt+1` … `Alt+9` |

## Development

Requirements: Node.js, [pnpm](https://pnpm.io), a stable Rust toolchain and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```sh
pnpm install
pnpm tauri dev     # run the desktop app with hot reload
pnpm test          # run unit tests (vitest)
pnpm tauri build   # produce installers
```

On Windows, `scripts/fetch-conpty.ps1` fetches the modern ConPTY bundled for mouse input support.

## Project layout

- `src/` – React frontend (`store.ts` app state, `session.ts` xterm/PTY sessions, `components/`).
- `src-tauri/` – Rust backend that spawns shells and streams PTY output.
- `CONTEXT.md` – domain glossary (Terminal, Group, Pinned terminal, …).
- `docs/` – IPC contract and architecture decision records.
