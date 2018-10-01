/**
 * Created by paul on 7/7/17.
 */
// @flow

import type {
  EdgeTransaction,
  EdgeCurrencyEngineCallbacks,
  EdgeCurrencyEngineOptions,
  EdgeWalletInfo,
  EdgeMetaToken,
  EdgeCurrencyInfo,
  EdgeDenomination,
  EdgeFreshAddress,
  EdgeDataDump,
  EdgeCurrencyPlugin,
  EdgeIo
} from 'edge-core-js'
import { bns } from 'biggystring'
import {
  CustomTokenSchema
} from './schema.js'
import {
  DATA_STORE_FILE,
  DATA_STORE_FOLDER,
  TRANSACTION_STORE_FILE,
  TXID_LIST_FILE,
  TXID_MAP_FILE,
  WalletLocalData,
  type CustomToken
} from './types.js'
import { isHex, normalizeAddress, validateObject } from './utils.js'
import { CurrencyPlugin } from './plugin.js'

const SAVE_DATASTORE_MILLISECONDS = 10000

class CurrencyEngine {
  currencyPlugin: CurrencyPlugin
  walletInfo: EdgeWalletInfo
  currencyEngineCallbacks: EdgeCurrencyEngineCallbacks
  walletLocalFolder: Object
  engineOn: boolean
  addressesChecked: number // True once wallet has been fully checked on the network
  tokenCheckStatus: { [currencyCode: string]: number } // Each currency code can be a 0-1 value
  walletLocalData: WalletLocalData
  walletLocalDataDirty: boolean
  transactionsLoadingPromise: Promise<Object> | null
  transactionListDirty: boolean
  transactionList: { [currencyCode: string]: Array<EdgeTransaction> }
  txIdMap: { [currencyCode: string]: { [txid: string]: number } } // Maps txid to index of tx in 
  txIdList: { [currencyCode: string]: Array<string> } // Map of array of txids in chronological order 
  transactionsChangedArray: Array<EdgeTransaction> // Transactions that have changed and need to be added
  currencyInfo: EdgeCurrencyInfo
  allTokens: Array<EdgeMetaToken>
  customTokens: Array<EdgeMetaToken>
  currentSettings: any
  timers: any
  walletId: string
  io: EdgeIo
  otherData: Object

  constructor (currencyPlugin: CurrencyPlugin, io_: any, walletInfo: EdgeWalletInfo, opts: EdgeCurrencyEngineOptions) {
    const currencyCode = currencyPlugin.currencyInfo.currencyCode
    const { walletLocalFolder, callbacks } = opts

    this.currencyPlugin = currencyPlugin
    this.io = io_
    this.engineOn = false
    this.addressesChecked = 0
    this.tokenCheckStatus = {}
    this.walletLocalDataDirty = false
    this.transactionsChangedArray = []
    this.transactionList = {}
    this.transactionListDirty = false
    this.transactionsLoadingPromise = null
    this.txIdMap = {}
    this.txIdList = {}
    this.walletInfo = walletInfo
    this.walletId = walletInfo.id ? `${walletInfo.id} - ` : ''
    this.currencyInfo = currencyPlugin.currencyInfo
    this.allTokens = currencyPlugin.currencyInfo.metaTokens.slice(0)
    this.customTokens = []
    this.timers = {}

    this.transactionList[currencyCode] = []
    this.txIdMap[currencyCode] = {}
    this.txIdList[currencyCode] = []

    if (typeof opts.optionalSettings !== 'undefined') {
      this.currentSettings = opts.optionalSettings
    } else {
      this.currentSettings = this.currencyInfo.defaultSettings
    }

    this.currencyEngineCallbacks = callbacks
    this.walletLocalFolder = walletLocalFolder

    if (typeof this.walletInfo.keys.publicKey !== 'string') {
      if (walletInfo.keys.publicKey) {
        this.walletInfo.keys.publicKey = walletInfo.keys.publicKey
      } else {
        const pubKeys = currencyPlugin.derivePublicKey(this.walletInfo)
        this.walletInfo.keys.publicKey = pubKeys.publicKey
      }
    }
    this.log(`Created Wallet Type ${this.walletInfo.type} for Currency Plugin ${this.currencyInfo.pluginName}`)
  }

  async loadEngine (plugin: EdgeCurrencyPlugin, io: EdgeIo, walletInfo: EdgeWalletInfo, opts: EdgeCurrencyEngineOptions): Promise<void> {
    const folder = this.walletLocalFolder.folder(DATA_STORE_FOLDER)
    try {
      const result = await folder.file(DATA_STORE_FILE).getText()
      this.walletLocalData = new WalletLocalData(result, this.currencyInfo.currencyCode)
      this.walletLocalData.publicKey = this.walletInfo.keys.publicKey
    } catch (err) {
      try {
        console.log(err)
        console.log('No walletLocalData setup yet: Failure is ok')
        this.walletLocalData = new WalletLocalData(null, this.currencyInfo.currencyCode)
        this.walletLocalData.publicKey = this.walletInfo.keys.publicKey
        await folder.file(DATA_STORE_FILE)
          .setText(JSON.stringify(this.walletLocalData))
      } catch (e) {
        console.log('Error writing to localDataStore. Engine not started:' + err)
        throw e
      }
    }
    try {
      const result = await folder.file(TXID_LIST_FILE).getText()
      this.txIdList = JSON.parse(result)
    } catch (e) {
      console.log('Could not load txidList file. Failure is ok on new device')
      await folder.file(TXID_LIST_FILE)
        .setText(JSON.stringify(this.txIdList))
    }
    try {
      const result = await folder.file(TXID_MAP_FILE).getText()
      this.txIdMap = JSON.parse(result)
    } catch (e) {
      console.log('Could not load txidMap file. Failure is ok on new device')
      await folder.file(TXID_MAP_FILE)
        .setText(JSON.stringify(this.txIdMap))
    }

    // Load transactions in the background
    this.transactionsLoadingPromise = folder.file(TRANSACTION_STORE_FILE).getText().then(result => {
      this.transactionList = JSON.parse(result)
      this.transactionsLoadingPromise = null
      setTimeout(() => {
        this.doInitialTransactionsCallback()
      }, 5000)
    }).catch(e => {
      console.log(e)
      console.log('Failed to load transactionList store file. Failure is ok on new device')
    })

    for (const token of this.walletLocalData.enabledTokens) {
      this.tokenCheckStatus[token] = 0
    }
    this.doInitialBalanceCallback()
  }

  findTransaction (currencyCode: string, txid: string) {
    if (this.txIdMap[currencyCode]) {
      const index = this.txIdMap[currencyCode][txid]
      if (typeof index === 'number') {
        return index
      }
    }
    return -1
  }

  sortTxByDate (a: EdgeTransaction, b: EdgeTransaction) {
    return b.date - a.date
  }

  addTransaction (currencyCode: string, edgeTransaction: EdgeTransaction) {
    // Add or update tx in transactionList
    const txid = normalizeAddress(edgeTransaction.txid)
    const idx = this.findTransaction(currencyCode, txid)

    let needsResort = false
    if (idx === -1) {
      needsResort = true
      this.log('addTransaction: adding and sorting:' + edgeTransaction.txid)
      if (typeof this.transactionList[currencyCode] === 'undefined') {
        this.transactionList[currencyCode] = []
      }
      this.transactionList[currencyCode].push(edgeTransaction)

      this.transactionListDirty = true
      this.transactionsChangedArray.push(edgeTransaction)
    } else {
      // Already have this tx in the database. See if anything changed
      const transactionsArray = this.transactionList[ currencyCode ]
      const edgeTx = transactionsArray[ idx ]

      if (
        edgeTx.blockHeight !== edgeTransaction.blockHeight ||
        edgeTx.networkFee !== edgeTransaction.networkFee ||
        edgeTx.nativeAmount !== edgeTransaction.nativeAmount ||
        edgeTx.date !== edgeTransaction.date
      ) {
        if (edgeTx.date !== edgeTransaction.date) {
          needsResort = true
        }
        this.log(`Update transaction: ${edgeTransaction.txid} height:${edgeTransaction.blockHeight}`)
        this.updateTransaction(currencyCode, edgeTransaction, idx)
      } else {
        // this.log(sprintf('Old transaction. No Update: %s', tx.hash))
      }
    }
    if (needsResort) {
      // Sort
      this.transactionList[currencyCode].sort(this.sortTxByDate)
      // Add to txidMap
      const txIdList: Array<string> = []
      let i = 0
      for (const tx of this.transactionList[currencyCode]) {
        if (!this.txIdMap[currencyCode]) {
          this.txIdMap[currencyCode] = {}
        }
        this.txIdMap[currencyCode][tx.txid] = i
        txIdList.push(normalizeAddress(tx.txid))
        i++
      }
      this.txIdList[currencyCode] = txIdList
    }
  }

  updateTransaction (currencyCode: string, edgeTransaction: EdgeTransaction, idx: number) {
    // Update the transaction
    this.transactionList[currencyCode][idx] = edgeTransaction
    this.transactionListDirty = true
    this.transactionsChangedArray.push(edgeTransaction)
    this.log('updateTransaction:' + edgeTransaction.txid)
  }

  // *************************************
  // Save the wallet data store
  // *************************************
  async saveWalletLoop () {
    const folder = this.walletLocalFolder.folder(DATA_STORE_FOLDER)
    const promises = []
    if (this.walletLocalDataDirty) {
      this.log('walletLocalDataDirty. Saving...')
      const jsonString = JSON.stringify(this.walletLocalData)
      promises.push(folder.file(DATA_STORE_FILE).setText(jsonString).then(() => {
        this.walletLocalDataDirty = false
      }).catch(e => {
        this.log('Error saving walletLocalData')
        this.log(e)
      }))
    }
    if (this.transactionListDirty) {
      this.log('transactionListDirty. Saving...')
      let jsonString = JSON.stringify(this.transactionList)
      promises.push(folder.file(TRANSACTION_STORE_FILE).setText(jsonString).catch(e => {
        this.log('Error saving transactionList')
        this.log(e)
      }))
      jsonString = JSON.stringify(this.txIdList)
      promises.push(folder.file(TXID_LIST_FILE).setText(jsonString).catch(e => {
        this.log('Error saving txIdList')
        this.log(e)
      }))
      jsonString = JSON.stringify(this.txIdMap)
      promises.push(folder.file(TXID_MAP_FILE).setText(jsonString).catch(e => {
        this.log('Error saving txIdMap')
        this.log(e)
      }))
      await Promise.all(promises)
      this.transactionListDirty = false
    } else {
      await Promise.all(promises)
    }
  }

  doInitialBalanceCallback () {
    for (const currencyCode of this.walletLocalData.enabledTokens) {
      try {
        this.currencyEngineCallbacks.onBalanceChanged(currencyCode, this.walletLocalData.totalBalances[currencyCode])
      } catch (e) {
        this.log('Error for currencyCode', currencyCode, e)
      }
    }
  }

  doInitialTransactionsCallback () {
    for (const currencyCode of this.walletLocalData.enabledTokens) {
      try {
        this.currencyEngineCallbacks.onTransactionsChanged(
          this.transactionList[currencyCode]
        )
      } catch (e) {
        this.log('Error for currencyCode', currencyCode, e)
      }
    }
  }
  async addToLoop (func: string, timer: number) {
    try {
      // $FlowFixMe
      await this[func]()
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

  getTokenInfo (token: string) {
    return this.allTokens.find(element => {
      return element.currencyCode === token
    })
  }

  log (...text: Array<any>) {
    text[0] = `${this.walletId}${text[0]}`
    console.log(...text)
  }

  async startEngine () {
    this.addToLoop('saveWalletLoop', SAVE_DATASTORE_MILLISECONDS)
  }

  // *************************************
  // Public methods
  // *************************************

  updateSettings (settings: any) {
    this.currentSettings = settings
  }

  async clearBlockchainCache (): Promise<void> {
    const temp = JSON.stringify({
      enabledTokens: this.walletLocalData.enabledTokens,
      publicKey: this.walletLocalData.publicKey
    })
    this.walletLocalData = new WalletLocalData(temp, this.currencyInfo.currencyCode)
    this.walletLocalDataDirty = true
    this.addressesChecked = 0
    this.transactionList = {}
    this.txIdList = {}
    this.txIdMap = {}
    this.transactionListDirty = true
    this.otherData = this.walletLocalData.otherData
    await this.saveWalletLoop()
  }

  // synchronous
  getBlockHeight (): number {
    return parseInt(this.walletLocalData.blockHeight)
  }

  enableTokensSync (tokens: Array<string>) {
    for (const token of tokens) {
      if (this.walletLocalData.enabledTokens.indexOf(token) === -1) {
        this.walletLocalData.enabledTokens.push(token)
      }
    }
  }

  // asynchronous
  async enableTokens (tokens: Array<string>) {
    this.enableTokensSync(tokens)
  }

  disableTokensSync (tokens: Array<string>) {
    for (const token of tokens) {
      const index = this.walletLocalData.enabledTokens.indexOf(token)
      if (index !== -1) {
        this.walletLocalData.enabledTokens.splice(index, 1)
      }
    }
  }

  // asynchronous
  async disableTokens (tokens: Array<string>) {
    this.disableTokensSync(tokens)
  }

  async getEnabledTokens (): Promise<Array<string>> {
    return this.walletLocalData.enabledTokens
  }

  async addCustomToken (obj: any) {
    const valid = validateObject(obj, CustomTokenSchema)

    if (valid) {
      const tokenObj: CustomToken = obj
      // If token is already in currencyInfo, error as it cannot be changed
      for (const tk of this.currencyInfo.metaTokens) {
        if (
          tk.currencyCode.toLowerCase() === tokenObj.currencyCode.toLowerCase() ||
          tk.currencyName.toLowerCase() === tokenObj.currencyName.toLowerCase()
        ) {
          throw new Error('ErrorCannotModifyToken')
        }
      }

      // Validate the token object
      if (tokenObj.currencyCode.toUpperCase() !== tokenObj.currencyCode) {
        throw new Error('ErrorInvalidCurrencyCode')
      }
      if (tokenObj.currencyCode.length < 2 || tokenObj.currencyCode.length > 7) {
        throw new Error('ErrorInvalidCurrencyCodeLength')
      }
      if (tokenObj.currencyName.length < 3 || tokenObj.currencyName.length > 20) {
        throw new Error('ErrorInvalidCurrencyNameLength')
      }
      if (bns.lt(tokenObj.multiplier, '1') || bns.gt(tokenObj.multiplier, '100000000000000000000000000000000')) {
        throw new Error('ErrorInvalidMultiplier')
      }
      let contractAddress = tokenObj.contractAddress.replace('0x', '').toLowerCase()
      if (!isHex(contractAddress) || contractAddress.length !== 40) {
        throw new Error('ErrorInvalidContractAddress')
      }
      contractAddress = '0x' + contractAddress

      for (const tk of this.customTokens) {
        if (
          tk.currencyCode.toLowerCase() === tokenObj.currencyCode.toLowerCase() ||
          tk.currencyName.toLowerCase() === tokenObj.currencyName.toLowerCase()
        ) {
          // Remove old token first then re-add it to incorporate any modifications
          const idx = this.customTokens.findIndex(element => element.currencyCode === tokenObj.currencyCode)
          if (idx !== -1) {
            this.customTokens.splice(idx, 1)
          }
        }
      }

      // Create a token object for inclusion in customTokens
      const denom: EdgeDenomination = {
        name: tokenObj.currencyCode,
        multiplier: tokenObj.multiplier
      }
      const edgeMetaToken: EdgeMetaToken = {
        currencyCode: tokenObj.currencyCode,
        currencyName: tokenObj.currencyName,
        denominations: [denom],
        contractAddress
      }

      this.customTokens.push(edgeMetaToken)
      this.allTokens = this.currencyInfo.metaTokens.concat(this.customTokens)
      this.enableTokensSync([edgeMetaToken.currencyCode])
    } else {
      throw new Error('Invalid custom token object')
    }
  }

  // synchronous
  getTokenStatus (token: string) {
    return this.walletLocalData.enabledTokens.indexOf(token) !== -1
  }

  // synchronous
  getBalance (options: any): string {
    let currencyCode = this.currencyInfo.currencyCode

    if (typeof options !== 'undefined') {
      const valid = validateObject(options, {
        'type': 'object',
        'properties': {
          'currencyCode': {'type': 'string'}
        }
      })

      if (valid) {
        currencyCode = options.currencyCode
      }
    }

    if (typeof this.walletLocalData.totalBalances[currencyCode] === 'undefined') {
      return '0'
    } else {
      const nativeBalance = this.walletLocalData.totalBalances[currencyCode]
      return nativeBalance
    }
  }

  // synchronous
  getNumTransactions (options: any): number {
    let currencyCode = this.currencyInfo.currencyCode

    const valid = validateObject(options, {
      'type': 'object',
      'properties': {
        'currencyCode': {'type': 'string'}
      }
    })

    if (valid) {
      currencyCode = options.currencyCode
    }

    if (typeof this.transactionList[currencyCode] === 'undefined') {
      return 0
    } else {
      return this.transactionList[currencyCode].length
    }
  }

  // asynchronous
  async getTransactions (options: any) {
    let currencyCode:string = this.currencyInfo.currencyCode

    const valid:boolean = validateObject(options, {
      'type': 'object',
      'properties': {
        'currencyCode': {'type': 'string'}
      }
    })

    if (valid) {
      currencyCode = options.currencyCode
    }

    if (this.transactionsLoadingPromise) {
      await this.transactionsLoadingPromise
    }

    if (typeof this.transactionList[currencyCode] === 'undefined') {
      return []
    }

    let startIndex:number = 0
    let numEntries:number = 0
    if (options === null) {
      return this.transactionList[currencyCode].slice(0)
    }
    if (options.startIndex !== null && options.startIndex > 0) {
      startIndex = options.startIndex
      if (
        startIndex >=
        this.transactionList[currencyCode].length
      ) {
        startIndex =
          this.transactionList[currencyCode].length - 1
      }
    }
    if (options.numEntries !== null && options.numEntries > 0) {
      numEntries = options.numEntries
      if (
        numEntries + startIndex >
        this.transactionList[currencyCode].length
      ) {
        // Don't read past the end of the transactionList
        numEntries =
          this.transactionList[currencyCode].length -
          startIndex
      }
    }

    // Copy the appropriate entries from the arrayTransactions
    let returnArray = []

    if (numEntries) {
      returnArray = this.transactionList[currencyCode].slice(
        startIndex,
        numEntries + startIndex
      )
    } else {
      returnArray = this.transactionList[currencyCode].slice(
        startIndex
      )
    }
    return returnArray
  }

  // synchronous
  getFreshAddress (options: any): EdgeFreshAddress {
    return { publicAddress: this.walletLocalData.publicKey }
  }

  // synchronous
  addGapLimitAddresses (addresses: Array<string>, options: any) { }

  // synchronous
  isAddressUsed (address: string, options: any) {
    return false
  }

  // synchronous
  dumpData (): EdgeDataDump {
    const dataDump: EdgeDataDump = {
      walletId: this.walletId.split(' - ')[0],
      walletType: this.walletInfo.type,
      pluginType: this.currencyInfo.pluginName,
      data: {
        walletLocalData: this.walletLocalData
      }
    }
    return dataDump
  }

  // asynchronous
  async saveTx (edgeTransaction: EdgeTransaction) {
    this.addTransaction(edgeTransaction.currencyCode, edgeTransaction)
    this.currencyEngineCallbacks.onTransactionsChanged([edgeTransaction])
  }
}

export { CurrencyEngine }
