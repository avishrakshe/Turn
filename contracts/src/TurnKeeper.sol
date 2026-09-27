// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IReceiver} from "./interfaces/IReceiver.sol";
import {ICircleFactory} from "./interfaces/ICircleFactory.sol";
import {Circle} from "./Circle.sol";

/// @title TurnKeeper
/// @notice Chainlink CRE consumer. The Turn CRE workflow reads circle state, decides what's due, and delivers a
///         signed report through the Chainlink forwarder; this contract executes each job against the circle.
/// @dev Every round function on Circle is permissionless, so this contract holds no special power: it only
///      checks that reports come from the configured forwarder and that targets are factory-made circles.
///      One failing job never blocks the others.
contract TurnKeeper is IReceiver, Ownable {
    enum Action {
        COLLECT,
        CLOSE_AUCTION,
        PAYOUT,
        MARK_DEFAULT
    }

    struct Job {
        address circle;
        Action action;
        address member; // MARK_DEFAULT only
        uint256 round; // MARK_DEFAULT only
    }

    ICircleFactory public immutable factory;
    address public forwarder;

    event ForwarderUpdated(address forwarder);
    event JobExecuted(address indexed circle, Action action, bool success, bytes reason);

    error NotForwarder();

    constructor(ICircleFactory factory_, address forwarder_, address owner_) Ownable(owner_) {
        factory = factory_;
        forwarder = forwarder_;
        emit ForwarderUpdated(forwarder_);
    }

    function setForwarder(address forwarder_) external onlyOwner {
        forwarder = forwarder_;
        emit ForwarderUpdated(forwarder_);
    }

    /// @inheritdoc IReceiver
    /// @param report abi.encode(Job[])
    function onReport(bytes calldata, bytes calldata report) external {
        if (msg.sender != forwarder) revert NotForwarder();
        Job[] memory jobs = abi.decode(report, (Job[]));
        for (uint256 i; i < jobs.length; ++i) {
            _run(jobs[i]);
        }
    }

    function _run(Job memory j) internal {
        if (!factory.isCircle(j.circle)) {
            emit JobExecuted(j.circle, j.action, false, "not a circle");
            return;
        }
        bytes memory data;
        if (j.action == Action.COLLECT) data = abi.encodeCall(Circle.collect, ());
        else if (j.action == Action.CLOSE_AUCTION) data = abi.encodeCall(Circle.closeAuction, ());
        else if (j.action == Action.PAYOUT) data = abi.encodeCall(Circle.payout, ());
        else data = abi.encodeCall(Circle.markDefault, (j.member, j.round));
        (bool ok, bytes memory ret) = j.circle.call(data);
        emit JobExecuted(j.circle, j.action, ok, ok ? bytes("") : ret);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
