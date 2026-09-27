import { describe, expect, test } from "bun:test";
import { buildSlackPayload, formatElapsed } from "./slack.js";

describe("slack", () => {
  test("elapsed formatting", () => {
    expect(formatElapsed(45_000)).toBe("45s");
    expect(formatElapsed(125_000)).toBe("2m 5s");
    expect(formatElapsed(undefined)).toBeUndefined();
  });

  test("payload has text + blocks", () => {
    const p = buildSlackPayload("permission", "OpenCode needs permission", "edit — /tmp/a", {
      sessionID: "abcdef123456",
      directory: "/repo",
    });
    expect(p.text).toContain("OpenCode needs permission");
    expect(JSON.stringify(p)).toContain("abcdef12");
  });
});
