// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Circle} from "../src/Circle.sol";
import {CircleFactory} from "../src/CircleFactory.sol";
import {TurnAccount} from "../src/TurnAccount.sol";
import {TurnKeeper} from "../src/TurnKeeper.sol";
import {MockAUSD} from "../src/test-tokens/MockAUSD.sol";

/// @notice Deploys the Turn system and writes `deployments/<chainId>.json`.
///
/// Env:
///   DEPLOYER_PRIVATE_KEY   required
///   OWNER                  factory/keeper owner (default: deployer)
///   AUSD_ADDRESS           token to use. Required on Monad mainnet (must be Agora AUSD). On other chains, if unset,
///                          a clearly labelled MockAUSD (TEST ONLY) is deployed.
///   MAX_CONTRIBUTION       default 25 AUSD on mainnet, 1000 elsewhere (6 decimals)
///   MAX_MEMBERS            default 10 on mainnet, 20 elsewhere
///   CRE_FORWARDER          Chainlink CRE forwarder for TurnKeeper (defaults per chain, see below)
///
/// Addresses verified 2026-09-26:
///   AUSD (Monad mainnet)  0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a   docs.agora.finance/developer/contract-deployments
///   AUSD (Monad testnet)  0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC   (same page; no public faucet found)
///   CRE forwarders        docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts
contract Deploy is Script {
    uint256 internal constant MONAD_MAINNET = 143;
    uint256 internal constant MONAD_TESTNET = 10143;
    address internal constant AUSD_MAINNET = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    // CRE simulation forwarders (used by `cre workflow simulate --broadcast`); switch with setForwarder for
    // production workflows (testnet 0xF8344CFd5c43616a4366C34E3EEE75af79a74482, mainnet 0x76c9cf548b4179F8901cda1f8623568b58215E62).
    address internal constant CRE_SIM_FORWARDER_TESTNET = 0xB9F79d863261869B234c481D1f9A7af84AeAd192;
    address internal constant CRE_SIM_FORWARDER_MAINNET = 0x9eF6468C5f37b976E57d52054c693269479A784d;

    error MockOnMainnet();
    error WrongMainnetToken(address token);

    struct Deployment {
        address token;
        bool mockToken;
        address circleImplementation;
        address factory;
        address registry;
        address accountImplementation;
        address keeper;
        address forwarder;
        address owner;
        uint256 startBlock;
    }

    function run() external returns (Deployment memory d) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        d.owner = vm.envOr("OWNER", deployer);
        bool mainnet = block.chainid == MONAD_MAINNET;

        address token = vm.envOr("AUSD_ADDRESS", address(0));
        if (mainnet && token != AUSD_MAINNET) revert WrongMainnetToken(token);
        uint128 maxContribution = uint128(vm.envOr("MAX_CONTRIBUTION", mainnet ? uint256(25e6) : uint256(1_000e6)));
        uint8 maxMembers = uint8(vm.envOr("MAX_MEMBERS", mainnet ? uint256(10) : uint256(20)));
        d.forwarder = vm.envOr(
            "CRE_FORWARDER", mainnet ? CRE_SIM_FORWARDER_MAINNET : CRE_SIM_FORWARDER_TESTNET
        );
        d.startBlock = block.number;

        vm.startBroadcast(pk);
        if (token == address(0)) {
            if (mainnet) revert MockOnMainnet();
            token = address(new MockAUSD());
            d.mockToken = true;
        }
        d.token = token;
        d.circleImplementation = address(new Circle());
        CircleFactory factory =
            new CircleFactory(IERC20(token), d.circleImplementation, d.owner, maxContribution, maxMembers);
        d.factory = address(factory);
        d.registry = address(factory.registry());
        d.accountImplementation = address(new TurnAccount(IERC20(token), factory));
        d.keeper = address(new TurnKeeper(factory, d.forwarder, d.owner));
        vm.stopBroadcast();

        _write(d);
    }

    function _write(Deployment memory d) internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "startBlock", d.startBlock);
        vm.serializeAddress(k, "token", d.token);
        vm.serializeBool(k, "mockToken", d.mockToken);
        vm.serializeAddress(k, "circleImplementation", d.circleImplementation);
        vm.serializeAddress(k, "factory", d.factory);
        vm.serializeAddress(k, "registry", d.registry);
        vm.serializeAddress(k, "accountImplementation", d.accountImplementation);
        vm.serializeAddress(k, "keeper", d.keeper);
        vm.serializeAddress(k, "creForwarder", d.forwarder);
        string memory json = vm.serializeAddress(k, "owner", d.owner);
        string memory path = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console.log("deployment written to", path);
    }
}
