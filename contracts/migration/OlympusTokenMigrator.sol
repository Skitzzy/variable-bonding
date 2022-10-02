// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;

import "../interfaces/IERC20.sol";
import "../interfaces/IsMGMT.sol";
import "../interfaces/IwsMGMT.sol";
import "../interfaces/IgMGMT.sol";
import "../interfaces/ITreasury.sol";
import "../interfaces/IStaking.sol";
import "../interfaces/IOwnable.sol";
import "../interfaces/IUniswapV2Router.sol";
import "../interfaces/IStakingV1.sol";
import "../interfaces/ITreasuryV1.sol";

import "../types/FydeAccessControlled.sol";

import "../libraries/SafeMath.sol";
import "../libraries/SafeERC20.sol";

contract FydeTokenMigrator is FydeAccessControlled {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using SafeERC20 for IgMGMT;
    using SafeERC20 for IsMGMT;
    using SafeERC20 for IwsMGMT;

    /* ========== MIGRATION ========== */

    event TimelockStarted(uint256 block, uint256 end);
    event Migrated(address staking, address treasury);
    event Funded(uint256 amount);
    event Defunded(uint256 amount);

    /* ========== STATE VARIABLES ========== */

    IERC20 public immutable oldMGMT;
    IsMGMT public immutable oldsMGMT;
    IwsMGMT public immutable oldwsMGMT;
    ITreasuryV1 public immutable oldTreasury;
    IStakingV1 public immutable oldStaking;

    IUniswapV2Router public immutable sushiRouter;
    IUniswapV2Router public immutable uniRouter;

    IgMGMT public gMGMT;
    ITreasury public newTreasury;
    IStaking public newStaking;
    IERC20 public newMGMT;

    bool public mgmtMigrated;
    bool public shutdown;

    uint256 public immutable timelockLength;
    uint256 public timelockEnd;

    uint256 public oldSupply;

    constructor(
        address _oldMGMT,
        address _oldsMGMT,
        address _oldTreasury,
        address _oldStaking,
        address _oldwsMGMT,
        address _sushi,
        address _uni,
        uint256 _timelock,
        address _authority
    ) FydeAccessControlled(IFydeAuthority(_authority)) {
        require(_oldMGMT != address(0), "Zero address: MGMT");
        oldMGMT = IERC20(_oldMGMT);
        require(_oldsMGMT != address(0), "Zero address: sMGMT");
        oldsMGMT = IsMGMT(_oldsMGMT);
        require(_oldTreasury != address(0), "Zero address: Treasury");
        oldTreasury = ITreasuryV1(_oldTreasury);
        require(_oldStaking != address(0), "Zero address: Staking");
        oldStaking = IStakingV1(_oldStaking);
        require(_oldwsMGMT != address(0), "Zero address: wsMGMT");
        oldwsMGMT = IwsMGMT(_oldwsMGMT);
        require(_sushi != address(0), "Zero address: Sushi");
        sushiRouter = IUniswapV2Router(_sushi);
        require(_uni != address(0), "Zero address: Uni");
        uniRouter = IUniswapV2Router(_uni);
        timelockLength = _timelock;
    }

    /* ========== MIGRATION ========== */

    enum TYPE {
        UNSTAKED,
        STAKED,
        WRAPPED
    }

    // migrate MGMTv1, sMGMTv1, or wsMGMT for MGMTv2, sMGMTv2, or gMGMT
    function migrate(
        uint256 _amount,
        TYPE _from,
        TYPE _to
    ) external {
        require(!shutdown, "Shut down");

        uint256 wAmount = oldwsMGMT.sMGMTTowMGMT(_amount);

        if (_from == TYPE.UNSTAKED) {
            require(mgmtMigrated, "Only staked until migration");
            oldMGMT.safeTransferFrom(msg.sender, address(this), _amount);
        } else if (_from == TYPE.STAKED) {
            oldsMGMT.safeTransferFrom(msg.sender, address(this), _amount);
        } else {
            oldwsMGMT.safeTransferFrom(msg.sender, address(this), _amount);
            wAmount = _amount;
        }

        if (mgmtMigrated) {
            require(oldSupply >= oldMGMT.totalSupply(), "MGMTv1 minted");
            _send(wAmount, _to);
        } else {
            gMGMT.mint(msg.sender, wAmount);
        }
    }

    // migrate all Fyde tokens held
    function migrateAll(TYPE _to) external {
        require(!shutdown, "Shut down");

        uint256 mgmtBal = 0;
        uint256 sMGMTBal = oldsMGMT.balanceOf(msg.sender);
        uint256 wsMGMTBal = oldwsMGMT.balanceOf(msg.sender);

        if (oldMGMT.balanceOf(msg.sender) > 0 && mgmtMigrated) {
            mgmtBal = oldMGMT.balanceOf(msg.sender);
            oldMGMT.safeTransferFrom(msg.sender, address(this), mgmtBal);
        }
        if (sMGMTBal > 0) {
            oldsMGMT.safeTransferFrom(msg.sender, address(this), sMGMTBal);
        }
        if (wsMGMTBal > 0) {
            oldwsMGMT.safeTransferFrom(msg.sender, address(this), wsMGMTBal);
        }

        uint256 wAmount = wsMGMTBal.add(oldwsMGMT.sMGMTTowMGMT(mgmtBal.add(sMGMTBal)));
        if (mgmtMigrated) {
            require(oldSupply >= oldMGMT.totalSupply(), "MGMTv1 minted");
            _send(wAmount, _to);
        } else {
            gMGMT.mint(msg.sender, wAmount);
        }
    }

    // send preferred token
    function _send(uint256 wAmount, TYPE _to) internal {
        if (_to == TYPE.WRAPPED) {
            gMGMT.safeTransfer(msg.sender, wAmount);
        } else if (_to == TYPE.STAKED) {
            newStaking.unwrap(msg.sender, wAmount);
        } else if (_to == TYPE.UNSTAKED) {
            newStaking.unstake(msg.sender, wAmount, false, false);
        }
    }

    // bridge back to MGMT, sMGMT, or wsMGMT
    function bridgeBack(uint256 _amount, TYPE _to) external {
        if (!mgmtMigrated) {
            gMGMT.burn(msg.sender, _amount);
        } else {
            gMGMT.safeTransferFrom(msg.sender, address(this), _amount);
        }

        uint256 amount = oldwsMGMT.wMGMTTosMGMT(_amount);
        // error throws if contract does not have enough of type to send
        if (_to == TYPE.UNSTAKED) {
            oldMGMT.safeTransfer(msg.sender, amount);
        } else if (_to == TYPE.STAKED) {
            oldsMGMT.safeTransfer(msg.sender, amount);
        } else if (_to == TYPE.WRAPPED) {
            oldwsMGMT.safeTransfer(msg.sender, _amount);
        }
    }

    /* ========== OWNABLE ========== */

    // halt migrations (but not bridging back)
    function halt() external onlyPolicy {
        require(!mgmtMigrated, "Migration has occurred");
        shutdown = !shutdown;
    }

    // withdraw backing of migrated MGMT
    function defund(address reserve) external onlyGovernor {
        require(mgmtMigrated, "Migration has not begun");
        require(timelockEnd < block.number && timelockEnd != 0, "Timelock not complete");

        oldwsMGMT.unwrap(oldwsMGMT.balanceOf(address(this)));

        uint256 amountToUnstake = oldsMGMT.balanceOf(address(this));
        oldsMGMT.approve(address(oldStaking), amountToUnstake);
        oldStaking.unstake(amountToUnstake, false);

        uint256 balance = oldMGMT.balanceOf(address(this));

        if (balance > oldSupply) {
            oldSupply = 0;
        } else {
            oldSupply -= balance;
        }

        uint256 amountToWithdraw = balance.mul(1e9);
        oldMGMT.approve(address(oldTreasury), amountToWithdraw);
        oldTreasury.withdraw(amountToWithdraw, reserve);
        IERC20(reserve).safeTransfer(address(newTreasury), IERC20(reserve).balanceOf(address(this)));

        emit Defunded(balance);
    }

    // start timelock to send backing to new treasury
    function startTimelock() external onlyGovernor {
        require(timelockEnd == 0, "Timelock set");
        timelockEnd = block.number.add(timelockLength);

        emit TimelockStarted(block.number, timelockEnd);
    }

    // set gMGMT address
    function setgMGMT(address _gMGMT) external onlyGovernor {
        require(address(gMGMT) == address(0), "Already set");
        require(_gMGMT != address(0), "Zero address: gMGMT");

        gMGMT = IgMGMT(_gMGMT);
    }

    // call internal migrate token function
    function migrateToken(address token) external onlyGovernor {
        _migrateToken(token, false);
    }

    /**
     *   @notice Migrate LP and pair with new MGMT
     */
    function migrateLP(
        address pair,
        bool sushi,
        address token,
        uint256 _minA,
        uint256 _minB
    ) external onlyGovernor {
        uint256 oldLPAmount = IERC20(pair).balanceOf(address(oldTreasury));
        oldTreasury.manage(pair, oldLPAmount);

        IUniswapV2Router router = sushiRouter;
        if (!sushi) {
            router = uniRouter;
        }

        IERC20(pair).approve(address(router), oldLPAmount);
        (uint256 amountA, uint256 amountB) = router.removeLiquidity(
            token,
            address(oldMGMT),
            oldLPAmount,
            _minA,
            _minB,
            address(this),
            block.timestamp
        );

        newTreasury.mint(address(this), amountB);

        IERC20(token).approve(address(router), amountA);
        newMGMT.approve(address(router), amountB);

        router.addLiquidity(
            token,
            address(newMGMT),
            amountA,
            amountB,
            amountA,
            amountB,
            address(newTreasury),
            block.timestamp
        );
    }

    // Failsafe function to allow owner to withdraw funds sent directly to contract in case someone sends non-mgmt tokens to the contract
    function withdrawToken(
        address tokenAddress,
        uint256 amount,
        address recipient
    ) external onlyGovernor {
        require(tokenAddress != address(0), "Token address cannot be 0x0");
        require(tokenAddress != address(gMGMT), "Cannot withdraw: gMGMT");
        require(tokenAddress != address(oldMGMT), "Cannot withdraw: old-MGMT");
        require(tokenAddress != address(oldsMGMT), "Cannot withdraw: old-sMGMT");
        require(tokenAddress != address(oldwsMGMT), "Cannot withdraw: old-wsMGMT");
        require(amount > 0, "Withdraw value must be greater than 0");
        if (recipient == address(0)) {
            recipient = msg.sender; // if no address is specified the value will will be withdrawn to Owner
        }

        IERC20 tokenContract = IERC20(tokenAddress);
        uint256 contractBalance = tokenContract.balanceOf(address(this));
        if (amount > contractBalance) {
            amount = contractBalance; // set the withdrawal amount equal to balance within the account.
        }
        // transfer the token from address of this contract
        tokenContract.safeTransfer(recipient, amount);
    }

    // migrate contracts
    function migrateContracts(
        address _newTreasury,
        address _newStaking,
        address _newMGMT,
        address _newsMGMT,
        address _reserve
    ) external onlyGovernor {
        require(!mgmtMigrated, "Already migrated");
        mgmtMigrated = true;
        shutdown = false;

        require(_newTreasury != address(0), "Zero address: Treasury");
        newTreasury = ITreasury(_newTreasury);
        require(_newStaking != address(0), "Zero address: Staking");
        newStaking = IStaking(_newStaking);
        require(_newMGMT != address(0), "Zero address: MGMT");
        newMGMT = IERC20(_newMGMT);

        oldSupply = oldMGMT.totalSupply(); // log total supply at time of migration

        gMGMT.migrate(_newStaking, _newsMGMT); // change gMGMT minter

        _migrateToken(_reserve, true); // will deposit tokens into new treasury so reserves can be accounted for

        _fund(oldsMGMT.circulatingSupply()); // fund with current staked supply for token migration

        emit Migrated(_newStaking, _newTreasury);
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    // fund contract with gMGMT
    function _fund(uint256 _amount) internal {
        newTreasury.mint(address(this), _amount);
        newMGMT.approve(address(newStaking), _amount);
        newStaking.stake(address(this), _amount, false, true); // stake and claim gMGMT

        emit Funded(_amount);
    }

    /**
     *   @notice Migrate token from old treasury to new treasury
     */
    function _migrateToken(address token, bool deposit) internal {
        uint256 balance = IERC20(token).balanceOf(address(oldTreasury));

        uint256 excessReserves = oldTreasury.excessReserves();
        uint256 tokenValue = oldTreasury.valueOf(token, balance);

        if (tokenValue > excessReserves) {
            tokenValue = excessReserves;
            balance = excessReserves * 10**9;
        }

        oldTreasury.manage(token, balance);

        if (deposit) {
            IERC20(token).safeApprove(address(newTreasury), balance);
            newTreasury.deposit(balance, token, tokenValue);
        } else {
            IERC20(token).safeTransfer(address(newTreasury), balance);
        }
    }
}
