// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import "ds-test/test.sol"; // ds-test

import "../../../contracts/libraries/SafeMath.sol";
import "../../../contracts/libraries/FixedPoint.sol";
import "../../../contracts/libraries/FullMath.sol";
import "../../../contracts/Staking.sol";
import "../../../contracts/OlympusERC20.sol";
import "../../../contracts/sOlympusERC20.sol";
import "../../../contracts/governance/gOHM.sol";
import "../../../contracts/Treasury.sol";
import "../../../contracts/StakingDistributor.sol";
import "../../../contracts/OlympusAuthority.sol";

import "./util/Hevm.sol";
import "./util/MockContract.sol";

contract StakingTest is DSTest {
    using FixedPoint for *;
    using SafeMath for uint256;
    using SafeMath for uint112;

    OlympusStaking internal staking;
    OlympusTreasury internal treasury;
    OlympusAuthority internal authority;
    Distributor internal distributor;

    OlympusERC20Token internal mgmt;
    sOlympus internal smgmt;
    gOHM internal gmgmt;

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

        authority = new OlympusAuthority(address(this), address(this), address(this), address(this));

        mgmt = new OlympusERC20Token(address(authority));
        gmgmt = new gOHM(address(this), address(this));
        smgmt = new sOlympus();
        smgmt.setIndex(10);
        smgmt.setgOHM(address(gmgmt));

        treasury = new OlympusTreasury(address(mgmt), 1, address(authority));

        staking = new OlympusStaking(
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
        treasury.enable(OlympusTreasury.STATUS.REWARDMANAGER, address(distributor), address(0)); // Allows distributor to mint mgmt.
        treasury.enable(OlympusTreasury.STATUS.RESERVETOKEN, address(mockToken), address(0)); // Allow mock token to be deposited into treasury
        treasury.enable(OlympusTreasury.STATUS.RESERVEDEPOSITOR, address(this), address(0)); // Allow this contract to deposit token into treeasury

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
        uint256 gOHMRecieved = staking.stake(address(this), AMOUNT, isSmgmt, claim);

        uint256 expectedAmount = gmgmt.balanceTo(AMOUNT.add(BOUNTY));
        assertEq(gOHMRecieved, expectedAmount);
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
        uint256 initialOhmBalance = mgmt.balanceOf(address(this));
        mgmt.approve(address(staking), initialOhmBalance);
        uint256 amountStaked = staking.stake(address(this), initialOhmBalance, isSmgmt, claim);
        assertEq(amountStaked, initialOhmBalance);

        // Validate balances post stake
        uint256 mgmtBalance = mgmt.balanceOf(address(this));
        uint256 sOhmBalance = smgmt.balanceOf(address(this));
        assertEq(mgmtBalance, 0);
        assertEq(sOhmBalance, initialOhmBalance);

        // Unstake sOHM
        smgmt.approve(address(staking), sOhmBalance);
        staking.unstake(address(this), sOhmBalance, triggerRebase, isSmgmt);

        // Validate Balances post unstake
        mgmtBalance = mgmt.balanceOf(address(this));
        sOhmBalance = smgmt.balanceOf(address(this));
        assertEq(mgmtBalance, initialOhmBalance);
        assertEq(sOhmBalance, 0);
    }

    function testUnstakeAtRebase() public {
        bool triggerRebase = true;
        bool isSmgmt = true;
        bool claim = true;

        // Stake the mgmt
        uint256 initialOhmBalance = mgmt.balanceOf(address(this));
        mgmt.approve(address(staking), initialOhmBalance);
        uint256 amountStaked = staking.stake(address(this), initialOhmBalance, isSmgmt, claim);
        assertEq(amountStaked, initialOhmBalance);

        // Move into next rebase window
        hevm.warp(EPOCH_LENGTH);

        // Validate balances post stake
        // Post initial rebase, distribution amount is 0, so sOHM balance doens't change.
        uint256 mgmtBalance = mgmt.balanceOf(address(this));
        uint256 sOhmBalance = smgmt.balanceOf(address(this));
        assertEq(mgmtBalance, 0);
        assertEq(sOhmBalance, initialOhmBalance);

        // Unstake sOHM
        smgmt.approve(address(staking), sOhmBalance);
        staking.unstake(address(this), sOhmBalance, triggerRebase, isSmgmt);

        // Validate balances post unstake
        mgmtBalance = mgmt.balanceOf(address(this));
        sOhmBalance = smgmt.balanceOf(address(this));
        uint256 expectedAmount = initialOhmBalance.add(BOUNTY); // Rebase earns a bounty
        assertEq(mgmtBalance, expectedAmount);
        assertEq(sOhmBalance, 0);
    }

    function testUnstakeAtRebaseFromGmgmt() public {
        bool triggerRebase = true;
        bool isSmgmt = false;
        bool claim = true;

        // Stake the mgmt
        uint256 initialOhmBalance = mgmt.balanceOf(address(this));
        mgmt.approve(address(staking), initialOhmBalance);
        uint256 amountStaked = staking.stake(address(this), initialOhmBalance, isSmgmt, claim);
        uint256 gmgmtAmount = gmgmt.balanceTo(initialOhmBalance);
        assertEq(amountStaked, gmgmtAmount);

        // test the unstake
        // Move into next rebase window
        hevm.warp(EPOCH_LENGTH);

        // Validate balances post-stake
        uint256 mgmtBalance = mgmt.balanceOf(address(this));
        uint256 gmgmtBalance = gmgmt.balanceOf(address(this));
        assertEq(mgmtBalance, 0);
        assertEq(gmgmtBalance, gmgmtAmount);

        // Unstake gOHM
        gmgmt.approve(address(staking), gmgmtBalance);
        staking.unstake(address(this), gmgmtBalance, triggerRebase, isSmgmt);

        // Validate balances post unstake
        mgmtBalance = mgmt.balanceOf(address(this));
        gmgmtBalance = gmgmt.balanceOf(address(this));
        uint256 expectedOhm = initialOhmBalance.add(BOUNTY); // Rebase earns a bounty
        assertEq(mgmtBalance, expectedOhm);
        assertEq(gmgmtBalance, 0);
    }
}
