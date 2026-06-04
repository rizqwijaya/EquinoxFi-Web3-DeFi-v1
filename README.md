<div align="center">

# EquinoxFi

### *Balance at the heart of yield.*

A single-asset yield-staking protocol: stake an ERC-20 token, earn a second
ERC-20 reward token streamed linearly over time. Smart contracts, an indexer
API, and a web dApp — in one TypeScript-first monorepo.

</div>

---

## Overview

EquinoxFi is a staking vault built on the battle-tested **Synthetix
`StakingRewards` accumulator pattern**. Users stake a token and accrue rewards
proportional to their share of the pool, distributed at a fixed rate over a
reward period. Rewards accrue continuously and are claimed on demand — no loop
over stakers, so gas stays constant no matter how many users join.

The project ships three coordinated pieces:

| Package | Stack | Role |
|---|---|---|
| [`packages/contracts`](packages/contracts) | Solidity 0.8.24, Foundry, OpenZeppelin | The `EquinoxVault` staking contract + tests |
| [`packages/backend`](packages/backend) | Node + TypeScript, Fastify, viem, SQLite | Event indexer + REST API for aggregated stats |
| [`packages/frontend`](packages/frontend) | React, Vite, wagmi, TailwindCSS | Wallet dApp: stake / withdraw / claim |

---

## Architecture

```
        ┌─────────────┐   events    ┌──────────────┐   /stats     ┌─────────────┐
        │ EquinoxVault │ ──────────▶ │   Backend    │ ───────────▶ │  Frontend   │
        │  (Sepolia)   │  getLogs    │  (indexer +  │   REST API   │   (dApp)    │
        │              │ ◀────────── │   SQLite)    │              │             │
        └─────────────┘   reads      └──────────────┘              └──────┬──────┘
              ▲                                                            │
              │            stake / withdraw / claim (wagmi + viem)         │
              └────────────────────────────────────────────────────────────┘
```

- **The contract is the source of truth.** All funds and accounting live
  on-chain.
- **The backend** indexes `Staked` / `Withdrawn` / `RewardPaid` events into
  SQLite to serve fast, aggregated, historical reads (total stakers, total
  rewards paid) that the chain cannot cheaply provide. Live figures
  (TVL, reward rate) are read straight from the contract.
- **The frontend** reads live per-user state (`balanceOf`, `earned`) directly
  from the contract via wagmi, and pool-level stats from the backend.

### Why the accumulator pattern?

A naïve staking contract loops over every staker on each distribution — an
**O(n)** cost that eventually exceeds the block gas limit and bricks the
contract (an unbounded-gas DoS). EquinoxVault instead maintains a single global
`rewardPerTokenStored` accumulator and settles each user's accrual lazily,
**O(1)** per interaction, when they next touch the contract. See the in-file
comment block in [`EquinoxVault.sol`](packages/contracts/src/EquinoxVault.sol)
for the full derivation.

---

## Deployed contracts (Sepolia)

> **Status: not yet deployed.** Deployment is a separate step that requires a
> funded test wallet (`.env`). Once
> [`script/Deploy.s.sol`](packages/contracts/script/Deploy.s.sol) is broadcast,
> the addresses below are filled in with direct Etherscan links.

| Contract | Address | Explorer |
|---|---|---|
| `EquinoxVault` | `0x…` (pending) | [Sepolia Etherscan](https://sepolia.etherscan.io) |
| Staking token (`eSTAKE`) | `0x…` (pending) | [Sepolia Etherscan](https://sepolia.etherscan.io) |
| Reward token (`eRWD`) | `0x…` (pending) | [Sepolia Etherscan](https://sepolia.etherscan.io) |

Network: **Ethereum Sepolia** · Chain ID `11155111` · explorer
`https://sepolia.etherscan.io`.

---

## Testing & coverage

The Foundry suite covers happy paths, edge cases (zero-amount reverts,
over-withdraw, double-claim), proportional two-staker reward math with
`vm.warp`, a fuzz test on stake amounts, and a reentrancy proof that asserts a
malicious re-entrant token is rejected by the `nonReentrant` guard.

```bash
cd packages/contracts
forge test          # 18 tests, all passing
forge coverage      # EquinoxVault.sol: 98.31% lines, 90.00% branches
```

| File | Lines | Branches | Functions |
|---|---|---|---|
| `EquinoxVault.sol` | **98.31%** | 90.00% | 92.31% |

---

## Running locally

### Prerequisites
- [Node.js](https://nodejs.org) ≥ 22 (uses the built-in `node:sqlite`)
- [pnpm](https://pnpm.io) ≥ 11
- [Foundry](https://book.getfoundry.sh) (`forge`, `cast`, `anvil`)

### 1. Install
```bash
pnpm install
```

### 2. Contracts — build & test
```bash
cd packages/contracts
forge build
forge test
```

### 3. Configure environment
```bash
cp .env.example .env
# Fill SEPOLIA_RPC_URL, PRIVATE_KEY (a dedicated test wallet), ETHERSCAN_API_KEY.
# After deploying, set VAULT_ADDRESS / token addresses + VITE_* mirrors.
```

### 4. Deploy to Sepolia (optional)
```bash
cd packages/contracts
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
```

### 5. Backend — indexer/API
```bash
pnpm --filter @equinoxfi/backend dev      # http://localhost:3001
# GET /health · GET /stats · GET /stakers/:address
```

### 6. Frontend — dApp
```bash
pnpm --filter @equinoxfi/frontend dev     # http://localhost:5173
```

---

## Security

The threat model and mitigations (reentrancy, access control, reward solvency,
ERC-20 quirks) are documented in [`SECURITY.md`](SECURITY.md). In short: the
vault follows checks-effects-interactions, guards every state-changing external
function with OpenZeppelin `ReentrancyGuard`, gates admin functions with
`Ownable`, and moves tokens only through `SafeERC20`.

---

## License

MIT.
