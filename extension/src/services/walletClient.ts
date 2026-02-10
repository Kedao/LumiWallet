import { Balance, TransactionRecord, WalletAccount } from '../types/models'

export const loginWithMnemonic = async (mnemonic: string, password?: string): Promise<WalletAccount> => {
  // TODO: integrate secure keyring storage.
  void mnemonic
  void password
  return { address: '0x0000000000000000000000000000000000000000' }
}

export const loginWithPassword = async (password: string): Promise<WalletAccount> => {
  // TODO: unlock existing wallet.
  void password
  return { address: '0x0000000000000000000000000000000000000000' }
}

export const fetchBalance = async (): Promise<Balance> => {
  // TODO: query Monad RPC.
  return { symbol: 'MON', amount: '0.00' }
}

export const fetchHistory = async (): Promise<TransactionRecord[]> => {
  // TODO: query indexer or RPC for activity.
  return []
}

export const sendTransfer = async (to: string, amount: string): Promise<string> => {
  // TODO: build and submit transfer transaction.
  void to
  void amount
  return '0x'
}

export const sendContractCall = async (contract: string, data: string): Promise<string> => {
  // TODO: build and submit contract call transaction.
  void contract
  void data
  return '0x'
}

export const sendSwap = async (routeId: string): Promise<string> => {
  // TODO: call 1inch aggregator or DEX router.
  void routeId
  return '0x'
}
