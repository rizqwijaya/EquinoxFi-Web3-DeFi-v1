// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EquinoxPair } from "./EquinoxPair.sol";

/// @title EquinoxFactory
/// @author EquinoxFi
/// @notice Deploys and registers {EquinoxPair} contracts, one per unordered
///         token pair. A minimal port of `UniswapV2Factory`.
/// @dev Pairs are deployed with CREATE2 using `salt = keccak256(token0,token1)`,
///      so a pair's address is deterministic and can be computed off-chain (and
///      by the router) from the factory address, the sorted token pair, and the
///      {INIT_CODE_HASH}. {EquinoxPair} has a no-arg constructor precisely so
///      its `creationCode` — and therefore this hash — is stable.
contract EquinoxFactory {
    /// @notice keccak256 of the {EquinoxPair} creation bytecode, used by the
    ///         router's `pairFor` to derive pair addresses without a storage read.
    bytes32 public constant INIT_CODE_HASH = keccak256(type(EquinoxPair).creationCode);

    /// @notice Pair address for an unordered token pair (both orderings map to
    ///         the same entry). `address(0)` if no pair exists.
    mapping(address tokenA => mapping(address tokenB => address pair)) public getPair;

    /// @notice All pairs ever created, in creation order.
    address[] public allPairs;

    /// @notice Emitted when a new pair is created.
    /// @param token0 The lower-sorted token.
    /// @param token1 The higher-sorted token.
    /// @param pair The deployed pair address.
    /// @param pairCount The new total number of pairs.
    event PairCreated(
        address indexed token0, address indexed token1, address pair, uint256 pairCount
    );

    /// @notice Reverts when both tokens are the same address.
    error IdenticalAddresses();

    /// @notice Reverts when either token is the zero address.
    error ZeroAddress();

    /// @notice Reverts when a pair for the two tokens already exists.
    error PairExists();

    /// @notice Number of pairs created so far.
    /// @return The length of {allPairs}.
    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    /// @notice Creates the pair for `tokenA`/`tokenB` (order-independent).
    /// @dev Sorts the tokens, deploys an {EquinoxPair} via CREATE2, initializes
    ///      it, and registers it under both orderings.
    /// @param tokenA One token of the pair.
    /// @param tokenB The other token of the pair.
    /// @return pair The newly created pair address.
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        if (tokenA == tokenB) revert IdenticalAddresses();
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (token0 == address(0)) revert ZeroAddress();
        if (getPair[token0][token1] != address(0)) revert PairExists();

        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        pair = address(new EquinoxPair{ salt: salt }());
        EquinoxPair(pair).initialize(token0, token1);

        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair; // populate both directions
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }
}
