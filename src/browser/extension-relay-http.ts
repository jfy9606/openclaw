// Pure HTTP helpers for the extension relay: header parsing, URL parsing,
// and low-level upgrade rejection. No WebSocket or server state.

import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { RELAY_AUTH_HEADER } from "./extension-relay-types.js";

export function headerValue(value: string | string[] | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function getHeader(req: IncomingMessage, name: string): string | undefined {
  return headerValue(req.headers[name.toLowerCase()]);
}

export function getRelayAuthTokenFromRequest(req: IncomingMessage, url?: URL): string | undefined {
  const headerToken = getHeader(req, RELAY_AUTH_HEADER)?.trim();
  if (headerToken) {
    return headerToken;
  }
  const queryToken = url?.searchParams.get("token")?.trim();
  if (queryToken) {
    return queryToken;
  }
  return undefined;
}

export function parseUrlPort(parsed: URL): number | null {
  const port =
    parsed.port?.trim() !== "" ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    return null;
  }
  return port;
}

export function parseBaseUrl(raw: string): {
  host: string;
  port: number;
  baseUrl: string;
} {
  const parsed = new URL(raw.trim().replace(/\/$/, ""));
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`extension relay cdpUrl must be http(s), got ${parsed.protocol}`);
  }
  const host = parsed.hostname;
  const port = parseUrlPort(parsed);
  if (!port) {
    throw new Error(`extension relay cdpUrl has invalid port: ${parsed.port || "(empty)"}`);
  }
  return { host, port, baseUrl: parsed.toString().replace(/\/$/, "") };
}

export function text(res: Duplex, status: number, bodyText: string) {
  const body = Buffer.from(bodyText);
  res.write(
    `HTTP/1.1 ${status} ${status === 200 ? "OK" : "ERR"}\r\n` +
      "Content-Type: text/plain; charset=utf-8\r\n" +
      `Content-Length: ${body.length}\r\n` +
      "Connection: close\r\n" +
      "\r\n",
  );
  res.write(body);
  res.end();
}

export function rejectUpgrade(socket: Duplex, status: number, bodyText: string) {
  text(socket, status, bodyText);
  try {
    socket.destroy();
  } catch {
    // ignore
  }
}
