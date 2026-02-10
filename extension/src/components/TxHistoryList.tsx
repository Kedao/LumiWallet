const TxHistoryList = () => {
  const placeholder = [
    { id: '1', title: 'Send', detail: '0.00 MON', time: 'Just now' },
    { id: '2', title: 'Swap', detail: '0.00 MON', time: '2 min ago' },
    { id: '3', title: 'Contract', detail: '0.00 MON', time: '1 hour ago' }
  ]

  return (
    <section
      style={{
        background: 'var(--panel)',
        borderRadius: 16,
        padding: 16,
        border: '1px solid var(--border)'
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Activity</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {placeholder.map((item) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderRadius: 12,
              padding: 10,
              background: '#fdfcf9',
              border: '1px solid var(--border)'
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 12 }}>{item.title}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{item.time}</div>
            </div>
            <div style={{ fontSize: 12 }}>{item.detail}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default TxHistoryList
