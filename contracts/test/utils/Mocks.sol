// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Circle} from "../../src/Circle.sol";

/// @dev A member that is a smart contract (not an EIP-7702 account) with configurable pull behaviour.
contract ContractMember {
    enum PullMode {
        REVERT,
        PARTIAL,
        EXCESS
    }

    IERC20 public token;
    PullMode public mode;

    constructor(IERC20 token_) {
        token = token_;
    }

    function setMode(PullMode m) external {
        mode = m;
    }

    function approve(address spender, uint256 amount) external {
        token.approve(spender, amount);
    }

    function join(Circle c, bytes32 secret) external {
        token.approve(address(c), type(uint256).max);
        c.join(secret, "USD");
    }

    function claim(Circle c) external {
        c.claim();
    }

    function pullContribution(uint256, uint256 amount) external {
        if (mode == PullMode.PARTIAL) token.transfer(msg.sender, amount / 2);
        else if (mode == PullMode.EXCESS) token.transfer(msg.sender, amount + 1e6);
        else revert("no");
    }
}

/// @dev ERC-20 with test switches: a fee on transferFrom and a recipient blocklist (like a sanctions list).
contract QuirkyToken is ERC20 {
    uint256 public feeBps;
    mapping(address => bool) public blocked;

    constructor() ERC20("Quirky", "QRK") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFee(uint256 bps) external {
        feeBps = bps;
    }

    function setBlocked(address who, bool b) external {
        blocked[who] = b;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[to], "blocked");
        super._update(from, to, value);
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        _spendAllowance(from, msg.sender, value);
        uint256 fee = (value * feeBps) / 10_000;
        if (fee > 0) _burn(from, fee);
        _transfer(from, to, value - fee);
        return true;
    }
}
