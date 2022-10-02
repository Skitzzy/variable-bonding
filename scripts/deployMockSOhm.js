const { ethers } = require("hardhat");

async function main() {
    // Initialize sMGMT to index of 1 and rebase percentage of 1%
    const mockSMGMTFactory = await ethers.getContractFactory("MockSMGMT");
    const mockSMGMT = await mockSMGMTFactory.deploy("1000000000", "10000000");

    console.log("SMGMT DEPLOYED AT", mockSMGMT.address);
}

main()
    .then(() => process.exit())
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
