/**
 * Web Stream Middleware — unified input/output processing for all web models.
 *
 * Input:  Aggregates history/system prompt/tools → injects tool prompt
 * Output: parse tool calls from response → emit ToolCall events
 *
 * This middleware replaces the per-stream prompt manipulation that was
 * previously duplicated across 13 stream files.
 */

import type {
  AssistantMessage,
  AssistantMessageEvent,
  TextContent,
  ToolCall,
  ToolResultMessage,
  StreamFunction as StreamFn,
} from "../../llm/types.js";
import { createAssistantMessageEventStream } from "../../llm/utils/event-stream.js";
import { stripInboundMeta } from "../streams/strip-inbound-meta.js";
import { extractToolCall } from "./web-tool-parser.js";
import { shouldInjectToolPrompt, getToolPrompt } from "./web-tool-prompt.js";

/**
 * Quick keyword check: does this message likely need tool use?
 */
function needsToolInjection(message: string): boolean {
  const lower = message.toLowerCase();
  const keywords = [
    "文件",
    "file",
    "read",
    "write",
    "创建",
    "写入",
    "读取",
    "保存",
    "目录",
    "directory",
    "folder",
    "执行",
    "运行",
    "命令",
    "command",
    "run",
    "exec",
    "terminal",
    "shell",
    "搜索",
    "search",
    "查找",
    "fetch",
    "抓取",
    "网页",
    "url",
    "http",
    "帮我",
    "help me",
    "查看",
    "check",
    "看看",
    "show",
    "下载",
    "安装",
    "更新",
  ];
  return keywords.some((kw) => lower.includes(kw));
}

export function wrapWithToolCalling(streamFn: StreamFn, api: string): StreamFn {
  return (model, context, options) => {
    const messages = context.messages || [];
    const systemPrompt = context.systemPrompt || "";
    const tools = context.tools || [];
    const hasAgentTools = tools.length > 0;

    const isFirstTurn = messages.length <= 1;
    let finalPrompt: string;

    // 1. Handle tool result feedback
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === "toolResult") {
      const tr = lastMsg as unknown as ToolResultMessage;
      let resultText = "";
      if (Array.isArray(tr.content)) {
        for (const part of tr.content) {
          if (part.type === "text" && part.text) {
            resultText += part.text;
          }
        }
      }
      const feedbackPrompt = `Tool ${tr.toolName || "unknown"} returned: ${resultText}\nPlease continue based on this result.`;
      const injectTools = shouldInjectToolPrompt(api) && hasAgentTools;
      finalPrompt = injectTools ? getToolPrompt(api, tools) + feedbackPrompt : feedbackPrompt;
    } else {
      // 2. Handle standard turn
      let userMessage = "";
      const lastUserMsg = [...messages].toReversed().find((m) => m.role === "user");
      if (lastUserMsg) {
        if (typeof lastUserMsg.content === "string") {
          userMessage = lastUserMsg.content;
        } else if (Array.isArray(lastUserMsg.content)) {
          userMessage = (lastUserMsg.content as TextContent[])
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join("");
        }
      }
      userMessage = stripInboundMeta(userMessage);

      if (isFirstTurn) {
        // Aggregate full history for first turn
        const historyParts: string[] = [];
        if (systemPrompt) {
          historyParts.push(`System: ${systemPrompt}`);
        }
        if (shouldInjectToolPrompt(api) && hasAgentTools) {
          historyParts.push(getToolPrompt(api, tools));
        }
        for (const m of messages) {
          const role = m.role === "assistant" ? "Assistant" : "User";
          const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
          historyParts.push(`${role}: ${content}`);
        }
        finalPrompt = historyParts.join("\n\n");
      } else {
        // Continuing turn: just send the last message
        const injectTools =
          shouldInjectToolPrompt(api) && hasAgentTools && needsToolInjection(userMessage);
        finalPrompt = injectTools ? getToolPrompt(api, tools) + userMessage : userMessage;
      }
    }

    if (!finalPrompt) {
      return streamFn(model, context, options);
    }

    const modifiedContext = Object.assign({}, context, {
      messages: [{ role: "user" as const, content: finalPrompt }],
      tools: [] as typeof context.tools,
      systemPrompt: "",
    });

    console.log(`[WebStreamMiddleware] api=${api} promptLen=${finalPrompt.length}`);

    // --- Output wrapping ---
    const originalStreamOrPromise = streamFn(model, modifiedContext, options);
    const wrappedStream = createAssistantMessageEventStream();

    const processEvents = async () => {
      try {
        const originalStream = await Promise.resolve(originalStreamOrPromise);
        let accumulatedText = "";
        let toolCallEmitted = false;

        for await (const event of originalStream) {
          if (event.type === "done") {
            const finalMsg = event.message;
            if (finalMsg && Array.isArray(finalMsg.content)) {
              for (const part of finalMsg.content) {
                if (part.type === "text" && part.text) {
                  accumulatedText = part.text;
                }
              }
            }

            const toolCall = extractToolCall(accumulatedText);
            if (toolCall) {
              toolCallEmitted = true;
              const toolId = `web_tool_${Date.now()}`;
              const toolCallPart: ToolCall = {
                type: "toolCall",
                id: toolId,
                name: toolCall.tool,
                arguments: toolCall.parameters,
              };
              const toolMsg: AssistantMessage = {
                role: "assistant",
                content: [toolCallPart],
                stopReason: "toolUse",
                api: model.api,
                provider: model.provider,
                model: model.id,
                usage: finalMsg?.usage ?? {
                  input: 0,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                  totalTokens: 0,
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                },
                timestamp: Date.now(),
              };

              wrappedStream.push({ type: "toolcall_start", contentIndex: 0, partial: toolMsg });
              wrappedStream.push({
                type: "toolcall_end",
                contentIndex: 0,
                toolCall: toolCallPart,
                partial: toolMsg,
              });
              wrappedStream.push({ type: "done", reason: "toolUse", message: toolMsg });
            } else {
              wrappedStream.push(event);
            }
          } else if (!toolCallEmitted) {
            wrappedStream.push(event);
          }
        }
      } catch (err) {
        wrappedStream.push({
          type: "error",
          reason: "error",
          error: {
            role: "assistant",
            content: [],
            stopReason: "error",
            errorMessage: err instanceof Error ? err.message : String(err),
            api: model.api,
            provider: model.provider,
            model: model.id,
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            timestamp: Date.now(),
          },
        } as AssistantMessageEvent);
      } finally {
        wrappedStream.end();
      }
    };

    queueMicrotask(() => void processEvents());
    return wrappedStream;
  };
}
