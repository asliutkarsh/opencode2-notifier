import { describe, expect, test } from "bun:test";
import { parseOptions } from "./config.js";

describe("parseOptions", () => {
  test("resolves {env:VAR} webhook", () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/test";
    const opts = parseOptions({ slackWebhookUrl: "{env:SLACK_WEBHOOK_URL}" });
    expect(opts.slackWebhookUrl).toBe("https://hooks.slack.com/test");
    expect(opts.events).toContain("error");
  });

  test("falls back to env when option missing", () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/env";
    const opts = parseOptions({});
    expect(opts.slackWebhookUrl).toBe("https://hooks.slack.com/env");
  });

  test("throws without webhook", () => {
    delete process.env.SLACK_WEBHOOK_URL;
    delete process.env.OPCODE2_NOTIFIER_SLACK_WEBHOOK_URL;
    delete process.env.DISCORD_WEBHOOK_URL;
    delete process.env.OPCODE2_NOTIFIER_DISCORD_WEBHOOK_URL;
    expect(() => parseOptions({})).toThrow(/missing webhook/);
  });

  test("filters unknown events", () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/test";
    const opts = parseOptions({ events: ["error", "bogus", "permission"] });
    expect(opts.events).toEqual(["error", "permission"]);
  });

  test("accepts discord-only config", () => {
    delete process.env.SLACK_WEBHOOK_URL;
    delete process.env.OPCODE2_NOTIFIER_SLACK_WEBHOOK_URL;
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/123/abc";
    const opts = parseOptions({});
    expect(opts.discordWebhookUrl).toBe("https://discord.com/api/webhooks/123/abc");
    expect(opts.slackWebhookUrl).toBeUndefined();
  });

  test("accepts both sinks", () => {
    const opts = parseOptions({
      slackWebhookUrl: "https://hooks.slack.com/test",
      discordWebhookUrl: "{env:DISCORD_WEBHOOK_URL}",
    });
    expect(opts.slackWebhookUrl).toContain("hooks.slack.com");
    expect(opts.discordWebhookUrl).toBe("https://discord.com/api/webhooks/123/abc");
  });
});
