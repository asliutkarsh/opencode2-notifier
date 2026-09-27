# opencode2-notifier

OpenCode v2 plugin that notifies you on **Slack** and/or **Discord** when an agent session finishes, crashes, waits on a permission, or asks you a question. Built for the "OpenCode is working on my laptop while I'm elsewhere" workflow.

- Plugin ID: `opencode2-notifier`
- Runtime: OpenCode v2 (`@opencode/plugin` Promise API)
- Sinks: Slack incoming webhook, Discord channel webhook (use one or both)

## Contents

- [How it works](#how-it-works)
- [Install](#install)
- [Slack webhook setup](#slack-webhook-setup)
- [Discord webhook setup](#discord-webhook-setup)
- [Configuration reference](#configuration-reference)
- [Event mapping](#event-mapping)
- [Behavior details](#behavior-details)
- [Message format](#message-format)
- [Local development](#local-development)
- [Troubleshooting](#troubleshooting)
- [Security notes](#security-notes)
- [Changelog](#changelog)
- [License](#license)

## How it works

On `setup`, the plugin:

1. Reads and validates `ctx.options` (webhook URLs, event allowlist, debounce).
2. Subscribes to the live server event stream via `ctx.event.subscribe()`.
3. Classifies each event (`src/events.ts`) into `complete | error | permission | question`.
4. Enriches it with session title + elapsed time via `ctx.session.get()`.
5. Fans out to every configured sink with `Promise.allSettled` — one sink failing never blocks the other.
6. Cleans up timers and aborts the stream on plugin unload.

If no webhook is configured, the plugin logs a warning and disables itself instead of breaking OpenCode.

## Install

### Option A — from npm (recommended)

```sh
opencode plugin add opencode2-notifier
```

Then add options to your `opencode.jsonc` (global `~/.config/opencode/opencode.jsonc` or project `.opencode/opencode.jsonc`):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "opencode2-notifier",
      "options": {
        "slackWebhookUrl": "{env:SLACK_WEBHOOK_URL}",
        "discordWebhookUrl": "{env:DISCORD_WEBHOOK_URL}",
        "events": ["complete", "error", "permission", "question"],
        "debounceMs": 10000,
        "notifyChildSessions": false
      }
    }
  ]
}
```

### Option B — local checkout

```sh
git clone https://github.com/asliutkarsh/opencode2-notifier.git
```

Point OpenCode at it:

```jsonc
{
  "plugins": [{ "package": "/absolute/path/opencode2-notifier", "options": { "discordWebhookUrl": "{env:DISCORD_WEBHOOK_URL}" } }]
}
```

Restart the service after config changes:

```sh
opencode service restart
```

## Slack webhook setup

1. Open your Slack workspace → **Settings & administration → Manage apps → Custom Integrations → Incoming WebHooks** (or use Workflow Builder webhooks).
2. Add a webhook for the channel you want (e.g. `#agent-alerts`), copy the `https://hooks.slack.com/services/...` URL.
3. Export it where OpenCode runs:
   ```sh
   export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
   ```
   The plugin also accepts `{env:ANY_VAR_NAME}` in `slackWebhookUrl`, or the `OPCODE2_NOTIFIER_SLACK_WEBHOOK_URL` fallback.

## Discord webhook setup

1. In Discord: channel **Edit Channel → Integrations → Webhooks → New Webhook**, pick a name/avatar, copy the `https://discord.com/api/webhooks/...` URL.
2. Export it where OpenCode runs:
   ```sh
   export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
   ```
   The plugin also accepts `{env:ANY_VAR_NAME}` in `discordWebhookUrl`, or the `OPCODE2_NOTIFIER_DISCORD_WEBHOOK_URL` fallback.

## Configuration reference

| Key | Type | Default | Description |
|---|---|---|---|
| `slackWebhookUrl` | `string` (URL or `{env:VAR}`) | `SLACK_WEBHOOK_URL` env | Slack sink. Optional if Discord is set. |
| `discordWebhookUrl` | `string` (URL or `{env:VAR}`) | `DISCORD_WEBHOOK_URL` env | Discord sink. Optional if Slack is set. |
| `events` | `("complete" \| "error" \| "permission" \| "question")[]` | all four | Allowlist of notification kinds. Unknown values are ignored. |
| `debounceMs` | `number` (ms) | `10000` | Delay-and-replace window for `complete` only. |
| `notifyChildSessions` | `boolean` | `false` | When `false`, sessions with a `parentID` (subagents) are skipped. |

At least one of `slackWebhookUrl` / `discordWebhookUrl` must resolve to an `http(s)` URL or setup throws and the plugin disables itself with a warning.

Minimal Discord-only example:

```jsonc
{
  "plugins": [{ "package": "opencode2-notifier", "options": { "discordWebhookUrl": "{env:DISCORD_WEBHOOK_URL}" } }]
}
```

## Event mapping

Based on the V2 `V2Event` union (`@opencode/client`):

| V2 `event.type` | Notifier kind | Delivery |
|---|---|---|
| `session.idle`, `session.execution.succeeded` | `complete` | debounced per session (`debounceMs`) |
| `session.execution.failed`, `session.step.failed`, `session.tool.failed`, `session.compaction.failed` | `error` | immediate (includes `type: message`) |
| `permission.asked` | `permission` | immediate (includes action + first resources + message) |
| `form.created` | `question` | immediate (includes form title) |
| `session.created` | — (internal) | used only to record session start time for elapsed reporting |

## Behavior details

- **Debounce (`complete`):** rapid duplicate idle/success events for the same session collapse into one post after `debounceMs`. Timers are `unref`'d so they never keep the process alive.
- **Dedupe (all kinds):** 30s per `kind + sessionID` window suppresses exact duplicates (e.g. permission re-asked in a tight loop).
- **Child sessions:** `ctx.session.get()` exposes `parentID`; when `notifyChildSessions` is `false` those are dropped silently.
- **Enrichment failures:** if `session.get` fails (session gone, transient error), the notification still sends with directory only.
- **Fan-out:** sinks send concurrently; a Slack 5xx does not cancel the Discord post and vice versa. Failures are `console.warn`'d, never thrown.
- **Abort:** `AbortSignal` is threaded through the event iterator and both `fetch` calls; unload aborts everything and clears pending debounce timers.

## Message format

Both sinks include emoji prefix, session title, short session ID, working directory, elapsed time, and kind-specific detail.

Slack (`src/slack.ts`): `text` fallback + two `mrkdwn` sections. Example `text`: `🔐 OpenCode needs permission — Demo`.

Discord (`src/discord.ts`): `content` ping line + rich embed with per-kind color (`complete` green `0x57F287`, `error` red `0xED4245`, `permission` yellow `0xFEE75C`, `question` blurple `0x5865F2`), fields, and timestamp. Long details are truncated to Discord's 2000-char limits.

## Local development

```sh
bun install
bun test        # 15 tests: config, event classification, slack + discord payloads
bunx tsc --noEmit
```

Project layout:

```
src/
  index.ts        # Plugin.define, event loop, debounce/dedupe, fan-out
  config.ts       # option parsing + {env:VAR} resolution
  events.ts       # V2Event -> NotifyKind classification
  slack.ts        # Slack Block Kit payload + sender
  discord.ts      # Discord embed payload + sender
  *.test.ts       # bun tests
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `[opencode2-notifier] disabled: ... missing webhook` | No URL resolved | Set the option or export `SLACK_WEBHOOK_URL` / `DISCORD_WEBHOOK_URL`; restart service |
| No `complete` post | Still inside `debounceMs`, or duplicates deduped | Lower `debounceMs` for testing (e.g. `2000`); check service logs |
| `Slack webhook failed: 404` | Revoked/rotated webhook | Recreate the incoming webhook, update env |
| `Discord webhook failed: 404` | Deleted webhook or wrong path | Recreate via channel Integrations, update env |
| Child-session spam / silence | `notifyChildSessions` mismatch | Set `true` to include subagents, `false` (default) for mains only |
| Events missing on old server | Server older than tested API | Use OpenCode v2.0.16+ / `@opencode/plugin` 2.0.18 |

Logs live in `~/.local/share/opencode/log/opencode.log` — filter `role=server` for plugin lines.

## Security notes

- Webhook URLs are secrets: never commit them. Use `{env:VAR}` indirection and keep them in shell env or a secrets manager.
- If a webhook URL leaks (chat logs, screenshots), regenerate it on the Slack/Discord side — old URLs keep working until revoked.
- Notifications include session titles, directory paths, and error text. Avoid pointing them at public channels if you work on sensitive repos.

## Changelog

### 0.1.0

- Initial release: Slack + Discord sinks, `complete/error/permission/question` kinds, debounce + dedupe, child-session filter, `{env:VAR}` config.

## License

MIT — see [LICENSE](./LICENSE).
