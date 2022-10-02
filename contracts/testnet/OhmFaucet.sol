// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;

import "../interfaces/IERC20.sol";
import "../types/Ownable.sol";

contract MGMTFaucet is Ownable {
    IERC20 public mgmt;

    constructor(address _mgmt) {
        mgmt = IERC20(_mgmt);
    }

    function setMGMT(address _mgmt) external onlyOwner {
        mgmt = IERC20(_mgmt);
    }

    function dispense() external {
        mgmt.transfer(msg.sender, 1e9);
    }
}
