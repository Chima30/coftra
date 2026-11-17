// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title CoftraDemoNFT
/// @notice TESTNET ONLY. A controlled collection for the spending-session demo: `mint(to)` charges a
///         fixed price in the payment token, pulled from the caller.
contract CoftraDemoNFT is ERC721 {
    using SafeERC20 for IERC20;

    IERC20 public immutable paymentToken;
    uint256 public immutable price;
    address public immutable treasury;
    uint256 public totalMinted;

    error ZeroAddress();

    constructor(IERC20 paymentToken_, uint256 price_, address treasury_) ERC721("Coftra Demo Pass", "CDP") {
        if (treasury_ == address(0) || address(paymentToken_) == address(0)) revert ZeroAddress();
        paymentToken = paymentToken_;
        price = price_;
        treasury = treasury_;
    }

    function mint(address to) external returns (uint256 tokenId) {
        paymentToken.safeTransferFrom(msg.sender, treasury, price);
        tokenId = ++totalMinted;
        _mint(to, tokenId);
    }
}
