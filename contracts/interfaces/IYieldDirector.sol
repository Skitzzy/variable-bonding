// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity >=0.7.5;

interface IYieldDirector {
    // Write Functions
    function deposit(uint256 amount_, address recipient_) external returns (uint256);

    function depositSmgmt(uint256 amount_, address recipient_) external returns (uint256);

    function addToDeposit(uint256 depositId_, uint256 amount_) external;

    function addToSmgmtDeposit(uint256 depositId_, uint256 amount_) external;

    function withdrawPrincipal(uint256 depositId, uint256 amount_) external;

    function withdrawPrincipalAsSmgmt(uint256 depositId_, uint256 amount_) external;

    function withdrawAll() external;

    function redeemYield(uint256 depositId_) external;

    function redeemYieldAsSmgmt(uint256 depositId_) external;

    function redeemAllYield() external;

    function redeemAllYieldAsSmgmt() external;

    // View Functions
    function getRecipientIds(address recipient_) external view returns (uint256[] memory);

    function depositsTo(address donor_, address recipient_) external view returns (uint256);

    function getAllDeposits(address donor_) external view returns (address[] memory, uint256[] memory);

    function totalDeposits(address donor_) external view returns (uint256);

    function donatedTo(address donor_, address recipient_) external view returns (uint256);

    function totalDonated(address donor_) external view returns (uint256);
}
