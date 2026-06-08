<div align="center">

# EquinoxFi

### *Stake. Earn. Repeat.*

Stake an ERC-20, earn a second ERC-20 streamed linearly over time — plus a
constant-product DEX to swap, buy, and sell. Contracts, indexer, and dApp in one
TypeScript monorepo.

</div>

---

## What's inside

Two DeFi products side by side:

- **Staking vault** — Synthetix `StakingRewards` accumulator pattern. Rewards
  accrue per-share at a fixed rate, claimed on demand. O(1) per interaction, so
  gas stays constant no matter how many users join.
- **AMM DEX** — Factory + Pair + Router with constant-product (`x·y=k`)
  pricing, 0.3% fee, CREATE2-deterministic pairs. The dApp wraps it in a
  **Swap / Buy / Sell** UI plus a liquidity page.

| Package | Stack | Role |
|---|---|---|
| [`packages/contracts`](packages/contracts) | Solidity 0.8.24, Foundry | Vault + AMM + tests |
| [`packages/backend`](packages/backend) | Node, Fastify, viem, SQLite | Event indexer + REST API |
| [`packages/frontend`](packages/frontend) | React, Vite, wagmi, Tailwind | Wallet dApp |

**The contract is the source of truth** — funds and accounting live on-chain.
The backend indexes events into SQLite for fast historical reads (total stakers,
rewards paid); live figures (TVL, reward rate, `earned`) are read straight from
the chain.

---

## Deployed (Sepolia · chain `11155111`)

| Contract | Address |
|---|---|
| `EquinoxVault` | [`0xF06C8E0d…fD059a2`](https://sepolia.etherscan.io/address/0xF06C8E0d362D5fdAcd510BBeEEB4b1D45fD059a2) |
| Staking token `eSTAKE` | [`0xfDfd8c74…FFb0531`](https://sepolia.etherscan.io/address/0xfDfd8c74193df960759BF7Ce5d0675D34FFb0531) |
| Reward token `eRWD` | [`0x4fd7848A…0eCe17D`](https://sepolia.etherscan.io/address/0x4fd7848Aed8fc0c2FCca33494e55A0B330eCe17D) |

Factory / Router / eTKNA / eTKNB / pair are deployed by the same
`Deploy.s.sol` — copy the logged addresses into `.env`.
