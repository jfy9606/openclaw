// CDP command routing: built-in commands handled locally, the rest forwarded
// to the extension via sendToExtension. Pure routing — no WebSocket state.

import type { TargetRegistry } from "./extension-relay-targets.js";
import type { CdpCommand, ExtensionForwardCommandMessage } from "./extension-relay-types.js";

export type RouteCdpContext = {
  targets: TargetRegistry;
  sendToExtension: (payload: ExtensionForwardCommandMessage) => Promise<unknown>;
  nextExtensionId: () => number;
};

export async function routeCdpCommand(cmd: CdpCommand, ctx: RouteCdpContext): Promise<unknown> {
  switch (cmd.method) {
    case "Browser.getVersion":
      return {
        protocolVersion: "1.3",
        product: "Chrome/OpenClaw-Extension-Relay",
        revision: "0",
        userAgent: "OpenClaw-Extension-Relay",
        jsVersion: "V8",
      };
    case "Browser.setDownloadBehavior":
      return {};
    case "Target.setAutoAttach":
    case "Target.setDiscoverTargets":
      return {};
    case "Target.getTargets":
      return {
        targetInfos: Array.from(ctx.targets.values()).map((t) =>
          Object.assign({}, t.targetInfo, { attached: true }),
        ),
      };
    case "Target.getTargetInfo": {
      const params = (cmd.params ?? {}) as { targetId?: string };
      const targetId = typeof params.targetId === "string" ? params.targetId : undefined;
      if (targetId) {
        const t = ctx.targets.findByTargetId(targetId);
        if (t) {
          return { targetInfo: t.targetInfo };
        }
      }
      if (cmd.sessionId && ctx.targets.has(cmd.sessionId)) {
        const t = ctx.targets.get(cmd.sessionId);
        if (t) {
          return { targetInfo: t.targetInfo };
        }
      }
      const first = ctx.targets.first();
      return { targetInfo: first?.targetInfo };
    }
    case "Target.attachToTarget": {
      const params = (cmd.params ?? {}) as { targetId?: string };
      const targetId = typeof params.targetId === "string" ? params.targetId : undefined;
      if (!targetId) {
        throw new Error("targetId required");
      }
      const t = ctx.targets.findByTargetId(targetId);
      if (t) {
        return { sessionId: t.sessionId };
      }
      throw new Error("target not found");
    }
    default: {
      const id = ctx.nextExtensionId();
      return await ctx.sendToExtension({
        id,
        method: "forwardCDPCommand",
        params: {
          method: cmd.method,
          sessionId: cmd.sessionId,
          params: cmd.params,
        },
      });
    }
  }
}
