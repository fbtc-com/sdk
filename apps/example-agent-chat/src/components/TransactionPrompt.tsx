import { useState } from 'react';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { useAccount, useSwitchChain } from 'wagmi';

interface TransactionPromptProps {
  method: string;
  description: string;
  params: Record<string, unknown>;
  onError?: (error: string) => void;
  onSuccess?: (message: string) => void;
}

const METHOD_LABELS = {
  'aave.supplyFbtc': 'Supply FBTC to Aave V3',
} as const satisfies Record<string, string>;

type MethodName = keyof typeof METHOD_LABELS;

export function TransactionPrompt({
  method,
  description,
  params,
  onError,
  onSuccess,
}: TransactionPromptProps) {
  const { address, chain, connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [status, setStatus] = useState<
    'idle' | 'executing' | 'success' | 'error'
  >('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const label = METHOD_LABELS[method as MethodName] ?? method;

  const handleExecute = async () => {
    if (!address) return;
    setStatus('executing');
    setError(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider = (await connector?.getProvider()) as any;
      if (!provider)
        throw new Error(
          'No wallet provider found. Please reconnect your wallet.',
        );

      const targetChainId = (params.chainId as number) || mainnet.id;

      if (chain && chain.id !== targetChainId) {
        await switchChainAsync({ chainId: targetChainId });
      }

      if (method !== 'aave.supplyFbtc') {
        throw new Error(`Unknown method: ${method}`);
      }

      const txs =
        (params.transactions as {
          to: string;
          data: string;
          label: string;
        }[]) || [];
      if (txs.length === 0) throw new Error('No transactions to execute');

      const publicClient = createPublicClient({
        chain: mainnet,
        transport: http(),
      });

      let hash: string | undefined;
      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        hash = await provider.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from: address,
              to: tx.to,
              data: tx.data,
            },
          ],
        });
        if (i < txs.length - 1) {
          await publicClient.waitForTransactionReceipt({
            hash: hash as `0x${string}`,
          });
        }
      }

      if (!hash) {
        throw new Error('Transaction did not return a hash');
      }

      setTxHash(hash);
      setStatus('success');
      onSuccess?.(
        `Transaction submitted successfully with hash ${hash}. What should I do next?`,
      );
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errObj = err as any;
      const code = errObj?.code ?? errObj?.cause?.code;
      const raw = err instanceof Error ? err.message : String(err);
      const isRejection =
        code === 4001 ||
        code === 'ACTION_REJECTED' ||
        /user (rejected|denied|cancelled)/i.test(raw) ||
        /request.*reject/i.test(raw);

      if (isRejection) {
        setError(
          'Transaction rejected. Click Execute to try again when ready.',
        );
        setStatus('error');
        return;
      }

      const firstLine = raw
        .split('\n')[0]
        .replace(/https?:\/\/[^\s]+/g, '')
        .trim();
      const clean =
        firstLine.length > 200 ? firstLine.slice(0, 200) + '...' : firstLine;
      const errorMsg = clean || 'Transaction failed';
      setError(errorMsg);
      setStatus('error');
      onError?.(errorMsg);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center rounded-[60px] bg-[var(--color-teal)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--color-teal)]">
          {label}
        </span>
      </div>
      <p className="text-xs text-[var(--color-text-muted)] mb-3">
        {description}
      </p>

      <div className="space-y-1 mb-3">
        {method === 'aave.supplyFbtc' && Array.isArray(params.transactions)
          ? (params.transactions as { to: string; label: string }[]).map(
              (tx, i) => (
                <div key={i} className="flex justify-between text-xs gap-2">
                  <span className="text-[var(--color-text-muted)] shrink-0">
                    Step {i + 1}
                  </span>
                  <span className="text-[var(--color-text)] truncate text-right">
                    {tx.label}
                  </span>
                </div>
              ),
            )
          : Object.entries(params)
              .filter(([k]) => !['chainId', 'transactions'].includes(k))
              .map(([key, value]) => {
                const str = String(value);
                const isAddress = str.startsWith('0x') && str.length > 20;
                const display = isAddress
                  ? `${str.slice(0, 6)}...${str.slice(-4)}`
                  : str;
                return (
                  <div key={key} className="flex justify-between text-xs gap-2">
                    <span className="text-[var(--color-text-muted)] capitalize shrink-0">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <span
                      className="text-[var(--color-text)] font-mono truncate text-right"
                      title={isAddress ? str : undefined}
                    >
                      {display}
                    </span>
                  </div>
                );
              })}
      </div>

      {status === 'idle' && (
        <button
          onClick={handleExecute}
          disabled={!address}
          className="w-full rounded-[60px] bg-[var(--color-primary)] py-2 text-xs font-semibold text-[var(--color-black)] hover:bg-[var(--color-primary-dark)] transition-colors disabled:opacity-40"
        >
          {address ? 'Execute Transaction' : 'Connect Wallet to Execute'}
        </button>
      )}

      {status === 'executing' && (
        <div className="w-full rounded-[60px] border border-[var(--color-teal)] py-2 text-xs font-medium text-[var(--color-teal)] text-center flex items-center justify-center gap-2">
          <span className="h-3 w-3 rounded-full border-2 border-[var(--color-teal)] border-t-transparent animate-spin" />
          Awaiting wallet confirmation...
        </div>
      )}

      {status === 'success' && txHash && (
        <div className="w-full rounded-[60px] border border-green-500 py-2 text-xs font-medium text-green-500 text-center">
          Transaction submitted:{' '}
          <span className="font-mono">
            {txHash.slice(0, 10)}...{txHash.slice(-8)}
          </span>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-2">
          <div className="w-full rounded-lg border border-red-500/30 bg-red-500/10 py-2 px-3 text-xs text-red-400">
            {error}
          </div>
          <button
            onClick={handleExecute}
            className="w-full rounded-[60px] bg-[var(--color-primary)] py-2 text-xs font-semibold text-[var(--color-black)] hover:bg-[var(--color-primary-dark)] transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
