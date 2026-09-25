// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {CircleTypes} from "./libraries/CircleTypes.sol";
import {ICircleFactory} from "./interfaces/ICircleFactory.sol";
import {ICreditRegistry} from "./interfaces/ICreditRegistry.sol";
import {CreditRegistry} from "./CreditRegistry.sol";
import {Circle} from "./Circle.sol";

/// @title CircleFactory
/// @notice Creates Turn savings circles as minimal-proxy clones and registers them as the only writers to the
///         CreditRegistry.
/// @dev Mainnet-beta guardrails: owner-configurable `maxContribution` and `maxMembers`, and a pause that blocks
///      only *new* circles and *new* joins. Nothing already in a circle can be paused: collecting, payouts, defaults
///      and claims always work.
contract CircleFactory is ICircleFactory, Ownable, Pausable {
    uint8 public constant MIN_MEMBERS = 3;
    uint8 public constant MAX_MEMBERS_CEILING = 20;
    uint16 public constant MAX_DISCOUNT_CEILING_BPS = 5_000;
    uint32 public constant MIN_PERIOD = 60;

    /// @inheritdoc ICircleFactory
    IERC20 public immutable token;
    /// @inheritdoc ICircleFactory
    ICreditRegistry public immutable registry;
    /// @inheritdoc ICircleFactory
    address public immutable implementation;

    /// @inheritdoc ICircleFactory
    uint128 public maxContribution;
    /// @inheritdoc ICircleFactory
    uint8 public maxMembers;

    mapping(address => bool) public isCircle;
    mapping(address => uint256) public creatorNonce;
    address[] public allCircles;

    constructor(IERC20 token_, address implementation_, address owner_, uint128 maxContribution_, uint8 maxMembers_)
        Ownable(owner_)
    {
        token = token_;
        implementation = implementation_;
        registry = new CreditRegistry(address(this));
        _setLimits(maxContribution_, maxMembers_);
    }

    /// @inheritdoc ICircleFactory
    function paused() public view override(ICircleFactory, Pausable) returns (bool) {
        return super.paused();
    }

    /// @inheritdoc ICircleFactory
    function predictCircleAddress(address creator) public view returns (address) {
        return Clones.predictDeterministicAddress(implementation, _salt(creator, creatorNonce[creator]));
    }

    /// @inheritdoc ICircleFactory
    /// @dev The creator joins as the first member, so they must have approved `predictCircleAddress(creator)`
    ///      for `p.entryDeposit` beforehand (done in the same relayed batch).
    function createCircle(CircleTypes.Params calldata p, bytes32 inviteHash, bytes3 creatorCurrency)
        external
        whenNotPaused
        returns (address circle)
    {
        _validate(p);
        circle = Clones.cloneDeterministic(implementation, _salt(msg.sender, creatorNonce[msg.sender]++));
        isCircle[circle] = true;
        allCircles.push(circle);
        Circle(circle).initialize(p, inviteHash, msg.sender, token, registry);
        registry.authorize(circle);
        emit CircleCreated(circle, msg.sender, p, inviteHash);
        Circle(circle).joinFor(msg.sender, creatorCurrency);
    }

    function circleCount() external view returns (uint256) {
        return allCircles.length;
    }

    // ---- admin ----

    function setLimits(uint128 maxContribution_, uint8 maxMembers_) external onlyOwner {
        _setLimits(maxContribution_, maxMembers_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---- internal ----

    function _setLimits(uint128 maxContribution_, uint8 maxMembers_) internal {
        if (maxContribution_ == 0 || maxMembers_ < MIN_MEMBERS || maxMembers_ > MAX_MEMBERS_CEILING) {
            revert InvalidParams();
        }
        maxContribution = maxContribution_;
        maxMembers = maxMembers_;
        emit LimitsUpdated(maxContribution_, maxMembers_);
    }

    function _validate(CircleTypes.Params calldata p) internal view {
        bool ok = p.n >= MIN_MEMBERS && p.n <= maxMembers && p.contribution > 0 && p.contribution <= maxContribution
            && p.period >= MIN_PERIOD && p.entryDeposit >= p.contribution && p.reserveBps <= 10_000
            && p.maxDiscountBps <= MAX_DISCOUNT_CEILING_BPS && uint256(p.bidWindow) + p.gracePeriod < p.period;
        if (p.mode == CircleTypes.Mode.AUCTION) ok = ok && p.bidWindow > 0;
        else ok = ok && p.bidWindow == 0 && p.maxDiscountBps == 0;
        if (!ok) revert InvalidParams();
    }

    function _salt(address creator, uint256 n) internal pure returns (bytes32) {
        return keccak256(abi.encode(creator, n));
    }
}
