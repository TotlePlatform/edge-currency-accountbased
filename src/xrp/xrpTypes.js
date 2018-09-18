/**
 * Created by paul on 8/26/17.
 */
// @flow

export type XrpSettings = {
  rippledServers: Array<string>
}
export type XrpBalanceChange = {
  currency: string,
  value: string
}
export type XrpGetTransaction = {
  type: string,
  address: string,
  id: string,
  outcome: {
    result: string,
    timestamp: string,
    fee: string,
    ledgerVersion: number,
    balanceChanges: {
      [address: string]: Array<XrpBalanceChange>
    }
  }
}
export type XrpGetTransactions = Array<XrpGetTransaction>
