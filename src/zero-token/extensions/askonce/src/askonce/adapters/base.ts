/**
 * 适配器基类
 */

import type { ModelAdapter, ModelResponse, AdapterQueryOptions } from "../types.js";

/**
 * 适配器抽象基类
 */
export abstract class BaseAdapter implements ModelAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly provider: string;
  abstract readonly models: string[];
  abstract readonly defaultModel: string;

  /**
   * 检查适配器是否可用
   * 子类需要实现认证检查逻辑
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * 执行查询
   * 子类需要实现具体的查询逻辑
   */
  abstract query(question: string, options?: AdapterQueryOptions): Promise<ModelResponse>;

  /**
   * 创建响应对象
   */
  protected createResponse(
    modelId: string,
    status: ModelResponse["status"],
    content = "",
    error?: string,
    startTime: number = Date.now(),
  ): ModelResponse {
    return {
      modelId,
      modelName: this.name,
      provider: this.provider,
      status,
      content,
      error,
      responseTime: Date.now() - startTime,
      charCount: content.length,
      timestamp: Date.now(),
    };
  }

  /**
   * 延迟执行
   */
  protected delay(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * 解析错误消息
   */
  protected parseError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  /**
   * 构造完整 Model 对象，满足 StreamFn 第一参数类型约束。
   * 从适配器提供的元数据组装，消除手写三字段对象 + as any。
   */
  protected buildModel(params: {
    id: string;
    name: string;
    api: string;
    provider: string;
    baseUrl: string;
    contextWindow: number;
    maxTokens: number;
    reasoning?: boolean;
  }) {
    return {
      id: params.id,
      name: params.name,
      api: params.api,
      provider: params.provider,
      baseUrl: params.baseUrl,
      reasoning: params.reasoning ?? false,
      input: ["text"] as ("text" | "image")[],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: params.contextWindow,
      maxTokens: params.maxTokens,
    };
  }
}
