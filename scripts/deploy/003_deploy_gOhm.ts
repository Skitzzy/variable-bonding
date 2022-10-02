import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { CONTRACTS } from "../constants";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const sMGMTDeployment = await deployments.get(CONTRACTS.sMGMT);
    const migratorDeployment = await deployments.get(CONTRACTS.migrator);

    await deploy(CONTRACTS.gMGMT, {
        from: deployer,
        args: [migratorDeployment.address, sMGMTDeployment.address],
        log: true,
        skipIfAlreadyDeployed: true,
    });
};

func.tags = [CONTRACTS.gMGMT, "migration", "tokens"];
func.dependencies = [CONTRACTS.migrator];

export default func;
