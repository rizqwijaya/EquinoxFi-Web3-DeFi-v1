// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { EquinoxFactory } from "../src/EquinoxFactory.sol";
import { EquinoxRouter } from "../src/EquinoxRouter.sol";
import { MockERC20 } from "../src/MockERC20.sol";
import { WETH9 } from "../src/WETH9.sol";

/// @title EquinoxRouterEthTest
/// @notice Covers the native-ETH router paths: seeding a token/WETH pool with
///         `addLiquidityETH`, buying tokens with ETH, and selling tokens for ETH.
contract EquinoxRouterEthTest is Test {
    EquinoxFactory internal factory;
    EquinoxRouter internal router;
    WETH9 internal weth;
    MockERC20 internal token;

    address internal lp = makeAddr("lp");
    address internal trader = makeAddr("trader");

    uint256 internal constant SEED_ETH = 1 ether;
    uint256 internal constant SEED_TOKEN = 10_000 ether;

    function setUp() public {
        factory = new EquinoxFactory();
        weth = new WETH9();
        router = new EquinoxRouter(address(factory), address(weth));
        token = new MockERC20("Equinox Token A", "eTKNA", 18);

        // LP seeds the WETH/token pool.
        token.mint(lp, SEED_TOKEN);
        vm.deal(lp, SEED_ETH);
        vm.startPrank(lp);
        token.approve(address(router), type(uint256).max);
        router.addLiquidityETH{ value: SEED_ETH }(
            address(token), SEED_TOKEN, SEED_TOKEN, SEED_ETH, lp, block.timestamp
        );
        vm.stopPrank();
    }

    function test_AddLiquidityETH_CreatesAndSeedsPool() public view {
        (uint256 reserveToken, uint256 reserveWeth) = router.getReserves(address(token), address(weth));
        assertEq(reserveToken, SEED_TOKEN, "token reserve");
        assertEq(reserveWeth, SEED_ETH, "weth reserve");
    }

    function test_SwapExactETHForTokens_DeliversTokens() public {
        vm.deal(trader, 0.1 ether);
        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(token);

        uint256 expected = router.getAmountsOut(0.1 ether, path)[1];
        assertGt(expected, 0, "quote > 0");

        vm.prank(trader);
        router.swapExactETHForTokens{ value: 0.1 ether }(expected, path, trader, block.timestamp);

        assertEq(token.balanceOf(trader), expected, "trader received tokens");
        assertEq(trader.balance, 0, "ETH spent");
    }

    function test_SwapExactTokensForETH_DeliversEth() public {
        token.mint(trader, 100 ether);
        address[] memory path = new address[](2);
        path[0] = address(token);
        path[1] = address(weth);

        uint256 expected = router.getAmountsOut(100 ether, path)[1];
        assertGt(expected, 0, "quote > 0");

        vm.startPrank(trader);
        token.approve(address(router), type(uint256).max);
        router.swapExactTokensForETH(100 ether, expected, path, trader, block.timestamp);
        vm.stopPrank();

        assertEq(trader.balance, expected, "trader received ETH");
    }

    function test_SwapExactETHForTokens_RevertsOnBadPath() public {
        vm.deal(trader, 0.1 ether);
        address[] memory path = new address[](2);
        path[0] = address(token); // should be WETH
        path[1] = address(weth);

        vm.prank(trader);
        vm.expectRevert(EquinoxRouter.InvalidEthPath.selector);
        router.swapExactETHForTokens{ value: 0.1 ether }(0, path, trader, block.timestamp);
    }
}
