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
  // Legacy compatibility fields currently ignored by backend model.
  interaction_type?: 'transfer' | 'approve' | 'contract_call' | null
  transactions?: AccountTransaction[]
  lifecycle?: LifecycleInfo
  tags?: TagInfo[]
  extra_features?: Record<string, unknown>
}

export interface PhishingRiskResponse {
  risk_level: RiskLevelLabel
  summary: string
  confidence: number
  most_similar_address?: string | null
  most_similar_similarity?: number
  most_similar_transactions?: AccountTransaction[]
  similarity_method?: string
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

export interface SlippagePoolStats extends PoolStats {
  token_pay_amount?: string | null
  token_get_amount?: string | null
  type?: string | null
}

export interface SlippageRiskRequest {
  pool_address: string
  chain?: string
  lang?: RiskLanguage
  token_in?: string
  token_out?: string
  amount_in?: string
  token_pay_amount?: string
  time_window?: string
  trade_type?: string
  interaction_type?: 'swap' | string | null
  orderbook?: OrderBookStats
  pool?: SlippagePoolStats
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
  top_reasons?: RiskReason[]
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
  slippage_level?: RiskLevelLabel
}

export type PhishingRiskInput = Omit<PhishingRiskRequest, 'lang'>
export type ContractRiskInput = Omit<ContractRiskRequest, 'lang'>
export type SlippageRiskInput = Omit<SlippageRiskRequest, 'lang'>

interface AgentApiErrorPayload {
  detail?: string | { msg?: string } | Array<{ msg?: string }>
}

interface ApiPhishingRiskRequest {
  address: string
  chain?: string
  lang?: RiskLanguage
  transactions?: AccountTransaction[]
}

interface ApiContractRiskRequest {
  contract_address: string
  chain?: string
  lang?: RiskLanguage
  interaction_type?: string | null
  creator?: ContractCreatorInfo
  proxy?: ContractProxyInfo
  permissions?: ContractPermissions
  token_flags?: TokenBehaviorFlags
  code?: ContractCodeInfo
  tags?: TagInfo[]
  extra_features?: Record<string, unknown>
}

interface ApiSlippagePoolStats {
  price_impact_pct?: number | null
  token_pay_amount?: string | null
  token_get_amount?: string | null
  type?: string | null
}

interface ApiSlippageRiskRequest {
  pool_address: string
  chain?: string
  lang?: RiskLanguage
  token_pay_amount: string
  interaction_type?: string | null
  pool?: ApiSlippagePoolStats
}

interface ApiSlippageRiskResponse {
  slippage_level?: RiskLevelLabel
  summary?: string
  expected_slippage_pct?: number
  exceed_slippage_probability_label?: RiskLevelLabel
  key_factors?: SlippageFactor[]
  market_context?: Record<string, unknown>
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
    throw new Error(`Agent API 请求失败 (${path})：${await readErrorMessage(response)}`)
  }

  return (await response.json()) as TResponse
}

const toApiPhishingRequest = (payload: PhishingRiskInput): ApiPhishingRiskRequest => ({
  address: payload.address,
  chain: payload.chain,
  transactions: payload.transactions
})

const toApiContractRequest = (payload: ContractRiskInput): ApiContractRiskRequest => ({
  contract_address: payload.contract_address,
  chain: payload.chain,
  interaction_type: payload.interaction_type,
  creator: payload.creator,
  proxy: payload.proxy,
  permissions: payload.permissions,
  token_flags: payload.token_flags,
  code: payload.code,
  tags: payload.tags,
  extra_features: payload.extra_features
})

const toApiSlippageRequest = (payload: SlippageRiskInput): ApiSlippageRiskRequest => {
  const tokenPayAmount = typeof payload.token_pay_amount === 'string'
    ? payload.token_pay_amount.trim()
    : typeof payload.amount_in === 'string'
      ? payload.amount_in.trim()
      : ''
  if (!tokenPayAmount) {
    throw new Error('/risk/slippage 需要 token_pay_amount。')
  }

  const pool = payload.pool
    ? ({
      price_impact_pct: payload.pool.price_impact_pct ?? null,
      token_pay_amount: payload.pool.token_pay_amount ?? null,
      token_get_amount: payload.pool.token_get_amount ?? null,
      type: payload.pool.type ?? 'AMM'
    } satisfies ApiSlippagePoolStats)
    : undefined

  return {
    pool_address: payload.pool_address,
    chain: payload.chain,
    token_pay_amount: tokenPayAmount,
    interaction_type: payload.interaction_type,
    pool
  }
}

const toSlippageRiskResponse = (
  response: ApiSlippageRiskResponse,
  request: ApiSlippageRiskRequest
): SlippageRiskResponse => {
  const level = response.exceed_slippage_probability_label ?? response.slippage_level ?? 'unknown'
  const summary = typeof response.summary === 'string' && response.summary.trim()
    ? response.summary
    : '风险服务未返回摘要。'
  const expectedSlippage =
    typeof response.expected_slippage_pct === 'number'
      ? response.expected_slippage_pct
      : typeof request.pool?.price_impact_pct === 'number'
        ? request.pool.price_impact_pct
        : 0
  const keyFactors = Array.isArray(response.key_factors) ? response.key_factors : []
  const marketContext = response.market_context ?? {}

  return {
    expected_slippage_pct: expectedSlippage,
    exceed_slippage_probability_label: level,
    summary,
    key_factors: keyFactors,
    market_context: marketContext,
    slippage_level: response.slippage_level ?? level
  }
}

export const analyzePhishingRisk = async (payload: PhishingRiskInput): Promise<PhishingRiskResponse> =>
  postJson<ApiPhishingRiskRequest, PhishingRiskResponse>(
    '/risk/phishing',
    toApiPhishingRequest(payload)
  )

export const analyzeContractRisk = (payload: ContractRiskInput) =>
  postJson<ApiContractRiskRequest, SecurityRiskResponse>(
    '/risk/contract',
    toApiContractRequest(payload)
  )

export const analyzeSlippageRisk = async (payload: SlippageRiskInput): Promise<SlippageRiskResponse> => {
  const request = toApiSlippageRequest(payload)
  const response = await postJson<ApiSlippageRiskRequest, ApiSlippageRiskResponse>(
    '/risk/slippage',
    request
  )
  return toSlippageRiskResponse(response, request)
}
