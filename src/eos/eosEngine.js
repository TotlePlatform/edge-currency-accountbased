/**
 * Created by paul on 7/7/17.
 */
// @flow

import { currencyInfo } from './eosInfo.js'
import type {
  EdgeTransaction,
  EdgeSpendInfo,
  EdgeFreshAddress
  // EdgeCurrencyEngine,
  // EdgeCurrencyEngineCallbacks,
  // EdgeCurrencyEngineOptions,
  // EdgeWalletInfo,
  // EdgeMetaToken,
  // EdgeCurrencyInfo,
  // EdgeDenomination,
  // EdgeCurrencyPlugin,
  // EdgeIo
} from 'edge-core-js'
import { error } from 'edge-core-js'
import { bns } from 'biggystring'
import {
  EosGetBalancesSchema,
  EosGetBlockchainInfoSchema
} from './eosSchema.js'
import {
  CurrencyEngine
} from '../common/engine.js'
import { validateObject } from '../utils.js'
import type { EosGetTransaction } from './eosTypes.js'

const ADDRESS_POLL_MILLISECONDS = 10000
const BLOCKHEIGHT_POLL_MILLISECONDS = 15000
const TRANSACTION_POLL_MILLISECONDS = 3000
const SAVE_DATASTORE_MILLISECONDS = 10000
// const ADDRESS_QUERY_LOOKBACK_BLOCKS = (30 * 60) // ~ one minute

const PRIMARY_CURRENCY = currencyInfo.currencyCode

export class EosEngine extends CurrencyEngine {
  // TODO: Add currency specific params
  eosApi: Object

  constructor () {
    super()
    this.eosApi = {}
  }

  // Poll on the blockheight
  checkServerInfoInnerLoop = async () => {
    try {
      const fee = await this.eosApi.getFee()
      if (typeof fee === 'string') {
        this.walletLocalData.recommendedFee = fee
      }
      const jsonObj = await this.eosApi.getServerInfo()
      const valid = validateObject(jsonObj, EosGetBlockchainInfoSchema)
      if (valid) {
        const blockHeight: number = jsonObj.validatedLedger.ledgerVersion
        this.log(`Got block height ${blockHeight}`)
        if (this.walletLocalData.blockHeight !== blockHeight) {
          this.walletLocalData.blockHeight = blockHeight // Convert to decimal
          this.walletLocalDataDirty = true
          this.currencyEngineCallbacks.onBlockHeightChanged(this.walletLocalData.blockHeight)
        }
      }
    } catch (err) {
      this.log(`Error fetching height: ${JSON.stringify(err)}`)
    }
  }

  processEosTransaction (tx: EosGetTransaction) {
    // const ourReceiveAddresses:Array<string> = []

    // const balanceChanges = tx.outcome.balanceChanges[this.walletLocalData.displayAddress]
    // if (balanceChanges) {
    //   for (const bc of balanceChanges) {
    //     const currencyCode: string = bc.currency
    //     const date: number = Date.parse(tx.outcome.timestamp) / 1000
    //     const blockHeight: number = tx.outcome.ledgerVersion

    //     let exchangeAmount: string = bc.value
    //     if (exchangeAmount.slice(0, 1) === '-') {
    //       exchangeAmount = bns.add(tx.outcome.fee, exchangeAmount)
    //     } else {
    //       ourReceiveAddresses.push(this.walletLocalData.displayAddress)
    //     }
    //     const nativeAmount: string = bns.mul(exchangeAmount, '1000000')
    //     let networkFee: string
    //     let parentNetworkFee: string
    //     if (currencyCode === PRIMARY_CURRENCY) {
    //       networkFee = bns.mul(tx.outcome.fee, '1000000')
    //     } else {
    //       networkFee = '0'
    //       parentNetworkFee = bns.mul(tx.outcome.fee, '1000000')
    //     }

    //     const edgeTransaction: EdgeTransaction = {
    //       txid: tx.id.toLowerCase(),
    //       date,
    //       currencyCode,
    //       blockHeight,
    //       nativeAmount,
    //       networkFee,
    //       parentNetworkFee,
    //       ourReceiveAddresses,
    //       signedTx: 'has_been_signed',
    //       otherParams: {}
    //     }

    //     const idx = this.findTransaction(currencyCode, edgeTransaction.txid)
    //     if (idx === -1) {
    //       this.log(sprintf('New transaction: %s', edgeTransaction.txid))

    //       // New transaction not in database
    //       this.addTransaction(currencyCode, edgeTransaction)
    //     } else {
    //       // Already have this tx in the database. See if anything changed
    //       const transactionsArray = this.transactionList[ currencyCode ]
    //       const edgeTx = transactionsArray[ idx ]

    //       if (
    //         edgeTx.blockHeight !== edgeTransaction.blockHeight ||
    //         edgeTx.networkFee !== edgeTransaction.networkFee ||
    //         edgeTx.nativeAmount !== edgeTransaction.nativeAmount
    //       ) {
    //         this.log(sprintf('Update transaction: %s height:%s',
    //           edgeTransaction.txid,
    //           edgeTransaction.blockHeight))
    //         this.updateTransaction(currencyCode, edgeTransaction, idx)
    //       } else {
    //         // this.log(sprintf('Old transaction. No Update: %s', tx.hash))
    //       }
    //     }
    //   }

    //   if (this.transactionsChangedArray.length > 0) {
    //     this.currencyEngineCallbacks.onTransactionsChanged(
    //       this.transactionsChangedArray
    //     )
    //     this.transactionsChangedArray = []
    //   }
    // }
  }

  checkTransactionsInnerLoop = async () => {
    // const address = this.walletLocalData.displayAddress
    // let startBlock:number = 0
    // if (this.walletLocalData.lastAddressQueryHeight > ADDRESS_QUERY_LOOKBACK_BLOCKS) {
    //   // Only query for transactions as far back as ADDRESS_QUERY_LOOKBACK_BLOCKS from the last time we queried transactions
    //   startBlock = this.walletLocalData.lastAddressQueryHeight - ADDRESS_QUERY_LOOKBACK_BLOCKS
    // }

    // try {
    //   let options
    //   if (startBlock > ADDRESS_QUERY_LOOKBACK_BLOCKS) {
    //     options = { minLedgerVersion: startBlock }
    //   }
    //   const transactions: XrpGetTransactions = await this.eosApi.getTransactions(address, options)
    //   const valid = validateObject(transactions, GetTransactionsSchema)
    //   if (valid) {
    //     this.log('Fetched transactions count: ' + transactions.length)

    //     // Get transactions
    //     // Iterate over transactions in address
    //     for (let i = 0; i < transactions.length; i++) {
    //       const tx = transactions[i]
    //       this.processEosTransaction(tx)
    //     }
    //     this.updateOnAddressesChecked()
    //   }
    // } catch (e) {
    //   console.log(e.code)
    //   console.log(e.message)
    //   console.log(e)
    //   console.log(`Error fetching transactions: ${JSON.stringify(e)}`)
    //   this.log(`Error fetching transactions: ${JSON.stringify(e)}`)
    // }
  }

  updateOnAddressesChecked () {
    if (this.addressesChecked) {
      return
    }
    this.addressesChecked = true
    this.walletLocalData.lastAddressQueryHeight = this.walletLocalData.blockHeight
    this.currencyEngineCallbacks.onAddressesChecked(1)
  }

  async checkUnconfirmedTransactionsFetch () {

  }

  // Check all addresses for new transactions
  checkAddressesInnerLoop = async () => {
    const address = this.walletLocalData.displayAddress
    try {
      const jsonObj = await this.eosApi.getBalances(address)
      const valid = validateObject(jsonObj, EosGetBalancesSchema)
      if (valid) {
        for (const bal of jsonObj) {
          const currencyCode = bal.currency
          const exchangeAmount = bal.value
          const nativeAmount = bns.mul(exchangeAmount, '1000000')

          if (typeof this.walletLocalData.totalBalances[currencyCode] === 'undefined') {
            this.walletLocalData.totalBalances[currencyCode] = '0'
          }

          if (this.walletLocalData.totalBalances[currencyCode] !== nativeAmount) {
            this.walletLocalData.totalBalances[currencyCode] = nativeAmount
            this.currencyEngineCallbacks.onBalanceChanged(currencyCode, nativeAmount)
          }
        }
      }
    } catch (e) {
      this.log(`Error fetching address info: ${JSON.stringify(e)}`)
    }
  }

  doInitialCallbacks () {
    for (const currencyCode of this.walletLocalData.enabledTokens) {
      try {
        this.currencyEngineCallbacks.onTransactionsChanged(
          this.transactionList[currencyCode]
        )
        this.currencyEngineCallbacks.onBalanceChanged(currencyCode, this.walletLocalData.totalBalances[currencyCode])
      } catch (e) {
        this.log('Error for currencyCode', currencyCode, e)
      }
    }
  }

  getTokenInfo (token: string) {
    return this.allTokens.find(element => {
      return element.currencyCode === token
    })
  }

  async addToLoop (func: Function, timer: number) {
    try {
      // $FlowFixMe
      await func()
    } catch (e) {
      this.log('Error in Loop:', func, e)
    }
    if (this.engineOn) {
      this.timers[func] = setTimeout(() => {
        if (this.engineOn) {
          this.addToLoop(func, timer)
        }
      }, timer)
    }
    return true
  }

  log (...text: Array<any>) {
    text[0] = `${this.walletId}${text[0]}`
    console.log(...text)
  }

  // ****************************************************************************
  // Public methods
  // ****************************************************************************

  updateSettings = (settings: any) => this.updateSettingsCommon(settings)

  async startEngine () {
    this.engineOn = true
    this.doInitialCallbacks()
    this.addToLoop(this.checkServerInfoInnerLoop, BLOCKHEIGHT_POLL_MILLISECONDS)
    this.addToLoop(this.checkAddressesInnerLoop, ADDRESS_POLL_MILLISECONDS)
    this.addToLoop(this.checkTransactionsInnerLoop, TRANSACTION_POLL_MILLISECONDS)
    this.addToLoop(this.saveWalletLoop, SAVE_DATASTORE_MILLISECONDS)
  }

  async killEngine () {
    // Set status flag to false
    this.engineOn = false
    // Clear Inner loops timers
    for (const timer in this.timers) {
      clearTimeout(this.timers[timer])
    }
    this.timers = {}
  }

  resyncBlockchain = async (): Promise<void> => {
    await this.killEngine()
    await this.resyncBlockchainCommon()
    await this.startEngine()
  }

  // synchronous
  getBlockHeight = (): number => this.getBlockHeightCommon()

  // asynchronous
  enableTokens = async (tokens: Array<string>) => this.enableTokensCommon(tokens)

  // asynchronous
  disableTokens = async (tokens: Array<string>) => this.disableTokensCommon(tokens)

  getEnabledTokens = async (): Promise<Array<string>> => this.getEnabledTokensCommon()

  addCustomToken = async (tokenObj: any) => this.addCustomTokenCommon(tokenObj)

  // synchronous
  getTokenStatus = (token: string) => this.getTokenStatusCommon(token)

  // synchronous
  getBalance = (options: any): string => this.getBalanceCommon(options)

  // synchronous
  getNumTransactions = (options: any): number => this.getNumTransactionsCommon(options)

  // asynchronous
  getTransactions = async (options: any) => this.getTransactionsCommon(options)
  // synchronous

  getFreshAddress = (options: any): EdgeFreshAddress => this.getFreshAddressCommon(options)

  // synchronous
  addGapLimitAddresses = (addresses: Array<string>, options: any) => this.addGapLimitAddressesCommon(addresses, options)

  // synchronous
  isAddressUsed = (address: string, options: any) => this.isAddressUsedCommon(address, options)

  // synchronous
  dumpData = (): EdgeDataDump => this.dumpDataCommon()

  // synchronous
  async makeSpend (edgeSpendInfo: EdgeSpendInfo) {
    // Validate the spendInfo
    const valid = validateObject(edgeSpendInfo, {
      'type': 'object',
      'properties': {
        'currencyCode': { 'type': 'string' },
        'networkFeeOption': { 'type': 'string' },
        'spendTargets': {
          'type': 'array',
          'items': {
            'type': 'object',
            'properties': {
              'currencyCode': { 'type': 'string' },
              'publicAddress': { 'type': 'string' },
              'nativeAmount': { 'type': 'string' },
              'destMetadata': { 'type': 'object' },
              'destWallet': { 'type': 'object' }
            },
            'required': [
              'publicAddress'
            ]
          }
        }
      },
      'required': [ 'spendTargets' ]
    })

    if (!valid) {
      throw (new Error('Error: invalid ABCSpendInfo'))
    }

    if (edgeSpendInfo.spendTargets.length !== 1) {
      throw (new Error('Error: only one output allowed'))
    }

    // let tokenInfo = {}
    // tokenInfo.contractAddress = ''
    //
    let currencyCode: string = ''
    if (typeof edgeSpendInfo.currencyCode === 'string') {
      currencyCode = edgeSpendInfo.currencyCode
    } else {
      currencyCode = 'XRP'
    }
    edgeSpendInfo.currencyCode = currencyCode

    let publicAddress = ''

    if (typeof edgeSpendInfo.spendTargets[0].publicAddress === 'string') {
      publicAddress = edgeSpendInfo.spendTargets[0].publicAddress
    } else {
      throw new Error('No valid spendTarget')
    }

    let nativeAmount = '0'
    if (typeof edgeSpendInfo.spendTargets[0].nativeAmount === 'string') {
      nativeAmount = edgeSpendInfo.spendTargets[0].nativeAmount
    } else {
      throw (new Error('Error: no amount specified'))
    }

    if (bns.eq(nativeAmount, '0')) {
      throw (new error.NoAmountSpecifiedError())
    }

    const nativeBalance = this.walletLocalData.totalBalances[currencyCode]
    const nativeNetworkFee = bns.mul(this.walletLocalData.recommendedFee, '1000000')

    if (currencyCode === PRIMARY_CURRENCY) {
      const totalTxAmount = bns.add(nativeNetworkFee, nativeAmount)
      const virtualTxAmount = bns.add(totalTxAmount, '20000000')
      if (bns.gt(virtualTxAmount, nativeBalance)) {
        throw new error.InsufficientFundsError()
      }
    }

    const exchangeAmount = bns.div(nativeAmount, '1000000', 6)
    let uniqueIdentifier
    if (
      edgeSpendInfo.spendTargets[0].otherParams &&
      edgeSpendInfo.spendTargets[0].otherParams.uniqueIdentifier
    ) {
      if (typeof edgeSpendInfo.spendTargets[0].otherParams.uniqueIdentifier === 'string') {
        uniqueIdentifier = parseInt(edgeSpendInfo.spendTargets[0].otherParams.uniqueIdentifier)
      } else {
        throw new Error('Error invalid destinationtag')
      }
    }
    const payment = {
      source: {
        address: this.walletLocalData.displayAddress,
        maxAmount: {
          value: exchangeAmount,
          currency: currencyCode
        }
      },
      destination: {
        address: publicAddress,
        amount: {
          value: exchangeAmount,
          currency: currencyCode
        },
        tag: uniqueIdentifier
      }
    }

    let preparedTx = {}
    try {
      preparedTx = await this.eosApi.preparePayment(
        this.walletLocalData.displayAddress,
        payment,
        { maxLedgerVersionOffset: 300 }
      )
    } catch (err) {
      console.log(err)
      throw new Error('Error in preparePayment')
    }

    const otherParams: RippleParams = {
      preparedTx
    }

    nativeAmount = '-' + nativeAmount

    const edgeTransaction: EdgeTransaction = {
      txid: '', // txid
      date: 0, // date
      currencyCode, // currencyCode
      blockHeight: 0, // blockHeight
      nativeAmount, // nativeAmount
      networkFee: nativeNetworkFee, // networkFee
      ourReceiveAddresses: [], // ourReceiveAddresses
      signedTx: '0', // signedTx
      otherParams
    }

    console.log('Payment transaction prepared...')
    return edgeTransaction
  }

  // asynchronous
  async signTx (edgeTransaction: EdgeTransaction): Promise<EdgeTransaction> {
    // Do signing
    const txJson = edgeTransaction.otherParams.preparedTx.txJSON
    const privateKey = this.walletInfo.keys.rippleKey

    const { signedTransaction, id } = this.eosApi.sign(txJson, privateKey)
    console.log('Payment transaction signed...')

    edgeTransaction.signedTx = signedTransaction
    edgeTransaction.txid = id.toLowerCase()
    edgeTransaction.date = Date.now() / 1000

    return edgeTransaction
  }

  // asynchronous
  async broadcastTx (edgeTransaction: EdgeTransaction): Promise<EdgeTransaction> {
    await this.eosApi.submit(edgeTransaction.signedTx)
    return edgeTransaction
  }

  // asynchronous
  saveTx = async (edgeTransaction: EdgeTransaction) => this.saveTxCommon(edgeTransaction)

  getDisplayPrivateSeed () {
    if (this.walletInfo.keys && this.walletInfo.keys.rippleKey) {
      return this.walletInfo.keys.rippleKey
    }
    return ''
  }

  getDisplayPublicSeed () {
    if (this.walletInfo.keys && this.walletInfo.keys.displayAddress) {
      return this.walletInfo.keys.displayAddress
    }
    return ''
  }
}

export { CurrencyEngine }
