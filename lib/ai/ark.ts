/**
 * 火山方舟（Volcengine Ark / 豆包）LLM 实现。
 *
 * 选型背景：用户持有一把 ark- 开头的方舟 Key，名下的 doubao-seed-character
 * 系列模型已开通，且「人设对话」天然契合「午夜悄悄话」的追思场景。
 *
 * 接入方式：方舟提供 OpenAI 兼容的 /chat/completions 端点，本实现直接复用
 *           既有 LlmInput/LlmResult 契约，与 DeepSeek 实现平级。
 *
 * ⚠️ 仅当环境变量 ARK_API_KEY 存在时由工厂实例化（见 index.ts）。
 *    未配置则整条链路回退 Mock，不影响内测演示。
 */

import {
  type LlmInput,
  type LlmProvider,
  type LlmResult,
  makeLabel,
} from "./types";

const ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
const DEFAULT_MODEL = "doubao-seed-character-260628";
const TIMEOUT_MS = 30000;

function readConfig() {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.ARK_MODEL || DEFAULT_MODEL,
  };
}

function buildBody(input: LlmInput, stream: boolean) {
  return JSON.stringify({
    model: readConfig()!.model,
    messages: [
      { role: "system", content: input.systemPrompt },
      ...input.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    temperature: input.temperature ?? 0.75,
    stream,
  });
}

export class ArkLlm implements LlmProvider {
  readonly kind = "ark" as const;

  constructor(private readonly apiKey: string) {}

  async chat(input: LlmInput): Promise<LlmResult> {
    const cfg = readConfig()!;
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
      throw new Error(`Ark ${res.status}: ${await res.text().catch(() => "")}`);
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("Ark 返回空内容");

    return {
      text,
      label: makeLabel("ark", cfg.model),
      usage: data?.usage
        ? {
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
          }
        : undefined,
    };
  }

  async *chatStream(input: LlmInput): AsyncGenerator<string, LlmResult, void> {
    const cfg = readConfig()!;
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
      throw new Error(`Ark stream ${res.status}`);
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

    return { text: full, label: makeLabel("ark", cfg.model), usage };
  }
}

export function arkConfigAvailable(): boolean {
  return readConfig() !== null;
}
