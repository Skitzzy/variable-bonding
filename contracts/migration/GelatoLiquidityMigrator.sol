// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.10;
pragma abicoder v2;

import "../libraries/SafeERC20.sol";

import "../interfaces/ITreasury.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/IUniswapV2Router.sol";
import "../interfaces/IFydeAuthority.sol";

import "../types/FydeAccessControlled.sol";

interface IGUniRouter {
    function addLiquidity(
        address pool,
        uint256 amount0Max,
        uint256 amount1Max,
        uint256 amount0Min,
        uint256 amount1Min,
        address receiver
    ) external;
}

contract GelatoLiquidityMigrator is FydeAccessControlled {
    using SafeERC20 for IERC20;

    // GUni Router
    IGUniRouter internal immutable gUniRouter = IGUniRouter(0x513E0a261af2D33B46F98b81FED547608fA2a03d);

    // Fyde Treasury
    ITreasury internal immutable treasury = ITreasury(0x9A315BdF513367C0377FB36545857d12e85813Ef);

    // Uniswap Router
    IUniswapV2Router internal immutable router = IUniswapV2Router(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);

    address internal immutable MGMTFRAXGUniPool = 0x61a0C8d4945A61bF26c13e07c30AF1f1ca67b473;
    address internal immutable MGMTFRAXLP = 0xB612c37688861f1f90761DC7F382C2aF3a50Cc39;
    address internal immutable MGMT = 0x64aa3364F17a4D01c6f1751Fd97C2BD3D7e7f1D5;
    address internal immutable FRAX = 0x853d955aCEf822Db058eb8505911ED77F175b99e;

    constructor(IFydeAuthority _authority) FydeAccessControlled(_authority) {}

    /**
     * @notice Removes liquidity from MGMT/FRAX LP, then adds liquidty to
     * MGMT/FRAX GUni
     */
    function moveLiquidity(
        uint256 _amountMGMTFRAX,
        uint256[2] calldata _minMGMTFRAXLP,
        uint256[2] calldata _minMGMTFRAXGUni,
        uint256 _deadline
    ) external onlyGuardian {
        // Manage LP from treasury
        treasury.manage(MGMTFRAXLP, _amountMGMTFRAX);

        // Approve LP to be spent by the uni router
        IERC20(MGMTFRAXLP).approve(address(router), _amountMGMTFRAX);

        // Remove specified liquidity from MGMT/FRAX LP
        (uint256 amountMGMT, uint256 amountFRAX) = router.removeLiquidity(
            MGMT,
            FRAX,
            _amountMGMTFRAX,
            _minMGMTFRAXLP[0],
            _minMGMTFRAXLP[1],
            address(this),
            _deadline
        );

        // Approve Balancer vault to spend tokens
        IERC20(MGMT).approve(address(gUniRouter), amountMGMT);
        IERC20(FRAX).approve(address(gUniRouter), amountFRAX);

        gUniRouter.addLiquidity(
            MGMTFRAXGUniPool,
            amountMGMT,
            amountFRAX,
            _minMGMTFRAXGUni[0],
            _minMGMTFRAXGUni[1],
            address(treasury)
        );

        // Send any leftover MGMT back to guardian and FRAX to treasury
        IERC20(MGMT).safeTransfer(authority.guardian(), IERC20(MGMT).balanceOf(address(this)));
        IERC20(FRAX).safeTransfer(address(treasury), IERC20(FRAX).balanceOf(address(this)));
    }
}
