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
  MakeSpendSchema
} from '../common/schema.js'
import {
  CurrencyEngine
} from '../common/engine.js'
import { validateObject, getDenomInfo } from '../common/utils.js'
import {
  type EosGetTransaction,
  type EosWalletOtherData
} from './eosTypes.js'
import eosjs from 'eosjs'

const ADDRESS_POLL_MILLISECONDS = 10000
const BLOCKCHAIN_POLL_MILLISECONDS = 15000
const TRANSACTION_POLL_MILLISECONDS = 3000
// const ADDRESS_QUERY_LOOKBACK_BLOCKS = (30 * 60) // ~ one minute

// ----MAIN NET----
const config = {
  chainId: 'aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906', // main net
  keyProvider: [],
  httpEndpoint: '', // main net
  expireInSeconds: 60,
  sign: false, // sign the transaction with a private key. Leaving a transaction unsigned avoids the need to provide a private key
  broadcast: false, // post the transaction to the blockchain. Use false to obtain a fully signed transaction
  verbose: false // verbose logging such as API activity
}
export class EosEngine extends CurrencyEngine {
  // TODO: Add currency specific params
  // Store any per wallet specific data in the `currencyEngine` object. Add any params
  // to the EosEngine class definition in eosEngine.js and initialize them in the
  // constructor()
  eosServer: Object
  otherData: EosWalletOtherData

  constructor (currencyPlugin: EdgeCurrencyPlugin, io_: any, walletInfo: EdgeWalletInfo, opts: EdgeCurrencyEngineOptions) {
    super(currencyPlugin, io_, walletInfo, opts)
    if (typeof this.walletInfo.keys.ownerPublicKey !== 'string') {
      if (walletInfo.keys.ownerPublicKey) {
        this.walletInfo.keys.ownerPublicKey = walletInfo.keys.ownerPublicKey
      } else {
        const pubKeys = currencyPlugin.derivePublicKey(this.walletInfo)
        this.walletInfo.keys.ownerPublicKey = pubKeys.ownerPublicKey
      }
    }

    this.eosServer = {}
  }

  // Poll on the blockheight
  async checkBlockchainInnerLoop () {
    try {
      const result = await new Promise((resolve, reject) => {
        this.eosServer.getInfo((error, info) => {
          if (error) reject(error)
          else resolve(info)
        })
      })
      const blockHeight = result.head_block_num
      if (this.walletLocalData.blockHeight !== blockHeight) {
        this.walletLocalData.blockHeight = blockHeight
        this.walletLocalDataDirty = true
        this.currencyEngineCallbacks.onBlockHeightChanged(this.walletLocalData.blockHeight)
      }
    } catch (e) {
      this.log(`Error fetching height: ${JSON.stringify(e)}`)
    }
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

  // Check all account balance and other relevant info
  async checkAccountInnerLoop () {
    const publicKey = this.walletLocalData.publicKey
    try {
      // Check if the publicKey has an account accountName
      if (!this.walletLocalData.otherData.accountName) {
        const accounts = await new Promise((resolve, reject) => {
          this.eosServer.getKeyAccounts(publicKey, (error, result) => {
            if (error) reject(error)
            resolve(result)
            // array of account names, can be multiples
            // output example: { account_names: [ 'itamnetwork1', ... ] }
          })
        })
        if (accounts.account_names && accounts.account_names.length > 0) {
          this.walletLocalData.otherData.accountName = accounts.account_names[0]
        }
      }

      // Check balance on account
      if (this.walletLocalData.otherData.accountName) {
        const results = await this.eosServer.getCurrencyBalance('eosio.token', this.walletLocalData.otherData.accountName)
        if (results && results.length > 0) {
          for (const r of results) {
            if (typeof r === 'string') {
              const balanceArray = r.split(' ')
              if (balanceArray.length === 2) {
                const exchangeAmount = balanceArray[0]
                const currencyCode = balanceArray[1]
                let nativeAmount = ''

                // Convert exchange amount to native amount
                const denom = getDenomInfo(this.currencyInfo, currencyCode)
                if (denom && denom.multiplier) {
                  nativeAmount = bns.mul(exchangeAmount, denom.multiplier)
                } else {
                  console.log(`Received balance for unsupported currencyCode: ${currencyCode}`)
                }

                if (!this.walletLocalData.totalBalances[currencyCode]) this.walletLocalData.totalBalances[currencyCode] = '0'
                if (!bns.eq(this.walletLocalData.totalBalances[currencyCode], nativeAmount)) {
                  this.walletLocalData.totalBalances[currencyCode] = nativeAmount
                }
                if (this.walletLocalData.totalBalances[currencyCode] !== nativeAmount) {
                  this.walletLocalData.totalBalances[currencyCode] = nativeAmount
                  this.currencyEngineCallbacks.onBalanceChanged(currencyCode, nativeAmount)
                }
              }
            }
          }
        }
      }
    } catch (e) {
      this.log(`Error fetching account: ${JSON.stringify(e)}`)
    }
  }

  // ****************************************************************************
  // Public methods
  // ****************************************************************************

  updateSettings (settings: any) { this.updateSettingsCommon(settings) }

  // This routine is called once a wallet needs to start querying the network
  async startEngine () {
    this.engineOn = true

    config.httpEndpoint = this.currencyInfo.defaultSettings.otherSettings.eosNodes[0]
    this.eosServer = eosjs(config)

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

  getFreshAddress (options: any): EdgeFreshAddress {
    if (this.walletLocalData.otherData.accountName) {
      return { publicAddress: this.walletLocalData.otherData.accountName }
    } else {
      // Account is not yet active. Return the publicKeys so the user can activate the account
      return {
        publicAddress: '',
        publicKey: this.walletInfo.keys.publicKey,
        ownerPublicKey: this.walletInfo.keys.ownerPublicKey
      }
    }
  }

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
