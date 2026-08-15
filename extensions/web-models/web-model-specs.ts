// Static web model provider catalog and shared onboarding/config helpers.
// Extracted from api.ts to keep each file under the oxlint max-lines limit.
import {
  createDefaultModelsPresetAppliers,
  type ModelApi,
  type ModelDefinitionConfig,
  type ModelProviderConfig,
  type OpenClawConfig,
} from "openclaw/plugin-sdk/provider-onboard";

export type WebModelSpec = {
  id: string;
  label: string;
  baseUrl: string;
  defaultModelId: string;
  defaultAlias: string;
  models: ModelDefinitionConfig[];
};

const ZERO_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
} as const;

function buildTextModel(params: {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  reasoning?: boolean;
}): ModelDefinitionConfig {
  return {
    id: params.id,
    name: params.name,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: params.contextWindow,
    maxTokens: params.maxTokens,
    reasoning: params.reasoning ?? false,
  };
}

export const WEB_MODEL_SPECS = [
  {
    id: "chatgpt-web",
    label: "ChatGPT Web",
    baseUrl: "https://chatgpt.com",
    defaultModelId: "gpt-4",
    defaultAlias: "ChatGPT Web",
    models: [buildTextModel({ id: "gpt-4", name: "GPT-4", contextWindow: 8192, maxTokens: 4096 })],
  },
  {
    id: "claude-web",
    label: "Claude Web",
    baseUrl: "https://claude.ai",
    defaultModelId: "claude-sonnet-4-6",
    defaultAlias: "Claude Web",
    models: [
      buildTextModel({
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4",
        contextWindow: 200000,
        maxTokens: 8192,
      }),
      buildTextModel({
        id: "claude-opus-4-6",
        name: "Claude Opus 4",
        contextWindow: 200000,
        maxTokens: 8192,
      }),
      buildTextModel({
        id: "claude-haiku-4-6",
        name: "Claude Haiku 4",
        contextWindow: 200000,
        maxTokens: 8192,
      }),
    ],
  },
  {
    id: "deepseek-web",
    label: "DeepSeek Web",
    baseUrl: "https://chat.deepseek.com",
    defaultModelId: "deepseek-chat",
    defaultAlias: "DeepSeek Browser",
    models: [
      buildTextModel({
        id: "deepseek-chat",
        name: "DeepSeek V3",
        contextWindow: 64000,
        maxTokens: 4096,
      }),
      buildTextModel({
        id: "deepseek-reasoner",
        name: "DeepSeek R1",
        contextWindow: 64000,
        maxTokens: 4096,
        reasoning: true,
      }),
    ],
  },
  {
    id: "doubao-web",
    label: "Doubao Web",
    baseUrl: "https://www.doubao.com",
    defaultModelId: "doubao-seed-2.0",
    defaultAlias: "Doubao Browser",
    models: [
      buildTextModel({
        id: "doubao-seed-2.0",
        name: "Doubao Seed 2.0",
        contextWindow: 128000,
        maxTokens: 4096,
        reasoning: true,
      }),
      buildTextModel({
        id: "doubao-pro",
        name: "Doubao Pro",
        contextWindow: 128000,
        maxTokens: 4096,
      }),
    ],
  },
  {
    id: "gemini-web",
    label: "Gemini Web",
    baseUrl: "https://gemini.google.com",
    defaultModelId: "gemini-pro",
    defaultAlias: "Gemini Web",
    models: [
      buildTextModel({
        id: "gemini-pro",
        name: "Gemini Pro",
        contextWindow: 32768,
        maxTokens: 8192,
      }),
      buildTextModel({
        id: "gemini-ultra",
        name: "Gemini Ultra",
        contextWindow: 32768,
        maxTokens: 8192,
      }),
    ],
  },
  {
    id: "glm-web",
    label: "GLM Web (国内)",
    baseUrl: "https://chatglm.cn",
    defaultModelId: "glm-4-plus",
    defaultAlias: "GLM Web",
    models: [
      buildTextModel({
        id: "glm-4-plus",
        name: "GLM-4 Plus",
        contextWindow: 128000,
        maxTokens: 4096,
      }),
    ],
  },
  {
    id: "glm-intl-web",
    label: "GLM Web (国际)",
    baseUrl: "https://chat.z.ai",
    defaultModelId: "glm-4-plus",
    defaultAlias: "GLM International",
    models: [
      buildTextModel({
        id: "glm-4-plus",
        name: "GLM-4 Plus",
        contextWindow: 128000,
        maxTokens: 4096,
      }),
      buildTextModel({
        id: "glm-4-think",
        name: "GLM-4 Think",
        contextWindow: 128000,
        maxTokens: 4096,
        reasoning: true,
      }),
    ],
  },
  {
    id: "grok-web",
    label: "Grok Web",
    baseUrl: "https://grok.com",
    defaultModelId: "grok-2",
    defaultAlias: "Grok Web",
    models: [
      buildTextModel({
        id: "grok-2",
        name: "Grok 2",
        contextWindow: 131072,
        maxTokens: 8192,
      }),
    ],
  },
  {
    id: "kimi-web",
    label: "Kimi Web",
    baseUrl: "https://www.kimi.com",
    defaultModelId: "moonshot-v1-32k",
    defaultAlias: "Kimi Web",
    models: [
      buildTextModel({
        id: "moonshot-v1-32k",
        name: "Kimi",
        contextWindow: 128000,
        maxTokens: 4096,
      }),
    ],
  },
  {
    id: "qwen-web",
    label: "Qwen Web (阿里国内)",
    baseUrl: "https://chat.qwen.ai",
    defaultModelId: "qwen-max",
    defaultAlias: "Qwen Web",
    models: [
      buildTextModel({
        id: "qwen-max",
        name: "Qwen Max",
        contextWindow: 32768,
        maxTokens: 4096,
      }),
    ],
  },
  {
    id: "qwen-cn-web",
    label: "Qwen Web (阿里国际)",
    baseUrl: "https://chat2.qianwen.com",
    defaultModelId: "qwen-turbo",
    defaultAlias: "Qwen CN Web",
    models: [
      buildTextModel({
        id: "qwen-turbo",
        name: "Qwen Turbo",
        contextWindow: 100000,
        maxTokens: 4096,
      }),
    ],
  },
  {
    id: "manus-api",
    label: "Manus API",
    baseUrl: "https://api.manus.im",
    defaultModelId: "manus",
    defaultAlias: "Manus",
    models: [
      buildTextModel({
        id: "manus",
        name: "Manus",
        contextWindow: 128000,
        maxTokens: 4096,
      }),
    ],
  },
  {
    id: "xiaomimo-web",
    label: "Xiaomi Mimo Web",
    baseUrl: "https://aistudio.xiaomimimo.com",
    defaultModelId: "xiaomimo-chat",
    defaultAlias: "Xiaomi Mimo Web",
    models: [
      buildTextModel({
        id: "xiaomimo-chat",
        name: "MiMo Chat",
        contextWindow: 128000,
        maxTokens: 4096,
      }),
    ],
  },
  {
    id: "perplexity-web",
    label: "Perplexity Web",
    baseUrl: "https://www.perplexity.ai",
    defaultModelId: "perplexity-web",
    defaultAlias: "Perplexity Web",
    models: [
      buildTextModel({
        id: "perplexity-web",
        name: "Perplexity Sonar",
        contextWindow: 128000,
        maxTokens: 4096,
      }),
    ],
  },
] as const satisfies readonly WebModelSpec[];

export type WebModelProviderEntry = (typeof WEB_MODEL_SPECS)[number];
export type WebModelProviderId = (typeof WEB_MODEL_SPECS)[number]["id"];
export type BrowserBackedWebModelProviderId = Exclude<WebModelProviderId, "manus-api">;

function getRequiredWebModelSpec(providerId: WebModelProviderId): WebModelSpec {
  const spec = WEB_MODEL_SPECS.find((entry) => entry.id === providerId);
  if (!spec) {
    throw new Error(`Unknown web model provider: ${providerId}`);
  }
  return spec;
}

function toWebModelApi(providerId: string): ModelApi {
  return providerId as ModelApi;
}

function createWebModelPresetAppliers(providerId: WebModelProviderId) {
  const spec = getRequiredWebModelSpec(providerId);
  const primaryModelRef = `${spec.id}/${spec.defaultModelId}`;
  return createDefaultModelsPresetAppliers({
    primaryModelRef,
    resolveParams: (_cfg: OpenClawConfig) => ({
      providerId: spec.id,
      api: toWebModelApi(spec.id),
      baseUrl: spec.baseUrl,
      defaultModels: spec.models,
      defaultModelId: spec.defaultModelId,
      aliases: [{ modelRef: primaryModelRef, alias: spec.defaultAlias }],
    }),
  });
}

const WEB_MODEL_PRESET_APPLIERS = Object.fromEntries(
  WEB_MODEL_SPECS.map((spec) => [spec.id, createWebModelPresetAppliers(spec.id)]),
) as Record<WebModelProviderId, ReturnType<typeof createDefaultModelsPresetAppliers<[]>>>;

export function listWebModelProviders(): readonly WebModelProviderEntry[] {
  return WEB_MODEL_SPECS;
}

export function isBrowserBackedWebModelProvider(
  providerId: WebModelProviderId,
): providerId is BrowserBackedWebModelProviderId {
  return providerId !== "manus-api";
}

export function getWebModelProvider(providerId: WebModelProviderId): WebModelSpec {
  return getRequiredWebModelSpec(providerId);
}

export function getWebModelDefaultModelRef(providerId: WebModelProviderId): string {
  const spec = getRequiredWebModelSpec(providerId);
  return `${spec.id}/${spec.defaultModelId}`;
}

export function getWebModelDefinitions(providerId: WebModelProviderId): ModelDefinitionConfig[] {
  return getRequiredWebModelSpec(providerId).models;
}

export function buildWebModelProvider(providerId: WebModelProviderId): ModelProviderConfig {
  const spec = getRequiredWebModelSpec(providerId);
  return {
    baseUrl: spec.baseUrl,
    api: toWebModelApi(spec.id),
    models: spec.models,
  };
}

export function applyWebModelProviderConfig(
  cfg: OpenClawConfig,
  providerId: WebModelProviderId,
): OpenClawConfig {
  return WEB_MODEL_PRESET_APPLIERS[providerId].applyProviderConfig(cfg);
}

export function applyWebModelConfig(
  cfg: OpenClawConfig,
  providerId: WebModelProviderId,
): OpenClawConfig {
  return WEB_MODEL_PRESET_APPLIERS[providerId].applyConfig(cfg);
}
