// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {TurnTestBase} from "../utils/TurnTestBase.sol";
import {Circle} from "../../src/Circle.sol";
import {TurnKeeper} from "../../src/TurnKeeper.sol";
import {IReceiver} from "../../src/interfaces/IReceiver.sol";
import {CircleTypes} from "../../src/libraries/CircleTypes.sol";

contract TurnKeeperTest is TurnTestBase {
    TurnKeeper keeper;
    address forwarder = makeAddr("forwarder");

    function setUp() public override {
        super.setUp();
        keeper = new TurnKeeper(factory, forwarder, owner);
    }

    function _report(TurnKeeper.Job[] memory jobs) internal pure returns (bytes memory) {
        return abi.encode(jobs);
    }

    function _job(Circle c, TurnKeeper.Action a) internal pure returns (TurnKeeper.Job memory) {
        return TurnKeeper.Job({circle: address(c), action: a, member: address(0), round: 0});
    }

    function test_OnlyForwarder() public {
        vm.expectRevert(TurnKeeper.NotForwarder.selector);
        keeper.onReport("", _report(new TurnKeeper.Job[](0)));
    }

    function test_DrivesAFullRoundThroughReports() public {
        Circle c = fullCircle(auctionParams(3));
        TurnKeeper.Job[] memory jobs = new TurnKeeper.Job[](1);

        jobs[0] = _job(c, TurnKeeper.Action.COLLECT);
        vm.prank(forwarder);
        keeper.onReport("", _report(jobs));
        assertEq(uint8(c.payState(1, m[0])), uint8(CircleTypes.PayState.PAID));

        warpPastBidWindow(c);
        jobs = new TurnKeeper.Job[](2);
        jobs[0] = _job(c, TurnKeeper.Action.CLOSE_AUCTION);
        jobs[1] = _job(c, TurnKeeper.Action.PAYOUT);
        vm.prank(forwarder);
        keeper.onReport("", _report(jobs));
        assertEq(c.currentRound(), 2);
    }

    function test_MarkDefaultJobAndFailuresDontBlock() public {
        Circle c = fullCircle(fixedParams(3));
        stopPaying(c, m[2]);
        c.collect();
        warpPastGrace(c);

        TurnKeeper.Job[] memory jobs = new TurnKeeper.Job[](3);
        jobs[0] = TurnKeeper.Job({
            circle: makeAddr("fake"), action: TurnKeeper.Action.PAYOUT, member: address(0), round: 0
        });
        jobs[1] = _job(c, TurnKeeper.Action.PAYOUT); // fails: unresolved
        jobs[2] = TurnKeeper.Job({
            circle: address(c), action: TurnKeeper.Action.MARK_DEFAULT, member: m[2], round: 1
        });

        vm.expectEmit(true, false, false, true, address(keeper));
        emit TurnKeeper.JobExecuted(makeAddr("fake"), TurnKeeper.Action.PAYOUT, false, "not a circle");
        vm.expectEmit(true, false, false, true, address(keeper));
        emit TurnKeeper.JobExecuted(
            address(c), TurnKeeper.Action.PAYOUT, false, abi.encodeWithSelector(Circle.Unresolved.selector)
        );
        vm.expectEmit(true, false, false, true, address(keeper));
        emit TurnKeeper.JobExecuted(address(c), TurnKeeper.Action.MARK_DEFAULT, true, "");
        vm.prank(forwarder);
        keeper.onReport("", _report(jobs));
        assertEq(uint8(c.payState(1, m[2])), uint8(CircleTypes.PayState.COVERED));
    }

    function test_SetForwarderOnlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        keeper.setForwarder(address(1));
        vm.prank(owner);
        keeper.setForwarder(address(1));
        assertEq(keeper.forwarder(), address(1));
    }

    function test_SupportsInterface() public view {
        assertTrue(keeper.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(keeper.supportsInterface(type(IERC165).interfaceId));
        assertFalse(keeper.supportsInterface(0xdeadbeef));
    }
}
