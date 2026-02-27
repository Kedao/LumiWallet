import {
  Contract,
  formatUnits,
  getAddress,
  getBytes,
  isHexString,
  JsonRpcProvider,
  Wallet,
  type TransactionRequest,
  type TypedDataDomain,
  type TypedDataField
} from 'ethers'
import { DEFAULT_EXTENSION_NETWORK } from '../config/networks'

const RPC_REQUEST = 'LUMI_DAPP_RPC_REQUEST'
const APPROVAL_GET_REQUEST = 'LUMI_APPROVAL_GET_REQUEST'
const APPROVAL_DECIDE_REQUEST = 'LUMI_APPROVAL_DECIDE_REQUEST'
const DAPP_PERMISSIONS_STORAGE_KEY = 'lumi.wallet.dapp.permissions.v1'
const DAPP_INTERACTION_LOGS_STORAGE_KEY = 'lumi.wallet.dapp.interactions.v1'
const DAPP_PENDING_APPROVALS_STORAGE_KEY = 'lumi.wallet.dapp.pending-approvals.v1'
const ACCOUNTS_STORAGE_KEY = 'lumi.wallet.accounts.v1'
const WALLET_SESSION_STATE_KEY = 'lumi.wallet.session.v1'
const WALLET_SESSION_SECRET_KEY = 'lumi.wallet.session.secret.v1'
const MAX_DAPP_INTERACTION_LOGS = 300
const APPROVAL_TIMEOUT_MS = 120 * 1000
const APPROVAL_WINDOW_WIDTH = 380
const APPROVAL_WINDOW_HEIGHT = 640
const ERC20_APPROVE_SELECTOR = '0x095ea7b3'
const MIN_ERC20_APPROVE_DATA_LENGTH = 2 + 8 + 64 + 64
const ERC20_METADATA_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)'
]

let interactionLogWriteQueue: Promise<void> = Promise.resolve()
const rpcProvider = new JsonRpcProvider(DEFAULT_EXTENSION_NETWORK.rpcUrls[0])

interface JsonRpcErrorPayload {
  code: number
  message: string
  data?: unknown
}

interface RpcRequestPayload {
  method: string
  params?: unknown
}

interface RpcRequestMessage {
  type: typeof RPC_REQUEST
  id: string
  origin: string
  payload: RpcRequestPayload
}

interface ApprovalGetRequestMessage {
  type: typeof APPROVAL_GET_REQUEST
  approvalId: string
}

interface ApprovalDecideRequestMessage {
  type: typeof APPROVAL_DECIDE_REQUEST
  approvalId: string
  approved: boolean
}

interface RpcSuccessMessage {
  ok: true
  result: unknown
}

interface RpcFailureMessage {
  ok: false
  error: JsonRpcErrorPayload
}

interface ApprovalGetSuccessMessage {
  ok: true
  request: PendingApprovalRecord & {
    selectedAddress: string | null
  }
}

interface ApprovalDecideSuccessMessage {
  ok: true
}

interface StoredImportedAccount {
  address: string
  cipher: {
    algorithm: 'AES-GCM'
    ivBase64: string
  }
  privateKeyCiphertextBase64: string
}

interface StoredAccountsV1 {
  version: 1
  selectedAddress: string | null
  accounts: StoredImportedAccount[]
}

interface StoredDappPermissionsV1 {
  version: 1
  allowedOrigins: string[]
}

interface StoredWalletSessionStateV1 {
  version: 1
  unlocked: boolean
  updatedAt: string
}

interface StoredWalletSessionSecretV1 {
  version: 1
  secretHex: string
  updatedAt: string
}

type DappInteractionAction =
  | 'login'
  | 'authorize'
  | 'signature'
  | 'transaction'
  | 'account_query'
  | 'network_query'
  | 'rpc'

type DappInteractionStatus = 'success' | 'error'

interface DappInteractionLogItem {
  id: string
  timestamp: string
  origin: string
  method: string
  action: DappInteractionAction
  status: DappInteractionStatus
  details?: Record<string, unknown>
}

interface StoredDappInteractionLogsV1 {
  version: 1
  items: DappInteractionLogItem[]
}

interface PendingApprovalRecord {
  id: string
  origin: string
  method: string
  createdAt: string
  details?: PendingApprovalDetails
}

interface PendingApprovalErc20ApproveDetails {
  type: 'erc20_approve'
  tokenAddress: string
  tokenSymbol: string | null
  tokenDecimals: number | null
  amount: string | null
  amountRaw: string
  spender: string
}

type PendingApprovalDetails = PendingApprovalErc20ApproveDetails

interface StoredPendingApprovalsV1 {
  version: 1
  requests: PendingApprovalRecord[]
}

interface WalletPermission {
  parentCapability: 'eth_accounts'
}

interface ApprovalWaiter {
  resolve: (approved: boolean) => void
  timeoutId: ReturnType<typeof setTimeout>
}

const approvalWaiters = new Map<string, ApprovalWaiter>()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isRpcRequestMessage = (value: unknown): value is RpcRequestMessage => {
  if (!isRecord(value)) {
    return false
  }
  return (
    value.type === RPC_REQUEST &&
    typeof value.id === 'string' &&
    typeof value.origin === 'string' &&
    isRecord(value.payload) &&
    typeof value.payload.method === 'string'
  )
}

const isApprovalGetRequestMessage = (value: unknown): value is ApprovalGetRequestMessage => {
  if (!isRecord(value)) {
    return false
  }
  return value.type === APPROVAL_GET_REQUEST && typeof value.approvalId === 'string'
}

const isApprovalDecideRequestMessage = (value: unknown): value is ApprovalDecideRequestMessage => {
  if (!isRecord(value)) {
    return false
  }
  return (
    value.type === APPROVAL_DECIDE_REQUEST &&
    typeof value.approvalId === 'string' &&
    typeof value.approved === 'boolean'
  )
}

const isStoredImportedAccount = (value: unknown): value is StoredImportedAccount => {
  if (!isRecord(value)) {
    return false
  }
  if (!isRecord(value.cipher)) {
    return false
  }
  return (
    typeof value.address === 'string' &&
    value.cipher.algorithm === 'AES-GCM' &&
    typeof value.cipher.ivBase64 === 'string' &&
    typeof value.privateKeyCiphertextBase64 === 'string'
  )
}

const isStoredAccountsV1 = (value: unknown): value is StoredAccountsV1 => {
  if (!isRecord(value)) {
    return false
  }
  if (value.version !== 1 || !Array.isArray(value.accounts)) {
    return false
  }
  if (value.selectedAddress !== null && typeof value.selectedAddress !== 'string') {
    return false
  }
  return value.accounts.every((item) => isStoredImportedAccount(item))
}

const isStoredDappPermissionsV1 = (value: unknown): value is StoredDappPermissionsV1 => {
  if (!isRecord(value)) {
    return false
  }
  return (
    value.version === 1 &&
    Array.isArray(value.allowedOrigins) &&
    value.allowedOrigins.every((origin) => typeof origin === 'string')
  )
}

const isStoredWalletSessionStateV1 = (value: unknown): value is StoredWalletSessionStateV1 => {
  if (!isRecord(value)) {
    return false
  }
  return (
    value.version === 1 &&
    typeof value.unlocked === 'boolean' &&
    typeof value.updatedAt === 'string'
  )
}

const isStoredWalletSessionSecretV1 = (value: unknown): value is StoredWalletSessionSecretV1 => {
  if (!isRecord(value)) {
    return false
  }
  return (
    value.version === 1 &&
    typeof value.secretHex === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

const isDappInteractionAction = (value: unknown): value is DappInteractionAction =>
  value === 'login' ||
  value === 'authorize' ||
  value === 'signature' ||
  value === 'transaction' ||
  value === 'account_query' ||
  value === 'network_query' ||
  value === 'rpc'

const isDappInteractionStatus = (value: unknown): value is DappInteractionStatus =>
  value === 'success' || value === 'error'

const isDappInteractionLogItem = (value: unknown): value is DappInteractionLogItem => {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.id === 'string' &&
    typeof value.timestamp === 'string' &&
    typeof value.origin === 'string' &&
    typeof value.method === 'string' &&
    isDappInteractionAction(value.action) &&
    isDappInteractionStatus(value.status) &&
    (typeof value.details === 'undefined' || isRecord(value.details))
  )
}

const isPendingApprovalErc20ApproveDetails = (
  value: unknown
): value is PendingApprovalErc20ApproveDetails => {
  if (!isRecord(value)) {
    return false
  }
  return (
    value.type === 'erc20_approve' &&
    typeof value.tokenAddress === 'string' &&
    (typeof value.tokenSymbol === 'string' || value.tokenSymbol === null) &&
    (typeof value.tokenDecimals === 'number' || value.tokenDecimals === null) &&
    (typeof value.amount === 'string' || value.amount === null) &&
    typeof value.amountRaw === 'string' &&
    typeof value.spender === 'string'
  )
}

const isPendingApprovalDetails = (value: unknown): value is PendingApprovalDetails =>
  isPendingApprovalErc20ApproveDetails(value)

const isStoredDappInteractionLogsV1 = (value: unknown): value is StoredDappInteractionLogsV1 => {
  if (!isRecord(value)) {
    return false
  }
  return (
    value.version === 1 &&
    Array.isArray(value.items) &&
    value.items.every((item) => isDappInteractionLogItem(item))
  )
}

const isPendingApprovalRecord = (value: unknown): value is PendingApprovalRecord => {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.id === 'string' &&
    typeof value.origin === 'string' &&
    typeof value.method === 'string' &&
    typeof value.createdAt === 'string' &&
    (typeof value.details === 'undefined' || isPendingApprovalDetails(value.details))
  )
}

const isStoredPendingApprovalsV1 = (value: unknown): value is StoredPendingApprovalsV1 => {
  if (!isRecord(value)) {
    return false
  }
  return (
    value.version === 1 &&
    Array.isArray(value.requests) &&
    value.requests.every((item) => isPendingApprovalRecord(item))
  )
}

const getStoredItem = async (key: string): Promise<unknown | null> =>
  new Promise((resolve) => {
    chrome.storage.local.get([key], (items: Record<string, unknown>) => {
      resolve(items[key] ?? null)
    })
  })

const setStoredItem = async (key: string, value: unknown): Promise<void> =>
  new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve())
  })

const getSessionItem = async (key: string): Promise<unknown | null> =>
  new Promise((resolve) => {
    const sessionStorageApi = chrome.storage?.session
    if (!sessionStorageApi) {
      resolve(null)
      return
    }
    sessionStorageApi.get([key], (items: Record<string, unknown>) => {
      resolve(items[key] ?? null)
    })
  })

const getStoredAccounts = async (): Promise<StoredAccountsV1> => {
  const raw = await getStoredItem(ACCOUNTS_STORAGE_KEY)
  if (!isStoredAccountsV1(raw)) {
    return {
      version: 1,
      selectedAddress: null,
      accounts: []
    }
  }
  return raw
}

const getSelectedAddress = async (): Promise<string | null> => {
  const accounts = await getStoredAccounts()
  if (!accounts.selectedAddress) {
    return null
  }
  const hasSelected = accounts.accounts.some((item) => item.address === accounts.selectedAddress)
  return hasSelected ? accounts.selectedAddress : null
}

const getSelectedStoredAccount = async (): Promise<StoredImportedAccount | null> => {
  const accounts = await getStoredAccounts()
  if (!accounts.selectedAddress) {
    return null
  }
  return accounts.accounts.find((item) => item.address === accounts.selectedAddress) ?? null
}

const getWalletSessionSecretHex = async (): Promise<string | null> => {
  const raw = await getSessionItem(WALLET_SESSION_SECRET_KEY)
  if (!isStoredWalletSessionSecretV1(raw)) {
    return null
  }
  const normalized = raw.secretHex.trim().toLowerCase().replace(/^0x/, '')
  if (!isHexString(`0x${normalized}`, 32)) {
    return null
  }
  return normalized
}

const getPermissions = async (): Promise<StoredDappPermissionsV1> => {
  const raw = await getStoredItem(DAPP_PERMISSIONS_STORAGE_KEY)
  if (!isStoredDappPermissionsV1(raw)) {
    return {
      version: 1,
      allowedOrigins: []
    }
  }
  return raw
}

const isWalletUnlocked = async (): Promise<boolean> => {
  const raw = await getSessionItem(WALLET_SESSION_STATE_KEY)
  if (!isStoredWalletSessionStateV1(raw)) {
    return false
  }
  return raw.unlocked
}

const getInteractionLogs = async (): Promise<StoredDappInteractionLogsV1> => {
  const raw = await getStoredItem(DAPP_INTERACTION_LOGS_STORAGE_KEY)
  if (!isStoredDappInteractionLogsV1(raw)) {
    return {
      version: 1,
      items: []
    }
  }
  return raw
}

const getPendingApprovals = async (): Promise<StoredPendingApprovalsV1> => {
  const raw = await getStoredItem(DAPP_PENDING_APPROVALS_STORAGE_KEY)
  if (!isStoredPendingApprovalsV1(raw)) {
    return {
      version: 1,
      requests: []
    }
  }
  return raw
}

const setPendingApprovals = async (payload: StoredPendingApprovalsV1): Promise<void> =>
  setStoredItem(DAPP_PENDING_APPROVALS_STORAGE_KEY, payload)

const addPendingApproval = async (record: PendingApprovalRecord): Promise<void> => {
  const stored = await getPendingApprovals()
  const deduped = stored.requests.filter((item) => item.id !== record.id)
  await setPendingApprovals({
    version: 1,
    requests: [record, ...deduped]
  })
}

const removePendingApproval = async (approvalId: string): Promise<void> => {
  const stored = await getPendingApprovals()
  const nextRequests = stored.requests.filter((item) => item.id !== approvalId)
  if (nextRequests.length === stored.requests.length) {
    return
  }
  await setPendingApprovals({
    version: 1,
    requests: nextRequests
  })
}

const getPendingApprovalById = async (approvalId: string): Promise<PendingApprovalRecord | null> => {
  const stored = await getPendingApprovals()
  return stored.requests.find((item) => item.id === approvalId) ?? null
}

const classifyInteractionAction = (method: string): DappInteractionAction => {
  if (method === 'eth_requestAccounts') {
    return 'login'
  }
  if (method === 'wallet_requestPermissions' || method === 'wallet_getPermissions') {
    return 'authorize'
  }
  if (
    method === 'personal_sign' ||
    method === 'eth_signTypedData' ||
    method === 'eth_signTypedData_v3' ||
    method === 'eth_signTypedData_v4'
  ) {
    return 'signature'
  }
  if (method === 'eth_sendTransaction') {
    return 'transaction'
  }
  if (method === 'eth_accounts') {
    return 'account_query'
  }
  if (method === 'eth_chainId' || method === 'net_version') {
    return 'network_query'
  }
  return 'rpc'
}

const summarizeResult = (method: string, result: unknown): Record<string, unknown> => {
  if ((method === 'eth_requestAccounts' || method === 'eth_accounts') && Array.isArray(result)) {
    return { accountsCount: result.length }
  }
  if ((method === 'wallet_requestPermissions' || method === 'wallet_getPermissions') && Array.isArray(result)) {
    return { permissionsCount: result.length }
  }
  if (method === 'eth_chainId' && typeof result === 'string') {
    return { chainId: result }
  }
  if (method === 'net_version' && typeof result === 'string') {
    return { networkId: result }
  }
  if (
    (method === 'personal_sign' ||
      method === 'eth_signTypedData' ||
      method === 'eth_signTypedData_v3' ||
      method === 'eth_signTypedData_v4') &&
    typeof result === 'string'
  ) {
    return { signatureLength: result.length }
  }
  if (method === 'eth_sendTransaction' && typeof result === 'string') {
    return { txHash: result }
  }
  return {}
}

const appendInteractionLog = async (
  input: Omit<DappInteractionLogItem, 'id' | 'timestamp'>
): Promise<void> => {
  const entry: DappInteractionLogItem = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    timestamp: new Date().toISOString(),
    ...input
  }

  const writeTask = interactionLogWriteQueue.then(async () => {
    const stored = await getInteractionLogs()
    const nextItems = [entry, ...stored.items].slice(0, MAX_DAPP_INTERACTION_LOGS)
    await setStoredItem(DAPP_INTERACTION_LOGS_STORAGE_KEY, {
      version: 1,
      items: nextItems
    } satisfies StoredDappInteractionLogsV1)
  })

  interactionLogWriteQueue = writeTask.catch(() => undefined)
  await writeTask
}

const recordInteractionLog = async (
  message: RpcRequestMessage,
  status: DappInteractionStatus,
  details?: Record<string, unknown>
): Promise<void> => {
  const action = classifyInteractionAction(message.payload.method)
  try {
    await appendInteractionLog({
      origin: message.origin,
      method: message.payload.method,
      action,
      status,
      details
    })
  } catch (error) {
    console.warn('[LumiWallet][DApp] 写入交互日志失败', error)
  }

  const logPayload = {
    origin: message.origin,
    method: message.payload.method,
    action,
    status,
    details
  }
  if (status === 'error') {
    console.error('[LumiWallet][DApp]', logPayload)
    return
  }
  console.info('[LumiWallet][DApp]', logPayload)
}

const normalizeOrigin = (origin: string): string => {
  try {
    const parsed = new URL(origin)
    if (!parsed.protocol || !parsed.host) {
      return ''
    }
    return `${parsed.protocol}//${parsed.host}`.toLowerCase()
  } catch {
    return ''
  }
}

const getValidatedOrigin = (origin: string): string => {
  const normalizedOrigin = normalizeOrigin(origin)
  if (!normalizedOrigin) {
    throw toRpcError(4100, '无效的请求来源。')
  }
  return normalizedOrigin
}

const authorizeOrigin = async (normalizedOrigin: string): Promise<void> => {
  const permissions = await getPermissions()
  if (permissions.allowedOrigins.includes(normalizedOrigin)) {
    return
  }
  await setStoredItem(DAPP_PERMISSIONS_STORAGE_KEY, {
    ...permissions,
    allowedOrigins: [...permissions.allowedOrigins, normalizedOrigin]
  } satisfies StoredDappPermissionsV1)
}

const isOriginAuthorized = async (normalizedOrigin: string): Promise<boolean> => {
  const permissions = await getPermissions()
  return permissions.allowedOrigins.includes(normalizedOrigin)
}

const toRpcError = (code: number, message: string, data?: unknown): JsonRpcErrorPayload => ({
  code,
  message,
  data
})

const textDecoder = new TextDecoder()

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const normalizeAddress = (address: string): string => getAddress(address).toLowerCase()

const tryNormalizeAddress = (value: string): string | null => {
  try {
    return normalizeAddress(value)
  } catch {
    return null
  }
}

const parseQuantity = (value: unknown, field: string): bigint => {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw toRpcError(-32602, `无效的 ${field} 值。`)
    }
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      throw toRpcError(-32602, `无效的 ${field} 值。`)
    }
    return BigInt(value)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      throw toRpcError(-32602, `无效的 ${field} 值。`)
    }
    try {
      const parsed = BigInt(trimmed)
      if (parsed < 0n) {
        throw new Error('negative')
      }
      return parsed
    } catch {
      throw toRpcError(-32602, `无效的 ${field} 值。`)
    }
  }
  throw toRpcError(-32602, `无效的 ${field} 值。`)
}

const parseNonce = (value: unknown): number => {
  const parsed = parseQuantity(value, 'nonce')
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw toRpcError(-32602, '无效的 nonce 值。')
  }
  return Number(parsed)
}

const parseChainId = (value: unknown): bigint => parseQuantity(value, 'chainId')

const assertUnlocked = async (): Promise<void> => {
  const unlocked = await isWalletUnlocked()
  if (!unlocked) {
    throw toRpcError(4100, '钱包已锁定，请先解锁 LumiWallet。')
  }
}

const assertAuthorizedOrigin = async (normalizedOrigin: string): Promise<void> => {
  const authorized = await isOriginAuthorized(normalizedOrigin)
  if (!authorized) {
    throw toRpcError(4100, '未授权来源，请先调用 eth_requestAccounts。')
  }
}

const decryptImportedPrivateKey = async (
  account: StoredImportedAccount,
  sessionSecretHex: string
): Promise<string> => {
  let key: CryptoKey
  try {
    const secretBytes = new Uint8Array(getBytes(`0x${sessionSecretHex}`))
    key = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(secretBytes),
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      ['decrypt']
    )
  } catch {
    throw toRpcError(4100, '钱包会话无效，请重新解锁 LumiWallet。')
  }

  try {
    const iv = fromBase64(account.cipher.ivBase64)
    const ciphertext = fromBase64(account.privateKeyCiphertextBase64)
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(ciphertext)
    )
    const normalizedPrivateKey = textDecoder
      .decode(new Uint8Array(plaintext))
      .trim()
      .toLowerCase()
      .replace(/^0x/, '')
    if (!isHexString(`0x${normalizedPrivateKey}`, 32)) {
      throw new Error('invalid private key')
    }
    return normalizedPrivateKey
  } catch {
    throw toRpcError(-32603, '无法解密账户私钥。')
  }
}

const getSelectedAccountWallet = async (): Promise<Wallet> => {
  const account = await getSelectedStoredAccount()
  if (!account) {
    throw toRpcError(-32000, '钱包中未选择账户。')
  }
  const sessionSecretHex = await getWalletSessionSecretHex()
  if (!sessionSecretHex) {
    throw toRpcError(4100, '钱包会话已过期，请重新解锁 LumiWallet。')
  }

  const privateKeyHex = await decryptImportedPrivateKey(account, sessionSecretHex)
  const wallet = new Wallet(`0x${privateKeyHex}`, rpcProvider)
  if (normalizeAddress(wallet.address) !== normalizeAddress(account.address)) {
    throw toRpcError(-32603, '账户私钥与当前地址不匹配。')
  }
  return wallet
}

const requestMethodApproval = async (
  normalizedOrigin: string,
  method: string,
  rejectionMessage: string,
  details?: PendingApprovalDetails
): Promise<void> => {
  const approved = await requestUserApproval(normalizedOrigin, method, details)
  if (!approved) {
    throw toRpcError(4001, rejectionMessage)
  }
}

type PersonalSignPayload = {
  address: string
  message: string | Uint8Array
}

type ParsedTypedDataPayload = {
  address: string
  domain: TypedDataDomain
  types: Record<string, Array<TypedDataField>>
  message: Record<string, unknown>
}

const parsePersonalSignPayload = (params: unknown): PersonalSignPayload => {
  if (!Array.isArray(params) || params.length < 2) {
    throw toRpcError(-32602, 'personal_sign 参数无效。')
  }
  const first = params[0]
  const second = params[1]
  if (typeof first !== 'string' || typeof second !== 'string') {
    throw toRpcError(-32602, 'personal_sign 参数无效。')
  }

  const secondAsAddress = tryNormalizeAddress(second)
  if (secondAsAddress) {
    let message: string | Uint8Array
    try {
      message = isHexString(first) ? getBytes(first) : first
    } catch {
      throw toRpcError(-32602, 'personal_sign 参数无效。')
    }
    return {
      address: secondAsAddress,
      message
    }
  }

  const firstAsAddress = tryNormalizeAddress(first)
  if (firstAsAddress) {
    let message: string | Uint8Array
    try {
      message = isHexString(second) ? getBytes(second) : second
    } catch {
      throw toRpcError(-32602, 'personal_sign 参数无效。')
    }
    return {
      address: firstAsAddress,
      message
    }
  }

  throw toRpcError(-32602, 'personal_sign 参数无效。')
}

const parseTypedDataDomain = (value: unknown): TypedDataDomain => {
  if (!isRecord(value)) {
    throw toRpcError(-32602, 'TypedData domain 无效。')
  }
  const domain: TypedDataDomain = {}
  if (typeof value.name === 'string') {
    domain.name = value.name
  }
  if (typeof value.version === 'string') {
    domain.version = value.version
  }
  if (typeof value.chainId !== 'undefined') {
    domain.chainId = parseChainId(value.chainId)
  }
  if (typeof value.verifyingContract === 'string') {
    try {
      domain.verifyingContract = getAddress(value.verifyingContract)
    } catch {
      throw toRpcError(-32602, 'TypedData domain 无效。')
    }
  }
  if (typeof value.salt === 'string') {
    domain.salt = value.salt
  }
  return domain
}

const parseTypedDataTypes = (value: unknown): Record<string, Array<TypedDataField>> => {
  if (!isRecord(value)) {
    throw toRpcError(-32602, 'TypedData types 无效。')
  }
  const types: Record<string, Array<TypedDataField>> = {}
  for (const [typeName, fields] of Object.entries(value)) {
    if (!Array.isArray(fields)) {
      throw toRpcError(-32602, 'TypedData types 无效。')
    }
    const nextFields: TypedDataField[] = []
    for (const field of fields) {
      if (!isRecord(field) || typeof field.name !== 'string' || typeof field.type !== 'string') {
        throw toRpcError(-32602, 'TypedData types 无效。')
      }
      nextFields.push({
        name: field.name,
        type: field.type
      })
    }
    types[typeName] = nextFields
  }
  delete types.EIP712Domain
  if (Object.keys(types).length === 0) {
    throw toRpcError(-32602, 'TypedData types 无效。')
  }
  return types
}

const parseTypedDataPayloadInput = (value: unknown): ParsedTypedDataPayload => {
  if (!Array.isArray(value) || value.length < 2) {
    throw toRpcError(-32602, 'TypedData 签名参数无效。')
  }

  const first = value[0]
  const second = value[1]
  let typedDataRaw: unknown
  let normalizedAddress: string | null = null

  if (typeof first === 'string') {
    normalizedAddress = tryNormalizeAddress(first)
    if (normalizedAddress) {
      typedDataRaw = second
    } else {
      typedDataRaw = first
    }
  } else {
    typedDataRaw = first
  }

  if (!normalizedAddress && typeof second === 'string') {
    normalizedAddress = tryNormalizeAddress(second)
  }
  if (!normalizedAddress) {
    throw toRpcError(-32602, 'TypedData 签名参数无效。')
  }

  let parsedTypedData: unknown = typedDataRaw
  if (typeof parsedTypedData === 'string') {
    try {
      parsedTypedData = JSON.parse(parsedTypedData) as unknown
    } catch {
      throw toRpcError(-32602, 'TypedData 负载无效。')
    }
  }
  if (!isRecord(parsedTypedData)) {
    throw toRpcError(-32602, 'TypedData 负载无效。')
  }
  if (!isRecord(parsedTypedData.message)) {
    throw toRpcError(-32602, 'TypedData 负载无效。')
  }

  return {
    address: normalizedAddress,
    domain: parseTypedDataDomain(parsedTypedData.domain),
    types: parseTypedDataTypes(parsedTypedData.types),
    message: parsedTypedData.message
  }
}

const parseSendTransactionRequest = (params: unknown, selectedAddress: string): TransactionRequest => {
  if (!Array.isArray(params) || params.length === 0 || !isRecord(params[0])) {
    throw toRpcError(-32602, 'eth_sendTransaction 参数无效。')
  }
  const tx = params[0]
  if (typeof tx.from !== 'string') {
    throw toRpcError(-32602, 'eth_sendTransaction 参数无效：必须提供 from。')
  }
  let normalizedFrom: string
  try {
    normalizedFrom = normalizeAddress(tx.from)
  } catch {
    throw toRpcError(-32602, 'eth_sendTransaction 参数无效：from 地址无效。')
  }
  if (normalizedFrom !== selectedAddress) {
    throw toRpcError(4100, '请求的 from 账户与当前钱包账户不匹配。')
  }

  const request: TransactionRequest = {
    from: normalizedFrom
  }

  if (typeof tx.to === 'string' && tx.to.trim()) {
    try {
      request.to = getAddress(tx.to)
    } catch {
      throw toRpcError(-32602, 'eth_sendTransaction 参数无效：to 地址无效。')
    }
  } else if (typeof tx.to !== 'undefined' && tx.to !== null) {
    throw toRpcError(-32602, 'eth_sendTransaction 参数无效：to 地址无效。')
  }

  if (typeof tx.value !== 'undefined') {
    request.value = parseQuantity(tx.value, 'value')
  }
  if (typeof tx.data !== 'undefined') {
    if (typeof tx.data !== 'string' || !isHexString(tx.data)) {
      throw toRpcError(-32602, 'eth_sendTransaction 参数无效：data 必须是十六进制。')
    }
    request.data = tx.data
  }
  if (typeof tx.gas !== 'undefined') {
    request.gasLimit = parseQuantity(tx.gas, 'gas')
  }
  if (typeof tx.gasPrice !== 'undefined') {
    request.gasPrice = parseQuantity(tx.gasPrice, 'gasPrice')
  }
  if (typeof tx.maxFeePerGas !== 'undefined') {
    request.maxFeePerGas = parseQuantity(tx.maxFeePerGas, 'maxFeePerGas')
  }
  if (typeof tx.maxPriorityFeePerGas !== 'undefined') {
    request.maxPriorityFeePerGas = parseQuantity(tx.maxPriorityFeePerGas, 'maxPriorityFeePerGas')
  }
  if (typeof tx.nonce !== 'undefined') {
    request.nonce = parseNonce(tx.nonce)
  }
  if (typeof tx.chainId !== 'undefined') {
    const chainId = parseChainId(tx.chainId)
    const expectedChainId = BigInt(DEFAULT_EXTENSION_NETWORK.chainIdDecimal)
    if (chainId !== expectedChainId) {
      throw toRpcError(4901, 'eth_sendTransaction 中包含不支持的 chainId。')
    }
    request.chainId = Number(expectedChainId)
  }

  if (!request.to && !request.data) {
    throw toRpcError(-32602, 'eth_sendTransaction 参数无效：缺少 to 或 data。')
  }
  return request
}

const readErc20Metadata = async (
  tokenAddress: string
): Promise<{ symbol: string | null; decimals: number | null }> => {
  const parseTokenDecimals = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255) {
      return value
    }
    if (typeof value === 'bigint' && value >= 0n && value <= 255n) {
      return Number(value)
    }
    if (typeof value === 'string') {
      const normalized = value.trim()
      if (!normalized) {
        return null
      }
      try {
        const parsed = BigInt(normalized)
        if (parsed >= 0n && parsed <= 255n) {
          return Number(parsed)
        }
      } catch {
        return null
      }
    }
    return null
  }

  const tokenContract = new Contract(tokenAddress, ERC20_METADATA_ABI, rpcProvider)
  const [symbolResult, decimalsResult] = await Promise.allSettled([
    tokenContract.symbol() as Promise<unknown>,
    tokenContract.decimals() as Promise<unknown>
  ])

  const symbol =
    symbolResult.status === 'fulfilled' && typeof symbolResult.value === 'string'
      ? symbolResult.value
      : null

  const decimals =
    decimalsResult.status === 'fulfilled' ? parseTokenDecimals(decimalsResult.value) : null

  return { symbol, decimals }
}

const parseErc20ApproveDetails = async (
  txRequest: TransactionRequest
): Promise<PendingApprovalDetails | undefined> => {
  if (typeof txRequest.to !== 'string' || typeof txRequest.data !== 'string') {
    return undefined
  }

  const data = txRequest.data.toLowerCase()
  if (!data.startsWith(ERC20_APPROVE_SELECTOR) || data.length < MIN_ERC20_APPROVE_DATA_LENGTH) {
    return undefined
  }

  const encodedArgs = data.slice(10)
  const spenderWord = encodedArgs.slice(0, 64)
  const amountWord = encodedArgs.slice(64, 128)
  if (spenderWord.length !== 64 || amountWord.length !== 64) {
    return undefined
  }

  let spender: string
  let tokenAddress: string
  let amountRaw: bigint
  try {
    spender = getAddress(`0x${spenderWord.slice(24)}`)
    tokenAddress = getAddress(txRequest.to)
    amountRaw = BigInt(`0x${amountWord}`)
  } catch {
    return undefined
  }

  const metadata = await readErc20Metadata(tokenAddress)
  const amount = typeof metadata.decimals === 'number' ? formatUnits(amountRaw, metadata.decimals) : null

  return {
    type: 'erc20_approve',
    tokenAddress,
    tokenSymbol: metadata.symbol,
    tokenDecimals: metadata.decimals,
    amount,
    amountRaw: amountRaw.toString(),
    spender
  }
}

const parseWalletPermissionRequest = (params: unknown): boolean => {
  if (!Array.isArray(params) || params.length === 0) {
    return false
  }
  const first = params[0]
  return isRecord(first) && isRecord(first.eth_accounts)
}

const getEthAccounts = async (origin: string): Promise<string[]> => {
  const unlocked = await isWalletUnlocked()
  if (!unlocked) {
    return []
  }

  const normalizedOrigin = normalizeOrigin(origin)
  if (!normalizedOrigin) {
    return []
  }
  const authorized = await isOriginAuthorized(normalizedOrigin)
  if (!authorized) {
    return []
  }
  const selectedAddress = await getSelectedAddress()
  return selectedAddress ? [selectedAddress] : []
}

const createApprovalId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`

const createApprovalPageUrl = (approvalId: string): string =>
  chrome.runtime.getURL(`approval.html?approvalId=${encodeURIComponent(approvalId)}`)

const openApprovalWindow = async (approvalId: string): Promise<void> =>
  new Promise((resolve, reject) => {
    chrome.windows.create(
      {
        url: createApprovalPageUrl(approvalId),
        type: 'popup',
        focused: true,
        width: APPROVAL_WINDOW_WIDTH,
        height: APPROVAL_WINDOW_HEIGHT
      },
      () => {
        const runtimeError = chrome.runtime?.lastError
        if (runtimeError) {
          reject(new Error(runtimeError.message))
          return
        }
        resolve()
      }
    )
  })

const clearApprovalWaiter = (approvalId: string): void => {
  const waiter = approvalWaiters.get(approvalId)
  if (!waiter) {
    return
  }
  clearTimeout(waiter.timeoutId)
  approvalWaiters.delete(approvalId)
}

const waitForApprovalDecision = (approvalId: string): Promise<boolean> =>
  new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      approvalWaiters.delete(approvalId)
      resolve(false)
    }, APPROVAL_TIMEOUT_MS)

    approvalWaiters.set(approvalId, {
      resolve: (approved: boolean) => {
        clearTimeout(timeoutId)
        approvalWaiters.delete(approvalId)
        resolve(approved)
      },
      timeoutId
    })
  })

const settleApprovalDecision = (approvalId: string, approved: boolean): boolean => {
  const waiter = approvalWaiters.get(approvalId)
  if (!waiter) {
    return false
  }
  waiter.resolve(approved)
  return true
}

const requestUserApproval = async (
  origin: string,
  method: string,
  details?: PendingApprovalDetails
): Promise<boolean> => {
  const approvalId = createApprovalId()
  const record: PendingApprovalRecord = {
    id: approvalId,
    origin,
    method,
    createdAt: new Date().toISOString(),
    details
  }

  await addPendingApproval(record)
  const approvalDecisionPromise = waitForApprovalDecision(approvalId)

  try {
    await openApprovalWindow(approvalId)
    const approved = await approvalDecisionPromise
    return approved
  } catch {
    clearApprovalWaiter(approvalId)
    throw toRpcError(-32603, '打开授权窗口失败。')
  } finally {
    await removePendingApproval(approvalId)
  }
}

const handleRpcRequest = async (message: RpcRequestMessage): Promise<unknown> => {
  const method = message.payload.method

  if (method === 'eth_requestAccounts') {
    await assertUnlocked()

    const normalizedOrigin = getValidatedOrigin(message.origin)
    const selectedAddress = await getSelectedAddress()
    if (!selectedAddress) {
      throw toRpcError(-32000, '钱包中未选择账户。')
    }

    const isAuthorized = await isOriginAuthorized(normalizedOrigin)
    if (!isAuthorized) {
      const approved = await requestUserApproval(normalizedOrigin, method)
      if (!approved) {
        throw toRpcError(4001, '用户拒绝了站点连接。')
      }
      await authorizeOrigin(normalizedOrigin)
    }

    return [selectedAddress]
  }

  if (method === 'eth_accounts') {
    return getEthAccounts(message.origin)
  }

  if (method === 'eth_chainId') {
    return DEFAULT_EXTENSION_NETWORK.chainId.toLowerCase()
  }

  if (method === 'net_version') {
    return String(DEFAULT_EXTENSION_NETWORK.chainIdDecimal)
  }

  if (method === 'personal_sign') {
    await assertUnlocked()

    const normalizedOrigin = getValidatedOrigin(message.origin)
    await assertAuthorizedOrigin(normalizedOrigin)

    const selectedAddress = await getSelectedAddress()
    if (!selectedAddress) {
      throw toRpcError(-32000, '钱包中未选择账户。')
    }

    const payload = parsePersonalSignPayload(message.payload.params)
    if (payload.address !== normalizeAddress(selectedAddress)) {
      throw toRpcError(4100, '请求账户与当前钱包账户不匹配。')
    }

    const wallet = await getSelectedAccountWallet()
    await requestMethodApproval(normalizedOrigin, method, 'User rejected signature request.')
    return wallet.signMessage(payload.message)
  }

  if (
    method === 'eth_signTypedData' ||
    method === 'eth_signTypedData_v3' ||
    method === 'eth_signTypedData_v4'
  ) {
    await assertUnlocked()

    const normalizedOrigin = getValidatedOrigin(message.origin)
    await assertAuthorizedOrigin(normalizedOrigin)

    const selectedAddress = await getSelectedAddress()
    if (!selectedAddress) {
      throw toRpcError(-32000, '钱包中未选择账户。')
    }

    const payload = parseTypedDataPayloadInput(message.payload.params)
    if (payload.address !== normalizeAddress(selectedAddress)) {
      throw toRpcError(4100, '请求账户与当前钱包账户不匹配。')
    }

    const wallet = await getSelectedAccountWallet()
    await requestMethodApproval(normalizedOrigin, method, 'User rejected typed-data signature request.')
    return wallet.signTypedData(payload.domain, payload.types, payload.message)
  }

  if (method === 'eth_sendTransaction') {
    await assertUnlocked()

    const normalizedOrigin = getValidatedOrigin(message.origin)
    await assertAuthorizedOrigin(normalizedOrigin)

    const selectedAddress = await getSelectedAddress()
    if (!selectedAddress) {
      throw toRpcError(-32000, '钱包中未选择账户。')
    }
    const normalizedSelectedAddress = normalizeAddress(selectedAddress)
    const txRequest = parseSendTransactionRequest(message.payload.params, normalizedSelectedAddress)
    const approvalDetails = await parseErc20ApproveDetails(txRequest)

    const wallet = await getSelectedAccountWallet()
    await requestMethodApproval(
      normalizedOrigin,
      method,
      'User rejected transaction request.',
      approvalDetails
    )
    const tx = await wallet.sendTransaction(txRequest)
    return tx.hash
  }

  if (method === 'wallet_requestPermissions') {
    await assertUnlocked()

    if (!parseWalletPermissionRequest(message.payload.params)) {
      throw toRpcError(-32602, '无效的钱包权限请求。')
    }
    const normalizedOrigin = getValidatedOrigin(message.origin)
    const selectedAddress = await getSelectedAddress()
    if (!selectedAddress) {
      throw toRpcError(-32000, '钱包中未选择账户。')
    }

    const approved = await requestUserApproval(normalizedOrigin, method)
    if (!approved) {
      throw toRpcError(4001, '用户拒绝了权限请求。')
    }
    await authorizeOrigin(normalizedOrigin)

    const permissions: WalletPermission[] = [{ parentCapability: 'eth_accounts' }]
    return permissions
  }

  if (method === 'wallet_getPermissions') {
    const unlocked = await isWalletUnlocked()
    if (!unlocked) {
      return []
    }

    const normalizedOrigin = normalizeOrigin(message.origin)
    if (!normalizedOrigin) {
      return []
    }
    const isAuthorized = await isOriginAuthorized(normalizedOrigin)
    if (!isAuthorized) {
      return []
    }
    const selectedAddress = await getSelectedAddress()
    if (!selectedAddress) {
      return []
    }
    const permissions: WalletPermission[] = [{ parentCapability: 'eth_accounts' }]
    return permissions
  }

  throw toRpcError(-32601, `不支持的方法：${method}`)
}

const handleApprovalGetRequest = async (
  message: ApprovalGetRequestMessage
): Promise<PendingApprovalRecord & { selectedAddress: string | null }> => {
  const approval = await getPendingApprovalById(message.approvalId)
  if (!approval) {
    throw toRpcError(-32000, '未找到授权请求。')
  }

  const selectedAddress = await getSelectedAddress()
  return {
    ...approval,
    selectedAddress
  }
}

const handleApprovalDecisionRequest = async (message: ApprovalDecideRequestMessage): Promise<void> => {
  const approval = await getPendingApprovalById(message.approvalId)
  if (!approval) {
    throw toRpcError(-32000, '未找到授权请求。')
  }

  const settled = settleApprovalDecision(message.approvalId, message.approved)
  await removePendingApproval(message.approvalId)
  if (!settled) {
    throw toRpcError(-32000, '授权请求已失效。')
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('LumiWallet background ready')
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: any) => {
      console.warn('设置侧栏行为失败', error)
    })
  }
})

chrome.runtime.onMessage.addListener(
  (
    rawMessage: unknown,
    _sender: unknown,
    sendResponse: (response: RpcSuccessMessage | RpcFailureMessage | ApprovalGetSuccessMessage | ApprovalDecideSuccessMessage) => void
  ) => {
    if (isRpcRequestMessage(rawMessage)) {
      void (async () => {
        try {
          const result = await handleRpcRequest(rawMessage)
          await recordInteractionLog(rawMessage, 'success', summarizeResult(rawMessage.payload.method, result))
          sendResponse({
            ok: true,
            result
          })
        } catch (error) {
          const fallback = toRpcError(-32603, '内部 RPC 错误。')
          if (isRecord(error) && typeof error.code === 'number' && typeof error.message === 'string') {
            await recordInteractionLog(rawMessage, 'error', {
              code: error.code,
              message: error.message
            })
            sendResponse({
              ok: false,
              error: {
                code: error.code,
                message: error.message,
                data: error.data
              }
            })
            return
          }
          await recordInteractionLog(rawMessage, 'error', {
            code: fallback.code,
            message: fallback.message
          })
          sendResponse({
            ok: false,
            error: fallback
          })
        }
      })()

      return true
    }

    if (isApprovalGetRequestMessage(rawMessage)) {
      void (async () => {
        try {
          const request = await handleApprovalGetRequest(rawMessage)
          sendResponse({
            ok: true,
            request
          })
        } catch (error) {
          const fallback = toRpcError(-32603, '加载授权请求失败。')
          if (isRecord(error) && typeof error.code === 'number' && typeof error.message === 'string') {
            sendResponse({
              ok: false,
              error: {
                code: error.code,
                message: error.message,
                data: error.data
              }
            })
            return
          }
          sendResponse({
            ok: false,
            error: fallback
          })
        }
      })()
      return true
    }

    if (isApprovalDecideRequestMessage(rawMessage)) {
      void (async () => {
        try {
          await handleApprovalDecisionRequest(rawMessage)
          sendResponse({ ok: true })
        } catch (error) {
          const fallback = toRpcError(-32603, '提交授权决定失败。')
          if (isRecord(error) && typeof error.code === 'number' && typeof error.message === 'string') {
            sendResponse({
              ok: false,
              error: {
                code: error.code,
                message: error.message,
                data: error.data
              }
            })
            return
          }
          sendResponse({
            ok: false,
            error: fallback
          })
        }
      })()
      return true
    }

    return false
  }
)
