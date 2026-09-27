// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {CircleTypes} from "./libraries/CircleTypes.sol";
import {TrustMath} from "./libraries/TrustMath.sol";
import {ICircleFactory} from "./interfaces/ICircleFactory.sol";
import {ICreditRegistry} from "./interfaces/ICreditRegistry.sol";
import {ITurnAccount} from "./interfaces/ITurnAccount.sol";

/// @title Circle
/// @notice One Turn savings circle (ROSCA). N members each contribute C per round; each round one member
///         receives the pot, either in join order or through a discount auction.
/// @dev Deployed as an EIP-1167 clone by CircleFactory. See docs/plan.md §3 and docs/economics.md.
///
///      Money held by the circle is always fully accounted for (invariant I0):
///        balance == Σdeposit + Σcollateral + Σcredit + Σwithdrawable + roundPot + reserve + refundPool
///
///      Uncovered exposure never exceeds the protection reserve (invariant I1):
///        Σ max(0, debt_i − collateral_i) over winners  +  Σ rebated_j over non-winners  <=  reserve
///      so every missed payment can always be covered and no member receives less than promised.
///      The one documented exception is ejection: from the ejection round on, pots are (active members × C).
///
///      Round-advancing functions (collect, closeAuction, payout, markDefault) are permissionless and
///      guarded by state and timestamps, so anyone (Chainlink CRE, our keeper, or a member) can drive the circle.
contract Circle is Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------------------------------

    uint256 internal constant BPS = 10_000;
    /// @notice Share of an ejected member's funded contributions kept as a penalty (10%).
    uint256 public constant EJECTION_PENALTY_BPS = 1_000;
    /// @notice Gas forwarded to a member account's `pullContribution`, so one member can't grief a whole round.
    uint256 public constant PULL_GAS = 250_000;

    // ---------------------------------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------------------------------

    enum NextAction {
        NONE,
        COLLECT,
        CLOSE_AUCTION,
        MARK_DEFAULT,
        PAYOUT
    }

    struct Member {
        CircleTypes.MemberState state;
        uint8 joinIndex;
        bool hasWon;
        uint16 wonRound;
        uint16 misses;
        uint16 defaults;
        uint16 fundedRounds;
        bytes3 displayCurrency;
        uint128 deposit;
        uint128 rebated;
        uint128 collateral;
        uint128 credit;
        uint128 repayOwed;
        uint128 withdrawable;
        uint128 refundDue;
    }

    struct Round {
        uint64 start;
        address winner;
        uint16 discountBps;
        bool auctionClosed;
        bool paidOut;
        bool settlement;
    }

    struct Bid {
        uint16 bps;
        uint64 at;
        bool placed;
    }

    // ---------------------------------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------------------------------

    event Joined(address indexed member, uint256 deposit, bytes3 displayCurrency);
    event Left(address indexed member, uint256 refunded);
    event CircleStarted(uint64 startTime, address[] members);
    event RoundOpened(uint256 indexed round, uint64 start, bool settlement, uint256 potTarget);
    event ContributionPaid(
        address indexed member, uint256 indexed round, uint256 amount, uint256 creditUsed, bool onTime
    );
    event ContributionFailed(address indexed member, uint256 indexed round);
    event BidPlaced(address indexed member, uint256 indexed round, uint16 discountBps);
    event AuctionClosed(uint256 indexed round, address indexed winner, uint16 discountBps, bool noBids);
    event PayoutMade(
        address indexed winner,
        uint256 indexed round,
        uint256 pot,
        uint256 discount,
        uint256 toReserve,
        uint256 collateralRequired,
        uint256 trustWaiver,
        uint256 netPaid
    );
    event CreditAccrued(address indexed member, uint256 indexed round, uint256 amount);
    event CollateralPosted(address indexed member, uint256 amount);
    event CollateralReleased(address indexed member, uint256 amount);
    event DepositRebated(address indexed member, uint256 amount);
    event DefaultMarked(
        address indexed member,
        uint256 indexed round,
        uint256 fromDeposit,
        uint256 fromCollateral,
        uint256 fromReserve
    );
    event MemberEjected(
        address indexed member, uint256 indexed round, uint256 fundedRounds, uint256 refundDue
    );
    event RepaymentOwed(address indexed winner, address indexed ejected, uint256 amount);
    event RepaymentPaid(address indexed winner, uint256 amount, uint256 toRefunds, uint256 toReserve);
    event RoundCancelled(uint256 indexed round);
    event ReserveChanged(uint256 balance, uint256 exposure);
    event CircleCompleted(uint256 reserveDistributed, uint256 recipients);
    event Claimed(address indexed member, uint256 amount);
    event MemberProfileSet(address indexed member, bytes3 displayCurrency);

    // ---------------------------------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------------------------------

    error NotFactory();
    error Paused();
    error WrongStatus();
    error BadInvite();
    error AlreadyMember();
    error NotMember();
    error TooEarly();
    error TooLate();
    error NotAuction();
    error AlreadyWon();
    error BidTooHigh();
    error BidNotHigher();
    error AuctionAlreadyClosed();
    error AuctionNotClosed();
    error Unresolved();
    error NotCurrentRound();
    error AlreadyResolved();
    error NothingDue();
    error NothingToClaim();
    error ZeroAmount();
    error SettlementSlot();
    error InsufficientGas();

    // ---------------------------------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------------------------------

    ICircleFactory public factory;
    IERC20 public token;
    ICreditRegistry public registry;

    CircleTypes.Params internal _p;
    bytes32 public inviteHash;
    address public creator;

    CircleTypes.Status public status;
    uint64 public startTime;
    uint16 public currentRound;
    uint16 public totalRounds;
    uint16 public activeCount;
    bool public inSettlement;

    uint128 public reserveBalance;
    uint128 public roundPot;
    uint128 public refundPool;

    address[] internal _members;
    mapping(address => Member) internal _m;
    mapping(uint256 => Round) internal _rounds;
    mapping(uint256 => mapping(address => CircleTypes.PayState)) public payState;
    mapping(uint256 => mapping(address => bool)) public failedThisRound;
    mapping(uint256 => mapping(address => Bid)) public bids;

    // ---------------------------------------------------------------------------------------------
    // Setup
    // ---------------------------------------------------------------------------------------------

    constructor() {
        _disableInitializers();
    }

    /// @notice Called once by the factory right after cloning.
    function initialize(
        CircleTypes.Params calldata p,
        bytes32 inviteHash_,
        address creator_,
        IERC20 token_,
        ICreditRegistry registry_
    ) external initializer {
        factory = ICircleFactory(msg.sender);
        _p = p;
        inviteHash = inviteHash_;
        creator = creator_;
        token = token_;
        registry = registry_;
    }

    // ---------------------------------------------------------------------------------------------
    // Joining
    // ---------------------------------------------------------------------------------------------

    /// @notice Join a forming circle. Pulls the entry deposit (approve this circle first, e.g. in the same batch).
    /// @param inviteSecret Preimage of `inviteHash` from the invite link (ignored when the circle is open).
    function join(bytes32 inviteSecret, bytes3 displayCurrency) external nonReentrant {
        if (inviteHash != bytes32(0) && keccak256(abi.encodePacked(inviteSecret)) != inviteHash) {
            revert BadInvite();
        }
        _join(msg.sender, displayCurrency);
    }

    /// @notice Used by the factory to seat the creator in the same transaction as creation.
    function joinFor(address member, bytes3 displayCurrency) external nonReentrant {
        if (msg.sender != address(factory)) revert NotFactory();
        _join(member, displayCurrency);
    }

    /// @notice Leave a circle that hasn't started yet; the deposit is refunded in full.
    function leave() external nonReentrant {
        if (status != CircleTypes.Status.FORMING) revert WrongStatus();
        Member storage m = _m[msg.sender];
        if (m.state != CircleTypes.MemberState.ACTIVE) revert NotMember();
        uint256 refund = m.deposit;
        // Shift later members down so join order (which FIXED_ORDER relies on) is preserved.
        uint256 len = _members.length;
        for (uint256 i = m.joinIndex; i + 1 < len; ++i) {
            address moved = _members[i + 1];
            _members[i] = moved;
            _m[moved].joinIndex = uint8(i);
        }
        _members.pop();
        delete _m[msg.sender];
        token.safeTransfer(msg.sender, refund);
        emit Left(msg.sender, refund);
    }

    function _join(address member, bytes3 displayCurrency) internal {
        if (status != CircleTypes.Status.FORMING) revert WrongStatus();
        if (factory.paused()) revert Paused();
        if (_m[member].state != CircleTypes.MemberState.NONE) revert AlreadyMember();
        // No "full" check needed: the circle starts (status ACTIVE) the moment the n-th member joins.

        uint128 dep = _p.entryDeposit;
        token.safeTransferFrom(member, address(this), dep);

        _m[member] = Member({
            state: CircleTypes.MemberState.ACTIVE,
            joinIndex: uint8(_members.length),
            hasWon: false,
            wonRound: 0,
            misses: 0,
            defaults: 0,
            fundedRounds: 0,
            displayCurrency: displayCurrency,
            deposit: dep,
            rebated: 0,
            collateral: 0,
            credit: 0,
            repayOwed: 0,
            withdrawable: 0,
            refundDue: 0
        });
        _members.push(member);
        emit Joined(member, dep, displayCurrency);
        emit MemberProfileSet(member, displayCurrency);

        if (_members.length == _p.n) _start();
    }

    function _start() internal {
        status = CircleTypes.Status.ACTIVE;
        startTime = uint64(block.timestamp);
        totalRounds = _p.n;
        activeCount = _p.n;
        currentRound = 1;
        _rounds[1].start = uint64(block.timestamp);
        for (uint256 i; i < _members.length; ++i) {
            registry.onJoined(_members[i]);
        }
        emit CircleStarted(uint64(block.timestamp), _members);
        emit RoundOpened(1, uint64(block.timestamp), false, uint256(_p.n) * _p.contribution);
    }

    // ---------------------------------------------------------------------------------------------
    // Profile & collateral
    // ---------------------------------------------------------------------------------------------

    /// @notice Set the currency this member sees amounts in (display only; settlement is always in the token).
    function setDisplayCurrency(bytes3 displayCurrency) external {
        Member storage m = _m[msg.sender];
        if (m.state == CircleTypes.MemberState.NONE) revert NotMember();
        m.displayCurrency = displayCurrency;
        emit MemberProfileSet(msg.sender, displayCurrency);
    }

    /// @notice Post extra collateral. Before winning it reduces what is withheld from the payout;
    ///         after winning it reduces the circle's uncovered exposure.
    function postCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (status == CircleTypes.Status.COMPLETED) revert WrongStatus();
        Member storage m = _m[msg.sender];
        if (m.state != CircleTypes.MemberState.ACTIVE) revert NotMember();
        token.safeTransferFrom(msg.sender, address(this), amount);
        m.collateral += uint128(amount);
        emit CollateralPosted(msg.sender, amount);
    }

    // ---------------------------------------------------------------------------------------------
    // Collection
    // ---------------------------------------------------------------------------------------------

    /// @notice Collect this round's contribution from every member who hasn't paid yet.
    /// @dev A failed pull never reverts the round; it marks the member late for this round.
    function collect() external nonReentrant {
        uint256 r = _openRound();
        uint256 len = _members.length;
        for (uint256 i; i < len; ++i) {
            _collectFrom(_members[i], r);
        }
    }

    /// @notice Collect from a single member (e.g. right after they top up).
    function collectFrom(address member) external nonReentrant {
        uint256 r = _openRound();
        _collectFrom(member, r);
    }

    function _openRound() internal view returns (uint256 r) {
        if (status != CircleTypes.Status.ACTIVE) revert WrongStatus();
        r = currentRound;
        if (block.timestamp < _rounds[r].start) revert TooEarly();
    }

    function _collectFrom(address who, uint256 r) internal {
        Member storage m = _m[who];
        if (m.state != CircleTypes.MemberState.ACTIVE) return;
        if (payState[r][who] != CircleTypes.PayState.NONE) return;
        uint256 due = _dueThisRound(m);
        if (due == 0) return;

        uint256 creditUse = m.credit < due ? m.credit : due;
        uint256 toPull = due - creditUse;
        if (toPull > 0 && !_pull(who, m, r, toPull)) {
            if (!failedThisRound[r][who]) {
                failedThisRound[r][who] = true;
                emit ContributionFailed(who, r);
            }
            return;
        }
        m.credit -= uint128(creditUse);
        bool onTime = !failedThisRound[r][who];
        payState[r][who] = CircleTypes.PayState.PAID;
        emit ContributionPaid(who, r, due, creditUse, onTime);
        registry.onPayment(who, due, onTime);
        _applyContribution(who, m, due, onTime);
    }

    /// @dev Pull `amount` from a member: first via their TurnAccount pull grant (EIP-7702), then via allowance.
    ///      Success is judged by the token balance actually received, never by the member's return value.
    function _pull(address who, Member storage m, uint256 r, uint256 amount) internal returns (bool) {
        uint256 before = token.balanceOf(address(this));
        if (who.code.length > 0) {
            // Make sure the member's account gets its full gas budget, so a caller can't starve the call
            // (EIP-150 forwards at most 63/64 of the remaining gas) and get an honest member marked late.
            if (gasleft() < (PULL_GAS * 64) / 63 + 20_000) revert InsufficientGas();
            try ITurnAccount(who).pullContribution{gas: PULL_GAS}(r, amount) {} catch {}
            uint256 got = token.balanceOf(address(this)) - before;
            if (got >= amount) {
                if (got > amount) m.withdrawable += uint128(got - amount);
                return true;
            }
            if (got > 0) {
                // Partial transfer from a non-standard account: keep it as the member's credit.
                m.credit += uint128(got);
                return false;
            }
        }
        if (!token.trySafeTransferFrom(who, address(this), amount)) return false;
        uint256 received = token.balanceOf(address(this)) - before;
        if (received < amount) {
            m.credit += uint128(received);
            return false;
        }
        if (received > amount) m.withdrawable += uint128(received - amount);
        return true;
    }

    /// @dev Book a resolved contribution (paid or covered) for the current round. Must be called after
    ///      payState is set, so the member's debt already excludes this round.
    function _applyContribution(address who, Member storage m, uint256 due, bool releaseCollateral) internal {
        if (inSettlement) {
            m.repayOwed -= uint128(due);
            _splitRepayment(who, due);
        } else {
            roundPot += uint128(due);
            m.fundedRounds += 1;
        }
        if (m.hasWon && releaseCollateral && m.collateral > 0) {
            uint256 debtAfter = _debtOf(who, m);
            uint256 debtBefore = debtAfter + due;
            uint256 keep =
                debtAfter == 0 ? 0 : Math.mulDiv(m.collateral, debtAfter, debtBefore, Math.Rounding.Ceil);
            if (keep > m.collateral) keep = m.collateral;
            uint256 release = m.collateral - keep;
            if (release > 0) {
                m.collateral = uint128(keep);
                m.withdrawable += uint128(release);
                emit CollateralReleased(who, release);
            }
        }
    }

    /// @dev 90% of each ejection repayment funds the ejected members' refunds; 10% goes to the reserve.
    function _splitRepayment(address who, uint256 amount) internal {
        uint256 toReserve = (amount * EJECTION_PENALTY_BPS) / BPS;
        uint256 toRefunds = amount - toReserve;
        refundPool += uint128(toRefunds);
        reserveBalance += uint128(toReserve);
        emit RepaymentPaid(who, amount, toRefunds, toReserve);
        emit ReserveChanged(reserveBalance, _exposure());
    }

    // ---------------------------------------------------------------------------------------------
    // Auction
    // ---------------------------------------------------------------------------------------------

    /// @notice Bid a discount (bps of the pot) to receive this round's pot. Highest discount wins;
    ///         ties go to the earliest bid. Raising your own bid is allowed; lowering is not.
    function bid(uint16 discountBps) external nonReentrant {
        if (_p.mode != CircleTypes.Mode.AUCTION) revert NotAuction();
        if (status != CircleTypes.Status.ACTIVE) revert WrongStatus();
        if (inSettlement) revert SettlementSlot();
        uint256 r = currentRound;
        Round storage rd = _rounds[r];
        if (rd.auctionClosed) revert AuctionAlreadyClosed();
        if (block.timestamp < rd.start) revert TooEarly();
        if (block.timestamp >= uint256(rd.start) + _p.bidWindow) revert TooLate();
        Member storage m = _m[msg.sender];
        if (m.state != CircleTypes.MemberState.ACTIVE) revert NotMember();
        if (m.hasWon) revert AlreadyWon();
        if (discountBps > _p.maxDiscountBps) revert BidTooHigh();
        // The payout must still be able to cover what the winner will owe, even with no trust waiver.
        uint256 pot = uint256(activeCount) * _p.contribution;
        uint256 gross = pot - (pot * discountBps) / BPS;
        uint256 owed = uint256(totalRounds - r) * _p.contribution;
        if (gross + m.deposit + m.collateral < owed) revert BidTooHigh();
        Bid storage b = bids[r][msg.sender];
        if (b.placed && discountBps <= b.bps) revert BidNotHigher();
        b.bps = discountBps;
        b.at = uint64(block.timestamp);
        b.placed = true;
        emit BidPlaced(msg.sender, r, discountBps);
    }

    /// @notice Close bidding and fix this round's recipient. FIXED_ORDER circles can close as soon as the round opens.
    function closeAuction() external nonReentrant {
        if (status != CircleTypes.Status.ACTIVE) revert WrongStatus();
        if (inSettlement) revert SettlementSlot();
        uint256 r = currentRound;
        Round storage rd = _rounds[r];
        if (rd.auctionClosed) revert AuctionAlreadyClosed();
        uint256 opensAt = uint256(rd.start) + (_p.mode == CircleTypes.Mode.AUCTION ? _p.bidWindow : 0);
        if (block.timestamp < opensAt) revert TooEarly();
        _selectWinner(r);
    }

    function _selectWinner(uint256 r) internal {
        Round storage rd = _rounds[r];
        address best;
        uint16 bestBps;
        uint64 bestAt;
        bool anyBid;
        uint256 eligible;
        address onlyOne;
        uint256 len = _members.length;

        for (uint256 i; i < len; ++i) {
            address a = _members[i];
            Member storage m = _m[a];
            if (m.state != CircleTypes.MemberState.ACTIVE || m.hasWon) continue;
            eligible++;
            onlyOne = a;
            if (_p.mode == CircleTypes.Mode.FIXED_ORDER) {
                if (best == address(0)) best = a; // _members is in join order
                continue;
            }
            Bid storage b = bids[r][a];
            if (!b.placed) continue;
            if (!anyBid || b.bps > bestBps || (b.bps == bestBps && b.at < bestAt)) {
                best = a;
                bestBps = b.bps;
                bestAt = b.at;
                anyBid = true;
            }
        }

        if (eligible == 1) {
            best = onlyOne;
            bestBps = 0;
        } else if (_p.mode == CircleTypes.Mode.AUCTION && !anyBid) {
            // Nobody bid: best credit score wins; ties go to join order.
            uint16 bestScore;
            best = address(0);
            for (uint256 i; i < len; ++i) {
                address a = _members[i];
                Member storage m = _m[a];
                if (m.state != CircleTypes.MemberState.ACTIVE || m.hasWon) continue;
                uint16 s = registry.score(a);
                if (best == address(0) || s > bestScore) {
                    best = a;
                    bestScore = s;
                }
            }
            bestBps = 0;
        }

        rd.winner = best;
        rd.discountBps = bestBps;
        rd.auctionClosed = true;
        emit AuctionClosed(r, best, bestBps, _p.mode == CircleTypes.Mode.AUCTION && !anyBid);
    }

    // ---------------------------------------------------------------------------------------------
    // Payout
    // ---------------------------------------------------------------------------------------------

    /// @notice Pay this round's pot to its recipient, once every member has paid or been covered.
    ///         In a settlement slot this just closes the slot.
    function payout() external nonReentrant {
        if (status != CircleTypes.Status.ACTIVE) revert WrongStatus();
        uint256 r = currentRound;
        Round storage rd = _rounds[r];
        if (block.timestamp < rd.start) revert TooEarly();
        if (!_allResolved(r)) revert Unresolved();
        if (!inSettlement) {
            if (!rd.auctionClosed) revert AuctionNotClosed();
            _payWinner(r, rd);
        }
        rd.paidOut = true;
        _advance();
    }

    function _payWinner(uint256 r, Round storage rd) internal {
        address w = rd.winner;
        Member storage wm = _m[w];
        uint256 c = _p.contribution;
        uint256 pot = roundPot;

        // What the winner will still owe after this round.
        uint256 debt = uint256(totalRounds - r) * c;
        // Winning ends the deposit-rebate budget line; the winner's exposure moves to (debt − collateral).
        wm.rebated = 0;
        uint256 exposureOthers = _exposure();
        uint256 available = reserveBalance > exposureOthers ? reserveBalance - exposureOthers : 0;
        uint256 waiver = TrustMath.desiredWaiver(debt, registry.trustBps(w));
        if (waiver > available) waiver = available;
        uint256 needK = debt - waiver;
        uint256 have = uint256(wm.deposit) + wm.collateral;

        uint256 discount = (pot * rd.discountBps) / BPS;
        // Defensive: if the winner's deposit was consumed after bidding, cap the discount so collateral is covered.
        if (pot - discount + have < needK) {
            discount = pot + have - needK;
            rd.discountBps = uint16((discount * BPS) / pot);
            discount = (pot * rd.discountBps) / BPS;
        }
        uint256 gross = pot - discount;
        uint256 toReserve = (discount * _p.reserveBps) / BPS;
        uint256 toShare = discount - toReserve;

        // Credit the discount share to every other active member.
        uint256 others = uint256(activeCount) - 1;
        if (others > 0 && toShare > 0) {
            uint256 share = toShare / others;
            uint256 len = _members.length;
            for (uint256 i; i < len; ++i) {
                address a = _members[i];
                if (a == w || _m[a].state != CircleTypes.MemberState.ACTIVE) continue;
                _m[a].credit += uint128(share);
                emit CreditAccrued(a, r, share);
            }
            toReserve += toShare - share * others;
        } else {
            toReserve += toShare;
        }

        uint256 netPaid = gross + have - needK;
        wm.deposit = 0;
        wm.collateral = uint128(needK);
        wm.hasWon = true;
        wm.wonRound = uint16(r);
        roundPot = 0;
        reserveBalance += uint128(toReserve);

        if (netPaid > 0 && !token.trySafeTransfer(w, netPaid)) wm.withdrawable += uint128(netPaid);
        emit PayoutMade(w, r, pot, discount, toReserve, needK, waiver, netPaid);

        _applyRebates();
        emit ReserveChanged(reserveBalance, _exposure());
    }

    /// @dev Refund part of trusted non-winners' deposits, as far as the reserve can back it (counted in I1).
    function _applyRebates() internal {
        uint256 exposure = _exposure();
        if (reserveBalance <= exposure) return;
        uint256 available = reserveBalance - exposure;
        uint256 len = _members.length;
        for (uint256 i; i < len && available > 0; ++i) {
            address a = _members[i];
            Member storage m = _m[a];
            if (m.state != CircleTypes.MemberState.ACTIVE || m.hasWon || m.misses > 0) continue;
            uint256 trust = registry.trustBps(a);
            if (trust == 0) continue;
            uint256 target = (uint256(_p.entryDeposit) * trust) / BPS;
            if (target <= m.rebated) continue;
            uint256 amt = target - m.rebated;
            if (amt > available) amt = available;
            if (amt > m.deposit) amt = m.deposit;
            if (amt == 0) continue;
            m.deposit -= uint128(amt);
            m.rebated += uint128(amt);
            m.withdrawable += uint128(amt);
            available -= amt;
            emit DepositRebated(a, amt);
        }
    }

    function _advance() internal {
        uint256 r = currentRound;
        bool regularDone = inSettlement || r >= totalRounds;
        if (regularDone) {
            if (!_anyRepayOwed()) {
                _complete();
                return;
            }
            inSettlement = true;
        }
        uint256 next = r + 1;
        currentRound = uint16(next);
        uint256 scheduled = uint256(startTime) + (next - 1) * _p.period;
        uint64 start = uint64(scheduled > block.timestamp ? scheduled : block.timestamp);
        Round storage nr = _rounds[next];
        nr.start = start;
        nr.settlement = inSettlement;
        emit RoundOpened(next, start, inSettlement, inSettlement ? 0 : uint256(activeCount) * _p.contribution);
    }

    // ---------------------------------------------------------------------------------------------
    // Defaults & ejection
    // ---------------------------------------------------------------------------------------------

    /// @notice After the grace period, cover a member's missed payment for the current round.
    ///         Winners: collateral first, then the reserve. Non-winners: the deposit covers the first miss;
    ///         a second miss ejects them.
    function markDefault(address member, uint256 round) external nonReentrant {
        if (status != CircleTypes.Status.ACTIVE) revert WrongStatus();
        if (round != currentRound) revert NotCurrentRound();
        Round storage rd = _rounds[round];
        if (block.timestamp < uint256(rd.start) + _p.gracePeriod) revert TooEarly();
        Member storage m = _m[member];
        if (m.state != CircleTypes.MemberState.ACTIVE) revert NotMember();
        if (payState[round][member] != CircleTypes.PayState.NONE) revert AlreadyResolved();
        uint256 due = _dueThisRound(m);
        if (due == 0) revert NothingDue();

        if (m.hasWon) {
            uint256 fromK = m.collateral < due ? m.collateral : due;
            uint256 fromR = due - fromK;
            // I1 guarantees fromR <= exposure_i <= reserve.
            m.collateral -= uint128(fromK);
            reserveBalance -= uint128(fromR);
            _recordDefault(member, m);
            payState[round][member] = CircleTypes.PayState.COVERED;
            emit DefaultMarked(member, round, 0, fromK, fromR);
            _applyContribution(member, m, due, false);
            emit ReserveChanged(reserveBalance, _exposure());
        } else if (m.misses == 0) {
            uint256 fromD = m.deposit < due ? m.deposit : due;
            uint256 fromR = due - fromD; // <= rebated, since entryDeposit >= C
            m.deposit -= uint128(fromD);
            reserveBalance -= uint128(fromR);
            m.rebated = 0; // the deposit has done its job; its rebate budget line closes
            m.misses = 1;
            _recordDefault(member, m);
            payState[round][member] = CircleTypes.PayState.COVERED;
            emit DefaultMarked(member, round, fromD, 0, fromR);
            _applyContribution(member, m, due, false);
            emit ReserveChanged(reserveBalance, _exposure());
        } else {
            _recordDefault(member, m);
            _eject(member, m, round);
        }
    }

    function _recordDefault(address member, Member storage m) internal {
        m.defaults += 1;
        registry.onDefault(member);
    }

    /// @dev Second miss by a non-winner. This round becomes the first post-ejection round: pots are now
    ///      (activeCount × C) and the circle runs one fewer round. Every earlier winner was funded by the
    ///      ejected member and owes C back, collected in a settlement slot after the last round.
    function _eject(address member, Member storage m, uint256 r) internal {
        m.state = CircleTypes.MemberState.EJECTED;
        activeCount -= 1;
        totalRounds -= 1;

        uint256 c = _p.contribution;
        uint256 k = m.fundedRounds;
        uint256 perRound = c - (c * EJECTION_PENALTY_BPS) / BPS;
        m.refundDue = uint128(k * perRound);
        // Leftover deposit (if entryDeposit > C), any collateral they posted, and credit are returned now;
        // the refund of their contributions arrives at completion.
        m.withdrawable += m.deposit + m.collateral + m.credit;
        m.deposit = 0;
        m.collateral = 0;
        m.credit = 0;
        m.rebated = 0;

        for (uint256 j = 1; j < r; ++j) {
            if (payState[j][member] == CircleTypes.PayState.NONE) continue;
            address w = _rounds[j].winner;
            _m[w].repayOwed += uint128(c);
            emit RepaymentOwed(w, member, c);
        }
        emit MemberEjected(member, r, k, m.refundDue);

        Round storage rd = _rounds[r];
        if (_eligibleCount() == 0) {
            _cancelRound(r);
        } else if (rd.auctionClosed && rd.winner == member) {
            _selectWinner(r);
        }
        emit ReserveChanged(reserveBalance, _exposure());
    }

    /// @dev The ejected member was the last one still to receive: this round has no recipient. It becomes the
    ///      first settlement slot, and payments already made this round are applied to the payers' repayments.
    function _cancelRound(uint256 r) internal {
        Round storage rd = _rounds[r];
        rd.winner = address(0);
        rd.auctionClosed = true;
        rd.settlement = true;
        inSettlement = true;
        uint256 len = _members.length;
        for (uint256 i; i < len; ++i) {
            address a = _members[i];
            Member storage m = _m[a];
            if (m.state != CircleTypes.MemberState.ACTIVE) continue;
            if (payState[r][a] == CircleTypes.PayState.NONE) continue;
            uint256 paid = _p.contribution;
            m.fundedRounds -= 1;
            uint256 applied = m.repayOwed < paid ? m.repayOwed : paid;
            if (applied > 0) {
                m.repayOwed -= uint128(applied);
                _splitRepayment(a, applied);
            }
            if (paid > applied) m.credit += uint128(paid - applied);
        }
        roundPot = 0;
        emit RoundCancelled(r);
    }

    // ---------------------------------------------------------------------------------------------
    // Completion & claims
    // ---------------------------------------------------------------------------------------------

    function _complete() internal {
        status = CircleTypes.Status.COMPLETED;
        uint256 len = _members.length;

        uint256 recipients;
        for (uint256 i; i < len; ++i) {
            Member storage m = _m[_members[i]];
            if (m.state == CircleTypes.MemberState.ACTIVE && m.defaults == 0) recipients++;
        }
        bool fallbackAll = recipients == 0;
        if (fallbackAll) recipients = activeCount;

        uint256 reserveLeft = reserveBalance;
        uint256 share = recipients == 0 ? 0 : reserveLeft / recipients;
        uint256 dust = reserveLeft - share * recipients;
        reserveBalance = 0;

        for (uint256 i; i < len; ++i) {
            address a = _members[i];
            Member storage m = _m[a];
            if (m.state == CircleTypes.MemberState.ACTIVE) {
                uint256 amt = uint256(m.deposit) + m.collateral + m.credit;
                if (m.defaults == 0 || fallbackAll) {
                    amt += share + dust;
                    dust = 0;
                }
                m.deposit = 0;
                m.collateral = 0;
                m.credit = 0;
                m.rebated = 0;
                m.withdrawable += uint128(amt);
                registry.onCompleted(a);
            } else if (m.state == CircleTypes.MemberState.EJECTED) {
                uint256 refund = m.refundDue;
                refundPool -= uint128(refund);
                m.refundDue = 0;
                m.withdrawable += uint128(refund);
            }
        }
        // Each repayment adds exactly (C − C/10) per funded round to the pool, which is what refunds are computed
        // from, so the pool is fully paid out here (asserted by the invariant tests).
        emit CircleCompleted(reserveLeft, recipients);
    }

    /// @notice Withdraw everything currently owed to you (released collateral, rebates, and at the end:
    ///         deposit, remaining collateral, credit, reserve share, or an ejection refund).
    function claim() external nonReentrant {
        Member storage m = _m[msg.sender];
        uint256 amt = m.withdrawable;
        if (amt == 0) revert NothingToClaim();
        m.withdrawable = 0;
        token.safeTransfer(msg.sender, amt);
        emit Claimed(msg.sender, amt);
    }

    // ---------------------------------------------------------------------------------------------
    // Internal views
    // ---------------------------------------------------------------------------------------------

    function _dueThisRound(Member storage m) internal view returns (uint256) {
        if (inSettlement) {
            uint256 c = _p.contribution;
            return m.repayOwed < c ? m.repayOwed : c;
        }
        return _p.contribution;
    }

    /// @dev Outstanding obligations of a member: unpaid regular rounds (from the current one) plus repayments.
    function _debtOf(address who, Member storage m) internal view returns (uint256 d) {
        d = m.repayOwed;
        uint256 r = currentRound;
        if (inSettlement || r > totalRounds) return d;
        uint256 remaining = uint256(totalRounds) - r + 1;
        if (payState[r][who] != CircleTypes.PayState.NONE) remaining -= 1;
        d += remaining * _p.contribution;
    }

    /// @dev Total uncovered exposure: waived collateral of winners + rebated deposits of non-winners.
    function _exposure() internal view returns (uint256 total) {
        uint256 len = _members.length;
        for (uint256 i; i < len; ++i) {
            address a = _members[i];
            Member storage m = _m[a];
            if (m.state != CircleTypes.MemberState.ACTIVE) continue;
            if (m.hasWon) {
                uint256 d = _debtOf(a, m);
                if (d > m.collateral) total += d - m.collateral;
            } else {
                total += m.rebated;
            }
        }
    }

    function _allResolved(uint256 r) internal view returns (bool) {
        uint256 len = _members.length;
        for (uint256 i; i < len; ++i) {
            address a = _members[i];
            Member storage m = _m[a];
            if (m.state != CircleTypes.MemberState.ACTIVE) continue;
            if (payState[r][a] != CircleTypes.PayState.NONE) continue;
            if (_dueThisRound(m) > 0) return false;
        }
        return true;
    }

    function _eligibleCount() internal view returns (uint256 n) {
        uint256 len = _members.length;
        for (uint256 i; i < len; ++i) {
            Member storage m = _m[_members[i]];
            if (m.state == CircleTypes.MemberState.ACTIVE && !m.hasWon) n++;
        }
    }

    function _anyRepayOwed() internal view returns (bool) {
        uint256 len = _members.length;
        for (uint256 i; i < len; ++i) {
            Member storage m = _m[_members[i]];
            if (m.state == CircleTypes.MemberState.ACTIVE && m.repayOwed > 0) return true;
        }
        return false;
    }

    // ---------------------------------------------------------------------------------------------
    // External views
    // ---------------------------------------------------------------------------------------------

    function params() external view returns (CircleTypes.Params memory) {
        return _p;
    }

    function members() external view returns (address[] memory) {
        return _members;
    }

    function roundInfo(uint256 r) external view returns (Round memory) {
        return _rounds[r];
    }

    function memberInfo(address who) external view returns (CircleTypes.MemberView memory v) {
        Member storage m = _m[who];
        v.state = m.state;
        v.joinIndex = m.joinIndex;
        v.hasWon = m.hasWon;
        v.wonRound = m.wonRound;
        v.misses = m.misses;
        v.defaults = m.defaults;
        v.fundedRounds = m.fundedRounds;
        v.deposit = m.deposit;
        v.rebated = m.rebated;
        v.collateral = m.collateral;
        v.debt = m.state == CircleTypes.MemberState.ACTIVE && status == CircleTypes.Status.ACTIVE
            ? uint128(_debtOf(who, m))
            : 0;
        v.credit = m.credit;
        v.repayOwed = m.repayOwed;
        v.withdrawable = m.withdrawable;
        v.displayCurrency = m.displayCurrency;
    }

    /// @notice Current reserve and total uncovered exposure (I1: exposure <= balance).
    function reserve() external view returns (uint256 balance, uint256 exposure) {
        return (reserveBalance, status == CircleTypes.Status.ACTIVE ? _exposure() : 0);
    }

    /// @notice Sum of every balance the circle owes someone (I0: equals the token balance).
    function accountedBalance() external view returns (uint256 total) {
        uint256 len = _members.length;
        for (uint256 i; i < len; ++i) {
            Member storage m = _m[_members[i]];
            total += uint256(m.deposit) + m.collateral + m.credit + m.withdrawable;
        }
        total += uint256(roundPot) + reserveBalance + refundPool;
    }

    function potTarget() external view returns (uint256) {
        return uint256(activeCount) * _p.contribution;
    }

    /// @notice What a keeper should do next, and for which member (MARK_DEFAULT only).
    function nextAction() external view returns (NextAction action, address member) {
        if (status != CircleTypes.Status.ACTIVE) return (NextAction.NONE, address(0));
        uint256 r = currentRound;
        Round storage rd = _rounds[r];
        if (block.timestamp < rd.start) return (NextAction.NONE, address(0));

        bool pastGrace = block.timestamp >= uint256(rd.start) + _p.gracePeriod;
        bool unresolved;
        uint256 len = _members.length;
        for (uint256 i; i < len; ++i) {
            address a = _members[i];
            Member storage m = _m[a];
            if (m.state != CircleTypes.MemberState.ACTIVE) continue;
            if (payState[r][a] != CircleTypes.PayState.NONE || _dueThisRound(m) == 0) continue;
            if (!failedThisRound[r][a]) return (NextAction.COLLECT, address(0));
            if (pastGrace) return (NextAction.MARK_DEFAULT, a);
            unresolved = true;
        }
        if (!inSettlement && !rd.auctionClosed) {
            uint256 opensAt = uint256(rd.start) + (_p.mode == CircleTypes.Mode.AUCTION ? _p.bidWindow : 0);
            if (block.timestamp >= opensAt) return (NextAction.CLOSE_AUCTION, address(0));
            return (NextAction.NONE, address(0));
        }
        if (unresolved) return (NextAction.NONE, address(0));
        return (NextAction.PAYOUT, address(0));
    }
}
