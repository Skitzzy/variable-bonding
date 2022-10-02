const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account: " + deployer.address);

    const oldsMGMT = "0x1Fecda1dE7b6951B248C0B62CaeBD5BAbedc2084";

    const WSMGMT = await ethers.getContractFactory("wMGMT");
    const wsMGMT = await WSMGMT.deploy(oldsMGMT);

    console.log("old wsMGMT: " + wsMGMT.address);
}

main()
    .then(() => process.exit())
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
