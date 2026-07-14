/**
 * Tests that TransactionPrompt cards are correctly detected from
 * tool invocation results in Vercel AI SDK message structures.
 */
import { describe, expect, it } from 'vitest';

interface TxResult {
  action: string;
  method: string;
  description: string;
  params: Record<string, unknown>;
}

/**
 * Mirrors the detection logic in ChatPanel's MessageBubble.
 */
function extractTxActions(message: Record<string, unknown>): TxResult[] {
  const txActions: TxResult[] = [];
  const seen = new Set<string>();

  function tryExtract(r: Record<string, unknown> | undefined) {
    if (r?.action === 'sdk_execute' && r.method && r.description && r.params) {
      const key = `${r.method}:${r.description}`;
      if (!seen.has(key)) {
        seen.add(key);
        txActions.push(r as unknown as TxResult);
      }
    }
  }

  const parts = (message.parts || []) as Array<Record<string, unknown>>;
  for (const part of parts) {
    if (part.type === 'tool-invocation') {
      const inv = part.toolInvocation as Record<string, unknown> | undefined;
      if (inv?.state === 'result') {
        tryExtract(inv.result as Record<string, unknown> | undefined);
      }
    }
  }
  for (const inv of (message.toolInvocations || []) as Array<
    Record<string, unknown>
  >) {
    if (inv.state === 'result') {
      tryExtract(inv.result as Record<string, unknown> | undefined);
    }
  }

  return txActions;
}

const AAVE_TOOL_RESULT = {
  action: 'sdk_execute',
  method: 'aave.supplyFbtc',
  params: {
    chainId: 1,
    transactions: [
      {
        to: '0xc96de26018a54d51c097160568752c4e3bd6c364',
        data: '0xabc123',
        label: 'Approve',
      },
      {
        to: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
        data: '0xdef456',
        label: 'Supply',
      },
    ],
  },
  description: 'Supply 0.1 FBTC to Aave V3',
};

describe('tx action detection', () => {
  it('detects Aave FBTC supply in v4 parts format', () => {
    const message = {
      role: 'assistant',
      content: 'I prepared the transaction.',
      parts: [
        {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'result',
            toolName: 'prepare_aave_supply_fbtc',
            result: AAVE_TOOL_RESULT,
          },
        },
        { type: 'text', text: 'I prepared the transaction.' },
      ],
    };
    const actions = extractTxActions(message);
    expect(actions).toHaveLength(1);
    expect(actions[0].method).toBe('aave.supplyFbtc');
    expect(actions[0].params.chainId).toBe(1);
  });

  it('detects Aave FBTC supply in legacy toolInvocations format', () => {
    const message = {
      role: 'assistant',
      content: 'I prepared the transaction.',
      toolInvocations: [
        {
          state: 'result',
          toolName: 'prepare_aave_supply_fbtc',
          result: AAVE_TOOL_RESULT,
        },
      ],
    };
    const actions = extractTxActions(message);
    expect(actions).toHaveLength(1);
    expect(actions[0].method).toBe('aave.supplyFbtc');
  });

  it('detects sdk_execute in multi-step message (read tool then write tool)', () => {
    const message = {
      role: 'assistant',
      content: "Here are the markets. I've prepared the transaction.",
      parts: [
        {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'result',
            toolName: 'get_aave_fbtc_reserve',
            result: { token: 'FBTC', protocol: 'Aave V3' },
          },
        },
        { type: 'text', text: 'Here are the markets.' },
        {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'result',
            toolName: 'prepare_aave_supply_fbtc',
            result: AAVE_TOOL_RESULT,
          },
        },
        { type: 'text', text: "I've prepared the transaction." },
      ],
    };
    const actions = extractTxActions(message);
    expect(actions).toHaveLength(1);
    expect(actions[0].method).toBe('aave.supplyFbtc');
  });

  it('ignores read-only tool results (no action field)', () => {
    const message = {
      role: 'assistant',
      content: 'Your balance is 1.5 FBTC.',
      parts: [
        {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'result',
            toolName: 'get_token_balance',
            result: { balance: '1.5', token: 'FBTC' },
          },
        },
        { type: 'text', text: 'Your balance is 1.5 FBTC.' },
      ],
    };
    const actions = extractTxActions(message);
    expect(actions).toHaveLength(0);
  });

  it('ignores tool invocations with state != result', () => {
    const message = {
      role: 'assistant',
      content: '',
      parts: [
        {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'call',
            toolName: 'prepare_aave_supply_fbtc',
          },
        },
      ],
    };
    const actions = extractTxActions(message);
    expect(actions).toHaveLength(0);
  });

  it('deduplicates identical tool results', () => {
    const message = {
      role: 'assistant',
      content: 'Done.',
      parts: [
        {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'result',
            toolName: 'prepare_aave_supply_fbtc',
            result: AAVE_TOOL_RESULT,
          },
        },
      ],
      toolInvocations: [
        {
          state: 'result',
          toolName: 'prepare_aave_supply_fbtc',
          result: AAVE_TOOL_RESULT,
        },
      ],
    };
    const actions = extractTxActions(message);
    expect(actions).toHaveLength(1);
  });

  it('handles empty message (no parts or toolInvocations)', () => {
    const message = { role: 'user', content: 'Hello' };
    const actions = extractTxActions(message);
    expect(actions).toHaveLength(0);
  });
});
