// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICreditRegistry} from "../interfaces/ICreditRegistry.sol";

/// @title TrustMath
/// @notice Pure scoring rules that turn a member's savings history into a credit score and a trust discount.
/// @dev All constants are deliberately simple and tunable. New users (no completed circles) always get 0.
///
///      trustBps  = min(CAP, completed * PER_CIRCLE) * onTimeRate^2 - defaults * DEFAULT_PENALTY, floored at 0
///      score     = min(500, completed * 100) + onTimeRate * 400 * min(payments, 12) / 12
///                  + min(100, onTimePayments) - defaults * 150, clamped to [0, 1000]. A new account scores 0.
///                  (The on-time component ramps up over the first 12 payments, so one payment isn't "history".)
///
///      Squaring the on-time rate makes a few late payments cost noticeably more trust than they cost score.
library TrustMath {
    uint16 internal constant BPS = 10_000;
    /// @notice Maximum share of collateral that trust can waive (80%).
    uint16 internal constant MAX_TRUST_BPS = 8_000;
    /// @notice Trust earned per completed circle, before the on-time adjustment.
    uint16 internal constant TRUST_PER_CIRCLE_BPS = 2_000;
    /// @notice Trust removed per recorded default.
    uint16 internal constant TRUST_DEFAULT_PENALTY_BPS = 2_500;

    uint16 internal constant MAX_SCORE = 1_000;
    /// @notice Number of payments over which the on-time component of the score ramps up to full weight.
    uint256 internal constant RATE_RAMP_PAYMENTS = 12;

    /// @notice On-time payment rate in bps; 0 if no payments recorded.
    function onTimeRateBps(ICreditRegistry.Record memory r) internal pure returns (uint256) {
        uint256 total = uint256(r.paymentsOnTime) + r.paymentsLate + r.defaults;
        if (total == 0) return 0;
        return (uint256(r.paymentsOnTime) * BPS) / total;
    }

    /// @notice Share (bps) of a winner's collateral requirement that may be waived, subject to the reserve.
    function trustBps(ICreditRegistry.Record memory r) internal pure returns (uint16) {
        if (r.circlesCompleted == 0) return 0;
        uint256 base = uint256(r.circlesCompleted) * TRUST_PER_CIRCLE_BPS;
        if (base > MAX_TRUST_BPS) base = MAX_TRUST_BPS;
        uint256 rate = onTimeRateBps(r);
        uint256 t = (base * rate * rate) / (uint256(BPS) * BPS);
        uint256 penalty = uint256(r.defaults) * TRUST_DEFAULT_PENALTY_BPS;
        return penalty >= t ? 0 : uint16(t - penalty);
    }

    /// @notice Credit score in [0, 1000].
    function score(ICreditRegistry.Record memory r) internal pure returns (uint16) {
        uint256 payments = uint256(r.paymentsOnTime) + r.paymentsLate + r.defaults;
        uint256 s = uint256(r.circlesCompleted) * 100;
        if (s > 500) s = 500;
        uint256 weight = payments > RATE_RAMP_PAYMENTS ? RATE_RAMP_PAYMENTS : payments;
        s += (onTimeRateBps(r) * 400 * weight) / (uint256(BPS) * RATE_RAMP_PAYMENTS);
        s += r.paymentsOnTime > 100 ? 100 : r.paymentsOnTime;
        uint256 penalty = uint256(r.defaults) * 150;
        if (penalty >= s) return 0;
        s -= penalty;
        return s > MAX_SCORE ? MAX_SCORE : uint16(s);
    }

    /// @notice Collateral waiver a winner would like, before the reserve cap.
    function desiredWaiver(uint256 debt, uint16 trust) internal pure returns (uint256) {
        return (debt * trust) / BPS;
    }
}
