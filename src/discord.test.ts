import { describe, expect, test } from "bun:test";
import { buildDiscordPayload } from "./discord.js";

describe("discord", () => {
  test("payload has content + embed with color", () => {
    const p = buildDiscordPayload("error", "OpenCode session error", "provider: boom", {
      sessionID: "abcdef123456",
      directory: "/repo",
    });
    expect(p.content).toContain("OpenCode session error");
    expect(p.embeds).toHaveLength(1);
    expect(p.embeds[0].color).toBe(0xed4245);
    expect(JSON.stringify(p)).toContain("abcdef12");
  });

  test("truncates long detail", () => {
    const p = buildDiscordPayload("question", "OpenCode needs input", "x".repeat(5000), {});
    expect((p.embeds[0].description ?? "").length).toBeLessThanOrEqual(2000);
    expect(p.content.length).toBeLessThanOrEqual(2000);
  });
});
