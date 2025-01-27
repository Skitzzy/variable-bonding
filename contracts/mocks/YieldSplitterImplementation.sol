// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.10;

import {YieldSplitter} from "../types/YieldSplitter.sol";
import {IgMGMT} from "../interfaces/IgMGMT.sol";

/**
    @title YieldSplitterImpl
    @notice Implements the abstract contract Yield Splitter by making all the internal functions public for testing purposes.
*/
contract YieldSplitterImpl is YieldSplitter {
    /**
    @notice Constructor
    @param sMGMT_ Address of sMGMT.
    */
    constructor(address sMGMT_, address authority_) YieldSplitter(sMGMT_, authority_) {}

    /**
        @notice Create a deposit.
        @param depositor_ Address of depositor
        @param amount_ Amount in gMGMT. 18 decimals.
    */
    function deposit(address depositor_, uint256 amount_) external returns (uint256 depositId) {
        depositId = _deposit(depositor_, amount_);
    }

    /**
        @notice Add more gMGMT to the depositor's principal deposit.
        @param id_ Id of the deposit.
        @param amount_ Amount of gMGMT to add. 18 decimals.
    */
    function addToDeposit(uint256 id_, uint256 amount_) external {
        _addToDeposit(id_, amount_, msg.sender);
    }

    /**
        @notice Withdraw part of the principal amount deposited.
        @param id_ Id of the deposit.
        @param amount_ Amount of gMGMT to withdraw.
    */
    function withdrawPrincipal(uint256 id_, uint256 amount_) external {
        _withdrawPrincipal(id_, amount_, msg.sender);
    }

    /**
        @notice Withdraw all of the principal amount deposited.
        @param id_ Id of the deposit.
        @return amountWithdrawn : amount of gMGMT withdrawn. 18 decimals.
    */
    function withdrawAllPrincipal(uint256 id_) external returns (uint256 amountWithdrawn) {
        return _withdrawAllPrincipal(id_, msg.sender);
    }

    /**
        @notice Redeem excess yield from your deposit in sMGMT.
        @param id_ Id of the deposit.
        @return amountRedeemed : amount of yield redeemed in gMGMT. 18 decimals.
    */
    function redeemYield(uint256 id_) external returns (uint256) {
        return _redeemYield(id_);
    }

    /**
        @notice Redeems yield from a deposit and sends it to the recipient
        @param id_ Id of the deposit.
    */
    function redeemYieldOnBehalfOf(uint256 id_) external override returns (uint256) {
        require(hasPermissionToRedeem[msg.sender], "unauthorized");
        return _redeemYield(id_);
    }

    /**
        @notice Close a deposit. Remove all information in both the deposit info, depositorIds and recipientIds.
        @param id_ Id of the deposit.
        @dev Internally for accounting reasons principal amount is stored in 9 decimal MGMT terms. 
        Since most implementations will work will gMGMT, principal here is returned externally in 18 decimal gMGMT terms.
        @return principal : amount of principal that was deleted. in gMGMT. 18 decimals.
        @return agnosticAmount : total amount of gMGMT deleted. Principal + Yield. 18 decimals.
    */
    function closeDeposit(uint256 id_) external returns (uint256 principal, uint256 agnosticAmount) {
        (principal, agnosticAmount) = _closeDeposit(id_, msg.sender);
    }

    /**
        @notice Calculate outstanding yield redeemable based on principal and agnosticAmount.
        @return uint256 amount of yield in gMGMT. 18 decimals.
     */
    function getOutstandingYield(uint256 principal_, uint256 agnosticAmount_) external view returns (uint256) {
        return _getOutstandingYield(principal_, agnosticAmount_);
    }
}
