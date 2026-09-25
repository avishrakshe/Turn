// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console} from "forge-std/console.sol";
import {TurnTestBase} from "../utils/TurnTestBase.sol";
import {Circle} from "../../src/Circle.sol";
import {TurnAccount} from "../../src/TurnAccount.sol";
import {ITurnAccount} from "../../src/interfaces/ITurnAccount.sol";
import {CircleTypes} from "../../src/libraries/CircleTypes.sol";

/// @notice Gas for the real user/keeper flows (EIP-7702 accounts, N=5 auction circle), with upper bounds so
///         regressions fail CI. On Monad gas is charged on the gas *limit*, so the relayer/keeper caps below
///         (docs/gas.md) are derived from these numbers. Run with -vv to print them.
contract FlowGasTest is TurnTestBase {
    function test_Gas_Flows() public {
        CircleTypes.Params memory p = auctionParams(5);
        for (uint256 i; i < 5; ++i) {
            delegate(i);
        }
        address predicted = factory.predictCircleAddress(m[0]);
        uint64 until = uint64(vm.getBlockTimestamp() + 30 days);

        ITurnAccount.Call[] memory calls = new ITurnAccount.Call[](3);
        calls[0] = call_(address(token), abi.encodeCall(token.approve, (predicted, C)));
        calls[1] = call_(
            address(factory),
            abi.encodeCall(factory.createCircle, (p, keccak256(abi.encodePacked(SECRET)), INR))
        );
        calls[2] = call_(m[0], abi.encodeCall(TurnAccount.grantPull, (predicted, C, PERIOD, until)));
        _relayMeasured(0, calls, "relayed approve+createCircle+grantPull", 750_000);

        for (uint256 i = 1; i < 5; ++i) {
            calls[0] = call_(address(token), abi.encodeCall(token.approve, (predicted, C)));
            calls[1] = call_(predicted, abi.encodeCall(Circle.join, (SECRET, INR)));
            calls[2] = call_(m[i], abi.encodeCall(TurnAccount.grantPull, (predicted, C, PERIOD, until)));
            if (i == 4) _relayMeasured(i, calls, "relayed approve+join+grantPull (starts circle)", 600_000);
            else _relayMeasured(i, calls, "relayed approve+join+grantPull", 350_000);
        }
        Circle c = Circle(predicted);

        uint256 g = gasleft();
        c.collect();
        _report("keeper collect (5 members, pull grants)", g - gasleft(), 800_000);

        calls = new ITurnAccount.Call[](1);
        calls[0] = call_(predicted, abi.encodeCall(Circle.bid, (uint16(1_000))));
        _relayMeasured(1, calls, "relayed bid", 150_000);

        warpPastBidWindow(c);
        g = gasleft();
        c.closeAuction();
        _report("keeper closeAuction", g - gasleft(), 150_000);

        g = gasleft();
        c.payout();
        _report("keeper payout", g - gasleft(), 450_000);

        warpToRoundStart(c);
        calls[0] = call_(m[1], abi.encodeCall(TurnAccount.revokePull, (predicted)));
        _relayMeasured(1, calls, "relayed revoke auto-pay", 100_000);
        c.collect();
        warpPastGrace(c);
        g = gasleft();
        c.markDefault(m[1], 2);
        _report("keeper markDefault (collateral)", g - gasleft(), 250_000);
    }

    /// @dev collect at the 10-member mainnet cap, every member paying through a pull grant.
    function test_Gas_Collect10() public {
        CircleTypes.Params memory p = auctionParams(10);
        address predicted = factory.predictCircleAddress(m[0]);
        uint64 until = uint64(vm.getBlockTimestamp() + 30 days);
        ITurnAccount.Call[] memory calls = new ITurnAccount.Call[](3);
        for (uint256 i; i < 10; ++i) {
            delegate(i);
            calls[0] = call_(address(token), abi.encodeCall(token.approve, (predicted, C)));
            calls[1] = i == 0
                ? call_(
                    address(factory),
                    abi.encodeCall(factory.createCircle, (p, keccak256(abi.encodePacked(SECRET)), INR))
                )
                : call_(predicted, abi.encodeCall(Circle.join, (SECRET, INR)));
            calls[2] = call_(m[i], abi.encodeCall(TurnAccount.grantPull, (predicted, C, PERIOD, until)));
            relay(i, calls);
        }
        uint256 g = gasleft();
        Circle(predicted).collect();
        _report("keeper collect (10 members, pull grants)", g - gasleft(), 1_500_000);
    }

    function _relayMeasured(uint256 i, ITurnAccount.Call[] memory calls, string memory name, uint256 cap)
        internal
    {
        uint256 nonce = TurnAccount(payable(m[i])).nonce();
        uint256 deadline = vm.getBlockTimestamp() + 600;
        bytes memory sig = signBatch(i, calls, nonce, deadline);
        vm.prank(relayer);
        uint256 g = gasleft();
        TurnAccount(payable(m[i])).execute(calls, nonce, deadline, sig);
        _report(name, g - gasleft(), cap);
    }

    function _report(string memory name, uint256 used, uint256 cap) internal pure {
        console.log(name, used);
        assertLe(used, cap, name);
    }
}
