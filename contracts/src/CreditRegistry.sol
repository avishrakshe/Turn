// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICreditRegistry} from "./interfaces/ICreditRegistry.sol";
import {TrustMath} from "./libraries/TrustMath.sol";

/// @title CreditRegistry
/// @notice Non-transferable savings history per wallet. Every Turn circle a wallet takes part in adds to it.
/// @dev Deployed by the CircleFactory, which is the only address that can authorize writers (factory-made circles).
///      There is no transfer, approval, or admin override: a record can only change through circle events.
contract CreditRegistry is ICreditRegistry {
    /// @inheritdoc ICreditRegistry
    address public immutable factory;

    mapping(address => Record) private _records;
    mapping(address => bool) public isAuthorized;

    modifier onlyCircle() {
        if (!isAuthorized[msg.sender]) revert NotAuthorizedCircle();
        _;
    }

    constructor(address factory_) {
        factory = factory_;
    }

    /// @inheritdoc ICreditRegistry
    function authorize(address circle) external {
        if (msg.sender != factory) revert NotFactory();
        isAuthorized[circle] = true;
        emit CircleAuthorized(circle);
    }

    /// @inheritdoc ICreditRegistry
    function recordOf(address account) external view returns (Record memory) {
        return _records[account];
    }

    /// @inheritdoc ICreditRegistry
    function score(address account) external view returns (uint16) {
        return TrustMath.score(_records[account]);
    }

    /// @inheritdoc ICreditRegistry
    function trustBps(address account) external view returns (uint16) {
        return TrustMath.trustBps(_records[account]);
    }

    /// @inheritdoc ICreditRegistry
    function onJoined(address account) external onlyCircle {
        Record storage r = _records[account];
        r.circlesJoined += 1;
        emit RecordUpdated(account, r);
    }

    /// @inheritdoc ICreditRegistry
    function onPayment(address account, uint256 amount, bool onTime) external onlyCircle {
        Record storage r = _records[account];
        if (onTime) r.paymentsOnTime += 1;
        else r.paymentsLate += 1;
        r.totalContributed += uint128(amount);
        emit RecordUpdated(account, r);
    }

    /// @inheritdoc ICreditRegistry
    function onDefault(address account) external onlyCircle {
        Record storage r = _records[account];
        r.defaults += 1;
        emit RecordUpdated(account, r);
    }

    /// @inheritdoc ICreditRegistry
    function onCompleted(address account) external onlyCircle {
        Record storage r = _records[account];
        r.circlesCompleted += 1;
        emit RecordUpdated(account, r);
    }
}
