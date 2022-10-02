const { ethers, waffle, network } = require("hardhat");
const { BigNumber } = require("ethers");
const { expect } = require("chai");
//const { FakeContract, smock } = require("@defi-wonderland/smock");

const { utils } = require("ethers");

const e9 = "000000000";
const e18 = "000000000000000000";

describe("YieldDirector", async () => {
    const LARGE_APPROVAL = "100000000000000000000000000000000";
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    // Initial mint for Frax and DAI (10,000,000)
    const initialMint = "10000000000000000000000000";
    // Reward rate of .1%
    const initialRewardRate = "1000";

    const advanceEpoch = async () => {
        await advanceTime(8 * 60 * 60);
    };

    const advanceTime = async (seconds) => {
        await ethers.provider.send("evm_increaseTime", [seconds]);
        await ethers.provider.send("evm_mine", []);
    };

    // TODO needs cleanup. use Bignumber.
    // Mine block and rebase. Returns the new index.
    const triggerRebase = async () => {
        advanceEpoch(); // 8 hours per rebase
        await distributor.triggerRebase();
        return await sMGMT.index();
    };

    let deployer, alice, bob, carol;
    let erc20Factory;
    let stakingFactory;
    let mgmtFactory;
    let sMGMTFactory;
    let gMGMTFactory;
    let treasuryFactory;
    let distributorFactory;
    let authFactory;
    let mockSMGMTFactory;
    let tycheFactory;

    let auth;
    let dai;
    let lpToken;
    let mgmt;
    let sMGMT;
    let staking;
    let gMGMT;
    let treasury;
    let distributor;
    let tyche;

    before(async () => {
        [deployer, alice, bob, carol] = await ethers.getSigners();

        authFactory = await ethers.getContractFactory("FydeAuthority");
        erc20Factory = await ethers.getContractFactory("DAI");

        stakingFactory = await ethers.getContractFactory("FydeStaking");
        mgmtFactory = await ethers.getContractFactory("FydeERC20Token");
        sMGMTFactory = await ethers.getContractFactory("sFyde");
        gMGMTFactory = await ethers.getContractFactory("gMGMT");
        treasuryFactory = await ethers.getContractFactory("FydeTreasury");
        distributorFactory = await ethers.getContractFactory("Distributor");
        tycheFactory = await ethers.getContractFactory("YieldDirector");
    });

    beforeEach(async () => {
        dai = await erc20Factory.deploy(0);
        auth = await authFactory.deploy(
            deployer.address,
            deployer.address,
            deployer.address,
            deployer.address
        );
        mgmt = await mgmtFactory.deploy(auth.address);
        sMGMT = await sMGMTFactory.deploy();
        gMGMT = await gMGMTFactory.deploy(deployer.address, sMGMT.address);
        const blockNumBefore = await ethers.provider.getBlockNumber();
        const blockBefore = await ethers.provider.getBlock(blockNumBefore);
        staking = await stakingFactory.deploy(
            mgmt.address,
            sMGMT.address,
            gMGMT.address,
            "28800", // 1 epoch = 8 hours
            "1",
            blockBefore.timestamp + 28800, // First epoch in 8 hours. Avoids first deposit to set epoch.distribute wrong
            auth.address
        );
        await gMGMT.migrate(staking.address, sMGMT.address);
        treasury = await treasuryFactory.deploy(mgmt.address, "0", auth.address);
        distributor = await distributorFactory.deploy(
            treasury.address,
            mgmt.address,
            staking.address,
            auth.address,
            initialRewardRate
        );
        tyche = await tycheFactory.deploy(
            sMGMT.address,
            gMGMT.address,
            staking.address,
            auth.address
        );

        // Setup for each component

        // Needed for treasury deposit
        await dai.mint(deployer.address, initialMint);
        await dai.approve(treasury.address, LARGE_APPROVAL);

        // Needed to spend deployer's MGMT
        await mgmt.approve(staking.address, LARGE_APPROVAL);

        // To get past MGMT contract guards
        await auth.pushVault(treasury.address, true);

        // Initialization for sMGMT contract.
        // Set index to 10
        await sMGMT.setIndex("10000000000");
        await sMGMT.setgMGMT(gMGMT.address);
        await sMGMT.initialize(staking.address, treasury.address);

        // Set distributor staking contract
        await staking.setDistributor(distributor.address);

        // queue and toggle reward manager
        await treasury.enable("8", distributor.address, ZERO_ADDRESS);
        // queue and toggle deployer reserve depositor
        await treasury.enable("0", deployer.address, ZERO_ADDRESS);
        // queue and toggle liquidity depositor
        await treasury.enable("4", deployer.address, ZERO_ADDRESS);
        // queue and toggle DAI as reserve token
        await treasury.enable("2", dai.address, ZERO_ADDRESS);

        // Deposit 10,000 DAI to treasury, 1,000 MGMT gets minted to deployer with 9000 as excess reserves (ready to be minted)
        await treasury
            .connect(deployer)
            .deposit("10000000000000000000000", dai.address, "9000000000000");

        // Get sMGMT in deployer wallet
        const smgmtAmount = "1000000000000";
        await mgmt.approve(staking.address, smgmtAmount);
        await staking.stake(deployer.address, smgmtAmount, true, true);
        await triggerRebase(); // Trigger first rebase to set initial distribute amount. This rebase shouldn't update index.

        // Transfer 100 sMGMT to alice for testing
        await sMGMT.transfer(alice.address, "100000000000");

        // Alice should wrap mgmt to gMGMT. Should have 10gMGMT
        await sMGMT.approve(staking.address, LARGE_APPROVAL);
        await staking.wrap(deployer.address, "500000000000");
        await sMGMT.connect(alice).approve(staking.address, LARGE_APPROVAL);
        await staking.connect(alice).wrap(alice.address, "100000000000");

        await sMGMT.approve(tyche.address, LARGE_APPROVAL);
        await sMGMT.connect(alice).approve(tyche.address, LARGE_APPROVAL);
        await gMGMT.approve(tyche.address, LARGE_APPROVAL);
        await gMGMT.connect(alice).approve(tyche.address, LARGE_APPROVAL);
    });

    it("should rebase properly", async () => {
        await expect(await sMGMT.index()).is.equal("10000000000");

        await triggerRebase();
        await expect(await sMGMT.index()).is.equal("10010000000");

        await triggerRebase();
        await expect(await sMGMT.index()).is.equal("10020010000");

        await triggerRebase();
        await expect(await sMGMT.index()).is.equal("10030030010");
    });

    it("should set token addresses correctly", async () => {
        await tyche.deployed();

        expect(await tyche.gMGMT()).to.equal(gMGMT.address);
    });

    it("should deposit gMGMT tokens to recipient correctly", async () => {
        // Deposit 1 gMGMT into Tyche and donate to Bob
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);

        // Verify donor info
        const donationInfo = await tyche.depositInfo("0");
        await expect(donationInfo.depositor).is.equal(deployer.address);
        await expect(donationInfo.principalAmount).is.equal(`10${e9}`);
        await expect(donationInfo.agnosticAmount).is.equal(principal);
    });

    it("should deposit sMGMT tokens to recipient correctly", async () => {
        // Deposit 10 sMGMT into Tyche and donate to Bob
        const principal = `10${e9}`;
        await tyche.depositSmgmt(principal, bob.address);

        // Verify donor info
        const donationInfo = await tyche.depositInfo("0");
        await expect(donationInfo.depositor).is.equal(deployer.address);
        await expect(donationInfo.principalAmount).is.equal(principal);
        await expect(donationInfo.agnosticAmount).is.equal(`1${e18}`);
    });

    it("should add deposits", async () => {
        const principal = `1${e18}`;
        const smgmtPrincipal = `1${e9}`;

        await tyche.deposit(principal, bob.address);
        const donationInfo = await tyche.depositInfo("0");
        await expect(donationInfo.depositor).is.equal(deployer.address);
        await expect(donationInfo.principalAmount).is.equal(`10${e9}`);
        await expect(donationInfo.agnosticAmount).is.equal(principal);

        await tyche.addToDeposit("0", principal);
        const donationInfo1 = await tyche.depositInfo("0");
        await expect(donationInfo1.depositor).is.equal(deployer.address);
        await expect(donationInfo1.principalAmount).is.equal(`20${e9}`);
        await expect(donationInfo1.agnosticAmount).is.equal(`2${e18}`);

        await tyche.addToSmgmtDeposit("0", smgmtPrincipal);
        const donationInfo2 = await tyche.depositInfo("0");
        await expect(donationInfo2.depositor).is.equal(deployer.address);
        await expect(donationInfo2.principalAmount).is.equal(`21${e9}`);
        await expect(donationInfo2.agnosticAmount).is.equal("2100000000000000000");

        await triggerRebase();

        await tyche.connect(bob).redeemAllYield();

        const donationInfo3 = await tyche.depositInfo("0");
        const withdrawableBalance = await gMGMT.balanceTo(donationInfo3.principalAmount);
        await tyche.withdrawPrincipal("0", withdrawableBalance);
    });

    it("can't access all deposits per recipient", async () => {
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);

        // Since entries in depositInfo are siloed by depositor, funds can't be exploited like this
        await tyche.connect(alice).deposit(BigNumber.from("1"), bob.address);

        const balanceBefore = await gMGMT.balanceOf(alice.address);

        await tyche.connect(alice).withdrawPrincipal("1", principal);

        const balanceAfter = await gMGMT.balanceOf(alice.address);

        await expect(balanceAfter.sub(balanceBefore)).is.equal("0");
    });

    it("can't steal another deposit", async () => {
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);

        await expect(tyche.connect(alice).withdrawPrincipal("0", principal)).to.be.reverted;
        await expect(tyche.connect(alice).withdrawPrincipalAsSmgmt("0", principal)).to.be.reverted;
    });

    it("should withdraw tokens", async () => {
        // Deposit 1 gMGMT into Tyche and donate to Bob
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);

        const donationInfo = await tyche.depositInfo("0");
        await expect(donationInfo.depositor).is.equal(deployer.address);
        await expect(donationInfo.principalAmount).is.equal(`10${e9}`);
        await expect(donationInfo.agnosticAmount).is.equal(principal);

        await expect(await tyche.redeemableBalance("0")).is.equal("0");

        // First rebase
        await triggerRebase();

        const donatedAmount = "10000000";
        await expect(await tyche.redeemableBalance("0")).is.equal(
            (await gMGMT.balanceTo(donatedAmount)).add("1")
        );

        const withdrawableBalance = await gMGMT.balanceTo(donationInfo.principalAmount);
        await tyche.withdrawPrincipal("0", withdrawableBalance);

        // Verify donor and recipient data is properly updated
        const donationInfo1 = await tyche.depositInfo("0");
        // Precision errors leading to losing 1e-18
        await expect(donationInfo1.principalAmount).is.equal("0");

        await expect(await tyche.redeemableBalance("0")).is.equal(
            (await gMGMT.balanceTo(donatedAmount)).add(1)
        );
    });

    it("should max withdraw", async () => {
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);

        const donationInfo = await tyche.depositInfo("0");
        await expect(donationInfo.depositor).is.equal(deployer.address);
        await expect(donationInfo.principalAmount).is.equal(`10${e9}`);
        await expect(donationInfo.agnosticAmount).is.equal(principal);

        await expect(await tyche.redeemableBalance("0")).is.equal("0");

        // First rebase
        await triggerRebase();

        const donatedAmount = "10000000";
        await expect(await tyche.redeemableBalance("0")).is.equal(
            (await gMGMT.balanceTo(donatedAmount)).add("1")
        );

        await tyche.withdrawPrincipal("0", principal);

        // Verify donor and recipient data is properly updated
        const donationInfo1 = await tyche.depositInfo("0");
        // Precision errors leading to losing 1e-18
        await expect(donationInfo1.principalAmount).is.equal("0");

        await expect(await tyche.redeemableBalance("0")).is.equal(
            (await gMGMT.balanceTo(donatedAmount)).add(1)
        );
    });

    it("should withdraw to sMGMT", async () => {
        // Deposit 1 gMGMT into Tyche and donate to Bob
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);

        await triggerRebase();

        const donationInfo = await tyche.depositInfo("0");

        const balanceBefore = await sMGMT.balanceOf(deployer.address);

        const withdrawableBalance = await gMGMT.balanceTo(donationInfo.principalAmount);
        await tyche.withdrawPrincipalAsSmgmt("0", withdrawableBalance);

        const balanceAfter = await sMGMT.balanceOf(deployer.address);
        await expect(balanceAfter.sub(balanceBefore)).is.equal(
            donationInfo.principalAmount.sub("1")
        );

        const donationInfo1 = await tyche.depositInfo("0");
        await expect(donationInfo1.principalAmount).is.equal("0");
    });

    it("should partial withdraw and full withdraw", async () => {
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);

        await triggerRebase();

        const balanceBefore = await gMGMT.balanceOf(deployer.address);

        const withdrawalAmount = await gMGMT.balanceTo("1000000000");
        await tyche.withdrawPrincipal("0", withdrawalAmount);
        await tyche.withdrawPrincipal("0", withdrawalAmount);

        const balanceAfter = await gMGMT.balanceOf(deployer.address);
        await expect(balanceAfter.sub(balanceBefore)).is.equal(
            BigNumber.from("2").mul(withdrawalAmount)
        );

        const donationInfo = await tyche.depositInfo("0");

        const withdrawableBalance = await gMGMT.balanceTo(donationInfo.principalAmount);
        await tyche.withdrawPrincipal("0", withdrawableBalance);

        const balanceAfter1 = await gMGMT.balanceOf(deployer.address);
        await expect(balanceAfter1.sub(balanceBefore)).is.equal("999000999200799200"); // this seems to be a bit larger than the usual precision error

        const redeemable = await tyche.redeemableBalance("0");
        await tyche.connect(bob).redeemYield("0");

        await expect(tyche.recipientIds(bob.address, "0")).to.be.reverted;
        await expect(tyche.depositorIds(deployer.address, "0")).to.be.reverted;
        const newDeposit = await tyche.depositInfo("0");
        await expect(newDeposit.depositor).is.equal("0x0000000000000000000000000000000000000000");
        await expect(newDeposit.principalAmount).is.equal("0");
        await expect(newDeposit.agnosticAmount).is.equal("0");
    });

    it("should partial withdraw and full withdraw to sMGMT", async () => {
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);

        await triggerRebase();

        const balanceBefore = await sMGMT.balanceOf(deployer.address);

        const withdrawalAmount = await gMGMT.balanceTo("1000000000");
        await tyche.withdrawPrincipalAsSmgmt("0", withdrawalAmount);
        await tyche.withdrawPrincipalAsSmgmt("0", withdrawalAmount);

        const balanceAfter = await sMGMT.balanceOf(deployer.address);
        await expect(balanceAfter.sub(balanceBefore)).is.equal("1999999998");

        const donationInfo = await tyche.depositInfo("0");

        const withdrawableBalance = await gMGMT.balanceTo(donationInfo.principalAmount);
        await tyche.withdrawPrincipalAsSmgmt("0", withdrawableBalance);

        const balanceAfter1 = await sMGMT.balanceOf(deployer.address);
        await expect(balanceAfter1.sub(balanceBefore)).is.equal("9999999999");
    });

    it("should mix withdrawal types without breaking", async () => {
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);

        await triggerRebase();

        const smgmtBalanceBefore = await sMGMT.balanceOf(deployer.address);
        const gmgmtBalanceBefore = await gMGMT.balanceOf(deployer.address);

        const withdrawalAmount = await gMGMT.balanceTo("1000000000");
        await tyche.withdrawPrincipalAsSmgmt("0", withdrawalAmount);
        await tyche.withdrawPrincipal("0", withdrawalAmount);

        const smgmtBalanceAfter = await sMGMT.balanceOf(deployer.address);
        const gmgmtBalanceAfter = await gMGMT.balanceOf(deployer.address);
        await expect(smgmtBalanceAfter.sub(smgmtBalanceBefore)).is.equal("999999999");
        await expect(gmgmtBalanceAfter.sub(gmgmtBalanceBefore)).is.equal(withdrawalAmount);

        const donationInfo = await tyche.depositInfo("0");
        const withdrawableBalance = await gMGMT.balanceTo(donationInfo.principalAmount);
        await tyche.withdrawPrincipal("0", withdrawableBalance);
    });

    it("should not revert on second withdraw", async () => {
        // Deposit 1 gMGMT into Tyche and donate to Bob
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);
        const donationInfo = await tyche.depositInfo("0");

        await triggerRebase();

        const withdrawableBalance = await gMGMT.balanceTo(donationInfo.principalAmount);
        await tyche.withdrawPrincipal("0", withdrawableBalance);

        await tyche.addToDeposit("0", principal);
        const donationInfo1 = await tyche.depositInfo("0");
        const withdrawableBalance2 = await gMGMT.balanceTo(donationInfo1.principalAmount);
        await tyche.withdrawPrincipal("0", withdrawableBalance2);

        const donationInfo2 = await tyche.depositInfo("0");
        await expect(donationInfo2.principalAmount).is.equal("0");
    });

    it("should redeem tokens", async () => {
        // Deposit 1 gMGMT into Tyche and donate to Bob
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);

        await triggerRebase();

        await tyche.connect(bob).redeemYield("0");

        const donatedAmount = await gMGMT.balanceTo("10000000");
        const bobBalance = await gMGMT.balanceOf(bob.address);
        await expect(bobBalance).is.equal(donatedAmount.add("1"));
    });

    it("should redeem tokens on behalf of others", async () => {
        // Deposit 1 gMGMT into Tyche and donate to Bob
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);

        await triggerRebase();

        await tyche.givePermissionToRedeem(alice.address);
        await tyche.connect(alice).redeemYieldOnBehalfOf("0");

        const donatedAmount = await gMGMT.balanceTo("10000000");
        const bobBalance = await gMGMT.balanceOf(bob.address);
        await expect(bobBalance).is.equal(donatedAmount.add("1"));

        await tyche.revokePermissionToRedeem(alice.address);
        await expect(tyche.connect(alice).redeemYield("0")).to.be.reverted;
    });

    it("should redeem tokens as sMGMT", async () => {
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);

        await triggerRebase();

        const balanceBefore = await sMGMT.balanceOf(bob.address);

        await tyche.connect(bob).redeemYieldAsSmgmt("0");

        const balanceAfter = await sMGMT.balanceOf(bob.address);
        await expect(balanceAfter.sub(balanceBefore)).is.equal("10000000");
    });

    it("should redeem all tokens", async () => {
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);
        await tyche.connect(alice).deposit(principal, bob.address);

        await triggerRebase();

        await tyche.connect(bob).redeemAllYield();

        const donatedAmount = await gMGMT.balanceTo("20000000");
        const bobBalance = await gMGMT.balanceOf(bob.address);
        await expect(bobBalance).is.equal(donatedAmount.add("2"));
    });

    it("should redeem all tokens on bahalf of others", async () => {
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);
        await tyche.connect(alice).deposit(principal, bob.address);

        await triggerRebase();

        await tyche.givePermissionToRedeem(alice.address);
        await tyche.connect(alice).redeemAllYieldOnBehalfOf(bob.address);

        const donatedAmount = await gMGMT.balanceTo("20000000");
        const bobBalance = await gMGMT.balanceOf(bob.address);
        await expect(bobBalance).is.equal(donatedAmount.add("2"));

        await tyche.revokePermissionToRedeem(alice.address);
        await expect(tyche.connect(alice).redeemYield("0")).to.be.reverted;
    });

    it("should redeem all tokens as sMGMT", async () => {
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);
        await tyche.connect(alice).deposit(principal, bob.address);

        await triggerRebase();

        const balanceBefore = await sMGMT.balanceOf(bob.address);

        await tyche.connect(bob).redeemAllYieldAsSmgmt();

        const balanceAfter = await sMGMT.balanceOf(bob.address);
        await expect(balanceAfter.sub(balanceBefore)).is.equal("20000000");
    });

    it("can't redeem another user's tokens", async () => {
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);

        await triggerRebase();

        await expect(tyche.connect(alice).redeemYield("0")).to.be.reverted;
    });

    it("should withdraw tokens before recipient redeems", async () => {
        // Deposit 1 gMGMT into Tyche and donate to Bob
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);

        await triggerRebase();

        const donatedAmount = await gMGMT.balanceTo("10000000");
        await expect(await tyche.redeemableBalance("0")).is.equal(donatedAmount.add("1"));

        const donationInfo = await tyche.depositInfo("0");
        await expect(donationInfo.agnosticAmount).is.equal(principal);

        const withdrawableBalance = await gMGMT.balanceTo(donationInfo.principalAmount);
        await tyche.withdrawPrincipal("0", withdrawableBalance);

        // Redeemable amount should be unchanged
        await expect(await tyche.redeemableBalance("0")).is.equal(donatedAmount.add("1"));

        // Trigger a few rebases
        await triggerRebase();
        await triggerRebase();
        await triggerRebase();
        await expect(await tyche.redeemableBalance("0")).is.equal(donatedAmount.add("1"));

        await tyche.connect(bob).redeemAllYield();

        await expect(await tyche.redeemableBalance(bob.address)).is.equal("0");
    });

    it("withdawable balance plus redeemable balance should equal deposited gMGMT", async () => {
        // Deposit 1 gMGMT into Tyche and donate to Bob
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);

        await triggerRebase();

        const donationInfo = await tyche.depositInfo("0");

        const withdrawableBalance = await gMGMT.balanceTo(donationInfo.principalAmount);
        const redeemable = await tyche.redeemableBalance("0");
        await expect(withdrawableBalance.add(redeemable).toString()).is.equal(principal);
    });

    it("should withdraw tokens after recipient redeems", async () => {
        // Deposit 1 gMGMT into Tyche and donate to Bob
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);

        const donationInfo = await tyche.depositInfo("0");
        await expect(donationInfo.agnosticAmount).is.equal(principal);

        await triggerRebase();

        const donationInfo1 = await tyche.depositInfo("0");
        await expect(donationInfo1.agnosticAmount).is.equal(principal);

        const redeemablePerRebase = await tyche.redeemableBalance("0");

        await tyche.connect(bob).redeemYield("0");

        await expect(await gMGMT.balanceOf(bob.address)).is.equal(redeemablePerRebase);

        const donationInfo2 = await tyche.depositInfo("0");
        await expect(donationInfo2.agnosticAmount).is.equal("999000999000999000"); // 9.990~

        await expect(await tyche.redeemableBalance("0")).is.equal("0");

        // Second rebase
        await triggerRebase();

        await expect(await tyche.redeemableBalance("0")).is.equal(await gMGMT.balanceTo("10000000"));

        const withdrawableBalance = await gMGMT.balanceTo(donationInfo.principalAmount);
        const balanceBefore = await gMGMT.balanceOf(deployer.address);
        await tyche.withdrawPrincipal("0", `10000${e18}`);
        const balanceAfter = await gMGMT.balanceOf(deployer.address);
        await expect(balanceAfter.sub(balanceBefore)).is.equal(withdrawableBalance);

        // This amount should be the exact same as before withdrawal.
        await expect(await tyche.redeemableBalance("0")).is.equal(await gMGMT.balanceTo("10000000"));

        // Redeem and make sure correct amount is present
        const prevBalance = await gMGMT.balanceOf(bob.address);
        await tyche.connect(bob).redeemYield("0");
        await expect(await gMGMT.balanceOf(bob.address)).is.equal(
            prevBalance.add(await gMGMT.balanceTo("10000000"))
        );
    });

    it("should deposit from multiple sources", async () => {
        // Both deployer and alice deposit 1 gMGMT and donate to Bob
        const principal = `1${e18}`;

        // Deposit from 2 accounts at different indexes
        await tyche.deposit(principal, bob.address);
        await expect(await tyche.redeemableBalance("0")).is.equal("0");

        await triggerRebase();

        await tyche.connect(alice).deposit(principal, bob.address);

        // Verify donor info
        const donationInfo = await tyche.depositInfo("0");
        const aliceDonationInfo = await tyche.depositInfo("1");

        await expect(donationInfo.principalAmount).is.equal(`10${e9}`);
        await expect(aliceDonationInfo.principalAmount).is.equal(await gMGMT.balanceFrom(principal));
        await expect(donationInfo.agnosticAmount).is.equal(principal);
        await expect(aliceDonationInfo.agnosticAmount).is.equal(principal);

        await expect(await tyche.redeemableBalance("0")).is.equal(
            (await gMGMT.balanceTo("10000000")).add("1")
        );
        await expect(await tyche.redeemableBalance("1")).is.equal("0");
    });

    it("should withdraw to multiple sources", async () => {
        // Both deployer and alice deposit 1 gMGMT and donate to Bob
        const principal = `1${e18}`;

        // Deposit from 2 accounts
        await tyche.deposit(principal, bob.address);
        await tyche.connect(alice).deposit(principal, bob.address);

        // Wait for some rebases
        await triggerRebase();
        const index = await sMGMT.index();

        await expect(await tyche.redeemableBalance("0")).is.equal(
            (await gMGMT.balanceTo("10000000")).add("1")
        );
        await expect(await tyche.redeemableBalance("1")).is.equal(
            (await gMGMT.balanceTo("10000000")).add("1")
        );

        // Verify withdrawal
        const bobDonationInfo = await tyche.depositInfo("0");

        const withdrawableBalance = await gMGMT.balanceTo(bobDonationInfo.principalAmount);
        const balanceBefore = await gMGMT.balanceOf(deployer.address);
        await expect(await tyche.withdrawPrincipal("0", withdrawableBalance));

        const balanceAfter = await gMGMT.balanceOf(deployer.address);
        await expect(balanceAfter.sub(balanceBefore)).is.equal(
            await gMGMT.balanceTo(bobDonationInfo.principalAmount)
        );

        await triggerRebase();

        // Verify withdrawal
        const balanceBefore1 = await gMGMT.balanceOf(alice.address);

        const aliceDonationInfo = await tyche.depositInfo("1");
        const aliceWithdrawableBalance = await gMGMT.balanceTo(aliceDonationInfo.principalAmount);

        const index1 = await sMGMT.index();
        await tyche.connect(alice).withdrawPrincipal("1", aliceWithdrawableBalance);

        const balanceAfter1 = await gMGMT.balanceOf(alice.address);
        await expect(balanceAfter1.sub(balanceBefore1)).is.equal(
            await gMGMT.balanceTo(aliceDonationInfo.principalAmount)
        );
    });

    it("should withdrawAll after donating to multiple sources", async () => {
        // Both deployer and alice deposit 1 gMGMT and donate to Bob
        const principal = `1${e18}`;

        // Deposit from 2 accounts
        await tyche.deposit(principal, bob.address);
        await tyche.deposit(principal, alice.address);

        // Wait for some rebases
        await triggerRebase();

        await expect(await tyche.redeemableBalance("0")).is.equal(
            (await gMGMT.balanceTo("10000000")).add("1")
        );
        await expect(await tyche.redeemableBalance("1")).is.equal(
            (await gMGMT.balanceTo("10000000")).add("1")
        );

        // Verify withdrawal
        const balanceBefore = await gMGMT.balanceOf(deployer.address);
        await expect(await tyche.withdrawAll());
        const balanceAfter = await gMGMT.balanceOf(deployer.address);

        await expect(balanceAfter.sub(balanceBefore)).is.equal(await gMGMT.balanceTo(`20${e9}`));
    });

    it("should allow redeem only once per epoch", async () => {
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);

        await triggerRebase();

        const donated = "10000000";
        await expect(await tyche.redeemableBalance("0")).is.equal(
            (await gMGMT.balanceTo(donated)).add("1")
        );
        await tyche.connect(bob).redeemAllYield();
        await expect(await gMGMT.balanceOf(bob.address)).is.equal(
            (await gMGMT.balanceTo(donated)).add("1")
        );

        const balanceBefore = await gMGMT.balanceOf(deployer.address);
        await tyche.connect(bob).redeemAllYield();
        const balanceAfter = await gMGMT.balanceOf(deployer.address);
        await expect(balanceAfter.sub(balanceBefore)).is.equal("0");
    });

    it("should display total donated to recipient", async () => {
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);
        await triggerRebase();

        await expect(await tyche.donatedTo(deployer.address, bob.address)).is.equal(
            (await gMGMT.balanceTo("10000000")).add("1")
        );
        await expect(await tyche.totalDonated(deployer.address)).is.equal(
            (await gMGMT.balanceTo("10000000")).add("1")
        );
    });

    it("should display total deposited to all recipients", async () => {
        const principal = `1${e18}`;

        await tyche.deposit(principal, bob.address);
        await tyche.deposit(principal, alice.address);
        await triggerRebase();

        await expect(await tyche.depositsTo(deployer.address, bob.address)).is.equal(
            await gMGMT.balanceTo(`10${e9}`)
        );
        await expect(await tyche.depositsTo(deployer.address, alice.address)).is.equal(
            await gMGMT.balanceTo(`10${e9}`)
        );

        await expect(await tyche.depositsTo(bob.address, alice.address)).is.equal("0");

        await expect(await tyche.totalDeposits(deployer.address)).is.equal(
            await gMGMT.balanceTo(`20${e9}`)
        );
    });

    it("should display donated amounts across multiple recipients", async () => {
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);
        await tyche.deposit(principal, alice.address);

        await triggerRebase();

        const totalDonation = await gMGMT.balanceTo("20000000");
        await expect(await tyche.totalDonated(deployer.address)).is.equal(totalDonation.add("1"));

        const donationInfo = await tyche.depositInfo("0");
        const withdrawableBalance = await gMGMT.balanceTo(donationInfo.principalAmount);
        await tyche.withdrawPrincipal("0", withdrawableBalance);
        await tyche.withdrawPrincipal("1", withdrawableBalance);
        await expect(await tyche.totalDonated(deployer.address)).is.equal(totalDonation.add("2"));

        await triggerRebase();
        await expect(await tyche.totalDonated(deployer.address)).is.equal(totalDonation.add("2"));

        await expect(await tyche.totalDonated(deployer.address)).is.equal(totalDonation.add("2"));
    });

    it("should get all deposited positions", async () => {
        const principal = `1${e18}`;
        await tyche.deposit(principal, bob.address);
        await tyche.deposit(principal, alice.address);

        await triggerRebase();

        const allDeposits = await tyche.getAllDeposits(deployer.address);
        await expect(allDeposits[0].length).is.equal(2);
        await expect(allDeposits[0][0]).is.equal(bob.address);
        await expect(allDeposits[1][0]).is.equal(await gMGMT.balanceTo(`10${e9}`));
    });
});
