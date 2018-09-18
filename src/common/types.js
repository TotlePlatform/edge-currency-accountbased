/**
 * Created by paul on 8/26/17.
 */
// @flow

import type { EdgeTransaction } from 'edge-core-js'
// import { currencyInfo } from '../currencyInfoXRP.js'
export const DATA_STORE_FOLDER = 'txEngineFolder'
export const DATA_STORE_FILE = 'walletLocalData.json'
export const TXID_MAP_FILE = 'txidMap.json'
export const TXID_LIST_FILE = 'txidList.json'
export const TRANSACTION_STORE_FILE = 'transactionList.json'
// export const PRIMARY_CURRENCY = currencyInfo.currencyCode

// export type RippleSettings = {
//   rippledServers: Array<string>
// }

// export type CustomToken = {
//   currencyCode: string,
//   currencyName: string,
//   multiplier: string,
//   contractAddress: string
// }

// export type XrpBalanceChange = {
//   currency: string,
//   value: string
// }
// export type XrpGetTransaction = {
//   type: string,
//   address: string,
//   id: string,
//   outcome: {
//     result: string,
//     timestamp: string,
//     fee: string,
//     ledgerVersion: number,
//     balanceChanges: {
//       [address: string]: Array<XrpBalanceChange>
//     }
//   }
// }
// export type XrpGetTransactions = Array<XrpGetTransaction>

export type TxIdMap = {[currencyCode: string]: {[txid: string]: number}}
export type TxIdList = {[currencyCode: string]: Array<string>}
export type TransactionList = {[currencyCode: string]: Array<EdgeTransaction>}

export class WalletLocalData {
  blockHeight: number
  // recommendedFee: string // Floating point value in full XRP value
  lastAddressQueryHeight: number
  // nextNonce: string
  displayAddress: string
  totalBalances: {[currencyCode: string]: string}
  enabledTokens: Array<string>
  // transactionsObj: {[currencyCode: string]: Array<EdgeTransaction>}

  constructor (jsonString: string | null, primaryCurrency: string) {
    this.blockHeight = 0
    const totalBalances:{[currencyCode: string]: string} = {}
    this.totalBalances = totalBalances
    // this.nextNonce = '0'
    this.lastAddressQueryHeight = 0
    // this.recommendedFee = '1'

    // Dumb extra local var needed to make Flow happy
    // const transactionsObj:{[currencyCode: string]: Array<EdgeTransaction>} = {}
    // this.transactionsObj = transactionsObj

    this.displayAddress = ''
    this.enabledTokens = [ primaryCurrency ]
    if (jsonString !== null) {
      const data = JSON.parse(jsonString)

      if (typeof data.blockHeight === 'number') this.blockHeight = data.blockHeight
      if (typeof data.lastAddressQueryHeight === 'string') this.lastAddressQueryHeight = data.lastAddressQueryHeight
      if (typeof data.nextNonce === 'string') this.nextNonce = data.nextNonce
      if (typeof data.displayAddress === 'string') this.displayAddress = data.displayAddress
      if (typeof data.totalBalances !== 'undefined') this.totalBalances = data.totalBalances
      if (typeof data.enabledTokens !== 'undefined') this.enabledTokens = data.enabledTokens
      // if (typeof data.recommendedFee !== 'undefined') this.recommendedFee = data.recommendedFee
      // if (typeof data.transactionsObj !== 'undefined') this.transactionsObj = data.transactionsObj
    }
  }
}
