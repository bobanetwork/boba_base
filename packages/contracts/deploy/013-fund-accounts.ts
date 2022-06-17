/* Imports: External */
import { DeployFunction } from 'hardhat-deploy/dist/types'
import { predeploys } from '../src/predeploys'

/* Imports: Internal */
import { getDeployedContract } from '../src/hardhat-deploy-ethers'

const MoonbeamDev = {
  chainID: 1281,
  accounts: [
    {
      privateKey:
        '0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133',
    },
    {
      privateKey:
        '0x8075991ce870b93a8870eca0c0f91913d12f47948ca0fd25b49c6fa7cdbeee8b',
    },
    {
      privateKey:
        '0x0b6e18cafb6ed99687ec547bd28139cafdd2bffe70e6b688025de6b445aa5c5b',
    },
    {
      privateKey:
        '0x39539ab1876910bbf3a223d84a29e28f1cb4e2e456503e7e91ed39b2e7223d68',
    },
    {
      privateKey:
        '0x7dce9bc8babb68fec1409be38c8e1a52650206a7ed90ff956ae8a6d15eeaaef4',
    },
    {
      privateKey:
        '0xb9d2ea9a615f3165812e8d44de0d24da9bbd164b65c4f0573e1ce2c8dbd9c8df',
    },
    {
      privateKey:
        '0x96b8a38e12e1a31dee1eab2fffdf9d9990045f5b37e44d8cc27766ef294acf18',
    },
    {
      privateKey:
        '0x0d6dcaaef49272a5411896be8ad16c01c35d6f8c18873387b71fbc734759b0ab',
    },
    {
      privateKey:
        '0x4c42532034540267bf568198ccec4cb822a025da542861fcb146a5fab6433ff8',
    },
    {
      privateKey:
        '0x94c49300a58d576011096bcb006aa06f5a91b34b4383891e8029c21dc39fbb8b',
    },
    {
      privateKey:
        '0x99b3c12287537e38c90a9219d4cb074a89a16e9cdb20bf85728ebd97c343e342',
    },
  ],
}

const FantomDev = {
  chainID: 4003,
  accounts: [
    {
      privateKey:
        '0x8ffbfce79f185f4b4fb06cb3b51fcdf0fb7403b6e0d4011893ebabfc68d5187c',
    },
    {
      privateKey:
        '0xa95aa44137b087b519cb7d2be9340f4c36709cb0d3de94ba6ba2095563a44696',
    },
    {
      privateKey:
        '0xdc5b19a14a3bbb3e9d70da1955114415d9f230ae661c3f8a2b22ad3a67cd2902',
    },
    {
      privateKey:
        '0xf71e04bb88b3f497fc2cf9b4e35c7e307c2ec6483b8084f750820d09fbe19b54',
    },
    {
      privateKey:
        '0xca2363fa363c2bc26bf070cf96084da59243d518d9c6ac0dc54586fb6c66c6f1',
    },
    {
      privateKey:
        '0xa6c4234c9bcae01a8d9d2301ab14ce2fcdd38fe57bc28fa03cd0678630cb8f5a',
    },
  ],
}

const supportedTestNetwork = {
  1281: MoonbeamDev,
  4003: FantomDev,
}

// This is a TEMPORARY way to fund the default hardhat accounts on L2. The better way to do this is
// to make a modification to hardhat-ovm. However, I don't have the time right now to figure the
// details of how to make that work cleanly. This is fine in the meantime.
const deployFn: DeployFunction = async (hre) => {
  // Only execute this step if we're on the hardhat chain ID.
  const { chainId } = await hre.ethers.provider.getNetwork()
  const testNet = supportedTestNetwork[chainId]
  if (testNet) {
    const L1StandardBridge = await getDeployedContract(
      hre,
      'Proxy__L1StandardBridge',
      {
        iface: 'L1StandardBridge',
      }
    )

    const L1BobaToken = await getDeployedContract(hre, 'TK_L1BOBA', {
      iface: 'BOBA',
    })

    const accounts = testNet.accounts

    // Boba holder
    const BobaHolder = new hre.ethers.Wallet(
      accounts[0].privateKey,
      hre.ethers.provider
    )

    // Fund the accounts.
    for (const account of accounts) {
      const wallet = new hre.ethers.Wallet(
        account.privateKey,
        hre.ethers.provider
      )
      const balance = await wallet.getBalance()
      const depositAmount = balance.div(2) // Deposit half of the wallet's balance into L2.
      const fundETHTx = await L1StandardBridge.connect(
        wallet
      ).depositNativeToken(1_000_000, '0x', {
        value: depositAmount,
        gasLimit: 200_000,
      })
      await fundETHTx.wait()
      console.log(
        `✓ Funded ${wallet.address} on L2 with ${hre.ethers.utils.formatEther(
          depositAmount
        )} ${process.env.L1_NATIVE_TOKEN_SYMBOL}`
      )

      // Deposit Boba tokens to L2 accounts
      const depositBobaAmount = hre.ethers.utils.parseEther('5000')
      const L2BobaAddress = predeploys.L2_BOBA
      const approveTx = await L1BobaToken.connect(BobaHolder).approve(
        L1StandardBridge.address,
        depositBobaAmount
      )
      await approveTx.wait()
      const fundBobaTx = await L1StandardBridge.connect(
        BobaHolder
      ).depositERC20To(
        L1BobaToken.address,
        L2BobaAddress,
        wallet.address,
        depositBobaAmount,
        1_000_000,
        '0x',
        { gasLimit: 400_000 }
      )
      await fundBobaTx.wait()
      console.log(`✓ Funded ${wallet.address} on L2 with 5000.0 BOBA`)
    }
  }
}

deployFn.dependencies = ['Proxy__L1StandardBridge']
deployFn.tags = ['fund-accounts']

export default deployFn
