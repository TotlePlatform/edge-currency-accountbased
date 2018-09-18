/**
 * Created by paul on 7/7/17.
 */
// @flow

import { currencyInfo } from './currencyInfoXRP.js'
import type {
  EdgeCurrencyEngine,
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

class CurrencyEngine {
  walletInfo: EdgeWalletInfo
  currencyEngineCallbacks: EdgeCurrencyEngineCallbacks
  walletLocalFolder: Object
  // rippleApi: Object
  engineOn: boolean
  addressesChecked: boolean // True once wallet has been fully checked on the network
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

  constructor (currencyPlugin: EdgeCurrencyPlugin, io_: any, walletInfo: EdgeWalletInfo, opts: EdgeCurrencyEngineOptions) {
    // Validate that we are a valid EdgeCurrencyEngine:
    // eslint-disable-next-line no-unused-vars
    const test: EdgeCurrencyEngine = this

    const currencyCode = currencyPlugin.currencyInfo.currencyCode
    const { walletLocalFolder, callbacks } = opts

    this.io = io_
    // this.rippleApi = rippleApi
    this.engineOn = false
    this.addressesChecked = false
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
    this.currencyInfo = currencyInfo
    this.allTokens = currencyInfo.metaTokens.slice(0)
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

    // Hard coded for testing
    // this.walletInfo.keys.rippleKey = '389b07b3466eed587d6bdae09a3613611de9add2635432d6cd1521af7bbc3757'
    // this.walletInfo.keys.displayAddress = '0x9fa817e5A48DD1adcA7BEc59aa6E3B1F5C4BeA9a'
    this.currencyEngineCallbacks = callbacks
    this.walletLocalFolder = walletLocalFolder

    if (typeof this.walletInfo.keys.displayAddress !== 'string') {
      if (walletInfo.keys.displayAddress) {
        this.walletInfo.keys.displayAddress = walletInfo.keys.displayAddress
      } else {
        const pubKeys = currencyPlugin.derivePublicKey(this.walletInfo)
        this.walletInfo.keys.displayAddress = pubKeys.displayAddress
      }
    }
    this.log(`Created Wallet Type ${this.walletInfo.type} for Currency Plugin ${this.currencyInfo.pluginName}`)
  }

  findTransaction (currencyCode: string, txid: string) {
    const normalizedTxid = normalizeAddress(txid)
    if (this.txIdMap[currencyCode]) {
      const index = this.txIdMap[currencyCode][normalizedTxid]
      if (index) {
        return index
      }
    }
    return -1
  }

  sortTxByDate (a: EdgeTransaction, b: EdgeTransaction) {
    return b.date - a.date
  }

  addTransaction (currencyCode: string, edgeTransaction: EdgeTransaction) {
    // Add or update tx in transactionsObj
    const idx = this.findTransaction(currencyCode, edgeTransaction.txid)
    const txid = normalizeAddress(edgeTransaction.txid)

    if (idx === -1) {
      this.log('addTransaction: adding and sorting:' + edgeTransaction.txid)
      if (typeof this.transactionList[currencyCode] === 'undefined') {
        this.transactionList[currencyCode] = []
      }
      this.transactionList[currencyCode].push(edgeTransaction)

      // Sort
      this.transactionList[currencyCode].sort(this.sortTxByDate)

      this.transactionListDirty = true
      this.transactionsChangedArray.push(edgeTransaction)

      // Add to txidMap
      this.txIdMap[currencyCode][txid] = idx
      this.updateTxidList(currencyCode)
    } else {
      this.updateTransaction(currencyCode, edgeTransaction, idx)
    }
  }

  updateTransaction (currencyCode: string, edgeTransaction: EdgeTransaction, idx: number) {
    // Update the transaction
    this.transactionList[currencyCode][idx] = edgeTransaction
    this.transactionList[currencyCode].sort(this.sortTxByDate)
    this.transactionListDirty = true
    this.updateTxidList(currencyCode)
    this.transactionsChangedArray.push(edgeTransaction)
    this.log('updateTransaction:' + edgeTransaction.txid)
  }

  // Updates the txidList based on transactionList to keep it in chronological order
  updateTxidList (currencyCode: string) {
    const txIdList: Array<string> = []
    for (const tx of this.transactionList[currencyCode]) {
      txIdList.push(normalizeAddress(tx.txid))
    }
    this.txIdList = txIdList
  }

  // *************************************
  // Save the wallet data store
  // *************************************
  saveWalletLoop = async () => {
    const folder = this.walletLocalFolder.folder(DATA_STORE_FOLDER)
    const promises = []
    if (this.walletLocalDataDirty) {
      this.log('walletLocalDataDirty. Saving...')
      const jsonString = JSON.stringify(this.walletLocalData)
      promises.push(folder.file(DATA_STORE_FILE).setText(jsonString)).then(() => {
        this.walletLocalDataDirty = false
      }).catch(e => {
        this.log('Error saving walletLocalData')
        this.log(e)
      })
    }
    if (this.transactionListDirty) {
      this.log('transactionListDirty. Saving...')
      let jsonString = JSON.stringify(this.transactionList)
      promises.push(folder.file(TRANSACTION_STORE_FILE).setText(jsonString)).catch(e => {
        this.log('Error saving transactionList')
        this.log(e)
      })
      jsonString = JSON.stringify(this.txIdList)
      promises.push(folder.file(TXID_LIST_FILE).setText(jsonString)).catch(e => {
        this.log('Error saving txIdList')
        this.log(e)
      })
      jsonString = JSON.stringify(this.txIdMap)
      promises.push(folder.file(TXID_MAP_FILE).setText(jsonString)).catch(e => {
        this.log('Error saving txIdMap')
        this.log(e)
      })
      await Promise.all(promises)
      this.transactionListDirty = false
    } else {
      await Promise.all(promises)
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

  log (...text: Array<any>) {
    text[0] = `${this.walletId}${text[0]}`
    console.log(...text)
  }

  // *************************************
  // Public methods
  // *************************************

  updateSettingsCommon (settings: any) {
    this.currentSettings = settings
  }

  async resyncBlockchainCommon (): Promise<void> {
    const temp = JSON.stringify({
      enabledTokens: this.walletLocalData.enabledTokens,
      displayAddress: this.walletLocalData.displayAddress
    })
    this.walletLocalData = new WalletLocalData(temp)
    this.walletLocalDataDirty = true
    this.transactionList = {}
    this.txIdList = {}
    this.txIdMap = {}
    this.transactionListDirty = true
    await this.saveWalletLoop()
  }

  // synchronous
  getBlockHeightCommon (): number {
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
  async enableTokensCommon (tokens: Array<string>) {
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
  async disableTokensCommon (tokens: Array<string>) {
    this.disableTokensSync(tokens)
  }

  async getEnabledTokensCommon (): Promise<Array<string>> {
    return this.walletLocalData.enabledTokens
  }

  async addCustomTokenCommon (obj: any) {
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
  getTokenStatusCommon (token: string) {
    return this.walletLocalData.enabledTokens.indexOf(token) !== -1
  }

  // synchronous
  getBalanceCommon (options: any): string {
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
  getNumTransactionsCommon (options: any): number {
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
  async getTransactionsCommon (options: any) {
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
        // Don't read past the end of the transactionsObj
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
  getFreshAddressCommon (options: any): EdgeFreshAddress {
    return { publicAddress: this.walletLocalData.displayAddress }
  }

  // synchronous
  addGapLimitAddressesCommon (addresses: Array<string>, options: any) { }

  // synchronous
  isAddressUsedCommon (address: string, options: any) {
    return false
  }

  // synchronous
  dumpDataCommon (): EdgeDataDump {
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
  async saveTxCommon (edgeTransaction: EdgeTransaction) {
    this.addTransaction(edgeTransaction.currencyCode, edgeTransaction)
    this.currencyEngineCallbacks.onTransactionsChanged([edgeTransaction])
  }
}

export { CurrencyEngine }