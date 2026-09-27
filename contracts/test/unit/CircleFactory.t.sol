// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {TurnTestBase} from "../utils/TurnTestBase.sol";
import {Circle} from "../../src/Circle.sol";
import {CircleFactory} from "../../src/CircleFactory.sol";
import {ICircleFactory} from "../../src/interfaces/ICircleFactory.sol";
import {CircleTypes} from "../../src/libraries/CircleTypes.sol";

contract CircleFactoryTest is TurnTestBase {
    function test_ConstructorWiring() public view {
        assertEq(address(factory.token()), address(token));
        assertEq(factory.implementation(), address(impl));
        assertEq(registry.factory(), address(factory));
        assertEq(factory.owner(), owner);
        assertEq(factory.maxContribution(), 1_000e6);
        assertEq(factory.maxMembers(), 20);
    }

    function test_ConstructorRejectsBadLimits() public {
        vm.expectRevert(ICircleFactory.InvalidParams.selector);
        new CircleFactory(token, address(impl), owner, 0, 10);
        vm.expectRevert(ICircleFactory.InvalidParams.selector);
        new CircleFactory(token, address(impl), owner, 25e6, 2);
        vm.expectRevert(ICircleFactory.InvalidParams.selector);
        new CircleFactory(token, address(impl), owner, 25e6, 21);
    }

    function test_CreateCircleSeatsCreatorAndRegisters() public {
        address predicted = factory.predictCircleAddress(m[0]);
        vm.prank(m[0]);
        token.approve(predicted, C);
        vm.expectEmit(true, true, false, false, address(factory));
        emit ICircleFactory.CircleCreated(predicted, m[0], auctionParams(5), bytes32(0));
        vm.prank(m[0]);
        address c = factory.createCircle(auctionParams(5), bytes32(0), INR);
        assertEq(c, predicted);
        assertTrue(factory.isCircle(c));
        assertTrue(registry.isAuthorized(c));
        assertEq(factory.circleCount(), 1);
        assertEq(factory.allCircles(0), c);
        assertEq(Circle(c).members()[0], m[0]);
        assertEq(Circle(c).creator(), m[0]);
        assertEq(token.balanceOf(c), C);
        // Next circle from the same creator gets a new address.
        assertTrue(factory.predictCircleAddress(m[0]) != c);
    }

    function test_CreateCircleValidatesParams() public {
        CircleTypes.Params memory p;

        p = auctionParams(2);
        _expectInvalid(p);
        p = auctionParams(21);
        _expectInvalid(p);
        p = auctionParams(5);
        p.contribution = 0;
        _expectInvalid(p);
        p = auctionParams(5);
        p.contribution = 1_001e6;
        _expectInvalid(p);
        p = auctionParams(5);
        p.period = 59;
        _expectInvalid(p);
        p = auctionParams(5);
        p.entryDeposit = C - 1;
        _expectInvalid(p);
        p = auctionParams(5);
        p.reserveBps = 10_001;
        _expectInvalid(p);
        p = auctionParams(5);
        p.maxDiscountBps = 5_001;
        _expectInvalid(p);
        p = auctionParams(5);
        p.bidWindow = 250;
        p.gracePeriod = 50; // 250 + 50 >= 300
        _expectInvalid(p);
        p = auctionParams(5);
        p.bidWindow = 0; // auction needs a bid window
        _expectInvalid(p);
        p = fixedParams(5);
        p.bidWindow = 10; // fixed order has none
        _expectInvalid(p);
        p = fixedParams(5);
        p.maxDiscountBps = 100;
        _expectInvalid(p);
    }

    function _expectInvalid(CircleTypes.Params memory p) internal {
        vm.prank(m[0]);
        vm.expectRevert(ICircleFactory.InvalidParams.selector);
        factory.createCircle(p, bytes32(0), INR);
    }

    function test_MaxMembersLimit() public {
        vm.prank(owner);
        factory.setLimits(25e6, 10);
        CircleTypes.Params memory p = auctionParams(11);
        p.contribution = 25e6;
        p.entryDeposit = 25e6;
        _expectInvalid(p);
        p = auctionParams(10);
        _expectInvalid(p); // contribution 100 > 25 cap
    }

    function test_SetLimitsOnlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        factory.setLimits(1, 5);
        vm.expectEmit(false, false, false, true, address(factory));
        emit ICircleFactory.LimitsUpdated(25e6, 10);
        vm.prank(owner);
        factory.setLimits(25e6, 10);
        assertEq(factory.maxContribution(), 25e6);
        assertEq(factory.maxMembers(), 10);
    }

    function test_PauseBlocksCreateAndJoinOnly() public {
        Circle c = createCircle(auctionParams(3), 1);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        factory.pause();
        vm.prank(owner);
        factory.pause();
        assertTrue(factory.paused());

        vm.prank(m[5]);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        factory.createCircle(auctionParams(3), bytes32(0), INR);

        vm.prank(m[2]);
        token.approve(address(c), C);
        vm.prank(m[2]);
        vm.expectRevert(Circle.Paused.selector);
        c.join(SECRET, INR);

        // Existing members can still leave (withdraw) while paused.
        vm.prank(m[1]);
        c.leave();

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        factory.unpause();
        vm.prank(owner);
        factory.unpause();
        joinAs(c, m[2]);
    }

    function test_PauseNeverBlocksRunningCircles() public {
        Circle c = fullCircle(fixedParams(3));
        vm.prank(owner);
        factory.pause();
        runRound(c);
        runRound(c);
        runRound(c);
        assertEq(uint8(c.status()), uint8(CircleTypes.Status.COMPLETED));
        claimAll(c);
        assertEq(token.balanceOf(address(c)), 0);
    }
}
