// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { EquinoxFactory } from "../src/EquinoxFactory.sol";
import { EquinoxRouter } from "../src/EquinoxRouter.sol";
import { EquinoxPair } from "../src/EquinoxPair.sol";
import { MockERC20 } from "../src/MockERC20.sol";
import { WETH9 } from "../src/WETH9.sol";

/// @title EquinoxAmmTest
/// @notice Foundry suite for the EquinoxFi AMM (Factory / Pair / Router):
///         pair creation + CREATE2 determinism, liquidity add/remove,
///         constant-product swaps with fee, quote parity, slippage/deadline
///         reverts, and a fuzz over {EquinoxRouter.getAmountOut}.
contract EquinoxAmmTest is Test {
    EquinoxFactory internal factory;
    EquinoxRouter internal router;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;

    address internal lp = makeAddr("lp");
    address internal trader = makeAddr("trader");

    uint256 internal constant INITIAL_A = 10_000 ether;
    uint256 internal constant INITIAL_B = 40_000 ether; // 1 A = 4 B at seed

    function setUp() public {
        factory = new EquinoxFactory();
        router = new EquinoxRouter(address(factory), address(new WETH9()));
        tokenA = new MockERC20("Equinox Token A", "eTKNA", 18);
        tokenB = new MockERC20("Equinox Token B", "eTKNB", 18);

        // Seed the LP with both tokens and add the initial liquidity.
        tokenA.mint(lp, INITIAL_A);
        tokenB.mint(lp, INITIAL_B);
        vm.startPrank(lp);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(
            address(tokenA), address(tokenB), INITIAL_A, INITIAL_B, 0, 0, lp, block.timestamp
        );
        vm.stopPrank();

        // Fund the trader.
        tokenA.mint(trader, 1_000 ether);
        tokenB.mint(trader, 1_000 ether);
        vm.startPrank(trader);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    function _path(address a, address b) internal pure returns (address[] memory p) {
        p = new address[](2);
        p[0] = a;
        p[1] = b;
    }

    function _pair() internal view returns (EquinoxPair) {
        return EquinoxPair(factory.getPair(address(tokenA), address(tokenB)));
    }

    // ── factory / CREATE2 ──────────────────────────────────────────────────────

    function test_CreatePair_RegistersBothDirections() public view {
        address pair = factory.getPair(address(tokenA), address(tokenB));
        assertTrue(pair != address(0));
        assertEq(factory.getPair(address(tokenB), address(tokenA)), pair);
        assertEq(factory.allPairsLength(), 1);
    }

    function test_PairFor_MatchesDeployedAddress() public view {
        assertEq(router.pairFor(address(tokenA), address(tokenB)), address(_pair()));
    }

    function test_CreatePair_RevertsOnDuplicate() public {
        vm.expectRevert(EquinoxFactory.PairExists.selector);
        factory.createPair(address(tokenA), address(tokenB));
    }

    function test_CreatePair_RevertsOnIdentical() public {
        vm.expectRevert(EquinoxFactory.IdenticalAddresses.selector);
        factory.createPair(address(tokenA), address(tokenA));
    }

    // ── liquidity ──────────────────────────────────────────────────────────────

    function test_AddLiquidity_LocksMinimumLiquidity() public view {
        EquinoxPair pair = _pair();
        // First LP mint permanently locks MINIMUM_LIQUIDITY to the burn address.
        address burn = 0x000000000000000000000000000000000000dEaD;
        assertEq(pair.balanceOf(burn), pair.MINIMUM_LIQUIDITY());
        assertGt(pair.balanceOf(lp), 0);
    }

    function test_AddLiquidity_SecondDepositIsProportional() public {
        EquinoxPair pair = _pair();
        uint256 supplyBefore = pair.totalSupply();

        address lp2 = makeAddr("lp2");
        tokenA.mint(lp2, 1_000 ether);
        tokenB.mint(lp2, 4_000 ether); // same 1:4 ratio
        vm.startPrank(lp2);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(
            address(tokenA), address(tokenB), 1_000 ether, 4_000 ether, 0, 0, lp2, block.timestamp
        );
        vm.stopPrank();

        // Deposited 10% of reserves → ~10% of supply minted.
        uint256 minted = pair.balanceOf(lp2);
        assertApproxEqRel(minted, supplyBefore / 10, 1e15); // within 0.1%
    }

    function test_RemoveLiquidity_ReturnsUnderlying() public {
        EquinoxPair pair = _pair();
        uint256 lpBal = pair.balanceOf(lp);

        uint256 aBefore = tokenA.balanceOf(lp);
        uint256 bBefore = tokenB.balanceOf(lp);

        vm.startPrank(lp);
        pair.approve(address(router), lpBal);
        router.removeLiquidity(address(tokenA), address(tokenB), lpBal, 0, 0, lp, block.timestamp);
        vm.stopPrank();

        assertGt(tokenA.balanceOf(lp), aBefore);
        assertGt(tokenB.balanceOf(lp), bBefore);
        assertEq(pair.balanceOf(lp), 0);
    }

    // ── swaps ──────────────────────────────────────────────────────────────────

    function test_Swap_OutputMatchesQuote() public {
        uint256 amountIn = 100 ether;
        address[] memory path = _path(address(tokenA), address(tokenB));
        uint256[] memory quoted = router.getAmountsOut(amountIn, path);

        uint256 bBefore = tokenB.balanceOf(trader);
        vm.prank(trader);
        uint256[] memory amounts =
            router.swapExactTokensForTokens(amountIn, 0, path, trader, block.timestamp);

        assertEq(amounts[1], quoted[1]);
        assertEq(tokenB.balanceOf(trader) - bBefore, quoted[1]);
    }

    function test_Swap_IncreasesK() public {
        EquinoxPair pair = _pair();
        (uint112 r0, uint112 r1) = pair.getReserves();
        uint256 kBefore = uint256(r0) * r1;

        address[] memory path = _path(address(tokenA), address(tokenB));
        vm.prank(trader);
        router.swapExactTokensForTokens(100 ether, 0, path, trader, block.timestamp);

        (r0, r1) = pair.getReserves();
        uint256 kAfter = uint256(r0) * r1;
        assertGt(kAfter, kBefore); // the 0.3% fee accrues to the pool
    }

    function test_Swap_RevertsOnSlippage() public {
        address[] memory path = _path(address(tokenA), address(tokenB));
        uint256[] memory quoted = router.getAmountsOut(100 ether, path);

        vm.prank(trader);
        vm.expectRevert(EquinoxRouter.InsufficientOutputAmount.selector);
        router.swapExactTokensForTokens(100 ether, quoted[1] + 1, path, trader, block.timestamp);
    }

    function test_Swap_RevertsOnExpiredDeadline() public {
        address[] memory path = _path(address(tokenA), address(tokenB));
        vm.warp(1000);
        vm.prank(trader);
        vm.expectRevert(EquinoxRouter.Expired.selector);
        router.swapExactTokensForTokens(100 ether, 0, path, trader, block.timestamp - 1);
    }

    // ── fuzz ────────────────────────────────────────────────────────────────────

    function testFuzz_GetAmountOut_BoundedAndMonotonic(uint256 amountIn) public view {
        amountIn = bound(amountIn, 1, 1_000_000 ether);
        uint256 reserveIn = 50_000 ether;
        uint256 reserveOut = 50_000 ether;

        uint256 out = router.getAmountOut(amountIn, reserveIn, reserveOut);
        // Output can never drain the pool.
        assertLt(out, reserveOut);
        // Monotonic: a larger input yields >= output.
        uint256 outMore = router.getAmountOut(amountIn + 1, reserveIn, reserveOut);
        assertGe(outMore, out);
    }
}
