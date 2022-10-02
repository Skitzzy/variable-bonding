// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.15;

import {IERC20} from "../interfaces/IERC20.sol";
import {SafeERC20} from "../libraries/SafeERC20.sol";

error OTCEscrow_UnapprovedUser();
error OTCEscrow_NotFyde();
error OTCEscrow_TradeInProgress();

/// @title  Fyde OTC Escrow
/// @notice Fyde OTC Escrow Contract
/// @dev    The Fyde OTC Escrow contract is a reusable contract for handling OTC trades
///         with other crypto institutions
contract OTCEscrow {
    using SafeERC20 for IERC20;

    /* ========== STATE VARIABLES ========== */

    /// Involved Parties
    address public Fyde;
    address public tradePartner;

    /// OTC Tokens
    address public FydeToken;
    address public externalToken;

    /// Token Amounts
    uint256 public FydeAmount;
    uint256 public externalAmount;

    constructor(
        address Fyde_,
        address tradePartner_,
        address FydeToken_,
        address externalToken_,
        uint256 FydeAmount_,
        uint256 externalAmount_
    ) {
        Fyde = Fyde_;
        tradePartner = tradePartner_;

        FydeToken = FydeToken_;
        externalToken = externalToken_;

        FydeAmount = FydeAmount_;
        externalAmount = externalAmount_;
    }

    /* ========== MODIFIERS ========== */

    modifier onlyApprovedParties() {
        if (msg.sender != Fyde && msg.sender != tradePartner) revert OTCEscrow_UnapprovedUser();
        _;
    }

    modifier onlyFyde() {
        if (msg.sender != Fyde) revert OTCEscrow_NotFyde();
        _;
    }

    modifier tradeInactive() {
        uint256 FydeTokenBalance = IERC20(FydeToken).balanceOf(address(this));
        if (FydeTokenBalance != 0) revert OTCEscrow_TradeInProgress();
        _;
    }

    /* ========== OTC TRADE FUNCTIONS ========== */

    /// @notice Exchanges tokens by transferring tokens from the trade partner to Fyde and
    ///         Fyde's tokens that were escrowed in the contract to the trade partner
    /// @notice Access restricted to Fyde and the trade partner
    function swap() external onlyApprovedParties {
        IERC20(externalToken).safeTransferFrom(tradePartner, Fyde, externalAmount);
        IERC20(FydeToken).safeTransfer(tradePartner, FydeAmount);
    }

    /// @notice Cancels an OTC trade and returns Fyde's escrowed tokens to the multisig
    /// @notice Access restricted to Fyde
    function revoke() external onlyFyde {
        uint256 FydeTokenBalance = IERC20(FydeToken).balanceOf(address(this));
        IERC20(FydeToken).safeTransfer(Fyde, FydeTokenBalance);
    }

    /// @notice Allows removal of trade partner tokens if they were accidentally sent to the
    ///         contract rather than exchanged through the swap function
    /// @notice Access restricted to Fyde and the trade partner
    function revokeReceivedToken() external onlyApprovedParties {
        uint256 externalTokenBalance = IERC20(externalToken).balanceOf(address(this));
        IERC20(externalToken).safeTransfer(tradePartner, externalTokenBalance);
    }

    /* ========== MANAGEMENT FUNCTIONS ========== */

    /// @notice Sets the trade parameters for a new OTC exchange if no trade is in progress
    /// @notice Access restricted to Fyde
    function newTrade(
        address tradePartner_,
        address FydeToken_,
        address externalToken_,
        uint256 FydeAmount_,
        uint256 externalAmount_
    ) external onlyFyde tradeInactive {
        tradePartner = tradePartner_;

        FydeToken = FydeToken_;
        externalToken = externalToken_;

        FydeAmount = FydeAmount_;
        externalAmount = externalAmount_;
    }
}
