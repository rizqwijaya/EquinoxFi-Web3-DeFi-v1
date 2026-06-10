// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { EquinoxVault } from "../src/EquinoxVault.sol";
import { MockERC20 } from "../src/MockERC20.sol";

/// @title DeployStakeVaults
/// @notice Deploys TWO staking vaults that let users stake the DEX tokens
///         (eTKNA, eTKNB) and earn the existing eRWD reward token. This replaces
///         the original single eSTAKE vault — eSTAKE had no acquisition path in
///         the UI (no pool, mint-only), so users could never obtain it. eTKNA /
///         eTKNB are buyable in the Swap page, giving a coherent funnel.
/// @dev The staking tokens (eTKNA/eTKNB) and reward token (eRWD) already exist on
///      Sepolia; their addresses are passed in via env. Each vault streams
///      REWARD_FUNDING over REWARD_DURATION (rewardRate = funding / duration).
///      eRWD is a MockERC20 with permissionless `mint`, so each vault is funded
///      with freshly minted reward tokens.
///
///      Run (addresses come from the repo-root .env values):
///        forge script script/DeployStakeVaults.s.sol \
///          --rpc-url $SEPOLIA_RPC_URL --broadcast
///      with PRIVATE_KEY, STAKE_TOKEN_A, STAKE_TOKEN_B, REWARD_TOKEN_ADDRESS exported.
contract DeployStakeVaults is Script {
    /// @notice Reward tokens streamed per vault in the first period.
    uint256 public constant REWARD_FUNDING = 100_000 ether;

    /// @notice Streaming period length. Long, so the derived rate is gentle
    ///         (~0.0033 eRWD/sec at 100k over 350 days).
    uint256 public constant REWARD_DURATION = 350 days;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address tokenA = vm.envAddress("STAKE_TOKEN_A");
        address tokenB = vm.envAddress("STAKE_TOKEN_B");
        address rewardToken = vm.envAddress("REWARD_TOKEN_ADDRESS");

        vm.startBroadcast(deployerKey);

        EquinoxVault vaultA = _deployVault(tokenA, rewardToken, deployer);
        EquinoxVault vaultB = _deployVault(tokenB, rewardToken, deployer);

        vm.stopBroadcast();

        console2.log("=== EquinoxFi stake-vaults deploy ===");
        console2.log("Deployer / owner :", deployer);
        console2.log("RewardToken eRWD :", rewardToken);
        console2.log("-- Vault A (stake eTKNA) --");
        console2.log("StakingToken     :", tokenA);
        console2.log("EquinoxVault A   :", address(vaultA));
        console2.log("rewardRate A     :", vaultA.rewardRate());
        console2.log("-- Vault B (stake eTKNB) --");
        console2.log("StakingToken     :", tokenB);
        console2.log("EquinoxVault B   :", address(vaultB));
        console2.log("rewardRate B     :", vaultB.rewardRate());
        console2.log("Reward funded/ea :", REWARD_FUNDING);
        console2.log("Duration (s)     :", REWARD_DURATION);
    }

    /// @dev Deploys one vault, stretches its reward period, funds it with freshly
    ///      minted eRWD, then starts the stream. Mirrors DeployVault.s.sol.
    function _deployVault(address stakingToken, address rewardToken, address owner)
        internal
        returns (EquinoxVault vault)
    {
        vault = new EquinoxVault(stakingToken, rewardToken, owner);
        // Stretch the period before funding (allowed: no active period yet).
        vault.setRewardsDuration(REWARD_DURATION);
        // Seed reward tokens BEFORE notifyRewardAmount, which checks the balance
        // can cover the configured rate. Mint is permissionless on MockERC20.
        MockERC20(rewardToken).mint(address(vault), REWARD_FUNDING);
        vault.notifyRewardAmount(REWARD_FUNDING);
    }
}
