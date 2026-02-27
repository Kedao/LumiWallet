import { useEffect, useMemo, useState } from 'react'
import { TransactionRecord } from '../types/models'
import { getExplorerTxUrl } from '../services/walletClient'
import HashText from './HashText'
import TokenIcon from './TokenIcon'

interface TxHistoryListProps {
  records: TransactionRecord[]
}

const formatRecordTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })

const inferTokenSymbolFromAmount = (amount: string): string | null => {
  const normalized = amount.toUpperCase()
  if (normalized.includes('EGOLD')) {
    return 'eGold'
  }
  if (normalized.includes('MON')) {
    return 'MON'
  }
  return null
}

const getStatusLabel = (status: TransactionRecord['status']): string => {
  if (status === 'success') {
    return '成功'
  }
  if (status === 'failed') {
    return '失败'
  }
  return '待确认'
}

const getStatusColor = (status: TransactionRecord['status']): string => {
  if (status === 'success') {
    return '#2f9d69'
  }
  if (status === 'failed') {
    return '#d94b4b'
  }
  return '#b07a00'
}

type ActivityVisual = {
  label: string
  kind: 'send' | 'receive' | 'swap' | 'approve' | 'contract' | 'self' | 'transfer'
  badgeBg: string
  badgeColor: string
  amountSign: '' | '+' | '-'
}

const getActivityVisual = (record: TransactionRecord): ActivityVisual => {
  const methodSig = (record.methodSig ?? '').toLowerCase()

  if (record.type === 'transfer') {
    if (record.direction === 'in') {
      return {
        label: '收到',
        kind: 'receive',
        badgeBg: '#e7f8ef',
        badgeColor: '#1f8f59',
        amountSign: '+'
      }
    }
    if (record.direction === 'self') {
      return {
        label: '自转',
        kind: 'self',
        badgeBg: '#eef1f5',
        badgeColor: '#4e5d6b',
        amountSign: ''
      }
    }
    if (record.direction !== 'out') {
      return {
        label: '转账',
        kind: 'transfer',
        badgeBg: '#eef1f5',
        badgeColor: '#4e5d6b',
        amountSign: ''
      }
    }
    return {
      label: '发送',
      kind: 'send',
      badgeBg: '#fce9e8',
      badgeColor: '#c64545',
      amountSign: '-'
    }
  }

  if (record.type === 'dex') {
    return {
      label: '兑换',
      kind: 'swap',
      badgeBg: '#eaf2ff',
      badgeColor: '#3464b2',
      amountSign: ''
    }
  }

  if (methodSig.includes('approve') || methodSig.startsWith('0x095ea7b3')) {
    return {
      label: '授权',
      kind: 'approve',
      badgeBg: '#f2edff',
      badgeColor: '#6c4eb7',
      amountSign: ''
    }
  }

  return {
    label: '合约',
    kind: 'contract',
    badgeBg: '#eef1f5',
    badgeColor: '#4e5d6b',
    amountSign: ''
  }
}

const applyAmountSign = (amount: string, sign: '' | '+' | '-'): string => {
  const trimmed = amount.trim()
  if (!trimmed || !sign) {
    return trimmed || '-'
  }
  if (trimmed.startsWith('+') || trimmed.startsWith('-')) {
    return trimmed
  }
  return `${sign}${trimmed}`
}

const getAmountColor = (sign: '' | '+' | '-'): string => {
  if (sign === '+') {
    return '#1f8f59'
  }
  if (sign === '-') {
    return '#c64545'
  }
  return 'var(--ink)'
}

const ActivityBadge = ({ visual }: { visual: ActivityVisual }) => {
  const commonSvg = {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: visual.badgeColor,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  }

  const icon = (() => {
    if (visual.kind === 'receive') {
      return (
        <svg {...commonSvg}>
          <path d="M8 3v8" />
          <path d="M5 8.5 8 11.5l3-3" />
        </svg>
      )
    }
    if (visual.kind === 'send') {
      return (
        <svg {...commonSvg}>
          <path d="M8 13V5" />
          <path d="M5 7.5 8 4.5l3 3" />
        </svg>
      )
    }
    if (visual.kind === 'swap') {
      return (
        <svg {...commonSvg}>
          <path d="M3 5h8" />
          <path d="m9 3 2 2-2 2" />
          <path d="M13 11H5" />
          <path d="m7 9-2 2 2 2" />
        </svg>
      )
    }
    if (visual.kind === 'approve') {
      return (
        <svg {...commonSvg}>
          <path d="m4.5 8.2 2.1 2.1L11.8 5" />
        </svg>
      )
    }
    if (visual.kind === 'self') {
      return (
        <svg {...commonSvg}>
          <path d="M5.5 5.2 3.8 7l1.7 1.8" />
          <path d="M10.5 10.8 12.2 9l-1.7-1.8" />
          <path d="M3.8 7h5.4" />
          <path d="M12.2 9H6.8" />
        </svg>
      )
    }
    if (visual.kind === 'transfer') {
      return (
        <svg {...commonSvg}>
          <path d="M3.5 8h8.5" />
          <path d="m9.5 5.5 2.5 2.5-2.5 2.5" />
        </svg>
      )
    }
    return (
      <svg {...commonSvg}>
        <path d="M5.5 5.2h-2v5.6h2" />
        <path d="M10.5 5.2h2v5.6h-2" />
      </svg>
    )
  })()

  return (
    <span
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: visual.badgeBg,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto'
      }}
    >
      {icon}
    </span>
  )
}

const TxHistoryList = ({ records }: TxHistoryListProps) => {
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const supportedRecords = useMemo(() => records.slice().sort((a, b) => b.timestamp - a.timestamp), [records])

  const selectedRecord = useMemo(
    () => supportedRecords.find((item) => item.id === selectedRecordId) ?? null,
    [supportedRecords, selectedRecordId]
  )

  const explorerUrl = selectedRecord?.hash ? getExplorerTxUrl(selectedRecord.hash) : ''
  const counterparty = selectedRecord?.to ?? selectedRecord?.contract ?? '-'
  const selectedVisual = selectedRecord ? getActivityVisual(selectedRecord) : null
  const selectedRecordTokenSymbol = selectedRecord?.tokenSymbol ?? (selectedRecord ? inferTokenSymbolFromAmount(selectedRecord.amount) : null)
  const selectedRecordAmount = selectedRecord && selectedVisual
    ? applyAmountSign(selectedRecord.amount, selectedVisual.amountSign)
    : '-'
  const counterpartyLabel = selectedRecord?.direction === 'in' ? '来自' : '发送至'
  const canCopyCounterparty =
    counterparty !== '-' && (selectedVisual?.kind === 'send' || selectedVisual?.kind === 'receive')

  useEffect(() => {
    setCopyStatus('idle')
  }, [selectedRecordId])

  const copyTextToClipboard = async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      return
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(trimmed)
      return
    }

    const textarea = document.createElement('textarea')
    textarea.value = trimmed
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }

  const handleCopyCounterparty = async () => {
    try {
      await copyTextToClipboard(counterparty)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
  }

  return (
    <section
      style={{
        background: 'var(--panel)',
        borderRadius: 16,
        padding: 16,
        border: '1px solid var(--border)',
        minWidth: 0
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>活动</div>
      {supportedRecords.length === 0 ? (
        <div
          style={{
            fontSize: 12,
            color: 'var(--muted)',
            borderRadius: 12,
            border: '1px dashed var(--border)',
            padding: 12,
            background: '#fdfcf9'
          }}
        >
          暂无交易记录。
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {supportedRecords.map((item) => {
            const isSelected = selectedRecordId === item.id
            const visual = getActivityVisual(item)
            const tokenSymbol = item.tokenSymbol ?? inferTokenSymbolFromAmount(item.amount)
            const amountText = applyAmountSign(item.amount, visual.amountSign)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedRecordId(item.id)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  textAlign: 'left',
                  borderRadius: 12,
                  padding: '10px 12px',
                  background: isSelected ? '#f3f7ff' : '#ffffff',
                  border: isSelected ? '1px solid #cfdcff' : '1px solid #e6ebf2',
                  minWidth: 0,
                  cursor: 'pointer'
                }}
              >
                <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ActivityBadge visual={visual} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{visual.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{formatRecordTime(item.timestamp)}</div>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    maxWidth: '50%',
                    textAlign: 'right',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word'
                  }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {tokenSymbol ? <TokenIcon symbol={tokenSymbol} size={14} background="#f6f8fb" /> : null}
                    <span style={{ color: getAmountColor(visual.amountSign) }}>{amountText}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selectedRecord ? (
        <div
          style={{
            marginTop: 12,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: '#fdfcf9',
            padding: 12,
            display: 'grid',
            gap: 8,
            minWidth: 0
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700 }}>交易详情</div>
          <div style={{ fontSize: 12 }}>
            <strong>类型：</strong> {selectedVisual?.label ?? '其他'}
          </div>
          <div style={{ fontSize: 12, color: getStatusColor(selectedRecord.status) }}>
            <strong>状态：</strong> {getStatusLabel(selectedRecord.status)}
          </div>
          <div style={{ fontSize: 12 }}>
            <strong>数量：</strong>{' '}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {selectedRecordTokenSymbol ? <TokenIcon symbol={selectedRecordTokenSymbol} size={14} background="#f6f8fb" /> : null}
              <span>{selectedRecordAmount}</span>
            </span>
          </div>
          <div style={{ fontSize: 12 }}>
            <strong>{counterpartyLabel}：</strong>
            <div style={{ marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--muted)',
                  fontFamily: 'monospace',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word'
                }}
              >
                {counterparty}
              </span>
              {canCopyCounterparty ? (
                <button
                  type="button"
                  onClick={() => {
                    void handleCopyCounterparty()
                  }}
                  style={{
                    borderRadius: 8,
                    border: copyStatus === 'copied' ? '1px solid #bde7d1' : copyStatus === 'failed' ? '1px solid #f0c5c5' : '1px solid var(--border)',
                    background: copyStatus === 'copied' ? '#eaf8f1' : copyStatus === 'failed' ? '#fdeeee' : '#fff',
                    color: copyStatus === 'copied' ? '#1f5e41' : copyStatus === 'failed' ? '#8b2b2b' : 'var(--ink)',
                    padding: '2px 8px',
                    fontSize: 11,
                    lineHeight: 1.6,
                    cursor: 'pointer'
                  }}
                >
                  {copyStatus === 'copied' ? '已复制' : copyStatus === 'failed' ? '复制失败' : '复制'}
                </button>
              ) : null}
            </div>
          </div>
          <div style={{ fontSize: 12 }}>
            <strong>交易：</strong>
            <div style={{ marginTop: 2 }}>
              <HashText value={selectedRecord.hash ?? '-'} mode="wrap" fontSize={11} color="var(--muted)" />
            </div>
          </div>
          {explorerUrl ? (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                width: 'fit-content',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--accent)'
              }}
            >
              在 Monad 浏览器查看
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export default TxHistoryList
