/**
 * Created by paul on 7/7/17.
 */
// @flow

import { currencyInfo } from './xrpInfo.js'
import type {
  EdgeTransaction,
  EdgeSpendInfo,
  EdgeCurrencyPlugin,
  EdgeCurrencyEngineOptions,
  EdgeWalletInfo,
  EdgeDataDump,
  EdgeFreshAddress
  // EdgeCurrencyEngineCallbacks,
  // EdgeMetaToken,
  // EdgeCurrencyInfo,
  // EdgeDenomination,
  // EdgeIo
} from 'edge-core-js'
import { error } from 'edge-core-js'
import { sprintf } from 'sprintf-js'

import { bns } from 'biggystring'
import {
  XrpGetServerInfoSchema,
  XrpGetBalancesSchema,
  XrpGetTransactionsSchema
} from './xrpSchema.js'
import {
  type XrpGetTransaction,
  type XrpGetTransactions
} from './xrpTypes.js'
import {
  CurrencyEngine
} from '../common/engine.js'
import { validateObject } from '../common/utils.js'

const ADDRESS_POLL_MILLISECONDS = 10000
const BLOCKHEIGHT_POLL_MILLISECONDS = 15000
const TRANSACTION_POLL_MILLISECONDS = 3000
const SAVE_DATASTORE_MILLISECONDS = 10000
const ADDRESS_QUERY_LOOKBACK_BLOCKS = (30 * 60) // ~ one minute

const PRIMARY_CURRENCY = currencyInfo.currencyCode

type XrpParams = {
  preparedTx: Object
  // publicAddress?: string,
  // contractAddress?: string
}
export class XrpEngine extends CurrencyEngine {
  // TODO: Add currency specific params
  rippleApi: Object

  constructor (currencyPlugin: EdgeCurrencyPlugin, io_: any, walletInfo: EdgeWalletInfo, opts: EdgeCurrencyEngineOptions) {
    super(currencyPlugin, io_, walletInfo, opts)
    this.rippleApi = {}
  }

  // Poll on the blockheight
  async checkServerInfoInnerLoop () {
    try {
      const fee = await this.rippleApi.getFee()
      if (typeof fee === 'string') {
        this.walletLocalData.otherData.recommendedFee = fee
      }
      const jsonObj = await this.rippleApi.getServerInfo()
      const valid = validateObject(jsonObj, XrpGetServerInfoSchema)
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

  processRippleTransaction (tx: XrpGetTransaction) {
    const ourReceiveAddresses:Array<string> = []

    const balanceChanges = tx.outcome.balanceChanges[this.walletLocalData.displayAddress]
    if (balanceChanges) {
      for (const bc of balanceChanges) {
        const currencyCode: string = bc.currency
        const date: number = Date.parse(tx.outcome.timestamp) / 1000
        const blockHeight: number = tx.outcome.ledgerVersion

        let exchangeAmount: string = bc.value
        if (exchangeAmount.slice(0, 1) === '-') {
          exchangeAmount = bns.add(tx.outcome.fee, exchangeAmount)
        } else {
          ourReceiveAddresses.push(this.walletLocalData.displayAddress)
        }
        const nativeAmount: string = bns.mul(exchangeAmount, '1000000')
        let networkFee: string
        let parentNetworkFee: string
        if (currencyCode === PRIMARY_CURRENCY) {
          networkFee = bns.mul(tx.outcome.fee, '1000000')
        } else {
          networkFee = '0'
          parentNetworkFee = bns.mul(tx.outcome.fee, '1000000')
        }

        const edgeTransaction: EdgeTransaction = {
          txid: tx.id.toLowerCase(),
          date,
          currencyCode,
          blockHeight,
          nativeAmount,
          networkFee,
          parentNetworkFee,
          ourReceiveAddresses,
          signedTx: 'has_been_signed',
          otherParams: {}
        }

        const idx = this.findTransaction(currencyCode, edgeTransaction.txid)
        if (idx === -1) {
          this.log(sprintf('New transaction: %s', edgeTransaction.txid))

          // New transaction not in database
          this.addTransaction(currencyCode, edgeTransaction)
        } else {
          // Already have this tx in the database. See if anything changed
          const transactionsArray = this.transactionList[ currencyCode ]
          const edgeTx = transactionsArray[ idx ]

          if (
            edgeTx.blockHeight !== edgeTransaction.blockHeight ||
            edgeTx.networkFee !== edgeTransaction.networkFee ||
            edgeTx.nativeAmount !== edgeTransaction.nativeAmount
          ) {
            this.log(sprintf('Update transaction: %s height:%s',
              edgeTransaction.txid,
              edgeTransaction.blockHeight))
            this.updateTransaction(currencyCode, edgeTransaction, idx)
          } else {
            // this.log(sprintf('Old transaction. No Update: %s', tx.hash))
          }
        }
      }

      if (this.transactionsChangedArray.length > 0) {
        this.currencyEngineCallbacks.onTransactionsChanged(
          this.transactionsChangedArray
        )
        this.transactionsChangedArray = []
      }
    }
  }

  async checkTransactionsInnerLoop () {
    const address = this.walletLocalData.displayAddress
    let startBlock:number = 0
    if (this.walletLocalData.lastAddressQueryHeight > ADDRESS_QUERY_LOOKBACK_BLOCKS) {
      // Only query for transactions as far back as ADDRESS_QUERY_LOOKBACK_BLOCKS from the last time we queried transactions
      startBlock = this.walletLocalData.lastAddressQueryHeight - ADDRESS_QUERY_LOOKBACK_BLOCKS
    }

    try {
      let options
      if (startBlock > ADDRESS_QUERY_LOOKBACK_BLOCKS) {
        options = { minLedgerVersion: startBlock }
      }
      const transactions: XrpGetTransactions = await this.rippleApi.getTransactions(address, options)
      const valid = validateObject(transactions, XrpGetTransactionsSchema)
      if (valid) {
        this.log('Fetched transactions count: ' + transactions.length)

        // Get transactions
        // Iterate over transactions in address
        for (let i = 0; i < transactions.length; i++) {
          const tx = transactions[i]
          this.processRippleTransaction(tx)
        }
        this.updateOnAddressesChecked()
      }
    } catch (e) {
      console.log(e.code)
      console.log(e.message)
      console.log(e)
      console.log(`Error fetching transactions: ${JSON.stringify(e)}`)
      this.log(`Error fetching transactions: ${JSON.stringify(e)}`)
    }
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
  async checkAddressesInnerLoop () {
    const address = this.walletLocalData.displayAddress
    try {
      const jsonObj = await this.rippleApi.getBalances(address)
      const valid = validateObject(jsonObj, XrpGetBalancesSchema)
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

  // ****************************************************************************
  // Public methods
  // ****************************************************************************

  updateSettings (settings: any) { return this.updateSettingsCommon(settings) }

  async startEngine () {
    this.engineOn = true
    this.doInitialCallbacks()
    await this.rippleApi.connect()
    this.addToLoop('checkServerInfoInnerLoop', BLOCKHEIGHT_POLL_MILLISECONDS)
    this.addToLoop('checkAddressesInnerLoop', ADDRESS_POLL_MILLISECONDS)
    this.addToLoop('checkTransactionsInnerLoop', TRANSACTION_POLL_MILLISECONDS)
    this.addToLoop('saveWalletLoop', SAVE_DATASTORE_MILLISECONDS)
  }

  async killEngine () {
    // Set status flag to false
    this.engineOn = false
    // Clear Inner loops timers
    for (const timer in this.timers) {
      clearTimeout(this.timers[timer])
    }
    this.timers = {}
    await this.rippleApi.disconnect()
  }

  async resyncBlockchain (): Promise<void> {
    await this.killEngine()
    await this.resyncBlockchainCommon()
    await this.startEngine()
  }

  // synchronous
  getBlockHeight (): number { return this.getBlockHeightCommon() }

  // asynchronous
  enableTokens (tokens: Array<string>) { return this.enableTokensCommon(tokens) }

  // asynchronous
  disableTokens (tokens: Array<string>) { return this.disableTokensCommon(tokens) }

  getTokenInfo (token: string) { return this.getTokenInfoCommon(token) }

  async getEnabledTokens (): Promise<Array<string>> { return this.getEnabledTokensCommon() }

  async addCustomToken (tokenObj: any) { return this.addCustomTokenCommon(tokenObj) }

  // synchronous
  getTokenStatus (token: string) { return this.getTokenStatusCommon(token) }

  // synchronous
  getBalance (options: any): string { return this.getBalanceCommon(options) }

  // synchronous
  getNumTransactions (options: any): number { return this.getNumTransactionsCommon(options) }

  // asynchronous
  async getTransactions (options: any) { return this.getTransactionsCommon(options) }
  // synchronous

  getFreshAddress (options: any): EdgeFreshAddress { return this.getFreshAddressCommon(options) }

  // synchronous
  addGapLimitAddresses (addresses: Array<string>, options: any) { return this.addGapLimitAddressesCommon(addresses, options) }

  // synchronous
  isAddressUsed (address: string, options: any) { return this.isAddressUsedCommon(address, options) }

  // synchronous
  dumpData (): EdgeDataDump { return this.dumpDataCommon() }

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
    const nativeNetworkFee = bns.mul(this.walletLocalData.otherData.recommendedFee, '1000000')

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
      preparedTx = await this.rippleApi.preparePayment(
        this.walletLocalData.displayAddress,
        payment,
        { maxLedgerVersionOffset: 300 }
      )
    } catch (err) {
      console.log(err)
      throw new Error('Error in preparePayment')
    }

    const otherParams: XrpParams = {
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

    const { signedTransaction, id } = this.rippleApi.sign(txJson, privateKey)
    console.log('Payment transaction signed...')

    edgeTransaction.signedTx = signedTransaction
    edgeTransaction.txid = id.toLowerCase()
    edgeTransaction.date = Date.now() / 1000

    return edgeTransaction
  }

  // asynchronous
  async broadcastTx (edgeTransaction: EdgeTransaction): Promise<EdgeTransaction> {
    await this.rippleApi.submit(edgeTransaction.signedTx)
    return edgeTransaction
  }

  // asynchronous
  async saveTx (edgeTransaction: EdgeTransaction) { return this.saveTxCommon(edgeTransaction) }

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
