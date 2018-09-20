/**
 * Created by paul on 8/26/17.
 */
// @flow

export type StellarSettings = {
  stellarServers: Array<string>
}

export type StellarBalance = {
  balance: string,
  buying_liabilities: string,
  selling_liabilities: string,
  asset_type: string
}

export type StellarAccount = {
  id: string,
  sequence: string,
  balances: Array<StellarBalance>
}

export type StellarCustomToken = {
  currencyCode: string,
  currencyName: string,
  multiplier: string,
  contractAddress: string
}

export type StellarPayment = {
  id: string,
  paging_token: string,
  type: 'payment',
  created_at: string,
  transaction_hash: string,
  asset_type: string,
  from: string,
  to: string,
  amount: string
}

export type StellarCreateAccount = {
  id: string,
  paging_token: string,
  type: 'create_account',
  created_at: string,
  transaction_hash: string,
  asset_type: string,
  source_account: string,
  account: string,
  starting_balance: string,
}

export type StellarTransaction = StellarPayment | StellarCreateAccount

export type StellarWalletOtherData = {
}
