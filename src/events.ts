import type { NotifyKind } from "./config.js";

export interface ClassifiedEvent {
  kind: NotifyKind;
  sessionID?: string;
  title: string;
  detail?: string;
}

// Minimal structural view of V2 OpenCodeEvent. Real union has
// { type, data, location? } — we only rely on type + loose data access.
interface LooseEvent {
  type?: unknown;
  data?: unknown;
  location?: unknown;
}

function dataRecord(e: LooseEvent): Record<string, any> {
  const d = e.data as Record<string, any> | undefined;
  return d && typeof d === "object" ? d : {};
}

function sessionIDFrom(e: LooseEvent): string | undefined {
  const d = dataRecord(e);
  for (const key of ["sessionID", "sessionId"]) {
    if (typeof d[key] === "string") return d[key];
  }
  const form = d.form as Record<string, any> | undefined;
  if (form && typeof form.sessionID === "string") return form.sessionID;
  return undefined;
}

function errorText(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const r = err as Record<string, unknown>;
  const msg = typeof r.message === "string" ? r.message : undefined;
  const type = typeof r.type === "string" ? r.type : undefined;
  if (msg && type) return `${type}: ${msg}`;
  return msg ?? type;
}

/**
 * Map V2 event.type strings to notifier kinds.
 * - complete: session.idle, session.execution.succeeded
 * - error: session.execution.failed, session.step.failed, session.tool.failed,
 *   session.compaction.failed
 * - permission: permission.asked
 * - question: form.created (question tool prompts via forms)
 */
export function classifyEvent(input: unknown): ClassifiedEvent | undefined {
  const e = input as LooseEvent;
  if (!e || typeof e.type !== "string") return undefined;
  const type = e.type;
  const d = dataRecord(e);
  const sessionID = sessionIDFrom(e);

  switch (type) {
    case "session.idle":
    case "session.execution.succeeded":
      return { kind: "complete", sessionID, title: "OpenCode session complete" };
    case "session.execution.failed":
    case "session.step.failed":
    case "session.tool.failed":
    case "session.compaction.failed": {
      const detail = errorText(d.error) ?? "unknown error";
      return { kind: "error", sessionID, title: "OpenCode session error", detail };
    }
    case "permission.asked": {
      const action = typeof d.action === "string" ? d.action : "permission";
      const resources = Array.isArray(d.resources) ? d.resources.slice(0, 3).join(", ") : "";
      const msg = typeof d.message === "string" ? d.message : "";
      const detail = [action, resources, msg].filter(Boolean).join(" — ").slice(0, 300) || undefined;
      return { kind: "permission", sessionID, title: "OpenCode needs permission", detail };
    }
    case "form.created": {
      const form = (d.form ?? {}) as Record<string, any>;
      const formTitle = typeof form.title === "string" ? form.title : "input requested";
      return {
        kind: "question",
        sessionID: typeof form.sessionID === "string" ? form.sessionID : sessionID,
        title: "OpenCode needs input",
        detail: formTitle.slice(0, 300),
      };
    }
    default:
      return undefined;
  }
}
