import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { MockSMGMT__factory, MockSMGMT } from "../../types";

describe("Mock sMGMT Tests", () => {
    // 100 sMGMT
    const INITIAL_AMOUNT = "100000000000";

    let initializer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let sMGMT: MockSMGMT;

    beforeEach(async () => {
        [initializer, alice, bob] = await ethers.getSigners();

        // Initialize to index of 1 and rebase percentage of 1%
        sMGMT = await new MockSMGMT__factory(initializer).deploy("1000000000", "10000000");

        // Mint 100 sMGMT for intializer account
        await sMGMT.mint(initializer.address, INITIAL_AMOUNT);
    });

    it("should rebase properly", async () => {
        expect(await sMGMT.balanceOf(initializer.address)).to.equal(INITIAL_AMOUNT);
        expect(await sMGMT._agnosticBalance(initializer.address)).to.equal("100000000000");
        expect(await sMGMT.index()).to.equal("1000000000");

        await sMGMT.rebase();
        expect(await sMGMT._agnosticBalance(initializer.address)).to.equal("100000000000");
        expect(await sMGMT.balanceOf(initializer.address)).to.equal("101000000000");
        expect(await sMGMT.index()).to.equal("1010000000");
    });

    it("should transfer properly", async () => {
        expect(await sMGMT.balanceOf(initializer.address)).to.equal(INITIAL_AMOUNT);
        expect(await sMGMT._agnosticBalance(initializer.address)).to.equal("100000000000");

        //await sMGMT.approve(bob.address, INITIAL_AMOUNT);
        await sMGMT.transfer(bob.address, INITIAL_AMOUNT);

        expect(await sMGMT.balanceOf(initializer.address)).to.equal("0");
        expect(await sMGMT._agnosticBalance(initializer.address)).to.equal("0");

        expect(await sMGMT.balanceOf(bob.address)).to.equal(INITIAL_AMOUNT);
        expect(await sMGMT._agnosticBalance(bob.address)).to.equal("100000000000");
    });

    it("should transfer properly after rebase", async () => {
        const afterRebase = "101000000000";

        expect(await sMGMT.balanceOf(initializer.address)).to.equal(INITIAL_AMOUNT);
        expect(await sMGMT._agnosticBalance(initializer.address)).to.equal("100000000000");

        await sMGMT.rebase();
        expect(await sMGMT.balanceOf(initializer.address)).to.equal(afterRebase);
        expect(await sMGMT._agnosticBalance(initializer.address)).to.equal("100000000000");

        const rebasedAmount = "1000000000";
        await sMGMT.transfer(bob.address, rebasedAmount); // Transfer rebased amount

        expect(await sMGMT.balanceOf(initializer.address)).to.equal(INITIAL_AMOUNT);
        expect(await sMGMT._agnosticBalance(initializer.address)).to.equal("99009900991");

        expect(await sMGMT.balanceOf(bob.address)).to.equal(Number(rebasedAmount) - 1); // Precision error ;(
        expect(await sMGMT._agnosticBalance(bob.address)).to.equal("990099009");
    });

    it("should drip funds to users", async () => {
        expect(await sMGMT.balanceOf(initializer.address)).to.equal(INITIAL_AMOUNT);

        await sMGMT.drip();

        expect(await sMGMT.balanceOf(initializer.address)).to.equal("200000000000");
    });
});
