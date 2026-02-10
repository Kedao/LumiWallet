const BalanceCard = () => {
  return (
    <section
      style={{
        background: 'linear-gradient(135deg, #0f3d35, #1f7a6b)',
        color: '#fff',
        borderRadius: 16,
        padding: 16
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.8 }}>Total Balance</div>
      <div style={{ fontSize: 28, fontWeight: 600, marginTop: 8 }}>0.00 MON</div>
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>Monad Testnet</div>
    </section>
  )
}

export default BalanceCard
