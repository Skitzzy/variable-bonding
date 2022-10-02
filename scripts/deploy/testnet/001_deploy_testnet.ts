import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { CONTRACTS, INITIAL_MINT, INITIAL_MINT_PROFIT } from "../../constants";
import { FydeERC20Token__factory, FydeTreasury__factory, DAI__factory } from "../../../types";
import { waitFor } from "../../txHelper";

const faucetContract = "MGMTFaucet";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts, network, ethers } = hre;

    if (network.name == "mainnet") {
        console.log("Faucet cannot be deployed to mainnet");
        return;
    }

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const signer = await ethers.provider.getSigner(deployer);

    const mgmtDeployment = await deployments.get(CONTRACTS.mgmt);
    const treasuryDeployment = await deployments.get(CONTRACTS.treasury);
    const daiDeployment = await deployments.get(CONTRACTS.DAI);

    const mgmt = FydeERC20Token__factory.connect(mgmtDeployment.address, signer);
    const mockDai = DAI__factory.connect(daiDeployment.address, signer);
    const treasury = FydeTreasury__factory.connect(treasuryDeployment.address, signer);

    // Deploy Faucuet
    await deploy(faucetContract, {
        from: deployer,
        args: [mgmtDeployment.address],
        log: true,
        skipIfAlreadyDeployed: true,
    });
    const faucetDeployment = await deployments.get(faucetContract);

    let faucetBalance = await mgmt.balanceOf(faucetDeployment.address);
    const minMGMT = ethers.BigNumber.from(10000 * 1e9);
    if (faucetBalance.gt(minMGMT)) {
        // short circuit if faucet balance is above 10k mgmt
        console.log("Sufficient faucet balance");
        console.log("Faucet Balance: ", faucetBalance.toString());
        return;
    }
    // Mint Dai
    const daiAmount = INITIAL_MINT;
    await waitFor(mockDai.mint(deployer, daiAmount));
    const daiBalance = await mockDai.balanceOf(deployer);
    console.log("Dai minted: ", daiBalance.toString());

    // Treasury Actions
    await waitFor(treasury.enable(0, deployer, ethers.constants.AddressZero)); // Enable the deployer to deposit reserve tokens
    await waitFor(treasury.enable(2, daiDeployment.address, ethers.constants.AddressZero)); // Enable Dai as a reserve Token

    // Deposit and mint mgmt
    await waitFor(mockDai.approve(treasury.address, daiAmount)); // Approve treasury to use the dai
    await waitFor(treasury.deposit(daiAmount, daiDeployment.address, INITIAL_MINT_PROFIT)); // Deposit Dai into treasury, with a profit set, so that we have reserves for staking
    const mgmtMinted = await mgmt.balanceOf(deployer);
    console.log("MGMT minted: ", mgmtMinted.toString());

    // Fund faucet w/ newly minted dai.
    await waitFor(mgmt.approve(faucetDeployment.address, mgmtMinted));
    await waitFor(mgmt.transfer(faucetDeployment.address, mgmtMinted));

    faucetBalance = await mgmt.balanceOf(faucetDeployment.address);
    console.log("Faucet balance:", faucetBalance.toString());
};

func.tags = ["faucet", "testnet"];
func.dependencies = [CONTRACTS.mgmt, CONTRACTS.DAI, CONTRACTS.treasury];
func.runAtTheEnd = true;

export default func;
