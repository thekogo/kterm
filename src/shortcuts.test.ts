import { beforeEach, describe, expect, it } from "vitest";
import { ACTIONS, binding, eventCombo, formatCombo, matchAction, matchShortcut, matchZoom, setCapturing } from "./shortcuts";
import { useSettings } from "./settings";

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);

beforeEach(() => {
  useSettings.setState({ shortcuts: {} });
  setCapturing(false);
});

describe("eventCombo", () => {
  it("returns null for bare modifiers", () => {
    expect(eventCombo(key({ key: "Control", ctrlKey: true }))).toBeNull();
    expect(eventCombo(key({ key: "Shift", shiftKey: true }))).toBeNull();
  });
  it("orders modifiers ctrl, alt, shift, meta", () => {
    const e = key({ key: "K", code: "KeyK", ctrlKey: true, altKey: true, shiftKey: true, metaKey: true });
    expect(eventCombo(e)).toBe("ctrl+alt+shift+meta+k");
  });
  it("maps punctuation codes to names", () => {
    expect(eventCombo(key({ key: "\\", code: "Backslash", ctrlKey: true }))).toBe("ctrl+backslash");
    expect(eventCombo(key({ key: "+", code: "NumpadAdd", ctrlKey: true }))).toBe("ctrl+equal");
  });
  it("uses the digit for Digit codes even with shift", () => {
    expect(eventCombo(key({ key: "!", code: "Digit1", altKey: true }))).toBe("alt+1");
  });
  it("can ignore shift", () => {
    const e = key({ key: "+", code: "Equal", ctrlKey: true, shiftKey: true });
    expect(eventCombo(e, true)).toBe("ctrl+equal");
  });
});

describe("binding / matchAction", () => {
  it("uses defaults and every action has a unique default", () => {
    const defs = ACTIONS.map((a) => a.def);
    expect(new Set(defs).size).toBe(defs.length);
    expect(binding("new")).toBe("ctrl+shift+t");
  });
  it("matches default shortcuts", () => {
    expect(matchShortcut(key({ key: "T", code: "KeyT", ctrlKey: true, shiftKey: true }))).toBe("new");
    expect(matchShortcut(key({ key: "2", code: "Digit2", altKey: true }))).toBe("goto2");
  });
  it("does not match unrelated keys", () => {
    expect(matchAction(key({ key: "a", code: "KeyA" }))).toBeNull();
  });
  it("honours overrides", () => {
    useSettings.setState({ shortcuts: { new: "ctrl+alt+n" } });
    expect(matchShortcut(key({ key: "n", code: "KeyN", ctrlKey: true, altKey: true }))).toBe("new");
    expect(matchShortcut(key({ key: "T", code: "KeyT", ctrlKey: true, shiftKey: true }))).toBeNull();
  });
  it("is silent while capturing and for non-keydown events", () => {
    setCapturing(true);
    expect(matchAction(key({ key: "T", code: "KeyT", ctrlKey: true, shiftKey: true }))).toBeNull();
    setCapturing(false);
    expect(matchAction(new KeyboardEvent("keyup", { key: "T", code: "KeyT", ctrlKey: true, shiftKey: true }))).toBeNull();
  });
});

describe("zoom", () => {
  it("maps zoom actions and excludes them from matchShortcut", () => {
    const e = key({ key: "+", code: "Equal", ctrlKey: true, shiftKey: true });
    expect(matchZoom(e)).toBe("in");
    expect(matchShortcut(e)).toBeNull();
    expect(matchZoom(key({ key: "_", code: "Minus", ctrlKey: true, shiftKey: true }))).toBe("out");
    expect(matchZoom(key({ key: ")", code: "Digit0", ctrlKey: true, shiftKey: true }))).toBe("reset");
  });
  it("tolerates a missing shift on zoom bindings", () => {
    useSettings.setState({ shortcuts: { zoomIn: "ctrl+equal" } });
    expect(matchZoom(key({ key: "+", code: "Equal", ctrlKey: true, shiftKey: true }))).toBe("in");
  });
});

describe("formatCombo", () => {
  it("formats readable labels", () => {
    expect(formatCombo("ctrl+shift+k")).toBe("Ctrl+Shift+K");
    expect(formatCombo("ctrl+shift+backslash")).toBe("Ctrl+Shift+\\");
    expect(formatCombo("alt+1")).toBe("Alt+1");
    expect(formatCombo("meta+comma")).toBe("Win+,");
    expect(formatCombo("ctrl+f5")).toBe("Ctrl+F5");
  });
});
