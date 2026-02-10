import { WalletConnect } from '@/components/WalletConnect'
import './App.css'

const features = [
  {
    icon: '💸',
    title: '代币转账',
    description: '支持 MON 代币转账，并提供 AI 风险预判。',
  },
  {
    icon: '📝',
    title: '合约交互',
    description: '合约调用前自动分析授权和潜在危险操作。',
  },
  {
    icon: '🔄',
    title: 'DEX 交易',
    description: '聚合路由报价并在交易前执行安全检查。',
  },
]

const progress = [
  { done: true, label: 'MetaMask 钱包连接' },
  { done: false, label: '代币转账功能' },
  { done: false, label: '合约交互功能' },
  { done: false, label: 'DEX 交易功能' },
  { done: false, label: 'AI 风险分析集成' },
]

function App() {
  return (
    <div className="app-shell">
      <div className="app-orb app-orb-left" aria-hidden />
      <div className="app-orb app-orb-right" aria-hidden />

      <header className="app-header">
        <div className="content-wrap header-row">
          <div className="brand-block">
            <div className="brand-logo" aria-hidden>
              <span>🔐</span>
            </div>
            <div>
              <p className="brand-kicker">WalletLab Security Suite</p>
              <h1 className="brand-title">LumiWallet DApp</h1>
              <p className="brand-subtitle">测试场景 DApp · 智能钱包安全实验台</p>
            </div>
          </div>

          <div className="header-actions">
            <div className="release-badge">
              <span className="release-dot" />
              Testnet Preview
            </div>
            <div className="wallet-connect-wrap">
              <WalletConnect />
            </div>
          </div>
        </div>
      </header>

      <main className="content-wrap app-main">
        <section className="hero-card">
          <div className="hero-intro">
            <p className="eyebrow">Risk-Aware Wallet Experience</p>
            <h2>欢迎使用 LumiWallet 测试 DApp</h2>
            <p className="hero-copy">
              这是一个用于验证 LumiWallet 智能钱包能力的前端应用。当前版本已支持钱包连接，后续会逐步开放资产转账、合约调用与 DEX
              交易流程。
            </p>
          </div>

          <div className="feature-grid">
            {features.map((feature) => (
              <article key={feature.title} className="feature-card">
                <div className="feature-icon" aria-hidden>
                  {feature.icon}
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>

          <section className="progress-panel">
            <div className="panel-head">
              <p className="panel-title">开发进度</p>
              <span className="panel-tag">Milestone A</span>
            </div>
            <ul className="progress-list">
              {progress.map((item) => (
                <li key={item.label} className={item.done ? 'status-done' : 'status-pending'}>
                  <span className="status-mark">{item.done ? '✓' : '○'}</span>
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </section>
        </section>
      </main>

      <footer className="app-footer">
        <div className="content-wrap footer-row">
          <p>WalletLab · Building safer blockchain experiences</p>
          <p>Mon, Ethereum-compatible, Security-first</p>
        </div>
      </footer>
    </div>
  )
}

export default App
