// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";

import {ITurnAccount} from "./interfaces/ITurnAccount.sol";
import {ICircleFactory} from "./interfaces/ICircleFactory.sol";

/// @title TurnAccount
/// @notice EIP-7702 delegate for Turn users' passkey-derived (mera) EOAs.
///         - Executes EIP-712-signed call batches submitted by the Turn relayer, which pays the gas.
///         - Holds onchain-enforced auto-pay grants, so circles can collect contributions without a new prompt.
/// @dev Runs as code *of the user's EOA*, so:
///      - `address(this)` is the user; signatures must recover to it.
///      - Storage lives in the EOA and uses an ERC-7201 namespace to avoid collisions with other delegates.
///      - Calls never carry value: Monad reverts txs that lower a delegated EOA's MON balance below 10 MON.
///      - No CREATE/CREATE2 here: Monad forbids them in a delegated EOA's context.
///      Relayed calls are restricted to the token, the factory, factory-registered circles, and this account.
///      Trust model: the relayer can refuse to submit (censor) but cannot move funds without the user's signature.
contract TurnAccount is ITurnAccount, EIP712, IERC1271 {
    using SafeERC20 for IERC20;

    bytes32 public constant CALL_TYPEHASH = keccak256("Call(address target,bytes data)");
    bytes32 public constant EXECUTE_TYPEHASH =
        keccak256("Execute(Call[] calls,uint256 nonce,uint256 deadline)Call(address target,bytes data)");

    /// @custom:storage-location erc7201:turn.account.v1
    struct AccountStorage {
        uint256 nonce;
        mapping(address circle => PullGrant) grants;
        uint256 locked;
    }

    // keccak256(abi.encode(uint256(keccak256("turn.account.v1")) - 1)) & ~bytes32(uint256(0xff))
    // (value from `cast index-erc7201 turn.account.v1`; asserted in TurnAccount.t.sol)
    bytes32 private constant STORAGE_SLOT =
        0x6c07d38f479240588ee4b6ad8c1ffacfd3cbcefe6580fc543815b31c5437a100;

    IERC20 public immutable token;
    ICircleFactory public immutable factory;

    error Reentrant();

    constructor(IERC20 token_, ICircleFactory factory_) EIP712("TurnAccount", "1") {
        token = token_;
        factory = factory_;
    }

    /// @dev Accept MON sent to the account (receiving never lowers the balance, so it's safe under Monad rules).
    receive() external payable {}

    modifier onlySelf() {
        if (msg.sender != address(this)) revert OnlySelf();
        _;
    }

    modifier nonReentrant() {
        AccountStorage storage s = _s();
        if (s.locked == 1) revert Reentrant();
        s.locked = 1;
        _;
        s.locked = 0;
    }

    // ---------------------------------------------------------------------------------------------
    // Batched execution
    // ---------------------------------------------------------------------------------------------

    /// @inheritdoc ITurnAccount
    function execute(Call[] calldata calls, uint256 nonce_, uint256 deadline, bytes calldata signature)
        external
        nonReentrant
    {
        if (block.timestamp > deadline) revert Expired();
        AccountStorage storage s = _s();
        if (nonce_ != s.nonce) revert BadNonce();
        bytes32 digest = hashCalls(calls, nonce_, deadline);
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || signer != address(this)) revert BadSignature();
        s.nonce = nonce_ + 1;
        _run(calls);
        emit Executed(nonce_, calls.length);
    }

    /// @inheritdoc ITurnAccount
    /// @dev Self-submission path: the user sends a tx from their own EOA (no relayer needed).
    function executeSelf(Call[] calldata calls) external onlySelf nonReentrant {
        _run(calls);
        emit Executed(type(uint256).max, calls.length);
    }

    function _run(Call[] calldata calls) internal {
        for (uint256 i; i < calls.length; ++i) {
            Call calldata c = calls[i];
            _checkTarget(c.target, c.data);
            (bool ok, bytes memory ret) = c.target.call(c.data);
            if (!ok) revert CallFailed(i, ret);
        }
    }

    function _checkTarget(address target, bytes calldata data) internal view {
        if (target == address(this)) {
            bytes4 sel = data.length >= 4 ? bytes4(data[:4]) : bytes4(0);
            if (sel != this.grantPull.selector && sel != this.revokePull.selector) {
                revert SelectorNotAllowed(sel);
            }
            return;
        }
        if (target == address(token) || target == address(factory) || factory.isCircle(target)) return;
        revert TargetNotAllowed(target);
    }

    /// @inheritdoc ITurnAccount
    function hashCalls(Call[] calldata calls, uint256 nonce_, uint256 deadline)
        public
        view
        returns (bytes32)
    {
        bytes32[] memory hashes = new bytes32[](calls.length);
        for (uint256 i; i < calls.length; ++i) {
            hashes[i] = keccak256(abi.encode(CALL_TYPEHASH, calls[i].target, keccak256(calls[i].data)));
        }
        bytes32 structHash =
            keccak256(abi.encode(EXECUTE_TYPEHASH, keccak256(abi.encodePacked(hashes)), nonce_, deadline));
        return _hashTypedDataV4(structHash);
    }

    // ---------------------------------------------------------------------------------------------
    // Auto-pay grants
    // ---------------------------------------------------------------------------------------------

    /// @inheritdoc ITurnAccount
    function grantPull(address circle, uint128 maxAmount, uint32 period, uint64 validUntil)
        external
        onlySelf
    {
        if (!factory.isCircle(circle)) revert NotCircle();
        _s().grants[circle] = PullGrant({
            maxAmount: maxAmount,
            period: period,
            validUntil: validUntil,
            grantedAt: uint64(block.timestamp),
            pulls: 0,
            lastRound: 0,
            active: true
        });
        emit PullGranted(circle, maxAmount, period, validUntil);
    }

    /// @inheritdoc ITurnAccount
    function revokePull(address circle) external onlySelf {
        _s().grants[circle].active = false;
        emit PullRevoked(circle);
    }

    /// @inheritdoc ITurnAccount
    /// @dev Scope checks: active and unexpired grant (grants only exist for factory-registered circles, and
    ///      registration is permanent), amount cap, strictly increasing round, and on average at most one pull per
    ///      `period` since the grant (pulls <= elapsed/period + 1), which tolerates keeper timing jitter without
    ///      allowing bursts.
    function pullContribution(uint256 round, uint256 amount) external nonReentrant {
        PullGrant storage g = _s().grants[msg.sender];
        if (!g.active) revert NoGrant();
        if (block.timestamp > g.validUntil) revert GrantExpired();
        if (amount > g.maxAmount) revert AmountTooHigh();
        if (round <= g.lastRound) revert RoundNotNew();
        uint256 allowed = (block.timestamp - g.grantedAt) / g.period + 1;
        if (g.pulls >= allowed) revert TooFrequent();
        g.pulls += 1;
        g.lastRound = uint32(round);
        token.safeTransfer(msg.sender, amount);
        emit Pulled(msg.sender, round, amount);
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    /// @inheritdoc ITurnAccount
    function nonce() external view returns (uint256) {
        return _s().nonce;
    }

    /// @inheritdoc ITurnAccount
    function grantOf(address circle) external view returns (PullGrant memory) {
        return _s().grants[circle];
    }

    /// @notice ERC-1271: the account's own key signs for it.
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(hash, signature);
        if (err == ECDSA.RecoverError.NoError && signer == address(this)) {
            return IERC1271.isValidSignature.selector;
        }
        return 0xffffffff;
    }

    function _s() private pure returns (AccountStorage storage s) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            s.slot := slot
        }
    }
}
