import { ensureAuthProfileStore, listProfilesForProvider } from "openclaw/plugin-sdk/provider-auth";
import { getWebModelStreamFactory } from "openclaw/plugin-sdk/web-models";

export function resolveStoredProviderCredential(providerId: string): string | null {
  const store = ensureAuthProfileStore(undefined, { allowKeychainPrompt: false });
  const profileIds = listProfilesForProvider(store, providerId);
  const profileId = profileIds[0];
  if (!profileId) {
    return null;
  }

  const credential = store.profiles[profileId];
  if (!credential) {
    return null;
  }
  if (credential.type === "api_key" && credential.key) {
    return credential.key;
  }
  if (credential.type === "oauth") {
    return JSON.stringify(credential);
  }
  if (credential.type === "token" && credential.token) {
    return credential.token;
  }
  return null;
}

export function requireWebModelStreamFn(providerId: string, credential: string) {
  const factory = getWebModelStreamFactory(providerId);
  if (!factory) {
    throw new Error(`Missing web-model stream factory for provider: ${providerId}`);
  }
  return factory(credential);
}
