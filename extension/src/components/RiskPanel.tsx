import { SecurityRiskResponse, SlippageRiskResponse } from '../services/agentClient'

interface RiskPanelProps {
  phishingRisk?: SecurityRiskResponse | null
  slippageRisk?: SlippageRiskResponse | null
}

const normalizeRiskLevel = (
  value: SecurityRiskResponse['risk_level'] | SlippageRiskResponse['exceed_slippage_probability_label']
): 'high' | 'medium' | 'low' | 'unknown' => {
  if (value === 'high' || value === '高') {
    return 'high'
  }
  if (value === 'medium' || value === '中') {
    return 'medium'
  }
  if (value === 'low' || value === '低') {
    return 'low'
  }
  return 'unknown'
}

const RiskPanel = ({ phishingRisk = null, slippageRisk = null }: RiskPanelProps) => {
  if (!phishingRisk && !slippageRisk) {
    return null
  }

  const title = phishingRisk ? 'Phishing Risk' : 'Slippage Risk'
  const riskLabel = phishingRisk ? phishingRisk.risk_level : slippageRisk!.exceed_slippage_probability_label
  const summary = phishingRisk ? phishingRisk.summary : slippageRisk!.summary
  const normalizedLevel = normalizeRiskLevel(riskLabel)
  const palette =
    normalizedLevel === 'high'
      ? { background: '#fdeeee', border: '#f0c5c5', text: '#8b2b2b', badgeBg: '#d94b4b' }
      : normalizedLevel === 'medium'
        ? { background: '#fff5df', border: '#f1b83a', text: '#7a4b00', badgeBg: '#d38a00' }
        : normalizedLevel === 'low'
          ? { background: '#eaf8f1', border: '#bde7d1', text: '#1f5e41', badgeBg: '#2f9d69' }
          : { background: '#eef2f7', border: '#cfd8e3', text: '#344255', badgeBg: '#66758a' }

  return (
    <section
      style={{
        background: palette.background,
        borderRadius: 16,
        padding: 16,
        border: `1px solid ${palette.border}`,
        display: 'grid',
        gap: 8
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: palette.text }}>{title}</div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            background: palette.badgeBg,
            borderRadius: 999,
            padding: '2px 8px'
          }}
        >
          {String(riskLabel).toUpperCase()}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: palette.text }}>
        {summary || 'No summary returned by the risk service.'}
      </p>
    </section>
  )
}

export default RiskPanel
