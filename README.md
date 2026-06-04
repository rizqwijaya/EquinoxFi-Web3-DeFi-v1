<div align="center">

# EquinoxFi

### *Balance at the heart of yield.*

A single-asset yield-staking protocol: stake an ERC-20 token, earn a second
ERC-20 reward token streamed linearly over time. Smart contracts, an indexer
API, and a web dApp — in one TypeScript-first monorepo.

</div>

---

## Overview

EquinoxFi ships **two DeFi products** side by side:

1. **Staking vault** — built on the battle-tested **Synthetix `StakingRewards`
   accumulator pattern**. Users stake a token and accrue rewards proportional to
   their share of the pool at a fixed rate, claimed on demand. No loop over
   stakers, so gas stays constant no matter how many users join.
2. **AMM DEX** — a minimal **Uniswap V2** port (Factory + Pair + Router) with
   constant-product (`x·y=k`) pricing, a 0.3% swap fee, and CREATE2-deterministic
   pair addresses. The dApp surfaces it as a Uniswap-style **Swap / Buy / Sell**
   interface plus an add/remove **liquidity** page.

The project ships three coordinated pieces:

| Package | Stack | Role |
|---|---|---|
| [`packages/contracts`](packages/contracts) | Solidity 0.8.24, Foundry, OpenZeppelin | `EquinoxVault` staking + `EquinoxFactory`/`Pair`/`Router` AMM + tests |
| [`packages/backend`](packages/backend) | Node + TypeScript, Fastify, viem, SQLite | Event indexer + REST API (staking stats + DEX swap stats) |
| [`packages/frontend`](packages/frontend) | React, Vite, wagmi, TailwindCSS | Wallet dApp: swap / pool / stake / withdraw / claim |

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

### The AMM (Uniswap V2 port)

The DEX is a trimmed port of Uniswap V2:

- [`EquinoxPair`](packages/contracts/src/EquinoxPair.sol) — one constant-product
  pool per token pair; *is* its own LP token. Enforces `k` with the 0.3% fee
  baked into an adjusted-balance invariant check, guarded by a reentrancy lock.
- [`EquinoxFactory`](packages/contracts/src/EquinoxFactory.sol) — deploys pairs
  via **CREATE2** (`salt = keccak256(token0, token1)`), so a pair's address is
  deterministic and derivable off-chain from `INIT_CODE_HASH`.
- [`EquinoxRouter`](packages/contracts/src/EquinoxRouter.sol) — the user-facing
  entrypoint: `addLiquidity` / `removeLiquidity` / `swapExactTokensForTokens`,
  with deadline + slippage (`amountOutMin`) protection and a `getAmountsOut`
  view for live quotes. Locates pairs with `pairFor` (CREATE2, no storage read).

The dApp's **Swap / Buy / Sell** tabs all map onto the same on-chain
`swapExactTokensForTokens` call — Buy locks the direction to eTKNB→eTKNA, Sell to
eTKNA→eTKNB, Swap flips freely. Slippage and deadline come from the gear popup.

> Differences from mainnet Uniswap V2: no protocol fee (`feeTo`/`kLast`), no
> flash-swap callback, no price oracle accumulator, no EIP-2612 permit — each is
> extra surface area unnecessary for this testnet demo. The locked
> `MINIMUM_LIQUIDITY` goes to the burn address (`0x…dEaD`) rather than
> `address(0)`, since OpenZeppelin v5 `ERC20` forbids minting to zero.

---

## Deployed contracts (Sepolia)

| Contract | Address | Explorer |
|---|---|---|
| `EquinoxVault` | `0xF06C8E0d362D5fdAcd510BBeEEB4b1D45fD059a2` | [Sepolia Etherscan ↗](https://sepolia.etherscan.io/address/0xF06C8E0d362D5fdAcd510BBeEEB4b1D45fD059a2) |
| Staking token (`eSTAKE`) | `0xfDfd8c74193df960759BF7Ce5d0675D34FFb0531` | [Sepolia Etherscan ↗](https://sepolia.etherscan.io/address/0xfDfd8c74193df960759BF7Ce5d0675D34FFb0531) |
| Reward token (`eRWD`) | `0x4fd7848Aed8fc0c2FCca33494e55A0B330eCe17D` | [Sepolia Etherscan ↗](https://sepolia.etherscan.io/address/0x4fd7848Aed8fc0c2FCca33494e55A0B330eCe17D) |
| `EquinoxFactory` / `Router` / eTKNA / eTKNB / pair | _set after deploy_ | from the deploy-script logs (`-- DEX --`) |

Network: **Ethereum Sepolia** · Chain ID `11155111` · explorer
`https://sepolia.etherscan.io`. The DEX (factory, router, eTKNA/eTKNB tokens,
and the seeded pair) is deployed by the same `Deploy.s.sol`; copy its logged
addresses into `.env` (`VITE_FACTORY_ADDRESS`, `VITE_ROUTER_ADDRESS`,
`VITE_PAIR_ADDRESS`, `VITE_TOKEN_A_ADDRESS`, `VITE_TOKEN_B_ADDRESS`, `PAIR_ADDRESS`).

---

## Testing & coverage

The Foundry suite covers happy paths, edge cases (zero-amount reverts,
over-withdraw, double-claim), proportional two-staker reward math with
`vm.warp`, a fuzz test on stake amounts, and a reentrancy proof that asserts a
malicious re-entrant token is rejected by the `nonReentrant` guard.

The AMM suite ([`EquinoxAmm.t.sol`](packages/contracts/test/EquinoxAmm.t.sol))
adds CREATE2 determinism (`pairFor` == deployed address), proportional liquidity
add/remove, swap-output-matches-quote, a `k`-increases-with-fee assertion,
slippage + deadline reverts, and a `getAmountOut` fuzz.

```bash
cd packages/contracts
forge test          # 30 tests, all passing (vault + AMM)
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
# Staking: GET /health · /stats · /stakers/:address · /activity
# DEX:     GET /dex/stats · /dex/activity · /dex/:address/history
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
