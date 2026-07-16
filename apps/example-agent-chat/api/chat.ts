import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { functionTools as allFunctionTools } from '@functionfbtc/sdk-agent/vercel';
import { streamText } from 'ai';

// Vercel serverless function for /api/chat
// Runs server-side on Vercel, keeping API keys out of the browser.

const anthropic = createAnthropic();

const FUNCTION_TOOL_NAMES = new Set([
  'get_aave_fbtc_reserve',
  'get_aave_atoken_balance',
  'get_aave_user_account',
  'prepare_aave_supply_fbtc',
  'prepare_aave_withdraw_fbtc',
  'prepare_aave_borrow_stablecoin',
  'prepare_aave_repay_stablecoin',
  'get_token_balance',
  'get_token_info',
]);
const functionTools = Object.fromEntries(
  Object.entries(allFunctionTools).filter(([name]) =>
    FUNCTION_TOOL_NAMES.has(name),
  ),
);

const FUNCTION_SYSTEM_PROMPT = `You are the Function FBTC assistant for Aave V3 on Ethereum and Mantle.
Be concise and explicit about networks (Ethereum vs Mantle), token addresses, transaction steps, and wallet confirmation.
Never invent contract addresses, balances, rates, transaction hashes, or transaction success.
Tool results are authoritative for prepared calldata. A prepared transaction is not submitted or confirmed.
For supply / withdraw / borrow / repay you MUST call the matching prepare_* tool before claiming anything is prepared.
NEVER say a transaction is prepared, ready to sign, or ask the user to confirm in their wallet unless a prepare_* tool returned action "sdk_execute".
If a prepare_* tool returns action "sdk_error", report the error and do not claim the transaction is prepared.
When prepare_* tools succeed, the chat UI shows an Execute card — tell the user to click Execute in that card. Do NOT say the wallet will open automatically.
When an address-bound operation is requested without a connected wallet, ask the user to connect one.
Always name the market as "Aave V3 Ethereum" or "Aave V3 Mantle" — never say only "Aave V3" without the network.
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

# Function FBTC on Aave V3 Ethereum and Mantle

Supported markets:
- Aave V3 Ethereum: chainId 1
- Aave V3 Mantle: chainId 5000

FBTC token address on both chains: 0xc96de26018a54d51c097160568752c4e3bd6c364

CRITICAL — all Aave / balance tools REQUIRE chainId (never omit — FBTC addresses match on both chains):
- When the user mentions Mantle / MNT / chainId 5000, you MUST call tools with chainId: 5000 and say "Aave V3 Mantle".
- When the user mentions Ethereum / mainnet / chainId 1, call with chainId: 1 and say "Aave V3 Ethereum".
- If the user does not name a network, use walletContext.chainId when present; otherwise ask which network.
- Never claim Mantle is unsupported. Never substitute Ethereum results when the user asked for Mantle.
- Always report the chainId returned by the tool; do not relabel an Ethereum result as Mantle.
- In replies, always specify "Ethereum" or "Mantle" — do not write bare "Aave V3".

When the user asks about FBTC balance, call get_token_balance with tokenAddress 0xc96de26018a54d51c097160568752c4e3bd6c364, walletContext.address, and the correct chainId.
When the user asks about aFBTC / aToken balance, call get_aave_atoken_balance.
When the user asks about health factor, LTV, or liquidation threshold, call get_aave_user_account.
When the user asks about the Aave FBTC reserve, call get_aave_fbtc_reserve with the correct chainId.
Write tools (pass walletContext.address + chainId):
- supply / deposit FBTC → prepare_aave_supply_fbtc (Ethereum: approve + supply; Mantle: also add any missing FBTC collateral / eMode category 3 setup)
- withdraw FBTC → prepare_aave_withdraw_fbtc (amount or 'max')
- borrow USDC / USDT / USDe → prepare_aave_borrow_stablecoin (on Mantle, USDT is USDT0)
- repay debt → prepare_aave_repay_stablecoin (amount or 'max')
You MUST call the prepare_* tool for write requests. Do not invent a prepared-transaction summary from memory.
The front-end shows an Execute card under the assistant message after prepare_* tools succeed.
Tell the user to click Execute on that card — the wallet will NOT open automatically.
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

  // History must be text-only for the model. Persisted / incomplete
  // toolInvocations (missing paired tool-call args) break convertToCoreMessages
  // and silently kill subsequent prepare_* tool use — including supply.
  const safeMessages = sanitizeMessages(messages);

  let system = `${FUNCTION_SYSTEM_PROMPT}${AAVE_DEMO_PROMPT}`;
  const walletDefaults = parseWalletContext(walletContext);
  if (walletDefaults) {
    const { address: addr, chainId, chainName } = walletDefaults;
    system += `\n\n# Wallet context (this turn)\n`;
    system += `These values are the CURRENT, ACTIVE state of the user's wallet. The chainId below is the network the user has selected in the UI header RIGHT NOW. When a tool needs the user's address or chainId, use these values verbatim — do not pick a different chain, do not fall back to a default like Sepolia or Ethereum mainnet, and do not ask the user for them.\n`;
    system += `- address: ${addr}\n`;
    if (chainId !== null) system += `- chainId: ${chainId}\n`;
    if (chainName) system += `- chainName: ${chainName}\n`;
    if (chainId !== null) {
      system += `\nIf the user asks for "my balance" or any operation without naming a network, run it on chainId ${chainId} (${chainName ?? 'the connected chain'}) and state which network you used in your reply. Only switch chains if the user explicitly names a different one.`;
    }
  } else {
    // No wallet connected — make this explicit so the LLM tells the user.
    system += `\n\n# Wallet context (this turn)\nNo wallet is connected. If the user asks for balances, deposits, or any address-bound operation, tell them to connect a wallet first.`;
  }

  const result = streamText({
    model: resolveModel(),
    system,
    // Text-only turns; role/content shape matches UI Message for convertToCoreMessages.
    messages: safeMessages as Array<{
      role: 'user' | 'assistant';
      content: string;
    }>,
    tools: withWalletDefaults(functionTools, walletDefaults),
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}

type WalletDefaults = {
  address: string;
  chainId: number | null;
  chainName: string | null;
};

function parseWalletContext(walletContext: unknown): WalletDefaults | null {
  if (!walletContext || typeof walletContext !== 'object') return null;
  const ctx = walletContext as Record<string, unknown>;
  const address =
    typeof ctx.address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(ctx.address)
      ? ctx.address
      : null;
  if (!address) return null;

  let chainId: number | null = null;
  if (typeof ctx.chainId === 'number' && Number.isFinite(ctx.chainId)) {
    chainId = ctx.chainId;
  } else if (typeof ctx.chainId === 'string' && ctx.chainId.trim() !== '') {
    const n = Number(ctx.chainId);
    if (Number.isFinite(n)) chainId = n;
  }

  const chainName =
    typeof ctx.chainName === 'string'
      ? ctx.chainName.replace(/[^a-zA-Z0-9 -]/g, '').slice(0, 50)
      : null;

  return { address, chainId, chainName };
}

/**
 * Fill omitted address / chainId from the connected wallet so GLM tool calls
 * that skip those fields still prepare executable transactions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withWalletDefaults(
  tools: Record<string, any>,
  wallet: WalletDefaults | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  if (!wallet) return tools;

  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => {
      const originalExecute = tool?.execute;
      if (typeof originalExecute !== 'function') return [name, tool];

      return [
        name,
        {
          ...tool,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          execute: async (args: Record<string, unknown>, options?: any) => {
            const next: Record<string, unknown> = { ...(args ?? {}) };

            if (
              (next.address === undefined ||
                next.address === null ||
                next.address === '') &&
              wallet.address
            ) {
              next.address = wallet.address;
            }

            if (
              (next.chainId === undefined || next.chainId === null) &&
              wallet.chainId !== null
            ) {
              next.chainId = wallet.chainId;
            }

            if (typeof next.chainId === 'string') {
              const n = Number(next.chainId);
              if (Number.isFinite(n)) next.chainId = n;
            }

            return originalExecute(next, options);
          },
        },
      ];
    }),
  );
}

/**
 * Strip tool history so streamText only sees text turns.
 * Incomplete or UI-persisted toolInvocations break convertToCoreMessages.
 */
function sanitizeMessages(
  messages: unknown[],
): Array<{ id?: unknown; role: unknown; content: string }> {
  return messages
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const msg = raw as Record<string, unknown>;

      const content =
        typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.parts)
            ? (msg.parts as Array<Record<string, unknown>>)
                .filter((p) => p?.type === 'text' && typeof p.text === 'string')
                .map((p) => p.text as string)
                .join('\n')
            : '';

      if (msg.role === 'assistant' && !content.trim()) return null;

      return {
        id: msg.id,
        role: msg.role,
        content,
      };
    })
    .filter(
      (m): m is { id?: unknown; role: unknown; content: string } => m != null,
    );
}
