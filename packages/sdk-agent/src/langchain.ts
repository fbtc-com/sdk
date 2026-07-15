/**
 * LangChain adapter for Function FBTC agent tools.
 *
 * Usage:
 * ```ts
 * import { functionLangChainTools } from "@functionfbtc/sdk-agent/langchain";
 * import { AgentExecutor } from "langchain/agents";
 *
 * const agent = AgentExecutor.fromAgentAndTools({ agent, tools: functionLangChainTools });
 * ```
 */
import { tool } from '@langchain/core/tools';

import { allTools, type ToolDefinition } from './tools';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toLangChainTool(def: ToolDefinition<any, any>) {
  return tool(async (input) => JSON.stringify(await def.execute(input)), {
    name: def.name,
    description: def.description,
    schema: def.schema,
  });
}

export const functionLangChainTools = allTools.map(toLangChainTool);
