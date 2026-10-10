import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe("settings", () => {
  it("has defaults", async () => {
    const { useSettings, DEFAULT_PADDING } = await import("./settings");
    const s = useSettings.getState();
    expect(s.theme).toBe("dark");
    expect(s.sidebarMode).toBe("pinned");
    expect(s.restoreScrollback).toBe(false);
    expect(s.shortcuts).toEqual({});
    expect(s.padding).toEqual(DEFAULT_PADDING);
  });

  it("persists changes to localStorage without functions", async () => {
    const { useSettings } = await import("./settings");
    useSettings.getState().set({ fontFamily: "Fira Code", sidebarMode: "autohide" });
    const saved = JSON.parse(localStorage.getItem("kterm.settings")!);
    expect(saved.fontFamily).toBe("Fira Code");
    expect(saved.sidebarMode).toBe("autohide");
    expect(saved.set).toBeUndefined();
  });

  it("loads saved values and fills missing ones with defaults", async () => {
    localStorage.setItem("kterm.settings", JSON.stringify({ fontFamily: "X" }));
    const { useSettings } = await import("./settings");
    expect(useSettings.getState().fontFamily).toBe("X");
    expect(useSettings.getState().theme).toBe("dark");
  });

  it("falls back to defaults on corrupt storage", async () => {
    localStorage.setItem("kterm.settings", "{not json");
    const { useSettings } = await import("./settings");
    expect(useSettings.getState().theme).toBe("dark");
  });
});
