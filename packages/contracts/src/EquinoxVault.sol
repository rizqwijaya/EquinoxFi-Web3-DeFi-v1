// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title EquinoxVault
/// @author EquinoxFi
/// @notice Single-asset staking vault: users stake one ERC-20 token and earn a
///         second ERC-20 reward token streamed linearly over a fixed duration.
/// @dev Implements the Synthetix `StakingRewards` accumulator pattern. See the
///      "WHY THE ACCUMULATOR PATTERN" comment block below for the gas rationale.
///
///      Security model (GENERAL.md Section 4):
///      - checks-effects-interactions ordering on every external mutator;
///      - {ReentrancyGuard} `nonReentrant` on all state-changing external fns;
///      - {Ownable} gates reward funding/configuration;
///      - {SafeERC20} for all token movements;
///      - the {updateReward} modifier settles accounting before any balance
///        change so each user's accrual is frozen at its correct value.
contract EquinoxVault is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────
    //  WHY THE ACCUMULATOR PATTERN (and not a loop over stakers)
    // ─────────────────────────────────────────────────────────────────────────
    //  A naive design would, on each reward distribution, iterate over every
    //  staker and credit their share. That loop's gas cost grows linearly with
    //  the number of stakers (O(n)). Once enough users join, a single
    //  distribution would exceed the block gas limit and the contract would be
    //  permanently bricked — an unbounded-gas / DoS vulnerability.
    //
    //  The Synthetix accumulator avoids the loop entirely. Instead of touching
    //  every account, it maintains ONE global figure:
    //
    //      rewardPerTokenStored — cumulative reward owed per 1 staked token,
    //                             since inception, scaled by 1e18.
    //
    //  Each time ANY user's balance is about to change (stake / withdraw /
    //  claim), `rewardPerToken()` is advanced to "now", and that user's
    //  personal accrual is settled by comparing the global accumulator against
    //  the snapshot taken the last time they interacted:
    //
    //      earned = balance * (rewardPerToken - userRewardPerTokenPaid) / 1e18
    //               + rewards[user]
    //
    //  So work is O(1) per user action and is paid lazily by the user who
    //  triggers it — never by the protocol looping over everyone. This is the
    //  battle-tested mechanism the owner can defend in an interview: constant
    //  gas, no upper bound on staker count, no distribution loop.
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice ERC-20 token users deposit to participate.
    IERC20 public immutable stakingToken;

    /// @notice ERC-20 token paid out as rewards.
    IERC20 public immutable rewardToken;

    /// @notice Reward emission rate in reward-token base units per second.
    uint256 public rewardRate;

    /// @notice Length of each reward streaming period, in seconds.
    uint256 public rewardsDuration = 7 days;

    /// @notice Unix timestamp at which the current reward period ends.
    uint256 public periodFinish;

    /// @notice Last timestamp at which reward accounting was updated.
    uint256 public lastUpdateTime;

    /// @notice Cumulative reward owed per staked token, scaled by 1e18.
    uint256 public rewardPerTokenStored;

    /// @notice Reward-per-token already accounted for, per user (scaled by 1e18).
    mapping(address account => uint256 paid) public userRewardPerTokenPaid;

    /// @notice Reward-token amount accrued and claimable, per user.
    mapping(address account => uint256 reward) public rewards;

    /// @dev Total staked across all users.
    uint256 private _totalSupply;

    /// @dev Staked balance per user.
    mapping(address account => uint256 balance) private _balances;

    /// @notice Emitted when `user` stakes `amount` of {stakingToken}.
    event Staked(address indexed user, uint256 amount);

    /// @notice Emitted when `user` withdraws `amount` of {stakingToken}.
    event Withdrawn(address indexed user, uint256 amount);

    /// @notice Emitted when `user` claims `reward` of {rewardToken}.
    event RewardPaid(address indexed user, uint256 reward);

    /// @notice Emitted when the owner funds a new reward stream of `reward`.
    event RewardAdded(uint256 reward);

    /// @notice Emitted when the owner changes {rewardsDuration}.
    event RewardsDurationUpdated(uint256 newDuration);

    /// @notice Reverts when a zero amount is supplied where a positive one is required.
    error ZeroAmount();

    /// @notice Reverts when funded rewards exceed the contract's reward-token balance.
    error RewardTooHigh();

    /// @notice Reverts when changing {rewardsDuration} while a period is still active.
    error RewardPeriodActive();

    /// @notice Deploys the vault.
    /// @param _stakingToken Address of the ERC-20 users stake.
    /// @param _rewardToken Address of the ERC-20 paid as rewards.
    /// @param initialOwner Address granted owner privileges (reward funding/config).
    constructor(address _stakingToken, address _rewardToken, address initialOwner)
        Ownable(initialOwner)
    {
        stakingToken = IERC20(_stakingToken);
        rewardToken = IERC20(_rewardToken);
    }

    /// @notice Settles reward accounting up to "now" before a balance change.
    /// @dev Advances the global accumulator and freezes `account`'s accrual.
    ///      Applied to every function that reads or mutates balances so
    ///      `earned` is always computed against an up-to-date accumulator.
    /// @param account The user whose accrual to settle (address(0) to skip).
    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    /// @notice Total amount of {stakingToken} staked in the vault.
    /// @return The total staked supply.
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    /// @notice Staked balance of `account`.
    /// @param account The user to query.
    /// @return The user's staked balance.
    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    /// @notice The later-bounded timestamp used for reward accrual.
    /// @dev Equals `block.timestamp` while the period is active, else {periodFinish}.
    /// @return The timestamp up to which rewards currently accrue.
    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    /// @notice Current cumulative reward owed per staked token, scaled by 1e18.
    /// @dev When nothing is staked the accumulator cannot advance (no
    ///      denominator), so it holds at {rewardPerTokenStored}.
    /// @return The up-to-date reward-per-token accumulator.
    function rewardPerToken() public view returns (uint256) {
        if (_totalSupply == 0) {
            return rewardPerTokenStored;
        }
        return rewardPerTokenStored
            + ((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * 1e18) / _totalSupply;
    }

    /// @notice Reward-token amount `account` has earned and not yet claimed.
    /// @param account The user to query.
    /// @return The claimable reward amount.
    function earned(address account) public view returns (uint256) {
        return (_balances[account] * (rewardPerToken() - userRewardPerTokenPaid[account])) / 1e18
            + rewards[account];
    }

    /// @notice Stakes `amount` of {stakingToken}, pulled via `transferFrom`.
    /// @dev Caller must have approved the vault for at least `amount`.
    ///      Follows checks-effects-interactions: accounting is updated before
    ///      the external token pull.
    /// @param amount Amount of {stakingToken} to stake (must be > 0).
    function stake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();
        _totalSupply += amount;
        _balances[msg.sender] += amount;
        emit Staked(msg.sender, amount);
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Withdraws `amount` of previously staked {stakingToken}.
    /// @dev Reverts (arithmetic underflow) if `amount` exceeds the staked balance.
    /// @param amount Amount of {stakingToken} to withdraw (must be > 0).
    function withdraw(uint256 amount) public nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();
        _totalSupply -= amount;
        _balances[msg.sender] -= amount;
        emit Withdrawn(msg.sender, amount);
        stakingToken.safeTransfer(msg.sender, amount);
    }

    /// @notice Transfers the caller's accrued {rewardToken} rewards to them.
    /// @dev No-op transfer is skipped when nothing is owed. Effects (zeroing
    ///      `rewards`) precede the external transfer.
    function claimReward() public nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            emit RewardPaid(msg.sender, reward);
            rewardToken.safeTransfer(msg.sender, reward);
        }
    }

    /// @notice Withdraws the caller's entire staked balance and claims rewards.
    /// @dev Convenience wrapper combining {withdraw} and {claimReward}.
    function exit() external {
        withdraw(_balances[msg.sender]);
        claimReward();
    }

    /// @notice Funds a new reward stream of `reward` tokens over {rewardsDuration}.
    /// @dev Owner-only. The reward tokens must already be held by this contract
    ///      (transfer them in before calling). Recomputes {rewardRate}, rolling
    ///      any leftover from an active period into the new one. Verifies the
    ///      contract holds enough reward tokens to cover the full stream so the
    ///      rate can never be set higher than the vault can actually pay.
    /// @param reward Amount of {rewardToken} to stream over the next period.
    function notifyRewardAmount(uint256 reward) external onlyOwner updateReward(address(0)) {
        if (block.timestamp >= periodFinish) {
            rewardRate = reward / rewardsDuration;
        } else {
            uint256 remaining = periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            rewardRate = (reward + leftover) / rewardsDuration;
        }

        uint256 balance = rewardToken.balanceOf(address(this));
        if (rewardRate > balance / rewardsDuration) revert RewardTooHigh();

        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + rewardsDuration;
        emit RewardAdded(reward);
    }

    /// @notice Sets the reward streaming period length for future fundings.
    /// @dev Owner-only. Disallowed while a reward period is still active so an
    ///      in-flight stream's economics cannot be changed underneath stakers.
    /// @param _rewardsDuration New duration in seconds (must be > 0).
    function setRewardsDuration(uint256 _rewardsDuration) external onlyOwner {
        if (_rewardsDuration == 0) revert ZeroAmount();
        if (block.timestamp < periodFinish) revert RewardPeriodActive();
        rewardsDuration = _rewardsDuration;
        emit RewardsDurationUpdated(_rewardsDuration);
    }
}
