// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title EquinoxERC20
/// @author EquinoxFi
/// @notice ERC-20 liquidity-provider (LP) share token, minted to liquidity
///         providers by {EquinoxPair}. Each pair IS an EquinoxERC20: holding the
///         LP token represents a proportional claim on that pair's reserves.
/// @dev Thin wrapper over OpenZeppelin {ERC20} that exposes internal
///      `_mint`/`_burn` to the inheriting pair through `nonpayable` hooks. The
///      Uniswap-V2-style EIP-2612 `permit` is intentionally omitted to keep the
///      surface small; LP transfers use the standard approve flow.
///
///      The constructor takes NO arguments so that {EquinoxFactory} can deploy
///      pairs deterministically via CREATE2 (a stable `creationCode` hash is
///      required for the off-chain `pairFor` address computation).
contract EquinoxERC20 is ERC20 {
    constructor() ERC20("Equinox LP", "eLP") { }

    /// @dev Mints `value` LP tokens to `to`. Internal-only; pairs call this.
    function _mintLp(address to, uint256 value) internal {
        _mint(to, value);
    }

    /// @dev Burns `value` LP tokens from `from`. Internal-only; pairs call this.
    function _burnLp(address from, uint256 value) internal {
        _burn(from, value);
    }
}
