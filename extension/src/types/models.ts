import type { ExtensionChainId } from '../config/networks'

export type ChainId = ExtensionChainId

export interface WalletAccount {
  address: string
  label?: string
}

export interface TokenBalanceItem {
  symbol: string
  amount: string
  decimals?: number
  isNative?: boolean
  contractAddress?: string
}

export interface Balance {
  assets: TokenBalanceItem[]
}

export type TransactionType = 'transfer' | 'contract' | 'dex'

export interface TransactionRecord {
  id: string
  type: TransactionType
  timestamp: number
  amount: string
  status: 'pending' | 'success' | 'failed'
  to?: string
  contract?: string
  hash?: string
}

export interface AgentRiskInput {
  amount: string
  to?: string
  contract?: string
  history: TransactionRecord[]
  contractCode?: string
}

export interface AgentRiskOutput {
  level: 'low' | 'medium' | 'high'
  type: string
  evidence: string[]
  suggestion: string
}
