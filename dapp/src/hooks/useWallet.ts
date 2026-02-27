import { useState, useEffect, useCallback } from 'react'
import { BrowserProvider } from 'ethers'
import type { LumiWalletProvider, ConnectionState } from '@shared/types'
import { showDialog, showErrorDialog } from '@/lib/dialogBus'

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
  const [walletName, setWalletName] = useState<'灵光钱包' | 'MetaMask' | null>(null)
  const [requireReconnectAuth, setRequireReconnectAuth] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const showException = useCallback((title: string, message: string) => {
    showErrorDialog(title, message)
  }, [])

  const getWalletName = useCallback((provider: LumiWalletProvider): '灵光钱包' | 'MetaMask' | null => {
    if (provider.isLumiWallet) return '灵光钱包'
    if (provider.isMetaMask) return 'MetaMask'
    return null
  }, [])

  /**
   * Check if wallet provider is available
   */
  const getProvider = useCallback((): LumiWalletProvider | null => {
    if (typeof window === 'undefined' || !window.ethereum) {
      return null
    }

    // EIP-6963/multi-provider scenario: prefer LumiWallet when available.
    const provider = window.ethereum as LumiWalletProvider & { providers?: LumiWalletProvider[] }
    if (Array.isArray(provider.providers) && provider.providers.length > 0) {
      const lumiWalletProvider = provider.providers.find((item) => item.isLumiWallet)
      if (lumiWalletProvider) {
        return lumiWalletProvider
      }
    }

    return provider
  }, [])

  /**
   * Check existing connection on mount
   * Calls eth_accounts (no permission prompt)
   */
  const checkConnection = useCallback(async () => {
    if (requireReconnectAuth) {
      return
    }

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
        setWalletName(getWalletName(provider))
        setState({
          account: accounts[0],
          chainId,
          isConnected: true,
        })
      }
    } catch (err) {
      console.error('检查连接失败:', err)
      showException('连接状态检查失败', '检查钱包连接状态失败，请稍后重试。')
    }
  }, [getProvider, getWalletName, requireReconnectAuth, showException])

  /**
   * Connect wallet
   * Prompts user for account access (eth_requestAccounts)
   */
  const connect = useCallback(async () => {
    const provider = getProvider()
    if (!provider) {
      showException('未检测到钱包插件', '请安装 MetaMask 或 灵光钱包 浏览器插件。')
      return
    }

    setIsLoading(true)

    try {
      if (requireReconnectAuth) {
        // Ask wallet to re-authorize accounts so user can switch accounts on reconnect.
        try {
          await provider.request({
            method: 'wallet_requestPermissions',
            params: [{ eth_accounts: {} }],
          })
        } catch (err: unknown) {
          if (err && typeof err === 'object' && 'code' in err) {
            const permissionError = err as { code: number }
            if (permissionError.code === 4001 || permissionError.code === -32002) {
              throw err
            }
          }
          // Fallback: continue with eth_requestAccounts when permission API is unavailable.
        }
      }

      const accounts = (await provider.request({
        method: 'eth_requestAccounts',
      })) as string[]

      const chainId = (await provider.request({
        method: 'eth_chainId',
      })) as string

      if (accounts.length === 0) {
        showException('等待钱包授权', '请在灵光钱包侧边栏完成连接授权。')
        return
      }

      setWalletName(getWalletName(provider))
      setRequireReconnectAuth(false)
      setState({
        account: accounts[0],
        chainId,
        isConnected: true,
      })
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err) {
        const error = err as { code: number; message: string }
        if (error.code === 4001) {
          showException('连接已取消', '你已取消钱包连接请求。')
        } else if (error.code === -32002) {
          showDialog({
            title: '请前往钱包插件完成授权',
            message: '检测到已有待处理的连接请求。请点击浏览器工具栏中的钱包插件，在插件内确认连接。',
            variant: 'warning',
            actionText: '去处理',
          })
        } else {
          showException('钱包连接失败', error.message || '连接失败，请稍后重试。')
        }
      } else {
        showException('钱包连接失败', '连接失败，请稍后重试。')
      }
    } finally {
      setIsLoading(false)
    }
  }, [getProvider, getWalletName, requireReconnectAuth, showException])

  /**
   * Disconnect wallet (clear runtime state)
   */
  const disconnect = useCallback((options?: { requireReauth?: boolean }) => {
    if (options?.requireReauth) {
      setRequireReconnectAuth(true)
    }
    setWalletName(null)
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
        setWalletName(getWalletName(provider))
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
  }, [getProvider, checkConnection, disconnect, getWalletName])

  return {
    // State
    account: state.account,
    chainId: state.chainId,
    isConnected: state.isConnected,
    walletName,
    isLoading,

    // Actions
    connect,
    disconnect,
    getWalletProvider: getProvider,
    getBrowserProvider,

    // Utilities
    hasProvider: !!getProvider(),
  }
}

export type UseWalletResult = ReturnType<typeof useWallet>
