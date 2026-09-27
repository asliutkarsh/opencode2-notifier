import { Plugin } from "@opencode/plugin";
import { parseOptions, type NotifierOptions } from "./config.js";
import { classifyEvent } from "./events.js";
import { buildSlackPayload, sendToSlack } from "./slack.js";
import { buildDiscordPayload, sendToDiscord } from "./discord.js";

export default Plugin.define({
  id: "opencode2-notifier",
  async setup(ctx) {
    let options: NotifierOptions;
    try {
      options = parseOptions(ctx.options);
    } catch (err) {
      console.warn(`[opencode2-notifier] disabled: ${(err as Error).message}`);
      return;
    }

    const enabled = new Set(options.events);
    const controller = new AbortController();
    const sessionFirstSeen = new Map<string, number>();
    const pendingComplete = new Map<string, { title: string; detail?: string; timer: ReturnType<typeof setTimeout> }>();
    const lastSent = new Map<string, number>();
    const DEDUPE_MS = 30_000;

    const shouldSend = (kind: string, sessionID?: string) => {
      const key = `${kind}:${sessionID ?? "global"}`;
      const now = Date.now();
      const last = lastSent.get(key) ?? 0;
      if (now - last < DEDUPE_MS) return false;
      lastSent.set(key, now);
      return true;
    };

    async function enrich(sessionID?: string) {
      const directory = ctx.location.directory;
      if (!sessionID) return { directory };
      try {
        const session = await ctx.session.get({ sessionID });
        if (!options.notifyChildSessions && session.parentID) return undefined;
        if (!sessionFirstSeen.has(sessionID)) sessionFirstSeen.set(sessionID, session.time.created);
        return {
          directory,
          sessionTitle: session.title,
          elapsedMs: Date.now() - (sessionFirstSeen.get(sessionID) ?? session.time.created),
        };
      } catch {
        return { directory };
      }
    }

    async function deliver(
      kind: "complete" | "error" | "permission" | "question",
      title: string,
      detail: string | undefined,
      sessionID?: string,
    ) {
      if (!enabled.has(kind)) return;
      if (!shouldSend(kind, sessionID)) return;
      const info = await enrich(sessionID);
      if (info === undefined) return; // filtered child session
      const ctxPayload = {
        sessionID,
        directory: info.directory,
        sessionTitle: info.sessionTitle,
        elapsedMs: info.elapsedMs,
      };
      const sends: Array<Promise<void>> = [];
      if (options.slackWebhookUrl) {
        sends.push(
          sendToSlack(options.slackWebhookUrl, buildSlackPayload(kind, title, detail, ctxPayload), controller.signal),
        );
      }
      if (options.discordWebhookUrl) {
        sends.push(
          sendToDiscord(
            options.discordWebhookUrl,
            buildDiscordPayload(kind, title, detail, ctxPayload),
            controller.signal,
          ),
        );
      }
      const results = await Promise.allSettled(sends);
      for (const r of results) {
        if (r.status === "rejected" && (r.reason as Error)?.name !== "AbortError") {
          console.warn(`[opencode2-notifier] send failed: ${(r.reason as Error).message}`);
        }
      }
    }

    function scheduleComplete(title: string, detail: string | undefined, sessionID?: string) {
      if (!enabled.has("complete")) return;
      const key = sessionID ?? "global";
      const existing = pendingComplete.get(key);
      if (existing) clearTimeout(existing.timer);
      const timer = setTimeout(() => {
        pendingComplete.delete(key);
        void deliver("complete", title, detail, sessionID);
      }, options.debounceMs);
      // Don't keep the process alive just for a pending notification.
      (timer as unknown as { unref?: () => void }).unref?.();
      pendingComplete.set(key, { title, detail, timer });
    }

    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          // Track session starts for elapsed-time reporting.
          if ((event as { type?: string }).type === "session.created") {
            const sid = (event as unknown as { data?: { sessionID?: string } }).data?.sessionID;
            if (sid && !sessionFirstSeen.has(sid)) sessionFirstSeen.set(sid, Date.now());
            continue;
          }
          const classified = classifyEvent(event);
          if (!classified) continue;
          if (classified.kind === "complete") {
            scheduleComplete(classified.title, classified.detail, classified.sessionID);
          } else {
            void deliver(classified.kind, classified.title, classified.detail, classified.sessionID);
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") console.warn(`[opencode2-notifier] event loop ended: ${(err as Error).message}`);
      }
    })();

    return () => {
      controller.abort();
      for (const { timer } of pendingComplete.values()) clearTimeout(timer);
      pendingComplete.clear();
    };
  },
});
