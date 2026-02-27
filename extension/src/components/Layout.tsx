import { FormEvent, PropsWithChildren, useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import HashText from './HashText'
import { useWallet } from '../state/walletStore'
import { DEFAULT_EXTENSION_NETWORK } from '../config/networks'

const Layout = ({ children }: PropsWithChildren) => {
  const { account, accounts, isUnlocked, isAuthReady, switchAccount, importAccount, removeAccount } = useWallet()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [privateKey, setPrivateKey] = useState('')
  const [menuError, setMenuError] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false)
  const menuRootRef = useRef<HTMLDivElement | null>(null)
  const showTabs = isAuthReady && isUnlocked && Boolean(account)
  const activeAccountIndex = account ? accounts.findIndex((item) => item.address === account.address) + 1 : 0

  useEffect(() => {
    if (!isMenuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target || !menuRootRef.current) {
        return
      }
      if (!menuRootRef.current.contains(target)) {
        setIsMenuOpen(false)
        setIsImportOpen(false)
        setIsRemoveConfirmOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isMenuOpen])

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
          gap: 10,
          borderRadius: 16,
          padding: 10,
          background: 'var(--panel)',
          border: '1px solid var(--border)'
        }}
      >
        {isAuthReady && isUnlocked ? (
          accounts.length > 0 ? (
            <div ref={menuRootRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <button
                onClick={() => {
                  setIsMenuOpen((value) => !value)
                  setMenuError('')
                  setIsRemoveConfirmOpen(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderRadius: 13,
                  border: isMenuOpen ? '1px solid #b9d0ca' : '1px solid #d9e2ea',
                  background: isMenuOpen ? '#f2f8f6' : '#ffffff',
                  padding: '9px 11px',
                  cursor: 'pointer',
                  width: '100%',
                  justifyContent: 'space-between',
                  minWidth: 0
                }}
                aria-label="Switch account"
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: '#e9f2fb',
                      border: '1px solid #d5e3f1',
                      color: '#355f9a',
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: '0 0 auto'
                    }}
                  >
                    {activeAccountIndex > 0 ? activeAccountIndex : 'A'}
                  </span>
                  <span style={{ textAlign: 'left', minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700, lineHeight: 1.1 }}>
                      {account?.label ?? `Account ${activeAccountIndex || ''}`}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {account ? (
                        <HashText
                          value={account.address}
                          mode="compact"
                          startChars={8}
                          endChars={6}
                          fontSize={11}
                          color="var(--muted)"
                        />
                      ) : (
                        ''
                      )}
                    </span>
                  </span>
                </span>
                <span style={{ fontSize: 12, color: '#5f7388', flex: '0 0 auto' }}>{isMenuOpen ? '▲' : '▼'}</span>
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
                flex: 1,
                borderRadius: 12,
                border: '1px solid #d9e2ea',
                background: '#ffffff',
                padding: '9px 11px',
                cursor: 'default',
                textAlign: 'left',
                color: 'var(--muted)'
              }}
            >
              No Account
            </button>
          )
        ) : null}
        <span
          style={{
            display: 'grid',
            gap: 2,
            borderRadius: 10,
            border: '1px solid #d7e6f6',
            background: '#f3f8ff',
            color: '#4f6479',
            fontSize: 11,
            padding: '6px 9px',
            minWidth: 96,
            textAlign: 'left',
            alignSelf: 'stretch',
            justifyContent: 'center'
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#2f9d69',
                flex: '0 0 auto'
              }}
            />
            <span style={{ fontSize: 10, color: '#6a7f95', lineHeight: 1.1 }}>Network</span>
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#2f4d6b', lineHeight: 1.15 }}>
            {DEFAULT_EXTENSION_NETWORK.name}
          </span>
        </span>
      </header>

      {showTabs ? (
        <nav
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8
          }}
        >
          {[
            { to: '/home', label: 'Home' },
            { to: '/send', label: 'Send' },
            { to: '/swap', label: 'Swap' }
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                textDecoration: 'none',
                textAlign: 'center',
                padding: '10px 8px',
                borderRadius: 11,
                fontSize: 12,
                fontWeight: isActive ? 800 : 700,
                color: isActive ? '#ffffff' : '#38516b',
                background: isActive ? 'linear-gradient(135deg, #2f88c8, #1f8aa6)' : '#f1f5fb',
                border: isActive ? '1px solid #2a7cb4' : '1px solid #c6d4e4',
                boxShadow: isActive ? '0 6px 14px rgba(41, 124, 176, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.28)' : 'none'
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
