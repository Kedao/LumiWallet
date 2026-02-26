type RiskLanguage = 'zh' | 'en'

type RiskLevelLabel = 'high' | 'medium' | 'low' | 'unknown' | '高' | '中' | '低' | '未知'

export interface TagInfo {
  source: string
  label: string
  confidence?: number
  url?: string
}

export interface LifecycleInfo {
  first_seen_timestamp?: number
  last_seen_timestamp?: number
  active_days?: number
  account_age_days?: number
  gas_funder?: string
}

export interface AccountTransaction {
  tx_hash: string
  timestamp: number
  from_address: string
  to_address?: string | null
  value?: string | null
  token_address?: string | null
  token_decimals?: number | null
  tx_type?: string | null
  contract_address?: string | null
  method_sig?: string | null
  success?: boolean | null
}

export interface PhishingRiskRequest {
  address: string
  chain?: string
  lang?: RiskLanguage
  interaction_type?: 'transfer' | 'approve' | 'contract_call' | null
  transactions?: AccountTransaction[]
  lifecycle?: LifecycleInfo
  tags?: TagInfo[]
  extra_features?: Record<string, unknown>
}

export interface ContractCodeInfo {
  verified: boolean
  source_code?: string | null
  bytecode?: string | null
  compiler_version?: string | null
  abi?: string | null
}

export interface ContractPermissions {
  owner?: string | null
  admin?: string | null
  can_upgrade?: boolean | null
  can_pause?: boolean | null
  can_blacklist?: boolean | null
  can_mint?: boolean | null
  can_burn?: boolean | null
}

export interface ContractProxyInfo {
  is_proxy?: boolean | null
  implementation_address?: string | null
  admin_address?: string | null
}

export interface ContractCreatorInfo {
  creator_address?: string | null
  creation_tx_hash?: string | null
  creation_timestamp?: number | null
}

export interface TokenBehaviorFlags {
  has_transfer_tax?: boolean | null
  tax_changeable?: boolean | null
  max_tx_limit?: boolean | null
  max_wallet_limit?: boolean | null
  trading_restrictions?: boolean | null
}

export interface ContractRiskRequest {
  contract_address: string
  chain?: string
  lang?: RiskLanguage
  interaction_type?: 'approve' | 'swap' | 'mint' | 'stake' | 'contract_call' | null
  creator?: ContractCreatorInfo
  proxy?: ContractProxyInfo
  permissions?: ContractPermissions
  token_flags?: TokenBehaviorFlags
  code?: ContractCodeInfo
  tags?: TagInfo[]
  extra_features?: Record<string, unknown>
}

export interface OrderBookLevel {
  price: string
  amount: string
}

export interface OrderBookStats {
  bids?: OrderBookLevel[]
  asks?: OrderBookLevel[]
  spread_bps?: number | null
}

export interface PoolStats {
  liquidity?: number | null
  volume_5m?: number | null
  volume_1h?: number | null
  price_impact_pct?: number | null
}

export interface SlippageRiskRequest {
  pool_address: string
  chain?: string
  lang?: RiskLanguage
  token_in: string
  token_out: string
  amount_in: string
  time_window?: string
  trade_type?: string
  interaction_type?: 'swap' | null
  orderbook?: OrderBookStats
  pool?: PoolStats
  extra_features?: Record<string, unknown>
}

export interface RiskReason {
  reason: string
  explanation: string
}

export interface SecurityRiskResponse {
  risk_level: RiskLevelLabel
  summary: string
  confidence: number
  top_reasons: RiskReason[]
}

export interface SlippageFactor {
  factor: string
  explanation: string
}

export interface SlippageRiskResponse {
  expected_slippage_pct: number
  exceed_slippage_probability_label: RiskLevelLabel
  summary: string
  key_factors: SlippageFactor[]
  market_context: Record<string, unknown>
}

interface AgentApiErrorPayload {
  detail?: string | { msg?: string } | Array<{ msg?: string }>
}

const DEFAULT_AGENT_SERVER_URL = 'http://127.0.0.1:8000'
const AGENT_SERVER_URL = String(import.meta.env.VITE_AGENT_SERVER_URL ?? DEFAULT_AGENT_SERVER_URL)
  .trim()
  .replace(/\/+$/, '')

const buildAgentUrl = (path: string) => `${AGENT_SERVER_URL}${path}`

const readErrorMessage = async (response: Response): Promise<string> => {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const payload = (await response.json().catch(() => null)) as AgentApiErrorPayload | null
    if (typeof payload?.detail === 'string' && payload.detail.trim()) {
      return payload.detail.trim()
    }
    if (Array.isArray(payload?.detail)) {
      const firstMsg = payload.detail.find((item) => typeof item?.msg === 'string')?.msg
      if (typeof firstMsg === 'string' && firstMsg.trim()) {
        return firstMsg.trim()
      }
    }
    const detailObject = payload?.detail
    if (
      detailObject &&
      !Array.isArray(detailObject) &&
      typeof detailObject === 'object' &&
      typeof detailObject.msg === 'string' &&
      detailObject.msg.trim()
    ) {
      return detailObject.msg.trim()
    }
  }

  const text = (await response.text().catch(() => '')).trim()
  return text || `HTTP ${response.status}`
}

const postJson = async <TRequest, TResponse>(path: string, payload: TRequest): Promise<TResponse> => {
  const response = await fetch(buildAgentUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    throw new Error(`Agent API request failed (${path}): ${await readErrorMessage(response)}`)
  }

  return (await response.json()) as TResponse
}

export const analyzePhishingRisk = (payload: PhishingRiskRequest) =>
  postJson<PhishingRiskRequest, SecurityRiskResponse>('/risk/phishing', payload)

export const analyzeContractRisk = (payload: ContractRiskRequest) =>
  postJson<ContractRiskRequest, SecurityRiskResponse>('/risk/contract', payload)

export const analyzeSlippageRisk = (payload: SlippageRiskRequest) =>
  postJson<SlippageRiskRequest, SlippageRiskResponse>('/risk/slippage', payload)
