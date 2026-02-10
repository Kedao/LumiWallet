const QuickActions = () => {
  const actions = [
    { label: 'Swap', hint: 'DEX Aggregator' },
    { label: 'Send', hint: 'Transfer MON' },
    { label: 'Contracts', hint: 'Interact via DApp' }
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
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Quick Actions</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {actions.map((action) => (
          <div
            key={action.label}
            style={{
              borderRadius: 12,
              padding: 10,
              background: '#fdfcf9',
              border: '1px solid var(--border)',
              textAlign: 'center'
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 12 }}>{action.label}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
              {action.hint}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default QuickActions
