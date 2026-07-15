import { ConnectKitButton } from 'connectkit';
import { useAccount, useSwitchChain } from 'wagmi';
import { mainnet } from 'wagmi/chains';

const CHAINS = [mainnet];

export function WalletBar() {
  const { chain, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();

  return (
    <div className="flex items-center gap-3">
      {isConnected && (
        <>
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--color-teal)]/10 text-[var(--color-teal)]">
            Mainnet
          </span>

          <select
            value={chain?.id ?? mainnet.id}
            onChange={(e) => switchChain({ chainId: Number(e.target.value) })}
            className="bg-transparent border border-[var(--color-border-strong)] text-[var(--color-text)] text-xs rounded-lg px-2 py-1.5 outline-none cursor-pointer hover:bg-black/5 transition-colors appearance-none"
          >
            {CHAINS.map((c) => (
              <option
                key={c.id}
                value={c.id}
                className="bg-[#f6f6f6] text-[#1b1b1b]"
              >
                {c.name}
              </option>
            ))}
          </select>
        </>
      )}

      <ConnectKitButton />
    </div>
  );
}
