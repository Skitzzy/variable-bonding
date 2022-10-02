const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account: " + deployer.address);

    const firstEpochNumber = "";
    const firstBlockNumber = "";
    const gMGMT = "";
    const authority = "";

    const MGMT = await ethers.getContractFactory("FydeERC20Token");
    const mgmt = await MGMT.deploy(authority);

    const FydeTreasury = await ethers.getContractFactory("FydeTreasury");
    const FydeTreasury = await FydeTreasury.deploy(mgmt.address, "0", authority);

    const SMGMT = await ethers.getContractFactory("sFyde");
    const sMGMT = await SMGMT.deploy();

    const FydeStaking = await ethers.getContractFactory("FydeStaking");
    const staking = await FydeStaking.deploy(
        mgmt.address,
        sMGMT.address,
        gMGMT,
        "2200",
        firstEpochNumber,
        firstBlockNumber,
        authority
    );

    const Distributor = await ethers.getContractFactory("Distributor");
    const distributor = await Distributor.deploy(
        FydeTreasury.address,
        mgmt.address,
        staking.address,
        authority
    );

    await sMGMT.setIndex("");
    await sMGMT.setgMGMT(gMGMT);
    await sMGMT.initialize(staking.address, FydeTreasury.address);

    console.log("MGMT: " + mgmt.address);
    console.log("Fyde Treasury: " + FydeTreasury.address);
    console.log("Staked Fyde: " + sMGMT.address);
    console.log("Staking Contract: " + staking.address);
    console.log("Distributor: " + distributor.address);
}

main()
    .then(() => process.exit())
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
