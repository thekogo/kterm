import { describe, expect, it } from "vitest";
import { basename } from "./path";

describe("basename", () => {
  it("handles posix paths", () => expect(basename("/home/u/proj")).toBe("proj"));
  it("handles windows paths", () => expect(basename("C:\\Users\\u\\proj")).toBe("proj"));
  it("ignores trailing separators", () => {
    expect(basename("/home/u/proj/")).toBe("proj");
    expect(basename("C:\\a\\b\\\\")).toBe("b");
  });
  it("returns root for root", () => expect(basename("/")).toBe("/"));
  it("returns empty for empty", () => expect(basename("")).toBe("/"));
  it("returns a bare name unchanged", () => expect(basename("proj")).toBe("proj"));
});
