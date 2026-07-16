/**
 * Tests that TransactionPrompt cards are correctly detected from
 * tool invocation results in Vercel AI SDK message structures.
 */
import { describe, expect, it } from 'vitest';

import {
  extractTxActions,
  looksLikePreparedTxWithoutPayload,
  resolveTxActionsForMessage,
  serializeMessageForStorage,
} from '../lib/tx-actions';

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

const BORROW_TOOL_RESULT = {
  action: 'sdk_execute',
  method: 'aave.borrowStablecoin',
  params: {
    chainId: 5000,
    transactions: [
      {
        to: '0x458F293454fE0d67EC0655f3672301301DD51422',
        data: '0xborrow',
        label: 'Borrow 0.1 USDT0',
      },
    ],
  },
  description: 'Borrow 0.1 USDT0 from Aave V3 Mantle',
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

  it('detects Aave borrow in v4 parts format', () => {
    const message = {
      role: 'assistant',
      content: 'Prepared borrow.',
      parts: [
        {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'result',
            toolName: 'prepare_aave_borrow_stablecoin',
            result: BORROW_TOOL_RESULT,
          },
        },
      ],
    };
    const actions = extractTxActions(message);
    expect(actions).toHaveLength(1);
    expect(actions[0].method).toBe('aave.borrowStablecoin');
  });

  it('detects stringified tool results', () => {
    const message = {
      role: 'assistant',
      content: 'Prepared.',
      toolInvocations: [
        {
          state: 'result',
          toolName: 'prepare_aave_borrow_stablecoin',
          result: JSON.stringify(BORROW_TOOL_RESULT),
        },
      ],
    };
    const actions = extractTxActions(message);
    expect(actions).toHaveLength(1);
    expect(actions[0].method).toBe('aave.borrowStablecoin');
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
    expect(extractTxActions({ role: 'assistant', content: 'Hi' })).toHaveLength(
      0,
    );
  });

  it('persists sdk_execute results across serialize → extract', () => {
    const live = {
      id: 'm1',
      role: 'assistant',
      content: 'Prepared borrow.',
      parts: [
        {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'result',
            toolName: 'prepare_aave_borrow_stablecoin',
            result: BORROW_TOOL_RESULT,
          },
        },
      ],
    };
    const stored = serializeMessageForStorage(live);
    expect(stored.content).toBe('Prepared borrow.');
    expect(extractTxActions(stored)).toHaveLength(1);
    expect(extractTxActions(stored)[0].method).toBe('aave.borrowStablecoin');
  });

  it('flags assistant text that claims prepared without sdk_execute', () => {
    expect(
      looksLikePreparedTxWithoutPayload({
        role: 'assistant',
        content:
          'The borrow transaction is prepared. Please confirm the transaction in your wallet.',
      }),
    ).toBe(true);
  });

  it('does not flag when sdk_execute is present', () => {
    expect(
      looksLikePreparedTxWithoutPayload({
        role: 'assistant',
        content: 'Prepared borrow. Please confirm.',
        toolInvocations: [
          {
            state: 'result',
            toolName: 'prepare_aave_borrow_stablecoin',
            result: BORROW_TOOL_RESULT,
          },
        ],
      }),
    ).toBe(false);
  });

  it('attaches tool result from prior empty assistant message to text reply', () => {
    const messages = [
      {
        role: 'assistant',
        content: '',
        toolInvocations: [
          {
            state: 'result',
            toolName: 'prepare_aave_borrow_stablecoin',
            result: BORROW_TOOL_RESULT,
          },
        ],
      },
      {
        role: 'assistant',
        content: 'Borrow is prepared. Click Execute.',
      },
    ];
    expect(resolveTxActionsForMessage(messages, 1)).toHaveLength(1);
    expect(resolveTxActionsForMessage(messages, 1)[0].method).toBe(
      'aave.borrowStablecoin',
    );
  });
});
