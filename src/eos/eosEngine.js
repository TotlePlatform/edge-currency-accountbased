/**
 * Created by paul on 7/7/17.
 */
// @flow

// import { currencyInfo } from './eosInfo.js'
import type {
  EdgeTransaction,
  EdgeSpendInfo,
  EdgeCurrencyPlugin,
  EdgeWalletInfo,
  EdgeCurrencyEngineOptions,
  EdgeFreshAddress,
  EdgeDataDump
  // EdgeCurrencyEngineCallbacks,
  // EdgeMetaToken,
  // EdgeCurrencyInfo,
  // EdgeDenomination,
  // EdgeIo
} from 'edge-core-js'
// import { error } from 'edge-core-js'
import { bns } from 'biggystring'
import {
  EosGetBalancesSchema
  // EosGetBlockchainInfoSchema
} from './eosSchema.js'
import {
  MakeSpendSchema
} from '../common/schema.js'
import {
  CurrencyEngine
} from '../common/engine.js'
import { validateObject } from '../common/utils.js'
import {
  type EosGetTransaction,
  type EosWalletOtherData
} from './eosTypes.js'

const ADDRESS_POLL_MILLISECONDS = 10000
const BLOCKCHAIN_POLL_MILLISECONDS = 15000
const TRANSACTION_POLL_MILLISECONDS = 3000
// const ADDRESS_QUERY_LOOKBACK_BLOCKS = (30 * 60) // ~ one minute

export class EosEngine extends CurrencyEngine {
  // TODO: Add currency specific params
  // Store any per wallet specific data in the `currencyEngine` object. Add any params
  // to the EosEngine class definition in eosEngine.js and initialize them in the
  // constructor()
  eosApi: Object
  otherData: EosWalletOtherData

  constructor (currencyPlugin: EdgeCurrencyPlugin, io_: any, walletInfo: EdgeWalletInfo, opts: EdgeCurrencyEngineOptions) {
    super(currencyPlugin, io_, walletInfo, opts)
    this.eosApi = {}
  }

  // Poll on the blockheight
    // try {
    //   const fee = await this.eosApi.getFee()
    //   if (typeof fee === 'string') {
    //     this.walletLocalData.recommendedFee = fee
    //   }
    //   const jsonObj = await this.eosApi.getServerInfo()
    //   const valid = validateObject(jsonObj, EosGetBlockchainInfoSchema)
    //   if (valid) {
    //     const blockHeight: number = jsonObj.validatedLedger.ledgerVersion
    //     this.log(`Got block height ${blockHeight}`)
    //     if (this.walletLocalData.blockHeight !== blockHeight) {
    //       this.walletLocalData.blockHeight = blockHeight // Convert to decimal
    //       this.walletLocalDataDirty = true
    //       this.currencyEngineCallbacks.onBlockHeightChanged(this.walletLocalData.blockHeight)
    //     }
    //   }
    // } catch (err) {
    //   this.log(`Error fetching height: ${JSON.stringify(err)}`)
    // }
  async checkBlockchainInnerLoop () {
  }

  processTransaction (tx: EosGetTransaction) {
    // const ourReceiveAddresses:Array<string> = []

    // const balanceChanges = tx.outcome.balanceChanges[this.walletLocalData.publicKey]
    // if (balanceChanges) {
    //   for (const bc of balanceChanges) {
    //     const currencyCode: string = bc.currency
    //     const date: number = Date.parse(tx.outcome.timestamp) / 1000
    //     const blockHeight: number = tx.outcome.ledgerVersion

    //     let exchangeAmount: string = bc.value
    //     if (exchangeAmount.slice(0, 1) === '-') {
    //       exchangeAmount = bns.add(tx.outcome.fee, exchangeAmount)
    //     } else {
    //       ourReceiveAddresses.push(this.walletLocalData.publicKey)
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

  async checkTransactionsInnerLoop () {
    // const address = this.walletLocalData.publicKey
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
    //       this.processTransaction(tx)
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
    this.addressesChecked = 1
    this.walletLocalData.lastAddressQueryHeight = this.walletLocalData.blockHeight
    this.currencyEngineCallbacks.onAddressesChecked(1)
  }

  async checkUnconfirmedTransactionsFetch () {

  }

  // Check all account balance and other relevant info
  async checkAccountInnerLoop () {
    const address = this.walletLocalData.publicKey
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

  // ****************************************************************************
  // Public methods
  // ****************************************************************************

  updateSettings (settings: any) { this.updateSettingsCommon(settings) }

  // This routine is called once a wallet needs to start querying the network
  async startEngine () {
    this.engineOn = true
    this.addToLoop('checkBlockchainInnerLoop', BLOCKCHAIN_POLL_MILLISECONDS)
    this.addToLoop('checkAccountInnerLoop', ADDRESS_POLL_MILLISECONDS)
    this.addToLoop('checkTransactionsInnerLoop', TRANSACTION_POLL_MILLISECONDS)
    this.startEngineCommon()
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
    // // Validate the spendInfo
    const valid = validateObject(edgeSpendInfo, MakeSpendSchema)

    if (!valid) {
      throw (new Error('Error: invalid EdgeSpendInfo'))
    }

    // TODO: Validate the number of destination targets supported by this currency.
    // ie. Bitcoin can do multiple targets. Ethereum only one
    // edgeSpendInfo.spendTargets.length

    // TODO: Validate for valid currencyCode which will be in
    // edgeSpendInfo.currencyCode if specified by user. Otherwise use native currency

    // TODO: Get nativeAmount which is denoted is small currency unit. ie satoshi/wei
    // edgeSpendInfo.spendTargets[0].nativeAmount
    //
    // Throw if this currency cannot spend a 0 amount
    // if (bns.eq(nativeAmount, '0')) {
    //   throw (new error.NoAmountSpecifiedError())
    // }

    // TODO: Get current wallet balance and make sure there are sufficient funds including fees
    // const nativeBalance = this.walletLocalData.totalBalances[currencyCode]

    // TODO: Extract unique identifier for this transaction. This is known as a Payment ID for
    // Monero, Destination Tag for Ripple, and Memo ID for Stellar. Use if currency is capable
    // edgeSpendInfo.spendTargets[0].otherParams.uniqueIdentifier

    // TODO: Create an EdgeTransaction object with the following params filled out:
    // currencyCode
    // blockHeight = 0
    // nativeAmount (which includes fee)
    // networkFee (in smallest unit of currency)
    // ourReceiveAddresses = []
    // signedTx = ''
    // otherParams. Object declared in this currency's types.js file (ie. eosTypes.js) 
    //  which are additional params useful for signing and broadcasting transaction 
    const edgeTransaction: EdgeTransaction = {
      txid: '', // txid
      date: 0, // date
      currencyCode: '', // currencyCode
      blockHeight: 0, // blockHeight
      nativeAmount: '', // nativeAmount
      networkFee: '', // networkFee
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
    // Take the private key from this.walletInfo.keys.eosKey and sign the transaction
    // const privateKey = this.walletInfo.keys.rippleKey

    // If signed data is in string format, add to edgeTransaction.signedTx
    // Otherwise utilize otherParams

    // Complete edgeTransaction.txid params if possible at this state
    return edgeTransaction
  }

  // asynchronous
  async broadcastTx (edgeTransaction: EdgeTransaction): Promise<EdgeTransaction> {
    // Broadcast transaction and add date
    // edgeTransaction.data = Date.now() / 1000
    return edgeTransaction
  }

  // asynchronous
  async saveTx (edgeTransaction: EdgeTransaction) { return this.saveTxCommon(edgeTransaction) }

  getDisplayPrivateSeed () {
    if (this.walletInfo.keys && this.walletInfo.keys.rippleKey) {
      return this.walletInfo.keys.eosKey
    }
    return ''
  }

  getDisplayPublicSeed () {
    if (this.walletInfo.keys && this.walletInfo.keys.publicKey) {
      return this.walletInfo.keys.publicKey
    }
    return ''
  }
}

export { CurrencyEngine }
