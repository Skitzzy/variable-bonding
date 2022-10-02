const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account: " + deployer.address);

    const firstEpochNumber = "";
    const firstBlockNumber = "";
    const gOHM = "";
    const authority = "";

    const OHM = await ethers.getContractFactory("OlympusERC20Token");
    const mgmt = await OHM.deploy(authority);

    const OlympusTreasury = await ethers.getContractFactory("OlympusTreasury");
    const olympusTreasury = await OlympusTreasury.deploy(mgmt.address, "0", authority);

    const SOHM = await ethers.getContractFactory("sOlympus");
    const sOHM = await SOHM.deploy();

    const OlympusStaking = await ethers.getContractFactory("OlympusStaking");
    const staking = await OlympusStaking.deploy(
        mgmt.address,
        sOHM.address,
        gOHM,
        "2200",
        firstEpochNumber,
        firstBlockNumber,
        authority
    );

    const Distributor = await ethers.getContractFactory("Distributor");
    const distributor = await Distributor.deploy(
        olympusTreasury.address,
        mgmt.address,
        staking.address,
        authority
    );

    await sOHM.setIndex("");
    await sOHM.setgOHM(gOHM);
    await sOHM.initialize(staking.address, olympusTreasury.address);

    console.log("OHM: " + mgmt.address);
    console.log("Olympus Treasury: " + olympusTreasury.address);
    console.log("Staked Olympus: " + sOHM.address);
    console.log("Staking Contract: " + staking.address);
    console.log("Distributor: " + distributor.address);
}

main()
    .then(() => process.exit())
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
