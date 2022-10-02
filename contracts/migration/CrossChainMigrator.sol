// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;

import "../interfaces/IERC20.sol";
import "../interfaces/IOwnable.sol";
import "../types/Ownable.sol";
import "../libraries/SafeERC20.sol";

contract CrossChainMigrator is Ownable {
    using SafeERC20 for IERC20;

    IERC20 internal immutable wsMGMT; // v1 token
    IERC20 internal immutable gMGMT; // v2 token

    constructor(address _wsMGMT, address _gMGMT) {
        require(_wsMGMT != address(0), "Zero address: wsMGMT");
        wsMGMT = IERC20(_wsMGMT);
        require(_gMGMT != address(0), "Zero address: gMGMT");
        gMGMT = IERC20(_gMGMT);
    }

    // migrate wsMGMT to gMGMT - 1:1 like kind
    function migrate(uint256 amount) external {
        wsMGMT.safeTransferFrom(msg.sender, address(this), amount);
        gMGMT.safeTransfer(msg.sender, amount);
    }

    // withdraw wsMGMT so it can be bridged on ETH and returned as more gMGMT
    function replenish() external onlyOwner {
        wsMGMT.safeTransfer(msg.sender, wsMGMT.balanceOf(address(this)));
    }

    // withdraw migrated wsMGMT and unmigrated gMGMT
    function clear() external onlyOwner {
        wsMGMT.safeTransfer(msg.sender, wsMGMT.balanceOf(address(this)));
        gMGMT.safeTransfer(msg.sender, gMGMT.balanceOf(address(this)));
    }
}
