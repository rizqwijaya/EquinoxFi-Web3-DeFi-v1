// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { EquinoxERC20 } from "./EquinoxERC20.sol";

/// @title EquinoxPair
/// @author EquinoxFi
/// @notice Constant-product (x*y=k) automated market maker for ONE token pair,
///         a minimal Solidity-0.8 port of Uniswap V2's `UniswapV2Pair`. The
///         contract itself is the pair's LP token (inherits {EquinoxERC20}).
/// @dev Security model (mirrors {EquinoxVault}, GENERAL.md Section 4):
///      - a `lock` reentrancy guard on every state-changing external fn;
///      - checks-effects-interactions: reserves are synced via {_update} after
///        balances settle;
///      - {SafeERC20} for all token movements;
///      - the constant-product invariant is re-checked after each swap with the
///        0.3% fee already deducted, so `k` can never decrease.
///
///      Unlike Uniswap V2 this port omits the protocol fee (`feeTo`/`kLast`),
///      flash-swap callback, price oracle accumulators, and EIP-2612 permit —
///      none are needed for the EquinoxFi demo and each is extra attack surface.
contract EquinoxPair is EquinoxERC20 {
    using SafeERC20 for IERC20;

    /// @notice Permanently-locked liquidity minted on the first deposit,
    ///         preventing the pool from being fully drained and the LP total
    ///         supply from ever returning to zero (Uniswap V2 invariant).
    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    /// @dev Recipient of the locked {MINIMUM_LIQUIDITY}. Uniswap V2 used
    ///      address(0), but OpenZeppelin v5 {ERC20} forbids minting to the zero
    ///      address, so the canonical burn address is used instead — equally
    ///      unrecoverable, achieving the same permanent lock.
    address private constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice Factory that deployed this pair (the only address allowed to
    ///         {initialize} it).
    address public factory;

    /// @notice The pair's two tokens, sorted so `token0 < token1`.
    address public token0;
    address public token1;

    /// @dev Cached reserves, updated on every mint/burn/swap. `private` with
    ///      a {getReserves} accessor, matching the Uniswap V2 layout.
    uint112 private reserve0;
    uint112 private reserve1;

    /// @dev Reentrancy guard state (1 = unlocked, 2 = locked).
    uint256 private unlocked = 1;

    /// @notice Emitted when liquidity is added and LP tokens are minted.
    event Mint(address indexed sender, uint256 amount0, uint256 amount1);

    /// @notice Emitted when liquidity is removed and LP tokens are burned.
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);

    /// @notice Emitted on every swap with the gross in/out amounts per token.
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );

    /// @notice Emitted whenever the cached reserves change.
    event Sync(uint112 reserve0, uint112 reserve1);

    /// @notice Reverts when a non-factory address calls {initialize}.
    error Forbidden();

    /// @notice Reverts when {initialize} is called more than once.
    error AlreadyInitialized();

    /// @notice Reverts when a mint/burn/swap would yield zero output.
    error InsufficientLiquidityMinted();
    error InsufficientLiquidityBurned();
    error InsufficientOutputAmount();
    error InsufficientInputAmount();
    error InsufficientLiquidity();

    /// @notice Reverts when an `to` swap recipient is one of the pair's tokens.
    error InvalidTo();

    /// @notice Reverts when a swap breaks the constant-product invariant.
    error KInvariant();

    /// @notice Reverts when reserves would overflow the uint112 packing.
    error Overflow();

    /// @dev Single non-reentrant guard reused by all external mutators.
    modifier lock() {
        if (unlocked != 1) revert("EquinoxPair: LOCKED");
        unlocked = 2;
        _;
        unlocked = 1;
    }

    /// @dev The factory deploys the pair (constructor takes no args for a stable
    ///      CREATE2 `creationCode` hash), then wires up the tokens here.
    constructor() {
        factory = msg.sender;
    }

    /// @notice One-time setup called by the factory immediately after CREATE2.
    /// @param _token0 The lower-sorted token address.
    /// @param _token1 The higher-sorted token address.
    function initialize(address _token0, address _token1) external {
        if (msg.sender != factory) revert Forbidden();
        if (token0 != address(0) || token1 != address(0)) revert AlreadyInitialized();
        token0 = _token0;
        token1 = _token1;
    }

    /// @notice Current cached reserves of token0 and token1.
    /// @return _reserve0 Reserve of {token0}.
    /// @return _reserve1 Reserve of {token1}.
    function getReserves() public view returns (uint112 _reserve0, uint112 _reserve1) {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
    }

    /// @dev Writes the latest balances back into the packed reserve cache.
    ///      Reverts if either balance exceeds the uint112 range.
    function _update(uint256 balance0, uint256 balance1) private {
        if (balance0 > type(uint112).max || balance1 > type(uint112).max) revert Overflow();
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        emit Sync(reserve0, reserve1);
    }

    /// @notice Mints LP tokens to `to` for liquidity already transferred in.
    /// @dev Called by the router AFTER it has sent both tokens to this pair; the
    ///      minted amount is derived from the balance/reserve delta. The first
    ///      mint locks {MINIMUM_LIQUIDITY} to address(0).
    /// @param to Recipient of the freshly minted LP tokens.
    /// @return liquidity Amount of LP tokens minted to `to`.
    function mint(address to) external lock returns (uint256 liquidity) {
        (uint112 _reserve0, uint112 _reserve1) = getReserves();
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;

        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mintLp(BURN_ADDRESS, MINIMUM_LIQUIDITY); // permanently lock the first tokens
        } else {
            liquidity = Math.min(
                (amount0 * _totalSupply) / _reserve0, (amount1 * _totalSupply) / _reserve1
            );
        }
        if (liquidity == 0) revert InsufficientLiquidityMinted();
        _mintLp(to, liquidity);

        _update(balance0, balance1);
        emit Mint(msg.sender, amount0, amount1);
    }

    /// @notice Burns this pair's LP tokens (already transferred in) and returns
    ///         the proportional token0/token1 amounts to `to`.
    /// @dev Called by the router AFTER it has sent the LP tokens to this pair.
    /// @param to Recipient of the underlying tokens.
    /// @return amount0 Amount of {token0} returned.
    /// @return amount1 Amount of {token1} returned.
    function burn(address to) external lock returns (uint256 amount0, uint256 amount1) {
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 liquidity = balanceOf(address(this));

        uint256 _totalSupply = totalSupply();
        amount0 = (liquidity * balance0) / _totalSupply;
        amount1 = (liquidity * balance1) / _totalSupply;
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidityBurned();

        _burnLp(address(this), liquidity);
        IERC20(token0).safeTransfer(to, amount0);
        IERC20(token1).safeTransfer(to, amount1);

        balance0 = IERC20(token0).balanceOf(address(this));
        balance1 = IERC20(token1).balanceOf(address(this));
        _update(balance0, balance1);
        emit Burn(msg.sender, amount0, amount1, to);
    }

    /// @notice Swaps tokens, sending `amount{0,1}Out` to `to`.
    /// @dev The router transfers the input token in BEFORE calling this. Exactly
    ///      one of the two outputs is non-zero in a single-hop swap. The 0.3%
    ///      fee is enforced by the adjusted-balance invariant check
    ///      (`balanceAdjusted = balance*1000 - amountIn*3`), so `k` after the
    ///      swap is never less than before.
    /// @param amount0Out Amount of {token0} to send out.
    /// @param amount1Out Amount of {token1} to send out.
    /// @param to Recipient of the output tokens.
    function swap(uint256 amount0Out, uint256 amount1Out, address to) external lock {
        if (amount0Out == 0 && amount1Out == 0) revert InsufficientOutputAmount();
        (uint112 _reserve0, uint112 _reserve1) = getReserves();
        if (amount0Out >= _reserve0 || amount1Out >= _reserve1) revert InsufficientLiquidity();

        uint256 balance0;
        uint256 balance1;
        {
            // Scope token transfers so `_token0`/`_token1` are freed before the
            // invariant math below (avoids "stack too deep").
            address _token0 = token0;
            address _token1 = token1;
            if (to == _token0 || to == _token1) revert InvalidTo();
            if (amount0Out > 0) IERC20(_token0).safeTransfer(to, amount0Out);
            if (amount1Out > 0) IERC20(_token1).safeTransfer(to, amount1Out);
            balance0 = IERC20(_token0).balanceOf(address(this));
            balance1 = IERC20(_token1).balanceOf(address(this));
        }

        uint256 amount0In =
            balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
        uint256 amount1In =
            balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
        if (amount0In == 0 && amount1In == 0) revert InsufficientInputAmount();

        {
            // Invariant with 0.3% fee: balance*1000 - amountIn*3 stands in for
            // the post-fee balance, scaled by 1000.
            uint256 balance0Adjusted = balance0 * 1000 - amount0In * 3;
            uint256 balance1Adjusted = balance1 * 1000 - amount1In * 3;
            if (balance0Adjusted * balance1Adjusted < uint256(_reserve0) * _reserve1 * 1000 * 1000)
            {
                revert KInvariant();
            }
        }

        _update(balance0, balance1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    /// @notice Forces reserves to match the current balances (recovery helper).
    /// @dev Public so anyone can resync if a token is force-sent to the pair.
    function sync() external lock {
        _update(IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this)));
    }
}
