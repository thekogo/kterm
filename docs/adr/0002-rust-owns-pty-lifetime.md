# Rust owns the PTY for a Terminal's whole life

The Rust side owns each Terminal's PTY from creation until the user closes it. React only attaches xterm.js views to it, so switching Terminals never kills a running process. Each Terminal keeps its own hidden xterm.js instance (scrollback capped at about 10k lines) instead of replaying a Rust-side buffer into one shared view, which is simpler and costs a little memory per Terminal.
