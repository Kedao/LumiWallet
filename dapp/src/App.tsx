import { useWallet } from '@/hooks/useWallet'
import { WalletConnect } from '@/components/WalletConnect'
import { ApproveRequestCard } from '@/components/ApproveRequestCard'
import { GlobalDialogHost } from '@/components/ui/GlobalDialogHost'
import './App.css'

const features = [
  {
    icon: '💸',
    title: '代币安全',
    description: '转账前识别高风险地址、异常代币与可疑授权，并实时提醒关键风险。',
  },
  {
    icon: '📝',
    title: '合约防护',
    description: '调用前解析方法与权限范围，重点提示钓鱼合约、无限授权等高危行为。',
  },
  {
    icon: '🔄',
    title: 'DEX 风险预警',
    description: '交易前检测滑点异常、路径风险与价格波动，触发风险提醒后再确认提交。',
  },
]

function App() {
  const wallet = useWallet()

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
              <h1 className="brand-title">灵光钱包 DApp</h1>
              <p className="brand-subtitle">测试场景 DApp · 智能钱包安全实验台</p>
            </div>
          </div>

          <div className="header-actions">
            <div className="release-badge">
              <span className="release-dot" />
              Testnet Preview
            </div>
            <div className="wallet-connect-wrap">
              <WalletConnect wallet={wallet} />
            </div>
          </div>
        </div>
      </header>

      <main className="content-wrap app-main">
        <section className="hero-card">
          <div className="hero-intro">
            <p className="eyebrow">Risk-Aware Wallet Experience</p>
            <h2>欢迎使用灵光钱包测试 DApp</h2>
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

          <ApproveRequestCard wallet={wallet} />
        </section>
      </main>

      <footer className="app-footer">
        <div className="content-wrap footer-row">
          <p>WalletLab · Building safer blockchain experiences</p>
          <p>Mon, Ethereum-compatible, Security-first</p>
        </div>
      </footer>

      <GlobalDialogHost />
    </div>
  )
}

export default App
