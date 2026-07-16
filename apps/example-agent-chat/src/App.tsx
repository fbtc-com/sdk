import { useState } from 'react';

import logoWhite from './assets/logo-white.svg';
import { ChatPanel } from './components/ChatPanel';
import { WalletBar } from './components/WalletBar';

const features = [
  {
    index: '01',
    title: 'Review the reserve',
    description:
      'Inspect the FBTC reserve on Aave V3 Ethereum or Aave V3 Mantle.',
    example: '"Check the FBTC reserve on Aave V3 Ethereum"',
  },
  {
    index: '02',
    title: 'Supply FBTC',
    description:
      'Approve and supply FBTC to Aave V3 on Ethereum or Mantle and receive the corresponding aFBTC position.',
    example: '"Supply 0.1 FBTC to Aave V3 Ethereum"',
  },
  {
    index: '03',
    title: 'Borrow stablecoins',
    description:
      'Borrow USDC, USDT, or USDe against your FBTC collateral. On Mantle, USDT is USDT0.',
    example: '"Borrow 0.1 USDT from Aave V3 Mantle"',
  },
  {
    index: '04',
    title: 'Withdraw & repay',
    description:
      'Withdraw FBTC collateral or repay stablecoin debt — use an amount or "max" to clear a position.',
    example: '"Repay my stablecoin debt on Aave V3 Ethereum"',
  },
  {
    index: '05',
    title: 'Pick the network',
    description:
      'Use Ethereum Mainnet or Mantle — the wallet switches to the prepared transaction chain.',
    example: '"Confirm I am on the correct network"',
  },
  {
    index: '06',
    title: 'Keep control',
    description:
      'Function prepares calldata; your wallet remains in control of every transaction.',
    example: '"Check my FBTC balance on Mantle"',
  },
];

export function App() {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="app-shell min-h-screen overflow-hidden bg-[var(--color-bg)]">
      <header className="relative z-10 px-5 py-5 sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between rounded-full border border-[var(--color-border)] bg-[var(--color-nav)] px-5 py-3 backdrop-blur-xl">
          <img src={logoWhite} alt="Function" className="h-7 w-auto" />
          <WalletBar />
        </div>
      </header>

      <main className="relative z-0 mx-auto max-w-7xl px-5 pb-24 sm:px-8">
        <section className="hero-grid relative min-h-[620px] overflow-hidden border border-[var(--color-border)] px-6 py-16 sm:px-12 sm:py-24 lg:px-20">
          <div className="hero-fold" aria-hidden="true">
            <span className="fold-gold" />
            <span className="fold-slate" />
            <span className="fold-obsidian" />
          </div>
          <div className="relative z-10 max-w-4xl">
            <div className="eyebrow mb-8 inline-flex items-center gap-3 rounded-full border border-[var(--color-border-strong)] px-4 py-2 text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--color-primary)] shadow-[0_0_18px_var(--color-primary)]" />
              FBTC intelligent DeFi
            </div>
            <h1 className="display-heading max-w-4xl text-5xl font-normal leading-[0.91] tracking-[-0.045em] text-[var(--color-text)] sm:text-7xl lg:text-[104px]">
              Put your Bitcoin
              <span className="block">to work.</span>
            </h1>
            <p className="mt-8 max-w-2xl text-base leading-7 text-[var(--color-text-muted)] sm:text-lg">
              Meet the Function assistant for FBTC on Aave V3 Ethereum and
              Mantle. Supply FBTC, borrow stablecoins, and manage your position
              with transparent wallet confirmation.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <button
                onClick={() => setChatOpen(true)}
                className="primary-button"
              >
                Launch assistant
                <span aria-hidden="true">↗</span>
              </button>
              <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-subtle)]">
                Non-custodial · Wallet controlled
              </span>
            </div>
          </div>
          <div className="hero-stat relative z-10 mt-20 flex max-w-sm items-end justify-between border-t border-[var(--color-border)] pt-5">
            <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-subtle)]">
              Asset
            </span>
            <span className="display-heading text-4xl tracking-tight text-[var(--color-text)]">
              FBTC
            </span>
          </div>
        </section>

        <section className="py-24">
          <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
                One assistant. Six actions.
              </p>
              <h2 className="display-heading text-4xl font-normal tracking-[-0.035em] text-[var(--color-text)] sm:text-6xl">
                Move through DeFi with clarity.
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-[var(--color-text-muted)]">
              From reserve discovery to supplying FBTC, borrowing stablecoins,
              and repaying debt — every step stays visible and under your
              control.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <FeatureCard key={feature.index} {...feature} />
            ))}
          </div>
        </section>
      </main>

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="chat-fab"
          aria-label="Open Function assistant"
        >
          <span className="h-2 w-2 rounded-full bg-[var(--color-black)]" />
          Chat with Function
        </button>
      )}
    </div>
  );
}

function FeatureCard({
  index,
  title,
  description,
  example,
}: {
  index: string;
  title: string;
  description: string;
  example: string;
}) {
  return (
    <article className="group min-h-64 bg-[var(--color-surface)] p-7 transition-colors hover:bg-[var(--color-surface-hover)]">
      <div className="mb-12 flex items-start justify-between">
        <span className="text-xs tracking-[0.16em] text-[var(--color-text-subtle)]">
          {index}
        </span>
        <span className="text-xl text-[var(--color-primary)] opacity-40 transition-opacity group-hover:opacity-100">
          ↗
        </span>
      </div>
      <h3 className="display-heading mb-3 text-2xl font-normal tracking-tight text-[var(--color-text)]">
        {title}
      </h3>
      <p className="mb-6 text-sm leading-6 text-[var(--color-text-muted)]">
        {description}
      </p>
      <code className="text-xs leading-5 text-[var(--color-primary)]">
        {example}
      </code>
    </article>
  );
}
