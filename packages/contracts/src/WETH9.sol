// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title WETH9 (Wrapped Ether)
/// @author EquinoxFi
/// @notice Minimal Wrapped-Ether: an ERC-20 that is mintable 1:1 by sending ETH
///         (`deposit`) and redeemable 1:1 for ETH (`withdraw`). This lets the
///         AMM — which only understands ERC-20s — trade native ETH by wrapping
///         it on the way in and unwrapping it on the way out.
/// @dev A trimmed, OpenZeppelin-backed equivalent of the canonical WETH9. 18
///      decimals (ERC-20 default), matching native ETH.
contract WETH9 is ERC20 {
    /// @notice Emitted when ETH is wrapped into WETH.
    event Deposit(address indexed account, uint256 amount);

    /// @notice Emitted when WETH is unwrapped back into ETH.
    event Withdrawal(address indexed account, uint256 amount);

    /// @notice Reverts when an ETH transfer on withdraw fails.
    error EthTransferFailed();

    constructor() ERC20("Wrapped Ether", "WETH") {}

    /// @notice Wraps the sent ETH, minting an equal amount of WETH to the caller.
    function deposit() public payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    /// @notice Burns `amount` WETH from the caller and returns an equal amount of ETH.
    /// @param amount WETH to unwrap (base units).
    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool ok,) = msg.sender.call{ value: amount }("");
        if (!ok) revert EthTransferFailed();
        emit Withdrawal(msg.sender, amount);
    }

    /// @notice Wrap ETH sent directly to the contract.
    receive() external payable {
        deposit();
    }
}
