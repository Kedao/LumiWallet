import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react'
import { Balance, TransactionRecord, WalletAccount } from '../types/models'
import {
  clearWalletSession,
  getImportedAccountState,
  importAccountWithPrivateKey,
  initializeWalletWithPassword,
  isWalletInitialized,
  loginWithPassword,
  removeImportedAccount,
  selectImportedAccount
} from '../services/walletClient'

interface WalletState {
  accounts: WalletAccount[]
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
  importAccount: (privateKey: string) => Promise<void>
  switchAccount: (address: string) => Promise<void>
  removeAccount: (address: string) => Promise<void>
  lockWallet: () => void
}

const WalletContext = createContext<WalletState | undefined>(undefined)

export const WalletProvider = ({ children }: PropsWithChildren) => {
  const [accounts, setAccounts] = useState<WalletAccount[]>([])
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

  const syncAccountState = async () => {
    const state = await getImportedAccountState()
    setAccounts(state.accounts)
    setAccount(state.accounts.find((item) => item.address === state.selectedAddress) ?? null)
  }

  const initializePassword = async (password: string) => {
    await initializeWalletWithPassword(password)
    await syncAccountState()
    setIsInitialized(true)
    setIsUnlocked(true)
  }

  const unlockWithPassword = async (password: string) => {
    await loginWithPassword(password)
    await syncAccountState()
    setIsUnlocked(true)
  }

  const importAccount = async (privateKey: string) => {
    const state = await importAccountWithPrivateKey(privateKey)
    setAccounts(state.accounts)
    setAccount(state.accounts.find((item) => item.address === state.selectedAddress) ?? null)
  }

  const switchAccount = async (address: string) => {
    const state = await selectImportedAccount(address)
    setAccounts(state.accounts)
    setAccount(state.accounts.find((item) => item.address === state.selectedAddress) ?? null)
  }

  const removeAccount = async (address: string) => {
    const state = await removeImportedAccount(address)
    setAccounts(state.accounts)
    setAccount(state.accounts.find((item) => item.address === state.selectedAddress) ?? null)
  }

  const lockWallet = () => {
    clearWalletSession()
    setAccounts([])
    setAccount(null)
    setBalance(null)
    setHistory([])
    setIsUnlocked(false)
  }

  const value = useMemo(
    () => ({
      accounts,
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
      importAccount,
      switchAccount,
      removeAccount,
      lockWallet
    }),
    [accounts, account, balance, history, isAuthReady, isInitialized, isUnlocked]
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
