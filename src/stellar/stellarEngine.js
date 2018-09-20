/**
 * Created by paul on 7/7/17.
 */
// @flow

// import { currencyInfo } from './stellarInfo.js'
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
// import { error } from 'edge-core-js'
// import { sprintf } from 'sprintf-js'

import { bns } from 'biggystring'
// import {
//   // StellarGetServerInfoSchema,
//   StellarGetBalancesSchema,
//   StellarGetTransactionsSchema
// } from './stellarSchema.js'
import {
  type StellarAccount,
  type StellarOperation,
  type StellarTransaction
} from './stellarTypes.js'
import {
  CurrencyEngine
} from '../common/engine.js'
import { validateObject, getDenomInfo } from '../common/utils.js'

const TX_QUERY_PAGING_LIMIT = 2
const ADDRESS_POLL_MILLISECONDS = 15000
const BLOCKCHAIN_POLL_MILLISECONDS = 30000
const TRANSACTION_POLL_MILLISECONDS = 5000
const SAVE_DATASTORE_MILLISECONDS = 10000

export class StellarEngine extends CurrencyEngine {
  // TODO: Add currency specific params
  stellarApi: Object
  stellarServer: Object
  balancesChecked: number
  transactionsChecked: number

  constructor (currencyPlugin: EdgeCurrencyPlugin, io_: any, walletInfo: EdgeWalletInfo, opts: EdgeCurrencyEngineOptions) {
    super(currencyPlugin, io_, walletInfo, opts)
    this.stellarApi = {}
    this.balancesChecked = 0
    this.transactionsChecked = 0
  }

  async processTransaction (tx: StellarOperation): Promise<string> {
    const ourReceiveAddresses:Array<string> = []

    let currencyCode = ''
    let exchangeAmount = ''
    let fromAddress = ''
    let toAddress, nativeAmount, networkFee
    if (tx.type === 'create_account') {
      fromAddress = tx.source_account
      toAddress = tx.account
      exchangeAmount = tx.starting_balance
      currencyCode = this.currencyInfo.currencyCode
    } else if (tx.type === 'payment') {
      fromAddress = tx.from
      toAddress = tx.to
      exchangeAmount = tx.amount
      if (tx.asset_type === 'native') {
        currencyCode = this.currencyInfo.currencyCode
      } else {
        currencyCode = tx.asset_type
      }
    }

    const date: number = Date.parse(tx.created_at) / 1000
    const denom = getDenomInfo(this.currencyInfo, currencyCode)
    if (denom && denom.multiplier) {
      nativeAmount = bns.mul(exchangeAmount, denom.multiplier)
    } else {
      throw new Error('ErrorDenomNotFound')
    }

    let rawTx: StellarTransaction
    try {
      rawTx = await tx.transaction()
      networkFee = rawTx.fee_paid.toString()
    } catch (e) {
      console.log(e)
      throw e
    }

    if (toAddress === this.walletLocalData.displayAddress) {
      ourReceiveAddresses.push(fromAddress)
    } else {
      // This is a spend. Include fee in amount and make amount negative
      nativeAmount = bns.add(nativeAmount, networkFee)
      nativeAmount = '-' + nativeAmount
    }
    const edgeTransaction: EdgeTransaction = {
      txid: tx.transaction_hash,
      date,
      currencyCode,
      blockHeight: rawTx.ledger_attr, // API shows no ledger number ??
      nativeAmount,
      networkFee,
      parentNetworkFee: '0',
      ourReceiveAddresses,
      signedTx: 'has_been_signed',
      otherParams: {
        fromAddress,
        toAddress
      }
    }

    this.addTransaction(currencyCode, edgeTransaction)
    return tx.paging_token
  }

  // Streaming version. Doesn't work in RN
  // async checkTransactionsInnerLoop () {
  //   const address = this.walletLocalData.displayAddress
  //   const txHandler = (tx) => {
  //     console.log('Got something:')
  //     this.processTransaction(tx)
  //   }
  //   let close
  //   const errorHandler = (e) => {
  //     if (close) {
  //       close()
  //       close = null
  //       this.checkTransactionsInnerLoop()
  //     }
  //   }
  //   close = this.stellarServer.payments()
  //     .forAccount(address)
  //     .limit(TX_QUERY_PAGING_LIMIT)
  //     .cursor(this.walletLocalData.otherData.lastPagingToken)
  //     .stream({
  //       onmessage: txHandler,
  //       onerror: errorHandler
  //     })
  // }

  // Polling version
  async checkTransactionsInnerLoop () {
    const address = this.walletLocalData.displayAddress
    let page
    let pagingToken
    while (1) {
      try {
        if (!page) {
          page = await this.stellarServer
            .payments()
            .limit(TX_QUERY_PAGING_LIMIT)
            .cursor(0)
            .forAccount(address).call()
        } else {
          page = await page.next()
        }
        if (page.records.length === 0) {
          break
        }
        for (const tx of page.records) {
          pagingToken = await this.processTransaction(tx)
        }
      } catch (e) {
        pagingToken = undefined
      }
    }
    if (this.transactionsChangedArray.length > 0) {
      this.currencyEngineCallbacks.onTransactionsChanged(
        this.transactionsChangedArray
      )
      this.transactionsChangedArray = []
    }
    if (pagingToken) {
      this.walletLocalData.otherData.pagingToken = pagingToken
      this.walletLocalDataDirty = true
      this.transactionsChecked = 1
      this.updateOnAddressesChecked()
    }
  }

  updateOnAddressesChecked () {
    if (this.addressesChecked === 1) {
      return
    }
    this.addressesChecked = (this.balancesChecked + this.transactionsChecked) / 2
    this.currencyEngineCallbacks.onAddressesChecked(this.addressesChecked)
  }

  async checkUnconfirmedTransactionsFetch () {

  }

  // Check all addresses for new transactions
  async checkAddressesInnerLoop () {
    const address = this.walletLocalData.displayAddress
    try {
      const account: StellarAccount = await this.stellarServer.loadAccount(address)
      for (const bal of account.balances) {
        let currencyCode
        if (bal.asset_type === 'native') {
          currencyCode = this.currencyInfo.currencyCode
          console.log('--Got balances--')
        } else {
          currencyCode = bal.asset_type
        }
        const denom = getDenomInfo(this.currencyInfo, currencyCode)
        if (denom && denom.multiplier) {
          const nativeAmount = bns.mul(bal.balance, denom.multiplier)
          if (typeof this.walletLocalData.totalBalances[currencyCode] === 'undefined') {
            this.walletLocalData.totalBalances[currencyCode] = '0'
          }

          if (this.walletLocalData.totalBalances[currencyCode] !== nativeAmount) {
            this.walletLocalData.totalBalances[currencyCode] = nativeAmount
            this.currencyEngineCallbacks.onBalanceChanged(currencyCode, nativeAmount)
          }
        }
      }
      this.balancesChecked = 1
    } catch (e) {
      this.log(`Error fetching address info: ${JSON.stringify(e)}`)
    }
  }

  checkBlockchainInnerLoop () {
    this.stellarServer.ledgers().order('desc').limit(1).call().then(r => {
      const blockHeight = r.records[0].sequence
      if (this.walletLocalData.blockHeight !== blockHeight) {
        this.walletLocalData.blockHeight = blockHeight
        this.walletLocalDataDirty = true
        this.currencyEngineCallbacks.onBlockHeightChanged(this.walletLocalData.blockHeight)
      }
    }).catch(e => {
      console.log(e)
    })
  }

  // ****************************************************************************
  // Public methods
  // ****************************************************************************

  updateSettings (settings: any) { return this.updateSettingsCommon(settings) }

  async startEngine () {
    this.engineOn = true
    this.doInitialCallbacks()
    this.stellarServer = new this.stellarApi.Server(this.currencyInfo.defaultSettings.otherSettings.stellarServers[0])

    this.addToLoop('checkBlockchainInnerLoop', BLOCKCHAIN_POLL_MILLISECONDS)
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
    // let currencyCode: string = ''
    // if (typeof edgeSpendInfo.currencyCode === 'string') {
    //   currencyCode = edgeSpendInfo.currencyCode
    // } else {
    //   currencyCode = 'XLM'
    // }
    // edgeSpendInfo.currencyCode = currencyCode

    // let publicAddress = ''

    // if (typeof edgeSpendInfo.spendTargets[0].publicAddress === 'string') {
    //   publicAddress = edgeSpendInfo.spendTargets[0].publicAddress
    // } else {
    //   throw new Error('No valid spendTarget')
    // }

    // let nativeAmount = '0'
    // if (typeof edgeSpendInfo.spendTargets[0].nativeAmount === 'string') {
    //   nativeAmount = edgeSpendInfo.spendTargets[0].nativeAmount
    // } else {
    //   throw (new Error('Error: no amount specified'))
    // }

    // if (bns.eq(nativeAmount, '0')) {
    //   throw (new error.NoAmountSpecifiedError())
    // }

    // const nativeBalance = this.walletLocalData.totalBalances[currencyCode]
    // // const nativeNetworkFee = bns.mul(this.walletLocalData.otherData.recommendedFee, '1000000')

    // if (currencyCode === PRIMARY_CURRENCY) {
    //   const totalTxAmount = bns.add(nativeNetworkFee, nativeAmount)
    //   const virtualTxAmount = bns.add(totalTxAmount, '20000000')
    //   if (bns.gt(virtualTxAmount, nativeBalance)) {
    //     throw new error.InsufficientFundsError()
    //   }
    // }

    // const exchangeAmount = bns.div(nativeAmount, '1000000', 6)
    // let uniqueIdentifier
    // if (
    //   edgeSpendInfo.spendTargets[0].otherParams &&
    //   edgeSpendInfo.spendTargets[0].otherParams.uniqueIdentifier
    // ) {
    //   if (typeof edgeSpendInfo.spendTargets[0].otherParams.uniqueIdentifier === 'string') {
    //     uniqueIdentifier = parseInt(edgeSpendInfo.spendTargets[0].otherParams.uniqueIdentifier)
    //   } else {
    //     throw new Error('Error invalid destinationtag')
    //   }
    // }
    // const payment = {
    //   source: {
    //     address: this.walletLocalData.displayAddress,
    //     maxAmount: {
    //       value: exchangeAmount,
    //       currency: currencyCode
    //     }
    //   },
    //   destination: {
    //     address: publicAddress,
    //     amount: {
    //       value: exchangeAmount,
    //       currency: currencyCode
    //     },
    //     tag: uniqueIdentifier
    //   }
    // }

    // let preparedTx = {}
    // try {
    //   preparedTx = await this.stellarApi.preparePayment(
    //     this.walletLocalData.displayAddress,
    //     payment,
    //     { maxLedgerVersionOffset: 300 }
    //   )
    // } catch (err) {
    //   console.log(err)
    //   throw new Error('Error in preparePayment')
    // }

    // const otherParams: StellarParams = {
    //   preparedTx
    // }

    // nativeAmount = '-' + nativeAmount

    const edgeTransaction: EdgeTransaction = {
      txid: '', // txid
      date: 0, // date
      currencyCode: 'XLM', // currencyCode
      blockHeight: 0, // blockHeight
      nativeAmount: '', // nativeAmount
      networkFee: '0', // networkFee
      ourReceiveAddresses: [], // ourReceiveAddresses
      signedTx: '0', // signedTx
      otherParams: {}
    }

    console.log('Payment transaction prepared...')
    return edgeTransaction
  }

  // asynchronous
  async signTx (edgeTransaction: EdgeTransaction): Promise<EdgeTransaction> {
    // Do signing
    // const txJson = edgeTransaction.otherParams.preparedTx.txJSON
    // const privateKey = this.walletInfo.keys.rippleKey

    // const { signedTransaction, id } = this.stellarApi.sign(txJson, privateKey)
    // console.log('Payment transaction signed...')

    // edgeTransaction.signedTx = signedTransaction
    // edgeTransaction.txid = id.toLowerCase()
    // edgeTransaction.date = Date.now() / 1000

    return edgeTransaction
  }

  // asynchronous
  async broadcastTx (edgeTransaction: EdgeTransaction): Promise<EdgeTransaction> {
    // await this.stellarApi.submit(edgeTransaction.signedTx)
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
