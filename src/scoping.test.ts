import { describe, expect, test } from "bun:test";
import { normalizeDir, ownsSession } from "./index.js";

describe("location scoping", () => {
  test("matches identical directories", () => {
    expect(ownsSession("D:\\Code\\orca", "D:\\Code\\orca")).toBe(true);
  });

  test("is case- and slash-insensitive (Windows)", () => {
    expect(ownsSession("D:\\Code\\orca", "d:/code/orca/")).toBe(true);
  });

  test("rejects other locations", () => {
    expect(ownsSession("D:\\Code\\orca", "C:\\Users\\utkar")).toBe(false);
  });

  test("allows unknown session directory (defensive)", () => {
    expect(ownsSession("D:\\Code\\orca", undefined)).toBe(true);
  });

  test("normalizeDir", () => {
    expect(normalizeDir("D:\\Code\\orca\\")).toBe("d:/code/orca");
  });
});
