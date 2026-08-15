/**
 * Browser web-auth API barrel. It exposes the narrow managed-Chrome and CDP
 * helpers that browser-backed auth flows need.
 */
export type { ResolvedBrowserConfig, ResolvedBrowserProfile } from "./src/browser/config.js";
export type BrowserWebAuthChromeHandle = Awaited<
  ReturnType<typeof import("./src/browser/chrome.js").launchOpenClawChrome>
>;
export {
  resolveBrowserConfig as resolveBrowserWebAuthConfig,
  resolveProfile as resolveBrowserWebAuthProfile,
} from "./src/browser/config.js";
export { getHeadersWithAuth as getBrowserWebAuthHeaders } from "./src/browser/cdp.helpers.js";
export {
  getChromeWebSocketUrl as getBrowserWebSocketUrl,
  launchOpenClawChrome as launchBrowserWebAuthChrome,
  stopOpenClawChrome as stopBrowserWebAuthChrome,
} from "./src/browser/chrome.js";
