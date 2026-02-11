import { FormEvent, PropsWithChildren, useState } from 'react'
import { NavLink } from 'react-router-dom'
import HashText from './HashText'
import { useWallet } from '../state/walletStore'

const Layout = ({ children }: PropsWithChildren) => {
  const { account, accounts, isUnlocked, isAuthReady, switchAccount, importAccount, removeAccount } = useWallet()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [privateKey, setPrivateKey] = useState('')
  const [menuError, setMenuError] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false)

  const handleSwitchAccount = async (address: string) => {
    setMenuError('')
    try {
      await switchAccount(address)
      setIsMenuOpen(false)
      setIsImportOpen(false)
      setIsRemoveConfirmOpen(false)
    } catch (error) {
      if (error instanceof Error) {
        setMenuError(error.message)
      } else {
        setMenuError('Failed to switch account.')
      }
    }
  }

  const handleImportAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMenuError('')
    setIsImporting(true)
    try {
      await importAccount(privateKey)
      setPrivateKey('')
      setIsImportOpen(false)
      setIsRemoveConfirmOpen(false)
    } catch (error) {
      if (error instanceof Error) {
        setMenuError(error.message)
      } else {
        setMenuError('Failed to import account.')
      }
    } finally {
      setIsImporting(false)
    }
  }

  const handleRemoveCurrentAccount = async () => {
    if (!account) {
      return
    }
    setMenuError('')
    setIsRemoving(true)
    try {
      await removeAccount(account.address)
      setIsMenuOpen(false)
      setIsImportOpen(false)
      setIsRemoveConfirmOpen(false)
    } catch (error) {
      if (error instanceof Error) {
        setMenuError(error.message)
      } else {
        setMenuError('Failed to remove account.')
      }
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, boxSizing: 'border-box' }}>
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
        {isAuthReady && isUnlocked ? (
          accounts.length > 0 ? (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => {
                  setIsMenuOpen((value) => !value)
                  setMenuError('')
                  setIsRemoveConfirmOpen(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: '#fdfcf9',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  minWidth: 180,
                  justifyContent: 'space-between'
                }}
              >
                <span style={{ textAlign: 'left' }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, lineHeight: 1.1 }}>
                    {account?.label ?? 'Account'}
                  </span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {account ? (
                      <HashText
                        value={account.address}
                        mode="compact"
                        startChars={6}
                        endChars={4}
                        fontSize={11}
                        color="var(--muted)"
                      />
                    ) : (
                      ''
                    )}
                  </span>
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{isMenuOpen ? '▲' : '▼'}</span>
              </button>

              {isMenuOpen ? (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    width: 280,
                    background: 'var(--panel)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    padding: 10,
                    boxShadow: '0 12px 24px rgba(0, 0, 0, 0.08)',
                    display: 'grid',
                    gap: 10,
                    zIndex: 10
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>Accounts</div>
                  <div style={{ display: 'grid', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                    {accounts.map((item) => {
                      const isActive = account?.address === item.address
                      return (
                        <button
                          key={item.address}
                          onClick={() => {
                            void handleSwitchAccount(item.address)
                          }}
                          style={{
                            border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                            borderRadius: 10,
                            background: isActive ? '#effaf7' : '#fdfcf9',
                            padding: '8px 10px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <span>
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>
                              {item.label ?? 'Account'}
                            </span>
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>
                              <HashText
                                value={item.address}
                                mode="compact"
                                startChars={6}
                                endChars={4}
                                fontSize={11}
                                color="var(--muted)"
                              />
                            </span>
                          </span>
                          {isActive ? (
                            <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>Selected</span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'grid', gap: 8 }}>
                    <button
                      onClick={() => {
                        setIsImportOpen((value) => {
                          const next = !value
                          if (next) {
                            setIsRemoveConfirmOpen(false)
                          }
                          return next
                        })
                        setMenuError('')
                      }}
                      style={{
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: '#fdfcf9',
                        padding: '8px 10px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        textAlign: 'left'
                      }}
                    >
                      {isImportOpen ? 'Cancel Import' : 'Import New Account'}
                    </button>

                    {!isImportOpen ? (
                      isRemoveConfirmOpen ? (
                        <div
                          style={{
                            borderRadius: 10,
                            border: '1px solid #f0c5c5',
                            background: '#fff5f5',
                            padding: 10,
                            display: 'grid',
                            gap: 8
                          }}
                        >
                          <div style={{ fontSize: 12, color: '#8b2b2b' }}>
                            此账户将从 Lumi 去除，请确保您拥有该账户的私钥。
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={() => {
                                setIsRemoveConfirmOpen(false)
                              }}
                              style={{
                                flex: 1,
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: '#ffffff',
                                padding: '7px 8px',
                                cursor: 'pointer',
                                fontWeight: 600
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => {
                                void handleRemoveCurrentAccount()
                              }}
                              disabled={!account || isRemoving}
                              style={{
                                flex: 1,
                                borderRadius: 8,
                                border: '1px solid #f0c5c5',
                                background: '#fdeeee',
                                color: '#8b2b2b',
                                padding: '7px 8px',
                                cursor: !account || isRemoving ? 'not-allowed' : 'pointer',
                                fontWeight: 600,
                                opacity: !account || isRemoving ? 0.7 : 1
                              }}
                            >
                              {isRemoving ? 'Removing...' : 'Confirm Remove'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setMenuError('')
                            setIsRemoveConfirmOpen(true)
                          }}
                          disabled={!account}
                          style={{
                            borderRadius: 10,
                            border: '1px solid #f0c5c5',
                            background: '#fdeeee',
                            color: '#8b2b2b',
                            padding: '8px 10px',
                            cursor: !account ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            textAlign: 'left',
                            opacity: !account ? 0.7 : 1
                          }}
                        >
                          Remove Current Account
                        </button>
                      )
                    ) : null}

                    {isImportOpen ? (
                      <form onSubmit={handleImportAccount} style={{ display: 'grid', gap: 8 }}>
                        <input
                          type="password"
                          value={privateKey}
                          onChange={(event) => setPrivateKey(event.target.value)}
                          placeholder="Private key (0x...)"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          data-lpignore="true"
                          data-1p-ignore="true"
                          style={{
                            borderRadius: 10,
                            border: '1px solid var(--border)',
                            padding: '8px 10px'
                          }}
                        />
                        <button
                          type="submit"
                          disabled={isImporting}
                          style={{
                            borderRadius: 10,
                            border: 'none',
                            background: 'var(--accent)',
                            color: '#fff',
                            padding: '8px 10px',
                            cursor: isImporting ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            opacity: isImporting ? 0.8 : 1
                          }}
                        >
                          {isImporting ? 'Importing...' : 'Confirm Import'}
                        </button>
                      </form>
                    ) : null}

                    {menuError ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: '#8b2b2b',
                          background: '#fdeeee',
                          border: '1px solid #f0c5c5',
                          padding: '8px 10px',
                          borderRadius: 10
                        }}
                      >
                        {menuError}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <button
              style={{
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: '#fdfcf9',
                padding: '6px 12px',
                cursor: 'default'
              }}
            >
              No Account
            </button>
          )
        ) : null}
      </header>

      {isAuthReady && isUnlocked && Boolean(account) ? (
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
      ) : null}

      <main style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>{children}</main>
    </div>
  )
}

export default Layout
