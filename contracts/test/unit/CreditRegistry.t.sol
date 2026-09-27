// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CreditRegistry} from "../../src/CreditRegistry.sol";
import {ICreditRegistry} from "../../src/interfaces/ICreditRegistry.sol";

contract CreditRegistryTest is Test {
    CreditRegistry reg;
    address factory = makeAddr("factory");
    address circle = makeAddr("circle");
    address alice = makeAddr("alice");

    function setUp() public {
        reg = new CreditRegistry(factory);
    }

    function test_OnlyFactoryAuthorizes() public {
        vm.expectRevert(ICreditRegistry.NotFactory.selector);
        reg.authorize(circle);

        vm.expectEmit(true, false, false, false, address(reg));
        emit ICreditRegistry.CircleAuthorized(circle);
        vm.prank(factory);
        reg.authorize(circle);
        assertTrue(reg.isAuthorized(circle));
        assertEq(reg.factory(), factory);
    }

    function test_UnauthorizedWritersRevert() public {
        vm.startPrank(circle);
        vm.expectRevert(ICreditRegistry.NotAuthorizedCircle.selector);
        reg.onJoined(alice);
        vm.expectRevert(ICreditRegistry.NotAuthorizedCircle.selector);
        reg.onPayment(alice, 1, true);
        vm.expectRevert(ICreditRegistry.NotAuthorizedCircle.selector);
        reg.onDefault(alice);
        vm.expectRevert(ICreditRegistry.NotAuthorizedCircle.selector);
        reg.onCompleted(alice);
        vm.stopPrank();
    }

    function test_RecordsAccumulate() public {
        vm.prank(factory);
        reg.authorize(circle);
        vm.startPrank(circle);
        reg.onJoined(alice);
        reg.onPayment(alice, 100e6, true);
        reg.onPayment(alice, 100e6, false);
        reg.onDefault(alice);
        reg.onCompleted(alice);
        vm.stopPrank();

        ICreditRegistry.Record memory r = reg.recordOf(alice);
        assertEq(r.circlesJoined, 1);
        assertEq(r.circlesCompleted, 1);
        assertEq(r.paymentsOnTime, 1);
        assertEq(r.paymentsLate, 1);
        assertEq(r.defaults, 1);
        assertEq(r.totalContributed, 200e6);
        // views delegate to TrustMath
        assertEq(reg.trustBps(alice), 0);
        assertEq(reg.score(alice), 0);
    }

    function test_RecordUpdatedEvent() public {
        vm.prank(factory);
        reg.authorize(circle);
        ICreditRegistry.Record memory expected;
        expected.circlesJoined = 1;
        vm.expectEmit(true, false, false, true, address(reg));
        emit ICreditRegistry.RecordUpdated(alice, expected);
        vm.prank(circle);
        reg.onJoined(alice);
    }
}
