// Module-level singleton registries for relay runtimes and auth headers.
// This is the only module holding mutable Map state for the relay lifecycle;
// other modules receive runtime handles via explicit parameters.

import { isLoopbackHost } from "../gateway/net.js";
import { parseUrlPort } from "./extension-relay-http.js";
import {
  RELAY_AUTH_HEADER,
  type ChromeExtensionRelayServer,
  type RelayRuntime,
} from "./extension-relay-types.js";

export const relayRuntimeByPort = new Map<number, RelayRuntime>();
export const relayInitByPort = new Map<number, Promise<ChromeExtensionRelayServer>>();

export function isAddrInUseError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "EADDRINUSE"
  );
}

function relayAuthTokenForUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!isLoopbackHost(parsed.hostname)) {
      return null;
    }
    const port = parseUrlPort(parsed);
    if (!port) {
      return null;
    }
    return relayRuntimeByPort.get(port)?.relayAuthToken ?? null;
  } catch {
    return null;
  }
}

export function getChromeExtensionRelayAuthHeaders(url: string): Record<string, string> {
  const token = relayAuthTokenForUrl(url);
  if (!token) {
    return {};
  }
  return { [RELAY_AUTH_HEADER]: token };
}
