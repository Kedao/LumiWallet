const RiskPanel = () => {
  return (
    <section
      style={{
        background: '#fff5df',
        borderRadius: 16,
        padding: 16,
        border: '1px solid #f1b83a'
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: '#7a4b00' }}>Risk Preview</div>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#7a4b00' }}>
        Risk analysis from the agent will appear here during transactions.
      </p>
      <ul style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 12, color: '#7a4b00' }}>
        <li>Phishing address detection</li>
        <li>Contract risk analysis</li>
        <li>DEX slippage explanation</li>
      </ul>
    </section>
  )
}

export default RiskPanel
