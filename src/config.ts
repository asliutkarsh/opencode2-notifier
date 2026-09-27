export type NotifyKind = "complete" | "error" | "permission" | "question";

export interface NotifierOptions {
  slackWebhookUrl?: string;
  discordWebhookUrl?: string;
  events: NotifyKind[];
  debounceMs: number;
  notifyChildSessions: boolean;
}

const DEFAULT_EVENTS: NotifyKind[] = ["complete", "error", "permission", "question"];
const VALID_KINDS = new Set<string>(DEFAULT_EVENTS);

function resolveEnvShorthand(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const m = /^\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(trimmed);
  if (m) return process.env[m[1]];
  return value;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function isWebhook(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\/.+/.test(value);
}

export function parseOptions(raw: unknown): NotifierOptions {
  const input = (raw ?? {}) as Record<string, unknown>;
  const resolved: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) resolved[k] = resolveEnvShorthand(v);

  const slack =
    (resolved.slackWebhookUrl as string | undefined) ??
    process.env.SLACK_WEBHOOK_URL ??
    process.env.OPCODE2_NOTIFIER_SLACK_WEBHOOK_URL;
  const discord =
    (resolved.discordWebhookUrl as string | undefined) ??
    process.env.DISCORD_WEBHOOK_URL ??
    process.env.OPCODE2_NOTIFIER_DISCORD_WEBHOOK_URL;
  const slackUrl = isWebhook(slack) ? slack : undefined;
  const discordUrl = isWebhook(discord) ? discord : undefined;
  if (!slackUrl && !discordUrl) {
    throw new Error(
      'opencode2-notifier: missing webhook. Set plugins[{package:"opencode2-notifier",options:{slackWebhookUrl:"{env:SLACK_WEBHOOK_URL}",discordWebhookUrl:"{env:DISCORD_WEBHOOK_URL}"}}] or SLACK_WEBHOOK_URL / DISCORD_WEBHOOK_URL env.',
    );
  }

  let events: NotifyKind[] = DEFAULT_EVENTS;
  if (resolved.events !== undefined) {
    const list = Array.isArray(resolved.events) ? resolved.events : [resolved.events];
    const cleaned = list
      .map((e) => String(e).toLowerCase().trim())
      .filter((e) => VALID_KINDS.has(e)) as NotifyKind[];
    if (cleaned.length > 0) events = [...new Set(cleaned)];
  }

  return {
    slackWebhookUrl: slackUrl,
    discordWebhookUrl: discordUrl,
    events,
    debounceMs: toPositiveInt(resolved.debounceMs, 10_000),
    notifyChildSessions: resolved.notifyChildSessions === true,
  };
}
