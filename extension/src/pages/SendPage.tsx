import { FormEvent, useEffect, useMemo, useState } from 'react'
import { parseUnits } from 'ethers'
import HashText from '../components/HashText'
import RiskPanel from '../components/RiskPanel'
import {
  fetchBalance,
  fetchRecentAddressTransactionSummary,
  RecentAddressTransactionSummary,
  recordLocalActivity,
  sendTokenTransfer
} from '../services/walletClient'
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

const formatSummaryTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })

const formatDirectionLabel = (direction: 'in' | 'out' | 'self'): string => {
  if (direction === 'in') {
    return 'Incoming'
  }
  if (direction === 'out') {
    return 'Outgoing'
  }
  return 'Self'
}

const SendPage = () => {
  const { account, balance, setBalance, setHistory } = useWallet()
  const [token, setToken] = useState<TokenOption>('MON')
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [historyWarning, setHistoryWarning] = useState('')
  const [txHash, setTxHash] = useState('')
  const [isReviewingAddress, setIsReviewingAddress] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [reviewedAddress, setReviewedAddress] = useState('')
  const [recentTxSummary, setRecentTxSummary] = useState<RecentAddressTransactionSummary | null>(null)

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
  const normalizedToAddress = toAddress.trim().toLowerCase()
  const hasReviewedCurrentAddress = reviewedAddress.length > 0 && reviewedAddress === normalizedToAddress
  const isSubmitDisabled =
    isReviewingAddress || isSending || toAddress.trim().length === 0 || parsedAmount === null || isInsufficientBalance

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setHistoryWarning('')
    setTxHash('')

    if (parsedAmount === null) {
      setError('Please enter a valid amount.')
      return
    }
    if (isInsufficientBalance) {
      setError(`Insufficient ${token} balance.`)
      return
    }

    if (!hasReviewedCurrentAddress) {
      setIsReviewingAddress(true)
      try {
        const summary = await fetchRecentAddressTransactionSummary(toAddress.trim())
        setRecentTxSummary(summary)
        setReviewedAddress(summary.address)
      } catch (reviewError) {
        if (reviewError instanceof Error) {
          setError(reviewError.message)
        } else {
          setError('Failed to query recent transactions for this address.')
        }
      } finally {
        setIsReviewingAddress(false)
      }
      return
    }

    setIsSending(true)
    try {
      const hash = await sendTokenTransfer(token, toAddress.trim(), amount.trim())
      setTxHash(hash)
      setAmount('')
      setReviewedAddress('')
      setRecentTxSummary(null)

      try {
        const nextHistory = await recordLocalActivity({
          type: 'transfer',
          amount: `${amount.trim()} ${token}`,
          hash,
          to: toAddress.trim()
        })
        setHistory(nextHistory)
      } catch (activityError) {
        console.warn('Failed to record local send activity', activityError)
        setHistoryWarning('Transaction sent, but failed to save local activity.')
      }

      try {
        const nextBalance = await fetchBalance()
        setBalance(nextBalance)
      } catch (balanceError) {
        console.warn('Failed to refresh balance after send', balanceError)
      }
    } catch (submitError) {
      if (submitError instanceof Error) {
        setError(submitError.message)
      } else {
        setError('Failed to send transaction.')
      }
    } finally {
      setIsSending(false)
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
            onChange={(event) => {
              setToAddress(event.target.value)
              setError('')
              setTxHash('')
              setReviewedAddress('')
              setRecentTxSummary(null)
            }}
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
        {historyWarning ? (
          <div
            style={{
              fontSize: 12,
              color: '#7a4b00',
              background: '#fff5df',
              border: '1px solid #f1b83a',
              padding: '8px 10px',
              borderRadius: 10,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word'
            }}
          >
            {historyWarning}
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
        {recentTxSummary ? (
          <div
            style={{
              fontSize: 12,
              color: '#1d4f7a',
              background: '#ecf5ff',
              border: '1px solid #b8d5f5',
              padding: '10px 12px',
              borderRadius: 10,
              display: 'grid',
              gap: 8,
              minWidth: 0
            }}
          >
            <div style={{ fontWeight: 700 }}>Recent On-chain Activity</div>
            <div>
              Address checked:
              <div style={{ marginTop: 2 }}>
                <HashText value={recentTxSummary.address} mode="wrap" fontSize={11} color="#1d4f7a" />
              </div>
            </div>
            <div>
              Monadscan returned {recentTxSummary.total} recent transaction
              {recentTxSummary.total === 1 ? '' : 's'} (in: {recentTxSummary.incomingCount}, out:{' '}
              {recentTxSummary.outgoingCount}, self: {recentTxSummary.selfCount}, limit:{' '}
              {recentTxSummary.requestedLimit}).
            </div>
            {recentTxSummary.records.length === 0 ? (
              <div>No recent activity found for this address from Monadscan.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {recentTxSummary.records.map((item) => (
                  <div
                    key={item.hash}
                    style={{
                      borderRadius: 8,
                      border: '1px solid #c6def7',
                      padding: '8px 10px',
                      background: '#f6fbff',
                      display: 'grid',
                      gap: 4,
                      minWidth: 0
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{formatDirectionLabel(item.direction)}</span>
                      <span>{formatDisplayAmount(item.value)} MON</span>
                    </div>
                    <div style={{ color: '#386180' }}>{formatSummaryTime(item.timestamp)}</div>
                    <div>
                      Counterparty:
                      <div style={{ marginTop: 2 }}>
                        <HashText value={item.counterparty} mode="wrap" fontSize={11} color="#386180" />
                      </div>
                    </div>
                    <div>
                      Tx:
                      <div style={{ marginTop: 2 }}>
                        <HashText value={item.hash} mode="wrap" fontSize={11} color="#386180" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {hasReviewedCurrentAddress ? <div>Address review completed. Click the button again to send.</div> : null}
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
          {isReviewingAddress
            ? 'Checking Address Activity...'
            : isSending
              ? 'Sending...'
              : hasReviewedCurrentAddress
                ? 'Send Now'
                : 'Review Address Activity'}
        </button>
      </form>
    </section>
  )
}

export default SendPage
