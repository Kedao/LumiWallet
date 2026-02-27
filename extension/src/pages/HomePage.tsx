import { FormEvent, useEffect, useState } from 'react'
import BalanceCard from '../components/BalanceCard'
import TxHistoryList from '../components/TxHistoryList'
import RiskPanel from '../components/RiskPanel'
import { useWallet } from '../state/walletStore'
import { fetchBalance, fetchHistory } from '../services/walletClient'

const HomePage = () => {
  const { account, importAccount, setBalance, history, setHistory } = useWallet()
  const [privateKey, setPrivateKey] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!account) {
      setBalance(null)
      return
    }

    let isCancelled = false
    const loadBalance = async () => {
      try {
        const nextBalance = await fetchBalance()
        if (!isCancelled) {
          setBalance(nextBalance)
        }
      } catch {
        if (!isCancelled) {
          setBalance({
            assets: [
              { symbol: 'MON', amount: '0.00', decimals: 18, isNative: true },
              {
                symbol: 'eGold',
                amount: '0.00',
                decimals: 18,
                contractAddress: '0xee7977f3854377f6b8bdf6d0b715277834936b24'
              }
            ]
          })
        }
      }
    }

    void loadBalance()
    return () => {
      isCancelled = true
    }
  }, [account, setBalance])

  useEffect(() => {
    if (!account) {
      setHistory([])
      return
    }

    let isCancelled = false
    const loadHistory = async () => {
      try {
        const nextHistory = await fetchHistory()
        if (!isCancelled) {
          setHistory(nextHistory)
        }
      } catch (historyError) {
        console.warn('刷新活动记录失败', historyError)
      }
    }

    void loadHistory()

    return () => {
      isCancelled = true
    }
  }, [account, setHistory])

  const handleImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      await importAccount(privateKey)
      setPrivateKey('')
    } catch (importError) {
      if (importError instanceof Error) {
        setError(importError.message)
      } else {
        setError('导入账户失败。')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const importSection = (
    <section
      style={{
        background: 'var(--panel)',
        borderRadius: 16,
        padding: 16,
        border: '1px solid var(--border)',
        display: 'grid',
        gap: 12
      }}
    >
      <div>
        <h2 style={{ margin: 0 }}>导入账户</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12 }}>
          使用私钥导入。地址会自动推导，导入后可在顶部切换账户。
        </p>
      </div>
      <form onSubmit={handleImport} style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>私钥</span>
          <input
            type="password"
            value={privateKey}
            onChange={(event) => setPrivateKey(event.target.value)}
            placeholder="0x..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            style={{ padding: 8, borderRadius: 10, border: '1px solid var(--border)' }}
          />
        </label>
        {error ? (
          <div
            style={{
              fontSize: 12,
              color: '#8b2b2b',
              background: '#fdeeee',
              border: '1px solid #f0c5c5',
              padding: '8px 10px',
              borderRadius: 10
            }}
          >
            {error}
          </div>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontWeight: 600,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            opacity: isSubmitting ? 0.8 : 1
          }}
        >
          {isSubmitting ? '导入中...' : '导入账户'}
        </button>
      </form>
    </section>
  )

  if (!account) {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <section
          style={{
            background: '#fff5df',
            borderRadius: 16,
            padding: 16,
            border: '1px solid #f1b83a',
            color: '#7a4b00',
            fontSize: 12
          }}
        >
          当前未选择账户，请先导入地址。
        </section>
        {importSection}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <BalanceCard />
      <TxHistoryList records={history} />
      <RiskPanel />
    </div>
  )
}

export default HomePage
