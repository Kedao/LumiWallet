import { Route, Routes, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import SendPage from './pages/SendPage'
import SwapPage from './pages/SwapPage'
import TxResultPage from './pages/TxResultPage'
import { useWallet } from './state/walletStore'

const App = () => {
  const { isAuthReady, isUnlocked, account } = useWallet()
  const hasActiveAccount = Boolean(account)

  if (!isAuthReady) {
    return (
      <Layout>
        <section
          style={{
            background: 'var(--panel)',
            borderRadius: 16,
            padding: 16,
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            fontSize: 14
          }}
        >
          Loading wallet...
        </section>
      </Layout>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route
          path="/"
          element={<Navigate to={isUnlocked ? '/home' : '/login'} replace />}
        />
        <Route
          path="/login"
          element={isUnlocked ? <Navigate to="/home" replace /> : <LoginPage />}
        />
        <Route
          path="/home"
          element={isUnlocked ? <HomePage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/send"
          element={isUnlocked && hasActiveAccount ? <SendPage /> : <Navigate to={isUnlocked ? '/home' : '/login'} replace />}
        />
        <Route
          path="/swap"
          element={isUnlocked && hasActiveAccount ? <SwapPage /> : <Navigate to={isUnlocked ? '/home' : '/login'} replace />}
        />
        <Route
          path="/tx/result"
          element={isUnlocked && hasActiveAccount ? <TxResultPage /> : <Navigate to={isUnlocked ? '/home' : '/login'} replace />}
        />
        <Route
          path="*"
          element={<Navigate to={isUnlocked ? '/home' : '/login'} replace />}
        />
      </Routes>
    </Layout>
  )
}

export default App
