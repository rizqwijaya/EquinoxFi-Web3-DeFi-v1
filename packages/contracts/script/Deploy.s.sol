// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { EquinoxVault } from "../src/EquinoxVault.sol";
import { MockERC20 } from "../src/MockERC20.sol";

/// @title Deploy
/// @notice Deployment script for EquinoxFi (GENERAL.md Section 6). Deploys two
///         MockERC20 tokens (staking + reward) and the EquinoxVault, seeds the
///         vault with reward tokens, and starts the reward stream by calling
///         {EquinoxVault.notifyRewardAmount}.
/// @dev Run:
///      forge script script/Deploy.s.sol \
///        --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
///      The broadcasting account (from PRIVATE_KEY) becomes the vault owner and
///      receives the initial mint of staking tokens for testing the dApp.
contract Deploy is Script {
    /// @notice Reward tokens streamed in the first period.
    uint256 public constant REWARD_FUNDING = 100_000 ether;

    /// @notice Staking tokens minted to the deployer for testing the frontend.
    uint256 public constant DEPLOYER_STAKE_MINT = 1_000_000 ether;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // 1. Deploy the staking and reward tokens.
        MockERC20 stakingToken = new MockERC20("Equinox Stake", "eSTAKE", 18);
        MockERC20 rewardToken = new MockERC20("Equinox Reward", "eRWD", 18);

        // 2. Deploy the vault, with the deployer as owner.
        EquinoxVault vault =
            new EquinoxVault(address(stakingToken), address(rewardToken), deployer);

        // 3. Seed the vault with reward tokens, then start the reward stream.
        //    Tokens must be held by the vault BEFORE notifyRewardAmount, which
        //    checks the balance can cover the configured rate.
        rewardToken.mint(address(vault), REWARD_FUNDING);
        vault.notifyRewardAmount(REWARD_FUNDING);

        // 4. Mint staking tokens to the deployer so the dApp can be exercised.
        stakingToken.mint(deployer, DEPLOYER_STAKE_MINT);

        vm.stopBroadcast();

        console2.log("=== EquinoxFi deployment ===");
        console2.log("Deployer / owner :", deployer);
        console2.log("StakingToken     :", address(stakingToken));
        console2.log("RewardToken      :", address(rewardToken));
        console2.log("EquinoxVault     :", address(vault));
        console2.log("Reward funded    :", REWARD_FUNDING);
    }
}
