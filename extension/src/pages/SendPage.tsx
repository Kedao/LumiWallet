import { FormEvent, useEffect, useMemo, useState } from 'react'
import { parseUnits } from 'ethers'
import HashText from '../components/HashText'
import RiskPanel from '../components/RiskPanel'
import { fetchBalance, sendTokenTransfer } from '../services/walletClient'
import { useWallet } from '../state/walletStore'

const tokenOptions = ['MON', 'eGold'] as const
type TokenOption = (typeof tokenOptions)[number]

const zeroBalanceAssets = {
  assets: [
    { symbol: 'MON', amount: '0.00', decimals: 18, isNative: true },
    {
      symbol: 'eGold',
      amount: '0.00',
      decimals: 18,
      contractAddress: '0xee7977f3854377f6b8bdf6d0b715277834936b24'
    }
  ]
}

const formatDisplayAmount = (amount: string): string => {
  const value = Number(amount)
  if (!Number.isFinite(value)) {
    return amount
  }
  if (value === 0) {
    return '0'
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  })
}

const SendPage = () => {
  const { account, balance, setBalance } = useWallet()
  const [token, setToken] = useState<TokenOption>('MON')
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState('')
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
          setBalance(zeroBalanceAssets)
        }
      }
    }

    void loadBalance()
    return () => {
      isCancelled = true
    }
  }, [account, setBalance])

  const selectedAsset = useMemo(() => {
    const assets = balance?.assets ?? []
    const match = assets.find((item) => item.symbol.toUpperCase() === token.toUpperCase())
    return match ?? zeroBalanceAssets.assets.find((item) => item.symbol.toUpperCase() === token.toUpperCase()) ?? null
  }, [balance, token])

  const selectedDecimals = selectedAsset?.decimals ?? 18
  const availableAmount = selectedAsset?.amount ?? '0'

  const parsedAmount = useMemo(() => {
    const trimmed = amount.trim()
    if (!trimmed) {
      return null
    }
    try {
      const parsed = parseUnits(trimmed, selectedDecimals)
      if (parsed <= 0n) {
        return null
      }
      return parsed
    } catch {
      return null
    }
  }, [amount, selectedDecimals])

  const parsedAvailable = useMemo(() => {
    try {
      return parseUnits(availableAmount, selectedDecimals)
    } catch {
      return 0n
    }
  }, [availableAmount, selectedDecimals])

  const isInsufficientBalance = parsedAmount !== null && parsedAmount > parsedAvailable
  const isAmountInvalid = amount.trim().length > 0 && parsedAmount === null
  const isSubmitDisabled =
    isSubmitting || toAddress.trim().length === 0 || parsedAmount === null || isInsufficientBalance

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setTxHash('')

    if (parsedAmount === null) {
      setError('Please enter a valid amount.')
      return
    }
    if (isInsufficientBalance) {
      setError(`Insufficient ${token} balance.`)
      return
    }

    setIsSubmitting(true)
    try {
      const hash = await sendTokenTransfer(token, toAddress.trim(), amount.trim())
      setTxHash(hash)
      setAmount('')
      const nextBalance = await fetchBalance()
      setBalance(nextBalance)
    } catch (submitError) {
      if (submitError instanceof Error) {
        setError(submitError.message)
      } else {
        setError('Failed to send transaction.')
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
        border: '1px solid var(--border)',
        display: 'grid',
        gap: 12,
        minWidth: 0
      }}
    >
      <h2 style={{ margin: 0 }}>Send Asset</h2>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 10, minWidth: 0 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Token</span>
          <select
            value={token}
            onChange={(event) => {
              setToken(event.target.value as TokenOption)
              setError('')
              setTxHash('')
            }}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: 8,
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: '#fff',
              minWidth: 0
            }}
          >
            {tokenOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>To Address</span>
          <input
            value={toAddress}
            onChange={(event) => setToAddress(event.target.value)}
            placeholder="0x..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: 8,
              borderRadius: 10,
              border: '1px solid var(--border)',
              minWidth: 0
            }}
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Amount ({token})</span>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.0"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: 8,
              borderRadius: 10,
              border: '1px solid var(--border)',
              minWidth: 0
            }}
          />
        </label>

        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Available: {formatDisplayAmount(availableAmount)} {token}
        </div>

        {isAmountInvalid ? (
          <div
            style={{
              fontSize: 12,
              color: '#8b2b2b',
              background: '#fdeeee',
              border: '1px solid #f0c5c5',
              padding: '8px 10px',
              borderRadius: 10,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word'
            }}
          >
            Please enter a valid amount.
          </div>
        ) : null}
        {isInsufficientBalance ? (
          <div
            style={{
              fontSize: 12,
              color: '#8b2b2b',
              background: '#fdeeee',
              border: '1px solid #f0c5c5',
              padding: '8px 10px',
              borderRadius: 10,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word'
            }}
          >
            Insufficient {token} balance.
          </div>
        ) : null}
        {error ? (
          <div
            style={{
              fontSize: 12,
              color: '#8b2b2b',
              background: '#fdeeee',
              border: '1px solid #f0c5c5',
              padding: '8px 10px',
              borderRadius: 10,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word'
            }}
          >
            {error}
          </div>
        ) : null}
        {txHash ? (
          <div
            style={{
              fontSize: 12,
              color: '#1f5e41',
              background: '#eaf8f1',
              border: '1px solid #bde7d1',
              padding: '8px 10px',
              borderRadius: 10,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word'
            }}
          >
            <div>Sent successfully. Tx:</div>
            <div style={{ marginTop: 2 }}>
              <HashText value={txHash} mode="wrap" fontSize={11} color="#1f5e41" />
            </div>
          </div>
        ) : null}

        <RiskPanel />

        <button
          type="submit"
          disabled={isSubmitDisabled}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontWeight: 600,
            cursor: isSubmitDisabled ? 'default' : 'pointer',
            opacity: isSubmitDisabled ? 0.6 : 1
          }}
        >
          {isSubmitting ? 'Sending...' : 'Review & Send'}
        </button>
      </form>
    </section>
  )
}

export default SendPage
