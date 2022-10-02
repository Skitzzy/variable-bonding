const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account: " + deployer.address);

    const DAI = "0xB2180448f8945C8Cc8AE9809E67D6bd27d8B2f2C";
    const oldMGMT = "0xC0b491daBf3709Ee5Eb79E603D73289Ca6060932";
    const oldsMGMT = "0x1Fecda1dE7b6951B248C0B62CaeBD5BAbedc2084";
    const oldStaking = "0xC5d3318C0d74a72cD7C55bdf844e24516796BaB2";
    const oldwsMGMT = "0xe73384f11Bb748Aa0Bc20f7b02958DF573e6E2ad";
    const sushiRouter = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";
    const uniRouter = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
    const oldTreasury = "0x0d722D813601E48b7DAcb2DF9bae282cFd98c6E7";

    const FRAX = "0x2f7249cb599139e560f0c81c269ab9b04799e453";
    const LUSD = "0x45754df05aa6305114004358ecf8d04ff3b84e26";

    const Authority = await ethers.getContractFactory("FydeAuthority");
    const authority = await Authority.deploy(
        deployer.address,
        deployer.address,
        deployer.address,
        deployer.address
    );

    const Migrator = await ethers.getContractFactory("FydeTokenMigrator");
    const migrator = await Migrator.deploy(
        oldMGMT,
        oldsMGMT,
        oldTreasury,
        oldStaking,
        oldwsMGMT,
        sushiRouter,
        uniRouter,
        "0",
        authority.address
    );

    const firstEpochNumber = "550";
    const firstBlockNumber = "9505000";

    const MGMT = await ethers.getContractFactory("FydeERC20Token");
    const mgmt = await MGMT.deploy(authority.address);

    const SMGMT = await ethers.getContractFactory("sFyde");
    const sMGMT = await SMGMT.deploy();

    const GMGMT = await ethers.getContractFactory("gMGMT");
    const gMGMT = await GMGMT.deploy(migrator.address, sMGMT.address);

    await migrator.setgMGMT(gMGMT.address);

    const FydeTreasury = await ethers.getContractFactory("FydeTreasury");
    const FydeTreasury = await FydeTreasury.deploy(mgmt.address, "0", authority.address);

    await FydeTreasury.queueTimelock("0", migrator.address, migrator.address);
    await FydeTreasury.queueTimelock("8", migrator.address, migrator.address);
    await FydeTreasury.queueTimelock("2", DAI, DAI);
    await FydeTreasury.queueTimelock("2", FRAX, FRAX);
    await FydeTreasury.queueTimelock("2", LUSD, LUSD);

    await authority.pushVault(FydeTreasury.address, true); // replaces mgmt.setVault(treasury.address)

    const FydeStaking = await ethers.getContractFactory("FydeStaking");
    const staking = await FydeStaking.deploy(
        mgmt.address,
        sMGMT.address,
        gMGMT.address,
        "2200",
        firstEpochNumber,
        firstBlockNumber,
        authority.address
    );

    const Distributor = await ethers.getContractFactory("Distributor");
    const distributor = await Distributor.deploy(
        FydeTreasury.address,
        mgmt.address,
        staking.address,
        authority.address
    );

    // Initialize smgmt
    await sMGMT.setIndex("7675210820");
    await sMGMT.setgMGMT(gMGMT.address);
    await sMGMT.initialize(staking.address, FydeTreasury.address);

    await staking.setDistributor(distributor.address);

    await FydeTreasury.execute("0");
    await FydeTreasury.execute("1");
    await FydeTreasury.execute("2");
    await FydeTreasury.execute("3");
    await FydeTreasury.execute("4");

    console.log("Fyde Authority: ", authority.address);
    console.log("MGMT: " + mgmt.address);
    console.log("sMGMT: " + sMGMT.address);
    console.log("gMGMT: " + gMGMT.address);
    console.log("Fyde Treasury: " + FydeTreasury.address);
    console.log("Staking Contract: " + staking.address);
    console.log("Distributor: " + distributor.address);
    console.log("Migrator: " + migrator.address);
}

main()
    .then(() => process.exit())
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
