// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockAUSD — TEST ONLY
/// @notice Stand-in for Agora AUSD on local chains and Monad testnet until real testnet AUSD is available.
///         NOT the Agora token. Never deploy to mainnet (the deploy script refuses on chain 143).
/// @dev 6 decimals, matching AUSD on Monad (verified onchain). Public faucet with a per-call cap.
contract MockAUSD is ERC20 {
    uint256 public constant FAUCET_CAP = 1_000e6;

    error FaucetCap();

    constructor() ERC20("Mock AUSD (TEST ONLY)", "mAUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint up to FAUCET_CAP test tokens to `to`.
    function faucet(address to, uint256 amount) external {
        if (amount > FAUCET_CAP) revert FaucetCap();
        _mint(to, amount);
    }
}
