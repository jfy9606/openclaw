import {
  definePluginEntry,
  type ProviderAuthContext,
  type UnifiedModelCatalogEntry,
} from "openclaw/plugin-sdk/plugin-entry";
import { createConfiguredWebModelStreamFn } from "openclaw/plugin-sdk/web-models";
import {
  buildWebModelProviderAuthResult,
  getWebModelManualAuthSpec,
  isBrowserBackedWebModelProvider,
  listWebModelProviders,
  type BrowserBackedWebModelProviderId,
  type WebModelManualAuthInput,
} from "./api.js";
import { captureWebModelBrowserAuthInput } from "./browser-auth.js";

async function handleLegacyWebModelsAuth() {
  return {
    profiles: [],
    notes: [
      "This provider still uses the legacy onboarding/auth-choice path.",
      "Use `openclaw onboard` or the existing Manus API key flow for now.",
    ],
  };
}

async function handleManualWebAuth(
  providerId: BrowserBackedWebModelProviderId,
  ctx: ProviderAuthContext,
) {
  const spec = getWebModelManualAuthSpec(providerId);
  const input: WebModelManualAuthInput = {};

  await ctx.prompter.note(spec.lines.join("\n"), spec.title);
  for (const field of spec.fields) {
    input[field.id] = await ctx.prompter.text({
      message: field.message,
      ...(field.hint ? { hint: field.hint } : {}),
      ...(field.placeholder ? { placeholder: field.placeholder } : {}),
      validate: field.optional
        ? undefined
        : (value) => (value.trim().length > 0 ? undefined : "Required"),
    });
  }

  return buildWebModelProviderAuthResult({
    config: ctx.config,
    providerId,
    input,
    ...(ctx.secretInputMode ? { secretInputMode: ctx.secretInputMode } : {}),
  });
}

async function handleBrowserWebAuth(
  providerId: BrowserBackedWebModelProviderId,
  ctx: ProviderAuthContext,
) {
  const progress = ctx.prompter.progress("Preparing automated login...");
  try {
    const input = await captureWebModelBrowserAuthInput({
      config: ctx.config,
      openUrl: ctx.openUrl,
      progress,
      prompter: ctx.prompter,
      providerId,
    });
    progress.stop("Browser login captured");
    return buildWebModelProviderAuthResult({
      config: ctx.config,
      providerId,
      input,
      ...(ctx.secretInputMode ? { secretInputMode: ctx.secretInputMode } : {}),
    });
  } catch (error) {
    progress.stop("Browser login failed");
    throw error;
  }
}

const webModelsPlugin = definePluginEntry({
  id: "web-models",
  name: "Web Models",
  description: "Web-based AI model providers (ChatGPT Web, Claude Web, DeepSeek Web, etc.)",
  register(api) {
    for (const provider of listWebModelProviders()) {
      const providerId = provider.id;
      api.registerProvider({
        id: providerId,
        label: provider.label,
        createStreamFn: ({ model }) => createConfiguredWebModelStreamFn(model.api),
        auth: isBrowserBackedWebModelProvider(providerId)
          ? [
              {
                id: "web",
                label: "Web Browser Auth",
                hint: "Open or attach to Chrome and capture browser auth automatically",
                kind: "custom",
                run: (ctx) => handleBrowserWebAuth(providerId, ctx),
              },
              {
                id: "manual-web",
                label: "Manual Browser Auth",
                hint: "Paste browser cookies or headers manually",
                kind: "custom",
                run: (ctx) => handleManualWebAuth(providerId, ctx),
              },
            ]
          : [
              {
                id: "web",
                label: "Legacy Auth",
                hint: "Manus API still uses the legacy API-key onboarding flow",
                kind: "custom",
                run: handleLegacyWebModelsAuth,
              },
            ],
      });

      api.registerModelCatalogProvider({
        provider: providerId,
        kinds: ["text"],
        staticCatalog: () =>
          provider.models.map(
            (model): UnifiedModelCatalogEntry => ({
              kind: "text",
              provider: provider.id,
              model: model.id,
              label: model.name,
              source: "static",
              default: model.id === provider.defaultModelId,
            }),
          ),
      });
    }
  },
});

export default webModelsPlugin;
