// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { EquinoxFactory } from "../src/EquinoxFactory.sol";
import { EquinoxRouter } from "../src/EquinoxRouter.sol";
import { MockERC20 } from "../src/MockERC20.sol";

/// @title DeployDex
/// @notice Deploys ONLY the AMM DEX (factory, router, two DEX tokens, and a
///         seeded eTKNA/eTKNB pool). Used when the staking vault is already
///         live and only the DEX needs deploying — avoids redeploying the vault.
/// @dev Run:
///      forge script script/DeployDex.s.sol \
///        --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
contract DeployDex is Script {
    /// @notice Per-token mint to the deployer for swapping/seeding the DEX.
    uint256 public constant DEX_MINT = 1_000_000 ether;

    /// @notice Initial pool liquidity seeded by the deployer (1 eTKNA = 4 eTKNB).
    uint256 public constant SEED_A = 100_000 ether;
    uint256 public constant SEED_B = 400_000 ether;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        EquinoxFactory factory = new EquinoxFactory();
        EquinoxRouter router = new EquinoxRouter(address(factory));

        MockERC20 tokenA = new MockERC20("Equinox Token A", "eTKNA", 18);
        MockERC20 tokenB = new MockERC20("Equinox Token B", "eTKNB", 18);
        tokenA.mint(deployer, DEX_MINT);
        tokenB.mint(deployer, DEX_MINT);

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

        console2.log("=== EquinoxFi DEX deployment ===");
        console2.log("Deployer         :", deployer);
        console2.log("Factory          :", address(factory));
        console2.log("Router           :", address(router));
        console2.log("TokenA (eTKNA)   :", address(tokenA));
        console2.log("TokenB (eTKNB)   :", address(tokenB));
        console2.log("Pair (eTKNA/B)   :", pair);
        console2.logBytes32(factory.INIT_CODE_HASH());
    }
}
