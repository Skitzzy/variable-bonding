// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;

import "ds-test/test.sol"; // ds-test
import "../../../contracts/FydeERC20.sol";

import "../../../contracts/FydeAuthority.sol";

contract OlymppusERC20TokenTest is DSTest {
    FydeERC20Token internal mgmtContract;

    IFydeAuthority internal authority;

    address internal UNAUTHORIZED_USER = address(0x1);

    function test_erc20() public {
        authority = new FydeAuthority(address(this), address(this), address(this), address(this));
        mgmtContract = new FydeERC20Token(address(authority));
        assertEq("Fyde", mgmtContract.name());
        assertEq("MGMT", mgmtContract.symbol());
        assertEq(9, int256(mgmtContract.decimals()));
    }

    function testCannot_mint() public {
        authority = new FydeAuthority(address(this), address(this), address(this), UNAUTHORIZED_USER);
        mgmtContract = new FydeERC20Token(address(authority));
        // try/catch block pattern copied from https://github.com/Anish-Agnihotri/MultiRaffle/blob/master/src/test/utils/DSTestExtended.sol
        try mgmtContract.mint(address(this), 100) {
            fail();
        } catch Error(string memory error) {
            // Assert revert error matches expected message
            assertEq("UNAUTHORIZED", error);
        }
    }

    // Tester will pass it's own parameters, see https://fv.ethereum.org/2020/12/11/symbolic-execution-with-ds-test/
    function test_mint(uint256 amount) public {
        authority = new FydeAuthority(address(this), address(this), address(this), address(this));
        mgmtContract = new FydeERC20Token(address(authority));
        uint256 supplyBefore = mgmtContract.totalSupply();
        // TODO look into https://dapphub.chat/channel/dev?msg=HWrPJqxp8BHMiKTbo
        // mgmtContract.setVault(address(this)); //TODO WTF msg.sender doesn't propigate from .dapprc $DAPP_TEST_CALLER config via mint() call, must use this value
        mgmtContract.mint(address(this), amount);
        assertEq(supplyBefore + amount, mgmtContract.totalSupply());
    }

    // Tester will pass it's own parameters, see https://fv.ethereum.org/2020/12/11/symbolic-execution-with-ds-test/
    function test_burn(uint256 mintAmount, uint256 burnAmount) public {
        authority = new FydeAuthority(address(this), address(this), address(this), address(this));
        mgmtContract = new FydeERC20Token(address(authority));
        uint256 supplyBefore = mgmtContract.totalSupply();
        // mgmtContract.setVault(address(this));  //TODO WTF msg.sender doesn't propigate from .dapprc $DAPP_TEST_CALLER config via mint() call, must use this value
        mgmtContract.mint(address(this), mintAmount);
        if (burnAmount <= mintAmount) {
            mgmtContract.burn(burnAmount);
            assertEq(supplyBefore + mintAmount - burnAmount, mgmtContract.totalSupply());
        } else {
            try mgmtContract.burn(burnAmount) {
                fail();
            } catch Error(string memory error) {
                // Assert revert error matches expected message
                assertEq("ERC20: burn amount exceeds balance", error);
            }
        }
    }
}
