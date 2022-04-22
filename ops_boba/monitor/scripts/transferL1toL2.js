process.env.NODE_ENV = 'local'
const ethers = require('ethers')
const { logger } = require('../services/utilities/logger')
const l1StandardBridgeJson = require('@eth-optimism/contracts/artifacts/contracts/L1/messaging/L1StandardBridge.sol/L1StandardBridge.json')

const provider = new ethers.providers.JsonRpcProvider(
  'https://rpc.api.moonbase.moonbeam.network'
)

const wallet = new ethers.Wallet(
  '4e81483436cb3c86bd4a20fa65eaa7edd1edb82a81ea074ff928f6c7891de338',
  provider
)

const l1StandardBridgeContract = new ethers.Contract(
  '0x65759BAa4Daf1A5F53f08fe603F7e1Fc2dc55073',
  l1StandardBridgeJson.abi,
  wallet
)

;(async () => {
  const balance = await wallet.getBalance()
  logger.info(balance)
  const depositAmount = balance.div(2)
  const fundETHTx = await l1StandardBridgeContract.depositETH(8_000_000, '0x', {
    value: depositAmount,
    // gasLimit: 2_000_000, // Idk, gas estimation was broken and this fixes it.
  })
  await fundETHTx.wait()
})()
