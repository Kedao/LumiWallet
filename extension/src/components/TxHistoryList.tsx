import { useMemo, useState } from 'react'
import { TransactionRecord } from '../types/models'
import { getExplorerTxUrl } from '../services/walletClient'
import HashText from './HashText'

interface TxHistoryListProps {
  records: TransactionRecord[]
}

const formatRecordTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })

const getTypeLabel = (type: TransactionRecord['type']): string => {
  if (type === 'transfer') {
    return 'Send'
  }
  if (type === 'dex') {
    return 'Swap'
  }
  return 'Other'
}

const TxHistoryList = ({ records }: TxHistoryListProps) => {
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const supportedRecords = useMemo(
    () =>
      records
        .filter((item) => item.type === 'transfer' || item.type === 'dex')
        .sort((a, b) => b.timestamp - a.timestamp),
    [records]
  )

  const selectedRecord = useMemo(
    () => supportedRecords.find((item) => item.id === selectedRecordId) ?? null,
    [supportedRecords, selectedRecordId]
  )

  const explorerUrl = selectedRecord?.hash ? getExplorerTxUrl(selectedRecord.hash) : ''
  const counterparty = selectedRecord?.to ?? selectedRecord?.contract ?? '-'

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
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Activity</div>
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
          No activity yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {supportedRecords.map((item) => {
            const isSelected = selectedRecordId === item.id
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
                  padding: 10,
                  background: isSelected ? '#effaf7' : '#fdfcf9',
                  border: isSelected ? '1px solid #9ad7bd' : '1px solid var(--border)',
                  minWidth: 0,
                  cursor: 'pointer'
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{getTypeLabel(item.type)}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{formatRecordTime(item.timestamp)}</div>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    maxWidth: '50%',
                    textAlign: 'right',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word'
                  }}
                >
                  {item.amount}
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
          <div style={{ fontSize: 12, fontWeight: 700 }}>Transaction Details</div>
          <div style={{ fontSize: 12 }}>
            <strong>Type:</strong> {getTypeLabel(selectedRecord.type)}
          </div>
          <div style={{ fontSize: 12 }}>
            <strong>Counterparty:</strong>
            <div style={{ marginTop: 2 }}>
              <HashText value={counterparty} mode="wrap" fontSize={11} color="var(--muted)" />
            </div>
          </div>
          <div style={{ fontSize: 12 }}>
            <strong>Tx:</strong>
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
              View on Monad Explorer
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export default TxHistoryList
