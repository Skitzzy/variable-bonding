// SPDX-License-Identifier: AGPL-3.0
pragma solidity >=0.7.5;

import "./IERC20.sol";

// Old wsMGMT interface
interface IwsMGMT is IERC20 {
    function wrap(uint256 _amount) external returns (uint256);

    function unwrap(uint256 _amount) external returns (uint256);

    function wMGMTTosMGMT(uint256 _amount) external view returns (uint256);

    function sMGMTTowMGMT(uint256 _amount) external view returns (uint256);
}
