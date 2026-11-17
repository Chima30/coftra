// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title CoftraMockUSDC
/// @notice TESTNET ONLY. A worthless, non-redeemable token for demos. Anyone can mint a small amount.
contract CoftraMockUSDC is ERC20 {
    uint256 public constant FAUCET_LIMIT = 10_000e6;

    error FaucetLimit();

    constructor() ERC20("Coftra Test USDC (no value)", "tUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        if (amount > FAUCET_LIMIT) revert FaucetLimit();
        _mint(to, amount);
    }
}
