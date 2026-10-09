# Restore layout, not live processes

On restart, kterm restores pinned Terminals by layout and last working directory and starts a fresh shell in each. It does not keep shell processes alive across app restarts the way tmux does. Cross-platform PTYs (`portable-pty`) are tied to the app process, so surviving restarts would need a background daemon on three operating systems; we chose to defer that cost.

## Considered Options

- **Background daemon that owns PTYs and reattaches:** rejected for v1 because of the cross-platform complexity. It can be added later without changing the stored layout format.
