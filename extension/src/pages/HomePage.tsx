import { FormEvent, useState } from 'react'
import BalanceCard from '../components/BalanceCard'
import QuickActions from '../components/QuickActions'
import TxHistoryList from '../components/TxHistoryList'
import RiskPanel from '../components/RiskPanel'
import { useWallet } from '../state/walletStore'

const HomePage = () => {
  const { account, importAccount } = useWallet()
  const [privateKey, setPrivateKey] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

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
        setError('Failed to import account.')
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
        <h2 style={{ margin: 0 }}>Import Account</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12 }}>
          Import with private key. Address is derived automatically and you can switch accounts from the header.
        </p>
      </div>
      <form onSubmit={handleImport} style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Private Key</span>
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
          {isSubmitting ? 'Importing...' : 'Import Account'}
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
          No account selected. Please import an address to continue.
        </section>
        {importSection}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <BalanceCard />
      <QuickActions />
      <RiskPanel />
      <TxHistoryList />
    </div>
  )
}

export default HomePage
