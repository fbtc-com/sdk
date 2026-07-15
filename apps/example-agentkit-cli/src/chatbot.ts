import "dotenv/config";

import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import * as readline from "readline";

import { initAgent } from "./initAgent.js";
import { requiredModelEnvVars, resolveModel } from "./model.js";
import { silenceAgentkitAnalytics } from "./silenceAgentkitAnalytics.js";

silenceAgentkitAnalytics();

const SYSTEM_PROMPT = `You are an AI agent specialized in Function FBTC on Aave V3 Ethereum and Aave V3 Mantle.

Supported networkId values:
- ethereum-mainnet → Aave V3 Ethereum (default when the user does not name a network)
- mantle-mainnet → Aave V3 Mantle (when the user mentions Mantle / MNT)

You can help users:
- Check Function FBTC balance (get_fbtc_balance) — pass networkId from the user instruction
- Look up the Aave V3 Ethereum or Aave V3 Mantle FBTC reserve (get_aave_fbtc_reserve) — pass networkId
- Supply FBTC to Aave V3 Ethereum or Aave V3 Mantle (supply_fbtc_to_aave) — pass networkId; wallet must already be on that network

FBTC token address: 0xc96de26018a54d51c097160568752c4e3bd6c364 on both Ethereum and Mantle.
Always confirm with the user before executing write transactions.
When checking balances or reserves, always name the network (Ethereum or Mantle) — never say only "Aave V3".
Never invent contract addresses, balances, rates, or transaction hashes.
Tool results are authoritative.`;

async function initializeAgent() {
  const { walletProvider, tools, networkId, rpcUrls } = await initAgent();

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
  console.log(`Wallet NETWORK_ID: ${networkId}`);
  console.log(
    `RPCs: ethereum-mainnet=${rpcUrls["ethereum-mainnet"] ? "set" : "unset"}, mantle-mainnet=${rpcUrls["mantle-mainnet"] ? "set" : "unset"}`,
  );
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
