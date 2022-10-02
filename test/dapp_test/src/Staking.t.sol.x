// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import "ds-test/test.sol"; // ds-test

import "../../../contracts/libraries/SafeMath.sol";
import "../../../contracts/libraries/FixedPoint.sol";
import "../../../contracts/libraries/FullMath.sol";
import "../../../contracts/Staking.sol";
import "../../../contracts/FydeERC20.sol";
import "../../../contracts/sFydeERC20.sol";
import "../../../contracts/governance/gMGMT.sol";
import "../../../contracts/Treasury.sol";
import "../../../contracts/StakingDistributor.sol";
import "../../../contracts/FydeAuthority.sol";

import "./util/Hevm.sol";
import "./util/MockContract.sol";

contract StakingTest is DSTest {
    using FixedPoint for *;
    using SafeMath for uint256;
    using SafeMath for uint112;

    FydeStaking internal staking;
    FydeTreasury internal treasury;
    FydeAuthority internal authority;
    Distributor internal distributor;

    FydeERC20Token internal mgmt;
    sFyde internal smgmt;
    gMGMT internal gmgmt;

    MockContract internal mockToken;

    /// @dev Hevm setup
    Hevm internal constant hevm = Hevm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    uint256 internal constant AMOUNT = 1000;
    uint256 internal constant EPOCH_LENGTH = 8; // In Seconds
    uint256 internal constant START_TIME = 0; // Starting at this epoch
    uint256 internal constant NEXT_REBASE_TIME = 1; // Next epoch is here
    uint256 internal constant BOUNTY = 42;

    function setUp() public {
        // Start at timestamp
        hevm.warp(START_TIME);

        // Setup mockToken to deposit into treasury (for excess reserves)
        mockToken = new MockContract();
        mockToken.givenMethodReturn(abi.encodeWithSelector(ERC20.name.selector), abi.encode("mock DAO"));
        mockToken.givenMethodReturn(abi.encodeWithSelector(ERC20.symbol.selector), abi.encode("MOCK"));
        mockToken.givenMethodReturnUint(abi.encodeWithSelector(ERC20.decimals.selector), 18);
        mockToken.givenMethodReturnBool(abi.encodeWithSelector(IERC20.transferFrom.selector), true);

        authority = new FydeAuthority(address(this), address(this), address(this), address(this));

        mgmt = new FydeERC20Token(address(authority));
        gmgmt = new gMGMT(address(this), address(this));
        smgmt = new sFyde();
        smgmt.setIndex(10);
        smgmt.setgMGMT(address(gmgmt));

        treasury = new FydeTreasury(address(mgmt), 1, address(authority));

        staking = new FydeStaking(
            address(mgmt),
            address(smgmt),
            address(gmgmt),
            EPOCH_LENGTH,
            START_TIME,
            NEXT_REBASE_TIME,
            address(authority)
        );

        distributor = new Distributor(address(treasury), address(mgmt), address(staking), address(authority));
        distributor.setBounty(BOUNTY);
        staking.setDistributor(address(distributor));
        treasury.enable(FydeTreasury.STATUS.REWARDMANAGER, address(distributor), address(0)); // Allows distributor to mint mgmt.
        treasury.enable(FydeTreasury.STATUS.RESERVETOKEN, address(mockToken), address(0)); // Allow mock token to be deposited into treasury
        treasury.enable(FydeTreasury.STATUS.RESERVEDEPOSITOR, address(this), address(0)); // Allow this contract to deposit token into treeasury

        smgmt.initialize(address(staking), address(treasury));
        gmgmt.migrate(address(staking), address(smgmt));

        // Give the treasury permissions to mint
        authority.pushVault(address(treasury), true);

        // Deposit a token who's profit (3rd param) determines how much mgmt the treasury can mint
        uint256 depositAmount = 20e18;
        treasury.deposit(depositAmount, address(mockToken), BOUNTY.mul(2)); // Mints (depositAmount- 2xBounty) for this contract
    }

    function testStakeNoBalance() public {
        uint256 newAmount = AMOUNT.mul(2);
        try staking.stake(address(this), newAmount, true, true) {
            fail();
        } catch Error(string memory error) {
            assertEq(error, "TRANSFER_FROM_FAILED"); // Should be 'Transfer exceeds balance'
        }
    }

    function testStakeWithoutAllowance() public {
        try staking.stake(address(this), AMOUNT, true, true) {
            fail();
        } catch Error(string memory error) {
            assertEq(error, "TRANSFER_FROM_FAILED"); // Should be 'Transfer exceeds allowance'
        }
    }

    function testStake() public {
        mgmt.approve(address(staking), AMOUNT);
        uint256 amountStaked = staking.stake(address(this), AMOUNT, true, true);
        assertEq(amountStaked, AMOUNT);
    }

    function testStakeAtRebaseToGmgmt() public {
        // Move into next rebase window
        hevm.warp(EPOCH_LENGTH);

        mgmt.approve(address(staking), AMOUNT);
        bool isSmgmt = false;
        bool claim = true;
        uint256 gMGMTRecieved = staking.stake(address(this), AMOUNT, isSmgmt, claim);

        uint256 expectedAmount = gmgmt.balanceTo(AMOUNT.add(BOUNTY));
        assertEq(gMGMTRecieved, expectedAmount);
    }

    function testStakeAtRebase() public {
        // Move into next rebase window
        hevm.warp(EPOCH_LENGTH);

        mgmt.approve(address(staking), AMOUNT);
        bool isSmgmt = true;
        bool claim = true;
        uint256 amountStaked = staking.stake(address(this), AMOUNT, isSmgmt, claim);

        uint256 expectedAmount = AMOUNT.add(BOUNTY);
        assertEq(amountStaked, expectedAmount);
    }

    function testUnstake() public {
        bool triggerRebase = true;
        bool isSmgmt = true;
        bool claim = true;

        // Stake the mgmt
        uint256 initialMGMTBalance = mgmt.balanceOf(address(this));
        mgmt.approve(address(staking), initialMGMTBalance);
        uint256 amountStaked = staking.stake(address(this), initialMGMTBalance, isSmgmt, claim);
        assertEq(amountStaked, initialMGMTBalance);

        // Validate balances post stake
        uint256 mgmtBalance = mgmt.balanceOf(address(this));
        uint256 sMGMTBalance = smgmt.balanceOf(address(this));
        assertEq(mgmtBalance, 0);
        assertEq(sMGMTBalance, initialMGMTBalance);

        // Unstake sMGMT
        smgmt.approve(address(staking), sMGMTBalance);
        staking.unstake(address(this), sMGMTBalance, triggerRebase, isSmgmt);

        // Validate Balances post unstake
        mgmtBalance = mgmt.balanceOf(address(this));
        sMGMTBalance = smgmt.balanceOf(address(this));
        assertEq(mgmtBalance, initialMGMTBalance);
        assertEq(sMGMTBalance, 0);
    }

    function testUnstakeAtRebase() public {
        bool triggerRebase = true;
        bool isSmgmt = true;
        bool claim = true;

        // Stake the mgmt
        uint256 initialMGMTBalance = mgmt.balanceOf(address(this));
        mgmt.approve(address(staking), initialMGMTBalance);
        uint256 amountStaked = staking.stake(address(this), initialMGMTBalance, isSmgmt, claim);
        assertEq(amountStaked, initialMGMTBalance);

        // Move into next rebase window
        hevm.warp(EPOCH_LENGTH);

        // Validate balances post stake
        // Post initial rebase, distribution amount is 0, so sMGMT balance doens't change.
        uint256 mgmtBalance = mgmt.balanceOf(address(this));
        uint256 sMGMTBalance = smgmt.balanceOf(address(this));
        assertEq(mgmtBalance, 0);
        assertEq(sMGMTBalance, initialMGMTBalance);

        // Unstake sMGMT
        smgmt.approve(address(staking), sMGMTBalance);
        staking.unstake(address(this), sMGMTBalance, triggerRebase, isSmgmt);

        // Validate balances post unstake
        mgmtBalance = mgmt.balanceOf(address(this));
        sMGMTBalance = smgmt.balanceOf(address(this));
        uint256 expectedAmount = initialMGMTBalance.add(BOUNTY); // Rebase earns a bounty
        assertEq(mgmtBalance, expectedAmount);
        assertEq(sMGMTBalance, 0);
    }

    function testUnstakeAtRebaseFromGmgmt() public {
        bool triggerRebase = true;
        bool isSmgmt = false;
        bool claim = true;

        // Stake the mgmt
        uint256 initialMGMTBalance = mgmt.balanceOf(address(this));
        mgmt.approve(address(staking), initialMGMTBalance);
        uint256 amountStaked = staking.stake(address(this), initialMGMTBalance, isSmgmt, claim);
        uint256 gmgmtAmount = gmgmt.balanceTo(initialMGMTBalance);
        assertEq(amountStaked, gmgmtAmount);

        // test the unstake
        // Move into next rebase window
        hevm.warp(EPOCH_LENGTH);

        // Validate balances post-stake
        uint256 mgmtBalance = mgmt.balanceOf(address(this));
        uint256 gmgmtBalance = gmgmt.balanceOf(address(this));
        assertEq(mgmtBalance, 0);
        assertEq(gmgmtBalance, gmgmtAmount);

        // Unstake gMGMT
        gmgmt.approve(address(staking), gmgmtBalance);
        staking.unstake(address(this), gmgmtBalance, triggerRebase, isSmgmt);

        // Validate balances post unstake
        mgmtBalance = mgmt.balanceOf(address(this));
        gmgmtBalance = gmgmt.balanceOf(address(this));
        uint256 expectedMGMT = initialMGMTBalance.add(BOUNTY); // Rebase earns a bounty
        assertEq(mgmtBalance, expectedMGMT);
        assertEq(gmgmtBalance, 0);
    }
}
