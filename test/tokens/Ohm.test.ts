import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
    OlympusERC20Token,
    OlympusERC20Token__factory,
    OlympusAuthority__factory,
} from "../../types";

describe("OlympusTest", () => {
    let deployer: SignerWithAddress;
    let vault: SignerWithAddress;
    let bob: SignerWithAddress;
    let alice: SignerWithAddress;
    let mgmt: OlympusERC20Token;

    beforeEach(async () => {
        [deployer, vault, bob, alice] = await ethers.getSigners();

        const authority = await new OlympusAuthority__factory(deployer).deploy(
            deployer.address,
            deployer.address,
            deployer.address,
            vault.address
        );
        await authority.deployed();

        mgmt = await new OlympusERC20Token__factory(deployer).deploy(authority.address);
    });

    it("correctly constructs an ERC20", async () => {
        expect(await mgmt.name()).to.equal("Olympus");
        expect(await mgmt.symbol()).to.equal("OHM");
        expect(await mgmt.decimals()).to.equal(9);
    });

    describe("mint", () => {
        it("must be done by vault", async () => {
            await expect(mgmt.connect(deployer).mint(bob.address, 100)).to.be.revertedWith(
                "UNAUTHORIZED"
            );
        });

        it("increases total supply", async () => {
            const supplyBefore = await mgmt.totalSupply();
            await mgmt.connect(vault).mint(bob.address, 100);
            expect(supplyBefore.add(100)).to.equal(await mgmt.totalSupply());
        });
    });

    describe("burn", () => {
        beforeEach(async () => {
            await mgmt.connect(vault).mint(bob.address, 100);
        });

        it("reduces the total supply", async () => {
            const supplyBefore = await mgmt.totalSupply();
            await mgmt.connect(bob).burn(10);
            expect(supplyBefore.sub(10)).to.equal(await mgmt.totalSupply());
        });

        it("cannot exceed total supply", async () => {
            const supply = await mgmt.totalSupply();
            await expect(mgmt.connect(bob).burn(supply.add(1))).to.be.revertedWith(
                "ERC20: burn amount exceeds balance"
            );
        });

        it("cannot exceed bob's balance", async () => {
            await mgmt.connect(vault).mint(alice.address, 15);
            await expect(mgmt.connect(alice).burn(16)).to.be.revertedWith(
                "ERC20: burn amount exceeds balance"
            );
        });
    });
});
