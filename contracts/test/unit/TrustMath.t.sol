// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TrustMath} from "../../src/libraries/TrustMath.sol";
import {ICreditRegistry} from "../../src/interfaces/ICreditRegistry.sol";

contract TrustMathTest is Test {
    function rec(uint32 completed, uint32 onTime, uint32 late, uint32 defaults)
        internal
        pure
        returns (ICreditRegistry.Record memory r)
    {
        r.circlesCompleted = completed;
        r.paymentsOnTime = onTime;
        r.paymentsLate = late;
        r.defaults = defaults;
    }

    function test_NewUserHasNothing() public pure {
        ICreditRegistry.Record memory r;
        assertEq(TrustMath.trustBps(r), 0);
        assertEq(TrustMath.score(r), 0);
        assertEq(TrustMath.onTimeRateBps(r), 0);
    }

    function test_NoCompletedCircleMeansNoTrust() public pure {
        assertEq(TrustMath.trustBps(rec(0, 50, 0, 0)), 0);
    }

    function test_TrustPerCircleAndCap() public pure {
        assertEq(TrustMath.trustBps(rec(1, 5, 0, 0)), 2_000);
        assertEq(TrustMath.trustBps(rec(2, 10, 0, 0)), 4_000);
        assertEq(TrustMath.trustBps(rec(4, 20, 0, 0)), 8_000);
        assertEq(TrustMath.trustBps(rec(9, 90, 0, 0)), 8_000, "capped at 80%");
    }

    function test_TrustScalesWithOnTimeRateSquared() public pure {
        // rate 50% -> 4000 * 0.25 = 1000
        assertEq(TrustMath.trustBps(rec(2, 5, 5, 0)), 1_000);
    }

    function test_TrustDefaultPenalty() public pure {
        // rate = 10/11 = 9090 bps; 4000 * 9090^2 / 1e8 = 3305; minus 2500 = 805
        assertEq(TrustMath.trustBps(rec(2, 10, 0, 1)), 805);
        assertEq(TrustMath.trustBps(rec(2, 10, 0, 2)), 0, "floored at zero");
    }

    function test_ScoreComponents() public pure {
        // 1 completed (100) + full rate ramped over 12 payments (400 * 5/12 = 166) + 5 on-time = 271
        assertEq(TrustMath.score(rec(1, 5, 0, 0)), 271);
        // ramp is complete after 12 payments: 100 + 400 + 12
        assertEq(TrustMath.score(rec(1, 12, 0, 0)), 512);
        // completed component capped at 500, on-time count at 100
        assertEq(TrustMath.score(rec(10, 200, 0, 0)), 1_000);
        // single payment is barely history: 400/12 = 33 + 1
        assertEq(TrustMath.score(rec(0, 1, 0, 0)), 34);
    }

    function test_ScoreDefaultPenalty() public pure {
        // 0 completed, 1 payment, 1 default: rate 5000 -> 400*0.5*2/12 = 33, +1 on-time = 34, -150 -> 0
        assertEq(TrustMath.score(rec(0, 1, 0, 1)), 0);
        // 5 completed, 60 on-time, 1 default: 500 + 400*(60/61) = 393 + 60 = 953 - 150 = 803
        assertEq(TrustMath.score(rec(5, 60, 0, 1)), 803);
    }

    function test_DesiredWaiver() public pure {
        assertEq(TrustMath.desiredWaiver(400e6, 8_000), 320e6);
        assertEq(TrustMath.desiredWaiver(400e6, 0), 0);
    }

    function testFuzz_Bounds(uint32 completed, uint32 onTime, uint32 late, uint32 defaults) public pure {
        ICreditRegistry.Record memory r = rec(completed, onTime, late, defaults);
        assertLe(TrustMath.trustBps(r), 8_000);
        assertLe(TrustMath.score(r), 1_000);
        assertLe(TrustMath.onTimeRateBps(r), 10_000);
    }

    function testFuzz_MoreCirclesNeverLessTrust(uint8 completed, uint16 onTime) public pure {
        ICreditRegistry.Record memory a = rec(completed, onTime, 0, 0);
        ICreditRegistry.Record memory b = rec(uint32(completed) + 1, onTime, 0, 0);
        assertGe(TrustMath.trustBps(b), TrustMath.trustBps(a));
        assertGe(TrustMath.score(b), TrustMath.score(a));
    }

    function testFuzz_DefaultsNeverIncreaseTrust(uint8 completed, uint16 onTime, uint8 defaults) public pure {
        ICreditRegistry.Record memory a = rec(completed, onTime, 0, defaults);
        ICreditRegistry.Record memory b = rec(completed, onTime, 0, uint32(defaults) + 1);
        assertLe(TrustMath.trustBps(b), TrustMath.trustBps(a));
        assertLe(TrustMath.score(b), TrustMath.score(a));
    }
}
