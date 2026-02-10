import BalanceCard from '../components/BalanceCard'
import QuickActions from '../components/QuickActions'
import TxHistoryList from '../components/TxHistoryList'
import RiskPanel from '../components/RiskPanel'

const HomePage = () => {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <BalanceCard />
      <QuickActions />
      <RiskPanel />
      <TxHistoryList />
    </div>
  )
}

export default HomePage
