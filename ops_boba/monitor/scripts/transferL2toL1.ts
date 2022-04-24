process.env.NODE_ENV = 'local'
const ethers = require('ethers')
const { logger } = require('../services/utilities/logger')
import { predeploys } from '@eth-optimism/contracts'
const { OptimismEnv } = require('./utilities/env.ts')
const l2StandardBridgeJson = require('@eth-optimism/contracts/artifacts/contracts/L2/messaging/L2StandardBridge.sol/L2StandardBridge.json')



  ; (async () => {
    logger.info(`Get OptimismEnv`)
    const env = await OptimismEnv.new()

    const balance = await env.l2Wallet.getBalance()
    logger.info(`balance before ${balance.toString()}`)

    const withdrawAmount = balance.div(2)

    const l2StandardBridgeContract = new ethers.Contract(
      '0x4200000000000000000000000000000000000010',
      l2StandardBridgeJson.abi,
      env.l2Wallet
    )

    const withdrawTx = await l2StandardBridgeContract.withdraw(
      predeploys.OVM_ETH,
      withdrawAmount,
      0,
      '0xFFFF'
    )
    await withdrawTx.wait()
    logger.info('tx done', { hash: withdrawTx.hash })
  })()

