// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CircleTypes
/// @notice Shared enums and structs for Turn savings circles.
library CircleTypes {
    /// @notice How the recipient of each round's pot is chosen.
    enum Mode {
        FIXED_ORDER, // members receive in join order
        AUCTION // members bid a discount; highest discount wins
    }

    enum Status {
        FORMING, // waiting for `n` members to join
        ACTIVE, // rounds running (including settlement slots after an ejection)
        COMPLETED // all rounds and settlements done; members claim
    }

    enum MemberState {
        NONE,
        ACTIVE,
        EJECTED
    }

    /// @notice Per-round payment status of one member.
    enum PayState {
        NONE, // not yet paid this round
        PAID, // paid (from wallet and/or credit)
        COVERED // missed; covered by deposit / collateral / reserve after the grace period
    }

    /// @notice Circle parameters, fixed at creation.
    struct Params {
        uint8 n; // members (3..factory.maxMembers)
        uint128 contribution; // C, in token units
        uint32 period; // seconds per round
        Mode mode;
        uint16 maxDiscountBps; // highest allowed auction discount
        uint32 bidWindow; // seconds from round start during which bids are accepted
        uint32 gracePeriod; // seconds from round start after which a missed payment can be marked default
        uint128 entryDeposit; // held from each member at join; >= C
        uint16 reserveBps; // share of each auction discount paid into the protection reserve
    }

    /// @notice Read-only view of a member, for UIs and keepers.
    struct MemberView {
        MemberState state;
        uint8 joinIndex;
        bool hasWon;
        uint16 wonRound;
        uint16 misses; // misses before winning (deposit-covered)
        uint16 defaults; // total misses in this circle
        uint16 fundedRounds; // k: rounds this member funded (paid or deposit-covered)
        uint128 deposit;
        uint128 rebated; // Y: deposit refunded early against the reserve budget
        uint128 collateral; // K: collateral held (after winning) or posted externally (before)
        uint128 debt; // D: outstanding obligations, computed
        uint128 credit;
        uint128 repayOwed; // ejection repayments still owed
        uint128 withdrawable;
        bytes3 displayCurrency;
    }
}
