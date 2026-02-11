import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react'
import { Balance, TransactionRecord, WalletAccount } from '../types/models'
import {
  initializeWalletWithPassword,
  isWalletInitialized,
  loginWithPassword
} from '../services/walletClient'

interface WalletState {
  account: WalletAccount | null
  balance: Balance | null
  history: TransactionRecord[]
  isAuthReady: boolean
  isInitialized: boolean
  isUnlocked: boolean
  setAccount: (account: WalletAccount | null) => void
  setBalance: (balance: Balance | null) => void
  setHistory: (history: TransactionRecord[]) => void
  initializePassword: (password: string) => Promise<void>
  unlockWithPassword: (password: string) => Promise<void>
  lockWallet: () => void
}

const WalletContext = createContext<WalletState | undefined>(undefined)

export const WalletProvider = ({ children }: PropsWithChildren) => {
  const [account, setAccount] = useState<WalletAccount | null>(null)
  const [balance, setBalance] = useState<Balance | null>(null)
  const [history, setHistory] = useState<TransactionRecord[]>([])
  const [isAuthReady, setIsAuthReady] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)

  useEffect(() => {
    const loadAuthState = async () => {
      const initialized = await isWalletInitialized()
      setIsInitialized(initialized)
      setIsAuthReady(true)
    }

    loadAuthState().catch((error) => {
      console.error('Failed to load wallet auth state', error)
      setIsAuthReady(true)
    })
  }, [])

  const initializePassword = async (password: string) => {
    const nextAccount = await initializeWalletWithPassword(password)
    setAccount(nextAccount)
    setIsInitialized(true)
    setIsUnlocked(true)
  }

  const unlockWithPassword = async (password: string) => {
    const nextAccount = await loginWithPassword(password)
    setAccount(nextAccount)
    setIsUnlocked(true)
  }

  const lockWallet = () => {
    setAccount(null)
    setBalance(null)
    setHistory([])
    setIsUnlocked(false)
  }

  const value = useMemo(
    () => ({
      account,
      balance,
      history,
      isAuthReady,
      isInitialized,
      isUnlocked,
      setAccount,
      setBalance,
      setHistory,
      initializePassword,
      unlockWithPassword,
      lockWallet
    }),
    [account, balance, history, isAuthReady, isInitialized, isUnlocked]
  )

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  )
}

export const useWallet = () => {
  const ctx = useContext(WalletContext)
  if (!ctx) {
    throw new Error('WalletProvider is missing')
  }
  return ctx
}
