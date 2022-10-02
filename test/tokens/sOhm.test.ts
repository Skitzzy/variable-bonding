import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { FakeContract, smock } from "@defi-wonderland/smock";

import {
    FydeStaking,
    FydeTreasury,
    FydeERC20Token,
    FydeERC20Token__factory,
    SFyde,
    SFyde__factory,
    GMGMT,
    FydeAuthority__factory,
} from "../../types";

const TOTAL_GONS = 5000000000000000;
const ZERO_ADDRESS = ethers.utils.getAddress("0x0000000000000000000000000000000000000000");

describe("sMGMT", () => {
    let initializer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let mgmt: FydeERC20Token;
    let sMGMT: SFyde;
    let gMGMTFake: FakeContract<GMGMT>;
    let stakingFake: FakeContract<FydeStaking>;
    let treasuryFake: FakeContract<FydeTreasury>;

    beforeEach(async () => {
        [initializer, alice, bob] = await ethers.getSigners();
        stakingFake = await smock.fake<FydeStaking>("FydeStaking");
        treasuryFake = await smock.fake<FydeTreasury>("FydeTreasury");
        gMGMTFake = await smock.fake<GMGMT>("gMGMT");

        const authority = await new FydeAuthority__factory(initializer).deploy(
            initializer.address,
            initializer.address,
            initializer.address,
            initializer.address
        );
        mgmt = await new FydeERC20Token__factory(initializer).deploy(authority.address);
        sMGMT = await new SFyde__factory(initializer).deploy();
    });

    it("is constructed correctly", async () => {
        expect(await sMGMT.name()).to.equal("Staked MGMT");
        expect(await sMGMT.symbol()).to.equal("sMGMT");
        expect(await sMGMT.decimals()).to.equal(9);
    });

    describe("initialization", () => {
        describe("setIndex", () => {
            it("sets the index", async () => {
                await sMGMT.connect(initializer).setIndex(3);
                expect(await sMGMT.index()).to.equal(3);
            });

            it("must be done by the initializer", async () => {
                await expect(sMGMT.connect(alice).setIndex(3)).to.be.reverted;
            });

            it("cannot update the index if already set", async () => {
                await sMGMT.connect(initializer).setIndex(3);
                await expect(sMGMT.connect(initializer).setIndex(3)).to.be.reverted;
            });
        });

        describe("setgMGMT", () => {
            it("sets gMGMTFake", async () => {
                await sMGMT.connect(initializer).setgMGMT(gMGMTFake.address);
                expect(await sMGMT.gMGMT()).to.equal(gMGMTFake.address);
            });

            it("must be done by the initializer", async () => {
                await expect(sMGMT.connect(alice).setgMGMT(gMGMTFake.address)).to.be.reverted;
            });

            it("won't set gMGMTFake to 0 address", async () => {
                await expect(sMGMT.connect(initializer).setgMGMT(ZERO_ADDRESS)).to.be.reverted;
            });
        });

        describe("initialize", () => {
            it("assigns TOTAL_GONS to the stakingFake contract's balance", async () => {
                await sMGMT
                    .connect(initializer)
                    .initialize(stakingFake.address, treasuryFake.address);
                expect(await sMGMT.balanceOf(stakingFake.address)).to.equal(TOTAL_GONS);
            });

            it("emits Transfer event", async () => {
                await expect(
                    sMGMT.connect(initializer).initialize(stakingFake.address, treasuryFake.address)
                )
                    .to.emit(sMGMT, "Transfer")
                    .withArgs(ZERO_ADDRESS, stakingFake.address, TOTAL_GONS);
            });

            it("emits LogStakingContractUpdated event", async () => {
                await expect(
                    sMGMT.connect(initializer).initialize(stakingFake.address, treasuryFake.address)
                )
                    .to.emit(sMGMT, "LogStakingContractUpdated")
                    .withArgs(stakingFake.address);
            });

            it("unsets the initializer, so it cannot be called again", async () => {
                await sMGMT
                    .connect(initializer)
                    .initialize(stakingFake.address, treasuryFake.address);
                await expect(
                    sMGMT.connect(initializer).initialize(stakingFake.address, treasuryFake.address)
                ).to.be.reverted;
            });
        });
    });

    describe("post-initialization", () => {
        beforeEach(async () => {
            await sMGMT.connect(initializer).setIndex(1);
            await sMGMT.connect(initializer).setgMGMT(gMGMTFake.address);
            await sMGMT.connect(initializer).initialize(stakingFake.address, treasuryFake.address);
        });

        describe("approve", () => {
            it("sets the allowed value between sender and spender", async () => {
                await sMGMT.connect(alice).approve(bob.address, 10);
                expect(await sMGMT.allowance(alice.address, bob.address)).to.equal(10);
            });

            it("emits an Approval event", async () => {
                await expect(await sMGMT.connect(alice).approve(bob.address, 10))
                    .to.emit(sMGMT, "Approval")
                    .withArgs(alice.address, bob.address, 10);
            });
        });

        describe("increaseAllowance", () => {
            it("increases the allowance between sender and spender", async () => {
                await sMGMT.connect(alice).approve(bob.address, 10);
                await sMGMT.connect(alice).increaseAllowance(bob.address, 4);

                expect(await sMGMT.allowance(alice.address, bob.address)).to.equal(14);
            });

            it("emits an Approval event", async () => {
                await sMGMT.connect(alice).approve(bob.address, 10);
                await expect(await sMGMT.connect(alice).increaseAllowance(bob.address, 4))
                    .to.emit(sMGMT, "Approval")
                    .withArgs(alice.address, bob.address, 14);
            });
        });

        describe("decreaseAllowance", () => {
            it("decreases the allowance between sender and spender", async () => {
                await sMGMT.connect(alice).approve(bob.address, 10);
                await sMGMT.connect(alice).decreaseAllowance(bob.address, 4);

                expect(await sMGMT.allowance(alice.address, bob.address)).to.equal(6);
            });

            it("will not make the value negative", async () => {
                await sMGMT.connect(alice).approve(bob.address, 10);
                await sMGMT.connect(alice).decreaseAllowance(bob.address, 11);

                expect(await sMGMT.allowance(alice.address, bob.address)).to.equal(0);
            });

            it("emits an Approval event", async () => {
                await sMGMT.connect(alice).approve(bob.address, 10);
                await expect(await sMGMT.connect(alice).decreaseAllowance(bob.address, 4))
                    .to.emit(sMGMT, "Approval")
                    .withArgs(alice.address, bob.address, 6);
            });
        });

        describe("circulatingSupply", () => {
            it("is zero when all owned by stakingFake contract", async () => {
                await stakingFake.supplyInWarmup.returns(0);
                await gMGMTFake.totalSupply.returns(0);
                await gMGMTFake.balanceFrom.returns(0);

                const totalSupply = await sMGMT.circulatingSupply();
                expect(totalSupply).to.equal(0);
            });

            it("includes all supply owned by gMGMTFake", async () => {
                await stakingFake.supplyInWarmup.returns(0);
                await gMGMTFake.totalSupply.returns(10);
                await gMGMTFake.balanceFrom.returns(10);

                const totalSupply = await sMGMT.circulatingSupply();
                expect(totalSupply).to.equal(10);
            });

            it("includes all supply in warmup in stakingFake contract", async () => {
                await stakingFake.supplyInWarmup.returns(50);
                await gMGMTFake.totalSupply.returns(0);
                await gMGMTFake.balanceFrom.returns(0);

                const totalSupply = await sMGMT.circulatingSupply();
                expect(totalSupply).to.equal(50);
            });
        });
    });
});
