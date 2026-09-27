import { describe, expect, test } from "bun:test";
import { SubagentTracker } from "./subagents.js";

describe("SubagentTracker", () => {
  test("unknown session summarizes to undefined", () => {
    expect(new SubagentTracker().summarize("nope")).toBeUndefined();
  });

  test("running children listed with titles", () => {
    const t = new SubagentTracker();
    t.noteCreated("p", "c1", "Explore backend");
    t.noteCreated("p", "c2", "Research docs");
    expect(t.summarize("p")).toBe("2 running (Explore backend, Research docs)");
  });

  test("finished children counted, running kept", () => {
    const t = new SubagentTracker();
    t.noteCreated("p", "c1", "A");
    t.noteCreated("p", "c2", "B");
    t.noteFinished("c1", "succeeded");
    expect(t.summarize("p")).toBe("1 running (B) · 1 done");
  });

  test("terminal outcome never overwritten", () => {
    const t = new SubagentTracker();
    t.noteCreated("p", "c1", "A");
    t.noteFinished("c1", "failed");
    t.noteFinished("c1", "succeeded");
    expect(t.summarize("p")).toBe("1 failed");
  });

  test("idle marks done", () => {
    const t = new SubagentTracker();
    t.noteCreated("p", "c1");
    t.noteFinished("c1", "done");
    expect(t.summarize("p")).toBe("1 done");
  });
});
