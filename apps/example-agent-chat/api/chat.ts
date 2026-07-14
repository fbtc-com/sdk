import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { functionTools as allFunctionTools } from '@functionFBTC/sdk-agent/vercel';
import { streamText } from 'ai';

// Vercel serverless function for /api/chat
// Runs server-side on Vercel, keeping API keys out of the browser.

const anthropic = createAnthropic();

const FUNCTION_TOOL_NAMES = new Set([
  'get_aave_fbtc_reserve',
  'prepare_aave_supply_fbtc',
  'get_token_balance',
  'get_token_info',
]);
const functionTools = Object.fromEntries(
  Object.entries(allFunctionTools).filter(([name]) =>
    FUNCTION_TOOL_NAMES.has(name),
  ),
);

const FUNCTION_SYSTEM_PROMPT = `You are the Function FBTC assistant.
Be concise and explicit about networks, token addresses, transaction steps, and wallet confirmation.
Never invent contract addresses, balances, rates, transaction hashes, or transaction success.
Tool results are authoritative for prepared calldata. A prepared transaction is not submitted or confirmed.
When an address-bound operation is requested without a connected wallet, ask the user to connect one.
`;

// GLM/ZhipuAI is reachable through two different protocols, and the SDK
// client must match whichever gateway the base URL points at:
//   - OpenAI-compatible:  https://open.bigmodel.cn/api/paas/v4 (or api.z.ai/api/paas/v4)
//   - Anthropic-compatible: https://api.z.ai/api/anthropic
// They speak different request/response shapes, so the client is built per
// call. Some accounts only carry balance on the Anthropic gateway, so both
// must keep working.
function resolveGlmModel() {
  const apiKey =
    process.env.GLM_API_KEY ||
    process.env.ZHIPUAI_API_KEY ||
    process.env.ZAI_API_KEY;
  const baseURL =
    process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
  const modelName = process.env.MODEL_NAME || 'glm-5.2';

  if (baseURL.includes('/anthropic')) {
    // The @ai-sdk/anthropic client appends "/messages" to baseURL and expects
    // the "/v1" segment to already be present (its default is api.anthropic.com/v1).
    // z.ai documents its Anthropic gateway as "https://api.z.ai/api/anthropic"
    // (without /v1); that path 404s and z.ai wraps the error in an HTTP 200 body,
    // which the SDK can't parse. Normalize so both .../api/anthropic and
    // .../api/anthropic/v1 resolve to the working .../api/anthropic/v1/messages.
    const anthropicBase = baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`;
    return createAnthropic({ apiKey, baseURL: anthropicBase })(modelName);
  }
  return createOpenAI({ apiKey, baseURL })(modelName);
}

function resolveModel() {
  const provider = (process.env.MODEL_PROVIDER || 'anthropic').toLowerCase();
  if (provider === 'glm' || provider === 'zhipu' || provider === 'zai') {
    return resolveGlmModel();
  }

  return anthropic(process.env.MODEL_NAME || 'claude-sonnet-4-6');
}

const AAVE_DEMO_PROMPT = `

# Function FBTC supply on Aave V3

This app is configured only for supplying Function FBTC to the Aave V3 Ethereum Core market.
FBTC means the ERC-20 token at 0xc96de26018a54d51c097160568752c4e3bd6c364 on Ethereum mainnet.
When the user asks about the Aave FBTC reserve, call get_aave_fbtc_reserve.
When the user asks to supply or deposit FBTC to Aave V3, call prepare_aave_supply_fbtc using the exact amount stated by the user and walletContext.address.
The prepared transactions use chainId 1. The front-end asks the wallet to switch to Ethereum Mainnet before execution.
Explain that execution requires two wallet confirmations: an exact-amount ERC-20 approval and Aave Pool.supply.
Do not claim the transaction succeeded until the wallet transaction is submitted.
`;

export async function POST(request: Request) {
  const { messages, walletContext } = await request.json();

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(
      JSON.stringify({ error: 'messages must be a non-empty array' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // Incomplete tool calls (state: "call") break convertToCoreMessages on the
  // next turn — e.g. after a timed-out get_token_balance. Drop them before
  // handing history to the model.
  const safeMessages = sanitizeMessages(messages);

  let system = `${FUNCTION_SYSTEM_PROMPT}${AAVE_DEMO_PROMPT}`;
  if (walletContext) {
    const addr =
      typeof walletContext.address === 'string' &&
      /^0x[a-fA-F0-9]{40}$/.test(walletContext.address)
        ? walletContext.address
        : null;
    const chainId =
      typeof walletContext.chainId === 'number' ? walletContext.chainId : null;
    const chainName =
      typeof walletContext.chainName === 'string'
        ? walletContext.chainName.replace(/[^a-zA-Z0-9 -]/g, '').slice(0, 50)
        : null;

    if (addr) {
      system += `\n\n# Wallet context (this turn)\n`;
      system += `These values are the CURRENT, ACTIVE state of the user's wallet. The chainId below is the network the user has selected in the UI header RIGHT NOW. When a tool needs the user's address or chainId, use these values verbatim — do not pick a different chain, do not fall back to a default like Sepolia or Ethereum mainnet, and do not ask the user for them.\n`;
      system += `- address: ${addr}\n`;
      if (chainId !== null) system += `- chainId: ${chainId}\n`;
      if (chainName) system += `- chainName: ${chainName}\n`;
      if (chainId !== null) {
        system += `\nIf the user asks for "my balance" or any operation without naming a network, run it on chainId ${chainId} (${chainName ?? 'the connected chain'}) and state which network you used in your reply. Only switch chains if the user explicitly names a different one.`;
      }
    }
  } else {
    // No wallet connected — make this explicit so the LLM tells the user.
    system += `\n\n# Wallet context (this turn)\nNo wallet is connected. If the user asks for balances, deposits, or any address-bound operation, tell them to connect a wallet first.`;
  }

  const result = streamText({
    model: resolveModel(),
    system,
    messages: safeMessages,
    tools: functionTools,
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}

/**
 * Strip incomplete tool invocations so streamText can convert history.
 * Keeps completed tool results and text parts.
 */
function sanitizeMessages(messages: unknown[]): unknown[] {
  return messages
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return raw;
      const msg = raw as Record<string, unknown>;
      if (msg.role !== 'assistant') return msg;

      const next: Record<string, unknown> = { ...msg };

      if (Array.isArray(msg.toolInvocations)) {
        const completed = msg.toolInvocations.filter(
          (inv) =>
            inv &&
            typeof inv === 'object' &&
            (inv as { state?: string }).state === 'result',
        );
        if (completed.length > 0) {
          next.toolInvocations = completed;
        } else {
          delete next.toolInvocations;
        }
      }

      if (Array.isArray(msg.parts)) {
        const parts = msg.parts.filter((part) => {
          if (!part || typeof part !== 'object') return true;
          const p = part as {
            type?: string;
            toolInvocation?: { state?: string };
          };
          if (p.type !== 'tool-invocation') return true;
          return p.toolInvocation?.state === 'result';
        });
        next.parts = parts;
      }

      const hasText =
        (typeof next.content === 'string' && next.content.trim().length > 0) ||
        (Array.isArray(next.parts) &&
          next.parts.some(
            (p) =>
              p &&
              typeof p === 'object' &&
              (p as { type?: string }).type === 'text' &&
              Boolean((p as { text?: string }).text?.trim()),
          ));
      const hasTools =
        (Array.isArray(next.toolInvocations) &&
          next.toolInvocations.length > 0) ||
        (Array.isArray(next.parts) &&
          next.parts.some(
            (p) =>
              p &&
              typeof p === 'object' &&
              (p as { type?: string }).type === 'tool-invocation',
          ));

      // Drop empty assistant shells left after stripping incomplete tools.
      if (!hasText && !hasTools) return null;
      return next;
    })
    .filter((m) => m != null);
}
