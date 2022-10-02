import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
    CONTRACTS,
    EPOCH_LENGTH_IN_BLOCKS,
    FIRST_EPOCH_TIME,
    FIRST_EPOCH_NUMBER,
} from "../constants";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const authorityDeployment = await deployments.get(CONTRACTS.authority);
    const mgmtDeployment = await deployments.get(CONTRACTS.mgmt);
    const sMGMTDeployment = await deployments.get(CONTRACTS.sMGMT);
    const gMGMTDeployment = await deployments.get(CONTRACTS.gMGMT);

    await deploy(CONTRACTS.staking, {
        from: deployer,
        args: [
            mgmtDeployment.address,
            sMGMTDeployment.address,
            gMGMTDeployment.address,
            EPOCH_LENGTH_IN_BLOCKS,
            FIRST_EPOCH_NUMBER,
            FIRST_EPOCH_TIME,
            authorityDeployment.address,
        ],
        log: true,
    });
};

func.tags = [CONTRACTS.staking, "staking"];
func.dependencies = [CONTRACTS.mgmt, CONTRACTS.sMGMT, CONTRACTS.gMGMT];

export default func;
