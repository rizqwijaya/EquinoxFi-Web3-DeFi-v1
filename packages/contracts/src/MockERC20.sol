// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20
/// @notice Minimal mintable ERC-20 used as the staking and reward token in
///         local tests and on the Sepolia testnet deployment. It is NOT meant
///         for mainnet: `mint` is permissionless so anyone can fund themselves
///         with test tokens.
/// @dev Decimals are configurable at construction so tests can exercise tokens
///      with non-18 decimals if needed.
contract MockERC20 is ERC20 {
    /// @notice Number of decimals this token reports.
    uint8 private immutable _decimals;

    /// @notice Deploys a mock ERC-20.
    /// @param name_ Human-readable token name.
    /// @param symbol_ Token ticker symbol.
    /// @param decimals_ Number of decimals to report via {decimals}.
    constructor(string memory name_, string memory symbol_, uint8 decimals_)
        ERC20(name_, symbol_)
    {
        _decimals = decimals_;
    }

    /// @notice Returns the number of decimals used for user-facing amounts.
    /// @return The configured decimal count.
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Mints `amount` tokens to `to`. Permissionless — test/faucet use only.
    /// @param to Recipient of the freshly minted tokens.
    /// @param amount Amount to mint (in base units).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
