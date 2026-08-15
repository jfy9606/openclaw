// CDP/Extension relay message types, server shape, and shared constants.
// Pure types and constants — no runtime dependencies.

export type CdpCommand = {
  id: number;
  method: string;
  params?: unknown;
  sessionId?: string;
};

export type CdpResponse = {
  id: number;
  result?: unknown;
  error?: { message: string };
  sessionId?: string;
};

export type CdpEvent = {
  method: string;
  params?: unknown;
  sessionId?: string;
};

export type ExtensionForwardCommandMessage = {
  id: number;
  method: "forwardCDPCommand";
  params: { method: string; params?: unknown; sessionId?: string };
};

export type ExtensionResponseMessage = {
  id: number;
  result?: unknown;
  error?: string;
};

export type ExtensionForwardEventMessage = {
  method: "forwardCDPEvent";
  params: { method: string; params?: unknown; sessionId?: string };
};

export type ExtensionPingMessage = { method: "ping" };
export type ExtensionPongMessage = { method: "pong" };

export type ExtensionMessage =
  | ExtensionResponseMessage
  | ExtensionForwardEventMessage
  | ExtensionPongMessage;

export type TargetInfo = {
  targetId: string;
  type?: string;
  title?: string;
  url?: string;
  attached?: boolean;
};

export type AttachedToTargetEvent = {
  sessionId: string;
  targetInfo: TargetInfo;
  waitingForDebugger?: boolean;
};

export type DetachedFromTargetEvent = {
  sessionId: string;
  targetId?: string;
};

export type ConnectedTarget = {
  sessionId: string;
  targetId: string;
  targetInfo: TargetInfo;
};

export type ChromeExtensionRelayServer = {
  host: string;
  bindHost: string;
  port: number;
  baseUrl: string;
  cdpWsUrl: string;
  extensionConnected: () => boolean;
  stop: () => Promise<void>;
};

export type RelayRuntime = {
  server: ChromeExtensionRelayServer;
  relayAuthToken: string;
};

export const RELAY_AUTH_HEADER = "x-openclaw-relay-token";
export const DEFAULT_EXTENSION_RECONNECT_GRACE_MS = 20_000;
export const DEFAULT_EXTENSION_COMMAND_RECONNECT_WAIT_MS = 3_000;
