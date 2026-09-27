import type { NotifyKind } from "./config.js";

export interface DiscordContext {
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

const KIND_COLOR: Record<NotifyKind, number> = {
  complete: 0x57f287, // green
  error: 0xed4245, // red
  permission: 0xfee75c, // yellow
  question: 0x5865f2, // blurple
};

function formatElapsed(ms?: number): string | undefined {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return undefined;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function buildDiscordPayload(
  kind: NotifyKind,
  title: string,
  detail: string | undefined,
  ctx: DiscordContext,
) {
  const emoji = KIND_EMOJI[kind];
  const heading = `${emoji} ${ctx.sessionTitle?.trim() || title}`;
  const fields: Array<{ name: string; value: string; inline: boolean }> = [];
  if (ctx.sessionID) fields.push({ name: "ID", value: `\`${ctx.sessionID.slice(0, 8)}\``, inline: true });
  if (ctx.directory) fields.push({ name: "Dir", value: `\`${ctx.directory.slice(0, 256)}\``, inline: true });
  const elapsed = formatElapsed(ctx.elapsedMs);
  if (elapsed) fields.push({ name: "Elapsed", value: elapsed, inline: true });
  if (ctx.subagents) fields.push({ name: "Subagents", value: ctx.subagents.slice(0, 1024), inline: false });

  const description = detail ? detail.slice(0, 2000) : undefined;
  return {
    content: heading.slice(0, 2000),
    embeds: [
      {
        title: heading.slice(0, 256),
        description,
        color: KIND_COLOR[kind],
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

export async function sendToDiscord(
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
  // Discord returns 204 No Content on success.
  if (!res.ok) throw new Error(`Discord webhook failed: ${res.status} ${await res.text().catch(() => "")}`);
}
