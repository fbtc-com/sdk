import type { Message } from '@ai-sdk/react';
import { useChat } from '@ai-sdk/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAccount } from 'wagmi';

import logoCircle from '../assets/logo-green-circle.svg';
import { classifyHex, getExplorerUrl } from '../lib/explorer';
import { TransactionPrompt } from './TransactionPrompt';

interface TxResult {
  action: string;
  method: string;
  description: string;
  params: Record<string, unknown>;
}

interface WalletEvent {
  type: 'wallet_change';
  id: string;
  address: string | null;
  chainName?: string;
}

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

// ─── Per-wallet session persistence ─────────────────────────────────

const STORAGE_PREFIX = 'function_chat_';

function storageKey(addr: string): string {
  return `${STORAGE_PREFIX}${addr.toLowerCase()}`;
}

function loadMessages(addr: string | undefined): Message[] {
  if (!addr) return [];
  try {
    const raw = localStorage.getItem(storageKey(addr));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMessages(addr: string | undefined, messages: Message[]): void {
  if (!addr) return;
  try {
    // Only persist user and assistant text messages (skip tool invocations with large data)
    const serializable = messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    }));
    localStorage.setItem(storageKey(addr), JSON.stringify(serializable));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

// ─── ChatPanel ──────────────────────────────────────────────────────

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const { address, chain } = useAccount();
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevAddressRef = useRef<string | undefined>(undefined);
  const [walletEvents, setWalletEvents] = useState<WalletEvent[]>([]);

  // Keep the latest wallet context in a ref so the request-body builder
  // always reads the current chain at send time, not at hook-init time.
  // Without this, switching chains mid-conversation could leak a stale
  // chainId into the next bot turn.
  const walletContextRef = useRef<{
    address: string;
    chainId?: number;
    chainName?: string;
  } | null>(null);
  walletContextRef.current = address
    ? { address, chainId: chain?.id, chainName: chain?.name }
    : null;

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    append,
    setMessages,
    stop,
  } = useChat({
    api: '/api/chat',
    id: address ? `chat-${address.toLowerCase()}` : 'chat-anonymous',
    initialMessages: loadMessages(address),
    experimental_prepareRequestBody: ({ messages: msgs }) => ({
      messages: msgs,
      walletContext: walletContextRef.current,
    }),
  });

  // Persist messages to localStorage on change
  const saveRef = useRef(saveMessages);
  saveRef.current = saveMessages;
  const addressRef = useRef(address);
  addressRef.current = address;

  useEffect(() => {
    saveRef.current(addressRef.current, messages);
  }, [messages]);

  // Clear history for current wallet
  const clearHistory = useCallback(() => {
    setMessages([]);
    if (address) {
      localStorage.removeItem(storageKey(address));
    }
  }, [address, setMessages]);

  // Track wallet changes: save outgoing session, restore incoming session.
  // We only ever show the MOST RECENT change event so stale "Wallet
  // disconnected / Switched to ..." markers from prior sessions don't pile
  // up. On a fresh connect after a disconnect, also stop any in-flight
  // agent turn — the in-flight request belongs to the previous wallet.
  useEffect(() => {
    if (prevAddressRef.current === undefined) {
      prevAddressRef.current = address;
      return;
    }
    if (address !== prevAddressRef.current) {
      const wasDisconnected = !prevAddressRef.current;
      prevAddressRef.current = address;
      if (isLoading) stop();
      setMessages(loadMessages(address));
      if (address && wasDisconnected) {
        // Fresh connection - drop any stale events from previous wallets.
        setWalletEvents([]);
      } else {
        setWalletEvents([
          {
            type: 'wallet_change',
            id: `wallet-${Date.now()}`,
            address: address ?? null,
            chainName: chain?.name,
          },
        ]);
      }
    }
  }, [address, chain?.name, isLoading, setMessages, stop]);

  // Stick-to-bottom: auto-scroll on new content ONLY if the user is
  // already near the bottom. If they've scrolled up to read history, we
  // leave their viewport alone. We also use rAF so the scroll fires after
  // layout has finished — without this, long conversations could end up
  // with the container's scrollHeight stale until the next reflow, which
  // is exactly the "scroll breaks on long history" bug.
  const SCROLL_STICK_THRESHOLD = 80; // px from bottom considered "at bottom"
  const stickToBottomRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < SCROLL_STICK_THRESHOLD;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!stickToBottomRef.current) return;
    const id = requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(id);
  }, [messages, walletEvents, isLoading]);

  if (!open) return null;

  const suggestions = address
    ? [
        'Check the FBTC reserve on Aave V3 Ethereum.',
        'Supply 0.1 FBTC to Aave V3.',
        'Check my FBTC balance.',
        'Explain the two transaction steps for supplying FBTC.',
      ]
    : [
        'Check the FBTC reserve on Aave V3 Ethereum.',
        'What is FBTC?',
        'How does supplying FBTC to Aave V3 work?',
        'What should I know before supplying?',
      ];

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-black)] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <img src={logoCircle} alt="" className="h-7 w-7" />
          <span className="font-semibold text-sm text-white">
            Function Assistant
          </span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={clearHistory}
              className="text-[var(--color-text-muted)] hover:text-white transition-colors rounded-full p-1 text-xs"
              aria-label="Clear chat history"
              title="Clear chat history"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-white transition-colors rounded-full p-1"
            aria-label="Close chat"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Quick actions — always visible */}
      <div className="flex flex-wrap gap-2 px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => append({ role: 'user', content: s })}
            disabled={isLoading}
            className="rounded-[60px] border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 py-1 text-xs text-[var(--color-text-secondary)] hover:border-[var(--color-teal)] hover:text-[var(--color-teal)] disabled:opacity-40 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[var(--color-bg)] min-h-0"
      >
        {/* Wallet change notifications */}
        {walletEvents.map((evt) => (
          <div key={evt.id} className="flex items-center gap-2 py-1">
            <div className="flex-1 border-t border-[var(--color-border)]" />
            <span className="text-[10px] text-[var(--color-text-muted)] whitespace-nowrap">
              {evt.address
                ? `Switched to ${evt.address.slice(0, 6)}...${evt.address.slice(-4)}${evt.chainName ? ` on ${evt.chainName}` : ''}`
                : 'Wallet disconnected'}
            </span>
            <div className="flex-1 border-t border-[var(--color-border)]" />
          </div>
        ))}

        {messages.length === 0 && (
          <p className="text-center text-sm text-[var(--color-text-muted)] pt-8">
            {address
              ? 'Ask me about your balances, staking, or DeFi positions.'
              : 'Connect your wallet for personalized help, or ask general questions.'}
          </p>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg as unknown as Record<string, unknown>}
            chainId={chain?.id}
            onTxError={(err) =>
              append({
                role: 'user',
                content: `Transaction failed with error: "${err}". What should I do?`,
              })
            }
            onTxSuccess={(msg) => append({ role: 'user', content: msg })}
          />
        ))}

        {/* Contextual follow-up suggestions based on last assistant message */}
        {!isLoading &&
          messages.length > 0 &&
          (() => {
            const lastAssistant = [...messages]
              .reverse()
              .find((m) => m.role === 'assistant');
            if (!lastAssistant) return null;
            const text = (lastAssistant.content || '').toLowerCase();
            const followUps: string[] = [];

            if (
              text.includes('supply') &&
              (text.includes('confirmed') || text.includes('submitted'))
            ) {
              followUps.push(
                'Check my FBTC balance',
                'Show the Aave FBTC reserve',
              );
            } else if (text.includes('aave') && text.includes('fbtc')) {
              followUps.push(
                'Supply 0.1 FBTC to Aave V3',
                'Check my FBTC balance',
              );
            }

            if (followUps.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-2 pt-2">
                {followUps.map((s) => (
                  <button
                    key={s}
                    onClick={() => append({ role: 'user', content: s })}
                    className="rounded-[60px] border border-[var(--color-teal)]/30 bg-[var(--color-teal)]/5 px-3 py-1 text-xs text-[var(--color-teal)] hover:bg-[var(--color-teal)]/15 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            );
          })()}

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <div className="flex gap-1">
              <span
                className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
            Thinking...
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={handleInputChange}
            placeholder={
              address
                ? 'Ask about your balances, staking...'
                : 'Ask about Function...'
            }
            className="flex-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[var(--color-teal)] transition-colors"
          />
          {isLoading ? (
            <button
              type="button"
              onClick={stop}
              aria-label="Stop generating"
              title="Stop generating"
              className="rounded-[60px] bg-[var(--color-primary)] p-2.5 text-[var(--color-black)] hover:bg-[var(--color-primary-dark)] transition-colors"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
              className="rounded-[60px] bg-[var(--color-primary)] p-2.5 text-[var(--color-black)] disabled:opacity-40 hover:bg-[var(--color-primary-dark)] transition-colors"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/**
 * Wraps bare 0x addresses/hashes in backticks so the markdown code renderer
 * can truncate them. Skips addresses already inside backticks.
 */
function formatAddresses(text: string): string {
  // Match 0x + 40+ hex chars that are NOT already inside backticks
  return text.replace(/(?<!`)(?<!\w)(0x[a-fA-F0-9]{40,})(?!`)(?!\w)/g, '`$1`');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MessageBubble({
  message,
  chainId,
  onTxError,
  onTxSuccess,
}: {
  message: Record<string, any>;
  chainId?: number;
  onTxError?: (error: string) => void;
  onTxSuccess?: (msg: string) => void;
}) {
  const isUser = message.role === 'user';

  const txActions: TxResult[] = [];
  const seen = new Set<string>();

  function tryExtract(r: Record<string, unknown> | undefined) {
    if (r?.action === 'sdk_execute' && r.method && r.description && r.params) {
      // Deduplicate by method + description
      const key = `${r.method}:${r.description}`;
      if (!seen.has(key)) {
        seen.add(key);
        txActions.push(r as unknown as TxResult);
      }
    }
  }

  // Check parts array (Vercel AI SDK v4 format)
  const parts = (message.parts || []) as Array<Record<string, unknown>>;
  for (const part of parts) {
    if (part.type === 'tool-invocation') {
      const inv = part.toolInvocation as Record<string, unknown> | undefined;
      if (inv?.state === 'result') {
        tryExtract(inv.result as Record<string, unknown> | undefined);
      }
    }
  }
  // Check toolInvocations array (Vercel AI SDK v3 / legacy format)
  for (const inv of (message.toolInvocations || []) as Array<
    Record<string, unknown>
  >) {
    if (inv.state === 'result') {
      tryExtract(inv.result as Record<string, unknown> | undefined);
    }
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed overflow-hidden break-words ${
          isUser
            ? 'bg-[var(--color-chat-user-bg)] text-[var(--color-chat-user-text)]'
            : 'bg-[var(--color-chat-assistant-bg)] text-[var(--color-chat-assistant-text)]'
        }`}
      >
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
            strong: ({ children }) => (
              <strong className="font-semibold">{children}</strong>
            ),
            ul: ({ children }) => (
              <ul className="list-disc pl-4 mb-2">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal pl-4 mb-2">{children}</ol>
            ),
            li: ({ children }) => <li className="mb-0.5">{children}</li>,
            table: ({ children }) => (
              <div className="overflow-x-auto my-2">
                <table className="w-full text-xs border-collapse">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="border-b border-[var(--color-border-strong)]">
                {children}
              </thead>
            ),
            th: ({ children }) => (
              <th className="text-left px-2 py-1 font-semibold">{children}</th>
            ),
            td: ({ children }) => (
              <td className="px-2 py-1 border-t border-[var(--color-border)]">
                {children}
              </td>
            ),
            code: ({ children }) => {
              const text = String(children);
              // Tx hashes (64 hex) and addresses (40 hex) get rendered as
              // truncated, clickable explorer links. Falls back to a tooltip
              // when the connected chain has no known explorer.
              const kind = classifyHex(text);
              if (kind) {
                const truncated = `${text.slice(0, 6)}...${text.slice(-4)}`;
                const explorerUrl = getExplorerUrl(chainId, kind, text);
                if (explorerUrl) {
                  return (
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${text} (open in explorer)`}
                      className="bg-[var(--color-border)] rounded px-1 py-0.5 text-xs font-mono text-[var(--color-teal)] underline decoration-dotted underline-offset-2"
                    >
                      {truncated}
                    </a>
                  );
                }
                return (
                  <code
                    className="bg-[var(--color-border)] rounded px-1 py-0.5 text-xs font-mono cursor-help"
                    title={text}
                  >
                    {truncated}
                  </code>
                );
              }
              return (
                <code className="bg-[var(--color-border)] rounded px-1 py-0.5 text-xs font-mono break-all">
                  {children}
                </code>
              );
            },
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-teal)] underline"
              >
                {children}
              </a>
            ),
          }}
        >
          {formatAddresses(message.content as string)}
        </Markdown>

        {txActions.map((tx, i) => (
          <TransactionPrompt
            key={i}
            method={tx.method}
            description={tx.description}
            params={tx.params}
            onError={onTxError}
            onSuccess={onTxSuccess}
          />
        ))}
      </div>
    </div>
  );
}
