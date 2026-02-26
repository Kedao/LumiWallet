import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { parseUnits } from 'ethers'
import HashText from '../components/HashText'
import RiskPanel from '../components/RiskPanel'
import {
  fetchBalance,
  fetchSwapSlippagePoolRiskStatsByInputAmount,
  fetchSwapQuoteByInputAmount,
  SwapQuote,
  SwapTargetToken,
  swapByInputAmount
} from '../services/walletClient'
import { analyzeSlippageRisk, SlippageRiskResponse } from '../services/agentClient'
import { useWallet } from '../state/walletStore'

const receiveTokenOptions: SwapTargetToken[] = ['MON', 'eGold']

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

const getPayTokenByReceiveToken = (receiveToken: SwapTargetToken): SwapTargetToken =>
  receiveToken === 'MON' ? 'eGold' : 'MON'

const normalizeRiskLabel = (
  value: SlippageRiskResponse['exceed_slippage_probability_label']
): 'high' | 'medium' | 'low' | 'unknown' => {
  if (value === 'high' || value === '高') {
    return 'high'
  }
  if (value === 'medium' || value === '中') {
    return 'medium'
  }
  if (value === 'low' || value === '低') {
    return 'low'
  }
  return 'unknown'
}

const getSlippageButtonBackground = (risk: SlippageRiskResponse | null): string | null => {
  if (!risk) {
    return null
  }
  const normalized = normalizeRiskLabel(risk.exceed_slippage_probability_label)
  if (normalized === 'high') {
    return '#d94b4b'
  }
  if (normalized === 'medium') {
    return '#d38a00'
  }
  if (normalized === 'low') {
    return '#2f9d69'
  }
  return '#66758a'
}

const SwapPage = () => {
  const { account, balance, setBalance } = useWallet()
  const [receiveToken, setReceiveToken] = useState<SwapTargetToken>('eGold')
  const [payAmount, setPayAmount] = useState('')
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [quoteError, setQuoteError] = useState('')
  const [error, setError] = useState('')
  const [slippageRiskWarning, setSlippageRiskWarning] = useState('')
  const [txHash, setTxHash] = useState('')
  const [isQuoting, setIsQuoting] = useState(false)
  const [isReviewingSlippageRisk, setIsReviewingSlippageRisk] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [slippageRisk, setSlippageRisk] = useState<SlippageRiskResponse | null>(null)
  const [reviewedQuoteKey, setReviewedQuoteKey] = useState('')
  const [swapCooldownSeconds, setSwapCooldownSeconds] = useState(0)
  const quoteRequestIdRef = useRef(0)
  const riskReviewRequestIdRef = useRef(0)
  const payToken = getPayTokenByReceiveToken(receiveToken)

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
    setQuote(null)
    setQuoteError('')
    setSlippageRisk(null)
    setSlippageRiskWarning('')
    setReviewedQuoteKey('')
    setSwapCooldownSeconds(0)
    riskReviewRequestIdRef.current += 1
    quoteRequestIdRef.current += 1
    const requestId = quoteRequestIdRef.current

    const trimmed = payAmount.trim()
    if (!trimmed) {
      setIsQuoting(false)
      return
    }

    setIsQuoting(true)
    const loadQuote = async () => {
      try {
        const nextQuote = await fetchSwapQuoteByInputAmount(payToken, trimmed)
        if (quoteRequestIdRef.current !== requestId) {
          return
        }
        setQuote(nextQuote)
      } catch (quoteErr) {
        if (quoteRequestIdRef.current !== requestId) {
          return
        }
        if (quoteErr instanceof Error) {
          setQuoteError(quoteErr.message)
        } else {
          setQuoteError('Unable to estimate swap output.')
        }
      } finally {
        if (quoteRequestIdRef.current === requestId) {
          setIsQuoting(false)
        }
      }
    }

    void loadQuote()
  }, [payToken, payAmount])

  useEffect(() => {
    if (swapCooldownSeconds <= 0) {
      return
    }

    const timer = window.setInterval(() => {
      setSwapCooldownSeconds((current) => (current > 0 ? current - 1 : 0))
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [swapCooldownSeconds])

  const payAsset = useMemo(() => {
    const assets = balance?.assets ?? zeroBalanceAssets.assets
    return assets.find((item) => item.symbol.toUpperCase() === payToken.toUpperCase()) ?? null
  }, [balance, payToken])

  const payDecimals = payAsset?.decimals ?? 18
  const payBalance = payAsset?.amount ?? '0'
  const expectedReceiveToken = quote?.outputToken ?? receiveToken
  const expectedReceiveAmount = quote?.expectedOutputAmount ?? ''

  const parsedPayAmount = useMemo(() => {
    const trimmed = payAmount.trim()
    if (!trimmed) {
      return null
    }
    try {
      const parsed = parseUnits(trimmed, payDecimals)
      return parsed > 0n ? parsed : null
    } catch {
      return null
    }
  }, [payAmount, payDecimals])

  const parsedPayBalance = useMemo(() => {
    try {
      return parseUnits(payBalance, payDecimals)
    } catch {
      return 0n
    }
  }, [payBalance, payDecimals])

  const isAmountInvalid = payAmount.trim().length > 0 && parsedPayAmount === null
  const isInsufficientBalance = parsedPayAmount !== null && parsedPayAmount > parsedPayBalance
  const currentQuoteKey = quote
    ? `${quote.inputToken}:${quote.outputToken}:${quote.inputAmount}:${quote.expectedOutputAmount}`
    : ''
  const hasReviewedCurrentQuote = currentQuoteKey.length > 0 && reviewedQuoteKey === currentQuoteKey
  const slippageRiskLevel = slippageRisk ? normalizeRiskLabel(slippageRisk.exceed_slippage_probability_label) : null
  const isSwapCooldownActive =
    hasReviewedCurrentQuote && swapCooldownSeconds > 0 && (slippageRiskLevel === 'high' || slippageRiskLevel === 'medium')
  const swapButtonBackground = getSlippageButtonBackground(slippageRisk)
  const canSubmitBase =
    Boolean(quote) &&
    payAmount.trim().length > 0 &&
    !isAmountInvalid &&
    !quoteError &&
    !isQuoting &&
    !isInsufficientBalance &&
    !isSubmitting &&
    expectedReceiveToken === receiveToken
  const canSubmit = canSubmitBase && !isReviewingSlippageRisk && !isSwapCooldownActive

  const handleSwap = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSlippageRiskWarning('')
    setTxHash('')

    if (parsedPayAmount === null) {
      setError('Please enter a valid input amount.')
      return
    }
    if (!quote) {
      setError('Unable to estimate swap output.')
      return
    }
    if (expectedReceiveToken !== receiveToken) {
      setError('Quote is outdated. Please try again.')
      return
    }
    if (isInsufficientBalance) {
      setError(`Insufficient ${payToken} balance.`)
      return
    }

    if (!hasReviewedCurrentQuote) {
      const reviewRequestId = ++riskReviewRequestIdRef.current
      setSlippageRisk(null)
      setSwapCooldownSeconds(0)
      setIsReviewingSlippageRisk(true)
      try {
        const poolStats = await fetchSwapSlippagePoolRiskStatsByInputAmount(payToken, payAmount.trim())
        const risk = await analyzeSlippageRisk({
          pool_address: poolStats.poolAddress,
          chain: 'monad',
          token_in: payToken,
          token_out: receiveToken,
          amount_in: quote.inputAmount,
          trade_type: 'exact_in',
          interaction_type: 'swap',
          pool: poolStats.priceImpactPct === null ? undefined : { price_impact_pct: poolStats.priceImpactPct },
          extra_features: {
            expected_output_amount: quote.expectedOutputAmount,
            quote_input_amount: quote.inputAmount
          }
        })
        if (riskReviewRequestIdRef.current !== reviewRequestId) {
          return
        }
        setSlippageRisk(risk)
        setSwapCooldownSeconds(
          (() => {
            const normalized = normalizeRiskLabel(risk.exceed_slippage_probability_label)
            return normalized === 'high' || normalized === 'medium' ? 3 : 0
          })()
        )
      } catch (riskError) {
        if (riskReviewRequestIdRef.current !== reviewRequestId) {
          return
        }
        setSlippageRisk(null)
        setSwapCooldownSeconds(0)
        setSlippageRiskWarning(
          riskError instanceof Error ? riskError.message : 'Failed to analyze slippage risk.'
        )
      } finally {
        if (riskReviewRequestIdRef.current === reviewRequestId) {
          setReviewedQuoteKey(currentQuoteKey)
          setIsReviewingSlippageRisk(false)
        }
      }
      return
    }

    setIsSubmitting(true)
    try {
      const tx = await swapByInputAmount(payToken, payAmount.trim())
      setTxHash(tx)
      setPayAmount('')
      setQuote(null)
      setReviewedQuoteKey('')
      setSlippageRisk(null)
      setSwapCooldownSeconds(0)

      try {
        const nextBalance = await fetchBalance()
        setBalance(nextBalance)
      } catch (balanceError) {
        console.warn('Failed to refresh balance after swap', balanceError)
      }
    } catch (swapError) {
      if (swapError instanceof Error) {
        setError(swapError.message)
      } else {
        setError('Swap failed.')
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 800 }}>
          You receive
        </span>
        <select
          value={receiveToken}
          onChange={(event) => {
            setReceiveToken(event.target.value as SwapTargetToken)
            setError('')
            setTxHash('')
            setSlippageRisk(null)
            setSlippageRiskWarning('')
            setReviewedQuoteKey('')
            setSwapCooldownSeconds(0)
            riskReviewRequestIdRef.current += 1
          }}
          style={{
            minWidth: 100,
            borderRadius: 10,
            border: '1px solid #a7cfbe',
            background: '#ffffff',
            padding: '6px 24px 6px 10px',
            fontWeight: 700,
            color: 'var(--ink)',
            cursor: 'pointer',
            boxShadow: '0 1px 0 rgba(0,0,0,0.03)'
          }}
        >
          {receiveTokenOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={handleSwap} style={{ display: 'grid', gap: 10, minWidth: 0 }}>
        <section
          style={{
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: '#fdfcf9',
            padding: 12,
            display: 'grid',
            gap: 10
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              minWidth: 0
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              {`You pay (${payToken})`}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                aria-label={`Amount to pay in ${payToken}`}
                value={payAmount}
                onChange={(event) => {
                  setPayAmount(event.target.value)
                  setSlippageRisk(null)
                  setSlippageRiskWarning('')
                  setReviewedQuoteKey('')
                  setSwapCooldownSeconds(0)
                  riskReviewRequestIdRef.current += 1
                }}
                placeholder="0.0"
                inputMode="decimal"
                style={{
                  width: 112,
                  boxSizing: 'border-box',
                  padding: '7px 8px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  textAlign: 'right'
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 700, minWidth: 44 }}>{payToken}</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Available</span>
            <span style={{ fontSize: 12 }}>
              {formatDisplayAmount(payBalance)} {payToken}
            </span>
          </div>
        </section>

        <section
          style={{
            borderRadius: 12,
            padding: '12px 14px',
            background: 'linear-gradient(145deg, #eaf8f1, #f4fbf8)',
            border: '1px solid #bde7d1',
            display: 'grid',
            gap: 5,
            minWidth: 0
          }}
        >
          <div style={{ fontSize: 11, color: '#2a6f4f', fontWeight: 700 }}>You receive (estimated)</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.05, color: '#194d36' }}>
              {quote ? formatDisplayAmount(expectedReceiveAmount) : '--'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#194d36' }}>
              {receiveToken}
            </div>
          </div>
        </section>

        {isQuoting ? (
          <div
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              background: '#f6f3ec',
              border: '1px solid var(--border)',
              padding: '8px 10px',
              borderRadius: 10
            }}
          >
            Estimating output amount...
          </div>
        ) : null}
        {isAmountInvalid ? (
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
            Please enter a valid pay amount.
          </div>
        ) : null}
        {quoteError ? (
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
            {quoteError}
          </div>
        ) : null}
        {slippageRiskWarning ? (
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
            Slippage risk analysis unavailable: {slippageRiskWarning}
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
              borderRadius: 10
            }}
          >
            Insufficient {payToken} balance.
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
            <div>Swap submitted. Tx:</div>
            <div style={{ marginTop: 2 }}>
              <HashText value={txHash} mode="wrap" fontSize={11} color="#1f5e41" />
            </div>
          </div>
        ) : null}

        <RiskPanel slippageRisk={slippageRisk} />

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: 'none',
            background: swapButtonBackground ?? 'var(--accent)',
            color: '#fff',
            fontWeight: 700,
            cursor: canSubmit ? 'pointer' : 'default',
            opacity: canSubmit ? 1 : 0.6
          }}
        >
          {isReviewingSlippageRisk
            ? 'Analyzing Slippage...'
            : isSubmitting
              ? 'Swapping...'
              : hasReviewedCurrentQuote
                ? isSwapCooldownActive
                  ? `Swap Now (${swapCooldownSeconds}s)`
                  : `Swap ${payToken} to ${receiveToken}`
                : 'Review Slippage Risk'}
        </button>
      </form>
    </section>
  )
}

export default SwapPage
