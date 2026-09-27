// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {TurnTestBase} from "../utils/TurnTestBase.sol";
import {Circle} from "../../src/Circle.sol";
import {CircleTypes} from "../../src/libraries/CircleTypes.sol";

/// @notice Drives complete circles with random members (size, mode, trust history, bids, missed payments,
///         extra collateral) from start to finish, checking the invariants after every action:
///         I0 balance fully accounted, I1 exposure (waived collateral + rebated deposits) <= reserve,
///         I2 no non-ejected member ends worse off than the discount they bid, I3 every pot = active x C.
contract CircleLifecycleFuzzTest is TurnTestBase {
    struct Stats {
        bool ejection;
        bool reserveCoveredDefault;
        bool rebate;
        bool cancelledRound;
        bool trustWaiver;
    }

    uint256 internal seed;
    mapping(address => uint256) internal ownDiscount;
    Stats internal stats;
    uint256 internal constant MAX_STEPS = 400;

    function _rand(uint256 mod) internal returns (uint256) {
        seed = uint256(keccak256(abi.encode(seed)));
        return seed % mod;
    }

    function testFuzz_RandomLifecycle(uint256 seed_, uint8 n_, bool auction, uint8 missRatePct) public {
        _runLifecycle(seed_, uint8(bound(n_, 3, 8)), auction, bound(missRatePct, 0, 40));
    }

    /// @dev Proves the fuzzing above actually reaches the edge cases the invariants are about.
    function test_LifecyclesReachEdgeCases() public {
        Stats memory seen;
        for (uint256 i; i < 60; ++i) {
            uint256 snap = vm.snapshotState();
            Stats memory s =
                _runLifecycle(uint256(keccak256(abi.encode("edge", i))), uint8(3 + (i % 6)), i % 4 != 0, 30);
            seen.ejection = seen.ejection || s.ejection;
            seen.reserveCoveredDefault = seen.reserveCoveredDefault || s.reserveCoveredDefault;
            seen.rebate = seen.rebate || s.rebate;
            seen.cancelledRound = seen.cancelledRound || s.cancelledRound;
            seen.trustWaiver = seen.trustWaiver || s.trustWaiver;
            vm.revertToState(snap);
        }
        assertTrue(seen.ejection, "no ejection reached");
        assertTrue(seen.reserveCoveredDefault, "no reserve-covered default reached");
        assertTrue(seen.rebate, "no deposit rebate reached");
        assertTrue(seen.cancelledRound, "no cancelled round reached");
        assertTrue(seen.trustWaiver, "no trust waiver reached");
    }

    function _runLifecycle(uint256 seed_, uint8 n, bool auction, uint256 missRate)
        internal
        returns (Stats memory)
    {
        seed = seed_;
        delete stats;

        // Random credit histories: some members are trusted.
        for (uint256 i; i < n; ++i) {
            if (_rand(3) == 0) giveHistory(m[i], 1 + _rand(5), 5 + _rand(40), _rand(3), _rand(2));
        }

        CircleTypes.Params memory p = auction ? auctionParams(n) : fixedParams(n);
        if (auction) {
            p.maxDiscountBps = uint16(1_000 + _rand(4_001));
            p.reserveBps = uint16(_rand(10_001));
        }
        Circle c = fullCircle(p);
        _check(c, n);

        uint256 lastRoundSeen;
        for (uint256 s; s < MAX_STEPS && c.status() == CircleTypes.Status.ACTIVE; ++s) {
            uint256 r = c.currentRound();
            if (r != lastRoundSeen) {
                lastRoundSeen = r;
                _randomiseBehaviour(c, n, missRate);
            }
            _step(c);
            _check(c, n);
        }

        assertEq(uint8(c.status()), uint8(CircleTypes.Status.COMPLETED), "circle did not finish");
        claimAll(c);
        assertEq(token.balanceOf(address(c)), 0, "circle not fully drained");

        int256 total;
        for (uint256 i; i < n; ++i) {
            int256 net = int256(token.balanceOf(m[i])) - int256(START_BALANCE);
            total += net;
            CircleTypes.MemberView memory v = c.memberInfo(m[i]);
            if (v.state == CircleTypes.MemberState.ACTIVE) {
                assertGe(net + int256(ownDiscount[m[i]]), 0, "I2: member worse off");
                assertGe(registry.recordOf(m[i]).circlesCompleted, 1);
            } else {
                // Loses the 10% penalty on what they funded; keeps discount credit earned before ejection.
                int256 penalty = int256(uint256(v.fundedRounds) * (C / 10));
                assertGe(net, -penalty, "ejected: lost more than the 10% penalty");
                if (!auction) assertEq(net, -penalty, "fixed order (no credits): exactly the penalty");
            }
        }
        assertEq(total, 0, "tokens created or destroyed");
        return stats;
    }

    function _randomiseBehaviour(Circle c, uint8 n, uint256 missRate) internal {
        for (uint256 i; i < n; ++i) {
            if (c.memberInfo(m[i]).state != CircleTypes.MemberState.ACTIVE) continue;
            bool miss = _rand(100) < missRate;
            vm.prank(m[i]);
            token.approve(address(c), miss ? 0 : type(uint256).max);
            if (_rand(10) == 0) {
                vm.prank(m[i]);
                token.approve(address(c), type(uint256).max);
                vm.prank(m[i]);
                c.postCollateral(1e6 + _rand(50e6));
                if (miss) {
                    vm.prank(m[i]);
                    token.approve(address(c), 0);
                }
            }
        }
    }

    function _step(Circle c) internal {
        (Circle.NextAction action, address member) = c.nextAction();
        uint256 r = c.currentRound();
        Circle.Round memory rd = c.roundInfo(r);
        CircleTypes.Params memory p = c.params();

        if (action == Circle.NextAction.NONE) {
            // Random bids while the window is open, then move time forward.
            if (p.mode == CircleTypes.Mode.AUCTION && !rd.settlement && !rd.auctionClosed) {
                uint256 now_ = vm.getBlockTimestamp();
                if (now_ >= rd.start && now_ < rd.start + p.bidWindow) {
                    address[] memory ms = c.members();
                    address who = ms[_rand(ms.length)];
                    vm.prank(who);
                    try c.bid(uint16(_rand(uint256(p.maxDiscountBps) + 1))) {} catch {}
                }
            }
            uint256 t = vm.getBlockTimestamp();
            uint256 target = t < rd.start ? rd.start : t + 1 + _rand(p.period / 4);
            vm.warp(target);
            return;
        }
        if (action == Circle.NextAction.COLLECT) {
            c.collect();
        } else if (action == Circle.NextAction.CLOSE_AUCTION) {
            c.closeAuction();
        } else if (action == Circle.NextAction.MARK_DEFAULT) {
            uint256 reserveBefore = c.reserveBalance();
            bool settlementBefore = c.inSettlement();
            c.markDefault(member, r);
            if (c.memberInfo(member).state == CircleTypes.MemberState.EJECTED) stats.ejection = true;
            if (c.reserveBalance() < reserveBefore) stats.reserveCoveredDefault = true;
            if (!settlementBefore && c.inSettlement() && c.roundInfo(r).winner == address(0)) {
                stats.cancelledRound = true;
            }
        } else {
            bool regular = !c.inSettlement();
            uint256 pot = c.roundPot();
            if (regular) assertEq(pot, c.potTarget(), "I3: pot != active x C");
            vm.recordLogs();
            c.payout();
            Circle.Round memory done = c.roundInfo(r);
            if (regular && !done.settlement) {
                ownDiscount[done.winner] += (pot * done.discountBps) / 10_000;
                if (_payoutHadWaiver(address(c))) stats.trustWaiver = true;
            }
        }
    }

    /// @dev Looks for a PayoutMade event with a non-zero trust waiver in the logs recorded since recordLogs().
    function _payoutHadWaiver(address circle) internal returns (bool) {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != circle || logs[i].topics[0] != Circle.PayoutMade.selector) continue;
            (,,,, uint256 waiver,) =
                abi.decode(logs[i].data, (uint256, uint256, uint256, uint256, uint256, uint256));
            return waiver > 0;
        }
        return false;
    }

    function _check(Circle c, uint8 n) internal {
        assertEq(token.balanceOf(address(c)), c.accountedBalance(), "I0");
        (uint256 bal, uint256 exposure) = c.reserve();
        assertLe(exposure, bal, "I1");
        for (uint256 i; i < n; ++i) {
            if (c.memberInfo(m[i]).rebated > 0) stats.rebate = true;
        }
    }
}
