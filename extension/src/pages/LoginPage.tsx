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
      setError('两次输入的密码不一致。')
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
        setError('钱包解锁失败。')
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
      <h2 style={{ margin: 0 }}>{isInitialized ? '解锁钱包' : '初始化钱包'}</h2>
      <p style={{ color: 'var(--muted)', marginTop: 4 }}>
        {isInitialized
          ? '请输入钱包密码继续。'
          : '使用灵光钱包前请先设置钱包密码。'}
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>密码</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isInitialized ? '请输入密码' : '设置密码（至少 8 位）'}
            autoComplete={isInitialized ? 'current-password' : 'new-password'}
            style={{ padding: 8, borderRadius: 10, border: '1px solid var(--border)' }}
          />
        </label>

        {!isInitialized ? (
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>确认密码</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="请再次输入密码"
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
              ? '解锁中...'
              : '初始化中...'
            : isInitialized
              ? '解锁钱包'
              : '初始化钱包'}
        </button>
      </form>
    </section>
  )
}

export default LoginPage
