// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MockAUSD} from "../../src/test-tokens/MockAUSD.sol";
import {Circle} from "../../src/Circle.sol";
import {CircleFactory} from "../../src/CircleFactory.sol";
import {CreditRegistry} from "../../src/CreditRegistry.sol";
import {TurnAccount} from "../../src/TurnAccount.sol";
import {ITurnAccount} from "../../src/interfaces/ITurnAccount.sol";
import {CircleTypes} from "../../src/libraries/CircleTypes.sol";

abstract contract TurnTestBase is Test {
    MockAUSD internal token;
    Circle internal impl;
    CircleFactory internal factory;
    CreditRegistry internal registry;
    TurnAccount internal accountImpl;

    address internal owner = makeAddr("owner");
    address internal relayer = makeAddr("relayer");

    uint128 internal constant C = 100e6; // 100 AUSD (6 decimals)
    uint32 internal constant PERIOD = 300;
    uint32 internal constant BID_WINDOW = 120;
    uint32 internal constant GRACE = 60;
    uint256 internal constant START_BALANCE = 100_000e6;
    bytes32 internal constant SECRET = keccak256("invite-secret");
    bytes3 internal constant INR = "INR";

    address[] internal m; // m[0] is the creator
    uint256[] internal pk;

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        token = new MockAUSD();
        impl = new Circle();
        factory = new CircleFactory(token, address(impl), owner, 1_000e6, 20);
        registry = CreditRegistry(address(factory.registry()));
        accountImpl = new TurnAccount(token, factory);
        for (uint256 i; i < 20; ++i) {
            (address a, uint256 k) = makeAddrAndKey(string.concat("member", vm.toString(i)));
            m.push(a);
            pk.push(k);
            deal(address(token), a, START_BALANCE);
        }
        // Let this test contract write credit history directly.
        vm.prank(address(factory));
        registry.authorize(address(this));
    }

    // ---------------------------------------------------------------------------------------------
    // Params & creation
    // ---------------------------------------------------------------------------------------------

    function auctionParams(uint8 n) internal pure returns (CircleTypes.Params memory p) {
        p = CircleTypes.Params({
            n: n,
            contribution: C,
            period: PERIOD,
            mode: CircleTypes.Mode.AUCTION,
            maxDiscountBps: 3_000,
            bidWindow: BID_WINDOW,
            gracePeriod: GRACE,
            entryDeposit: C,
            reserveBps: 2_000
        });
    }

    function fixedParams(uint8 n) internal pure returns (CircleTypes.Params memory p) {
        p = auctionParams(n);
        p.mode = CircleTypes.Mode.FIXED_ORDER;
        p.maxDiscountBps = 0;
        p.bidWindow = 0;
    }

    /// @dev Creates a circle with m[0] as creator and m[1..joiners] joining (allowance-based members).
    function createCircle(CircleTypes.Params memory p, uint256 joiners) internal returns (Circle c) {
        address predicted = factory.predictCircleAddress(m[0]);
        vm.prank(m[0]);
        token.approve(predicted, type(uint256).max);
        vm.prank(m[0]);
        c = Circle(factory.createCircle(p, keccak256(abi.encodePacked(SECRET)), INR));
        assertEq(address(c), predicted);
        for (uint256 i = 1; i <= joiners; ++i) {
            joinAs(c, m[i]);
        }
    }

    function joinAs(Circle c, address who) internal {
        vm.prank(who);
        token.approve(address(c), type(uint256).max);
        vm.prank(who);
        c.join(SECRET, INR);
    }

    function fullCircle(CircleTypes.Params memory p) internal returns (Circle c) {
        c = createCircle(p, p.n - 1);
        assertEq(uint8(c.status()), uint8(CircleTypes.Status.ACTIVE));
    }

    // ---------------------------------------------------------------------------------------------
    // Round helpers
    // ---------------------------------------------------------------------------------------------

    function roundStart(Circle c) internal view returns (uint256) {
        return c.roundInfo(c.currentRound()).start;
    }

    function warpToRoundStart(Circle c) internal {
        uint256 s = roundStart(c);
        if (vm.getBlockTimestamp() < s) vm.warp(s);
    }

    function warpPastBidWindow(Circle c) internal {
        uint256 t = roundStart(c) + BID_WINDOW;
        if (vm.getBlockTimestamp() < t) vm.warp(t);
    }

    function warpPastGrace(Circle c) internal {
        uint256 t = roundStart(c) + GRACE;
        if (vm.getBlockTimestamp() < t) vm.warp(t);
    }

    function bidAs(Circle c, address who, uint16 bps) internal {
        vm.prank(who);
        c.bid(bps);
    }

    /// @dev Stop a member from paying by removing their allowance (and their grant, if any).
    function stopPaying(Circle c, address who) internal {
        vm.prank(who);
        token.approve(address(c), 0);
    }

    function resumePaying(Circle c, address who) internal {
        vm.prank(who);
        token.approve(address(c), type(uint256).max);
    }

    /// @dev Run one regular round: collect, close, payout (everyone paying).
    function runRound(Circle c) internal {
        warpToRoundStart(c);
        c.collect();
        if (c.params().mode == CircleTypes.Mode.AUCTION) warpPastBidWindow(c);
        c.closeAuction();
        c.payout();
    }

    function claimAll(Circle c) internal {
        address[] memory ms = c.members();
        for (uint256 i; i < ms.length; ++i) {
            if (c.memberInfo(ms[i]).withdrawable > 0) {
                vm.prank(ms[i]);
                c.claim();
            }
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Invariant helpers
    // ---------------------------------------------------------------------------------------------

    function assertAccounted(Circle c) internal view {
        assertEq(token.balanceOf(address(c)), c.accountedBalance(), "I0: balance != accounted");
    }

    function assertExposureCovered(Circle c) internal view {
        (uint256 bal, uint256 exposure) = c.reserve();
        assertLe(exposure, bal, "I1: exposure > reserve");
    }

    function checkAll(Circle c) internal view {
        assertAccounted(c);
        assertExposureCovered(c);
    }

    // ---------------------------------------------------------------------------------------------
    // Credit history
    // ---------------------------------------------------------------------------------------------

    function giveHistory(address who, uint256 completed, uint256 onTime, uint256 late, uint256 defaults) internal {
        for (uint256 i; i < completed; ++i) registry.onCompleted(who);
        for (uint256 i; i < onTime; ++i) registry.onPayment(who, C, true);
        for (uint256 i; i < late; ++i) registry.onPayment(who, C, false);
        for (uint256 i; i < defaults; ++i) registry.onDefault(who);
    }

    // ---------------------------------------------------------------------------------------------
    // EIP-7702 / TurnAccount helpers
    // ---------------------------------------------------------------------------------------------

    function delegate(uint256 i) internal {
        vm.signAndAttachDelegation(address(accountImpl), pk[i]);
        // A no-op call carries the authorization; the delegation then persists.
        vm.prank(relayer);
        (bool ok,) = m[i].call("");
        assertTrue(ok);
        assertEq(m[i].code, abi.encodePacked(hex"ef0100", address(accountImpl)));
    }

    function signBatch(uint256 i, ITurnAccount.Call[] memory calls, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = TurnAccount(payable(m[i])).hashCalls(calls, nonce, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk[i], digest);
        return abi.encodePacked(r, s, v);
    }

    function relay(uint256 i, ITurnAccount.Call[] memory calls) internal {
        uint256 nonce = TurnAccount(payable(m[i])).nonce();
        uint256 deadline = vm.getBlockTimestamp() + 600;
        bytes memory sig = signBatch(i, calls, nonce, deadline);
        vm.prank(relayer);
        TurnAccount(payable(m[i])).execute(calls, nonce, deadline, sig);
    }

    function call_(address target, bytes memory data) internal pure returns (ITurnAccount.Call memory) {
        return ITurnAccount.Call({target: target, data: data});
    }
}
