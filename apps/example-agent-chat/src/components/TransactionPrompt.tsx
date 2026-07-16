import { useState } from 'react';
import {
  createPublicClient,
  http,
  type Chain,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
} from 'viem';
import { mainnet, mantle } from 'viem/chains';
import { useAccount, useSwitchChain } from 'wagmi';

interface TransactionPromptProps {
  method: string;
  description: string;
  params: Record<string, unknown>;
  onError?: (error: string) => void;
  onSuccess?: (message: string) => void;
}

const METHOD_LABELS: Record<string, string> = {
  'aave.supplyFbtc': 'Supply FBTC to Aave V3 (Ethereum / Mantle)',
  'aave.withdrawFbtc': 'Withdraw FBTC from Aave V3 (Ethereum / Mantle)',
  'aave.borrowStablecoin': 'Borrow stablecoin from Aave V3 (Ethereum / Mantle)',
  'aave.repayStablecoin': 'Repay stablecoin on Aave V3 (Ethereum / Mantle)',
};

const SUPPORTED_CHAINS: Record<number, Chain> = {
  [mainnet.id]: mainnet,
  [mantle.id]: mantle,
};

function resolveRpcUrl(chainId: number): string | undefined {
  if (chainId === mantle.id) {
    return import.meta.env.VITE_PUBLIC_MANTLE_RPC_URL || undefined;
  }
  return import.meta.env.VITE_PUBLIC_ETH_RPC_URL || undefined;
}

function makePublicClient(chainId: number): PublicClient {
  const chain = SUPPORTED_CHAINS[chainId] ?? mainnet;
  return createPublicClient({
    chain,
    transport: http(resolveRpcUrl(chain.id), { timeout: 60_000 }),
  });
}

/** Extract a human-readable message from wallet / RPC / viem errors. */
function formatWalletError(err: unknown): string {
  if (err == null) return 'Transaction failed';
  if (typeof err === 'string' && err.trim() && err !== '[object Object]') {
    return err.trim();
  }

  const pick = (value: unknown): string | null => {
    if (typeof value === 'string' && value.trim() && value !== '[object Object]') {
      return value.trim();
    }
    return null;
  };

  if (typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const nested =
      e.data && typeof e.data === 'object'
        ? (e.data as Record<string, unknown>)
        : e.cause && typeof e.cause === 'object'
          ? (e.cause as Record<string, unknown>)
          : null;

    const candidates = [
      pick(e.shortMessage),
      pick(e.details),
      pick(e.reason),
      pick(e.message),
      nested ? pick(nested.shortMessage) : null,
      nested ? pick(nested.message) : null,
      nested ? pick(nested.reason) : null,
      nested ? pick(nested.data) : null,
    ].filter(Boolean) as string[];

    if (candidates.length > 0) {
      return candidates[0].replace(/https?:\/\/[^\s]+/g, '').trim();
    }

    // MetaMask sometimes nests the useful text under data.originalError
    if (nested?.originalError && typeof nested.originalError === 'object') {
      const original = formatWalletError(nested.originalError);
      if (original !== 'Transaction failed') return original;
    }

    try {
      const json = JSON.stringify(err);
      if (json && json !== '{}' && json !== '[object Object]') {
        return json.length > 280 ? `${json.slice(0, 280)}...` : json;
      }
    } catch {
      // ignore
    }
  }

  if (err instanceof Error && err.message && err.message !== '[object Object]') {
    return err.message;
  }

  return 'Transaction failed';
}

/**
 * Wait for a receipt on the correct chain. If the RPC times out after the
 * tx is already mined (common on public endpoints), fall back to a one-shot
 * receipt fetch so the approve → supply sequence is not blocked.
 */
async function waitForReceipt(
  publicClient: PublicClient,
  hash: Hash,
): Promise<TransactionReceipt> {
  try {
    return await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
      timeout: 120_000,
      pollingInterval: 1_500,
    });
  } catch (err) {
    const receipt = await publicClient
      .getTransactionReceipt({ hash })
      .catch(() => null);
    if (receipt) return receipt;
    throw err;
  }
}

async function readWalletChainId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any,
): Promise<number> {
  const hex = (await provider.request({ method: 'eth_chainId' })) as string;
  return Number.parseInt(hex, 16);
}

export function TransactionPrompt({
  method,
  description,
  params,
  onError,
  onSuccess,
}: TransactionPromptProps) {
  const { address, connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [status, setStatus] = useState<
    'idle' | 'executing' | 'success' | 'error'
  >('idle');
  const [progress, setProgress] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const label = METHOD_LABELS[method] ?? method;

  const handleExecute = async () => {
    if (!address) return;
    setStatus('executing');
    setError(null);
    setProgress(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let provider = (await connector?.getProvider()) as any;
      if (!provider)
        throw new Error(
          'No wallet provider found. Please reconnect your wallet.',
        );

      const targetChainId = Number(params.chainId) || mainnet.id;
      if (!SUPPORTED_CHAINS[targetChainId]) {
        throw new Error(
          `Unsupported chainId ${targetChainId}. Supported: ${Object.keys(SUPPORTED_CHAINS).join(', ')}`,
        );
      }

      const walletChainId = await readWalletChainId(provider);
      if (walletChainId !== targetChainId) {
        setProgress(
          `Switching wallet to ${SUPPORTED_CHAINS[targetChainId].name}...`,
        );
        await switchChainAsync({ chainId: targetChainId });
        // Re-read provider after switch — some connectors refresh the session.
        provider = (await connector?.getProvider()) as typeof provider;
        const afterSwitch = await readWalletChainId(provider);
        if (afterSwitch !== targetChainId) {
          throw new Error(
            `Wallet is on chainId ${afterSwitch}, but this action needs ${targetChainId} (${SUPPORTED_CHAINS[targetChainId].name}). Switch network in your wallet and retry.`,
          );
        }
      }

      if (!METHOD_LABELS[method]) {
        throw new Error(`Unknown method: ${method}`);
      }

      const txs =
        (params.transactions as {
          to: string;
          data: string;
          label: string;
        }[]) || [];
      if (txs.length === 0) throw new Error('No transactions to execute');

      // Must match the prepared tx chain — waiting on the wrong chain times out
      // even when the approve already succeeded (e.g. Mantle tx + Ethereum RPC).
      const publicClient = makePublicClient(targetChainId);
      const chainIdHex = `0x${targetChainId.toString(16)}`;

      let hash: string | undefined;
      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        setProgress(`Estimating gas: ${tx.label}`);

        let gasHex: string | undefined;
        try {
          const gas = await publicClient.estimateGas({
            account: address as `0x${string}`,
            to: tx.to as `0x${string}`,
            data: tx.data as `0x${string}`,
            value: 0n,
          });
          // +20% headroom — Mantle / some wallets under-estimate otherwise
          gasHex = `0x${((gas * 12n) / 10n).toString(16)}`;
        } catch (estimateErr) {
          throw new Error(
            `Gas estimation failed for "${tx.label}" on ${SUPPORTED_CHAINS[targetChainId].name}: ${formatWalletError(estimateErr)}. ` +
              `Check you have enough ${targetChainId === mantle.id ? 'MNT' : 'ETH'} for gas and the required token balance on this network.`,
          );
        }

        setProgress(`Confirm in wallet: ${tx.label}`);
        hash = await provider.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from: address,
              to: tx.to,
              data: tx.data,
              value: '0x0',
              chainId: chainIdHex,
              gas: gasHex,
            },
          ],
        });

        // Approve must be mined before supply.
        if (i < txs.length - 1) {
          setProgress(`Waiting for confirmation: ${tx.label}`);
          const receipt = await waitForReceipt(
            publicClient,
            hash as `0x${string}`,
          );
          if (receipt.status === 'reverted') {
            throw new Error(`Transaction reverted: ${tx.label} (${hash})`);
          }
        }
      }

      if (!hash) {
        throw new Error('Transaction did not return a hash');
      }

      setTxHash(hash);
      setProgress(null);
      setStatus('success');
      onSuccess?.(
        `Transaction submitted successfully with hash ${hash}. What should I do next?`,
      );
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errObj = err as any;
      const code = errObj?.code ?? errObj?.cause?.code;
      const raw = formatWalletError(err);
      const isRejection =
        code === 4001 ||
        code === 'ACTION_REJECTED' ||
        /user (rejected|denied|cancelled)/i.test(raw) ||
        /request.*reject/i.test(raw);

      if (isRejection) {
        setProgress(null);
        setError(
          'Transaction rejected. Click Execute to try again when ready.',
        );
        setStatus('error');
        return;
      }

      const firstLine = raw.split('\n')[0].trim();
      const clean =
        firstLine.length > 280 ? `${firstLine.slice(0, 280)}...` : firstLine;
      const errorMsg = clean || 'Transaction failed';
      setProgress(null);
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
        {Array.isArray(params.transactions)
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
        <>
          <p className="text-[11px] text-[var(--color-text-muted)] mb-2">
            Click Execute to open your wallet and sign. Signing is not automatic.
          </p>
          <button
            onClick={handleExecute}
            disabled={!address}
            className="w-full rounded-[60px] bg-[var(--color-primary)] py-2 text-xs font-semibold text-[var(--color-black)] hover:bg-[var(--color-primary-dark)] transition-colors disabled:opacity-40"
          >
            {address ? 'Execute Transaction' : 'Connect Wallet to Execute'}
          </button>
        </>
      )}

      {status === 'executing' && (
        <div className="w-full rounded-[60px] border border-[var(--color-teal)] py-2 px-3 text-xs font-medium text-[var(--color-teal)] text-center flex items-center justify-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full border-2 border-[var(--color-teal)] border-t-transparent animate-spin" />
          <span className="truncate">
            {progress || 'Awaiting wallet confirmation...'}
          </span>
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
