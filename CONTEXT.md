# kterm

A terminal manager whose sidebar organises terminals into groups, in the style of the Arc browser.

## Language

**Terminal**:
A single shell session shown in the main area and listed in the sidebar.
_Avoid_: Tab, session, pane

**Group**:
A named collection of Terminals in the sidebar that shares a working directory.
_Avoid_: Folder, workspace, space

**Group working directory**:
The optional directory a new Terminal starts in when it is created inside a Group. A Group without one behaves like a Loose terminal. Changing it never affects existing Terminals, and moving a Terminal between Groups never changes its shell.
_Avoid_: Group cwd, default path

**Loose terminal**:
A Terminal that belongs to no Group and starts in the user's home directory or the last-used directory.
_Avoid_: Ungrouped terminal, root terminal

**Pinned terminal**:
A Terminal that is kept in the sidebar and restored (layout and working directory, not the live process) when the app restarts.
_Avoid_: Saved terminal, favourite

**Ephemeral terminal**:
A Terminal that is discarded when the app closes.
_Avoid_: Temporary terminal, scratch terminal
