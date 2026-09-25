// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {TurnTestBase} from "../utils/TurnTestBase.sol";
import {Circle} from "../../src/Circle.sol";
import {TurnAccount} from "../../src/TurnAccount.sol";
import {ITurnAccount} from "../../src/interfaces/ITurnAccount.sol";
import {CircleTypes} from "../../src/libraries/CircleTypes.sol";

contract TurnAccountTest is TurnTestBase {
    TurnAccount acct;

    function setUp() public override {
        super.setUp();
        delegate(1);
        acct = TurnAccount(payable(m[1]));
    }

    function _one(address target, bytes memory data) internal pure returns (ITurnAccount.Call[] memory calls) {
        calls = new ITurnAccount.Call[](1);
        calls[0] = ITurnAccount.Call({target: target, data: data});
    }

    function test_StorageSlotIsErc7201() public pure {
        bytes32 expected =
            keccak256(abi.encode(uint256(keccak256("turn.account.v1")) - 1)) & ~bytes32(uint256(0xff));
        assertEq(expected, 0x6c07d38f479240588ee4b6ad8c1ffacfd3cbcefe6580fc543815b31c5437a100);
    }

    function test_ImmutablesVisibleThroughDelegation() public view {
        assertEq(address(acct.token()), address(token));
        assertEq(address(acct.factory()), address(factory));
        assertEq(acct.nonce(), 0);
    }

    function test_ExecuteRelayedBatch() public {
        ITurnAccount.Call[] memory calls = _one(address(token), abi.encodeCall(token.approve, (m[5], 7)));
        uint256 deadline = vm.getBlockTimestamp() + 60;
        bytes memory sig = signBatch(1, calls, 0, deadline);
        vm.expectEmit(true, false, false, true, m[1]);
        emit ITurnAccount.Executed(0, 1);
        vm.prank(relayer);
        acct.execute(calls, 0, deadline, sig);
        assertEq(token.allowance(m[1], m[5]), 7);
        assertEq(acct.nonce(), 1);
        assertEq(relayer.balance, 0, "sanity: no value moved");

        // Replay is rejected.
        vm.prank(relayer);
        vm.expectRevert(ITurnAccount.BadNonce.selector);
        acct.execute(calls, 0, deadline, sig);
    }

    function test_ExecuteRejectsMalformedSignature() public {
        ITurnAccount.Call[] memory calls = _one(address(token), abi.encodeCall(token.approve, (m[5], 7)));
        vm.expectRevert(ITurnAccount.BadSignature.selector);
        acct.execute(calls, 0, vm.getBlockTimestamp() + 60, hex"1234");
    }

    function test_ExecuteRejectsDisallowedTargets() public {
        ITurnAccount.Call[] memory calls = _one(makeAddr("random"), "");
        uint256 deadline = vm.getBlockTimestamp() + 60;
        bytes memory sig = signBatch(1, calls, 0, deadline);
        vm.expectRevert(abi.encodeWithSelector(ITurnAccount.TargetNotAllowed.selector, makeAddr("random")));
        acct.execute(calls, 0, deadline, sig);

        // Self-calls are limited to grant management (no re-entering execute).
        calls = _one(m[1], abi.encodeCall(TurnAccount.executeSelf, (new ITurnAccount.Call[](0))));
        sig = signBatch(1, calls, 0, deadline);
        vm.expectRevert(
            abi.encodeWithSelector(ITurnAccount.SelectorNotAllowed.selector, TurnAccount.executeSelf.selector)
        );
        acct.execute(calls, 0, deadline, sig);

        calls = _one(m[1], hex"00");
        sig = signBatch(1, calls, 0, deadline);
        vm.expectRevert(abi.encodeWithSelector(ITurnAccount.SelectorNotAllowed.selector, bytes4(0)));
        acct.execute(calls, 0, deadline, sig);
    }

    function test_ExecuteBubblesFailedCall() public {
        ITurnAccount.Call[] memory calls =
            _one(address(token), abi.encodeCall(token.transfer, (m[5], START_BALANCE + 1)));
        uint256 deadline = vm.getBlockTimestamp() + 60;
        bytes memory sig = signBatch(1, calls, 0, deadline);
        bytes memory reason = abi.encodeWithSelector(
            IERC20Errors.ERC20InsufficientBalance.selector, m[1], START_BALANCE, START_BALANCE + 1
        );
        vm.expectRevert(abi.encodeWithSelector(ITurnAccount.CallFailed.selector, 0, reason));
        acct.execute(calls, 0, deadline, sig);
    }

    function test_ExecuteSelfOnlyFromTheAccount() public {
        ITurnAccount.Call[] memory calls = _one(address(token), abi.encodeCall(token.approve, (m[5], 9)));
        vm.expectRevert(ITurnAccount.OnlySelf.selector);
        acct.executeSelf(calls);
        vm.prank(m[1]); // the user sending a tx from their own EOA
        acct.executeSelf(calls);
        assertEq(token.allowance(m[1], m[5]), 9);
    }

    function test_GrantManagement() public {
        Circle c = createCircle(auctionParams(3), 0);
        vm.expectRevert(ITurnAccount.OnlySelf.selector);
        acct.grantPull(address(c), C, PERIOD, 1);
        vm.expectRevert(ITurnAccount.OnlySelf.selector);
        acct.revokePull(address(c));

        vm.prank(m[1]);
        vm.expectRevert(ITurnAccount.NotCircle.selector);
        acct.grantPull(makeAddr("notACircle"), C, PERIOD, 1);

        uint64 until = uint64(vm.getBlockTimestamp() + 1 days);
        vm.expectEmit(true, false, false, true, m[1]);
        emit ITurnAccount.PullGranted(address(c), C, PERIOD, until);
        relay(1, _one(m[1], abi.encodeCall(TurnAccount.grantPull, (address(c), C, PERIOD, until))));
        ITurnAccount.PullGrant memory g = acct.grantOf(address(c));
        assertTrue(g.active);
        assertEq(g.maxAmount, C);
        assertEq(g.validUntil, until);

        // Owner-signed revocation stops auto-pay.
        relay(1, _one(m[1], abi.encodeCall(TurnAccount.revokePull, (address(c)))));
        assertFalse(acct.grantOf(address(c)).active);
        vm.prank(address(c));
        vm.expectRevert(ITurnAccount.NoGrant.selector);
        acct.pullContribution(1, 1);
    }

    function test_PullWithinScopeAndCadence() public {
        Circle c = createCircle(auctionParams(3), 0);
        uint64 until = uint64(vm.getBlockTimestamp() + 1 days);
        relay(1, _one(m[1], abi.encodeCall(TurnAccount.grantPull, (address(c), C, PERIOD, until))));
        vm.startPrank(address(c));
        acct.pullContribution(1, C);
        vm.expectRevert(ITurnAccount.TooFrequent.selector);
        acct.pullContribution(2, C);
        vm.warp(vm.getBlockTimestamp() + PERIOD - 10); // slight jitter is tolerated on average
        vm.expectRevert(ITurnAccount.TooFrequent.selector);
        acct.pullContribution(2, C);
        vm.warp(vm.getBlockTimestamp() + 10);
        vm.expectEmit(true, true, false, true, m[1]);
        emit ITurnAccount.Pulled(address(c), 2, C);
        acct.pullContribution(2, C);
        vm.stopPrank();
        assertEq(acct.grantOf(address(c)).pulls, 2);
        assertEq(token.balanceOf(address(c)), C + 2 * C);
    }

    function test_ReentrantPullDuringExecuteFailsSafely() public {
        Circle c = createCircle(auctionParams(3), 1); // m0, m1 (allowance-based)
        uint64 until = uint64(vm.getBlockTimestamp() + 1 days);
        delegate(3);
        ITurnAccount.Call[] memory calls = new ITurnAccount.Call[](3);
        calls[0] = call_(address(token), abi.encodeCall(token.approve, (address(c), C)));
        calls[1] = call_(address(c), abi.encodeCall(Circle.join, (SECRET, INR)));
        calls[2] = call_(m[3], abi.encodeCall(TurnAccount.grantPull, (address(c), C, PERIOD, until)));
        relay(3, calls);
        assertEq(uint8(c.status()), uint8(CircleTypes.Status.ACTIVE));

        // Inside a batch the account is locked, so a circle pull re-entering it fails and m3 is marked late.
        calls = _one(address(c), abi.encodeCall(Circle.collectFrom, (m[3])));
        relay(3, calls);
        assertTrue(c.failedThisRound(1, m[3]));
        // Outside a batch the pull works.
        c.collectFrom(m[3]);
        assertEq(uint8(c.payState(1, m[3])), uint8(CircleTypes.PayState.PAID));
    }

    function test_Erc1271() public view {
        bytes32 h = keccak256("hello");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk[1], h);
        assertEq(acct.isValidSignature(h, abi.encodePacked(r, s, v)), IERC1271.isValidSignature.selector);
        (v, r, s) = vm.sign(pk[2], h);
        assertEq(acct.isValidSignature(h, abi.encodePacked(r, s, v)), bytes4(0xffffffff));
        assertEq(acct.isValidSignature(h, hex"00"), bytes4(0xffffffff));
    }

    function test_ReceivesMon() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = m[1].call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(m[1].balance, 1 ether);
    }

    function test_DomainIsBoundToTheUserAccount() public {
        // A signature made for m1's account doesn't validate on m2's account.
        delegate(2);
        ITurnAccount.Call[] memory calls = _one(address(token), abi.encodeCall(token.approve, (m[5], 7)));
        uint256 deadline = vm.getBlockTimestamp() + 60;
        bytes memory sig = signBatch(1, calls, 0, deadline);
        vm.expectRevert(ITurnAccount.BadSignature.selector);
        TurnAccount(payable(m[2])).execute(calls, 0, deadline, sig);
        assertTrue(acct.hashCalls(calls, 0, deadline) != TurnAccount(payable(m[2])).hashCalls(calls, 0, deadline));
    }
}
