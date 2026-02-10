import RiskPanel from '../components/RiskPanel'

const SwapPage = () => {
  return (
    <section
      style={{
        background: 'var(--panel)',
        borderRadius: 16,
        padding: 16,
        border: '1px solid var(--border)',
        display: 'grid',
        gap: 12
      }}
    >
      <h2 style={{ margin: 0 }}>Swap Assets</h2>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>From</span>
        <input
          placeholder="MON"
          style={{ padding: 8, borderRadius: 10, border: '1px solid var(--border)' }}
        />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>To</span>
        <input
          placeholder="Test ERC20"
          style={{ padding: 8, borderRadius: 10, border: '1px solid var(--border)' }}
        />
      </label>
      <RiskPanel />
      <button
        style={{
          padding: '10px 12px',
          borderRadius: 12,
          border: 'none',
          background: 'var(--accent)',
          color: '#fff',
          fontWeight: 600,
          cursor: 'pointer'
        }}
      >
        Review & Swap
      </button>
    </section>
  )
}

export default SwapPage
