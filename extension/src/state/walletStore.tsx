import { createContext, PropsWithChildren, useContext, useState } from 'react'
import { Balance, TransactionRecord, WalletAccount } from '../types/models'

interface WalletState {
  account: WalletAccount | null
  balance: Balance | null
  history: TransactionRecord[]
  setAccount: (account: WalletAccount | null) => void
  setBalance: (balance: Balance | null) => void
  setHistory: (history: TransactionRecord[]) => void
}

const WalletContext = createContext<WalletState | undefined>(undefined)

export const WalletProvider = ({ children }: PropsWithChildren) => {
  const [account, setAccount] = useState<WalletAccount | null>(null)
  const [balance, setBalance] = useState<Balance | null>(null)
  const [history, setHistory] = useState<TransactionRecord[]>([])

  return (
    <WalletContext.Provider value={{ account, balance, history, setAccount, setBalance, setHistory }}>
      {children}
    </WalletContext.Provider>
  )
}

export const useWallet = () => {
  const ctx = useContext(WalletContext)
  if (!ctx) {
    throw new Error('WalletProvider is missing')
  }
  return ctx
}
