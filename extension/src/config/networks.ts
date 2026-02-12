export interface ExtensionNetworkConfig {
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

export const MONAD_TESTNET: ExtensionNetworkConfig = {
  chainId: '0x279F', // 10143 in hex
  chainIdDecimal: 10143,
  name: 'Monad Testnet',
  nativeCurrency: {
    name: 'Monad',
    symbol: 'MON',
    decimals: 18,
  },
  rpcUrls: ['https://testnet-rpc.monad.xyz'],
  blockExplorerUrls: ['https://testnet.monadexplorer.com'],
}

export const EXTENSION_NETWORKS = {
  'monad-testnet': MONAD_TESTNET,
} as const

export type ExtensionChainId = keyof typeof EXTENSION_NETWORKS

export const DEFAULT_EXTENSION_NETWORK = MONAD_TESTNET
