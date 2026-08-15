/**
 * DeepSeek Web 适配器
 */

import type { ModelResponse, AdapterQueryOptions } from "../types.js";
import { requireWebModelStreamFn, resolveStoredProviderCredential } from "../web-model-runtime.js";
import { BaseAdapter } from "./base.js";

export class DeepSeekAdapter extends BaseAdapter {
  readonly id = "deepseek-web";
  readonly name = "DeepSeek";
  readonly provider = "deepseek";
  readonly models = ["deepseek"];
  readonly defaultModel = "deepseek";
  // DeepSeek Web 实际使用的模型 ID
  private readonly actualModelId = "deepseek-chat";

  private cachedCredential: string | null = null;

  async isAvailable(): Promise<boolean> {
    const credential = await this.getCredential();
    return credential !== null;
  }

  private async getCredential(): Promise<string | null> {
    if (this.cachedCredential) {
      return this.cachedCredential;
    }

    try {
      this.cachedCredential = resolveStoredProviderCredential(this.id);
      return this.cachedCredential;
    } catch {
      return null;
    }
  }

  async query(question: string, options?: AdapterQueryOptions): Promise<ModelResponse> {
    const startTime = Date.now();
    const modelId = options?.modelId || this.defaultModel;

    try {
      const credential = await this.getCredential();
      if (!credential) {
        return this.createResponse(
          modelId,
          "error",
          "",
          "DeepSeek Web 未认证，请先运行 openclaw onboard deepseek-web",
          startTime,
        );
      }

      const streamFn = requireWebModelStreamFn(this.id, credential);

      const model = this.buildModel({
        id: this.actualModelId,
        name: "DeepSeek V3",
        api: this.id,
        provider: this.provider,
        baseUrl: "https://chat.deepseek.com",
        contextWindow: 64000,
        maxTokens: 4096,
      });

      // Use unique session ID for each query to start a new conversation
      const sessionId = `askonce-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const context = {
        messages: [{ role: "user", content: question }],
        systemPrompt: options?.systemPrompt || "",
        tools: [],
      };

      const stream = streamFn(model, context, { signal: options?.signal, sessionId });

      let content = "";
      try {
        for await (const event of stream) {
          if (event.type === "text_delta" && event.delta) {
            content += event.delta;
          } else if (event.type === "error") {
            return this.createResponse(
              modelId,
              "error",
              content,
              event.error?.errorMessage || "Stream error",
              startTime,
            );
          }
        }
      } catch (error) {
        return this.createResponse(
          modelId,
          "error",
          content,
          error instanceof Error ? error.message : String(error),
          startTime,
        );
      }

      return this.createResponse(modelId, "completed", content, undefined, startTime);
    } catch (error) {
      return this.createResponse(modelId, "error", "", this.parseError(error), startTime);
    }
  }
}
