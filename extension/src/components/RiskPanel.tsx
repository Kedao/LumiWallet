import { SecurityRiskResponse } from '../services/agentClient'

interface RiskPanelProps {
  phishingRisk?: SecurityRiskResponse | null
}

const normalizeRiskLevel = (value: SecurityRiskResponse['risk_level']): 'high' | 'medium' | 'low' | 'unknown' => {
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

const RiskPanel = ({ phishingRisk = null }: RiskPanelProps) => {
  if (!phishingRisk) {
    return null
  }

  const normalizedLevel = normalizeRiskLevel(phishingRisk.risk_level)
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
        <div style={{ fontSize: 12, fontWeight: 700, color: palette.text }}>Phishing Risk</div>
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
          {String(phishingRisk.risk_level).toUpperCase()}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: palette.text }}>
        {phishingRisk.summary || 'No summary returned by the risk service.'}
      </p>
    </section>
  )
}

export default RiskPanel
