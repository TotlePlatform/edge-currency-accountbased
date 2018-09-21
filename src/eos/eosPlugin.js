/**
 * Created by paul on 8/8/17.
 */
// @flow
import { currencyInfo } from './eosInfo.js'
import { makeEngineCommon, parseUriCommon, encodeUriCommon } from '../common/plugin.js'
import type {
  EdgeCurrencyEngine,
  EdgeCurrencyEngineOptions,
  EdgeEncodeUri,
  EdgeCurrencyPlugin,
  EdgeCurrencyPluginFactory,
  EdgeWalletInfo
} from 'edge-core-js'
import { getDenomInfo } from '../common/utils.js'
import { EosEngine } from './eosEngine'
import { bns } from 'biggystring'
const eos = require('eosjs')
const { ecc } = eos.modules

// ----MAIN NET----
// const config = {
//   chainId: 'aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906', // main net
//   httpEndpoint: 'https://api.eosnewyork.io:443', // main net
//   expireInSeconds: 60,
//   sign: true, // sign the transaction with a private key. Leaving a transaction unsigned avoids the need to provide a private key
//   broadcast: true, // post the transaction to the blockchain. Use false to obtain a fully signed transaction
//   verbose: false // verbose logging such as API activity
// }

let io

function checkAddress (address: string): boolean {
  // TODO: Check for a valid address format. The passed in
  // address would be a use visible displayed address such as what would
  // go into a QR code
  return true
}

export const eosCurrencyPluginFactory: EdgeCurrencyPluginFactory = {
  pluginType: 'currency',
  pluginName: currencyInfo.pluginName,

  async makePlugin (opts: any): Promise<EdgeCurrencyPlugin> {
    io = opts.io

    // TODO: Initialize currency library if needed
    // Add any parameters to the Plugin object which would be global for all wallets (engines).
    // Common parameters would be an SDK/API object for this currency from an external library
    return {
      pluginName: 'eos',
      currencyInfo,

      createPrivateKey: (walletType: string) => {
        const type = walletType.replace('wallet:', '')

        if (type === 'eos') {
          // TODO: User currency library to create private key as a string
          // Use io.random() for random number generation
          // Multiple keys can be created and stored here. ie. If there is both a mnemonic and key format,
          // Generate and store them here by returning an arbitrary object with them.
          let entropy = Buffer.from(io.random(256)).toString('hex')
          const eosOwnerKey = ecc.seedPrivate(entropy)
          entropy = Buffer.from(io.random(256)).toString('hex')
          const eosKey = ecc.PrivateKey.seedPrivate(entropy)
          return { eosOwnerKey, eosKey }
        } else {
          throw new Error('InvalidWalletType')
        }
      },

      derivePublicKey: (walletInfo: EdgeWalletInfo) => {
        const type = walletInfo.type.replace('wallet:', '')
        if (type === 'eos') {
          // TODO: User currency library to derive the public keys/addresses from the private key.
          // Multiple keys can be generated and stored if needed. Do not store an HD chain
          // but rather just different versions of the master public key
          // const publicKey = derivePubkey(walletInfo.keys.eosKey)
          // const publicKey = deriveAddress(walletInfo.keys.eosKey)
          const publicKey = ecc.privateToPublic(walletInfo.keys.eosKey)
          const ownerPubKey = ecc.privateToPublic(walletInfo.keys.eosOwnerKey)
          return { publicKey, ownerPubKey }
        } else {
          throw new Error('InvalidWalletType')
        }
      },

      async makeEngine (walletInfo: EdgeWalletInfo, opts: EdgeCurrencyEngineOptions): Promise<EdgeCurrencyEngine> {
        const currencyEngine = new EosEngine(this, io, walletInfo, opts)
        await makeEngineCommon(currencyEngine, this, io, walletInfo, opts)

        currencyEngine.otherData = currencyEngine.walletLocalData.otherData
        // currencyEngine.otherData is an opaque utility object for use for currency
        // specific data that will be persisted to disk on this one device.
        // Commonly stored data would be last queried block height or nonce values for accounts
        // Edit the flow type EosWalletOtherData and initialize those values here if they are
        // undefined
        // TODO: Initialize anything specific to this currency
        // if (!currencyEngine.otherData.nonce) currencyEngine.otherData.nonce = 0

        const out: EdgeCurrencyEngine = currencyEngine
        return out
      },

      parseUri: (uri: string) => {
        const { parsedUri, edgeParsedUri } = parseUriCommon(uri, {
          'eos': true
        })
        let nativeAmount: string | null = null
        let currencyCode: string | null = null

        const amountStr = parsedUri.query.amount
        if (amountStr && typeof amountStr === 'string') {
          const denom = getDenomInfo(this.currencyInfo, 'EOS')
          if (!denom) {
            throw new Error('InternalErrorInvalidCurrencyCode')
          }
          nativeAmount = bns.mul(amountStr, denom.multiplier)
          nativeAmount = bns.toFixed(nativeAmount, 0, 0)
          currencyCode = 'EOS'

          edgeParsedUri.nativeAmount = nativeAmount || undefined
          edgeParsedUri.currencyCode = currencyCode || undefined
        }
        const valid = checkAddress(edgeParsedUri.publicAddress || '')
        if (!valid) {
          throw new Error('InvalidPublicAddressError')
        }

        edgeParsedUri.uniqueIdentifier = parsedUri.query.tag || undefined
        return edgeParsedUri
      },

      encodeUri: (obj: EdgeEncodeUri) => {
        const valid = checkAddress(obj.publicAddress)
        if (!valid) {
          throw new Error('InvalidPublicAddressError')
        }
        let amount
        if (typeof obj.nativeAmount === 'string') {
          let currencyCode: string = 'EOS'
          const nativeAmount: string = obj.nativeAmount
          if (typeof obj.currencyCode === 'string') {
            currencyCode = obj.currencyCode
          }
          const denom = getDenomInfo(this.currencyInfo, currencyCode)
          if (!denom) {
            throw new Error('InternalErrorInvalidCurrencyCode')
          }
          amount = bns.div(nativeAmount, denom.multiplier, 18)
        }
        const encodedUri = encodeUriCommon(obj, 'eos', amount)
        return encodedUri
      }
    }
  }
}
