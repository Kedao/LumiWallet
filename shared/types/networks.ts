/**
 * Network Configuration
 */
export interface NetworkConfig {
  chainId: string
  chainIdDecimal: number
  name: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
  rpcUrls: string[]
  blockExplorerUrls?: string[]
}

/**
 * Monad Testnet Configuration
 */
export const MONAD_TESTNET: NetworkConfig = {
  chainId: '0x29A', // 666 in hex
  chainIdDecimal: 666,
  name: 'Monad Testnet',
  nativeCurrency: {
    name: 'Monad',
    symbol: 'MON',
    decimals: 18,
  },
  rpcUrls: ['https://testnet-rpc.monad.xyz'], // Placeholder - update with actual RPC
  blockExplorerUrls: ['https://testnet-explorer.monad.xyz'], // Placeholder
}

/**
 * Supported Networks
 */
export const SUPPORTED_NETWORKS: Record<string, NetworkConfig> = {
  monad: MONAD_TESTNET,
}

/**
 * Default Network
 */
export const DEFAULT_NETWORK = MONAD_TESTNET
