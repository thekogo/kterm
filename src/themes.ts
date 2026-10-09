import type { ITheme } from "@xterm/xterm";

export type ThemeId = "dark" | "light" | "nord";

export const THEMES: { id: ThemeId; name: string; xterm: ITheme }[] = [
  {
    id: "dark",
    name: "Dark",
    xterm: { background: "#14151a", foreground: "#d6d9e0", cursor: "#d6d9e0", selectionBackground: "#3a4160" },
  },
  {
    id: "light",
    name: "Light",
    xterm: {
      background: "#fafafc",
      foreground: "#2b2e3a",
      cursor: "#2b2e3a",
      selectionBackground: "#c7d0f5",
      black: "#2b2e3a",
      white: "#6b7184",
      brightWhite: "#2b2e3a",
      brightBlack: "#8b91a3",
      yellow: "#8a6d00",
      brightYellow: "#9a7b00",
      green: "#2e7d32",
      brightGreen: "#388e3c",
      cyan: "#00838f",
      brightCyan: "#0097a7",
    },
  },
  {
    id: "nord",
    name: "Nord",
    xterm: { background: "#2e3440", foreground: "#d8dee9", cursor: "#d8dee9", selectionBackground: "#434c5e" },
  },
];

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];
