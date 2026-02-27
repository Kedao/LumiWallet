import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { WalletProvider } from './state/walletStore'
import './styles/base.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('未找到根容器。')
}

createRoot(container).render(
  <React.StrictMode>
    <WalletProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </WalletProvider>
  </React.StrictMode>
)
