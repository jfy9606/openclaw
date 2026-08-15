// Public API for the bundled web-models plugin.
// Split into web-model-specs.ts (catalog + provider config) and
// web-model-auth-spec.ts (auth specs + credential builders) to stay under
// the oxlint max-lines limit. This file re-exports the public surface and
// keeps the BASE_URL/DEFAULT_MODEL_ID constants and provider builders.
import type { ModelProviderConfig } from "openclaw/plugin-sdk/provider-onboard";
import { buildWebModelProvider, getWebModelProvider } from "./web-model-specs.js";

export {
  WEB_MODEL_SPECS,
  listWebModelProviders,
  isBrowserBackedWebModelProvider,
  getWebModelProvider,
  getWebModelDefaultModelRef,
  getWebModelDefinitions,
  buildWebModelProvider,
  applyWebModelProviderConfig,
  applyWebModelConfig,
  type WebModelSpec,
  type WebModelProviderEntry,
  type WebModelProviderId,
  type BrowserBackedWebModelProviderId,
} from "./web-model-specs.js";

export {
  getWebModelManualAuthSpec,
  buildWebModelProviderAuthResult,
  buildBrowserCookieCredentialValue,
  buildChatGPTWebCredentialValue,
  buildClaudeWebCredentialValue,
  buildDeepseekWebCredentialValue,
  buildDoubaoWebCredentialValue,
  buildQwenCNWebCredentialValue,
  type WebModelManualAuthFieldId,
  type WebModelManualAuthField,
  type WebModelManualAuthSpec,
  type WebModelManualAuthInput,
} from "./web-model-auth-spec.js";

export const CHATGPT_WEB_BASE_URL = getWebModelProvider("chatgpt-web").baseUrl;
export const CHATGPT_WEB_DEFAULT_MODEL_ID = getWebModelProvider("chatgpt-web").defaultModelId;
export const CLAUDE_WEB_BASE_URL = getWebModelProvider("claude-web").baseUrl;
export const CLAUDE_WEB_DEFAULT_MODEL_ID = getWebModelProvider("claude-web").defaultModelId;
export const DEEPSEEK_WEB_BASE_URL = getWebModelProvider("deepseek-web").baseUrl;
export const DEEPSEEK_WEB_DEFAULT_MODEL_ID = getWebModelProvider("deepseek-web").defaultModelId;
export const DOUBAO_WEB_BASE_URL = getWebModelProvider("doubao-web").baseUrl;
export const DOUBAO_WEB_DEFAULT_MODEL_ID = getWebModelProvider("doubao-web").defaultModelId;
export const GEMINI_WEB_BASE_URL = getWebModelProvider("gemini-web").baseUrl;
export const GEMINI_WEB_DEFAULT_MODEL_ID = getWebModelProvider("gemini-web").defaultModelId;
export const GLM_INTL_WEB_BASE_URL = getWebModelProvider("glm-intl-web").baseUrl;
export const GLM_INTL_WEB_DEFAULT_MODEL_ID = getWebModelProvider("glm-intl-web").defaultModelId;
export const GROK_WEB_BASE_URL = getWebModelProvider("grok-web").baseUrl;
export const GROK_WEB_DEFAULT_MODEL_ID = getWebModelProvider("grok-web").defaultModelId;
export const KIMI_WEB_BASE_URL = getWebModelProvider("kimi-web").baseUrl;
export const KIMI_WEB_DEFAULT_MODEL_ID = getWebModelProvider("kimi-web").defaultModelId;
export const PERPLEXITY_WEB_BASE_URL = getWebModelProvider("perplexity-web").baseUrl;
export const PERPLEXITY_WEB_DEFAULT_MODEL_ID = getWebModelProvider("perplexity-web").defaultModelId;
export const QWEN_CN_WEB_BASE_URL = getWebModelProvider("qwen-cn-web").baseUrl;
export const QWEN_CN_WEB_DEFAULT_MODEL_ID = getWebModelProvider("qwen-cn-web").defaultModelId;
export const QWEN_WEB_BASE_URL = getWebModelProvider("qwen-web").baseUrl;
export const QWEN_WEB_DEFAULT_MODEL_ID = getWebModelProvider("qwen-web").defaultModelId;
export const XIAOMIMO_WEB_BASE_URL = getWebModelProvider("xiaomimo-web").baseUrl;
export const XIAOMIMO_WEB_DEFAULT_MODEL_ID = getWebModelProvider("xiaomimo-web").defaultModelId;
export const Z_WEB_BASE_URL = getWebModelProvider("glm-web").baseUrl;
export const Z_WEB_DEFAULT_MODEL_ID = getWebModelProvider("glm-web").defaultModelId;

export async function buildChatGPTWebProvider(): Promise<ModelProviderConfig> {
  return buildWebModelProvider("chatgpt-web");
}

export async function buildClaudeWebProvider(): Promise<ModelProviderConfig> {
  return buildWebModelProvider("claude-web");
}

export async function buildDeepseekWebProvider(): Promise<ModelProviderConfig> {
  return buildWebModelProvider("deepseek-web");
}

export async function buildDoubaoWebProvider(): Promise<ModelProviderConfig> {
  return buildWebModelProvider("doubao-web");
}

export async function buildGeminiWebProvider(): Promise<ModelProviderConfig> {
  return buildWebModelProvider("gemini-web");
}

export async function buildGlmIntlWebProvider(): Promise<ModelProviderConfig> {
  return buildWebModelProvider("glm-intl-web");
}

export async function buildGrokWebProvider(): Promise<ModelProviderConfig> {
  return buildWebModelProvider("grok-web");
}

export async function buildKimiWebProvider(): Promise<ModelProviderConfig> {
  return buildWebModelProvider("kimi-web");
}

export async function buildPerplexityWebProvider(): Promise<ModelProviderConfig> {
  return buildWebModelProvider("perplexity-web");
}

export async function buildQwenCNWebProvider(): Promise<ModelProviderConfig> {
  return buildWebModelProvider("qwen-cn-web");
}

export async function buildQwenWebProvider(): Promise<ModelProviderConfig> {
  return buildWebModelProvider("qwen-web");
}

export async function buildXiaomiMimoWebProvider(): Promise<ModelProviderConfig> {
  return buildWebModelProvider("xiaomimo-web");
}

export async function buildZWebProvider(): Promise<ModelProviderConfig> {
  return buildWebModelProvider("glm-web");
}
