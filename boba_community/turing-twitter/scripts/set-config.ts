import hre, { artifacts, ethers } from 'hardhat'
import { ContractFactory, providers, Wallet } from 'ethers'
// @ts-ignore
import TwitterFactoryJson from '../artifacts/contracts/AuthenticatedFaucet.sol/AuthenticatedFaucet.json'
import { parseEther } from 'ethers/lib/utils'

const cfg = hre.network.config

async function main() {
  const local_provider = new providers.JsonRpcProvider(cfg['url'])
  const testPrivateKey = process.env.PRIVATE_KEY ?? '0x___________'
  const testWallet = new Wallet(testPrivateKey, local_provider)

  const faucetFactory = new ContractFactory(
    TwitterFactoryJson.abi,
    TwitterFactoryJson.bytecode,
    testWallet
  ).attach('0x8b6A1c0590Ab8A9CED9ADa87Df485eCdd97886E2')

  // apiUrl_, uint256 maxClaimsPerEpoch_, uint256 testnetETHPerClaim_
  const deployTx = await faucetFactory.setConfig(
    'https://pvntcagkg5.execute-api.us-east-1.amazonaws.com/Prod/',
    100,
    ethers.utils.parseEther('0.1')
  )
  const res = await deployTx.wait()

  console.log('Executed at', faucetFactory.address, deployTx, res)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
