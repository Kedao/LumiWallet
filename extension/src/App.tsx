import { Route, Routes, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import SendPage from './pages/SendPage'
import SwapPage from './pages/SwapPage'
import ActivityPage from './pages/ActivityPage'
import TxResultPage from './pages/TxResultPage'

const App = () => {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/send" element={<SendPage />} />
        <Route path="/swap" element={<SwapPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/tx/result" element={<TxResultPage />} />
      </Routes>
    </Layout>
  )
}

export default App
