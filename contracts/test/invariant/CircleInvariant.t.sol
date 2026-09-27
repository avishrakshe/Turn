// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console} from "forge-std/console.sol";
import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";

import {TurnTestBase} from "../utils/TurnTestBase.sol";
import {MockAUSD} from "../../src/test-tokens/MockAUSD.sol";
import {Circle} from "../../src/Circle.sol";
import {CircleTypes} from "../../src/libraries/CircleTypes.sol";

/// @dev Drives one circle with random member behaviour (bids, missed payments, collateral, claims) and random
///      keeper timing. A `step` action follows the circle's own `nextAction()` so runs reach completion.
contract CircleHandler is CommonBase, StdCheats, StdUtils {
    Circle public c;
    MockAUSD public token;
    address[] public actors;
    uint256 public immutable startBalance;
    uint128 public immutable contribution;

    mapping(address => uint256) public ownDiscount;
    mapping(address => bool) public stopped;
    bool public potMismatch;
    uint256 public payouts;
    uint256 public ejections;
    uint256 public reserveCovered;

    constructor(Circle c_, MockAUSD token_, address[] memory actors_, uint256 startBalance_) {
        c = c_;
        token = token_;
        actors = actors_;
        startBalance = startBalance_;
        contribution = c_.params().contribution;
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _actor(uint256 i) internal view returns (address) {
        return actors[i % actors.length];
    }

    function _now() internal view returns (uint256) {
        return vm.getBlockTimestamp();
    }

    // ---- time ----

    function warp(uint256 secs) public {
        secs = bound(secs, 1, c.params().period);
        vm.warp(_now() + secs);
    }

    // ---- member behaviour ----

    function toggleFunding(uint256 who) public {
        address a = _actor(who);
        stopped[a] = !stopped[a];
        vm.prank(a);
        token.approve(address(c), stopped[a] ? 0 : type(uint256).max);
    }

    function bid(uint256 who, uint16 bps) public {
        address a = _actor(who);
        bps = uint16(bound(bps, 0, c.params().maxDiscountBps));
        vm.prank(a);
        try c.bid(bps) {} catch {}
    }

    function postCollateral(uint256 who, uint256 amount) public {
        address a = _actor(who);
        amount = bound(amount, 1, 50e6);
        if (stopped[a]) return;
        vm.prank(a);
        try c.postCollateral(amount) {} catch {}
    }

    function claim(uint256 who) public {
        address a = _actor(who);
        vm.prank(a);
        try c.claim() {} catch {}
    }

    // ---- keeper actions ----

    function collect() public {
        try c.collect() {} catch {}
    }

    function closeAuction() public {
        try c.closeAuction() {} catch {}
    }

    function markDefault(uint256 who) public {
        address a = _actor(who);
        _markDefault(a);
    }

    function payout() public {
        _payout();
    }

    /// @dev Do whatever the circle says is due, warping forward if needed.
    function step() public {
        if (c.status() != CircleTypes.Status.ACTIVE) return;
        (Circle.NextAction action, address member) = c.nextAction();
        if (action == Circle.NextAction.NONE) {
            Circle.Round memory rd = c.roundInfo(c.currentRound());
            uint256 target = _now() < rd.start ? rd.start : rd.start + c.params().gracePeriod;
            uint256 bw = rd.start + c.params().bidWindow;
            if (_now() < bw && bw < target) target = bw;
            if (target <= _now()) target = _now() + 1;
            vm.warp(target);
            return;
        }
        if (action == Circle.NextAction.COLLECT) c.collect();
        else if (action == Circle.NextAction.CLOSE_AUCTION) c.closeAuction();
        else if (action == Circle.NextAction.MARK_DEFAULT) _markDefault(member);
        else _payout();
    }

    function _markDefault(address a) internal {
        uint256 r = c.currentRound();
        CircleTypes.MemberState before = c.memberInfo(a).state;
        uint256 reserveBefore = c.reserveBalance();
        try c.markDefault(a, r) {
            if (
                before == CircleTypes.MemberState.ACTIVE
                    && c.memberInfo(a).state == CircleTypes.MemberState.EJECTED
            ) {
                ejections++;
            }
            if (c.reserveBalance() < reserveBefore) reserveCovered += reserveBefore - c.reserveBalance();
        } catch {}
    }

    function _payout() internal {
        uint256 r = c.currentRound();
        bool settlement = c.inSettlement();
        uint256 pot = c.roundPot();
        uint256 target = c.potTarget();
        try c.payout() {
            if (!settlement) {
                Circle.Round memory rd = c.roundInfo(r);
                if (!rd.settlement) {
                    if (pot != target) potMismatch = true;
                    ownDiscount[rd.winner] += (pot * rd.discountBps) / 10_000;
                    payouts++;
                }
            }
        } catch {}
    }
}

contract CircleInvariantTest is TurnTestBase {
    Circle internal c;
    CircleHandler internal handler;

    function setUp() public override {
        super.setUp();
        // Two members with strong history, so trust waivers and deposit rebates are exercised.
        giveHistory(m[1], 4, 30, 0, 0);
        giveHistory(m[3], 2, 12, 1, 0);

        CircleTypes.Params memory p = auctionParams(5);
        p.maxDiscountBps = 5_000;
        p.reserveBps = 5_000; // grow the reserve quickly so the exposure budget is actually used
        c = fullCircle(p);

        address[] memory actors = new address[](5);
        for (uint256 i; i < 5; ++i) {
            actors[i] = m[i];
        }
        handler = new CircleHandler(c, token, actors, START_BALANCE);

        bytes4[] memory selectors = new bytes4[](11);
        selectors[0] = CircleHandler.warp.selector;
        selectors[1] = CircleHandler.toggleFunding.selector;
        selectors[2] = CircleHandler.bid.selector;
        selectors[3] = CircleHandler.postCollateral.selector;
        selectors[4] = CircleHandler.claim.selector;
        selectors[5] = CircleHandler.collect.selector;
        selectors[6] = CircleHandler.closeAuction.selector;
        selectors[7] = CircleHandler.markDefault.selector;
        selectors[8] = CircleHandler.payout.selector;
        selectors[9] = CircleHandler.step.selector;
        selectors[10] = CircleHandler.step.selector; // weight progress
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// I0: every token the circle holds is owed to someone.
    function invariant_I0_BalanceFullyAccounted() public view {
        assertEq(token.balanceOf(address(c)), c.accountedBalance());
    }

    /// I1: waived collateral + rebated deposits never exceed the protection reserve.
    function invariant_I1_ExposureWithinReserve() public view {
        (uint256 bal, uint256 exposure) = c.reserve();
        assertLe(exposure, bal);
    }

    /// I3: every regular payout pot equals (active members x C).
    function invariant_I3_PotIsAlwaysFull() public view {
        assertFalse(handler.potMismatch());
    }

    /// I2: once complete, no non-ejected member is worse off than the discount they chose to bid, and no
    ///     tokens were created or destroyed.
    function invariant_I2_NoMemberWorseOff() public view {
        if (c.status() != CircleTypes.Status.COMPLETED) return;
        int256 total;
        for (uint256 i; i < 5; ++i) {
            address a = m[i];
            CircleTypes.MemberView memory v = c.memberInfo(a);
            int256 net = int256(token.balanceOf(a)) + int256(uint256(v.withdrawable)) - int256(START_BALANCE);
            total += net;
            if (v.state == CircleTypes.MemberState.ACTIVE) {
                assertGe(net + int256(handler.ownDiscount(a)), 0, "member worse off");
            } else {
                // Ejected: loses at most the 10% penalty on what they funded.
                assertGe(net, -int256(uint256(v.fundedRounds) * C / 10) - 1);
            }
        }
        assertEq(total, 0, "tokens created or destroyed");
    }

    /// Accounting stays within the members' pooled funds at all times.
    function invariant_NoValueCreated() public view {
        uint256 sum = token.balanceOf(address(c));
        for (uint256 i; i < 5; ++i) {
            sum += token.balanceOf(m[i]);
        }
        assertEq(sum, 5 * START_BALANCE);
    }

    function afterInvariant() external view {
        // Run with -vv to see that runs reach the interesting states (completion, ejections, reserve use).
        console.log(
            string.concat(
                "status=",
                vm.toString(uint8(c.status())),
                " payouts=",
                vm.toString(handler.payouts()),
                " ejections=",
                vm.toString(handler.ejections()),
                " reserveCovered=",
                vm.toString(handler.reserveCovered())
            )
        );
    }
}
