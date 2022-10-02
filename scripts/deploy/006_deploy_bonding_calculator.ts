import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { OlympusERC20Token__factory } from "../../types";
import { CONTRACTS } from "../constants";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts, ethers } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const signer = await ethers.provider.getSigner(deployer);

    const mgmtDeployment = await deployments.get(CONTRACTS.mgmt);
    const mgmt = await OlympusERC20Token__factory.connect(mgmtDeployment.address, signer);

    await deploy(CONTRACTS.bondingCalculator, {
        from: deployer,
        args: [mgmt.address],
        log: true,
        skipIfAlreadyDeployed: true,
    });
};

func.tags = [CONTRACTS.bondingCalculator, "staking", "bonding"];
func.dependencies = [CONTRACTS.mgmt];

export default func;
