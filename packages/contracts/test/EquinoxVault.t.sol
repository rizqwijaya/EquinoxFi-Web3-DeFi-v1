// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { EquinoxVault } from "../src/EquinoxVault.sol";
import { MockERC20 } from "../src/MockERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title EquinoxVaultTest
/// @notice Full Foundry suite for {EquinoxVault}: happy paths, edge cases,
///         proportional two-staker reward math, a fuzz test, and a reentrancy
///         proof. Covers GENERAL.md Section 5.
contract EquinoxVaultTest is Test {
    EquinoxVault internal vault;
    MockERC20 internal stakingToken;
    MockERC20 internal rewardToken;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant REWARD_AMOUNT = 7 days * 1e18; // 1 token/sec over 7 days
    uint256 internal constant DURATION = 7 days;

    function setUp() public {
        stakingToken = new MockERC20("Stake Token", "STK", 18);
        rewardToken = new MockERC20("Reward Token", "RWD", 18);

        vm.prank(owner);
        vault = new EquinoxVault(address(stakingToken), address(rewardToken), owner);

        // Fund users with staking tokens.
        stakingToken.mint(alice, 1_000 ether);
        stakingToken.mint(bob, 1_000 ether);

        // Fund the vault with reward tokens and start a stream.
        rewardToken.mint(address(vault), REWARD_AMOUNT);
        vm.prank(owner);
        vault.notifyRewardAmount(REWARD_AMOUNT);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    function _stake(address who, uint256 amount) internal {
        vm.startPrank(who);
        stakingToken.approve(address(vault), amount);
        vault.stake(amount);
        vm.stopPrank();
    }

    // ── happy paths ──────────────────────────────────────────────────────────

    function test_Stake_UpdatesBalances() public {
        _stake(alice, 100 ether);
        assertEq(vault.balanceOf(alice), 100 ether);
        assertEq(vault.totalSupply(), 100 ether);
        assertEq(stakingToken.balanceOf(address(vault)), 100 ether);
    }

    function test_Withdraw_ReturnsTokens() public {
        _stake(alice, 100 ether);
        uint256 before = stakingToken.balanceOf(alice);

        vm.prank(alice);
        vault.withdraw(40 ether);

        assertEq(vault.balanceOf(alice), 60 ether);
        assertEq(vault.totalSupply(), 60 ether);
        assertEq(stakingToken.balanceOf(alice), before + 40 ether);
    }

    function test_ClaimReward_PaysAccrued() public {
        _stake(alice, 100 ether);
        vm.warp(block.timestamp + 1 days);

        uint256 expected = vault.earned(alice);
        assertGt(expected, 0);

        vm.prank(alice);
        vault.claimReward();

        assertEq(rewardToken.balanceOf(alice), expected);
        assertEq(vault.earned(alice), 0);
    }

    function test_Exit_WithdrawsAndClaims() public {
        _stake(alice, 100 ether);
        vm.warp(block.timestamp + 1 days);

        uint256 expectedReward = vault.earned(alice);

        vm.prank(alice);
        vault.exit();

        assertEq(vault.balanceOf(alice), 0);
        assertEq(stakingToken.balanceOf(alice), 1_000 ether);
        assertEq(rewardToken.balanceOf(alice), expectedReward);
    }

    // ── edge cases ───────────────────────────────────────────────────────────

    function test_Stake_Zero_Reverts() public {
        vm.prank(alice);
        vm.expectRevert(EquinoxVault.ZeroAmount.selector);
        vault.stake(0);
    }

    function test_Withdraw_Zero_Reverts() public {
        _stake(alice, 100 ether);
        vm.prank(alice);
        vm.expectRevert(EquinoxVault.ZeroAmount.selector);
        vault.withdraw(0);
    }

    function test_Withdraw_MoreThanBalance_Reverts() public {
        _stake(alice, 100 ether);
        vm.prank(alice);
        vm.expectRevert(); // arithmetic underflow on _balances
        vault.withdraw(101 ether);
    }

    function test_DoubleClaim_SecondYieldsZero() public {
        _stake(alice, 100 ether);
        vm.warp(block.timestamp + 1 days);

        vm.prank(alice);
        vault.claimReward();
        uint256 afterFirst = rewardToken.balanceOf(alice);
        assertGt(afterFirst, 0);

        // Claim again immediately — nothing new accrued.
        vm.prank(alice);
        vault.claimReward();
        assertEq(rewardToken.balanceOf(alice), afterFirst);
    }

    function test_NotifyRewardAmount_OnlyOwner() public {
        rewardToken.mint(address(vault), 1 ether);
        vm.prank(alice);
        vm.expectRevert(); // Ownable: caller is not the owner
        vault.notifyRewardAmount(1 ether);
    }

    function test_NotifyRewardAmount_TooHigh_Reverts() public {
        // Ask to stream more than the vault holds in reward tokens.
        vm.prank(owner);
        vm.expectRevert(EquinoxVault.RewardTooHigh.selector);
        vault.notifyRewardAmount(REWARD_AMOUNT * 1_000);
    }

    function test_RewardPerToken_ZeroWhenNothingStaked() public view {
        // No one has staked in this fresh assertion path beyond setUp's stream.
        assertEq(vault.rewardPerToken(), 0);
    }

    function test_SetRewardsDuration_RevertsWhileActive() public {
        vm.prank(owner);
        vm.expectRevert(EquinoxVault.RewardPeriodActive.selector);
        vault.setRewardsDuration(14 days);
    }

    function test_SetRewardsDuration_AfterPeriod() public {
        vm.warp(block.timestamp + DURATION + 1);
        vm.prank(owner);
        vault.setRewardsDuration(14 days);
        assertEq(vault.rewardsDuration(), 14 days);
    }

    /// @notice After {periodFinish}, accrual stops: warping far past the period
    ///         end yields no more than the full funded reward (exercises the
    ///         capped branch of lastTimeRewardApplicable).
    function test_RewardsStopAfterPeriodEnd() public {
        _stake(alice, 100 ether);

        // Warp well beyond the period end.
        vm.warp(block.timestamp + DURATION + 30 days);
        uint256 atEnd = vault.earned(alice);

        // Warp even further — earned must not grow once the stream is over.
        vm.warp(block.timestamp + 30 days);
        assertEq(vault.earned(alice), atEnd);

        // Sole staker for the whole period earns ~the full funded amount.
        assertApproxEqAbs(atEnd, REWARD_AMOUNT, 1e6);
    }

    // ── proportional reward math (two stakers, vm.warp) ──────────────────────

    /// @notice Alice stakes 100, Bob stakes 300 at the same instant. Over the
    ///         same window Bob (3x stake) should earn ~3x Alice. Total paid out
    ///         over the window must equal rewardRate * elapsed.
    function test_TwoStakers_ProportionalRewards() public {
        _stake(alice, 100 ether); // 25% of pool
        _stake(bob, 300 ether); //   75% of pool

        vm.warp(block.timestamp + 1 days);

        uint256 aliceEarned = vault.earned(alice);
        uint256 bobEarned = vault.earned(bob);

        assertGt(aliceEarned, 0);
        assertGt(bobEarned, 0);

        // Bob has 3x Alice's stake → ~3x reward (allow 1 wei rounding slack).
        assertApproxEqAbs(bobEarned, aliceEarned * 3, 3);

        // Total distributed equals rate * elapsed (within rounding dust).
        uint256 expectedTotal = vault.rewardRate() * 1 days;
        assertApproxEqAbs(aliceEarned + bobEarned, expectedTotal, 1e6);
    }

    /// @notice Staggered timing: Alice stakes first and accrues alone, then Bob
    ///         joins. Alice's solo window is entirely hers; afterwards they
    ///         split proportionally.
    function test_TwoStakers_StaggeredTiming() public {
        _stake(alice, 100 ether);
        vm.warp(block.timestamp + 1 days);

        uint256 aliceSolo = vault.earned(alice);
        assertApproxEqAbs(aliceSolo, vault.rewardRate() * 1 days, 1e6);

        // Bob joins with an equal stake; advance another day.
        _stake(bob, 100 ether);
        vm.warp(block.timestamp + 1 days);

        // In the shared window each gets half; Bob's total ≈ half of one day.
        uint256 bobEarned = vault.earned(bob);
        assertApproxEqAbs(bobEarned, (vault.rewardRate() * 1 days) / 2, 1e6);

        // Alice keeps her solo day plus half the shared day.
        uint256 aliceEarned = vault.earned(alice);
        assertGt(aliceEarned, bobEarned);
    }

    // ── fuzz ─────────────────────────────────────────────────────────────────

    /// @notice Staking any positive amount the user can fund must mirror exactly
    ///         into balances and totalSupply, and be fully withdrawable.
    function testFuzz_Stake(uint96 amount) public {
        vm.assume(amount > 0);

        stakingToken.mint(alice, amount);
        uint256 balBefore = stakingToken.balanceOf(alice);

        vm.startPrank(alice);
        stakingToken.approve(address(vault), amount);
        vault.stake(amount);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), amount);
        assertEq(vault.totalSupply(), amount);

        vm.prank(alice);
        vault.withdraw(amount);

        assertEq(vault.balanceOf(alice), 0);
        assertEq(stakingToken.balanceOf(alice), balBefore);
    }

    // ── reentrancy proof ─────────────────────────────────────────────────────

    /// @notice Deploys a malicious staking token whose transfer hook re-enters
    ///         the vault. The nonReentrant guard must make the outer call revert.
    function test_Reentrancy_StakeReverts() public {
        ReentrantToken evil = new ReentrantToken();
        EquinoxVault evilVault =
            new EquinoxVault(address(evil), address(rewardToken), owner);

        evil.setVault(address(evilVault));
        evil.mint(address(this), 100 ether);
        evil.approve(address(evilVault), 100 ether);
        evil.armForStake(50 ether);

        // The reentrant call into stake() during transferFrom must bubble up the
        // guard's revert (ReentrancyGuardReentrantCall), proving the lock held.
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        evilVault.stake(50 ether);
    }
}

/// @notice Malicious ERC-20 that re-enters {EquinoxVault.stake} from inside its
///         `transferFrom` hook to attempt a reentrancy attack. Used only by the
///         reentrancy test to prove the guard holds.
contract ReentrantToken is IERC20 {
    string public name = "Reentrant";
    string public symbol = "EVIL";
    uint8 public constant decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    EquinoxVault internal vault;
    bool internal armed;
    uint256 internal reentryAmount;

    function setVault(address _vault) external {
        vault = EquinoxVault(_vault);
    }

    /// @notice Arms the token to re-enter the vault on the next transferFrom.
    function armForStake(uint256 amount) external {
        armed = true;
        reentryAmount = amount;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        // Re-enter the vault mid-transfer. nonReentrant must reject this.
        if (armed) {
            armed = false;
            vault.stake(reentryAmount);
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
