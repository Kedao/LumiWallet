import { FormEvent, useEffect, useMemo, useState } from 'react'
import { parseUnits } from 'ethers'
import HashText from '../components/HashText'
import RiskPanel from '../components/RiskPanel'
import {
  fetchAddressLifecycleInfo,
  fetchBalance,
  fetchRecentAddressTransactionSummary,
  sendTokenTransfer
} from '../services/walletClient'
import { analyzePhishingRisk, SecurityRiskResponse } from '../services/agentClient'
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

const getRiskAwareButtonBackground = (risk: SecurityRiskResponse | null): string | null => {
  if (!risk) {
    return null
  }

  const level = risk.risk_level
  if (level === 'high' || level === '高') {
    return '#d94b4b'
  }
  if (level === 'medium' || level === '中') {
    return '#d38a00'
  }
  if (level === 'low' || level === '低') {
    return '#2f9d69'
  }
  return '#66758a'
}

const getNormalizedRiskLevel = (
  risk: SecurityRiskResponse | null
): 'high' | 'medium' | 'low' | 'unknown' | null => {
  if (!risk) {
    return null
  }
  const level = risk.risk_level
  if (level === 'high' || level === '高') {
    return 'high'
  }
  if (level === 'medium' || level === '中') {
    return 'medium'
  }
  if (level === 'low' || level === '低') {
    return 'low'
  }
  return 'unknown'
}

const SendPage = () => {
  const { account, balance, setBalance } = useWallet()
  const [token, setToken] = useState<TokenOption>('MON')
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [historyWarning, setHistoryWarning] = useState('')
  const [txHash, setTxHash] = useState('')
  const [isReviewingAddress, setIsReviewingAddress] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [reviewedAddress, setReviewedAddress] = useState('')
  const [phishingRisk, setPhishingRisk] = useState<SecurityRiskResponse | null>(null)
  const [sendCooldownSeconds, setSendCooldownSeconds] = useState(0)

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

  useEffect(() => {
    if (sendCooldownSeconds <= 0) {
      return
    }

    const timer = window.setInterval(() => {
      setSendCooldownSeconds((current) => (current > 0 ? current - 1 : 0))
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [sendCooldownSeconds])

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
  const riskAwareButtonBackground = getRiskAwareButtonBackground(phishingRisk)
  const normalizedRiskLevel = getNormalizedRiskLevel(phishingRisk)
  const isRiskCooldownActive =
    hasReviewedCurrentAddress &&
    sendCooldownSeconds > 0 &&
    (normalizedRiskLevel === 'high' || normalizedRiskLevel === 'medium')
  const isSubmitDisabled =
    isReviewingAddress ||
    isSending ||
    isRiskCooldownActive ||
    toAddress.trim().length === 0 ||
    parsedAmount === null ||
    isInsufficientBalance

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setHistoryWarning('')
    setTxHash('')
    const senderAddress = account?.address?.trim() ?? ''

    if (parsedAmount === null) {
      setError('Please enter a valid amount.')
      return
    }
    if (isInsufficientBalance) {
      setError(`Insufficient ${token} balance.`)
      return
    }

    if (!hasReviewedCurrentAddress) {
      if (!senderAddress) {
        setError('No active sender account.')
        return
      }
      setPhishingRisk(null)
      setSendCooldownSeconds(0)
      setIsReviewingAddress(true)
      try {
        const [senderSummary, receiverLifecycle] = await Promise.all([
          fetchRecentAddressTransactionSummary(senderAddress, { limit: 5 }),
          fetchAddressLifecycleInfo(toAddress.trim())
        ])
        try {
          const risk = await analyzePhishingRisk({
            address: receiverLifecycle.address,
            chain: 'monad',
            interaction_type: 'transfer',
            transactions: senderSummary.records.map((item) => ({
              tx_hash: item.hash,
              timestamp: Math.floor(item.timestamp / 1000),
              from_address: item.from,
              to_address: item.to,
              value: item.phishingValue ?? item.value,
              token_address: item.tokenAddress ?? null,
              token_decimals: item.tokenDecimals ?? null,
              tx_type: item.direction,
              contract_address: item.contractAddress ?? null,
              method_sig: item.methodSig ?? null,
              success: item.success ?? null
            })),
            lifecycle: receiverLifecycle.lifecycle
          })
          setPhishingRisk(risk)
          const riskLevel = getNormalizedRiskLevel(risk)
          setSendCooldownSeconds(riskLevel === 'high' || riskLevel === 'medium' ? 3 : 0)
          console.info('Phishing risk review result', risk)
        } catch (riskError) {
          setPhishingRisk(null)
          setSendCooldownSeconds(0)
          console.warn('Failed to analyze phishing risk', riskError)
          setHistoryWarning('Address activity reviewed, but phishing risk analysis request failed.')
        }
        setReviewedAddress(normalizedToAddress)
      } catch (reviewError) {
        setPhishingRisk(null)
        setSendCooldownSeconds(0)
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
      setPhishingRisk(null)
      setSendCooldownSeconds(0)

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
              setPhishingRisk(null)
              setSendCooldownSeconds(0)
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
              setPhishingRisk(null)
              setSendCooldownSeconds(0)
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
        <RiskPanel phishingRisk={phishingRisk} />

        <button
          type="submit"
          disabled={isSubmitDisabled}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: 'none',
            background: riskAwareButtonBackground ?? 'var(--accent)',
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
                ? isRiskCooldownActive
                  ? `Send Now (${sendCooldownSeconds}s)`
                  : 'Send Now'
                : 'Review Address Activity'}
        </button>
      </form>
    </section>
  )
}

export default SendPage
