import { ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import {
    FydeStaking,
    FydeERC20Token,
    GMGMT,
    FydeAuthority,
    DAI,
    SFyde,
    FydeTreasury,
    Distributor,
    YieldSplitterImpl,
} from "../../types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { toDecimals, toMGMT, advanceEpoch } from "../utils/Utilities";

describe("YieldSplitter", async () => {
    const LARGE_APPROVAL = "100000000000000000000000000000000";
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    // Initial mint for Frax and DAI (10,000,000)
    const initialMint = toDecimals(10000000);
    // Reward rate of .1%
    const initialRewardRate = "1000";

    const triggerRebase = async () => {
        advanceEpoch(); // 8 hours per rebase
        await distributor.triggerRebase();
        return await sMGMT.index();
    };

    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let erc20Factory: ContractFactory;
    let stakingFactory: ContractFactory;
    let mgmtFactory: ContractFactory;
    let sMGMTFactory: ContractFactory;
    let gMGMTFactory: ContractFactory;
    let treasuryFactory: ContractFactory;
    let distributorFactory: ContractFactory;
    let authFactory: ContractFactory;
    let yieldSplitterFactory: ContractFactory;

    let auth: FydeAuthority;
    let dai: DAI;
    let mgmt: FydeERC20Token;
    let sMGMT: SFyde;
    let staking: FydeStaking;
    let gMGMT: GMGMT;
    let treasury: FydeTreasury;
    let distributor: Distributor;
    let yieldSplitter: YieldSplitterImpl;

    before(async () => {
        [deployer, alice, bob] = await ethers.getSigners();
        authFactory = await ethers.getContractFactory("FydeAuthority");
        erc20Factory = await ethers.getContractFactory("DAI");
        stakingFactory = await ethers.getContractFactory("FydeStaking");
        mgmtFactory = await ethers.getContractFactory("FydeERC20Token");
        sMGMTFactory = await ethers.getContractFactory("sFyde");
        gMGMTFactory = await ethers.getContractFactory("gMGMT");
        treasuryFactory = await ethers.getContractFactory("FydeTreasury");
        distributorFactory = await ethers.getContractFactory("Distributor");
        yieldSplitterFactory = await ethers.getContractFactory("YieldSplitterImpl");
    });

    beforeEach(async () => {
        dai = (await erc20Factory.deploy(0)) as DAI;
        auth = (await authFactory.deploy(
            deployer.address,
            deployer.address,
            deployer.address,
            deployer.address
        )) as FydeAuthority;
        mgmt = (await mgmtFactory.deploy(auth.address)) as FydeERC20Token;
        sMGMT = (await sMGMTFactory.deploy()) as SFyde;
        gMGMT = (await gMGMTFactory.deploy(deployer.address, sMGMT.address)) as GMGMT;
        const blockNumBefore = await ethers.provider.getBlockNumber();
        const blockBefore = await ethers.provider.getBlock(blockNumBefore);
        staking = (await stakingFactory.deploy(
            mgmt.address,
            sMGMT.address,
            gMGMT.address,
            "28800", // 1 epoch = 8 hours
            "1",
            blockBefore.timestamp + 28800, // First epoch in 8 hours. Avoids first deposit to set epoch.distribute wrong
            auth.address
        )) as FydeStaking;
        await gMGMT.migrate(staking.address, sMGMT.address);
        treasury = (await treasuryFactory.deploy(
            mgmt.address,
            "0",
            auth.address
        )) as FydeTreasury;
        distributor = (await distributorFactory.deploy(
            treasury.address,
            mgmt.address,
            staking.address,
            auth.address,
            initialRewardRate
        )) as Distributor;
        yieldSplitter = (await yieldSplitterFactory.deploy(
            sMGMT.address,
            await auth.authority()
        )) as YieldSplitterImpl;

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
        await treasury.connect(deployer).deposit(toDecimals(10000), dai.address, toMGMT(9000));

        // Get sMGMT in deployer wallet
        const smgmtAmount = toMGMT(1000);
        await mgmt.approve(staking.address, smgmtAmount);
        await staking.stake(deployer.address, smgmtAmount, true, true);
        await triggerRebase(); // Trigger first rebase to set initial distribute amount. This rebase shouldn't update index.

        // Transfer 100 sMGMT to alice for testing
        await sMGMT.transfer(alice.address, toMGMT(100));

        // Alice should wrap mgmt to gMGMT. Should have 10gMGMT
        await sMGMT.approve(staking.address, LARGE_APPROVAL);
        await staking.wrap(deployer.address, toMGMT(500));
        await sMGMT.connect(alice).approve(staking.address, LARGE_APPROVAL);
        await staking.connect(alice).wrap(alice.address, toMGMT(100));

        await gMGMT.connect(alice).approve(yieldSplitter.address, LARGE_APPROVAL);
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

    it("creating multiple deposits should update depositors arrays", async () => {
        await yieldSplitter.deposit(deployer.address, toDecimals(10));
        await yieldSplitter.deposit(deployer.address, toDecimals(10));
        await yieldSplitter.deposit(alice.address, toDecimals(5));
        await yieldSplitter.deposit(alice.address, toDecimals(5));

        await expect(await yieldSplitter.idCount()).is.equal("4");
        await expect(await yieldSplitter.depositorIds(deployer.address, 0)).is.equal("0");
        await expect(await yieldSplitter.depositorIds(deployer.address, 1)).is.equal("1");
        await expect(await yieldSplitter.depositorIds(alice.address, 0)).is.equal("2");
        await expect(await yieldSplitter.depositorIds(alice.address, 1)).is.equal("3");
        await expect((await yieldSplitter.depositInfo(0)).principalAmount).is.equal(toMGMT(100));
        await expect((await yieldSplitter.depositInfo(3)).principalAmount).is.equal(toMGMT(50));
    });

    it("adding to deposit should calculate agostic with changing index", async () => {
        await yieldSplitter.deposit(deployer.address, toDecimals(10)); //10 gMGMT, 100 sMGMT
        await triggerRebase();
        await expect((await yieldSplitter.depositInfo(0)).principalAmount).is.equal(toMGMT(100)); // still should be 100sMGMT but less gMGMT
        await expect((await yieldSplitter.depositInfo(0)).agnosticAmount).is.equal(toDecimals(10)); // still should be 10gMGMT. But its more than 100 sMGMT
        await yieldSplitter.addToDeposit(0, toDecimals(10)); // add another 10gMGMT or 100.1 sMGMT since index change
        await expect((await yieldSplitter.depositInfo(0)).principalAmount).is.equal(toMGMT(200.1)); // total sMGMT should be 200.1
        await expect((await yieldSplitter.depositInfo(0)).agnosticAmount).is.equal(toDecimals(20)); // agnostic should be 20 gMGMT or 200.2 sMGMT.
        const expectedYield = await gMGMT.balanceTo(toMGMT(0.1)); // yield is 0.1sMGMT convert this to gMGMT
        const actualYield = await yieldSplitter.getOutstandingYield(
            (
                await yieldSplitter.depositInfo(0)
            ).principalAmount,
            (
                await yieldSplitter.depositInfo(0)
            ).agnosticAmount
        );
        await expect(actualYield).is.closeTo(expectedYield, 1); // 1 digit off due to precision issues of converting gMGMT to sMGMT and back to gMGMT.
    });

    it("withdrawing principal only reduces principal amount", async () => {
        await yieldSplitter.deposit(deployer.address, toDecimals(10)); //10 gMGMT, 100 sMGMT
        await yieldSplitter.withdrawPrincipal(0, toDecimals(5));
        await triggerRebase();
        const principalAfter = (await yieldSplitter.depositInfo(0)).principalAmount;
        await expect(principalAfter).is.equal(toMGMT(50)); // should be 50 sMGMT
    });

    it("cannot withdraw more principal than there already is", async () => {
        await yieldSplitter.deposit(deployer.address, toDecimals(10)); //10 gMGMT, 100 sMGMT
        await expect(yieldSplitter.withdrawPrincipal(0, toDecimals(100))).to.be.reverted;
    });

    it("withdraws all principal", async () => {
        await yieldSplitter.connect(alice).deposit(deployer.address, toDecimals(10)); //10 gMGMT, 100 sMGMT
        await yieldSplitter.withdrawAllPrincipal(0);
        expect((await yieldSplitter.depositInfo(0)).agnosticAmount).is.equal(0);
    });

    it("cannot withdraw someone elses deposit", async () => {
        await yieldSplitter.connect(alice).deposit(alice.address, toDecimals(10)); //10 gMGMT, 100 sMGMT
        await expect(yieldSplitter.connect(deployer).withdrawPrincipal(0, toDecimals(10))).to.be
            .reverted;
        await expect(yieldSplitter.connect(deployer).withdrawAllPrincipal(0)).to.be.reverted;
        await yieldSplitter.connect(alice).withdrawAllPrincipal(0);
    });

    it("closing a deposit deletes the item from mapping and depositor", async () => {
        await yieldSplitter.deposit(deployer.address, toDecimals(10));
        await expect(await yieldSplitter.depositorIds(deployer.address, 0)).is.equal("0");
        await yieldSplitter.closeDeposit(0);
        await expect(yieldSplitter.depositorIds(deployer.address, 0)).to.be.reverted;
    });

    it("redeeming yield makes getOutstandingYield return 0", async () => {
        await yieldSplitter.deposit(deployer.address, toDecimals(10));
        await triggerRebase();
        const yieldBefore = await yieldSplitter.getOutstandingYield(
            (
                await yieldSplitter.depositInfo(0)
            ).principalAmount,
            (
                await yieldSplitter.depositInfo(0)
            ).agnosticAmount
        );
        await expect(yieldBefore).to.equal("9990009990009991");
        await yieldSplitter.redeemYield(0);
        const yieldAfter = await yieldSplitter.getOutstandingYield(
            (
                await yieldSplitter.depositInfo(0)
            ).principalAmount,
            (
                await yieldSplitter.depositInfo(0)
            ).agnosticAmount
        );
        await expect(yieldAfter).to.equal(0);
    });

    it("can redeem someone elses yield for them if authorised", async () => {
        await yieldSplitter.deposit(deployer.address, toDecimals(10));
        await triggerRebase();
        await yieldSplitter.givePermissionToRedeem(alice.address);

        const yieldBefore = await yieldSplitter.getOutstandingYield(
            (
                await yieldSplitter.depositInfo(0)
            ).principalAmount,
            (
                await yieldSplitter.depositInfo(0)
            ).agnosticAmount
        );
        await expect(yieldBefore).to.equal("9990009990009991");

        await yieldSplitter.connect(alice).redeemYieldOnBehalfOf(0);

        const yieldAfter = await yieldSplitter.getOutstandingYield(
            (
                await yieldSplitter.depositInfo(0)
            ).principalAmount,
            (
                await yieldSplitter.depositInfo(0)
            ).agnosticAmount
        );
        await expect(yieldAfter).to.equal(0);
    });

    it("can revoke permission to redeem on behalf of", async () => {
        await yieldSplitter.deposit(deployer.address, toDecimals(10));
        await triggerRebase();

        expect(yieldSplitter.connect(alice).givePermissionToRedeem(alice.address)).to.be.reverted;
        await yieldSplitter.connect(deployer).givePermissionToRedeem(alice.address);
        await yieldSplitter.connect(alice).redeemYieldOnBehalfOf(0);
        await triggerRebase();

        await yieldSplitter.connect(deployer).revokePermissionToRedeem(alice.address);
        await expect(yieldSplitter.connect(alice).redeemYieldOnBehalfOf(0)).to.be.reverted;
    });

    it("precision issue with gMGMT conversion should not allow users to withdraw more than they have", async () => {
        await gMGMT.connect(deployer).transfer(bob.address, toDecimals(10));
        await yieldSplitter.deposit(bob.address, toDecimals(10));
        await triggerRebase();

        let harvestedYield = await yieldSplitter.getOutstandingYield(
            (
                await yieldSplitter.depositInfo(0)
            ).principalAmount,
            (
                await yieldSplitter.depositInfo(0)
            ).agnosticAmount
        );
        await gMGMT.connect(bob).transfer(deployer.address, harvestedYield);

        let principal = (await yieldSplitter.depositInfo(0)).principalAmount;
        let principalInGMGMT = await gMGMT.balanceTo(principal);
        await gMGMT.connect(bob).transfer(deployer.address, principalInGMGMT);
        await expect(await gMGMT.balanceOf(bob.address)).is.equal(0);
    });
});
