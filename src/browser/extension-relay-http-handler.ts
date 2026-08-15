import type { IncomingMessage, ServerResponse } from "node:http";
import { getHeader, getRelayAuthTokenFromRequest } from "./extension-relay-http.js";
import { RELAY_AUTH_HEADER } from "./extension-relay-types.js";

export type RelayHttpHandlerInfo = { host: string; port: number; baseUrl: string };

export type RelayHttpHandlerDeps = {
  info: RelayHttpHandlerInfo;
  relayAuthTokens: Set<string>;
  extensionConnected: () => boolean;
  hasConnectedTargets: () => boolean;
  targetsValues: () => Iterable<{
    targetId: string;
    targetInfo: { type?: string; title?: string; url?: string };
  }>;
  sendToExtension: (msg: {
    id: number;
    method: string;
    params: Record<string, unknown>;
  }) => Promise<unknown>;
  nextExtensionId: () => number;
};

export function createRelayHttpRequestHandler(deps: RelayHttpHandlerDeps) {
  const { info, relayAuthTokens } = deps;
  return (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? "/", info.baseUrl);
    const path = url.pathname;
    const origin = getHeader(req, "origin");
    const isChromeExtensionOrigin =
      typeof origin === "string" && origin.startsWith("chrome-extension://");

    if (isChromeExtensionOrigin && origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }

    if (req.method === "OPTIONS") {
      if (origin && !isChromeExtensionOrigin) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      const requestedHeaders = (getHeader(req, "access-control-request-headers") ?? "")
        .split(",")
        .map((header) => header.trim().toLowerCase())
        .filter((header) => header.length > 0);
      const allowedHeaders = new Set(["content-type", RELAY_AUTH_HEADER, ...requestedHeaders]);
      res.writeHead(204, {
        "Access-Control-Allow-Origin": origin ?? "*",
        "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
        "Access-Control-Allow-Headers": Array.from(allowedHeaders).join(", "),
        "Access-Control-Max-Age": "86400",
        Vary: "Origin, Access-Control-Request-Headers",
      });
      res.end();
      return;
    }

    if (path.startsWith("/json")) {
      const token = getRelayAuthTokenFromRequest(req, url);
      if (!token || !relayAuthTokens.has(token)) {
        res.writeHead(401);
        res.end("Unauthorized");
        return;
      }
    }

    if (req.method === "HEAD" && path === "/") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (path === "/") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("OK");
      return;
    }

    if (path === "/extension/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ connected: deps.extensionConnected() }));
      return;
    }

    const hostHeader = req.headers.host?.trim() || `${info.host}:${info.port}`;
    const wsHost = `ws://${hostHeader}`;
    const cdpWsUrl = `${wsHost}/cdp`;

    if (
      (path === "/json/version" || path === "/json/version/") &&
      (req.method === "GET" || req.method === "PUT")
    ) {
      const payload: Record<string, unknown> = {
        Browser: "OpenClaw/extension-relay",
        "Protocol-Version": "1.3",
      };
      if (deps.extensionConnected() || deps.hasConnectedTargets()) {
        payload.webSocketDebuggerUrl = cdpWsUrl;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
      return;
    }

    const listPaths = new Set(["/json", "/json/", "/json/list", "/json/list/"]);
    if (listPaths.has(path) && (req.method === "GET" || req.method === "PUT")) {
      const list = Array.from(deps.targetsValues()).map((t) => ({
        id: t.targetId,
        type: t.targetInfo.type ?? "page",
        title: t.targetInfo.title ?? "",
        description: t.targetInfo.title ?? "",
        url: t.targetInfo.url ?? "",
        webSocketDebuggerUrl: cdpWsUrl,
        devtoolsFrontendUrl: `/devtools/inspector.html?ws=${cdpWsUrl.replace("ws://", "")}`,
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(list));
      return;
    }

    const handleTargetActionRoute = (
      match: RegExpMatchArray | null,
      cdpMethod: "Target.activateTarget" | "Target.closeTarget",
    ): boolean => {
      if (!match || (req.method !== "GET" && req.method !== "PUT")) {
        return false;
      }
      let targetId = "";
      try {
        targetId = decodeURIComponent(match[1] ?? "").trim();
      } catch {
        res.writeHead(400);
        res.end("invalid targetId encoding");
        return true;
      }
      if (!targetId) {
        res.writeHead(400);
        res.end("targetId required");
        return true;
      }
      void (async () => {
        try {
          await deps.sendToExtension({
            id: deps.nextExtensionId(),
            method: "forwardCDPCommand",
            params: { method: cdpMethod, params: { targetId } },
          });
        } catch {
          // ignore
        }
      })();
      res.writeHead(200);
      res.end("OK");
      return true;
    };

    if (handleTargetActionRoute(path.match(/^\/json\/activate\/(.+)$/), "Target.activateTarget")) {
      return;
    }
    if (handleTargetActionRoute(path.match(/^\/json\/close\/(.+)$/), "Target.closeTarget")) {
      return;
    }

    res.writeHead(404);
    res.end("not found");
  };
}
