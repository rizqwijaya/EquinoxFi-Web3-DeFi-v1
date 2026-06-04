# Security — EquinoxFi

This document records the threat model for the `EquinoxVault` staking contract
and the mitigations applied. It reflects the contract as written in
[`packages/contracts/src/EquinoxVault.sol`](packages/contracts/src/EquinoxVault.sol).

> EquinoxFi is a portfolio project deployed to the **Sepolia testnet** with
> valueless test tokens. It has **not** undergone a professional audit and must
> not be used with real funds as-is.

---

## Assets at risk

- **Staked principal** — the staking tokens users deposit into the vault.
- **Reward tokens** — the reward-token balance the vault holds to stream to
  stakers.
- **Accounting integrity** — each user's `earned()` must reflect their true
  proportional share; corruption here lets one user drain another's rewards.

---

## Threats & mitigations

### 1. Reentrancy
**Threat.** A malicious token (or a token with transfer hooks, e.g. ERC-777)
could re-enter `stake` / `withdraw` / `claimReward` mid-execution to double-spend
or corrupt balances.

**Mitigations.**
- Every state-changing external function (`stake`, `withdraw`, `claimReward`)
  carries OpenZeppelin's `nonReentrant` modifier.
- **Checks-effects-interactions** ordering: state (`_balances`, `_totalSupply`,
  `rewards`) is updated *before* any external token transfer.
- A dedicated test (`test_Reentrancy_StakeReverts`) deploys a malicious token
  whose `transferFrom` re-enters `stake` and asserts the call reverts with
  `ReentrancyGuardReentrantCall`.

### 2. Unbounded gas / denial of service
**Threat.** Distributing rewards by looping over all stakers is O(n) and would
eventually exceed the block gas limit, permanently bricking distributions.

**Mitigation.** The Synthetix accumulator pattern. A single global
`rewardPerTokenStored` is advanced lazily; each user's accrual is settled O(1)
when they next interact. There is **no loop over stakers** anywhere in the
contract, so cost is independent of staker count.

### 3. Privilege abuse / access control
**Threat.** Reward funding and configuration could be hijacked to drain or
mismanage the reward stream.

**Mitigations.**
- `notifyRewardAmount` and `setRewardsDuration` are `onlyOwner` (OpenZeppelin
  `Ownable`).
- `setRewardsDuration` reverts (`RewardPeriodActive`) while a reward period is
  live, so an in-flight stream's economics cannot be changed underneath stakers.
- Owner privileges are intentionally narrow: the owner can fund and schedule
  rewards but **cannot** withdraw users' staked principal or move accrued
  rewards.

### 4. Reward insolvency (rate set above balance)
**Threat.** Setting a reward rate the vault cannot actually pay would let early
claimers drain the pool and leave later claimers unable to withdraw rewards.

**Mitigation.** `notifyRewardAmount` reads the contract's actual reward-token
balance and reverts (`RewardTooHigh`) if the computed `rewardRate` would exceed
what the balance can cover over `rewardsDuration`. Reward tokens must be
transferred into the vault **before** notifying.

### 5. Non-standard / malicious ERC-20s
**Threat.** Tokens that return `false` instead of reverting, or return no value
at all, can silently break naïve `transfer` / `transferFrom` calls and desync
accounting.

**Mitigation.** All token movements use OpenZeppelin `SafeERC20`
(`safeTransfer` / `safeTransferFrom`), which reverts on failure regardless of
the token's return-value convention.

> **Residual risk.** Fee-on-transfer or rebasing tokens are *not* supported: the
> vault assumes the amount requested equals the amount received. The intended
> staking token (`MockERC20`) is a standard, non-deflationary ERC-20.

### 6. Reward-accounting precision
**Threat.** Integer division in `rewardPerToken` can leave tiny rounding dust.

**Mitigation.** The accumulator is scaled by `1e18` before division, bounding
rounding error to negligible wei-level dust. The two-staker and staggered-timing
tests assert proportional correctness within explicit tolerances.

### 7. Division by zero when the pool is empty
**Threat.** `rewardPerToken` divides by `_totalSupply`; an empty pool would
revert.

**Mitigation.** `rewardPerToken` short-circuits to the stored accumulator when
`_totalSupply == 0`, so rewards simply do not accrue while no one is staked
(and resume cleanly once someone stakes).

---

## Operational security

- **Secrets** (`PRIVATE_KEY`, RPC keys, Etherscan key) live only in `.env`,
  which is git-ignored. `.env.example` documents the variables with placeholders.
- **Use a dedicated throwaway test wallet** for deployment — never a wallet
  holding real funds.
- The backend is a **read-only indexer**: it holds no keys, signs no
  transactions, and cannot move funds. A compromised backend can at worst serve
  stale or wrong *display* data; it cannot touch on-chain assets.

---

## Reporting

This is an educational project. For real protocols, publish a security contact
and a responsible-disclosure policy here.
