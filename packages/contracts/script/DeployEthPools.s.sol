// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { EquinoxRouter } from "../src/EquinoxRouter.sol";
import { WETH9 } from "../src/WETH9.sol";

/// @title DeployEthPools
/// @notice Adds native-ETH trading to an already-live EquinoxFi DEX. Deploys a
///         {WETH9} and a new {EquinoxRouter} (WETH-aware) on the EXISTING
///         factory, then seeds WETH/eTKNA and WETH/eTKNB pools with ETH so the
///         dApp can swap native ETH ↔ eTKNA/eTKNB.
/// @dev The existing eTKNA/eTKNB pool stays untouched (same factory). After
///      running, point VITE_ROUTER_ADDRESS at the new router and add
///      VITE_WETH_ADDRESS. Run:
///        forge script script/DeployEthPools.s.sol \
///          --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
///      Required env: PRIVATE_KEY, FACTORY_ADDRESS, TOKEN_A_ADDRESS, TOKEN_B_ADDRESS.
contract DeployEthPools is Script {
    /// @notice ETH seeded into each new pool.
    uint256 public constant SEED_ETH = 0.1 ether;

    /// @notice Token seeded alongside the ETH in each pool (sets the price).
    uint256 public constant SEED_TOKEN = 10_000 ether;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address factory = vm.envAddress("FACTORY_ADDRESS");
        address tokenA = vm.envAddress("TOKEN_A_ADDRESS");
        address tokenB = vm.envAddress("TOKEN_B_ADDRESS");

        vm.startBroadcast(deployerKey);

        WETH9 weth = new WETH9();
        EquinoxRouter router = new EquinoxRouter(factory, address(weth));

        // Seed WETH/eTKNA and WETH/eTKNB, 0.1 ETH + 10,000 token each.
        IERC20(tokenA).approve(address(router), SEED_TOKEN);
        router.addLiquidityETH{ value: SEED_ETH }(
            tokenA, SEED_TOKEN, SEED_TOKEN, SEED_ETH, deployer, block.timestamp + 1 hours
        );

        IERC20(tokenB).approve(address(router), SEED_TOKEN);
        router.addLiquidityETH{ value: SEED_ETH }(
            tokenB, SEED_TOKEN, SEED_TOKEN, SEED_ETH, deployer, block.timestamp + 1 hours
        );

        address pairA = router.pairFor(tokenA, address(weth));
        address pairB = router.pairFor(tokenB, address(weth));

        vm.stopBroadcast();

        console2.log("=== EquinoxFi ETH pools ===");
        console2.log("Deployer        :", deployer);
        console2.log("Factory (reused):", factory);
        console2.log("WETH            :", address(weth));
        console2.log("Router (new)    :", address(router));
        console2.log("Pair WETH/eTKNA :", pairA);
        console2.log("Pair WETH/eTKNB :", pairB);
    }
}
