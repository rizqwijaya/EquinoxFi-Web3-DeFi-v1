# GENERAL.md — EquinoxFi · Yield Staking Protocol

> Context/spec file for this project. Read this fully before writing any code.
> This is a **portfolio project** for a remote Blockchain Developer job application.
> The owner must be able to **explain every design decision in an interview**, so
> narrate your reasoning as you build and avoid "magic" the owner can't defend.

---

## 0. Project Identity

**Product name:** EquinoxFi
**Tagline:** *Balance at the heart of yield.*

**Philosophy:**
In astronomy, the equinox is the precise moment when day and night achieve perfect
balance — neither force dominates, and the cosmos stands in equilibrium. EquinoxFi
embodies that same principle: a protocol where risk and reward are in harmony, where
stakers and the protocol share a relationship of equal trust, and where yield flows
with the same quiet, celestial precision as the Earth moving through its orbit.

The equinox doesn't happen by accident. It is the result of gravitational forces
working in perfect concert over vast, unmeasured time. EquinoxFi rewards patience
the same way — the longer you hold your orbit, the more the protocol works in your
favour. No shortcuts. No volatility theater. Just the steady pull of a balanced system
doing exactly what it was designed to do.

> *"Like the cosmos, we don't rush. We balance."*

**Visual identity direction (for README/frontend):**
Deep space palette — midnight navy, electric indigo, soft aurora teal. The logo concept:
two arcs meeting at a precise point of equilibrium, evoking both an orbit and a scale.

---

## 1. Goal

Build a complete, deployed, well-tested **single-asset staking protocol** named **EquinoxFi**,
where users stake an ERC-20 token and earn a second ERC-20 reward token distributed
linearly over time. Ship the smart contracts, an indexer/API backend, and a web frontend
— all today.

Success = contracts deployed and verified on Sepolia, tests green with high coverage,
backend serving live on-chain stats, frontend letting a user stake/withdraw/claim.

---

## 2. Tech Stack (modern, TypeScript-first)

- **Monorepo:** pnpm workspaces (`packages/contracts`, `packages/backend`, `packages/frontend`)
- **Smart contracts:** Solidity ^0.8.24, **Foundry** (forge/cast/anvil), OpenZeppelin Contracts
- **Backend:** Node.js + **TypeScript**, **Fastify**, **viem** for chain reads, **SQLite** (better-sqlite3) to cache indexed events. Role = indexer that listens to contract events and exposes a REST API (`/stats`, `/stakers/:address`).
- **Frontend:** **React + TypeScript + Vite**, **wagmi + viem**, **TailwindCSS**, **@tanstack/react-query** for data fetching from the backend.
- **Tooling:** ESLint + Prettier, `.env` for secrets (never commit), GitHub-ready repo.

---

## 3. Repo structure

```
equinoxfi/
├─ GENERAL.md
├─ README.md                   # write LAST; professional, English
├─ SECURITY.md                 # threat model + mitigations
├─ pnpm-workspace.yaml
└─ packages/
   ├─ contracts/               # Foundry project
   │  ├─ src/EquinoxVault.sol
   │  ├─ src/MockERC20.sol      # for local testing only
   │  ├─ test/EquinoxVault.t.sol
   │  ├─ script/Deploy.s.sol
   │  └─ foundry.toml
   ├─ backend/                 # Fastify + viem indexer/API
   │  └─ src/index.ts
   └─ frontend/                # React + Vite + wagmi
      └─ src/...
```

---

## 4. Smart contract spec — `EquinoxVault`

Use the **Synthetix StakingRewards accumulator pattern** (`rewardPerTokenStored`,
`userRewardPerTokenPaid`, `rewards[]`). Do NOT loop over all stakers — explain in comments
why the accumulator avoids unbounded gas.

State / behavior:
- Immutable `stakingToken` and `rewardToken` (ERC-20).
- `stake(uint256 amount)` — pulls tokens via `transferFrom`, updates accounting.
- `withdraw(uint256 amount)` — returns staked tokens.
- `claimReward()` — sends accrued rewards.
- `exit()` — withdraw all + claim in one tx.
- Owner-only `notifyRewardAmount(uint256 reward)` + `rewardsDuration` to fund/stream rewards.
- `earned(address)`, `rewardPerToken()`, `totalSupply()`, `balanceOf(address)` views.
- Events: `Staked`, `Withdrawn`, `RewardPaid`, `RewardAdded`.

Security requirements:
- Follow **checks-effects-interactions**.
- Use OpenZeppelin `ReentrancyGuard` (`nonReentrant`) on state-changing external fns.
- Use `Ownable` for admin functions.
- Use SafeERC20 (`safeTransfer` / `safeTransferFrom`).
- `updateReward` modifier that settles accounting before any balance change.

---

## 5. Testing requirements (Foundry)

In `test/EquinoxVault.t.sol`:
- Unit tests for stake / withdraw / claim / exit happy paths.
- Edge cases: stake 0 reverts, withdraw > balance reverts, double-claim yields 0 the second time.
- Reward math test: two stakers with different amounts/timing get proportionally correct rewards (use `vm.warp` to advance time).
- **Fuzz test** on stake amounts (`function testFuzz_Stake(uint96 amount)`).
- **A test that proves reentrancy fails**: deploy a malicious token/receiver that re-enters and assert the call reverts.
- Target high coverage (`forge coverage`). Report the number in the README.

---

## 6. Deployment — Sepolia Testnet

**Target network: Ethereum Sepolia Testnet** (the standard public EVM testnet for 2024–2025).

Network details:
- Chain ID: `11155111`
- RPC: obtain a free endpoint from [Alchemy](https://alchemy.com) or [Infura](https://infura.io) → create an app → copy the Sepolia HTTPS URL.
- Block explorer: `https://sepolia.etherscan.io`
- Native token: Sepolia ETH (has no real value — free from faucets)

Getting Sepolia ETH (do this before running deploy):
- [https://sepoliafaucet.com](https://sepoliafaucet.com) — Alchemy faucet, requires sign-in.
- [https://faucet.quicknode.com/ethereum/sepolia](https://faucet.quicknode.com/ethereum/sepolia) — QuickNode faucet.
- Use a **dedicated test wallet** (never a wallet holding real funds). Export its private key into `.env` only.

Required `.env` variables:
```
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=0xYOUR_TEST_WALLET_PRIVATE_KEY
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY
```
Get `ETHERSCAN_API_KEY` free at [https://etherscan.io/myapikey](https://etherscan.io/myapikey).

Deploy steps:
- `script/Deploy.s.sol` deploys two `MockERC20`s (staking token + reward token) and `EquinoxVault`, then calls `notifyRewardAmount` to start the reward stream.
- Run: `forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --verify`
- The `--verify` flag auto-verifies source on Sepolia Etherscan via the API key.
- Record all deployed contract addresses in README with direct Sepolia Etherscan links.

---

## 7. Backend spec — indexer/API

- On startup, backfill `Staked`/`Withdrawn`/`RewardPaid` events from `EquinoxVault` using viem `getLogs`, store in SQLite. Then poll for new blocks.
- Endpoints:
  - `GET /stats` → totalStaked, totalStakers, rewardRate, totalRewardsPaid.
  - `GET /stakers/:address` → that user's staked balance + total claimed (from cache).
  - `GET /health`.
- Justify in comments: the contract is the source of truth; the backend exists to serve
  fast, aggregated, historical reads the chain can't cheaply provide.

---

## 8. Frontend spec

- Connect wallet (wagmi connectors: injected/MetaMask).
- Show: user staked balance, claimable rewards (live via `earned`), pool TVL (from backend `/stats`).
- Actions: **Approve → Stake**, **Withdraw**, **Claim** — each with clear pending / success / error states and tx hash links to Etherscan.
- Handle the approval step explicitly (ERC-20 allowance) — a common gotcha worth showing you understand.
- UI direction: deep space palette (midnight navy, electric indigo, aurora teal). Clean, minimal, mobile-friendly.
- Display the EquinoxFi tagline *"Balance at the heart of yield."* in the hero section.

---

## 9. Coding conventions

- TypeScript strict mode on. No `any` unless justified.
- NatSpec comments on all public/external Solidity functions.
- Conventional commits (`feat:`, `test:`, `chore:`). Commit after each phase so history tells a story.
- Secrets only in `.env`; include `.env.example`; add `.env` to `.gitignore`.

---

## 10. Execution plan for TODAY (work phase by phase, don't skip ahead)

1. **Scaffold** monorepo + Foundry + backend + frontend skeletons. Commit.
2. **Contracts**: write `EquinoxVault` + `MockERC20`, with NatSpec. Commit.
3. **Tests**: full suite incl. fuzz + reentrancy proof; run `forge test` until green. Commit.
4. **Deploy** to Sepolia + verify. Record addresses. Commit.
5. **Backend** indexer/API against the deployed contract. Commit.
6. **Frontend** dApp wired to contract + backend, space palette applied. Commit.
7. **Docs**: README + SECURITY.md. Commit.

After each phase, briefly explain what you built and why in plain language.
