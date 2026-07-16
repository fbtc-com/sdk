/**
 * Extract prepared sdk_execute transactions from an AI SDK chat message.
 * Shared by ChatPanel and unit tests so detection stays in sync.
 */
export interface TxResult {
  action: string;
  method: string;
  description: string;
  params: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return asRecord(parsed);
    } catch {
      return undefined;
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function isSdkExecute(r: Record<string, unknown> | undefined): r is TxResult {
  // Match the original ChatPanel check (truthy fields) so we do not drop
  // valid sdk_execute payloads over strict typeof edge cases.
  return Boolean(
    r &&
      r.action === 'sdk_execute' &&
      r.method &&
      r.description &&
      r.params,
  );
}

/**
 * Pull sdk_execute payloads from Vercel AI SDK message shapes
 * (`parts` tool-invocation and legacy `toolInvocations`).
 */
export function extractTxActions(
  message: Record<string, unknown>,
): TxResult[] {
  const txActions: TxResult[] = [];
  const seen = new Set<string>();

  function tryExtract(raw: unknown) {
    const r = asRecord(raw);
    if (!isSdkExecute(r)) return;
    const key = `${r.method}:${r.description}`;
    if (seen.has(key)) return;
    seen.add(key);
    txActions.push(r);
  }

  const parts = (message.parts || []) as Array<Record<string, unknown>>;
  for (const part of parts) {
    if (part.type === 'tool-invocation') {
      const inv = asRecord(part.toolInvocation);
      if (inv?.state === 'result') {
        tryExtract(inv.result ?? inv.output);
      }
    }
  }

  for (const inv of (message.toolInvocations || []) as Array<
    Record<string, unknown>
  >) {
    if (inv.state === 'result') {
      tryExtract(inv.result ?? inv.output);
    }
  }

  return txActions;
}

/** True when assistant text claims a tx is ready but no Execute payload is attached. */
export function looksLikePreparedTxWithoutPayload(
  message: Record<string, unknown>,
): boolean {
  if (message.role !== 'assistant') return false;
  if (extractTxActions(message).length > 0) return false;

  const toolError = extractSdkErrors(message);
  if (toolError.length > 0) return true;

  const content =
    typeof message.content === 'string' ? message.content.toLowerCase() : '';
  if (!content) return false;

  const claimsPrepared =
    content.includes('prepared') ||
    content.includes('please confirm') ||
    content.includes('confirm the transaction') ||
    content.includes('confirm in your wallet') ||
    content.includes('confirm in wallet') ||
    content.includes('click "execute"') ||
    content.includes('click execute');
  const looksLikeWrite =
    content.includes('borrow') ||
    content.includes('supply') ||
    content.includes('withdraw') ||
    content.includes('repay') ||
    content.includes('approve');

  return claimsPrepared && looksLikeWrite;
}

/** Pull structured prepare_* failures (action: sdk_error). */
export function extractSdkErrors(
  message: Record<string, unknown>,
): Array<{ tool?: string; error: string }> {
  const errors: Array<{ tool?: string; error: string }> = [];

  function tryExtract(raw: unknown) {
    const r = asRecord(raw);
    if (!r || r.action !== 'sdk_error' || typeof r.error !== 'string') return;
    errors.push({
      tool: typeof r.tool === 'string' ? r.tool : undefined,
      error: r.error,
    });
  }

  const parts = (message.parts || []) as Array<Record<string, unknown>>;
  for (const part of parts) {
    if (part.type === 'tool-invocation') {
      const inv = asRecord(part.toolInvocation);
      if (inv?.state === 'result') {
        tryExtract(inv.result ?? inv.output);
      }
    }
  }

  for (const inv of (message.toolInvocations || []) as Array<
    Record<string, unknown>
  >) {
    if (inv.state === 'result') {
      tryExtract(inv.result ?? inv.output);
    }
  }

  return errors;
}

/**
 * Resolve sdk_execute for a message. If this assistant turn is text-only and
 * the previous assistant message held the tool result (split turn), attach it.
 */
export function resolveTxActionsForMessage(
  messages: Array<Record<string, unknown>>,
  index: number,
): TxResult[] {
  const message = messages[index];
  if (!message || message.role !== 'assistant') return [];

  const own = extractTxActions(message);
  if (own.length > 0) return own;

  if (index === 0) return [];
  const prev = messages[index - 1];
  if (!prev || prev.role !== 'assistant') return [];

  const prevTx = extractTxActions(prev);
  if (prevTx.length === 0) return [];

  // Prefer showing the card on the text reply when the prior msg is tool-heavy.
  const prevText =
    typeof prev.content === 'string' ? prev.content.trim() : '';
  const thisText =
    typeof message.content === 'string' ? message.content.trim() : '';
  if (!prevText && thisText) return prevTx;

  return [];
}

/** Keep only tool invocations that carry an sdk_execute result (for persistence). */
export function serializeMessageForStorage(
  message: Record<string, unknown>,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  };

  const txActions = extractTxActions(message);
  if (txActions.length === 0) return base;

  // Re-hydrate as legacy toolInvocations so extractTxActions works after reload.
  base.toolInvocations = txActions.map((tx, i) => ({
    state: 'result',
    toolCallId: `persisted-${message.id ?? 'msg'}-${i}`,
    toolName: `prepare_${String(tx.method).replace(/\./g, '_')}`,
    result: tx,
  }));

  return base;
}
