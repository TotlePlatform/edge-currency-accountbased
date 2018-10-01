/**
 * Created by paul on 8/8/17.
 */
// @flow
import { currencyInfo } from './stellarInfo.js'
import { CurrencyPlugin } from '../common/plugin.js'
import type {
  EdgeCurrencyEngine,
  EdgeCurrencyEngineOptions,
  EdgeEncodeUri,
  EdgeCurrencyPlugin,
  EdgeCurrencyPluginFactory,
  EdgeWalletInfo
} from 'edge-core-js'
import { bns } from 'biggystring'
import { serialize } from 'uri-js'
import { getDenomInfo } from '../common/utils.js'
import parse from 'url-parse'

import stellarApi from 'stellar-sdk'
import { StellarEngine } from './stellarEngine.js'

const URI_PREFIX = 'web+stellar'

let io

class StellarPlugin extends CurrencyPlugin {
  constructor () {
    super('stellar', currencyInfo)
  }

  checkAddress (address: string): boolean {
    // TODO: check address
    try {
      stellarApi.Keypair.fromPublicKey(address)
      return true
    } catch (e) {
      return false
    }
  }

  createPrivateKey (walletType: string) {
    const type = walletType.replace('wallet:', '')

    if (type === 'stellar') {
      const entropy = Array.from(io.random(32))
      const keypair = stellarApi.Keypair.fromRawEd25519Seed(entropy)
      return { stellarKey: keypair.secret() }
    } else {
      throw new Error('InvalidWalletType')
    }
  }

  derivePublicKey (walletInfo: EdgeWalletInfo) {
    const type = walletInfo.type.replace('wallet:', '')
    if (type === 'stellar') {
      const keypair = stellarApi.Keypair.fromSecret(walletInfo.keys.stellarKey)
      return { publicKey: keypair.publicKey() }
    } else {
      throw new Error('InvalidWalletType')
    }
  }

  async makeEngine (walletInfo: EdgeWalletInfo, opts: EdgeCurrencyEngineOptions): Promise<EdgeCurrencyEngine> {
    const currencyEngine = new StellarEngine(this, io, walletInfo, opts)

    currencyEngine.stellarApi = stellarApi
    stellarApi.Network.usePublicNetwork()

    await currencyEngine.loadEngine(this, io, walletInfo, opts)

    // This is just to make sure otherData is Flow type checked
    currencyEngine.otherData = currencyEngine.walletLocalData.otherData
    if (!currencyEngine.otherData.accountSequence) currencyEngine.otherData.accountSequence = 0
    if (!currencyEngine.otherData.lastPagingToken) currencyEngine.otherData.lastPagingToken = '0'

    const out: EdgeCurrencyEngine = currencyEngine
    return out
  }

  parseUri (uri: string) {
    const networks = {}
    networks[URI_PREFIX] = true
    const STELLAR_SEP007_PREFIX = `${URI_PREFIX}:pay`

    // Handle special case of https://ripple.com//send?to= URIs
    if (uri.includes(STELLAR_SEP007_PREFIX)) {
      const parsedUri = parse(uri, {}, true)
      const addr = parsedUri.query.destination
      if (addr) {
        uri = uri.replace(STELLAR_SEP007_PREFIX, `${URI_PREFIX}:${addr}`)
      }
    }

    const { parsedUri, edgeParsedUri } = this.parseUriCommon(uri, networks)

    let nativeAmount: string | null = null
    let currencyCode: string | null = null

    const amountStr = parsedUri.query.amount
    if (amountStr && typeof amountStr === 'string') {
      const denom = getDenomInfo(currencyInfo, 'XLM')
      if (!denom) {
        throw new Error('InternalErrorInvalidCurrencyCode')
      }
      nativeAmount = bns.mul(amountStr, denom.multiplier)
      nativeAmount = bns.toFixed(nativeAmount, 0, 0)
      currencyCode = 'XLM'

      edgeParsedUri.nativeAmount = nativeAmount || undefined
      edgeParsedUri.currencyCode = currencyCode || undefined
    }
    const valid = this.checkAddress(edgeParsedUri.publicAddress || '')
    if (!valid) {
      throw new Error('InvalidPublicAddressError')
    }

    if (parsedUri.query.msg) {
      edgeParsedUri.metadata = {
        notes: parsedUri.query.msg
      }
    }
    if (parsedUri.query.asset_code) {
      if (parsedUri.query.asset_code.toUpperCase() !== 'XLM') {
        throw new Error('InternalErrorInvalidCurrencyCode')
      }
    }
    edgeParsedUri.uniqueIdentifier = parsedUri.query.memo || undefined
    return edgeParsedUri
  }

  encodeUri (obj: EdgeEncodeUri) {
    const valid = this.checkAddress(obj.publicAddress)
    if (!valid) {
      throw new Error('InvalidPublicAddressError')
    }
    let amount
    if (typeof obj.nativeAmount === 'string') {
      let currencyCode: string = 'XLM'
      const nativeAmount: string = obj.nativeAmount
      if (typeof obj.currencyCode === 'string') {
        currencyCode = obj.currencyCode
      }
      const denom = getDenomInfo(currencyInfo, currencyCode)
      if (!denom) {
        throw new Error('InternalErrorInvalidCurrencyCode')
      }
      amount = bns.div(nativeAmount, denom.multiplier, 7)
    }
    if (!amount && !obj.label && !obj.message) {
      return obj.publicAddress
    } else {
      let queryString: string = `destination=${obj.publicAddress}&`
      if (amount) {
        queryString += 'amount=' + amount + '&'
      }
      if (obj.label || obj.message) {
        if (typeof obj.label === 'string') {
          queryString += 'label=' + obj.label + '&'
        }
        if (typeof obj.message === 'string') {
          queryString += 'msg=' + obj.message + '&'
        }
      }
      queryString = queryString.substr(0, queryString.length - 1)

      const serializeObj = {
        scheme: URI_PREFIX,
        path: 'pay',
        query: queryString
      }
      const url = serialize(serializeObj)
      return url
    }
  }
}

export const stellarCurrencyPluginFactory: EdgeCurrencyPluginFactory = {
  pluginType: 'currency',
  pluginName: currencyInfo.pluginName,

  async makePlugin (opts: any): Promise<EdgeCurrencyPlugin> {
    io = opts.io

    const plugin: EdgeCurrencyPlugin = new StellarPlugin()
    return plugin
  }
}
