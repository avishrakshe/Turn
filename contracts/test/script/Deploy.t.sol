// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../../script/Deploy.s.sol";
import {CircleFactory} from "../../src/CircleFactory.sol";
import {TurnKeeper} from "../../src/TurnKeeper.sol";
import {TurnAccount} from "../../src/TurnAccount.sol";
import {MockAUSD} from "../../src/test-tokens/MockAUSD.sol";

contract DeployTest is Test {
    uint256 constant PK = 0xA11CE;

    function setUp() public {
        vm.setEnv("DEPLOYER_PRIVATE_KEY", vm.toString(PK));
    }

    function test_DeploysWiredSystemWithMockOnTestChains() public {
        Deploy.Deployment memory d = new Deploy().run();
        assertTrue(d.mockToken);
        assertEq(MockAUSD(d.token).decimals(), 6);
        CircleFactory f = CircleFactory(d.factory);
        assertEq(address(f.token()), d.token);
        assertEq(f.implementation(), d.circleImplementation);
        assertEq(address(f.registry()), d.registry);
        assertEq(f.owner(), vm.addr(PK));
        assertEq(address(TurnAccount(payable(d.accountImplementation)).factory()), d.factory);
        assertEq(TurnKeeper(d.keeper).forwarder(), 0xB9F79d863261869B234c481D1f9A7af84AeAd192);
        assertEq(f.maxContribution(), 1_000e6);
    }

    function test_MainnetRequiresAgoraAusd() public {
        vm.chainId(143);
        Deploy script = new Deploy();
        vm.expectRevert(abi.encodeWithSelector(Deploy.WrongMainnetToken.selector, address(0)));
        script.run();
    }
}
