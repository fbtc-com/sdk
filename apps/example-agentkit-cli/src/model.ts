import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";

/**
 * Resolve the chat model from env, matching example-agent-chat's GLM wiring.
 *
 * MODEL_PROVIDER:
 *   - anthropic (default): ANTHROPIC_API_KEY + Claude
 *   - glm | zhipu | zai: GLM via OpenAI-compatible or Anthropic-compatible gateway
 *
 * GLM gateways (auto-detected from GLM_BASE_URL):
 *   - OpenAI-compatible:  https://open.bigmodel.cn/api/paas/v4
 *   - Anthropic-compatible: https://api.z.ai/api/anthropic
 */
export function resolveModel(): BaseChatModel {
  const provider = (process.env.MODEL_PROVIDER || "anthropic").toLowerCase();
  if (provider === "glm" || provider === "zhipu" || provider === "zai") {
    return resolveGlmModel();
  }

  return new ChatAnthropic({
    model: process.env.MODEL_NAME || "claude-sonnet-4-20250514",
    temperature: 0,
  });
}

function resolveGlmModel(): BaseChatModel {
  const apiKey =
    process.env.GLM_API_KEY ||
    process.env.ZHIPUAI_API_KEY ||
    process.env.ZAI_API_KEY;
  const baseURL =
    process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
  const modelName = process.env.MODEL_NAME || "glm-5.2";

  if (!apiKey) {
    throw new Error(
      "Missing GLM API key. Set GLM_API_KEY, ZHIPUAI_API_KEY, or ZAI_API_KEY.",
    );
  }

  if (baseURL.includes("/anthropic")) {
    // @anthropic-ai/sdk (used by ChatAnthropic) posts to "/v1/messages" and
    // expects baseURL WITHOUT "/v1" (default is https://api.anthropic.com).
    // example-agent-chat uses @ai-sdk/anthropic, which appends only "/messages"
    // and therefore needs "/v1" on the base — do the opposite here.
    // Accept both .../api/anthropic and .../api/anthropic/v1 from env.
    const anthropicBase = baseURL.replace(/\/v1\/?$/, "");
    return new ChatAnthropic({
      model: modelName,
      temperature: 0,
      // ChatAnthropic defaults topP to -1 ("omit" for Anthropic). GLM's gateway
      // validates top_p ∈ [0,1] and rejects -1, so set an explicit in-range value.
      topP: 1,
      anthropicApiKey: apiKey,
      anthropicApiUrl: anthropicBase,
    });
  }

  return new ChatOpenAI({
    model: modelName,
    temperature: 0,
    apiKey,
    configuration: { baseURL },
  });
}

/** Env vars required for the selected model provider (excluding wallet). */
export function requiredModelEnvVars(): string[] {
  const provider = (process.env.MODEL_PROVIDER || "anthropic").toLowerCase();
  if (provider === "glm" || provider === "zhipu" || provider === "zai") {
    const hasGlmKey =
      process.env.GLM_API_KEY ||
      process.env.ZHIPUAI_API_KEY ||
      process.env.ZAI_API_KEY;
    return hasGlmKey ? [] : ["GLM_API_KEY"];
  }
  return process.env.ANTHROPIC_API_KEY ? [] : ["ANTHROPIC_API_KEY"];
}
