export type ChildOutcome = "running" | "succeeded" | "failed" | "interrupted" | "done";

interface Child {
  title?: string;
  outcome: ChildOutcome;
}

const MAX_PARENTS = 200;
const MAX_TITLES = 3;

/** Tracks subagent sessions (children) per parent session using lifecycle
 * events. Children unknown to the tracker (started before plugin load) are
 * simply absent. A child still marked running has not finished. */
export class SubagentTracker {
  private parents = new Map<string, Map<string, Child>>();
  private childToParent = new Map<string, string>();

  noteCreated(parentID: string, childID: string, title?: string): void {
    let children = this.parents.get(parentID);
    if (!children) {
      children = new Map();
      this.parents.set(parentID, children);
      while (this.parents.size > MAX_PARENTS) {
        const oldest = this.parents.keys().next().value as string;
        for (const cid of this.parents.get(oldest)!.keys()) this.childToParent.delete(cid);
        this.parents.delete(oldest);
      }
    }
    children.set(childID, { title, outcome: "running" });
    this.childToParent.set(childID, parentID);
  }

  /** Only transitions running -> terminal; never overwrites a recorded outcome. */
  noteFinished(childID: string, outcome: Exclude<ChildOutcome, "running">): void {
    const parentID = this.childToParent.get(childID);
    if (!parentID) return;
    const child = this.parents.get(parentID)?.get(childID);
    if (child && child.outcome === "running") child.outcome = outcome;
  }

  snapshot(sessionID: string): { running: string[]; succeeded: number; failed: number } {
    const children = this.parents.get(sessionID);
    const out = { running: [] as string[], succeeded: 0, failed: 0 };
    if (!children) return out;
    for (const child of children.values()) {
      if (child.outcome === "running") out.running.push(child.title ?? "untitled");
      else if (child.outcome === "succeeded" || child.outcome === "done") out.succeeded += 1;
      else out.failed += 1;
    }
    return out;
  }

  /** Human line for notifications, or undefined when no subagents are known. */
  summarize(sessionID: string): string | undefined {
    const { running, succeeded, failed } = this.snapshot(sessionID);
    if (running.length === 0 && succeeded === 0 && failed === 0) return undefined;
    const parts: string[] = [];
    if (running.length > 0) {
      const shown = running.slice(0, MAX_TITLES).join(", ");
      const more = running.length > MAX_TITLES ? ` +${running.length - MAX_TITLES} more` : "";
      parts.push(`${running.length} running (${shown}${more})`);
    }
    if (succeeded > 0) parts.push(`${succeeded} done`);
    if (failed > 0) parts.push(`${failed} failed`);
    return parts.join(" · ");
  }
}
