/**
 * Created by paul on 8/26/17.
 * @flow
 */

import { validate } from 'jsonschema'
import { type EdgeCurrencyInfo } from 'edge-core-js'

function normalizeAddress (address: string) {
  return address.toLowerCase().replace('0x', '')
}

function validateObject (object: any, schema: any) {
  const result = validate(object, schema)

  if (result.errors.length === 0) {
    return true
  } else {
    for (const n in result.errors) {
      const errMsg = result.errors[n].message
      console.log('ERROR: validateObject:' + errMsg)
    }
    return false
  }
}

export function isHex (h: string) {
  const out = /^[0-9A-F]+$/i.test(h)
  return out
}

function getDenomInfo (currencyInfo: EdgeCurrencyInfo, denom: string) {
  return currencyInfo.denominations.find(element => {
    return element.name === denom
  })
}

export { normalizeAddress, validateObject, getDenomInfo }
