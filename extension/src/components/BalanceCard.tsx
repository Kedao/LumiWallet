import { useWallet } from '../state/walletStore'

const BalanceCard = () => {
  const { balance } = useWallet()
  const assets = balance?.assets ?? []
  const visibleAssets = assets.filter((asset) => {
    const amount = Number(asset.amount)
    if (!Number.isFinite(amount)) {
      return true
    }
    return amount > 0
  })

  const formatDisplayAmount = (amount: string): string => {
    const value = Number(amount)
    if (!Number.isFinite(value)) {
      return amount
    }
    if (value === 0) {
      return '0'
    }
    if (Math.abs(value) < 0.000001) {
      return '<0.000001'
    }
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6
    })
  }

  if (visibleAssets.length === 0) {
    return null
  }

  return (
    <section
      style={{
        background: 'var(--panel)',
        borderRadius: 16,
        border: '1px solid var(--border)',
        padding: 16,
        display: 'grid',
        gap: 12
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Assets</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Monad Testnet</div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {visibleAssets.map((asset) => (
          <div
            key={`${asset.symbol}-${asset.contractAddress ?? 'native'}`}
            style={{
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: '#ffffff',
              padding: '10px 12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: asset.isNative ? '#e8f5f2' : '#f3efe8',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--ink)'
                }}
              >
                {asset.symbol.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{asset.symbol}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {asset.isNative ? 'Native token' : 'ERC20 token'}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{formatDisplayAmount(asset.amount)}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default BalanceCard
