// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TurnTestBase} from "../utils/TurnTestBase.sol";
import {Circle} from "../../src/Circle.sol";
import {TurnAccount} from "../../src/TurnAccount.sol";
import {ITurnAccount} from "../../src/interfaces/ITurnAccount.sol";
import {CircleTypes} from "../../src/libraries/CircleTypes.sol";

/// @notice End-to-end scenarios from the build spec (section 5, "Scenario tests").
contract ScenariosTest is TurnTestBase {
    mapping(address => uint256) internal ownDiscount;

    function _payoutAndTrack(Circle c) internal {
        uint256 r = c.currentRound();
        uint256 pot = c.roundPot();
        c.payout();
        Circle.Round memory rd = c.roundInfo(r);
        ownDiscount[rd.winner] += (pot * rd.discountBps) / 10_000;
    }

    function _netOf(address who) internal view returns (int256) {
        return int256(token.balanceOf(who)) - int256(START_BALANCE);
    }

    function _assertConservation(uint256 n) internal view {
        int256 total;
        for (uint256 i; i < n; ++i) {
            total += _netOf(m[i]);
        }
        assertEq(total, 0, "tokens created or lost");
    }

    // -------------------------------------------------------------------------------------------
    // 1. Happy path, N=5, AUCTION
    // -------------------------------------------------------------------------------------------

    function test_Scenario1_HappyPathAuction() public {
        Circle c = fullCircle(auctionParams(5));
        checkAll(c);

        // Round 1: m1 bids 10%, m2 bids 20% -> m2 wins.
        warpToRoundStart(c);
        c.collect();
        bidAs(c, m[1], 1_000);
        bidAs(c, m[2], 2_000);
        warpPastBidWindow(c);
        c.closeAuction();
        assertEq(c.roundInfo(1).winner, m[2]);

        uint256 before = token.balanceOf(m[2]);
        _payoutAndTrack(c);
        // pot 500, discount 100 -> 20 to reserve, 80 shared (20 each). Winner owes 400 more, has deposit 100,
        // no trust: collateral 400 withheld -> net payout 400 + 100 - 400 = 100.
        assertEq(token.balanceOf(m[2]) - before, 100e6);
        assertEq(c.memberInfo(m[2]).collateral, 400e6);
        assertEq(c.memberInfo(m[0]).credit, 20e6);
        assertEq(c.reserveBalance(), 20e6);
        checkAll(c);

        // Round 2: credits offset contributions; m2's collateral is released pro-rata.
        warpToRoundStart(c);
        uint256 m0Before = token.balanceOf(m[0]);
        c.collect();
        assertEq(m0Before - token.balanceOf(m[0]), 80e6, "credit offsets contribution");
        assertEq(c.memberInfo(m[2]).collateral, 300e6);
        assertEq(c.memberInfo(m[2]).withdrawable, 100e6);
        bidAs(c, m[4], 500);
        warpPastBidWindow(c);
        c.closeAuction();
        _payoutAndTrack(c);
        checkAll(c);

        // Rounds 3-5: a mix of bids and no bids.
        warpToRoundStart(c);
        c.collect();
        bidAs(c, m[1], 1_500);
        vm.warp(vm.getBlockTimestamp() + 1);
        bidAs(c, m[0], 1_500); // tie -> the earlier bid (m1) wins
        warpPastBidWindow(c);
        c.closeAuction();
        assertEq(c.roundInfo(3).winner, m[1]);
        _payoutAndTrack(c);
        checkAll(c);

        runRound(c); // nobody bids; equal scores -> join order among m0, m3
        assertEq(c.roundInfo(4).winner, m[0]);
        checkAll(c);

        warpToRoundStart(c);
        c.collect();
        warpPastBidWindow(c);
        c.closeAuction();
        assertEq(c.roundInfo(5).winner, m[3], "last member receives");
        assertEq(c.roundInfo(5).discountBps, 0, "final round: full pot");
        _payoutAndTrack(c);

        assertEq(uint8(c.status()), uint8(CircleTypes.Status.COMPLETED));
        claimAll(c);
        assertEq(token.balanceOf(address(c)), 0, "circle fully drained");
        _assertConservation(5);
        for (uint256 i; i < 5; ++i) {
            assertGe(_netOf(m[i]) + int256(ownDiscount[m[i]]), 0, "I2: member worse off than own discount");
            assertEq(registry.recordOf(m[i]).circlesCompleted, 1);
            assertEq(registry.recordOf(m[i]).paymentsOnTime, 5);
        }
    }

    // -------------------------------------------------------------------------------------------
    // 2. Round-1 winner defaults in round 3
    // -------------------------------------------------------------------------------------------

    function test_Scenario2_WinnerDefaultsRound3() public {
        Circle c = fullCircle(fixedParams(5));
        runRound(c); // m0 wins r1
        assertEq(c.memberInfo(m[0]).collateral, 400e6);
        runRound(c); // m1 wins r2; m0's collateral -> 300
        assertEq(c.memberInfo(m[0]).collateral, 300e6);

        stopPaying(c, m[0]);
        warpToRoundStart(c);
        c.collect();
        assertTrue(c.failedThisRound(3, m[0]));
        (Circle.NextAction a, address who) = c.nextAction();
        // Before grace the missed payment isn't actionable yet; the (fixed-order) auction can already close.
        assertEq(uint8(a), uint8(Circle.NextAction.CLOSE_AUCTION));
        warpPastGrace(c);
        (a, who) = c.nextAction();
        assertEq(uint8(a), uint8(Circle.NextAction.MARK_DEFAULT));
        assertEq(who, m[0]);
        c.markDefault(m[0], 3);
        assertEq(c.memberInfo(m[0]).collateral, 200e6, "covered from collateral");
        assertEq(c.reserveBalance(), 0, "reserve untouched");
        checkAll(c);

        c.closeAuction();
        uint256 pot = c.roundPot();
        assertEq(pot, 500e6, "others still receive the full pot");
        c.payout();
        checkAll(c);

        resumePaying(c, m[0]);
        runRound(c);
        runRound(c);
        assertEq(uint8(c.status()), uint8(CircleTypes.Status.COMPLETED));
        claimAll(c);
        _assertConservation(5);
        for (uint256 i = 1; i < 5; ++i) {
            assertGe(_netOf(m[i]), 0);
        }
        assertEq(registry.recordOf(m[0]).defaults, 1);
    }

    // -------------------------------------------------------------------------------------------
    // 3. Non-winner misses twice and is ejected (worked example in docs/economics.md)
    // -------------------------------------------------------------------------------------------

    function test_Scenario3_NonWinnerEjected() public {
        Circle c = fullCircle(fixedParams(5));
        address e = m[4];
        runRound(c); // m0 wins r1

        // Round 2: E misses; the deposit covers it.
        stopPaying(c, e);
        warpToRoundStart(c);
        c.collect();
        warpPastGrace(c);
        c.markDefault(e, 2);
        assertEq(c.memberInfo(e).deposit, 0);
        assertEq(c.memberInfo(e).misses, 1);
        c.closeAuction();
        c.payout(); // m1 wins r2 with the full 500 pot
        checkAll(c);

        // Round 3: E misses again -> ejected. This is the first post-ejection round.
        warpToRoundStart(c);
        c.collect();
        warpPastGrace(c);
        c.markDefault(e, 3);
        assertEq(uint8(c.memberInfo(e).state), uint8(CircleTypes.MemberState.EJECTED));
        assertEq(c.totalRounds(), 4);
        assertEq(c.activeCount(), 4);
        assertEq(c.memberInfo(m[0]).repayOwed, C, "r1 winner owes C back");
        assertEq(c.memberInfo(m[1]).repayOwed, C, "r2 winner owes C back");
        assertEq(c.memberInfo(e).fundedRounds, 2, "k counts the deposit-funded round");
        checkAll(c);

        c.closeAuction();
        assertEq(c.roundPot(), 400e6, "ejection round pot = (N-1) x C");
        c.payout(); // m2
        runRound(c); // m3, last regular round
        assertFalse(uint8(c.status()) == uint8(CircleTypes.Status.COMPLETED));
        assertTrue(c.inSettlement());
        checkAll(c);

        // Settlement slot, where round 5 would have run.
        assertEq(roundStart(c), c.startTime() + 4 * PERIOD);
        warpToRoundStart(c);
        c.collect();
        assertEq(c.refundPool(), 180e6);
        c.payout();
        assertEq(uint8(c.status()), uint8(CircleTypes.Status.COMPLETED));
        assertEq(c.memberInfo(e).withdrawable, 180e6, "refund = k x C x 0.9");

        claimAll(c);
        assertEq(token.balanceOf(address(c)), 0);
        _assertConservation(5);
        assertEq(_netOf(e), -20e6, "ejected member loses the 10% penalty");
        for (uint256 i; i < 4; ++i) {
            assertEq(_netOf(m[i]), 5e6, "penalty shared by the others");
        }
    }

    // -------------------------------------------------------------------------------------------
    // 4. Nobody bids
    // -------------------------------------------------------------------------------------------

    function test_Scenario4_NobodyBids() public {
        giveHistory(m[3], 1, 10, 0, 0); // best score
        giveHistory(m[1], 1, 5, 5, 0);
        Circle c = fullCircle(auctionParams(5));
        warpToRoundStart(c);
        c.collect();
        warpPastBidWindow(c);
        vm.expectEmit(true, true, false, true, address(c));
        emit Circle.AuctionClosed(1, m[3], 0, true);
        c.closeAuction();
        c.payout();

        // Round 2: m1 (next best score) wins over m0/m2/m4 (score 0).
        runRound(c);
        assertEq(c.roundInfo(2).winner, m[1]);
        // Round 3: all scores 0 -> join order.
        runRound(c);
        assertEq(c.roundInfo(3).winner, m[0]);
        checkAll(c);
    }

    // -------------------------------------------------------------------------------------------
    // 5. Strong history -> reduced collateral (bounded by the reserve), plus deposit rebate
    // -------------------------------------------------------------------------------------------

    function test_Scenario5_TrustedMemberReducedCollateral() public {
        giveHistory(m[3], 4, 20, 0, 0);
        assertEq(registry.trustBps(m[3]), 8_000);
        Circle c = fullCircle(auctionParams(5));

        // Round 1: m0 wins at 30%. Reserve gets 30; m3's deposit is partly rebated against it.
        warpToRoundStart(c);
        c.collect();
        bidAs(c, m[0], 3_000);
        warpPastBidWindow(c);
        c.closeAuction();
        c.payout();
        assertEq(c.reserveBalance(), 30e6);
        assertEq(c.memberInfo(m[3]).rebated, 30e6, "rebate limited by the reserve");
        assertEq(c.memberInfo(m[3]).deposit, 70e6);
        (uint256 bal, uint256 exp) = c.reserve();
        assertEq(exp, bal, "budget fully used, never exceeded");
        checkAll(c);

        // Round 2: trusted m3 wins. Desired waiver 80% of 300 = 240, but only 30 is available.
        warpToRoundStart(c);
        c.collect();
        bidAs(c, m[3], 3_000);
        warpPastBidWindow(c);
        c.closeAuction();
        c.payout();
        assertEq(c.memberInfo(m[3]).collateral, 270e6, "300 owed - 30 waived");
        assertEq(c.memberInfo(m[3]).rebated, 0);
        checkAll(c);

        // An untrusted winner in the same position would lock the full 300.
        runRound(c); // m1 (join order among untrusted, no bids)
        assertEq(c.memberInfo(m[1]).collateral, 200e6, "untrusted: full remaining debt (200)");
        checkAll(c);
    }

    // 5b. The trusted winner stops paying: collateral first, then the reserve. Others are never short.
    function test_Scenario5b_TrustedWinnerDefaultCoveredByReserve() public {
        giveHistory(m[3], 4, 20, 0, 0);
        Circle c = fullCircle(auctionParams(5));
        warpToRoundStart(c);
        c.collect();
        bidAs(c, m[0], 3_000);
        warpPastBidWindow(c);
        c.closeAuction();
        c.payout();
        warpToRoundStart(c);
        c.collect();
        bidAs(c, m[3], 3_000);
        warpPastBidWindow(c);
        c.closeAuction();
        c.payout();
        assertEq(c.memberInfo(m[3]).collateral, 270e6);

        stopPaying(c, m[3]);
        uint256 reserveUsed;
        for (uint256 r = 3; r <= 5; ++r) {
            warpToRoundStart(c);
            c.collect();
            warpPastGrace(c);
            uint256 reserveBefore = c.reserveBalance();
            c.markDefault(m[3], r);
            checkAll(c);
            warpPastBidWindow(c);
            c.closeAuction();
            assertEq(c.roundPot(), 500e6, "pot always full");
            reserveUsed += reserveBefore - c.reserveBalance();
            c.payout();
            checkAll(c);
        }
        assertEq(reserveUsed, 30e6, "reserve paid exactly the waived part");
        assertEq(registry.recordOf(m[3]).defaults, 3);
        claimAll(c);
        _assertConservation(5);
    }

    // -------------------------------------------------------------------------------------------
    // 6 & 7. Gasless join via relayed batch, auto-pay via pull grant, and rejected signatures/scopes
    // -------------------------------------------------------------------------------------------

    function test_Scenario6_GaslessJoinAndAutoPay() public {
        CircleTypes.Params memory p = auctionParams(3);
        // Creator (m0) is delegated and creates + joins + grants in ONE relayed batch.
        delegate(0);
        delegate(1);
        delegate(2);
        address predicted = factory.predictCircleAddress(m[0]);
        uint64 validUntil = uint64(block.timestamp + 30 days);
        ITurnAccount.Call[] memory calls = new ITurnAccount.Call[](3);
        calls[0] = call_(address(token), abi.encodeCall(token.approve, (predicted, C)));
        calls[1] = call_(
            address(factory),
            abi.encodeCall(factory.createCircle, (p, keccak256(abi.encodePacked(SECRET)), INR))
        );
        calls[2] = call_(m[0], abi.encodeCall(TurnAccount.grantPull, (predicted, C, PERIOD, validUntil)));
        relay(0, calls);
        Circle c = Circle(predicted);

        for (uint256 i = 1; i < 3; ++i) {
            calls[0] = call_(address(token), abi.encodeCall(token.approve, (predicted, C)));
            calls[1] = call_(predicted, abi.encodeCall(Circle.join, (SECRET, INR)));
            calls[2] = call_(m[i], abi.encodeCall(TurnAccount.grantPull, (predicted, C, PERIOD, validUntil)));
            relay(i, calls);
        }
        assertEq(uint8(c.status()), uint8(CircleTypes.Status.ACTIVE));
        // Allowances are used up by the deposit: contributions can only come from the pull grant.
        assertEq(token.allowance(m[1], predicted), 0);

        // No member signs anything from here on: the keeper drives every round.
        for (uint256 r = 1; r <= 3; ++r) {
            warpToRoundStart(c);
            c.collect();
            for (uint256 i; i < 3; ++i) {
                assertEq(uint8(c.payState(r, m[i])), uint8(CircleTypes.PayState.PAID));
            }
            warpPastBidWindow(c);
            c.closeAuction();
            c.payout();
            checkAll(c);
        }
        assertEq(uint8(c.status()), uint8(CircleTypes.Status.COMPLETED));
        assertEq(TurnAccount(payable(m[1])).grantOf(predicted).pulls, 3);
    }

    function test_Scenario6_InvalidOrExpiredSignatureRejected() public {
        delegate(1);
        ITurnAccount.Call[] memory calls = new ITurnAccount.Call[](1);
        calls[0] = call_(address(token), abi.encodeCall(token.approve, (relayer, 1)));
        TurnAccount acct = TurnAccount(payable(m[1]));

        // Signed by the wrong key.
        uint256 deadline = block.timestamp + 60;
        bytes32 digest = acct.hashCalls(calls, 0, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk[2], digest);
        vm.prank(relayer);
        vm.expectRevert(ITurnAccount.BadSignature.selector);
        acct.execute(calls, 0, deadline, abi.encodePacked(r, s, v));

        // Valid signature, but expired.
        bytes memory sig = signBatch(1, calls, 0, deadline);
        vm.warp(deadline + 1);
        vm.prank(relayer);
        vm.expectRevert(ITurnAccount.Expired.selector);
        acct.execute(calls, 0, deadline, sig);

        // Tampered calls. (vm.getBlockTimestamp: via-IR may cache block.timestamp across a warp.)
        deadline = vm.getBlockTimestamp() + 60;
        sig = signBatch(1, calls, 0, deadline);
        calls[0] = call_(address(token), abi.encodeCall(token.approve, (relayer, type(uint256).max)));
        vm.prank(relayer);
        vm.expectRevert(ITurnAccount.BadSignature.selector);
        acct.execute(calls, 0, deadline, sig);
    }

    function test_Scenario7_SessionOutOfScopeRejected() public {
        CircleTypes.Params memory p = auctionParams(3);
        Circle c = createCircle(p, 1);
        delegate(2);
        uint64 validUntil = uint64(block.timestamp + 1 days);
        ITurnAccount.Call[] memory calls = new ITurnAccount.Call[](3);
        calls[0] = call_(address(token), abi.encodeCall(token.approve, (address(c), C)));
        calls[1] = call_(address(c), abi.encodeCall(Circle.join, (SECRET, INR)));
        // Grant is deliberately too small: 50 per pull.
        calls[2] = call_(m[2], abi.encodeCall(TurnAccount.grantPull, (address(c), 50e6, PERIOD, validUntil)));
        relay(2, calls);

        // Amount above scope: the circle's pull fails and m2 is marked late (never overcharged).
        warpToRoundStart(c);
        uint256 before = token.balanceOf(m[2]);
        c.collect();
        assertEq(token.balanceOf(m[2]), before, "nothing pulled beyond scope");
        assertTrue(c.failedThisRound(1, m[2]));

        // Direct scope checks on the account.
        TurnAccount acct = TurnAccount(payable(m[2]));
        vm.prank(address(c));
        vm.expectRevert(ITurnAccount.AmountTooHigh.selector);
        acct.pullContribution(1, C);

        vm.prank(address(c));
        acct.pullContribution(1, 50e6);
        vm.prank(address(c));
        vm.expectRevert(ITurnAccount.RoundNotNew.selector);
        acct.pullContribution(1, 50e6);
        vm.prank(address(c));
        vm.expectRevert(ITurnAccount.TooFrequent.selector);
        acct.pullContribution(2, 50e6);

        vm.warp(uint256(validUntil) + 1);
        vm.prank(address(c));
        vm.expectRevert(ITurnAccount.GrantExpired.selector);
        acct.pullContribution(3, 50e6);

        // A contract that isn't a Turn circle has no grant.
        vm.prank(relayer);
        vm.expectRevert(ITurnAccount.NoGrant.selector);
        acct.pullContribution(9, 1);
    }

    // -------------------------------------------------------------------------------------------
    // Edge: the ejected member was the last one still to receive -> the round becomes a settlement slot
    // -------------------------------------------------------------------------------------------

    function test_Edge_EjectLastRecipientCancelsRound() public {
        Circle c = fullCircle(fixedParams(3));
        address e = m[2];
        runRound(c); // m0
        stopPaying(c, e);
        warpToRoundStart(c);
        c.collect();
        warpPastGrace(c);
        c.markDefault(e, 2); // deposit covers
        c.closeAuction();
        c.payout(); // m1

        // Round 3: only e is left to receive, and misses again.
        warpToRoundStart(c);
        c.collect(); // m0, m1 pay
        warpPastGrace(c);
        c.markDefault(e, 3);
        assertTrue(c.inSettlement());
        assertEq(c.memberInfo(m[0]).repayOwed, 0, "round-3 payment applied to the repayment");
        assertEq(c.memberInfo(m[1]).repayOwed, 0);
        assertEq(c.refundPool(), 180e6);
        checkAll(c);
        c.payout();
        assertEq(uint8(c.status()), uint8(CircleTypes.Status.COMPLETED));
        claimAll(c);
        _assertConservation(3);
        assertEq(_netOf(e), -20e6);
        assertEq(_netOf(m[0]), 10e6);
        assertEq(_netOf(m[1]), 10e6);
    }

    // Edge: the ejected member had won the (closed) auction -> the next best bid wins instead.
    function test_Edge_EjectedAuctionWinnerIsReplaced() public {
        Circle c = fullCircle(auctionParams(5));
        address e = m[4];
        runRound(c); // m0 (no bids, join order)
        stopPaying(c, e);
        warpToRoundStart(c);
        c.collect();
        warpPastGrace(c);
        c.markDefault(e, 2);
        warpPastBidWindow(c);
        c.closeAuction();
        c.payout();

        warpToRoundStart(c);
        c.collect();
        bidAs(c, e, 1_000);
        bidAs(c, m[2], 500);
        warpPastBidWindow(c);
        c.closeAuction();
        assertEq(c.roundInfo(3).winner, e);
        c.markDefault(e, 3);
        assertEq(c.roundInfo(3).winner, m[2], "next-best bid takes the round");
        c.payout();
        checkAll(c);
    }
}
