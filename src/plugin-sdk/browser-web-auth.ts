/**
 * Public SDK facade for browser-backed web auth helpers.
 */
import type { ResolvedBrowserConfig, ResolvedBrowserProfile } from "./browser-types.js";
import { loadBundledPluginPublicSurfaceModuleSyncCore } from "./facade-loader.js";

export type { ResolvedBrowserConfig, ResolvedBrowserProfile } from "./browser-types.js";

/** Opaque handle returned when the browser plugin launches managed Chrome. */
export type BrowserWebAuthChromeHandle = {
  cdpPort: number;
  proc?: unknown;
};

type BrowserWebAuthSurface = {
  resolveBrowserWebAuthConfig: (cfg: unknown, rootConfig?: unknown) => ResolvedBrowserConfig;
  resolveBrowserWebAuthProfile: (
    resolved: ResolvedBrowserConfig,
    profileName: string,
  ) => ResolvedBrowserProfile | null;
  getBrowserWebAuthHeaders: (
    url: string,
    headers?: Record<string, string>,
  ) => Record<string, string>;
  getBrowserWebSocketUrl: (cdpUrl: string, timeoutMs?: number) => Promise<string | null>;
  launchBrowserWebAuthChrome: (
    resolved: ResolvedBrowserConfig,
    profile: ResolvedBrowserProfile,
  ) => Promise<BrowserWebAuthChromeHandle>;
  stopBrowserWebAuthChrome: (running: BrowserWebAuthChromeHandle) => Promise<void>;
};

let cachedBrowserWebAuthSurface: BrowserWebAuthSurface | undefined;

function loadBrowserWebAuthSurface(): BrowserWebAuthSurface {
  cachedBrowserWebAuthSurface ??=
    loadBundledPluginPublicSurfaceModuleSyncCore<BrowserWebAuthSurface>({
      dirName: "browser",
      artifactBasename: "browser-web-auth.js",
    });
  return cachedBrowserWebAuthSurface;
}

/** Resolves browser config through the bundled browser plugin facade. */
export function resolveBrowserWebAuthConfig(
  cfg: unknown,
  rootConfig?: unknown,
): ResolvedBrowserConfig {
  return loadBrowserWebAuthSurface().resolveBrowserWebAuthConfig(cfg, rootConfig);
}

/** Resolves a named browser profile through the bundled browser plugin facade. */
export function resolveBrowserWebAuthProfile(
  resolved: ResolvedBrowserConfig,
  profileName: string,
): ResolvedBrowserProfile | null {
  return loadBrowserWebAuthSurface().resolveBrowserWebAuthProfile(resolved, profileName);
}

/** Builds auth headers for a browser-managed CDP target URL. */
export function getBrowserWebAuthHeaders(
  url: string,
  headers?: Record<string, string>,
): Record<string, string> {
  return loadBrowserWebAuthSurface().getBrowserWebAuthHeaders(url, headers);
}

/** Resolves the WebSocket URL for a CDP endpoint, retrying until it appears. */
export async function getBrowserWebSocketUrl(
  cdpUrl: string,
  timeoutMs?: number,
): Promise<string | null> {
  return await loadBrowserWebAuthSurface().getBrowserWebSocketUrl(cdpUrl, timeoutMs);
}

/** Launches managed Chrome for a browser-backed auth flow. */
export async function launchBrowserWebAuthChrome(
  resolved: ResolvedBrowserConfig,
  profile: ResolvedBrowserProfile,
): Promise<BrowserWebAuthChromeHandle> {
  return await loadBrowserWebAuthSurface().launchBrowserWebAuthChrome(resolved, profile);
}

/** Stops managed Chrome launched for a browser-backed auth flow. */
export async function stopBrowserWebAuthChrome(running: BrowserWebAuthChromeHandle): Promise<void> {
  await loadBrowserWebAuthSurface().stopBrowserWebAuthChrome(running);
}
