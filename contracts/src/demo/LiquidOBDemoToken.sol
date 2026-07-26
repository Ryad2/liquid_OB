// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {LiquidOBUnsupportedTokenDecimals, LiquidOBZeroAddress, LiquidOBZeroAmount} from "../types/ProtocolErrors.sol";

/// @notice Permissionless faucet token for public, valueless hackathon deployments only.
contract LiquidOBDemoToken is ERC20 {
    uint8 private immutable _TOKEN_DECIMALS;
    uint256 public immutable FAUCET_AMOUNT;

    event FaucetMinted(address indexed caller, address indexed recipient, uint256 amount);

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 faucetAmount_)
        ERC20(name_, symbol_)
    {
        if (decimals_ > 18) revert LiquidOBUnsupportedTokenDecimals(address(this), decimals_);
        if (faucetAmount_ == 0) revert LiquidOBZeroAmount();
        _TOKEN_DECIMALS = decimals_;
        FAUCET_AMOUNT = faucetAmount_;
    }

    function decimals() public view override returns (uint8) {
        return _TOKEN_DECIMALS;
    }

    /// @dev Anyone may mint the fixed amount. This makes the token unsuitable for assets of value by design.
    function faucet(address recipient) external returns (uint256 amount) {
        if (recipient == address(0)) revert LiquidOBZeroAddress();
        amount = FAUCET_AMOUNT;
        _mint(recipient, amount);
        emit FaucetMinted(msg.sender, recipient, amount);
    }
}
