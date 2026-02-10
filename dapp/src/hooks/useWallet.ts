import { useState, useEffect, useCallback } from 'react'
import { BrowserProvider } from 'ethers'
import type { LumiWalletProvider, ConnectionState } from '@shared/types'

/**
 * useWallet Hook
 * Manages wallet connection state without localStorage persistence
 * Relies on window.ethereum provider (LumiWallet or MetaMask)
 */
export function useWallet() {
  const [state, setState] = useState<ConnectionState>({
    account: null,
    chainId: null,
    isConnected: false,
  })
  const [isLoading, setIsLoading] = useState(false)

  /**
   * Unified standard popup for all exception messages
   */
  const showException = useCallback((message: string) => {
    if (typeof window !== 'undefined') {
      window.alert(message)
    }
  }, [])

  /**
   * Check if wallet provider is available
   */
  const getProvider = useCallback((): LumiWalletProvider | null => {
    if (typeof window === 'undefined' || !window.ethereum) {
      return null
    }
    return window.ethereum
  }, [])

  /**
   * Check existing connection on mount
   * Calls eth_accounts (no permission prompt)
   */
  const checkConnection = useCallback(async () => {
    const provider = getProvider()
    if (!provider) {
      return
    }

    try {
      const accounts = (await provider.request({
        method: 'eth_accounts',
      })) as string[]

      const chainId = (await provider.request({
        method: 'eth_chainId',
      })) as string

      if (accounts.length > 0) {
        setState({
          account: accounts[0],
          chainId,
          isConnected: true,
        })
      }
    } catch (err) {
      console.error('检查连接失败:', err)
      showException('检查钱包连接状态失败，请稍后重试')
    }
  }, [getProvider, showException])

  /**
   * Connect wallet
   * Prompts user for account access (eth_requestAccounts)
   */
  const connect = useCallback(async () => {
    const provider = getProvider()
    if (!provider) {
      showException('请安装 MetaMask 或 LumiWallet 插件')
      return
    }

    setIsLoading(true)

    try {
      const accounts = (await provider.request({
        method: 'eth_requestAccounts',
      })) as string[]

      const chainId = (await provider.request({
        method: 'eth_chainId',
      })) as string

      setState({
        account: accounts[0],
        chainId,
        isConnected: true,
      })
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err) {
        const error = err as { code: number; message: string }
        if (error.code === 4001) {
          showException('用户取消了钱包连接')
        } else {
          showException(error.message || '连接失败')
        }
      } else {
        showException('连接失败')
      }
    } finally {
      setIsLoading(false)
    }
  }, [getProvider, showException])

  /**
   * Disconnect wallet (clear runtime state)
   */
  const disconnect = useCallback(() => {
    setState({
      account: null,
      chainId: null,
      isConnected: false,
    })
  }, [])

  /**
   * Get ethers.js BrowserProvider
   */
  const getBrowserProvider = useCallback((): BrowserProvider | null => {
    const provider = getProvider()
    if (!provider) return null
    return new BrowserProvider(provider)
  }, [getProvider])

  /**
   * Event handlers
   */
  useEffect(() => {
    const provider = getProvider()
    if (!provider) return

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        // User disconnected or revoked permission
        disconnect()
      } else {
        setState((prev) => ({
          ...prev,
          account: accounts[0],
          isConnected: true,
        }))
      }
    }

    const handleChainChanged = (chainId: string) => {
      setState((prev) => ({
        ...prev,
        chainId,
      }))
    }

    const handleDisconnect = () => {
      disconnect()
    }

    // Subscribe to events
    provider.on('accountsChanged', handleAccountsChanged)
    provider.on('chainChanged', handleChainChanged)
    provider.on('disconnect', handleDisconnect)

    // Check initial connection state
    checkConnection()

    // Cleanup
    return () => {
      provider.removeListener('accountsChanged', handleAccountsChanged)
      provider.removeListener('chainChanged', handleChainChanged)
      provider.removeListener('disconnect', handleDisconnect)
    }
  }, [getProvider, checkConnection, disconnect])

  return {
    // State
    account: state.account,
    chainId: state.chainId,
    isConnected: state.isConnected,
    isLoading,

    // Actions
    connect,
    disconnect,
    getBrowserProvider,

    // Utilities
    hasProvider: !!getProvider(),
  }
}
