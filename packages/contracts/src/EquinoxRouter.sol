// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { EquinoxFactory } from "./EquinoxFactory.sol";
import { EquinoxPair } from "./EquinoxPair.sol";

/// @notice Minimal WETH interface used to wrap/unwrap native ETH around swaps.
interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}

/// @title EquinoxRouter
/// @author EquinoxFi
/// @notice User-facing entrypoint to the EquinoxFi AMM, a trimmed port of
///         `UniswapV2Router02`. Frontends call this contract — it pulls the
///         input tokens, enforces deadlines and slippage minimums, and routes
///         to the underlying {EquinoxPair}s.
/// @dev Stateless aside from the immutable factory reference. Pair addresses are
///      derived deterministically via {pairFor} (CREATE2 + the factory's
///      INIT_CODE_HASH), avoiding a storage read per hop.
contract EquinoxRouter {
    using SafeERC20 for IERC20;

    /// @notice The factory used to create and locate pairs.
    EquinoxFactory public immutable factory;

    /// @notice Wrapped-ETH used to route native-ETH swaps through ERC-20 pools.
    address public immutable WETH;

    /// @notice Reverts when a native-ETH path doesn't start/end with WETH.
    error InvalidEthPath();

    /// @notice Reverts when forwarding ETH to the recipient fails.
    error EthTransferFailed();

    /// @notice Reverts when the transaction is mined after its deadline.
    error Expired();

    /// @notice Reverts when a quote/swap path has fewer than two tokens.
    error InvalidPath();

    /// @notice Reverts when a swap's output is below the caller's minimum.
    error InsufficientOutputAmount();

    /// @notice Reverts when added liquidity falls below the caller's minimums.
    error InsufficientAAmount();
    error InsufficientBAmount();

    /// @notice Reverts on zero-amount or zero-reserve quote inputs.
    error InsufficientAmount();
    error InsufficientLiquidity();

    /// @param _factory Address of the deployed {EquinoxFactory}.
    /// @param _weth Address of the {WETH9} used for native-ETH swaps.
    constructor(address _factory, address _weth) {
        factory = EquinoxFactory(_factory);
        WETH = _weth;
    }

    /// @dev Accept ETH only from the WETH contract (during unwrap/withdraw).
    receive() external payable {
        assert(msg.sender == WETH);
    }

    /// @dev Reverts if the current block is past `deadline`.
    modifier ensure(uint256 deadline) {
        if (block.timestamp > deadline) revert Expired();
        _;
    }

    // ── Liquidity ──────────────────────────────────────────────────────────────

    /// @notice Adds liquidity to the `tokenA`/`tokenB` pair, creating it if needed.
    /// @dev Computes the optimal second-token amount against current reserves so
    ///      the deposit matches the pool ratio, pulls both tokens from the
    ///      caller, and mints LP tokens to `to`. Reverts if the optimal amounts
    ///      fall below `amountAMin`/`amountBMin` (slippage protection).
    /// @return amountA Actual {tokenA} deposited.
    /// @return amountB Actual {tokenB} deposited.
    /// @return liquidity LP tokens minted to `to`.
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        (amountA, amountB) =
            _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        // Pull tokens + mint in a helper so the six desired/min params above are
        // off the stack here (keeps the legacy compiler under its slot limit).
        liquidity = _deposit(tokenA, tokenB, amountA, amountB, to);
    }

    /// @dev Transfers the resolved amounts into the pair and mints LP to `to`.
    function _deposit(address tokenA, address tokenB, uint256 amountA, uint256 amountB, address to)
        private
        returns (uint256 liquidity)
    {
        address pair = pairFor(tokenA, tokenB);
        IERC20(tokenA).safeTransferFrom(msg.sender, pair, amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, pair, amountB);
        liquidity = EquinoxPair(pair).mint(to);
    }

    /// @dev Resolves the actual deposit amounts: creates the pair if missing,
    ///      then matches the pool ratio while honoring the caller's minimums.
    ///      Split out of {addLiquidity} to keep the external function under the
    ///      legacy compiler's stack limit.
    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) private returns (uint256 amountA, uint256 amountB) {
        if (factory.getPair(tokenA, tokenB) == address(0)) {
            factory.createPair(tokenA, tokenB);
        }

        (uint256 reserveA, uint256 reserveB) = getReserves(tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                if (amountBOptimal < amountBMin) revert InsufficientBAmount();
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = quote(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                if (amountAOptimal < amountAMin) revert InsufficientAAmount();
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }

    /// @notice Adds liquidity to a `token`/WETH pair using native ETH (`msg.value`),
    ///         creating the pair if needed.
    /// @dev Resolves the optimal token/ETH split against current reserves, pulls
    ///      the token from the caller, wraps the matching ETH into WETH, mints LP
    ///      to `to`, and refunds any leftover ETH dust.
    /// @return amountToken Actual `token` deposited.
    /// @return amountETH Actual ETH (as WETH) deposited.
    /// @return liquidity LP tokens minted to `to`.
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        (amountToken, amountETH) =
            _addLiquidity(token, WETH, amountTokenDesired, msg.value, amountTokenMin, amountETHMin);
        address pair = pairFor(token, WETH);
        IERC20(token).safeTransferFrom(msg.sender, pair, amountToken);
        IWETH(WETH).deposit{ value: amountETH }();
        IERC20(WETH).safeTransfer(pair, amountETH);
        liquidity = EquinoxPair(pair).mint(to);
        // Refund any ETH not consumed by the optimal ratio.
        if (msg.value > amountETH) _safeTransferETH(msg.sender, msg.value - amountETH);
    }

    /// @notice Removes liquidity from the `tokenA`/`tokenB` pair.
    /// @dev Pulls the caller's LP tokens into the pair and burns them, returning
    ///      the underlying tokens to `to`. Reverts if either returned amount is
    ///      below the caller's minimum (slippage protection).
    /// @return amountA {tokenA} returned to `to`.
    /// @return amountB {tokenB} returned to `to`.
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = pairFor(tokenA, tokenB);
        IERC20(pair).safeTransferFrom(msg.sender, pair, liquidity);
        (uint256 amount0, uint256 amount1) = EquinoxPair(pair).burn(to);
        (address token0,) = sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        if (amountA < amountAMin) revert InsufficientAAmount();
        if (amountB < amountBMin) revert InsufficientBAmount();
    }

    // ── Swaps ──────────────────────────────────────────────────────────────────

    /// @notice Swaps an exact `amountIn` of `path[0]` for at least
    ///         `amountOutMin` of `path[path.length-1]`, hopping along `path`.
    /// @dev Pulls the input token from the caller into the first pair, then
    ///      executes each hop, sending the final output to `to`.
    /// @param amountIn Exact input amount of the first token.
    /// @param amountOutMin Minimum acceptable output (slippage protection).
    /// @param path Ordered token route (length >= 2).
    /// @param to Recipient of the final output token.
    /// @return amounts The amount at each step of `path` (amounts[0] == amountIn).
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = getAmountsOut(amountIn, path);
        if (amounts[amounts.length - 1] < amountOutMin) revert InsufficientOutputAmount();
        IERC20(path[0]).safeTransferFrom(msg.sender, pairFor(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    /// @notice Swaps exact native ETH (`msg.value`) for at least `amountOutMin`
    ///         of the final token. `path[0]` must be WETH.
    /// @dev Wraps the incoming ETH into WETH, sends it to the first pair, then
    ///      executes the hops, delivering the output token to `to`.
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256[] memory amounts) {
        if (path[0] != WETH) revert InvalidEthPath();
        amounts = getAmountsOut(msg.value, path);
        if (amounts[amounts.length - 1] < amountOutMin) revert InsufficientOutputAmount();
        IWETH(WETH).deposit{ value: amounts[0] }();
        IERC20(WETH).safeTransfer(pairFor(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    /// @notice Swaps exact `amountIn` of `path[0]` for at least `amountOutMin`
    ///         native ETH. `path[path.length-1]` must be WETH.
    /// @dev Pulls the input token, runs the hops into this router (receiving
    ///      WETH), unwraps it, and forwards the ETH to `to`.
    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        if (path[path.length - 1] != WETH) revert InvalidEthPath();
        amounts = getAmountsOut(amountIn, path);
        uint256 outAmount = amounts[amounts.length - 1];
        if (outAmount < amountOutMin) revert InsufficientOutputAmount();
        IERC20(path[0]).safeTransferFrom(msg.sender, pairFor(path[0], path[1]), amounts[0]);
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(outAmount);
        _safeTransferETH(to, outAmount);
    }

    /// @dev Forwards `amount` wei to `to`, reverting on failure.
    function _safeTransferETH(address to, uint256 amount) private {
        (bool ok,) = to.call{ value: amount }("");
        if (!ok) revert EthTransferFailed();
    }

    /// @dev Executes the swap hops. For each pair, the input has already been
    ///      sent in; this routes the output to the next pair (or to `to` on the
    ///      final hop).
    function _swap(uint256[] memory amounts, address[] calldata path, address _to) private {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) =
                input == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
            address to = i < path.length - 2 ? pairFor(output, path[i + 2]) : _to;
            EquinoxPair(pairFor(input, output)).swap(amount0Out, amount1Out, to);
        }
    }

    // ── Library views (UniswapV2Library equivalents) ────────────────────────────

    /// @notice Sorts two token addresses ascending.
    /// @return token0 The lower address.
    /// @return token1 The higher address.
    function sortTokens(address tokenA, address tokenB)
        public
        pure
        returns (address token0, address token1)
    {
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    /// @notice Deterministically computes the pair address for two tokens via
    ///         CREATE2, without reading factory storage.
    /// @return pair The (possibly not-yet-deployed) pair address.
    function pairFor(address tokenA, address tokenB) public view returns (address pair) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        pair = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex"ff",
                            address(factory),
                            keccak256(abi.encodePacked(token0, token1)),
                            factory.INIT_CODE_HASH()
                        )
                    )
                )
            )
        );
    }

    /// @notice Reserves of `tokenA`/`tokenB` ordered to match the arguments.
    /// @return reserveA Reserve of `tokenA`.
    /// @return reserveB Reserve of `tokenB`.
    function getReserves(address tokenA, address tokenB)
        public
        view
        returns (uint256 reserveA, uint256 reserveB)
    {
        (address token0,) = sortTokens(tokenA, tokenB);
        (uint112 reserve0, uint112 reserve1) = EquinoxPair(pairFor(tokenA, tokenB)).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    /// @notice Mirror of a deposit: the second-token amount that preserves the
    ///         current pool ratio. No fee (used for liquidity math only).
    /// @return amountB Equivalent amount of the other token.
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB)
        public
        pure
        returns (uint256 amountB)
    {
        if (amountA == 0) revert InsufficientAmount();
        if (reserveA == 0 || reserveB == 0) revert InsufficientLiquidity();
        amountB = (amountA * reserveB) / reserveA;
    }

    /// @notice Output amount for an exact input, with the 0.3% fee applied.
    /// @dev `amountOut = (amountIn*997 * reserveOut) / (reserveIn*1000 + amountIn*997)`.
    /// @return amountOut Tokens received for `amountIn`.
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        public
        pure
        returns (uint256 amountOut)
    {
        if (amountIn == 0) revert InsufficientAmount();
        if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * 1000 + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /// @notice Cascades {getAmountOut} along `path` for live frontend quotes.
    /// @param amountIn Exact input amount of `path[0]`.
    /// @param path Ordered token route (length >= 2).
    /// @return amounts Output at each step (amounts[0] == amountIn).
    function getAmountsOut(uint256 amountIn, address[] calldata path)
        public
        view
        returns (uint256[] memory amounts)
    {
        if (path.length < 2) revert InvalidPath();
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i; i < path.length - 1; i++) {
            (uint256 reserveIn, uint256 reserveOut) = getReserves(path[i], path[i + 1]);
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }
}
