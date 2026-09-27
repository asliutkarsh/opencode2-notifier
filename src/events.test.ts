import { describe, expect, test } from "bun:test";
import { classifyEvent } from "./events.js";

describe("classifyEvent", () => {
  test("session.idle -> complete", () => {
    expect(classifyEvent({ type: "session.idle", data: { sessionID: "abc" } })).toMatchObject({
      kind: "complete",
      sessionID: "abc",
    });
  });

  test("execution.failed -> error with detail", () => {
    const c = classifyEvent({
      type: "session.execution.failed",
      data: { sessionID: "s1", error: { type: "provider", message: "boom" } },
    });
    expect(c?.kind).toBe("error");
    expect(c?.detail).toContain("boom");
  });

  test("permission.asked -> permission", () => {
    const c = classifyEvent({
      type: "permission.asked",
      data: { sessionID: "s1", action: "edit", resources: ["/tmp/a"], message: "allow?" },
    });
    expect(c?.kind).toBe("permission");
    expect(c?.detail).toContain("edit");
  });

  test("form.created -> question", () => {
    const c = classifyEvent({
      type: "form.created",
      data: { form: { id: "f1", sessionID: "s2", title: "Pick one" } },
    });
    expect(c?.kind).toBe("question");
    expect(c?.sessionID).toBe("s2");
  });

  test("unknown -> undefined", () => {
    expect(classifyEvent({ type: "session.text.delta", data: {} })).toBeUndefined();
  });
});
