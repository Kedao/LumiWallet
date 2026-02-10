const LoginPage = () => {
  return (
    <section
      style={{
        background: 'var(--panel)',
        borderRadius: 16,
        padding: 16,
        border: '1px solid var(--border)'
      }}
    >
      <h2 style={{ margin: 0 }}>Welcome Back</h2>
      <p style={{ color: 'var(--muted)', marginTop: 4 }}>
        Import mnemonic or unlock with password.
      </p>
      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Mnemonic</span>
          <textarea
            placeholder="Enter mnemonic phrase"
            rows={3}
            style={{ resize: 'none', padding: 8, borderRadius: 10, border: '1px solid var(--border)' }}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Password</span>
          <input
            type="password"
            placeholder="Enter password"
            style={{ padding: 8, borderRadius: 10, border: '1px solid var(--border)' }}
          />
        </label>
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
          Unlock Wallet
        </button>
      </div>
    </section>
  )
}

export default LoginPage
