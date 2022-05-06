const ethers = require('ethers')
const chalk = require('chalk')
const { predeploys } = require('@eth-optimism/contracts')
const {
  CrossChainMessenger,
  StandardBridgeAdapter,
  ETHBridgeAdapter,
  DEFAULT_L2_CONTRACT_ADDRESSES,
} = require('../../../packages/sdk')
const { loadContract } = require('../../../packages/contracts/dist/index.js')
const fetch = require('node-fetch')

require('dotenv').config()


const fetchContracts = async () => {
  const response = await fetch(process.env.ADDRESSES_URL)
  const baseAddresses = await response.json()

  const contracts = {
    l1: {
      AddressManager: baseAddresses.AddressManager,
      L1CrossDomainMessenger: baseAddresses.Proxy__L1CrossDomainMessenger,
      L1CrossDomainMessengerFast: '0xB942FA2273C7Bce69833e891BDdFd7212d2dA415', // TODO
      L1StandardBridge: baseAddresses.Proxy__L1StandardBridge,
      StateCommitmentChain: baseAddresses.StateCommitmentChain,
      CanonicalTransactionChain: baseAddresses.CanonicalTransactionChain,
      BondManager: baseAddresses.BondManager,
      L1MultiMessageRelayer: baseAddresses.L1MultiMessageRelayer,
      L1MultiMessageRelayerFast: baseAddresses.L1MultiMessageRelayer, // TODO
      L1BOBA: baseAddresses.TK_L1BOBA,
    },
    l2: DEFAULT_L2_CONTRACT_ADDRESSES,
  }
  const bridges = {
    Standard: {
      Adapter: StandardBridgeAdapter,
      l1Bridge: baseAddresses.Proxy__L1StandardBridge,
      l2Bridge: predeploys.L2StandardBridge,
    },
    ETH: {
      Adapter: ETHBridgeAdapter,
      l1Bridge: baseAddresses.Proxy__L1StandardBridge,
      l2Bridge: predeploys.L2StandardBridge,
    },
  }

  return { contracts, bridges }
}

const sendNativeTokenL1toL2 = async (
  Proxy__L1StandardBridgeAddress,
  L1Wallet,
  L2Provider,
  messenger
) => {
  /*****************************************************/
  /******************** ENTER AMOUNT *******************/
  /*****************************************************/
  const TRANSFER_AMOUNT = ethers.utils.parseEther('0.0001')
  const L2_GAS_LIMIT = 1300000

  const Proxy__L1StandardBridge = loadContract(
    'L1StandardBridge',
    Proxy__L1StandardBridgeAddress,
    L1Wallet
  )

  // send L1 NativeToken to L2
  const depositTx = await Proxy__L1StandardBridge.depositNativeToken(
    L2_GAS_LIMIT,
    ethers.utils.formatBytes32String(new Date().getTime().toString()),
    {
      value: TRANSFER_AMOUNT,
    }
  )

  const receiptL1Tx = await depositTx.wait()
  console.log(' got L1->L2 message hash:', receiptL1Tx.transactionHash)

  const currentBlock = await L2Provider.getBlockNumber()
  const fromBlock = currentBlock - 1000 > 0 ? currentBlock - 1000 : 0

  const receiptL2Tx = await messenger.waitForMessageReceipt(depositTx, {
    fromBlock,
  })

  console.log(
    ' completed Deposit! L2 tx hash:',
    receiptL2Tx.transactionReceipt.transactionHash
  )
}

const sendBobaTokenFromL1ToL2 = async (
  Proxy__L1StandardBridgeAddress,
  BobaTokenAddress,
  L1Wallet,
  L2Provider,
  messenger
) => {
  // const L1BOBA = new ethers.Contract(
  //   BobaTokenAddress,
  //   L1ERC20Json.abi,
  //   L1Wallet
  // )

  const L1BOBA = loadContract('BOBA', BobaTokenAddress, L1Wallet)

  const L1BOBABalance = await L1BOBA.balanceOf(L1Wallet.address)
  console.log(
    `⭐️ ${chalk.red('BOBA L1 Balance:')} ${chalk.green(
      L1BOBABalance.toString()
    )}`
  )

  const balanceBefore = await L2Provider.getBalance(L1Wallet.address)
  console.log(
    `⭐️ ${chalk.red('BOBA L2 Balance:')} ${chalk.green(
      balanceBefore.toString()
    )}`
  )

  const Proxy__L1StandardBridge = loadContract(
    'L1StandardBridge',
    Proxy__L1StandardBridgeAddress,
    L1Wallet
  )

  const approveBOBA = await L1BOBA.approve(
    Proxy__L1StandardBridgeAddress,
    ethers.utils.parseEther('10')
  )
  await approveBOBA.wait()

  // const L2BobaAddress = predeploys.L2_BOBA
  const L2BobaAddress = "0x4200000000000000000000000000000000000006"

  console.log(`L2BobaAddress ${L2BobaAddress}`)

  const depositTx = await Proxy__L1StandardBridge.depositERC20(
    BobaTokenAddress,
    L2BobaAddress,
    ethers.utils.parseEther('10'),
    9999999,
    ethers.utils.formatBytes32String(new Date().getTime().toString())
  )

  const receiptL1Tx = await depositTx.wait()
  console.log(' got L1->L2 message hash:', receiptL1Tx.transactionHash)

  const currentBlock = await L2Provider.getBlockNumber()
  const fromBlock = currentBlock - 1000 > 0 ? currentBlock - 1000 : 0

  const receiptL2Tx = await messenger.waitForMessageReceipt(depositTx, {
    fromBlock,
  })

  console.log(
    ' completed Deposit! L2 tx hash:',
    receiptL2Tx.transactionReceipt.transactionHash
  )

  const balanceAfter = await L2Provider.getBalance(L1Wallet.address)
  console.log(
    `⭐️ ${chalk.red('BOBA L2 Balance updated:')} ${chalk.green(
      balanceAfter.toString()
    )}`
  )
}

const main = async () => {
  const env = process.env

  const L1_NODE_WEB3_URL = env.L1_NODE_WEB3_URL
  const L2_NODE_WEB3_URL = env.L2_NODE_WEB3_URL
  const PRIVATE_KEY = env.PRIVATE_KEY

  const L1Provider = new ethers.providers.StaticJsonRpcProvider(
    L1_NODE_WEB3_URL
  )
  const L2Provider = new ethers.providers.StaticJsonRpcProvider(
    L2_NODE_WEB3_URL
  )
  const L1Wallet = new ethers.Wallet(PRIVATE_KEY).connect(L1Provider)
  const L2Wallet = new ethers.Wallet(PRIVATE_KEY).connect(L2Provider)

  const network = await L1Provider.getNetwork()
  const data = await fetchContracts()
  const contracts = data.contracts
  const bridges = data.bridges

  const messenger = new CrossChainMessenger({
    l1SignerOrProvider: L1Wallet,
    l2SignerOrProvider: L2Wallet,
    l1ChainId: network.chainId,
    fastRelayer: false,
    contracts,
    bridges,
  })

  const Lib_AddressManager = loadContract(
    'Lib_AddressManager',
    contracts.l1.AddressManager,
    L1Provider
  )

  const Proxy__L1CrossDomainMessengerAddress =
    await Lib_AddressManager.getAddress('Proxy__L1CrossDomainMessenger')
  const L2CrossDomainMessengerAddress = await Lib_AddressManager.getAddress(
    'L2CrossDomainMessenger'
  )
  const Proxy__L1StandardBridgeAddress = await Lib_AddressManager.getAddress(
    'Proxy__L1StandardBridge'
  )
  console.log(
    `⭐️ ${chalk.blue('Proxy__L1CrossDomainMessenger address:')} ${chalk.green(
      Proxy__L1CrossDomainMessengerAddress
    )}`
  )
  console.log(
    `⭐️ ${chalk.blue('L2CrossDomainMessenger address:')} ${chalk.green(
      L2CrossDomainMessengerAddress
    )}`
  )
  console.log(
    `⭐️ ${chalk.blue('Proxy__L1StandardBridge address:')} ${chalk.green(
      Proxy__L1StandardBridgeAddress
    )}`
  )

  // console.log(`⭐️ ${chalk.red('send native tokens from L1 to L2')}`)

  // await sendNativeTokenL1toL2(
  //   Proxy__L1StandardBridgeAddress,
  //   L1Wallet,
  //   L2Provider,
  //   messenger
  // )

  console.log(`⭐️ ${chalk.red('send Boba tokens from L1 to L2')}`)

  await sendBobaTokenFromL1ToL2(
    Proxy__L1StandardBridgeAddress,
    contracts.l1.L1BOBA,
    L1Wallet,
    L2Provider,
    messenger
  )
}

try {
  main()
} catch (error) {
  console.log(error)
}
