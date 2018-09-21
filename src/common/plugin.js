/**
 * Created by paul on 8/8/17.
 */
// @flow
// import { currencyInfo } from './currencyInfoXRP.js'
import { CurrencyEngine } from '../common/engine.js'
import {
  DATA_STORE_FILE,
  DATA_STORE_FOLDER,
  TRANSACTION_STORE_FILE,
  TXID_MAP_FILE,
  TXID_LIST_FILE,
  WalletLocalData
} from './types.js'
import type {
  EdgeCurrencyEngineOptions,
  EdgeParsedUri,
  EdgeEncodeUri,
  EdgeCurrencyPlugin,
  EdgeWalletInfo,
  EdgeIo
} from 'edge-core-js'
import { serialize } from 'uri-js'
import parse from 'url-parse'

export async function makeEngineCommon (currencyEngine: CurrencyEngine, plugin: EdgeCurrencyPlugin, io: EdgeIo, walletInfo: EdgeWalletInfo, opts: EdgeCurrencyEngineOptions): Promise<CurrencyEngine> {
  const folder = currencyEngine.walletLocalFolder.folder(DATA_STORE_FOLDER)
  try {
    const result = await folder.file(DATA_STORE_FILE).getText()
    currencyEngine.walletLocalData = new WalletLocalData(result, currencyEngine.currencyInfo.currencyCode)
    currencyEngine.walletLocalData.publicKey = currencyEngine.walletInfo.keys.publicKey
  } catch (err) {
    try {
      console.log(err)
      console.log('No walletLocalData setup yet: Failure is ok')
      currencyEngine.walletLocalData = new WalletLocalData(null, currencyEngine.currencyInfo.currencyCode)
      currencyEngine.walletLocalData.publicKey = currencyEngine.walletInfo.keys.publicKey
      await folder.file(DATA_STORE_FILE)
        .setText(JSON.stringify(currencyEngine.walletLocalData))
    } catch (e) {
      console.log('Error writing to localDataStore. Engine not started:' + err)
      throw e
    }
  }
  try {
    const result = await folder.file(TXID_LIST_FILE).getText()
    currencyEngine.txIdList = JSON.parse(result)
  } catch (e) {
    console.log('Could not load txidList file. Failure is ok on new device')
    await folder.file(TXID_LIST_FILE)
      .setText(JSON.stringify(currencyEngine.txIdList))
  }
  try {
    const result = await folder.file(TXID_MAP_FILE).getText()
    currencyEngine.txIdMap = JSON.parse(result)
  } catch (e) {
    console.log('Could not load txidMap file. Failure is ok on new device')
    await folder.file(TXID_MAP_FILE)
      .setText(JSON.stringify(currencyEngine.txIdMap))
  }

  // Load transactions in the background
  currencyEngine.transactionsLoadingPromise = folder.file(TRANSACTION_STORE_FILE).getText().then(result => {
    currencyEngine.transactionList = JSON.parse(result)
    currencyEngine.transactionsLoadingPromise = null
    setTimeout(() => {
      currencyEngine.doInitialTransactionsCallback()
    }, 5000)
  }).catch(e => {
    console.log(e)
    console.log('Failed to load transactionList store file. Failure is ok on new device')
  })

  for (const token of currencyEngine.walletLocalData.enabledTokens) {
    currencyEngine.tokenCheckStatus[token] = 0
  }
  currencyEngine.doInitialBalanceCallback()

  return currencyEngine
}

export function parseUriCommon (uri: string, networks: {[network: string]: boolean}) {
  const parsedUri = parse(uri, {}, true)
  let address: string

  // Remove ":" from protocol
  if (parsedUri.protocol) {
    parsedUri.protocol = parsedUri.protocol.replace(':', '')
  }

  if (
    parsedUri.protocol &&
    !networks[parsedUri.protocol]
  ) {
    throw new Error('InvalidUriError') // possibly scanning wrong crypto type
  }

  if (parsedUri.host) {
    address = parsedUri.host
  } else if (parsedUri.pathname) {
    address = parsedUri.pathname
  } else {
    throw new Error('InvalidUriError')
  }

  address = address.replace('/', '') // Remove any slashes

  const label = parsedUri.query.label
  const message = parsedUri.query.message
  const category = parsedUri.query.category

  const edgeParsedUri: EdgeParsedUri = {
    publicAddress: address
  }
  if (label || message || category) {
    edgeParsedUri.metadata = {}
    edgeParsedUri.metadata.name = label || undefined
    edgeParsedUri.metadata.message = message || undefined
    edgeParsedUri.metadata.category = category || undefined
  }

  return { edgeParsedUri, parsedUri }
}

export function encodeUriCommon (obj: EdgeEncodeUri, network: string, amount?: string) {
  if (!obj.publicAddress) {
    throw new Error('InvalidPublicAddressError')
  }
  if (!amount && !obj.label && !obj.message) {
    return obj.publicAddress
  } else {
    let queryString: string = ''
    if (amount) {
      queryString += 'amount=' + amount + '&'
    }
    if (obj.label || obj.message) {
      if (typeof obj.label === 'string') {
        queryString += 'label=' + obj.label + '&'
      }
      if (typeof obj.message === 'string') {
        queryString += 'message=' + obj.message + '&'
      }
    }
    queryString = queryString.substr(0, queryString.length - 1)

    const serializeObj = {
      scheme: network,
      path: obj.publicAddress,
      query: queryString
    }
    const url = serialize(serializeObj)
    return url
  }
}
