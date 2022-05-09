/* Imports: External */
import { Contract, Wallet, BigNumber, providers, utils } from 'ethers'
import fs, { promises as fsPromise } from 'fs'
import path from 'path'
import { orderBy } from 'lodash'
import fetch from 'node-fetch'

/* Imports: Internal */
import { sleep } from '@eth-optimism/core-utils'
import { BaseService } from '@eth-optimism/common-ts'
import { loadContract } from '@eth-optimism/contracts'

import L1StandardBridgeJson from '@eth-optimism/contracts/artifacts/contracts/L1/messaging/L1StandardBridge.sol/L1StandardBridge.json'
import L1LiquidityPoolJson from '@boba/contracts/artifacts/contracts/LP/L1LiquidityPool.sol/L1LiquidityPool.json'
import L2LiquidityPoolJson from '@boba/contracts/artifacts/contracts/LP/L2LiquidityPool.sol/L2LiquidityPool.json'
import L1NFTBridgeJson from '@boba/contracts/artifacts/contracts/bridges/L1NFTBridge.sol/L1NFTBridge.json'
import L2NFTBridgeJson from '@boba/contracts/artifacts/contracts/bridges/L2NFTBridge.sol/L2NFTBridge.json'
import FluxAggregatorJson from '@boba/contracts/artifacts/contracts/oracle/FluxAggregator.sol/FluxAggregator.json'

interface GasPriceOracleOptions {
  // Providers for interacting with L1 and L2.
  l1RpcProvider: providers.StaticJsonRpcProvider
  l2RpcProvider: providers.StaticJsonRpcProvider
  l2BobaETHProvider: providers.StaticJsonRpcProvider
  l1MoonbeamTestnetProvider: providers.StaticJsonRpcProvider

  // Address Manager address
  addressManagerAddress: string

  // Address of the gasPrice contract
  gasPriceOracleAddress: string
  OVM_SequencerFeeVault: string

  // Wallet
  gasPriceOracleOwnerWallet: Wallet

  // monitor accounts
  sequencerAddress: string
  proposerAddress: string
  relayerAddress: string
  fastRelayerAddress: string

  // Interval in seconds to wait between loops
  pollingInterval: number

  // overhead ratio
  overheadRatio1000X: number

  // Min percent change
  overheadMinPercentChange: number

  // Min overhead
  minOverhead: number

  // Min L1 base fee
  minL1BaseFee: number

  // Max L1 base fee
  maxL1BaseFee: number

  // boba fee / eth fee
  bobaFeeRatio100X: number

  // minimum percentage change for boba fee / eth fee
  bobaFeeRatioMinPercentChange: number
}

const optionSettings = {}

export class GasPriceOracleService extends BaseService<GasPriceOracleOptions> {
  constructor(options: GasPriceOracleOptions) {
    super('GasPriceOracle', options, optionSettings)
  }

  private state: {
    Lib_AddressManager: Contract
    OVM_GasPriceOracle: Contract
    Proxy__L1StandardBridge: Contract
    Proxy__L1LiquidityPool: Contract
    Proxy__L2LiquidityPool: Contract
    CanonicalTransactionChain: Contract
    StateCommitmentChain: Contract
    Proxy__L1NFTBridge: Contract
    Proxy__L2NFTBridge: Contract
    Boba_GasPriceOracle: Contract
    BobaBillingContractAddress: string
    L2SecondaryFeeToken: Contract
    secondaryFeeTokenUSD: Contract
    BobaStraw_BOBAUSD: Contract
    L1SecondaryFeeTokenBalance: BigNumber
    L1SecondaryFeeTokenCostFee: BigNumber
    L1RelayerBalance: BigNumber
    L1RelayerCostFee: BigNumber
    L2BOBAVaultBalance: BigNumber
    L2BOBACollectFee: BigNumber
    L2SecondaryFeeTokenVaultBalance: BigNumber
    L2SecondaryFeeTokenCollectFee: BigNumber
    BOBABillingBalance: BigNumber
    BOBABillingCollectFee: BigNumber
    BOBAUSDPrice: number
    L2SecondaryFeeTokenUSDPrice: number
  }

  protected async _init(): Promise<void> {
    this.logger.info('Initializing gas price oracle', {
      gasPriceOracleAddress: this.options.gasPriceOracleAddress,
      OVM_SequencerFeeVault: this.options.OVM_SequencerFeeVault,
      gasOracleOwnerAddress: this.options.gasPriceOracleOwnerWallet.address,
      sequencerWallet: this.options.sequencerAddress,
      proposerWallet: this.options.proposerAddress,
      relayerWallet: this.options.relayerAddress,
      fastRelayerWallet: this.options.fastRelayerAddress,
      pollingInterval: this.options.pollingInterval,
      overheadRatio1000X: this.options.overheadRatio1000X,
      overheadMinPercentChange: this.options.overheadMinPercentChange,
      minOverhead: this.options.minOverhead,
      minL1BaseFee: this.options.minL1BaseFee,
      bobaFeeRatio100X: this.options.bobaFeeRatio100X,
      bobaFeeRatioMinPercentChange: this.options.bobaFeeRatioMinPercentChange,
    })

    this.state = {} as any

    this.logger.info('Connecting to Lib_AddressManager...')
    this.state.Lib_AddressManager = loadContract(
      'Lib_AddressManager',
      this.options.addressManagerAddress,
      this.options.l1RpcProvider
    )
    this.logger.info('Connected to Lib_AddressManager', {
      address: this.state.Lib_AddressManager.address,
    })

    this.logger.info('Connecting to Proxy__L1StandardBridge...')
    const Proxy__L1StandardBridgeAddress =
      await this.state.Lib_AddressManager.getAddress('Proxy__L1StandardBridge')
    this.state.Proxy__L1StandardBridge = new Contract(
      Proxy__L1StandardBridgeAddress,
      L1StandardBridgeJson.abi,
      this.options.l1RpcProvider
    )
    this.logger.info('Connected to Proxy__L1StandardBridge', {
      address: this.state.Proxy__L1StandardBridge.address,
    })

    this.logger.info('Connecting to Proxy__L1LiquidityPool...')
    const Proxy__L1LiquidityPoolAddress =
      await this.state.Lib_AddressManager.getAddress('Proxy__L1LiquidityPool')
    this.state.Proxy__L1LiquidityPool = new Contract(
      Proxy__L1LiquidityPoolAddress,
      L1LiquidityPoolJson.abi,
      this.options.l1RpcProvider
    )
    this.logger.info('Connected to Proxy__L1LiquidityPool', {
      address: this.state.Proxy__L1LiquidityPool.address,
    })

    this.logger.info('Connecting to Proxy__L2LiquidityPool...')
    const Proxy__L2LiquidityPoolAddress =
      await this.state.Lib_AddressManager.getAddress('Proxy__L2LiquidityPool')
    this.state.Proxy__L2LiquidityPool = new Contract(
      Proxy__L2LiquidityPoolAddress,
      L2LiquidityPoolJson.abi,
      this.options.gasPriceOracleOwnerWallet
    )
    this.logger.info('Connected to Proxy__L2LiquidityPool', {
      address: this.state.Proxy__L2LiquidityPool.address,
    })

    this.logger.info('Connecting to Proxy__L1NFTBridge...')
    const Proxy__L1NFTBridgeAddress =
      await this.state.Lib_AddressManager.getAddress('Proxy__L1NFTBridge')
    this.state.Proxy__L1NFTBridge = new Contract(
      Proxy__L1NFTBridgeAddress,
      L1NFTBridgeJson.abi,
      this.options.gasPriceOracleOwnerWallet
    )
    this.logger.info('Connected to Proxy__L1NFTBridge', {
      address: this.state.Proxy__L1NFTBridge.address,
    })

    const Proxy__L2NFTBridgeAddress =
      await this.state.Lib_AddressManager.getAddress('Proxy__L2NFTBridge')
    this.state.Proxy__L2NFTBridge = new Contract(
      Proxy__L2NFTBridgeAddress,
      L2NFTBridgeJson.abi,
      this.options.gasPriceOracleOwnerWallet
    )
    this.logger.info('Connected to Proxy__L2NFTBridge', {
      address: this.state.Proxy__L2NFTBridge.address,
    })

    this.logger.info('Connecting to CanonicalTransactionChain...')
    const CanonicalTransactionChainAddress =
      await this.state.Lib_AddressManager.getAddress(
        'CanonicalTransactionChain'
      )
    this.state.CanonicalTransactionChain = loadContract(
      'CanonicalTransactionChain',
      CanonicalTransactionChainAddress,
      this.options.l1RpcProvider
    )
    this.logger.info('Connected to CanonicalTransactionChain', {
      address: this.state.CanonicalTransactionChain.address,
    })

    this.logger.info('Connecting to StateCommitmentChain...')
    const StateCommitmentChainAddress =
      await this.state.Lib_AddressManager.getAddress('StateCommitmentChain')
    this.state.StateCommitmentChain = loadContract(
      'StateCommitmentChain',
      StateCommitmentChainAddress,
      this.options.l1RpcProvider
    )
    this.logger.info('Connected to StateCommitmentChain', {
      address: this.state.StateCommitmentChain.address,
    })

    this.logger.info('Connecting to OVM_GasPriceOracle...')
    this.state.OVM_GasPriceOracle = loadContract(
      'OVM_GasPriceOracle',
      this.options.gasPriceOracleAddress,
      this.options.l2RpcProvider
    ).connect(this.options.gasPriceOracleOwnerWallet)
    this.logger.info('Connected to OVM_GasPriceOracle', {
      address: this.state.OVM_GasPriceOracle.address,
    })

    this.logger.info('Connecting to Boba_GasPriceOracle...')
    const Boba_GasPriceOracleAddress =
      await this.state.Lib_AddressManager.getAddress(
        'Proxy__Boba_GasPriceOracle'
      )
    this.state.Boba_GasPriceOracle = loadContract(
      'Boba_GasPriceOracle',
      Boba_GasPriceOracleAddress,
      this.options.l2RpcProvider
    ).connect(this.options.gasPriceOracleOwnerWallet)
    this.logger.info('Connected to Boba_GasPriceOracle', {
      address: this.state.Boba_GasPriceOracle.address,
    })

    this.logger.info('Connecting to L2SecondaryFeeToken...')
    const L2SecondaryFeeTokenAddress =
      await this.state.Lib_AddressManager.getAddress('L2_L1NativeToken')
    this.state.L2SecondaryFeeToken = loadContract(
      'L2_L1NativeToken',
      L2SecondaryFeeTokenAddress,
      this.options.l2RpcProvider
    )
    this.logger.info('Connected to L2SecondaryFeeToken', {
      address: this.state.L2SecondaryFeeToken.address,
    })

    this.logger.info('Connecting to Proxy__BobaBillingContract...')
    this.state.BobaBillingContractAddress =
      await this.state.Lib_AddressManager.getAddress(
        'Proxy__BobaBillingContract'
      )
    this.logger.info('Connected to Proxy__BobaBillingContract', {
      address: this.state.BobaBillingContractAddress,
    })

    this.state.secondaryFeeTokenUSD = new Contract(
      '0x716C5Ee176c5E327De687744052f43f0292fE140',
      new utils.Interface(['function lastPrice() view returns (uint256)']),
      this.options.l1MoonbeamTestnetProvider
    )
    this.state.BobaStraw_BOBAUSD = new Contract(
      '0x987AEd89f5BDC3eb863282DBB76065bFe398be17',
      FluxAggregatorJson.abi,
      this.options.l2BobaETHProvider
    )
    this.logger.info('Connected to BobaStraw', {
      BobaStraw_ETHUSD: this.state.secondaryFeeTokenUSD.address,
      BobaStraw_BOBAUSD: this.state.BobaStraw_BOBAUSD.address,
    })

    // Total cost
    this.state.L1SecondaryFeeTokenBalance = BigNumber.from('0')
    this.state.L1SecondaryFeeTokenCostFee = BigNumber.from('0')
    // For ajusting the billing price
    this.state.L1RelayerBalance = BigNumber.from('0')
    this.state.L1RelayerCostFee = BigNumber.from('0')
    // Total ETH revenuse
    this.state.L2BOBACollectFee = BigNumber.from('0')
    this.state.L2BOBAVaultBalance = BigNumber.from('0')
    // BOBA revenue
    this.state.L2SecondaryFeeTokenVaultBalance = BigNumber.from('0')
    this.state.L2SecondaryFeeTokenCollectFee = BigNumber.from('0')
    this.state.BOBABillingBalance = BigNumber.from('0')
    this.state.BOBABillingCollectFee = BigNumber.from('0')

    // Load history
    await this._loadL1ETHFee()
    await this._loadL2FeeCost()
  }

  protected async _start(): Promise<void> {
    while (this.running) {
      await sleep(this.options.pollingInterval)
      // token price
      await this._queryTokenPrice('BOBA/USD')
      await this._queryTokenPrice('secondaryFeeToken/USD')
      // l2 gas price
      await this._getL1Balance()
      await this._getL2GasCost()
      await this._updatePriceRatio()
      // l1 gas price and overhead fee
      await this._updateOverhead()
      await this._upateL1BaseFee()
    }
  }

  private async _loadL1ETHFee(): Promise<void> {
    const dumpsPath = path.resolve(__dirname, '../data/l1History.json')
    if (fs.existsSync(dumpsPath)) {
      this.logger.warn('Loading L1 cost history...')
      const historyJsonRaw = await fsPromise.readFile(dumpsPath)
      const historyJSON = JSON.parse(historyJsonRaw.toString())
      if (historyJSON.L1SecondaryFeeTokenCostFee) {
        this.state.L1SecondaryFeeTokenBalance = BigNumber.from(
          historyJSON.L1SecondaryFeeTokenBalance
        )
        this.state.L1SecondaryFeeTokenCostFee = BigNumber.from(
          historyJSON.L1SecondaryFeeTokenCostFee
        )
        this.state.L1RelayerBalance = BigNumber.from(
          historyJSON.L1RelayerBalance
        )
        this.state.L1RelayerCostFee = BigNumber.from(
          historyJSON.L1RelayerCostFee
        )
      } else {
        this.logger.warn('Invalid L1 cost history!')
      }
    } else {
      this.logger.warn('No L1 cost history Found!')
    }
  }

  private async _loadL2FeeCost(): Promise<void> {
    const ETHVaultBalance = BigNumber.from(
      (
        await this.options.l2RpcProvider.getBalance(
          this.options.OVM_SequencerFeeVault
        )
      ).toString()
    )
    const L2SecondaryFeeTokenVaultBalance =
      await this.state.L2SecondaryFeeToken.balanceOf(
        this.state.Boba_GasPriceOracle.address
      )
    const BOBABillingBalance = await this.options.l2RpcProvider.getBalance(
      this.state.BobaBillingContractAddress
    )
    // load data
    const dumpsPath = path.resolve(__dirname, '../data/l2History.json')
    if (fs.existsSync(dumpsPath)) {
      this.logger.warn('Loading L2 cost history...')
      const historyJsonRaw = await fsPromise.readFile(dumpsPath)
      const historyJSON = JSON.parse(historyJsonRaw.toString())
      // Load ETH
      if (historyJSON.L2BOBACollectFee) {
        this.state.L2BOBACollectFee = BigNumber.from(
          historyJSON.L2BOBACollectFee
        )
      } else {
        this.logger.warn('Invalid L2 ETH cost history!')
        this.state.L2BOBACollectFee = ETHVaultBalance
      }
      // Load Boba
      if (historyJSON.L2SecondaryFeeTokenCollectFee) {
        this.state.L2SecondaryFeeTokenCollectFee = BigNumber.from(
          historyJSON.L2SecondaryFeeTokenCollectFee
        )
      } else {
        this.logger.warn('Invalid L2 BOBA cost history!')
        this.state.L2SecondaryFeeTokenCollectFee =
          L2SecondaryFeeTokenVaultBalance
      }
      // Load Boba billing
      if (historyJSON.BOBABillingCollectFee) {
        this.state.BOBABillingCollectFee = BigNumber.from(
          historyJSON.BOBABillingCollectFee
        )
      } else {
        this.logger.warn('Invalid L2 BOBA billing history!')
        this.state.BOBABillingCollectFee = BOBABillingBalance
      }
    } else {
      this.logger.warn('No L2 cost history Found!')
      this.state.L2BOBACollectFee = ETHVaultBalance
      this.state.L2SecondaryFeeTokenCollectFee = L2SecondaryFeeTokenVaultBalance
      this.state.BOBABillingCollectFee = BOBABillingBalance
    }
    // adjust the L2BOBACollectFee if it is not correct
    if (this.state.L2BOBACollectFee.lt(ETHVaultBalance)) {
      this.state.L2BOBACollectFee = ETHVaultBalance
    }
    // adjust the L2SecondaryFeeTokenCollectFee if it is not correct
    if (
      this.state.L2SecondaryFeeTokenCollectFee.lt(
        L2SecondaryFeeTokenVaultBalance
      )
    ) {
      this.state.L2SecondaryFeeTokenCollectFee = L2SecondaryFeeTokenVaultBalance
    }
    // adjust the BOBABillingCollectFee if it is not correct
    if (this.state.BOBABillingCollectFee.lt(BOBABillingBalance)) {
      this.state.BOBABillingCollectFee = BOBABillingBalance
    }
    this.state.L2BOBAVaultBalance = ETHVaultBalance
    this.state.L2SecondaryFeeTokenVaultBalance = L2SecondaryFeeTokenVaultBalance
    this.logger.info('Loaded L2 Cost Data', {
      L2BOBAVaultBalance: this.state.L2BOBAVaultBalance.toString(),
      L2BOBACollectFee: this.state.L2BOBACollectFee.toString(),
      L2SecondaryFeeTokenVaultBalance:
        this.state.L2SecondaryFeeTokenVaultBalance.toString(),
      L2SecondaryFeeTokenCollectFee:
        this.state.L2SecondaryFeeTokenCollectFee.toString(),
      BOBABillingCollectFee: this.state.BOBABillingCollectFee.toString(),
    })
  }

  private async _writeL1ETHFee(): Promise<void> {
    const dumpsPath = path.resolve(__dirname, '../data')
    if (!fs.existsSync(dumpsPath)) {
      fs.mkdirSync(dumpsPath)
    }
    try {
      const addrsPath = path.resolve(dumpsPath, 'l1History.json')
      await fsPromise.writeFile(
        addrsPath,
        JSON.stringify({
          L1SecondaryFeeTokenBalance:
            this.state.L1SecondaryFeeTokenBalance.toString(),
          L1SecondaryFeeTokenCostFee:
            this.state.L1SecondaryFeeTokenCostFee.toString(),
          L1RelayerBalance: this.state.L1RelayerBalance.toString(),
          L1RelayerCostFee: this.state.L1RelayerCostFee.toString(),
        })
      )
    } catch (error) {
      console.log(error)
      this.logger.error('Failed to write L1 cost history!')
    }
  }

  private async _writeL2FeeCollect(): Promise<void> {
    const dumpsPath = path.resolve(__dirname, '../data')
    if (!fs.existsSync(dumpsPath)) {
      fs.mkdirSync(dumpsPath)
    }
    try {
      const addrsPath = path.resolve(dumpsPath, 'l2History.json')
      await fsPromise.writeFile(
        addrsPath,
        JSON.stringify({
          L2BOBACollectFee: this.state.L2BOBACollectFee.toString(),
          L2SecondaryFeeTokenCollectFee:
            this.state.L2SecondaryFeeTokenCollectFee.toString(),
          BOBABillingCollectFee: this.state.BOBABillingCollectFee.toString(),
        })
      )
    } catch (error) {
      console.log(error)
      this.logger.error('Failed to write L1 cost history!')
    }
  }

  private async _getL1Balance(): Promise<void> {
    try {
      const balances = await Promise.all([
        this.options.l1RpcProvider.getBalance(this.options.sequencerAddress),
        this.options.l1RpcProvider.getBalance(this.options.proposerAddress),
        this.options.l1RpcProvider.getBalance(this.options.relayerAddress),
        this.options.l1RpcProvider.getBalance(this.options.fastRelayerAddress),
      ])

      this.logger.info('L1 addresses balance', {
        sequencerBalance: Number(
          Number(utils.formatUnits(balances[0], 18)).toFixed(2)
        ),
        proposerBalance: Number(
          Number(utils.formatUnits(balances[1], 18)).toFixed(2)
        ),
        relayerBalance: Number(
          Number(utils.formatUnits(balances[2], 18)).toFixed(2)
        ),
        fastRelayerBalance: Number(
          Number(utils.formatUnits(balances[3], 18)).toFixed(2)
        ),
      })

      const L1SecondaryFeeTokenBalanceLatest = balances.reduce((acc, cur) => {
        return acc.add(cur)
      }, BigNumber.from('0'))

      const L1RelayerETHBalanceLatest = balances[2].add(balances[3])

      // ETH balance
      if (!this.state.L1SecondaryFeeTokenBalance.eq(BigNumber.from('0'))) {
        // condition 1 - L1SecondaryFeeTokenBalance <= L1SecondaryFeeTokenBalanceLatest -- do nothing
        // condition 2 - L1SecondaryFeeTokenBalance > L1SecondaryFeeTokenBalanceLatest
        if (
          this.state.L1SecondaryFeeTokenBalance.gt(
            L1SecondaryFeeTokenBalanceLatest
          )
        ) {
          this.state.L1SecondaryFeeTokenCostFee =
            this.state.L1SecondaryFeeTokenCostFee.add(
              this.state.L1SecondaryFeeTokenBalance.sub(
                L1SecondaryFeeTokenBalanceLatest
              )
            )
        }
      } else {
        // start from the point that L1ETHCost = L2ETHCollect
        this.state.L1SecondaryFeeTokenCostFee = BigNumber.from(
          (
            await this.options.l2RpcProvider.getBalance(
              this.options.OVM_SequencerFeeVault
            )
          ).toString()
        )
      }

      // Relayer ETH balance
      if (!this.state.L1RelayerBalance.eq(BigNumber.from('0'))) {
        // condition 1 - L1RelayerBalance <= L1RelayerETHBalanceLatest -- do nothing
        // condition 2 - L1RelayerBalance > L1RelayerETHBalanceLatest
        if (this.state.L1RelayerBalance.gt(L1RelayerETHBalanceLatest)) {
          this.state.L1RelayerCostFee = this.state.L1RelayerCostFee.add(
            this.state.L1RelayerBalance.sub(L1RelayerETHBalanceLatest)
          )
        }
      } else {
        // start from 0
        this.state.L1RelayerCostFee = BigNumber.from(0)
      }

      this.state.L1SecondaryFeeTokenBalance = L1SecondaryFeeTokenBalanceLatest
      this.state.L1RelayerBalance = L1RelayerETHBalanceLatest

      // write history
      this._writeL1ETHFee()

      this.logger.info('Got L1 ETH balances', {
        network: 'L1',
        data: {
          L1SecondaryFeeTokenBalance:
            this.state.L1SecondaryFeeTokenBalance.toString(),
          L1SecondaryFeeTokenCostFee: Number(
            Number(
              utils.formatEther(
                this.state.L1SecondaryFeeTokenCostFee.toString()
              )
            ).toFixed(6)
          ),
          L1SecondaryFeeTokenCostFee10X: Number(
            (
              Number(
                utils.formatEther(
                  this.state.L1SecondaryFeeTokenCostFee.toString()
                )
              ) * 10
            ).toFixed(6)
          ),
          L1SecondaryFeeTokenCostFeeUSD: Number(
            (
              Number(
                Number(
                  utils.formatEther(
                    this.state.L1SecondaryFeeTokenCostFee.toString()
                  )
                )
              ) * this.state.L2SecondaryFeeTokenUSDPrice
            ).toFixed(2)
          ),
          L1RelayerCostFee: Number(
            Number(
              utils.formatEther(this.state.L1RelayerCostFee.toString())
            ).toFixed(6)
          ),
          L1RelayerCostFeeUSD: Number(
            (
              Number(
                Number(
                  utils.formatEther(this.state.L1RelayerCostFee.toString())
                )
              ) * this.state.L2SecondaryFeeTokenUSDPrice
            ).toFixed(2)
          ),
        },
      })
    } catch (error) {
      this.logger.warn(`CAN\'T GET L1 GAS COST ${error}`)
    }
  }

  private async _getL2GasCost(): Promise<void> {
    try {
      // Get L2 ETH Fee from contract
      const L2BOBACollectFee = BigNumber.from(
        (
          await this.options.l2RpcProvider.getBalance(
            this.options.OVM_SequencerFeeVault
          )
        ).toString()
      )
      // The oETH in OVM_SequencerFeeVault is zero after withdrawing it
      let L2BOBACollectFeeIncreased = BigNumber.from('0')

      if (L2BOBACollectFee.lt(this.state.L2BOBAVaultBalance)) {
        this.state.L2BOBAVaultBalance = L2BOBACollectFee
      }
      L2BOBACollectFeeIncreased = L2BOBACollectFee.sub(
        this.state.L2BOBAVaultBalance
      )
      this.state.L2BOBAVaultBalance = L2BOBACollectFee

      this.state.L2BOBACollectFee = this.state.L2BOBACollectFee.add(
        L2BOBACollectFeeIncreased
      )

      // Get l2 secondary fee token balance from contract
      const L2SecondaryFeeTokenCollectFee =
        await this.state.L2SecondaryFeeToken.balanceOf(
          this.state.Boba_GasPriceOracle.address
        )
      // The l2 secondary fee token in Boba_GasPriceOracle is zero after withdrawing it
      let L2SecondaryFeeTokenCollectFeeIncreased = BigNumber.from('0')

      if (
        L2SecondaryFeeTokenCollectFee.lt(
          this.state.L2SecondaryFeeTokenVaultBalance
        )
      ) {
        this.state.L2SecondaryFeeTokenVaultBalance =
          L2SecondaryFeeTokenCollectFee
      }
      L2SecondaryFeeTokenCollectFeeIncreased =
        L2SecondaryFeeTokenCollectFee.sub(
          this.state.L2SecondaryFeeTokenVaultBalance
        )
      this.state.L2SecondaryFeeTokenVaultBalance = L2SecondaryFeeTokenCollectFee

      this.state.L2SecondaryFeeTokenCollectFee =
        this.state.L2SecondaryFeeTokenCollectFee.add(
          L2SecondaryFeeTokenCollectFeeIncreased
        )

      // Get L2 BOBA Billing balance from contract
      const BOBABillingCollectFee = await this.options.l2RpcProvider.getBalance(
        this.state.BobaBillingContractAddress
      )
      // The BOBA in BobaBillingContract is zero after withdrawing it
      let BOBABillingCollectFeeIncreased = BigNumber.from('0')

      if (BOBABillingCollectFee.lt(this.state.BOBABillingBalance)) {
        this.state.BOBABillingBalance = BOBABillingCollectFee
      }
      BOBABillingCollectFeeIncreased = BOBABillingCollectFee.sub(
        this.state.BOBABillingBalance
      )
      this.state.BOBABillingBalance = BOBABillingCollectFee

      this.state.BOBABillingCollectFee = this.state.BOBABillingCollectFee.add(
        BOBABillingCollectFeeIncreased
      )

      await this._writeL2FeeCollect()

      this.logger.info('Got L2 Gas Collect', {
        network: 'L2',
        data: {
          L2BOBACollectFee: Number(
            Number(
              utils.formatEther(this.state.L2BOBACollectFee.toString())
            ).toFixed(6)
          ),
          L2BOBACollectFee10X: Number(
            (
              Number(
                utils.formatEther(this.state.L2BOBACollectFee.toString())
              ) * 10
            ).toFixed(6)
          ),
          L2SecondaryFeeTokenCollectFee: Number(
            Number(
              utils.formatEther(
                this.state.L2SecondaryFeeTokenCollectFee.toString()
              )
            ).toFixed(6)
          ),
          L2SecondaryFeeTokenCollectFee10X: Number(
            (
              Number(
                utils.formatEther(
                  this.state.L2SecondaryFeeTokenCollectFee.toString()
                )
              ) * 10
            ).toFixed(6)
          ),
          BOBABillingCollectFee: Number(
            Number(
              utils.formatEther(this.state.BOBABillingCollectFee.toString())
            ).toFixed(6)
          ),
          BOBABillingCollectFee10X: Number(
            (
              Number(
                utils.formatEther(this.state.BOBABillingCollectFee.toString())
              ) * 10
            ).toFixed(6)
          ),
          L2BOBACollectFeeUSD: Number(
            (
              Number(
                utils.formatEther(this.state.L2BOBACollectFee.toString())
              ) * this.state.BOBAUSDPrice
            ).toFixed(2)
          ),
          L2SecondaryFeeTokenCollectFeeUSD: Number(
            (
              Number(
                utils.formatEther(
                  this.state.L2SecondaryFeeTokenCollectFee.toString()
                )
              ) * this.state.L2SecondaryFeeTokenUSDPrice
            ).toFixed(2)
          ),
          BOBABillingCollectFeeUSD: Number(
            (
              Number(
                utils.formatEther(this.state.BOBABillingCollectFee.toString())
              ) * this.state.BOBAUSDPrice
            ).toFixed(2)
          ),
          BOBAUSDPrice: Number(this.state.BOBAUSDPrice.toFixed(2)),
          L2SecondaryFeeTokenUSDPrice: Number(
            this.state.L2SecondaryFeeTokenUSDPrice.toFixed(2)
          ),
        },
      })
    } catch (error) {
      this.logger.warn(`CAN\'T GET L2 GAS COST ${error}`)
    }
  }

  private async _updatePriceRatio(): Promise<void> {
    const priceRatio = await this.state.Boba_GasPriceOracle.priceRatio()
    const decimals = await this.state.Boba_GasPriceOracle.decimals()
    const multiplier = 10 ** decimals
    const priceRatioInt = priceRatio.toNumber()
    this.logger.info('Got Boba and ETH price ratio', {
      priceRatio: priceRatioInt,
      L2SecondaryFeeTokenUSDPrice: this.state.L2SecondaryFeeTokenUSDPrice,
      BOBAUSDPrice: this.state.BOBAUSDPrice,
      multiplier,
    })
    try {
      const targetPriceRatio = Math.floor(
        ((this.state.BOBAUSDPrice / this.state.L2SecondaryFeeTokenUSDPrice) *
          multiplier *
          this.options.bobaFeeRatio100X) /
          100
      )
      const targetMarketPriceRatio = Math.floor(
        (this.state.BOBAUSDPrice / this.state.L2SecondaryFeeTokenUSDPrice) *
          multiplier
      )
      if (targetPriceRatio !== priceRatioInt) {
        let targetUpdatedPriceRatio = targetPriceRatio
        if (targetPriceRatio > priceRatio) {
          targetUpdatedPriceRatio = Math.min(
            Math.floor(
              (1 + this.options.bobaFeeRatioMinPercentChange) * priceRatioInt
            ),
            targetPriceRatio
          )
        } else {
          targetUpdatedPriceRatio = Math.max(
            Math.floor(
              (1 - this.options.bobaFeeRatioMinPercentChange) * priceRatioInt
            ),
            targetPriceRatio
          )
        }
        this.logger.info('Updating price ratio...')
        const gasPriceTx =
          await this.state.Boba_GasPriceOracle.updatePriceRatio(
            targetUpdatedPriceRatio,
            targetMarketPriceRatio,
            { gasPrice: 0 }
          )
        await gasPriceTx.wait()
        this.logger.info('Updated price ratio', {
          priceRatio: targetUpdatedPriceRatio,
          targetMarketPriceRatio,
        })
      } else {
        this.logger.info('No need to update price ratio', {
          priceRatio: priceRatioInt,
          targetPriceRatio,
        })
      }
    } catch (error) {
      this.logger.info('Failed to update price ratio', {
        error,
      })
    }
  }

  private async _updateOverhead(): Promise<void> {
    try {
      const latestL1Block = await this.options.l1RpcProvider.getBlockNumber()
      const CanonicalTransactionChainLog =
        await this.state.CanonicalTransactionChain.queryFilter(
          this.state.CanonicalTransactionChain.filters.SequencerBatchAppended(),
          Number(latestL1Block) - 1000,
          Number(latestL1Block)
        )
      const StateCommitmentChainLog =
        await this.state.StateCommitmentChain.queryFilter(
          this.state.StateCommitmentChain.filters.StateBatchAppended(),
          Number(latestL1Block) - 1000,
          Number(latestL1Block)
        )

      const orderedOverheadLog = orderBy(
        [...CanonicalTransactionChainLog, ...StateCommitmentChainLog],
        'blockNumber',
        'desc'
      )

      // Calculate the batch size
      let L1BatchSubmissionGasUsage = BigNumber.from(0)
      const transactionHashList = orderedOverheadLog.reduce(
        (acc, cur, index) => {
          if (!acc.includes(cur.transactionHash)) {
            acc.push(cur.transactionHash)
          }
          return acc
        },
        []
      )

      const batchSize = StateCommitmentChainLog.reduce((acc, cur) => {
        acc += cur.args._batchSize.toNumber()
        return acc
      }, 0)

      for (const hash of transactionHashList) {
        const txReceipt =
          await this.options.l1RpcProvider.getTransactionReceipt(hash)
        L1BatchSubmissionGasUsage = L1BatchSubmissionGasUsage.add(
          txReceipt.gasUsed
        )
      }

      const batchFee = L1BatchSubmissionGasUsage.div(BigNumber.from(batchSize))
      const targetOverheadGas = batchFee
        .mul(BigNumber.from(this.options.overheadRatio1000X))
        .div(BigNumber.from('1000'))

      const overheadProduction = await this.state.OVM_GasPriceOracle.overhead()

      if (
        (targetOverheadGas.toNumber() <
          overheadProduction.toNumber() *
            (1 + this.options.overheadMinPercentChange) &&
          targetOverheadGas.toNumber() >
            overheadProduction.toNumber() *
              (1 - this.options.overheadMinPercentChange)) ||
        !targetOverheadGas.toNumber()
      ) {
        this.logger.info('No need to update overhead value', {
          targetOverheadGas: targetOverheadGas.toNumber(),
          overheadGas: overheadProduction.toNumber(),
        })
      } else {
        if (targetOverheadGas.toNumber() > this.options.minOverhead) {
          this.logger.debug('Updating overhead gas...')
          const tx = await this.state.OVM_GasPriceOracle.setOverhead(
            targetOverheadGas,
            { gasPrice: 0 }
          )
          await tx.wait()
          this.logger.info('Updated overhead gas', {
            overheadProduction: overheadProduction.toNumber(),
            overheadGas: targetOverheadGas.toNumber(),
          })
        } else {
          this.logger.info('No need to update overhead value', {
            targetOverheadGas: targetOverheadGas.toNumber(),
            overheadGas: overheadProduction.toNumber(),
            minOverheadGas: this.options.minOverhead,
          })
        }
      }
    } catch (error) {
      this.logger.warn(`CAN\'T UPDATE OVER HEAD RATIO ${error}`)
    }
  }

  private async _upateL1BaseFee(): Promise<void> {
    try {
      const l1GasPrice = await this.options.l1RpcProvider.getGasPrice()
      const l1BaseFee = await this.state.OVM_GasPriceOracle.l1BaseFee()
      if (
        l1GasPrice.toNumber() !== l1BaseFee.toNumber() &&
        l1GasPrice.toNumber() > this.options.minL1BaseFee &&
        l1GasPrice.toNumber() < this.options.maxL1BaseFee
      ) {
        const tx = await this.state.OVM_GasPriceOracle.setL1BaseFee(
          l1GasPrice,
          { gasPrice: 0 }
        )
        await tx.wait()
        this.logger.info('Updated l1BaseFee', {
          l1GasPrice: l1GasPrice.toNumber(),
          l1BaseFee: l1BaseFee.toNumber(),
        })
      } else {
        this.logger.info('No need to update L1 base gas price', {
          l1GasPrice: l1GasPrice.toNumber(),
          l1BaseFee: l1BaseFee.toNumber(),
          minL1BaseFee: this.options.minL1BaseFee,
          maxL1BaseFee: this.options.maxL1BaseFee,
        })
      }
    } catch (error) {
      this.logger.warn(`CAN\'T UPDATE L1 BASE FEE ${error}`)
    }
  }

  private async _queryTokenPrice(tokenPair): Promise<void> {
    if (tokenPair === 'secondaryFeeToken/USD') {
      const latestAnswer = await this.state.secondaryFeeTokenUSD.lastPrice()
      const decimals = 6 // hardcoded
      // Keep two decimal places
      const preL2SecondaryFeeTokenUSDPrice = latestAnswer.div(
        BigNumber.from(10).pow(decimals - 2)
      )
      this.state.L2SecondaryFeeTokenUSDPrice =
        preL2SecondaryFeeTokenUSDPrice.toNumber() / 100
    }
    // Load BOBA price from L2 BOBAStraw
    if (tokenPair === 'BOBA/USD') {
      const latestAnswer = await this.state.BobaStraw_BOBAUSD.latestAnswer()
      const decimals = await this.state.BobaStraw_BOBAUSD.decimals()
      const preBOBAUSDPrice = latestAnswer.div(
        BigNumber.from(10).pow(decimals - 2)
      )
      this.state.BOBAUSDPrice = preBOBAUSDPrice.toNumber() / 100
    }
  }
}
