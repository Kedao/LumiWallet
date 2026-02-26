import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Contract, getAddress, JsonRpcProvider } from 'ethers'
import {
  analyzeContractRisk,
  ContractCodeInfo,
  ContractCreatorInfo,
  ContractPermissions,
  ContractProxyInfo,
  ContractRiskInput,
  SecurityRiskResponse,
  TokenBehaviorFlags
} from '../services/agentClient'
import { DEFAULT_EXTENSION_NETWORK } from '../config/networks'
import '../styles/base.css'

const APPROVAL_GET_REQUEST = 'LUMI_APPROVAL_GET_REQUEST'
const APPROVAL_DECIDE_REQUEST = 'LUMI_APPROVAL_DECIDE_REQUEST'

interface JsonRpcErrorPayload {
  code: number
  message: string
}

interface ApprovalErc20ApproveDetails {
  type: 'erc20_approve'
  tokenAddress: string
  tokenSymbol: string | null
  tokenDecimals: number | null
  amount: string | null
  amountRaw: string
  spender: string
}

type ApprovalDetails = ApprovalErc20ApproveDetails

interface ApprovalRequestData {
  id: string
  origin: string
  method: string
  createdAt: string
  selectedAddress: string | null
  details?: ApprovalDetails
}

interface ApprovalGetResponse {
  ok: boolean
  request?: ApprovalRequestData
  error?: JsonRpcErrorPayload
}

interface ApprovalDecideResponse {
  ok: boolean
  error?: JsonRpcErrorPayload
}

interface MonadscanV2Envelope {
  status?: string
  message?: string
  result?: unknown
}

interface MonadscanSourceCodeResultItem {
  SourceCode?: string
  ABI?: string
  CompilerVersion?: string
  Proxy?: string
  Implementation?: string
  ContractName?: string
}

interface MonadscanContractCreationResultItem {
  contractAddress?: string
  contractCreator?: string
  txHash?: string
  timestamp?: string
}

const MONADSCAN_V2_API_BASE_URL = 'https://api.etherscan.io/v2/api'
const MONADSCAN_API_KEY = String(import.meta.env.VITE_MONADSCAN_API_KEY ?? '').trim()
const rpcProvider = new JsonRpcProvider(DEFAULT_EXTENSION_NETWORK.rpcUrls[0])
const EIP1967_IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
const EIP1967_ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'

const sendRuntimeMessage = async <T,>(message: Record<string, unknown>): Promise<T> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      const runtimeError = chrome.runtime?.lastError
      if (runtimeError) {
        reject(new Error(runtimeError.message))
        return
      }
      resolve(response)
    })
  })

const parseApprovalIdFromUrl = (): string => {
  try {
    const params = new URLSearchParams(window.location.search)
    return params.get('approvalId')?.trim() ?? ''
  } catch {
    return ''
  }
}

const getBlockExplorerBaseUrl = (): string =>
  DEFAULT_EXTENSION_NETWORK.blockExplorerUrls?.[0]?.replace(/\/+$/, '') ?? ''

const getExplorerAddressUrl = (address: string): string => {
  const base = getBlockExplorerBaseUrl()
  const normalizedAddress = address.trim()
  if (!base || !normalizedAddress) {
    return ''
  }
  return `${base}/address/${normalizedAddress}`
}

const formatApproveAmount = (details: ApprovalErc20ApproveDetails): string => {
  const tokenLabel = details.tokenSymbol?.trim() ? details.tokenSymbol : 'Token'
  if (typeof details.amount !== 'string') {
    return `Unavailable ${tokenLabel}`
  }
  return `${details.amount} ${tokenLabel}`
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const normalizeRiskLevel = (
  value: SecurityRiskResponse['risk_level']
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

const getRiskPalette = (risk: SecurityRiskResponse | null) => {
  const level = risk ? normalizeRiskLevel(risk.risk_level) : null
  if (level === 'high') {
    return { background: '#fdeeee', border: '#f0c5c5', text: '#8b2b2b', badgeBg: '#d94b4b' }
  }
  if (level === 'medium') {
    return { background: '#fff5df', border: '#f1b83a', text: '#7a4b00', badgeBg: '#d38a00' }
  }
  if (level === 'low') {
    return { background: '#eaf8f1', border: '#bde7d1', text: '#1f5e41', badgeBg: '#2f9d69' }
  }
  return { background: '#eef2f7', border: '#cfd8e3', text: '#344255', badgeBg: '#66758a' }
}

const getRiskAwareApproveButtonBackground = (risk: SecurityRiskResponse | null): string | null => {
  if (!risk) {
    return null
  }
  return getRiskPalette(risk).badgeBg
}

const shouldRequireApproveCooldown = (risk: SecurityRiskResponse | null): boolean => {
  if (!risk) {
    return false
  }
  const level = normalizeRiskLevel(risk.risk_level)
  return level === 'high' || level === 'medium'
}

const normalizeOptionalAddress = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  try {
    return getAddress(trimmed)
  } catch {
    return null
  }
}

const parseNumberishTimestamp = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed)
    }
  }
  return null
}

const fetchMonadscan = async (params: Record<string, string>): Promise<MonadscanV2Envelope> => {
  if (!MONADSCAN_API_KEY) {
    throw new Error('Missing VITE_MONADSCAN_API_KEY in .env.')
  }

  const query = new URLSearchParams({
    chainid: String(DEFAULT_EXTENSION_NETWORK.chainIdDecimal),
    apikey: MONADSCAN_API_KEY,
    ...params
  })
  const response = await fetch(`${MONADSCAN_V2_API_BASE_URL}?${query.toString()}`)
  if (!response.ok) {
    throw new Error('Failed to query Monadscan API.')
  }
  return (await response.json()) as MonadscanV2Envelope
}

const getMonadscanArrayResult = (payload: MonadscanV2Envelope): Record<string, unknown>[] => {
  if (Array.isArray(payload.result)) {
    return payload.result.filter((item): item is Record<string, unknown> => isRecord(item))
  }
  return []
}

const fetchMonadscanSourceCodeRecord = async (address: string): Promise<Record<string, unknown> | null> => {
  try {
    const payload = await fetchMonadscan({
      module: 'contract',
      action: 'getsourcecode',
      address
    })
    const rows = getMonadscanArrayResult(payload)
    return rows[0] ?? null
  } catch {
    return null
  }
}

const fetchMonadscanContractCreationRecord = async (address: string): Promise<Record<string, unknown> | null> => {
  try {
    const payload = await fetchMonadscan({
      module: 'contract',
      action: 'getcontractcreation',
      contractaddresses: address
    })
    const rows = getMonadscanArrayResult(payload)
    return rows[0] ?? null
  } catch {
    return null
  }
}

const parseAbiJson = (abiRaw: string | null): unknown[] | null => {
  if (!abiRaw) {
    return null
  }
  const normalized = abiRaw.trim()
  if (!normalized || normalized.startsWith('Contract source code not verified')) {
    return null
  }
  try {
    const parsed = JSON.parse(normalized) as unknown
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

const getAbiFunctionNames = (abiItems: unknown[] | null): string[] => {
  if (!abiItems) {
    return []
  }
  return abiItems
    .map((item) => {
      if (!isRecord(item) || item.type !== 'function' || typeof item.name !== 'string') {
        return null
      }
      return item.name
    })
    .filter((name): name is string => Boolean(name))
}

const hasFunctionName = (functionNames: string[], matcher: RegExp): boolean =>
  functionNames.some((name) => matcher.test(name))

const compactRecord = <T extends object>(value: T): T | undefined => {
  const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => typeof item !== 'undefined')
  if (entries.length === 0) {
    return undefined
  }
  return Object.fromEntries(entries) as T
}

const readAddressFromStorageWord = (value: string): string | null => {
  const normalized = value.trim()
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    return null
  }
  const tail = `0x${normalized.slice(-40)}`
  if (/^0x0{40}$/i.test(tail)) {
    return null
  }
  try {
    return getAddress(tail)
  } catch {
    return null
  }
}

const readEip1967ProxyInfo = async (address: string): Promise<ContractProxyInfo> => {
  try {
    const [implementationWord, adminWord] = await Promise.all([
      rpcProvider.getStorage(address, EIP1967_IMPLEMENTATION_SLOT),
      rpcProvider.getStorage(address, EIP1967_ADMIN_SLOT)
    ])
    const implementationAddress = readAddressFromStorageWord(String(implementationWord))
    const adminAddress = readAddressFromStorageWord(String(adminWord))
    return {
      is_proxy: Boolean(implementationAddress),
      implementation_address: implementationAddress,
      admin_address: adminAddress
    }
  } catch {
    return {}
  }
}

const readContractOwnerLikeFields = async (
  address: string,
  functionNames: string[]
): Promise<Pick<ContractPermissions, 'owner' | 'admin'>> => {
  const fields: Pick<ContractPermissions, 'owner' | 'admin'> = {}

  const calls: Array<Promise<void>> = []
  if (hasFunctionName(functionNames, /^owner$/i)) {
    calls.push(
      (async () => {
        try {
          const contract = new Contract(address, ['function owner() view returns (address)'], rpcProvider)
          const owner = await contract.owner()
          fields.owner = normalizeOptionalAddress(owner) ?? null
        } catch {
          fields.owner = null
        }
      })()
    )
  }
  if (hasFunctionName(functionNames, /^admin$/i)) {
    calls.push(
      (async () => {
        try {
          const contract = new Contract(address, ['function admin() view returns (address)'], rpcProvider)
          const admin = await contract.admin()
          fields.admin = normalizeOptionalAddress(admin) ?? null
        } catch {
          fields.admin = null
        }
      })()
    )
  }

  await Promise.all(calls)
  return fields
}

const inferTokenFlags = (functionNames: string[], sourceCode: string | null): TokenBehaviorFlags | undefined => {
  const source = (sourceCode ?? '').toLowerCase()
  const joinedNames = functionNames.join(' ').toLowerCase()
  const scan = `${joinedNames}\n${source}`

  const flags: TokenBehaviorFlags = {
    has_transfer_tax: /buytax|selltax|transfertax|taxfee|marketingfee|liquidityfee|reflectionfee/.test(scan)
      ? true
      : null,
    tax_changeable: /settax|updatetax|setfee|updatefee|setbuytax|setselltax/.test(scan)
      ? true
      : null,
    max_tx_limit: /maxtx|maxtransaction|setmaxtx|setmaxtransaction/.test(scan)
      ? true
      : null,
    max_wallet_limit: /maxwallet|setmaxwallet/.test(scan)
      ? true
      : null,
    trading_restrictions: /tradingenabled|settrading|enabletrading|blacklist|whitelist|cooldown|antibot/.test(scan)
      ? true
      : null
  }

  return compactRecord(flags)
}

const inferPermissions = async (
  contractAddress: string,
  functionNames: string[],
  proxyInfo: ContractProxyInfo
): Promise<ContractPermissions | undefined> => {
  const ownerAdmin = await readContractOwnerLikeFields(contractAddress, functionNames)
  const inferred: ContractPermissions = {
    owner: ownerAdmin.owner,
    admin: proxyInfo.admin_address ?? ownerAdmin.admin,
    can_upgrade:
      proxyInfo.is_proxy === true || hasFunctionName(functionNames, /^upgrade(to|toandcall)?$/i)
        ? true
        : null,
    can_pause: hasFunctionName(functionNames, /^(pause|unpause|setpause|setpaused)$/i) ? true : null,
    can_blacklist: hasFunctionName(functionNames, /blacklist/i) ? true : null,
    can_mint: hasFunctionName(functionNames, /^mint/i) ? true : null,
    can_burn: hasFunctionName(functionNames, /^burn/i) ? true : null
  }
  return compactRecord(inferred)
}

const getCreationTimestampFromTxHash = async (txHash: string | null): Promise<number | null> => {
  if (!txHash) {
    return null
  }
  try {
    const tx = await rpcProvider.getTransaction(txHash)
    if (!tx?.blockNumber) {
      return null
    }
    const block = await rpcProvider.getBlock(tx.blockNumber)
    if (!block?.timestamp) {
      return null
    }
    return Number(block.timestamp)
  } catch {
    return null
  }
}

const buildContractRiskPayload = async (request: ApprovalRequestData): Promise<ContractRiskInput | null> => {
  if (request.details?.type !== 'erc20_approve') {
    return null
  }

  const spenderAddress = normalizeOptionalAddress(request.details.spender)
  const tokenAddress = normalizeOptionalAddress(request.details.tokenAddress)
  const contractAddressForRisk = tokenAddress ?? spenderAddress
  if (!contractAddressForRisk) {
    return null
  }

  const [bytecode, sourceRecordRaw, creationRecordRaw, proxyFromStorage] = await Promise.all([
    rpcProvider.getCode(contractAddressForRisk).catch(() => '0x'),
    fetchMonadscanSourceCodeRecord(contractAddressForRisk),
    fetchMonadscanContractCreationRecord(contractAddressForRisk),
    readEip1967ProxyInfo(contractAddressForRisk)
  ])

  const sourceRecord = (sourceRecordRaw ?? {}) as MonadscanSourceCodeResultItem
  const creationRecord = (creationRecordRaw ?? {}) as MonadscanContractCreationResultItem
  const abiRaw = typeof sourceRecord.ABI === 'string' ? sourceRecord.ABI : null
  const abiItems = parseAbiJson(abiRaw)
  const functionNames = getAbiFunctionNames(abiItems)
  const sourceCodeRaw =
    typeof sourceRecord.SourceCode === 'string' && sourceRecord.SourceCode.trim() ? sourceRecord.SourceCode : null
  const compilerVersion =
    typeof sourceRecord.CompilerVersion === 'string' && sourceRecord.CompilerVersion.trim()
      ? sourceRecord.CompilerVersion
      : null
  const explorerImpl = normalizeOptionalAddress(sourceRecord.Implementation)
  const explorerProxyFlag =
    typeof sourceRecord.Proxy === 'string'
      ? sourceRecord.Proxy.trim() === '1'
      : null
  const proxyInfo: ContractProxyInfo | undefined = compactRecord({
    is_proxy:
      explorerProxyFlag !== null ? explorerProxyFlag : proxyFromStorage.is_proxy ?? undefined,
    implementation_address: explorerImpl ?? proxyFromStorage.implementation_address ?? undefined,
    admin_address: proxyFromStorage.admin_address ?? undefined
  })

  const permissions = await inferPermissions(contractAddressForRisk, functionNames, proxyInfo ?? {})
  const tokenFlags = inferTokenFlags(functionNames, sourceCodeRaw)

  const creatorAddress = normalizeOptionalAddress(creationRecord.contractCreator)
  const creationTxHash =
    typeof creationRecord.txHash === 'string' && creationRecord.txHash.trim() ? creationRecord.txHash : null
  const creationTimestampFromExplorer = parseNumberishTimestamp(creationRecord.timestamp)
  const creationTimestamp =
    creationTimestampFromExplorer ?? (await getCreationTimestampFromTxHash(creationTxHash))
  const creator: ContractCreatorInfo | undefined = compactRecord({
    creator_address: creatorAddress ?? undefined,
    creation_tx_hash: creationTxHash ?? undefined,
    creation_timestamp: creationTimestamp ?? undefined
  })

  const isVerified =
    Boolean(abiItems) &&
    typeof abiRaw === 'string' &&
    !abiRaw.toLowerCase().includes('contract source code not verified')
  const code: ContractCodeInfo = {
    verified: isVerified,
    source_code: sourceCodeRaw,
    bytecode: typeof bytecode === 'string' && bytecode !== '0x' ? bytecode : null,
    compiler_version: compilerVersion,
    abi: abiRaw
  }

  return {
    contract_address: contractAddressForRisk,
    chain: 'monad',
    interaction_type: 'approve',
    creator,
    proxy: proxyInfo,
    permissions,
    token_flags: tokenFlags,
    code,
    extra_features: {
      approval_method: request.method,
      approval_origin: request.origin,
      approval_request_id: request.id,
      sender_address: request.selectedAddress,
      spender_address: spenderAddress,
      risk_contract_address: contractAddressForRisk,
      token_address: tokenAddress,
      token_symbol: request.details.tokenSymbol,
      token_decimals: request.details.tokenDecimals,
      approve_amount: request.details.amount,
      approve_amount_raw: request.details.amountRaw,
      spender_bytecode_present: typeof bytecode === 'string' && bytecode !== '0x',
      contract_name: typeof sourceRecord.ContractName === 'string' ? sourceRecord.ContractName : null
    }
  }
}

const ApprovalApp = () => {
  const approvalId = useMemo(() => parseApprovalIdFromUrl(), [])
  const [request, setRequest] = useState<ApprovalRequestData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [contractRisk, setContractRisk] = useState<SecurityRiskResponse | null>(null)
  const [riskWarning, setRiskWarning] = useState('')
  const [isAnalyzingContractRisk, setIsAnalyzingContractRisk] = useState(false)
  const [approveCooldownSeconds, setApproveCooldownSeconds] = useState(0)

  useEffect(() => {
    if (!approvalId) {
      setError('Approval request id is missing.')
      setIsLoading(false)
      return
    }

    const load = async () => {
      setError('')
      setIsLoading(true)
      try {
        const response = await sendRuntimeMessage<ApprovalGetResponse>({
          type: APPROVAL_GET_REQUEST,
          approvalId
        })
        if (!response.ok || !response.request) {
          setError(response.error?.message ?? 'Approval request not found.')
          return
        }
        setContractRisk(null)
        setRiskWarning('')
        setApproveCooldownSeconds(0)
        setRequest(response.request)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load approval request.')
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [approvalId])

  useEffect(() => {
    if (approveCooldownSeconds <= 0) {
      return
    }
    const timer = window.setInterval(() => {
      setApproveCooldownSeconds((current) => (current > 0 ? current - 1 : 0))
    }, 1000)
    return () => {
      window.clearInterval(timer)
    }
  }, [approveCooldownSeconds])

  useEffect(() => {
    if (!request || request.details?.type !== 'erc20_approve') {
      setContractRisk(null)
      setRiskWarning('')
      setIsAnalyzingContractRisk(false)
      setApproveCooldownSeconds(0)
      return
    }

    let cancelled = false
    const runRiskAnalysis = async () => {
      setRiskWarning('')
      setContractRisk(null)
      setApproveCooldownSeconds(0)
      setIsAnalyzingContractRisk(true)
      try {
        const payload = await buildContractRiskPayload(request)
        if (!payload) {
          throw new Error('Unable to build contract risk request payload.')
        }
        const result = await analyzeContractRisk(payload)
        if (cancelled) {
          return
        }
        setContractRisk(result)
        setApproveCooldownSeconds(shouldRequireApproveCooldown(result) ? 3 : 0)
      } catch (riskError) {
        if (cancelled) {
          return
        }
        setContractRisk(null)
        setApproveCooldownSeconds(0)
        setRiskWarning(riskError instanceof Error ? riskError.message : 'Failed to analyze contract risk.')
      } finally {
        if (!cancelled) {
          setIsAnalyzingContractRisk(false)
        }
      }
    }

    void runRiskAnalysis()
    return () => {
      cancelled = true
    }
  }, [request])

  const submitDecision = async (approved: boolean) => {
    if (!approvalId) {
      return
    }
    setIsSubmitting(true)
    setError('')
    try {
      const response = await sendRuntimeMessage<ApprovalDecideResponse>({
        type: APPROVAL_DECIDE_REQUEST,
        approvalId,
        approved
      })
      if (!response.ok) {
        setError(response.error?.message ?? 'Failed to submit approval decision.')
        return
      }
      window.close()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to submit approval decision.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const approveButtonBackground = getRiskAwareApproveButtonBackground(contractRisk)
  const isApproveCooldownActive = approveCooldownSeconds > 0 && shouldRequireApproveCooldown(contractRisk)
  const isApproveDisabled =
    isSubmitting ||
    isLoading ||
    !request?.selectedAddress ||
    isAnalyzingContractRisk ||
    isApproveCooldownActive

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 18,
        boxSizing: 'border-box'
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 360,
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 16,
          display: 'grid',
          gap: 12
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 18 }}>Approval Request</h1>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>
            LumiWallet approval required
          </div>
        </div>

        {isLoading ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Loading request...</div>
        ) : null}

        {!isLoading && request ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12 }}>
              <strong>Site</strong>
              <div style={{ marginTop: 4, color: 'var(--muted)', wordBreak: 'break-all' }}>
                {request.origin}
              </div>
            </div>
            <div style={{ fontSize: 12 }}>
              <strong>Action</strong>
              <div style={{ marginTop: 4, color: 'var(--muted)' }}>{request.method}</div>
            </div>
            <div style={{ fontSize: 12 }}>
              <strong>Account</strong>
              <div style={{ marginTop: 4, color: 'var(--muted)', wordBreak: 'break-all' }}>
                {request.selectedAddress ?? 'No account selected'}
              </div>
            </div>
            {request.details?.type === 'erc20_approve' ? (
              <>
                <div style={{ fontSize: 12 }}>
                  <strong>Approve Amount</strong>
                  <div style={{ marginTop: 4, color: 'var(--muted)', wordBreak: 'break-all' }}>
                    {formatApproveAmount(request.details)}
                  </div>
                </div>
                <div style={{ fontSize: 12 }}>
                  <strong>Token</strong>
                  <div style={{ marginTop: 4, color: 'var(--muted)', wordBreak: 'break-all' }}>
                    {(() => {
                      const tokenLabel = request.details?.tokenSymbol?.trim() || 'Unknown Token'
                      const explorerUrl = getExplorerAddressUrl(request.details?.tokenAddress ?? '')
                      if (!explorerUrl) {
                        return tokenLabel
                      }
                      return (
                        <a
                          href={explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
                        >
                          {tokenLabel}
                        </a>
                      )
                    })()}
                  </div>
                </div>
                <div style={{ fontSize: 12 }}>
                  <strong>Spender</strong>
                  <div style={{ marginTop: 4, color: 'var(--muted)', wordBreak: 'break-all' }}>
                    {request.details.spender}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {isAnalyzingContractRisk && request?.details?.type === 'erc20_approve' ? (
          <div
            style={{
              fontSize: 12,
              color: '#344255',
              background: '#eef2f7',
              border: '1px solid #cfd8e3',
              borderRadius: 10,
              padding: '8px 10px'
            }}
          >
            Analyzing contract risk...
          </div>
        ) : null}

        {contractRisk ? (
          <section
            style={{
              ...(() => {
                const palette = getRiskPalette(contractRisk)
                return {
                  background: palette.background,
                  borderRadius: 12,
                  border: `1px solid ${palette.border}`,
                  padding: 12,
                  display: 'grid',
                  gap: 8
                }
              })()
            }}
          >
            {(() => {
              const palette = getRiskPalette(contractRisk)
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: palette.text }}>Contract Risk</div>
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
                      {String(contractRisk.risk_level).toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: palette.text, wordBreak: 'break-word' }}>
                    {contractRisk.summary || 'No summary returned by the risk service.'}
                  </div>
                </>
              )
            })()}
          </section>
        ) : null}

        {riskWarning ? (
          <div
            style={{
              fontSize: 12,
              color: '#7a4b00',
              background: '#fff5df',
              border: '1px solid #f1b83a',
              borderRadius: 10,
              padding: '8px 10px'
            }}
          >
            Contract risk analysis unavailable: {riskWarning}
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              fontSize: 12,
              color: '#8b2b2b',
              background: '#fdeeee',
              border: '1px solid #f0c5c5',
              borderRadius: 10,
              padding: '8px 10px'
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              void submitDecision(false)
            }}
            disabled={isSubmitting || isLoading}
            style={{
              flex: 1,
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: '#fff',
              padding: '10px 12px',
              fontWeight: 700,
              cursor: isSubmitting || isLoading ? 'not-allowed' : 'pointer'
            }}
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => {
              void submitDecision(true)
            }}
            disabled={isApproveDisabled}
            style={{
              flex: 1,
              borderRadius: 10,
              border: 'none',
              background: approveButtonBackground ?? 'var(--accent)',
              color: '#fff',
              padding: '10px 12px',
              fontWeight: 700,
              cursor: isApproveDisabled ? 'not-allowed' : 'pointer',
              opacity: isApproveDisabled ? 0.7 : 1
            }}
          >
            {isSubmitting
              ? 'Submitting...'
              : isAnalyzingContractRisk
                ? 'Analyzing Risk...'
                : isApproveCooldownActive
                  ? `Approve (${approveCooldownSeconds}s)`
                  : 'Approve'}
          </button>
        </div>
      </section>
    </main>
  )
}

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root container not found')
}

createRoot(container).render(
  <React.StrictMode>
    <ApprovalApp />
  </React.StrictMode>
)
