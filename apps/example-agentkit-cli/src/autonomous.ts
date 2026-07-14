/**
 * Autonomous mode: the agent runs a predefined set of read-only
 * Function FBTC operations without user interaction.
 */
import "dotenv/config";

import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

import { initAgent } from "./initAgent.js";
import { requiredModelEnvVars, resolveModel } from "./model.js";
import { silenceAgentkitAnalytics } from "./silenceAgentkitAnalytics.js";

silenceAgentkitAnalytics();

const TASKS = [
  "What is my Function FBTC balance on Ethereum mainnet?",
  "Show the Aave V3 Ethereum FBTC reserve details.",
  "Show the Aave V3 Mantle FBTC reserve details.",
];

const TASK_TIMEOUT_MS = Number(process.env.TASK_TIMEOUT_MS) || 60_000;

async function main() {
  console.log("Function FBTC AgentKit - Autonomous Validation");
  console.log("==============================================\n");

  const required = ["WALLET_PRIVATE_KEY", ...requiredModelEnvVars()];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  const { walletProvider, tools, networkId, rpcUrls } = await initAgent();

  console.log(`Available tools (${tools.length}):`);
  for (const tool of tools) {
    console.log(`  - ${tool.name}: ${tool.description.slice(0, 80)}...`);
  }

  const llm = resolveModel();
  const memory = new MemorySaver();
  const agent = createReactAgent({
    llm,
    tools,
    checkpointSaver: memory,
    messageModifier:
      "You are a Function FBTC agent for Aave V3 Ethereum and Aave V3 Mantle. " +
      "Execute the requested operations and report results clearly. " +
      "For read-only operations, proceed without confirmation. " +
      "Pass networkId ethereum-mainnet (Aave V3 Ethereum) or mantle-mainnet (Aave V3 Mantle); default ethereum-mainnet. " +
      "Always name the network in replies — never say only \"Aave V3\". " +
      "FBTC is the ERC-20 at 0xc96de26018a54d51c097160568752c4e3bd6c364 on both Ethereum and Mantle.",
  });

  const address = walletProvider.getAddress();
  console.log(`\nWallet: ${address}`);
  console.log(`Wallet NETWORK_ID: ${networkId}`);
  console.log(
    `RPCs: ethereum-mainnet=${rpcUrls["ethereum-mainnet"] ? "set" : "unset"}, mantle-mainnet=${rpcUrls["mantle-mainnet"] ? "set" : "unset"}`,
  );
  console.log(
    `Model: ${process.env.MODEL_PROVIDER || "anthropic"} / ${process.env.MODEL_NAME || "(default)"}\n`,
  );

  const config = { configurable: { thread_id: `auto-${Date.now()}` } };
  let passed = 0;
  let failed = 0;

  for (const task of TASKS) {
    console.log(`\n--- Task: ${task}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TASK_TIMEOUT_MS);
    try {
      const stream = await agent.stream(
        { messages: [new HumanMessage(task)] },
        { ...config, signal: controller.signal },
      );

      for await (const chunk of stream) {
        if ("agent" in chunk) {
          for (const msg of chunk.agent.messages) {
            if (typeof msg.content === "string" && msg.content.length > 0) {
              console.log(`  Agent: ${msg.content.slice(0, 300)}`);
            }
          }
        }
        if ("tools" in chunk) {
          for (const msg of chunk.tools.messages) {
            console.log(`  [${msg.name}] ${String(msg.content).slice(0, 200)}`);
          }
        }
      }

      passed++;
      console.log("  PASS");
    } catch (error) {
      failed++;
      const msg = controller.signal.aborted
        ? `timed out after ${TASK_TIMEOUT_MS}ms`
        : error instanceof Error
          ? error.message
          : String(error);
      console.error(`  FAIL: ${msg}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  console.log(`\n==============================================`);
  console.log(
    `Results: ${passed} passed, ${failed} failed out of ${TASKS.length}`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
