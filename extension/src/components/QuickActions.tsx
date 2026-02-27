const QuickActions = () => {
  const actions = [
    { label: '兑换', hint: 'DEX 聚合' },
    { label: '发送', hint: '转账 MON' },
    { label: '合约', hint: '通过 DApp 交互' }
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
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>快捷操作</div>
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
