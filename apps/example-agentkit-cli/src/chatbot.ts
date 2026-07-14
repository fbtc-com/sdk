import "dotenv/config";

import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import * as readline from "readline";

import { initAgent } from "./initAgent.js";
import { requiredModelEnvVars, resolveModel } from "./model.js";
import { silenceAgentkitAnalytics } from "./silenceAgentkitAnalytics.js";

silenceAgentkitAnalytics();

const SYSTEM_PROMPT = `You are an AI agent specialized in Function FBTC on Aave V3 (Ethereum Core and Mantle).

You can help users:
- Check Function FBTC balance on Ethereum or Mantle (get_fbtc_balance)
- Look up the Aave V3 FBTC reserve (get_aave_fbtc_reserve; chainId 1 or 5000)
- Supply FBTC to Aave V3 on ethereum-mainnet or mantle-mainnet (supply_fbtc_to_aave) — two on-chain txs: approve then supply

FBTC means the ERC-20 at 0xc96de26018a54d51c097160568752c4e3bd6c364 on Ethereum (chainId 1) and Mantle (chainId 5000).
Always confirm with the user before executing write transactions.
When checking balances, show the token symbol and chain.
Never invent contract addresses, balances, rates, or transaction hashes.
Tool results are authoritative.`;

async function initializeAgent() {
  const networkId = process.env.NETWORK_ID || "ethereum-mainnet";
  const { walletProvider, tools } = await initAgent(networkId);

  const llm = resolveModel();
  const memory = new MemorySaver();
  const agent = createReactAgent({
    llm,
    tools,
    checkpointSaver: memory,
    messageModifier: SYSTEM_PROMPT,
  });

  const address = walletProvider.getAddress();
  console.log(`\nAgent wallet: ${address}`);
  console.log(`Network: ${networkId}`);
  console.log(`RPC: ${process.env.RPC_URL ? "custom (RPC_URL)" : "chain default (set RPC_URL for writes)"}`);
  console.log(
    `Model: ${process.env.MODEL_PROVIDER || "anthropic"} / ${process.env.MODEL_NAME || "(default)"}`,
  );

  const fbtcTools = tools.filter(
    (t) =>
      t.name.includes("fbtc") ||
      t.name.includes("aave") ||
      t.name.includes("supply"),
  );
  console.log(`FBTC actions: ${fbtcTools.map((t) => t.name).join(", ")}`);

  return { agent, address };
}

async function main() {
  console.log("Function FBTC AgentKit Chatbot");
  console.log("==============================\n");

  const required = ["WALLET_PRIVATE_KEY", ...requiredModelEnvVars()];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing env vars: ${missing.join(", ")}`);
    console.error("Copy .env.example to .env and fill in the values.");
    process.exit(1);
  }

  const { agent } = await initializeAgent();
  const threadId = `fbtc-${Date.now()}`;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question("\nYou: ", async (input) => {
      const trimmed = input.trim();

      if (!trimmed || trimmed === "exit" || trimmed === "quit") {
        console.log("Goodbye!");
        rl.close();
        return;
      }

      try {
        const config = { configurable: { thread_id: threadId } };
        const stream = await agent.stream(
          { messages: [new HumanMessage(trimmed)] },
          config,
        );

        let response = "";
        for await (const chunk of stream) {
          if ("agent" in chunk) {
            for (const msg of chunk.agent.messages) {
              if (typeof msg.content === "string" && msg.content.length > 0) {
                response = msg.content;
              }
            }
          }
          if ("tools" in chunk) {
            for (const msg of chunk.tools.messages) {
              console.log(
                `  [tool: ${msg.name}] ${String(msg.content).slice(0, 200)}`,
              );
            }
          }
        }

        console.log(`\nAgent: ${response}`);
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
      }

      prompt();
    });
  };

  console.log('Type "exit" to quit.\n');
  console.log(
    "Try: \"What's my FBTC balance?\" or \"Show the Aave FBTC reserve.\"\n",
  );
  prompt();
}

main().catch(console.error);
