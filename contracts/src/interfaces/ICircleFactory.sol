// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CircleTypes} from "../libraries/CircleTypes.sol";
import {ICreditRegistry} from "./ICreditRegistry.sol";

/// @title ICircleFactory
/// @notice Deploys Turn circles and is the sole authority that registers them with the CreditRegistry.
interface ICircleFactory {
    event CircleCreated(
        address indexed circle, address indexed creator, CircleTypes.Params params, bytes32 inviteHash
    );
    event LimitsUpdated(uint128 maxContribution, uint8 maxMembers);

    error InvalidParams();

    function token() external view returns (IERC20);
    function registry() external view returns (ICreditRegistry);
    function implementation() external view returns (address);
    function isCircle(address circle) external view returns (bool);
    function paused() external view returns (bool);
    function maxContribution() external view returns (uint128);
    function maxMembers() external view returns (uint8);

    function predictCircleAddress(address creator) external view returns (address);
    function createCircle(CircleTypes.Params calldata p, bytes32 inviteHash, bytes3 creatorCurrency)
        external
        returns (address circle);
}
