// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { EquinoxVault } from "../src/EquinoxVault.sol";
import { EquinoxFactory } from "../src/EquinoxFactory.sol";
import { EquinoxRouter } from "../src/EquinoxRouter.sol";
import { MockERC20 } from "../src/MockERC20.sol";
import { WETH9 } from "../src/WETH9.sol";

/// @title Deploy
/// @notice Deployment script for EquinoxFi (GENERAL.md Section 6). Deploys both
///         products:
///         1. the staking vault — two MockERC20 tokens (stake + reward), the
///            EquinoxVault, seeded and streaming rewards;
///         2. the AMM DEX — the factory + router, two DEX tokens (eTKNA/eTKNB),
///            and a seeded eTKNA/eTKNB pool so swaps work immediately.
/// @dev Run:
///      forge script script/Deploy.s.sol \
///        --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
///      The broadcasting account (from PRIVATE_KEY) becomes the vault owner, the
///      initial liquidity provider, and receives test-token mints for the dApp.
contract Deploy is Script {
    /// @notice Reward tokens streamed in the first period.
    uint256 public constant REWARD_FUNDING = 100_000 ether;

    /// @notice Length of the first reward streaming period. Set long so rewards
    ///         accrue slowly: rewardRate = REWARD_FUNDING / REWARD_DURATION.
    ///         At 350 days this yields ~0.0033 eRWD/sec (~50x slower than the
    ///         original 7-day stream).
    uint256 public constant REWARD_DURATION = 350 days;

    /// @notice Staking tokens minted to the deployer for testing the frontend.
    uint256 public constant DEPLOYER_STAKE_MINT = 1_000_000 ether;

    /// @notice Per-token mint to the deployer for swapping/seeding the DEX.
    uint256 public constant DEX_MINT = 1_000_000 ether;

    /// @notice Initial pool liquidity seeded by the deployer (1 eTKNA = 4 eTKNB).
    uint256 public constant SEED_A = 100_000 ether;
    uint256 public constant SEED_B = 400_000 ether;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // ── 1. Staking vault ──────────────────────────────────────────────────
        MockERC20 stakingToken = new MockERC20("Equinox Stake", "eSTAKE", 18);
        MockERC20 rewardToken = new MockERC20("Equinox Reward", "eRWD", 18);
        EquinoxVault vault = new EquinoxVault(address(stakingToken), address(rewardToken), deployer);

        // Stretch the streaming period before funding so the derived
        // rewardRate (= funding / duration) is gentle. Allowed here because no
        // period is active yet (periodFinish == 0).
        vault.setRewardsDuration(REWARD_DURATION);

        // Seed the vault with reward tokens BEFORE notifyRewardAmount, which
        // checks the balance can cover the configured rate.
        rewardToken.mint(address(vault), REWARD_FUNDING);
        vault.notifyRewardAmount(REWARD_FUNDING);
        stakingToken.mint(deployer, DEPLOYER_STAKE_MINT);

        // ── 2. AMM DEX ────────────────────────────────────────────────────────
        EquinoxFactory factory = new EquinoxFactory();
        EquinoxRouter router = new EquinoxRouter(address(factory), address(new WETH9()));

        MockERC20 tokenA = new MockERC20("Equinox Token A", "eTKNA", 18);
        MockERC20 tokenB = new MockERC20("Equinox Token B", "eTKNB", 18);
        tokenA.mint(deployer, DEX_MINT);
        tokenB.mint(deployer, DEX_MINT);

        // Seed the eTKNA/eTKNB pool so the swap UI has a live market on launch.
        tokenA.approve(address(router), SEED_A);
        tokenB.approve(address(router), SEED_B);
        router.addLiquidity(
            address(tokenA),
            address(tokenB),
            SEED_A,
            SEED_B,
            SEED_A,
            SEED_B,
            deployer,
            block.timestamp + 1 hours
        );
        address pair = factory.getPair(address(tokenA), address(tokenB));

        vm.stopBroadcast();

        console2.log("=== EquinoxFi deployment ===");
        console2.log("Deployer / owner :", deployer);
        console2.log("-- Staking --");
        console2.log("StakingToken     :", address(stakingToken));
        console2.log("RewardToken      :", address(rewardToken));
        console2.log("EquinoxVault     :", address(vault));
        console2.log("Reward funded    :", REWARD_FUNDING);
        console2.log("-- DEX --");
        console2.log("Factory          :", address(factory));
        console2.log("Router           :", address(router));
        console2.log("TokenA (eTKNA)   :", address(tokenA));
        console2.log("TokenB (eTKNB)   :", address(tokenB));
        console2.log("Pair (eTKNA/B)   :", pair);
        console2.logBytes32(factory.INIT_CODE_HASH());
    }
}
