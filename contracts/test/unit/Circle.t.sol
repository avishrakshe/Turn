// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import {TurnTestBase} from "../utils/TurnTestBase.sol";
import {ContractMember, QuirkyToken} from "../utils/Mocks.sol";
import {Circle} from "../../src/Circle.sol";
import {CircleFactory} from "../../src/CircleFactory.sol";
import {CreditRegistry} from "../../src/CreditRegistry.sol";
import {ICreditRegistry} from "../../src/interfaces/ICreditRegistry.sol";
import {CircleTypes} from "../../src/libraries/CircleTypes.sol";

contract CircleTest is TurnTestBase {
    // -------------------------------------------------------------------------------------------
    // Initialization
    // -------------------------------------------------------------------------------------------

    function test_ImplementationAndClonesCannotBeReinitialized() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        impl.initialize(auctionParams(3), bytes32(0), address(this), token, registry);

        Circle c = createCircle(auctionParams(3), 0);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        c.initialize(auctionParams(3), bytes32(0), address(this), token, registry);
        assertEq(address(c.factory()), address(factory));
        assertEq(address(c.token()), address(token));
        assertEq(address(c.registry()), address(registry));
        assertEq(c.params().n, 3);
        assertEq(c.inviteHash(), keccak256(abi.encodePacked(SECRET)));
    }

    // -------------------------------------------------------------------------------------------
    // Joining & leaving
    // -------------------------------------------------------------------------------------------

    function test_JoinPullsDepositAndStartsWhenFull() public {
        Circle c = createCircle(auctionParams(3), 1);
        assertEq(uint8(c.status()), uint8(CircleTypes.Status.FORMING));
        vm.prank(m[2]);
        token.approve(address(c), C);
        vm.expectEmit(true, false, false, true, address(c));
        emit Circle.Joined(m[2], C, INR);
        vm.prank(m[2]);
        c.join(SECRET, INR);
        assertEq(uint8(c.status()), uint8(CircleTypes.Status.ACTIVE));
        assertEq(c.currentRound(), 1);
        assertEq(c.totalRounds(), 3);
        assertEq(c.activeCount(), 3);
        assertEq(c.startTime(), vm.getBlockTimestamp());
        assertEq(token.balanceOf(address(c)), 3 * C);
        assertEq(registry.recordOf(m[1]).circlesJoined, 1);
        assertEq(c.potTarget(), 3 * C);
        checkAll(c);
    }

    function test_JoinReverts() public {
        Circle c = createCircle(auctionParams(3), 1);
        vm.prank(m[2]);
        token.approve(address(c), C);

        vm.prank(m[2]);
        vm.expectRevert(Circle.BadInvite.selector);
        c.join(bytes32("wrong"), INR);

        vm.prank(m[1]);
        vm.expectRevert(Circle.AlreadyMember.selector);
        c.join(SECRET, INR);

        vm.expectRevert(Circle.NotFactory.selector);
        c.joinFor(m[2], INR);

        joinAs(c, m[2]);
        vm.prank(m[3]);
        vm.expectRevert(Circle.WrongStatus.selector);
        c.join(SECRET, INR);
    }

    function test_OpenCircleNeedsNoInvite() public {
        address predicted = factory.predictCircleAddress(m[0]);
        vm.prank(m[0]);
        token.approve(predicted, C);
        vm.prank(m[0]);
        Circle c = Circle(factory.createCircle(auctionParams(3), bytes32(0), INR));
        vm.prank(m[1]);
        token.approve(address(c), C);
        vm.prank(m[1]);
        c.join(bytes32("anything"), INR);
        assertEq(c.members().length, 2);
    }

    function test_LeaveRefundsAndKeepsJoinOrder() public {
        Circle c = createCircle(fixedParams(5), 3); // m0..m3
        uint256 before = token.balanceOf(m[1]);
        vm.expectEmit(true, false, false, true, address(c));
        emit Circle.Left(m[1], C);
        vm.prank(m[1]);
        c.leave();
        assertEq(token.balanceOf(m[1]) - before, C);
        address[] memory ms = c.members();
        assertEq(ms.length, 3);
        assertEq(ms[0], m[0]);
        assertEq(ms[1], m[2]);
        assertEq(ms[2], m[3]);
        assertEq(c.memberInfo(m[3]).joinIndex, 2);
        assertEq(uint8(c.memberInfo(m[1]).state), uint8(CircleTypes.MemberState.NONE));

        // Last member leaving (no shifting needed).
        vm.prank(m[3]);
        c.leave();
        assertEq(c.members().length, 2);

        vm.prank(m[9]);
        vm.expectRevert(Circle.NotMember.selector);
        c.leave();

        joinAs(c, m[4]);
        joinAs(c, m[5]);
        joinAs(c, m[6]);
        vm.prank(m[0]);
        vm.expectRevert(Circle.WrongStatus.selector);
        c.leave();
    }

    // -------------------------------------------------------------------------------------------
    // Profile & collateral
    // -------------------------------------------------------------------------------------------

    function test_SetDisplayCurrency() public {
        Circle c = createCircle(auctionParams(3), 1);
        vm.expectEmit(true, false, false, true, address(c));
        emit Circle.MemberProfileSet(m[1], "AED");
        vm.prank(m[1]);
        c.setDisplayCurrency("AED");
        assertEq(c.memberInfo(m[1]).displayCurrency, bytes3("AED"));
        vm.prank(m[9]);
        vm.expectRevert(Circle.NotMember.selector);
        c.setDisplayCurrency("GBP");
    }

    function test_PostCollateralBeforeWinningReducesWithholding() public {
        Circle c = fullCircle(fixedParams(5));
        vm.prank(m[0]);
        c.postCollateral(300e6);
        assertEq(c.memberInfo(m[0]).collateral, 300e6);
        c.collect();
        c.closeAuction();
        uint256 before = token.balanceOf(m[0]);
        c.payout();
        // needs 400 collateral; has 100 deposit + 300 posted -> receives the whole 500 pot.
        assertEq(token.balanceOf(m[0]) - before, 500e6);
        assertEq(c.memberInfo(m[0]).collateral, 400e6);
        checkAll(c);
    }

    function test_PostCollateralAfterWinningReducesExposure() public {
        Circle c = fullCircle(fixedParams(3));
        runRound(c);
        vm.prank(m[0]);
        c.postCollateral(5e6);
        assertEq(c.memberInfo(m[0]).collateral, 205e6);
        checkAll(c);
    }

    function test_PostCollateralReverts() public {
        Circle c = fullCircle(fixedParams(3));
        vm.prank(m[0]);
        vm.expectRevert(Circle.ZeroAmount.selector);
        c.postCollateral(0);
        vm.prank(m[9]);
        vm.expectRevert(Circle.NotMember.selector);
        c.postCollateral(1);
        runRound(c);
        runRound(c);
        runRound(c);
        vm.prank(m[0]);
        vm.expectRevert(Circle.WrongStatus.selector);
        c.postCollateral(1);
    }

    // -------------------------------------------------------------------------------------------
    // Collection
    // -------------------------------------------------------------------------------------------

    function test_CollectRevertsWhenNotActive() public {
        Circle c = createCircle(auctionParams(3), 1);
        vm.expectRevert(Circle.WrongStatus.selector);
        c.collect();
        vm.expectRevert(Circle.WrongStatus.selector);
        c.collectFrom(m[0]);
    }

    function test_CollectRevertsBeforeScheduledRoundStart() public {
        Circle c = fullCircle(fixedParams(3));
        runRound(c); // finishes immediately; round 2 is scheduled one period later
        assertGt(roundStart(c), vm.getBlockTimestamp());
        vm.expectRevert(Circle.TooEarly.selector);
        c.collect();
    }

    function test_CollectIsIdempotentAndMarksLate() public {
        Circle c = fullCircle(fixedParams(3));
        stopPaying(c, m[2]);
        vm.expectEmit(true, true, false, false, address(c));
        emit Circle.ContributionFailed(m[2], 1);
        c.collect();
        uint256 bal = token.balanceOf(address(c));
        c.collect(); // nothing new; no duplicate event state
        assertEq(token.balanceOf(address(c)), bal);
        assertTrue(c.failedThisRound(1, m[2]));

        // m2 tops up: a single-member collect succeeds and is recorded late.
        resumePaying(c, m[2]);
        vm.expectEmit(true, true, false, true, address(c));
        emit Circle.ContributionPaid(m[2], 1, C, 0, false);
        c.collectFrom(m[2]);
        assertEq(registry.recordOf(m[2]).paymentsLate, 1);
        c.collectFrom(m[9]); // non-member: no-op
        checkAll(c);
    }

    function test_CollectInsufficientGasForAccountReverts() public {
        Circle c = createCircle(fixedParams(3), 1);
        ContractMember cm = new ContractMember(IERC20(address(token)));
        deal(address(token), address(cm), START_BALANCE);
        cm.join(c, SECRET);
        vm.expectRevert(Circle.InsufficientGas.selector);
        c.collectFrom{gas: 200_000}(address(cm));
    }

    function test_ContractMemberFallsBackToAllowance() public {
        Circle c = createCircle(fixedParams(3), 1);
        ContractMember cm = new ContractMember(IERC20(address(token)));
        deal(address(token), address(cm), START_BALANCE);
        cm.join(c, SECRET); // mode REVERT -> pull fails, allowance used
        c.collect();
        assertEq(uint8(c.payState(1, address(cm))), uint8(CircleTypes.PayState.PAID));
        checkAll(c);
    }

    function test_ContractMemberPartialPullBecomesCredit() public {
        Circle c = createCircle(fixedParams(3), 1);
        ContractMember cm = new ContractMember(IERC20(address(token)));
        deal(address(token), address(cm), START_BALANCE);
        cm.join(c, SECRET);
        cm.setMode(ContractMember.PullMode.PARTIAL);
        c.collect();
        assertTrue(c.failedThisRound(1, address(cm)));
        assertEq(c.memberInfo(address(cm)).credit, C / 2);
        checkAll(c);
        // The next attempt uses the credit first, then pulls the rest (half of which arrives again).
        c.collect();
        assertEq(c.memberInfo(address(cm)).credit, C / 2 + C / 4);
        checkAll(c);
    }

    function test_ContractMemberExcessPullBecomesWithdrawable() public {
        Circle c = createCircle(fixedParams(3), 1);
        ContractMember cm = new ContractMember(IERC20(address(token)));
        deal(address(token), address(cm), START_BALANCE);
        cm.join(c, SECRET);
        cm.setMode(ContractMember.PullMode.EXCESS);
        c.collect();
        assertEq(uint8(c.payState(1, address(cm))), uint8(CircleTypes.PayState.PAID));
        assertEq(c.memberInfo(address(cm)).withdrawable, 1e6);
        checkAll(c);
        cm.claim(c);
        assertEq(c.memberInfo(address(cm)).withdrawable, 0);
    }

    function test_FeeOnTransferIsNotCountedAsPaid() public {
        (QuirkyToken qt, CircleFactory f) = _quirkyFactory();
        Circle c = _quirkyCircle(qt, f, 3);
        qt.setFee(100); // 1%
        c.collect();
        assertTrue(c.failedThisRound(1, m[0]));
        assertEq(c.memberInfo(m[0]).credit, C - C / 100, "received part kept as credit");
        assertEq(qt.balanceOf(address(c)), c.accountedBalance());
    }

    function test_PayoutToBlockedWinnerBecomesWithdrawable() public {
        (QuirkyToken qt, CircleFactory f) = _quirkyFactory();
        Circle c = _quirkyCircle(qt, f, 3);
        c.collect();
        c.closeAuction();
        qt.setBlocked(m[0], true);
        c.payout();
        // pot 300 + deposit 100 - collateral 200 (two rounds still owed)
        assertEq(c.memberInfo(m[0]).withdrawable, 200e6);
        vm.prank(m[0]);
        vm.expectRevert(bytes("blocked"));
        c.claim();
        qt.setBlocked(m[0], false);
        vm.prank(m[0]);
        c.claim();
        assertEq(qt.balanceOf(address(c)), c.accountedBalance());
    }

    function _quirkyFactory() internal returns (QuirkyToken qt, CircleFactory f) {
        qt = new QuirkyToken();
        f = new CircleFactory(IERC20(address(qt)), address(impl), owner, 1_000e6, 20);
        for (uint256 i; i < 5; ++i) qt.mint(m[i], START_BALANCE);
    }

    function _quirkyCircle(QuirkyToken qt, CircleFactory f, uint8 n) internal returns (Circle c) {
        address predicted = f.predictCircleAddress(m[0]);
        vm.prank(m[0]);
        qt.approve(predicted, type(uint256).max);
        vm.prank(m[0]);
        c = Circle(f.createCircle(fixedParams(n), bytes32(0), INR));
        for (uint256 i = 1; i < n; ++i) {
            vm.prank(m[i]);
            qt.approve(address(c), type(uint256).max);
            vm.prank(m[i]);
            c.join(bytes32(0), INR);
        }
    }

    // -------------------------------------------------------------------------------------------
    // Auction
    // -------------------------------------------------------------------------------------------

    function test_BidReverts() public {
        Circle fixedC = fullCircle(fixedParams(3));
        vm.prank(m[0]);
        vm.expectRevert(Circle.NotAuction.selector);
        fixedC.bid(100);

        // new creator for a second circle
        address predicted = factory.predictCircleAddress(m[0]);
        vm.prank(m[0]);
        token.approve(predicted, type(uint256).max);
        vm.prank(m[0]);
        Circle c = Circle(factory.createCircle(auctionParams(3), keccak256(abi.encodePacked(SECRET)), INR));
        vm.prank(m[0]);
        vm.expectRevert(Circle.WrongStatus.selector);
        c.bid(100);
        joinAs(c, m[1]);
        joinAs(c, m[2]);

        vm.prank(m[9]);
        vm.expectRevert(Circle.NotMember.selector);
        c.bid(100);
        vm.prank(m[0]);
        vm.expectRevert(Circle.BidTooHigh.selector);
        c.bid(3_001);

        bidAs(c, m[0], 500);
        vm.prank(m[0]);
        vm.expectRevert(Circle.BidNotHigher.selector);
        c.bid(500);
        bidAs(c, m[0], 600); // raising is fine

        warpPastBidWindow(c);
        vm.prank(m[1]);
        vm.expectRevert(Circle.TooLate.selector);
        c.bid(100);

        c.collect();
        c.closeAuction();
        vm.prank(m[1]);
        vm.expectRevert(Circle.AuctionAlreadyClosed.selector);
        c.bid(100);
        c.payout();

        // Round 2 is scheduled in the future.
        vm.prank(m[1]);
        vm.expectRevert(Circle.TooEarly.selector);
        c.bid(100);
        warpToRoundStart(c);
        vm.prank(m[0]);
        vm.expectRevert(Circle.AlreadyWon.selector);
        c.bid(100);
    }

    function test_BidMustLeaveEnoughForCollateral() public {
        CircleTypes.Params memory p = auctionParams(10);
        p.maxDiscountBps = 5_000;
        Circle c = fullCircle(p);
        // pot 1000, 50% -> 500 + deposit 100 < 900 still owed
        vm.prank(m[1]);
        vm.expectRevert(Circle.BidTooHigh.selector);
        c.bid(5_000);
        bidAs(c, m[1], 1_000); // 900 + 100 >= 900
    }

    function test_BidRevertsInSettlementSlot() public {
        Circle c = _ejectionCircle(true); // reaches a settlement slot
        warpToRoundStart(c);
        vm.prank(m[0]);
        vm.expectRevert(Circle.SettlementSlot.selector);
        c.bid(0);
        vm.expectRevert(Circle.SettlementSlot.selector);
        c.closeAuction();
    }

    function test_CloseAuctionReverts() public {
        Circle c = createCircle(auctionParams(3), 1);
        vm.expectRevert(Circle.WrongStatus.selector);
        c.closeAuction();
        joinAs(c, m[2]);
        vm.expectRevert(Circle.TooEarly.selector);
        c.closeAuction();
        warpPastBidWindow(c);
        c.closeAuction();
        vm.expectRevert(Circle.AuctionAlreadyClosed.selector);
        c.closeAuction();
    }

    function test_DiscountCappedIfDepositConsumedAfterBid() public {
        CircleTypes.Params memory p = auctionParams(5);
        p.maxDiscountBps = 5_000;
        Circle c = fullCircle(p);
        runRound(c); // m0 wins r1 (no bids)

        // Round 2: m1 bids 50% (feasible with its deposit), then misses; the deposit covers the miss.
        warpToRoundStart(c);
        stopPaying(c, m[1]);
        c.collect();
        bidAs(c, m[1], 5_000);
        warpPastGrace(c);
        c.markDefault(m[1], 2);
        warpPastBidWindow(c);
        c.closeAuction();
        c.payout();
        // needK 300, have 0 -> discount capped at 500 - 300 = 200 (40%).
        assertEq(c.roundInfo(2).discountBps, 4_000);
        assertEq(c.memberInfo(m[1]).collateral, 300e6);
        checkAll(c);
    }

    // -------------------------------------------------------------------------------------------
    // Payout
    // -------------------------------------------------------------------------------------------

    function test_PayoutReverts() public {
        Circle c = createCircle(auctionParams(3), 1);
        vm.expectRevert(Circle.WrongStatus.selector);
        c.payout();
        joinAs(c, m[2]);
        vm.expectRevert(Circle.Unresolved.selector);
        c.payout();
        c.collect();
        vm.expectRevert(Circle.AuctionNotClosed.selector);
        c.payout();
        warpPastBidWindow(c);
        c.closeAuction();
        c.payout();
        vm.expectRevert(Circle.TooEarly.selector);
        c.payout();
    }

    function test_LateKeeperShiftsNextRoundStart() public {
        Circle c = fullCircle(fixedParams(3));
        vm.warp(vm.getBlockTimestamp() + 2 * PERIOD); // keeper is very late
        c.collect();
        c.closeAuction();
        c.payout();
        assertEq(roundStart(c), vm.getBlockTimestamp(), "next round opens now, not in the past");
    }

    // -------------------------------------------------------------------------------------------
    // Defaults
    // -------------------------------------------------------------------------------------------

    function test_MarkDefaultReverts() public {
        Circle c = createCircle(fixedParams(3), 1);
        vm.expectRevert(Circle.WrongStatus.selector);
        c.markDefault(m[1], 1);
        joinAs(c, m[2]);
        vm.expectRevert(Circle.NotCurrentRound.selector);
        c.markDefault(m[1], 2);
        vm.expectRevert(Circle.TooEarly.selector);
        c.markDefault(m[1], 1);
        warpPastGrace(c);
        vm.expectRevert(Circle.NotMember.selector);
        c.markDefault(m[9], 1);
        c.collect();
        vm.expectRevert(Circle.AlreadyResolved.selector);
        c.markDefault(m[1], 1);
    }

    function test_MarkDefaultNothingDueInSettlement() public {
        Circle c = _ejectionCircle(false);
        warpPastGrace(c);
        uint256 r = c.currentRound();
        // m2 and m3 owe no repayment
        vm.expectRevert(Circle.NothingDue.selector);
        c.markDefault(m[2], r);
    }

    function test_SettlementRepaymentDefaultCoveredByCollateral() public {
        Circle c = _ejectionCircle(false);
        // m0 must repay in the settlement slot but stops paying; its collateral covers it.
        stopPaying(c, m[0]);
        warpToRoundStart(c);
        c.collect();
        warpPastGrace(c);
        uint256 r = c.currentRound();
        c.markDefault(m[0], r);
        assertEq(c.memberInfo(m[0]).repayOwed, 0);
        checkAll(c);
        c.payout();
        assertEq(uint8(c.status()), uint8(CircleTypes.Status.COMPLETED));
        assertEq(c.memberInfo(m[4]).withdrawable, 180e6, "refund intact");
        checkAll(c);
    }

    function test_AllMembersDefaultedReserveGoesToAll() public {
        // Three members; everybody misses once, so nobody is "non-defaulting" at the end.
        CircleTypes.Params memory p = auctionParams(3);
        Circle c = fullCircle(p);
        warpToRoundStart(c);
        c.collect();
        bidAs(c, m[0], 3_000); // creates a reserve
        warpPastBidWindow(c);
        c.closeAuction();
        c.payout();
        assertGt(c.reserveBalance(), 0);

        stopPaying(c, m[0]);
        stopPaying(c, m[1]);
        stopPaying(c, m[2]);
        warpToRoundStart(c);
        c.collect();
        warpPastGrace(c);
        c.markDefault(m[0], 2);
        c.markDefault(m[1], 2);
        c.markDefault(m[2], 2);
        resumePaying(c, m[0]);
        resumePaying(c, m[1]);
        resumePaying(c, m[2]);
        warpPastBidWindow(c);
        c.closeAuction();
        c.payout();
        runRound(c);
        assertEq(uint8(c.status()), uint8(CircleTypes.Status.COMPLETED));
        assertEq(c.reserveBalance(), 0);
        checkAll(c);
        claimAll(c);
        assertEq(token.balanceOf(address(c)), 0);
    }

    // -------------------------------------------------------------------------------------------
    // Claims & views
    // -------------------------------------------------------------------------------------------

    function test_ClaimNothing() public {
        Circle c = fullCircle(fixedParams(3));
        vm.prank(m[1]);
        vm.expectRevert(Circle.NothingToClaim.selector);
        c.claim();
    }

    function test_NextActionWalksTheRound() public {
        Circle c = createCircle(auctionParams(3), 1);
        (Circle.NextAction a,) = c.nextAction();
        assertEq(uint8(a), uint8(Circle.NextAction.NONE), "forming");
        joinAs(c, m[2]);
        (a,) = c.nextAction();
        assertEq(uint8(a), uint8(Circle.NextAction.COLLECT));
        c.collect();
        (a,) = c.nextAction();
        assertEq(uint8(a), uint8(Circle.NextAction.NONE), "bid window open");
        warpPastBidWindow(c);
        (a,) = c.nextAction();
        assertEq(uint8(a), uint8(Circle.NextAction.CLOSE_AUCTION));
        c.closeAuction();
        (a,) = c.nextAction();
        assertEq(uint8(a), uint8(Circle.NextAction.PAYOUT));
        c.payout();
        (a,) = c.nextAction();
        assertEq(uint8(a), uint8(Circle.NextAction.NONE), "next round not started");
    }

    function test_NextActionWaitsOnLatePayerAfterClose() public {
        Circle c = fullCircle(fixedParams(3));
        stopPaying(c, m[1]);
        c.collect();
        c.closeAuction();
        (Circle.NextAction a,) = c.nextAction();
        assertEq(uint8(a), uint8(Circle.NextAction.NONE), "waiting for grace");
    }

    function test_ViewsAfterCompletion() public {
        Circle c = fullCircle(fixedParams(3));
        runRound(c);
        runRound(c);
        runRound(c);
        (uint256 bal, uint256 exposure) = c.reserve();
        assertEq(bal, 0);
        assertEq(exposure, 0);
        assertEq(c.memberInfo(m[0]).debt, 0);
        (Circle.NextAction a,) = c.nextAction();
        assertEq(uint8(a), uint8(Circle.NextAction.NONE));
    }

    // -------------------------------------------------------------------------------------------
    // helpers
    // -------------------------------------------------------------------------------------------

    /// @dev N=5 where m4 is ejected in round 3 (no bids, so recipients follow join order); returns once the
    ///      circle is in its settlement slot.
    function _ejectionCircle(bool auction) internal returns (Circle c) {
        c = fullCircle(auction ? auctionParams(5) : fixedParams(5));
        runRound(c);
        stopPaying(c, m[4]);
        warpToRoundStart(c);
        c.collect();
        warpPastGrace(c);
        c.markDefault(m[4], 2);
        if (auction) warpPastBidWindow(c);
        c.closeAuction();
        c.payout();
        warpToRoundStart(c);
        c.collect();
        warpPastGrace(c);
        c.markDefault(m[4], 3);
        if (auction) warpPastBidWindow(c);
        c.closeAuction();
        c.payout();
        runRound(c);
        assertTrue(c.inSettlement());
    }
}
