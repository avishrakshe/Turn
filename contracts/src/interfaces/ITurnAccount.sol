// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ITurnAccount
/// @notice EIP-7702 delegate for Turn users' passkey-derived EOAs.
interface ITurnAccount {
    /// @notice A relayed call. Value is always zero: delegated EOAs never move MON (Monad reserve-balance rule).
    struct Call {
        address target;
        bytes data;
    }

    /// @notice Onchain-enforced auto-pay scope for one circle.
    struct PullGrant {
        uint128 maxAmount; // max per pull
        uint32 period; // minimum average spacing between pulls
        uint64 validUntil; // grant expiry (unix seconds)
        uint64 grantedAt;
        uint32 pulls; // pulls made so far
        uint32 lastRound; // last round pulled; rounds must strictly increase
        bool active;
    }

    event Executed(uint256 indexed nonce, uint256 calls);
    event PullGranted(address indexed circle, uint128 maxAmount, uint32 period, uint64 validUntil);
    event PullRevoked(address indexed circle);
    event Pulled(address indexed circle, uint256 indexed round, uint256 amount);

    error Expired();
    error BadNonce();
    error BadSignature();
    error TargetNotAllowed(address target);
    error SelectorNotAllowed(bytes4 selector);
    error OnlySelf();
    error CallFailed(uint256 index, bytes reason);
    error NoGrant();
    error GrantExpired();
    error AmountTooHigh();
    error RoundNotNew();
    error TooFrequent();
    error NotCircle();

    function execute(Call[] calldata calls, uint256 nonce, uint256 deadline, bytes calldata signature)
        external;
    function executeSelf(Call[] calldata calls) external;

    function grantPull(address circle, uint128 maxAmount, uint32 period, uint64 validUntil) external;
    function revokePull(address circle) external;
    function pullContribution(uint256 round, uint256 amount) external;

    function nonce() external view returns (uint256);
    function grantOf(address circle) external view returns (PullGrant memory);
    function hashCalls(Call[] calldata calls, uint256 nonce, uint256 deadline) external view returns (bytes32);
}
