/**
 * DeepSeek LLM 实现（复用既有 DEEPSEEK_API_KEY）。
 *
 * 选型理由：1M 上下文 + 缓存命中价极低，适合把大量生平资料放进 systemPrompt；
 *          中文表现好，且项目里已有调用先例（lib/ai.ts）。
 */

import {
  type LlmInput,
  type LlmProvider,
  type LlmResult,
  makeLabel,
} from "./types";

const ENDPOINT = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";
const TIMEOUT_MS = 30000;

function buildBody(input: LlmInput, stream: boolean) {
  return JSON.stringify({
    model: MODEL,
    messages: [
      { role: "system", content: input.systemPrompt },
      ...input.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    temperature: input.temperature ?? 0.75,
    stream,
  });
}

export class DeepSeekLlm implements LlmProvider {
  readonly kind = "deepseek" as const;

  constructor(private readonly apiKey: string) {}

  async chat(input: LlmInput): Promise<LlmResult> {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: buildBody(input, false),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`DeepSeek ${res.status}: ${await res.text().catch(() => "")}`);
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("DeepSeek 返回空内容");

    return {
      text,
      label: makeLabel("deepseek", MODEL),
      usage: data?.usage
        ? {
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
          }
        : undefined,
    };
  }

  async *chatStream(input: LlmInput): AsyncGenerator<string, LlmResult, void> {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: buildBody(input, true),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok || !res.body) {
      throw new Error(`DeepSeek stream ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    let usage: LlmResult["usage"];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE：按 \n\n 分帧，逐行取 data:
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const delta: string = json?.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              full += delta;
              yield delta;
            }
            if (json?.usage) {
              usage = {
                promptTokens: json.usage.prompt_tokens ?? 0,
                completionTokens: json.usage.completion_tokens ?? 0,
              };
            }
          } catch {
            // 跳过无法解析的帧，不中断流
          }
        }
      }
    }

    return { text: full, label: makeLabel("deepseek", MODEL), usage };
  }
}
