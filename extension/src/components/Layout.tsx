import { PropsWithChildren } from 'react'
import { NavLink } from 'react-router-dom'

const Layout = ({ children }: PropsWithChildren) => {
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: 16,
          padding: '12px 16px',
          background: 'var(--panel)',
          border: '1px solid var(--border)'
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>LumiWallet</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Monad Testnet</div>
        </div>
        <button
          style={{
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: '#fdfcf9',
            padding: '6px 12px',
            cursor: 'pointer'
          }}
        >
          Account
        </button>
      </header>

      <nav
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8
        }}
      >
        {[
          { to: '/home', label: 'Home' },
          { to: '/send', label: 'Send' },
          { to: '/swap', label: 'Swap' },
          { to: '/activity', label: 'Activity' }
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              textDecoration: 'none',
              textAlign: 'center',
              padding: '10px 8px',
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 600,
              color: isActive ? '#ffffff' : 'var(--ink)',
              background: isActive ? 'var(--accent)' : 'var(--panel)',
              border: '1px solid var(--border)'
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</main>
    </div>
  )
}

export default Layout
