const TxResultPage = () => {
  return (
    <section
      style={{
        background: 'var(--panel)',
        borderRadius: 16,
        padding: 16,
        border: '1px solid var(--border)',
        display: 'grid',
        gap: 8
      }}
    >
      <h2 style={{ margin: 0 }}>Transaction Result</h2>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Status: Pending</div>
      <div style={{ fontSize: 12 }}>Tx Hash: 0x...</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        Errors and tips will show here when a transaction fails.
      </div>
    </section>
  )
}

export default TxResultPage
