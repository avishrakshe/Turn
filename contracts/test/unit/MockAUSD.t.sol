// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockAUSD} from "../../src/test-tokens/MockAUSD.sol";

contract MockAUSDTest is Test {
    function test_MetadataMatchesAusdDecimals() public {
        MockAUSD t = new MockAUSD();
        assertEq(t.decimals(), 6, "AUSD on Monad has 6 decimals");
        assertEq(t.symbol(), "mAUSD");
        assertEq(t.name(), "Mock AUSD (TEST ONLY)");
    }

    function test_FaucetCapped() public {
        MockAUSD t = new MockAUSD();
        t.faucet(address(1), 1_000e6);
        assertEq(t.balanceOf(address(1)), 1_000e6);
        vm.expectRevert(MockAUSD.FaucetCap.selector);
        t.faucet(address(1), 1_000e6 + 1);
    }
}
