/**
 * EIP-1193 Provider Interface
 * Standard Ethereum Provider API
 */
export interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on(event: string, handler: (...args: unknown[]) => void): void
  removeListener(event: string, handler: (...args: unknown[]) => void): void
}

/**
 * LumiWallet Provider Interface
 * Extends EIP-1193 with LumiWallet-specific features
 */
export interface LumiWalletProvider extends EIP1193Provider {
  // Standard EIP-1193 events
  on(event: 'accountsChanged', handler: (accounts: string[]) => void): void
  on(event: 'chainChanged', handler: (chainId: string) => void): void
  on(event: 'disconnect', handler: (error: ProviderError) => void): void
  on(event: 'connect', handler: (info: ConnectInfo) => void): void
  removeListener(event: 'accountsChanged', handler: (accounts: string[]) => void): void
  removeListener(event: 'chainChanged', handler: (chainId: string) => void): void
  removeListener(event: 'disconnect', handler: (error: ProviderError) => void): void
  removeListener(event: 'connect', handler: (info: ConnectInfo) => void): void
  
  // LumiWallet-specific events (for future AI risk alerts)
  on(event: 'riskAlert', handler: (alert: RiskAlert) => void): void
  removeListener(event: 'riskAlert', handler: (alert: RiskAlert) => void): void
  
  // Standard properties
  isMetaMask?: boolean
  isLumiWallet?: boolean
  chainId?: string
  selectedAddress?: string | null
}

/**
 * Provider Error (EIP-1193)
 */
export interface ProviderError {
  code: number
  message: string
  data?: unknown
}

/**
 * Connect Info (EIP-1193)
 */
export interface ConnectInfo {
  chainId: string
}

/**
 * RPC Request
 */
export interface RPCRequest {
  method: string
  params?: unknown[]
}

/**
 * RPC Response
 */
export interface RPCResponse<T = unknown> {
  result?: T
  error?: ProviderError
}

/**
 * Connection State
 */
export interface ConnectionState {
  account: string | null
  chainId: string | null
  isConnected: boolean
}

/**
 * Risk Alert (LumiWallet-specific feature)
 */
export interface RiskAlert {
  level: 'low' | 'medium' | 'high'
  message: string
  details: string[]
  timestamp: number
}

/**
 * Window Ethereum Extension
 */
declare global {
  interface Window {
    ethereum?: LumiWalletProvider
  }
}
