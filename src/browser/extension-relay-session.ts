// RelaySession: owns the per-server lifecycle state that was previously held
// in closures inside ensureChromeExtensionRelayServer. The barrel delegates
// ensure/stop to this class; module-level singleton Maps stay in registry.

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import WebSocket, { WebSocketServer } from "ws";
import { isLoopbackAddress, isLoopbackHost } from "../gateway/net.js";
import { rawDataToString } from "../infra/ws.js";
import {
  probeAuthenticatedOpenClawRelay,
  resolveRelayAcceptedTokensForPort,
  resolveRelayAuthTokenForPort,
} from "./extension-relay-auth.js";
import { routeCdpCommand, type RouteCdpContext } from "./extension-relay-cdp.js";
import { createRelayHttpRequestHandler } from "./extension-relay-http-handler.js";
import {
  getRelayAuthTokenFromRequest,
  headerValue,
  rejectUpgrade,
} from "./extension-relay-http.js";
import { isAddrInUseError, relayRuntimeByPort } from "./extension-relay-registry.js";
import { TargetRegistry } from "./extension-relay-targets.js";
import {
  DEFAULT_EXTENSION_COMMAND_RECONNECT_WAIT_MS,
  DEFAULT_EXTENSION_RECONNECT_GRACE_MS,
  RELAY_AUTH_HEADER,
  type AttachedToTargetEvent,
  type CdpCommand,
  type CdpEvent,
  type CdpResponse,
  type ChromeExtensionRelayServer,
  type DetachedFromTargetEvent,
  type ExtensionForwardCommandMessage,
  type ExtensionForwardEventMessage,
  type ExtensionMessage,
  type ExtensionPingMessage,
  type ExtensionPongMessage,
} from "./extension-relay-types.js";

type PendingExtensionEntry = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
};

type RelaySessionParams = {
  info: { host: string; port: number; baseUrl: string };
  bindHost: string;
};

export class RelaySession {
  private readonly info: RelaySessionParams["info"];
  private readonly bindHost: string;
  private relayAuthToken = "";
  private relayAuthTokens = new Set<string>();
  private extensionWs: WebSocket | null = null;
  private readonly cdpClients = new Set<WebSocket>();
  private readonly targets = new TargetRegistry();
  private extensionDisconnectCleanupTimer: NodeJS.Timeout | null = null;
  private readonly extensionReconnectWaiters = new Set<(connected: boolean) => void>();
  private readonly pendingExtension = new Map<number, PendingExtensionEntry>();
  private nextExtensionIdValue = 1;
  private server: ReturnType<typeof createServer> | null = null;
  private wssExtension: WebSocketServer | null = null;
  private wssCdp: WebSocketServer | null = null;

  constructor(params: RelaySessionParams) {
    this.info = params.info;
    this.bindHost = params.bindHost;
  }

  private readonly extensionConnected = () => this.extensionWs?.readyState === WebSocket.OPEN;
  private readonly hasConnectedTargets = () => this.targets.size > 0;

  private readonly flushExtensionReconnectWaiters = (connected: boolean) => {
    if (this.extensionReconnectWaiters.size === 0) {
      return;
    }
    const waiters = Array.from(this.extensionReconnectWaiters);
    this.extensionReconnectWaiters.clear();
    for (const waiter of waiters) {
      waiter(connected);
    }
  };

  private readonly clearExtensionDisconnectCleanupTimer = () => {
    if (!this.extensionDisconnectCleanupTimer) {
      return;
    }
    clearTimeout(this.extensionDisconnectCleanupTimer);
    this.extensionDisconnectCleanupTimer = null;
  };

  private readonly closeCdpClientsAfterExtensionDisconnect = () => {
    this.targets.clear();
    for (const client of this.cdpClients) {
      try {
        client.close(1011, "extension disconnected");
      } catch {
        // ignore
      }
    }
    this.cdpClients.clear();
    this.flushExtensionReconnectWaiters(false);
  };

  private readonly scheduleExtensionDisconnectCleanup = () => {
    this.clearExtensionDisconnectCleanupTimer();
    this.extensionDisconnectCleanupTimer = setTimeout(() => {
      this.extensionDisconnectCleanupTimer = null;
      if (this.extensionConnected()) {
        return;
      }
      this.closeCdpClientsAfterExtensionDisconnect();
    }, DEFAULT_EXTENSION_RECONNECT_GRACE_MS);
  };

  private readonly waitForExtensionReconnect = async (timeoutMs: number): Promise<boolean> => {
    if (this.extensionConnected()) {
      return true;
    }
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const waiter = (connected: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.extensionReconnectWaiters.delete(waiter);
        resolve(connected);
      };
      const timer = setTimeout(() => {
        waiter(false);
      }, timeoutMs);
      this.extensionReconnectWaiters.add(waiter);
    });
  };

  private readonly nextExtensionId = () => this.nextExtensionIdValue++;

  private readonly sendToExtension = async (
    payload: ExtensionForwardCommandMessage,
  ): Promise<unknown> => {
    const ws = this.extensionWs;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Chrome extension not connected");
    }
    ws.send(JSON.stringify(payload));
    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingExtension.delete(payload.id);
        reject(new Error(`extension request timeout: ${payload.params.method}`));
      }, 30_000);
      this.pendingExtension.set(payload.id, { resolve, reject, timer });
    });
  };

  private readonly broadcastToCdpClients = (evt: CdpEvent) => {
    const msg = JSON.stringify(evt);
    for (const ws of this.cdpClients) {
      if (ws.readyState !== WebSocket.OPEN) {
        continue;
      }
      ws.send(msg);
    }
  };

  private readonly sendResponseToCdp = (ws: WebSocket, res: CdpResponse) => {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(JSON.stringify(res));
  };

  private readonly dropConnectedTargetSession = (sessionId: string) =>
    this.targets.dropBySession(sessionId);

  private readonly dropConnectedTargetsByTargetId = (targetId: string) =>
    this.targets.dropByTargetId(targetId);

  private readonly broadcastDetachedTarget = (
    target: { sessionId: string; targetId: string },
    targetId?: string,
  ) => {
    this.broadcastToCdpClients({
      method: "Target.detachedFromTarget",
      params: {
        sessionId: target.sessionId,
        targetId: targetId ?? target.targetId,
      },
      sessionId: target.sessionId,
    });
  };

  private readonly isMissingTargetError = (err: unknown) => {
    const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return (
      message.includes("target not found") ||
      message.includes("no target with given id") ||
      message.includes("session not found") ||
      message.includes("cannot find session")
    );
  };

  private readonly pruneStaleTargetsFromCommandFailure = (cmd: CdpCommand, err: unknown) => {
    if (!this.isMissingTargetError(err)) {
      return;
    }
    if (cmd.sessionId) {
      const removed = this.dropConnectedTargetSession(cmd.sessionId);
      if (removed) {
        this.broadcastDetachedTarget(removed);
        return;
      }
    }
    const params = (cmd.params ?? {}) as { targetId?: unknown };
    const targetId = typeof params.targetId === "string" ? params.targetId : undefined;
    if (!targetId) {
      return;
    }
    const removedTargets = this.dropConnectedTargetsByTargetId(targetId);
    for (const removed of removedTargets) {
      this.broadcastDetachedTarget(removed, targetId);
    }
  };

  private readonly ensureTargetEventsForClient = (
    ws: WebSocket,
    mode: "autoAttach" | "discover",
  ) => {
    for (const target of this.targets.values()) {
      if (mode === "autoAttach") {
        ws.send(
          JSON.stringify({
            method: "Target.attachedToTarget",
            params: {
              sessionId: target.sessionId,
              targetInfo: Object.assign({}, target.targetInfo, { attached: true }),
              waitingForDebugger: false,
            },
          } satisfies CdpEvent),
        );
      } else {
        ws.send(
          JSON.stringify({
            method: "Target.targetCreated",
            params: { targetInfo: Object.assign({}, target.targetInfo, { attached: true }) },
          } satisfies CdpEvent),
        );
      }
    }
  };

  private get routeContext(): RouteCdpContext {
    return {
      targets: this.targets,
      sendToExtension: this.sendToExtension,
      nextExtensionId: this.nextExtensionId,
    };
  }

  async ensureListening(): Promise<ChromeExtensionRelayServer> {
    this.relayAuthToken = await resolveRelayAuthTokenForPort(this.info.port);
    this.relayAuthTokens = new Set(await resolveRelayAcceptedTokensForPort(this.info.port));

    const info = this.info;
    const bindHost = this.bindHost;
    const relayAuthTokens = this.relayAuthTokens;

    const server = createServer(
      createRelayHttpRequestHandler({
        info,
        relayAuthTokens,
        extensionConnected: this.extensionConnected,
        hasConnectedTargets: this.hasConnectedTargets,
        targetsValues: () => this.targets.values(),
        sendToExtension: this.sendToExtension,
        nextExtensionId: this.nextExtensionId,
      }),
    );
    this.server = server;

    const wssExtension = new WebSocketServer({ noServer: true });
    const wssCdp = new WebSocketServer({ noServer: true });
    this.wssExtension = wssExtension;
    this.wssCdp = wssCdp;

    server.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", info.baseUrl);
      const pathname = url.pathname;
      const remote = req.socket.remoteAddress;

      if (!isLoopbackAddress(remote) && isLoopbackHost(bindHost)) {
        rejectUpgrade(socket, 403, "Forbidden");
        return;
      }

      const origin = headerValue(req.headers.origin);
      if (origin && !origin.startsWith("chrome-extension://")) {
        rejectUpgrade(socket, 403, "Forbidden: invalid origin");
        return;
      }

      if (pathname === "/extension") {
        const token = getRelayAuthTokenFromRequest(req, url);
        if (!token || !relayAuthTokens.has(token)) {
          rejectUpgrade(socket, 401, "Unauthorized");
          return;
        }
        if (this.extensionWs && this.extensionWs.readyState !== WebSocket.OPEN) {
          try {
            this.extensionWs.terminate();
          } catch {
            // ignore
          }
          this.extensionWs = null;
        }
        if (this.extensionConnected()) {
          rejectUpgrade(socket, 409, "Extension already connected");
          return;
        }
        wssExtension.handleUpgrade(req, socket, head, (ws) => {
          wssExtension.emit("connection", ws, req);
        });
        return;
      }

      if (pathname === "/cdp") {
        const token = getRelayAuthTokenFromRequest(req, url);
        if (!token || !relayAuthTokens.has(token)) {
          rejectUpgrade(socket, 401, "Unauthorized");
          return;
        }
        wssCdp.handleUpgrade(req, socket, head, (ws) => {
          wssCdp.emit("connection", ws, req);
        });
        return;
      }

      rejectUpgrade(socket, 404, "Not Found");
    });

    wssExtension.on("connection", (ws) => {
      this.extensionWs = ws;
      this.clearExtensionDisconnectCleanupTimer();
      this.flushExtensionReconnectWaiters(true);

      const ping = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          return;
        }
        ws.send(JSON.stringify({ method: "ping" } satisfies ExtensionPingMessage));
      }, 5000);

      ws.on("message", (data) => {
        if (this.extensionWs !== ws) {
          return;
        }
        let parsed: ExtensionMessage | null;
        try {
          parsed = JSON.parse(rawDataToString(data)) as ExtensionMessage;
        } catch {
          return;
        }

        if (
          parsed &&
          typeof parsed === "object" &&
          "id" in parsed &&
          typeof parsed.id === "number"
        ) {
          const pending = this.pendingExtension.get(parsed.id);
          if (!pending) {
            return;
          }
          this.pendingExtension.delete(parsed.id);
          clearTimeout(pending.timer);
          if ("error" in parsed && typeof parsed.error === "string" && parsed.error.trim()) {
            pending.reject(new Error(parsed.error));
          } else {
            pending.resolve(parsed.result);
          }
          return;
        }

        if (parsed && typeof parsed === "object" && "method" in parsed) {
          if ((parsed as ExtensionPongMessage).method === "pong") {
            return;
          }
          if ((parsed as ExtensionForwardEventMessage).method !== "forwardCDPEvent") {
            return;
          }
          const evt = parsed as ExtensionForwardEventMessage;
          const method = evt.params?.method;
          const params = evt.params?.params;
          const sessionId = evt.params?.sessionId;
          if (!method || typeof method !== "string") {
            return;
          }

          if (method === "Target.attachedToTarget") {
            const attached = (params ?? {}) as AttachedToTargetEvent;
            const targetType = attached?.targetInfo?.type ?? "page";
            if (targetType !== "page") {
              return;
            }
            if (attached?.sessionId && attached?.targetInfo?.targetId) {
              const prev = this.targets.get(attached.sessionId);
              const nextTargetId = attached.targetInfo.targetId;
              const prevTargetId = prev?.targetId;
              const changedTarget = Boolean(prev && prevTargetId && prevTargetId !== nextTargetId);
              this.targets.set(attached.sessionId, {
                sessionId: attached.sessionId,
                targetId: nextTargetId,
                targetInfo: attached.targetInfo,
              });
              if (changedTarget && prevTargetId) {
                this.broadcastToCdpClients({
                  method: "Target.detachedFromTarget",
                  params: { sessionId: attached.sessionId, targetId: prevTargetId },
                  sessionId: attached.sessionId,
                });
              }
              if (!prev || changedTarget) {
                this.broadcastToCdpClients({ method, params, sessionId });
              }
              return;
            }
          }

          if (method === "Target.detachedFromTarget") {
            const detached = (params ?? {}) as DetachedFromTargetEvent;
            if (detached?.sessionId) {
              this.dropConnectedTargetSession(detached.sessionId);
            } else if (detached?.targetId) {
              this.dropConnectedTargetsByTargetId(detached.targetId);
            }
            this.broadcastToCdpClients({ method, params, sessionId });
            return;
          }

          if (method === "Target.targetDestroyed" || method === "Target.targetCrashed") {
            const targetEvent = (params ?? {}) as { targetId?: string };
            if (targetEvent.targetId) {
              this.dropConnectedTargetsByTargetId(targetEvent.targetId);
            }
            this.broadcastToCdpClients({ method, params, sessionId });
            return;
          }

          if (method === "Target.targetInfoChanged") {
            const changed = (params ?? {}) as { targetInfo?: { targetId?: string; type?: string } };
            const targetInfo = changed?.targetInfo;
            const targetId = targetInfo?.targetId;
            if (targetId && (targetInfo?.type ?? "page") === "page") {
              for (const [sid, target] of this.targets.entries()) {
                if (target.targetId !== targetId) {
                  continue;
                }
                this.targets.set(sid, {
                  ...target,
                  targetInfo: { ...target.targetInfo, ...(targetInfo as object) },
                });
              }
            }
          }

          this.broadcastToCdpClients({ method, params, sessionId });
        }
      });

      ws.on("close", () => {
        clearInterval(ping);
        if (this.extensionWs !== ws) {
          return;
        }
        this.extensionWs = null;
        for (const [, pending] of this.pendingExtension) {
          clearTimeout(pending.timer);
          pending.reject(new Error("extension disconnected"));
        }
        this.pendingExtension.clear();
        this.scheduleExtensionDisconnectCleanup();
      });
    });

    wssCdp.on("connection", (ws) => {
      this.cdpClients.add(ws);

      ws.on("message", async (data) => {
        let cmd: CdpCommand | null;
        try {
          cmd = JSON.parse(rawDataToString(data)) as CdpCommand;
        } catch {
          return;
        }
        if (!cmd || typeof cmd !== "object") {
          return;
        }
        if (typeof cmd.id !== "number" || typeof cmd.method !== "string") {
          return;
        }

        if (!this.extensionConnected()) {
          const reconnected = await this.waitForExtensionReconnect(
            DEFAULT_EXTENSION_COMMAND_RECONNECT_WAIT_MS,
          );
          if (!reconnected || !this.extensionConnected()) {
            this.sendResponseToCdp(ws, {
              id: cmd.id,
              sessionId: cmd.sessionId,
              error: { message: "Extension not connected" },
            });
            return;
          }
        }

        try {
          const result = await routeCdpCommand(cmd, this.routeContext);

          if (cmd.method === "Target.setAutoAttach" && !cmd.sessionId) {
            this.ensureTargetEventsForClient(ws, "autoAttach");
          }
          if (cmd.method === "Target.setDiscoverTargets") {
            const discover = (cmd.params ?? {}) as { discover?: boolean };
            if (discover.discover === true) {
              this.ensureTargetEventsForClient(ws, "discover");
            }
          }
          if (cmd.method === "Target.attachToTarget") {
            const params = (cmd.params ?? {}) as { targetId?: string };
            const targetId = typeof params.targetId === "string" ? params.targetId : undefined;
            if (targetId) {
              const target = this.targets.findByTargetId(targetId);
              if (target) {
                ws.send(
                  JSON.stringify({
                    method: "Target.attachedToTarget",
                    params: {
                      sessionId: target.sessionId,
                      targetInfo: Object.assign({}, target.targetInfo, { attached: true }),
                      waitingForDebugger: false,
                    },
                  } satisfies CdpEvent),
                );
              }
            }
          }

          this.sendResponseToCdp(ws, { id: cmd.id, sessionId: cmd.sessionId, result });
        } catch (err) {
          this.pruneStaleTargetsFromCommandFailure(cmd, err);
          this.sendResponseToCdp(ws, {
            id: cmd.id,
            sessionId: cmd.sessionId,
            error: { message: err instanceof Error ? err.message : String(err) },
          });
        }
      });

      ws.on("close", () => {
        this.cdpClients.delete(ws);
      });
    });

    try {
      await new Promise<void>((resolve, reject) => {
        server.listen(info.port, bindHost, () => resolve());
        server.once("error", reject);
      });
    } catch (err) {
      if (
        isAddrInUseError(err) &&
        (await probeAuthenticatedOpenClawRelay({
          baseUrl: info.baseUrl,
          relayAuthHeader: RELAY_AUTH_HEADER,
          relayAuthToken: this.relayAuthToken,
        }))
      ) {
        const existingRelay: ChromeExtensionRelayServer = {
          host: info.host,
          bindHost,
          port: info.port,
          baseUrl: info.baseUrl,
          cdpWsUrl: `ws://${info.host}:${info.port}/cdp`,
          extensionConnected: () => false,
          stop: async () => {
            relayRuntimeByPort.delete(info.port);
          },
        };
        relayRuntimeByPort.set(info.port, {
          server: existingRelay,
          relayAuthToken: this.relayAuthToken,
        });
        return existingRelay;
      }
      throw err;
    }

    const addr = server.address() as AddressInfo | null;
    const port = addr?.port ?? info.port;
    const actualBindHost = addr?.address || bindHost;
    const host = info.host;
    const baseUrl = `${new URL(info.baseUrl).protocol}//${host}:${port}`;

    const relay: ChromeExtensionRelayServer = {
      host,
      bindHost: actualBindHost,
      port,
      baseUrl,
      cdpWsUrl: `ws://${host}:${port}/cdp`,
      extensionConnected: this.extensionConnected,
      stop: () => this.stop(port),
    };

    relayRuntimeByPort.set(port, { server: relay, relayAuthToken: this.relayAuthToken });
    return relay;
  }

  private async stop(port: number): Promise<void> {
    relayRuntimeByPort.delete(port);
    this.clearExtensionDisconnectCleanupTimer();
    this.flushExtensionReconnectWaiters(false);
    for (const [, pending] of this.pendingExtension) {
      clearTimeout(pending.timer);
      pending.reject(new Error("server stopping"));
    }
    this.pendingExtension.clear();
    try {
      this.extensionWs?.close(1001, "server stopping");
    } catch {
      // ignore
    }
    for (const ws of this.cdpClients) {
      try {
        ws.close(1001, "server stopping");
      } catch {
        // ignore
      }
    }
    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve());
    });
    this.wssExtension?.close();
    this.wssCdp?.close();
  }
}
