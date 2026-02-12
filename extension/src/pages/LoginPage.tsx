import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../state/walletStore'

const LoginPage = () => {
  const navigate = useNavigate()
  const { isInitialized, initializePassword, unlockWithPassword } = useWallet()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')

    if (!isInitialized && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      if (isInitialized) {
        await unlockWithPassword(password)
      } else {
        await initializePassword(password)
      }
      navigate('/home', { replace: true })
    } catch (submissionError) {
      if (submissionError instanceof Error) {
        setError(submissionError.message)
      } else {
        setError('Failed to unlock wallet.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section
      style={{
        background: 'var(--panel)',
        borderRadius: 16,
        padding: 16,
        border: '1px solid var(--border)'
      }}
    >
      <h2 style={{ margin: 0 }}>{isInitialized ? 'Unlock Wallet' : 'Initialize Wallet'}</h2>
      <p style={{ color: 'var(--muted)', marginTop: 4 }}>
        {isInitialized
          ? 'Enter your wallet password to continue.'
          : 'Set a wallet password before using LumiWallet.'}
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isInitialized ? 'Enter password' : 'Set password (min 8 chars)'}
            autoComplete={isInitialized ? 'current-password' : 'new-password'}
            style={{ padding: 8, borderRadius: 10, border: '1px solid var(--border)' }}
          />
        </label>

        {!isInitialized ? (
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Confirm Password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm password"
              autoComplete="new-password"
              style={{ padding: 8, borderRadius: 10, border: '1px solid var(--border)' }}
            />
          </label>
        ) : null}

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
          {isSubmitting
            ? isInitialized
              ? 'Unlocking...'
              : 'Initializing...'
            : isInitialized
              ? 'Unlock Wallet'
              : 'Initialize Wallet'}
        </button>
      </form>
    </section>
  )
}

export default LoginPage
