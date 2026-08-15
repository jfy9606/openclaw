// Public barrel for the extension relay. Delegates lifecycle to RelaySession
// and auth-header lookup to the registry. Keeps import paths stable for
// consumers (cdp.helpers.ts etc.).

import { isLoopbackHost } from "../gateway/net.js";
import { parseBaseUrl } from "./extension-relay-http.js";
import { relayInitByPort, relayRuntimeByPort } from "./extension-relay-registry.js";
import { RelaySession } from "./extension-relay-session.js";
import type { ChromeExtensionRelayServer } from "./extension-relay-types.js";

export type { ChromeExtensionRelayServer } from "./extension-relay-types.js";
export { getChromeExtensionRelayAuthHeaders } from "./extension-relay-registry.js";

export async function ensureChromeExtensionRelayServer(opts: {
  cdpUrl: string;
  bindHost?: string;
}): Promise<ChromeExtensionRelayServer> {
  const info = parseBaseUrl(opts.cdpUrl);
  if (!isLoopbackHost(info.host)) {
    throw new Error(`extension relay requires loopback cdpUrl host (got ${info.host})`);
  }
  const bindHost = opts.bindHost ?? info.host;

  const existing = relayRuntimeByPort.get(info.port);
  if (existing) {
    if (existing.server.bindHost !== bindHost) {
      await existing.server.stop();
    } else {
      return existing.server;
    }
  }

  const inFlight = relayInitByPort.get(info.port);
  if (inFlight) {
    const server = await inFlight;
    if (server.bindHost === bindHost) {
      return server;
    }
    await server.stop();
  }

  const session = new RelaySession({ info, bindHost });
  const initPromise = session.ensureListening();
  relayInitByPort.set(info.port, initPromise);
  try {
    return await initPromise;
  } finally {
    relayInitByPort.delete(info.port);
  }
}

export async function stopChromeExtensionRelayServer(opts: { cdpUrl: string }): Promise<boolean> {
  const info = parseBaseUrl(opts.cdpUrl);
  const existing = relayRuntimeByPort.get(info.port);
  if (!existing) {
    return false;
  }
  await existing.server.stop();
  return true;
}
