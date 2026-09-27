import type { NotifyKind } from "./config.js";

export interface SlackContext {
  sessionID?: string;
  directory?: string;
  sessionTitle?: string;
  elapsedMs?: number;
  subagents?: string;
}

const KIND_EMOJI: Record<NotifyKind, string> = {
  complete: "✅",
  error: "❌",
  permission: "🔐",
  question: "❓",
};

export function formatElapsed(ms?: number): string | undefined {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return undefined;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function buildSlackPayload(
  kind: NotifyKind,
  title: string,
  detail: string | undefined,
  ctx: SlackContext,
) {
  const emoji = KIND_EMOJI[kind];
  const heading = `${emoji} ${ctx.sessionTitle ?? title}`;
  const lines: string[] = [];
  if (ctx.sessionID) lines.push(`*ID:* \`${ctx.sessionID.slice(0, 8)}\``);
  if (ctx.directory) lines.push(`*Dir:* \`${ctx.directory}\``);
  const elapsed = formatElapsed(ctx.elapsedMs);
  if (elapsed) lines.push(`*Elapsed:* ${elapsed}`);
  if (ctx.subagents) lines.push(`*Subagents:* ${ctx.subagents}`);
  if (detail) lines.push(`*Detail:* ${detail}`);
  return {
    text: heading,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*${heading}*` } },
      ...(lines.length > 0
        ? [{ type: "section", text: { type: "mrkdwn", text: lines.join("\n") } }]
        : []),
    ],
  };
}

export async function sendToSlack(
  webhookUrl: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw new Error(`Slack webhook failed: ${res.status} ${await res.text().catch(() => "")}`);
}
