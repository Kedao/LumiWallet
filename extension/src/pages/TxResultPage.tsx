import HashText from '../components/HashText'

const TxResultPage = () => {
  return (
    <section
      style={{
        background: 'var(--panel)',
        borderRadius: 16,
        padding: 16,
        border: '1px solid var(--border)',
        display: 'grid',
        gap: 8,
        minWidth: 0
      }}
    >
      <h2 style={{ margin: 0 }}>交易结果</h2>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>状态：待确认</div>
      <div style={{ fontSize: 12 }}>
        交易哈希：<HashText value="0x..." mode="wrap" fontSize={12} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        交易失败时会在此显示错误与提示。
      </div>
    </section>
  )
}

export default TxResultPage
