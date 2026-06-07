// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { EquinoxVault } from "../src/EquinoxVault.sol";
import { MockERC20 } from "../src/MockERC20.sol";

/// @title DeployVault
/// @notice Redeploys ONLY the staking vault, reusing the existing eSTAKE/eRWD
///         MockERC20 tokens (their addresses are passed in via env). Used to
///         replace a live vault with a gentler reward schedule without touching
///         the DEX or minting new token contracts.
/// @dev The new vault streams REWARD_FUNDING over REWARD_DURATION, giving
///      rewardRate = REWARD_FUNDING / REWARD_DURATION. At 100k eRWD over 350
///      days that is ~0.0033 eRWD/sec (~50x slower than the original 7-day
///      stream). MockERC20.mint is permissionless, so the new vault is funded
///      with freshly minted eRWD.
///
///      Run (token addresses come from the repo-root .env values):
///        forge script script/DeployVault.s.sol \
///          --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
///      with STAKING_TOKEN_ADDRESS and REWARD_TOKEN_ADDRESS exported.
contract DeployVault is Script {
    /// @notice Reward tokens streamed in the first period.
    uint256 public constant REWARD_FUNDING = 100_000 ether;

    /// @notice Streaming period length. Long, so the derived rate is gentle.
    uint256 public constant REWARD_DURATION = 350 days;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address stakingToken = vm.envAddress("STAKING_TOKEN_ADDRESS");
        address rewardToken = vm.envAddress("REWARD_TOKEN_ADDRESS");

        vm.startBroadcast(deployerKey);

        EquinoxVault vault = new EquinoxVault(stakingToken, rewardToken, deployer);

        // Stretch the period before funding (allowed: no active period yet).
        vault.setRewardsDuration(REWARD_DURATION);

        // Fund the vault, then start the (slow) stream. Mint is permissionless
        // on MockERC20, so we top the vault up directly.
        MockERC20(rewardToken).mint(address(vault), REWARD_FUNDING);
        vault.notifyRewardAmount(REWARD_FUNDING);

        vm.stopBroadcast();

        console2.log("=== EquinoxFi vault redeploy ===");
        console2.log("Deployer / owner :", deployer);
        console2.log("StakingToken     :", stakingToken);
        console2.log("RewardToken      :", rewardToken);
        console2.log("EquinoxVault NEW :", address(vault));
        console2.log("Reward funded    :", REWARD_FUNDING);
        console2.log("Duration (s)     :", REWARD_DURATION);
        console2.log("rewardRate       :", vault.rewardRate());
    }
}
