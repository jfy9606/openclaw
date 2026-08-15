// Narrow plugin-sdk surface for the bundled web-models plugin.
// Keep this list additive and scoped to symbols used under extensions/web-models
// and the bundled AskOnce adapters.
import type { StreamFn } from "../agents/runtime/index.js";
import type { ModelDefinitionConfig } from "../config/types.models.js";
import { emptyPluginConfigSchema } from "../plugins/config-schema.js";
import type {
  OpenClawPluginApi,
  ProviderAuthContext,
  ProviderAuthResult,
} from "../plugins/types.js";
import {
  getWebStreamFactory as getZeroTokenWebStreamFactory,
  listWebStreamApiIds as listZeroTokenWebStreamApiIds,
  type WebStreamApiId,
} from "../zero-token/streams/web-stream-factories.js";
import { buildOauthProviderAuthResult } from "./provider-auth-result.js";

export { emptyPluginConfigSchema, buildOauthProviderAuthResult };
export type { OpenClawPluginApi, ProviderAuthContext, ProviderAuthResult, ModelDefinitionConfig };
export type WebModelStreamApiId = WebStreamApiId;

/**
 * Returns the canonical Zero Token web-stream factory for one bundled web-model
 * transport. The owning plugin uses this seam instead of reaching into
 * `src/zero-token/**` directly.
 */
export function getWebModelStreamFactory(api: string) {
  return getZeroTokenWebStreamFactory(api);
}

/** Lists the bundled web-model transport ids backed by Zero Token stream factories. */
export function listWebModelStreamApiIds(): WebModelStreamApiId[] {
  return listZeroTokenWebStreamApiIds();
}

/**
 * Builds a provider `createStreamFn` result that reads the credential from the
 * runtime stream options and dispatches through the canonical Zero Token
 * factory for that web transport.
 */
export function createConfiguredWebModelStreamFn(api: string): StreamFn | undefined {
  const factory = getWebModelStreamFactory(api);
  if (!factory) {
    return undefined;
  }
  return (model, context, options) => {
    const credential = options?.apiKey || "";
    return factory(credential)(model, context, options);
  };
}
