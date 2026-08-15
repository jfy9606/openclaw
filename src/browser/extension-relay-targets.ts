// TargetRegistry: owns the connectedTargets map and its operations.
// No WebSocket dependency — pure target metadata management.

import type { ConnectedTarget } from "./extension-relay-types.js";

export class TargetRegistry {
  private readonly targets = new Map<string, ConnectedTarget>();

  get size(): number {
    return this.targets.size;
  }

  has(sessionId: string): boolean {
    return this.targets.has(sessionId);
  }

  get(sessionId: string): ConnectedTarget | undefined {
    return this.targets.get(sessionId);
  }

  set(sessionId: string, target: ConnectedTarget): void {
    this.targets.set(sessionId, target);
  }

  delete(sessionId: string): void {
    this.targets.delete(sessionId);
  }

  values(): IterableIterator<ConnectedTarget> {
    return this.targets.values();
  }

  entries(): IterableIterator<[string, ConnectedTarget]> {
    return this.targets.entries();
  }

  clear(): void {
    this.targets.clear();
  }

  dropBySession(sessionId: string): ConnectedTarget | undefined {
    const existing = this.targets.get(sessionId);
    if (!existing) {
      return undefined;
    }
    this.targets.delete(sessionId);
    return existing;
  }

  dropByTargetId(targetId: string): ConnectedTarget[] {
    const removed: ConnectedTarget[] = [];
    for (const [sessionId, target] of this.targets) {
      if (target.targetId !== targetId) {
        continue;
      }
      this.targets.delete(sessionId);
      removed.push(target);
    }
    return removed;
  }

  findByTargetId(targetId: string): ConnectedTarget | undefined {
    for (const t of this.targets.values()) {
      if (t.targetId === targetId) {
        return t;
      }
    }
    return undefined;
  }

  first(): ConnectedTarget | undefined {
    return Array.from(this.targets.values())[0];
  }
}
