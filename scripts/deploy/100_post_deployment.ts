import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { waitFor } from "../txHelper";
import { CONTRACTS, INITIAL_REWARD_RATE, INITIAL_INDEX, BOUNTY_AMOUNT } from "../constants";
import {
    FydeAuthority__factory,
    Distributor__factory,
    FydeERC20Token__factory,
    FydeStaking__factory,
    SFyde__factory,
    GMGMT__factory,
    FydeTreasury__factory,
    LUSDAllocator__factory,
} from "../../types";

// TODO: Shouldn't run setup methods if the contracts weren't redeployed.
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts, ethers } = hre;
    const { deployer } = await getNamedAccounts();
    const signer = await ethers.provider.getSigner(deployer);

    const authorityDeployment = await deployments.get(CONTRACTS.authority);
    const mgmtDeployment = await deployments.get(CONTRACTS.mgmt);
    const sMGMTDeployment = await deployments.get(CONTRACTS.sMGMT);
    const gMGMTDeployment = await deployments.get(CONTRACTS.gMGMT);
    const distributorDeployment = await deployments.get(CONTRACTS.distributor);
    const treasuryDeployment = await deployments.get(CONTRACTS.treasury);
    const stakingDeployment = await deployments.get(CONTRACTS.staking);
    const lusdAllocatorDeployment = await deployments.get(CONTRACTS.lusdAllocator);

    const authorityContract = await FydeAuthority__factory.connect(
        authorityDeployment.address,
        signer
    );
    const mgmt = FydeERC20Token__factory.connect(mgmtDeployment.address, signer);
    const sMGMT = SFyde__factory.connect(sMGMTDeployment.address, signer);
    const gMGMT = GMGMT__factory.connect(gMGMTDeployment.address, signer);
    const distributor = Distributor__factory.connect(distributorDeployment.address, signer);
    const staking = FydeStaking__factory.connect(stakingDeployment.address, signer);
    const treasury = FydeTreasury__factory.connect(treasuryDeployment.address, signer);
    const lusdAllocator = LUSDAllocator__factory.connect(lusdAllocatorDeployment.address, signer);

    // Step 1: Set treasury as vault on authority
    await waitFor(authorityContract.pushVault(treasury.address, true));
    console.log("Setup -- authorityContract.pushVault: set vault on authority");

    // Step 2: Set distributor as minter on treasury
    await waitFor(treasury.enable(8, distributor.address, ethers.constants.AddressZero)); // Allows distributor to mint mgmt.
    console.log("Setup -- treasury.enable(8):  distributor enabled to mint mgmt on treasury");

    // Step 3: Set distributor on staking
    await waitFor(staking.setDistributor(distributor.address));
    console.log("Setup -- staking.setDistributor:  distributor set on staking");

    // Step 4: Initialize sMGMT and set the index
    if ((await sMGMT.gMGMT()) == ethers.constants.AddressZero) {
        await waitFor(sMGMT.setIndex(INITIAL_INDEX)); // TODO
        await waitFor(sMGMT.setgMGMT(gMGMT.address));
        await waitFor(sMGMT.initialize(staking.address, treasuryDeployment.address));
    }
    console.log("Setup -- smgmt initialized (index, gmgmt)");

    // Step 5: Set up distributor with bounty and recipient
    await waitFor(distributor.setBounty(BOUNTY_AMOUNT));
    await waitFor(distributor.addRecipient(staking.address, INITIAL_REWARD_RATE));
    console.log("Setup -- distributor.setBounty && distributor.addRecipient");

    // Approve staking contact to spend deployer's MGMT
    // TODO: Is this needed?
    // await mgmt.approve(staking.address, LARGE_APPROVAL);
};

func.tags = ["setup"];
func.dependencies = [CONTRACTS.mgmt, CONTRACTS.sMGMT, CONTRACTS.gMGMT];

export default func;
