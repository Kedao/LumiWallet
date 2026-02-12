import { DEFAULT_EXTENSION_NETWORK } from '../config/networks'

const RPC_REQUEST = 'LUMI_DAPP_RPC_REQUEST'
const APPROVAL_GET_REQUEST = 'LUMI_APPROVAL_GET_REQUEST'
const APPROVAL_DECIDE_REQUEST = 'LUMI_APPROVAL_DECIDE_REQUEST'
const DAPP_PERMISSIONS_STORAGE_KEY = 'lumi.wallet.dapp.permissions.v1'
const DAPP_INTERACTION_LOGS_STORAGE_KEY = 'lumi.wallet.dapp.interactions.v1'
const DAPP_PENDING_APPROVALS_STORAGE_KEY = 'lumi.wallet.dapp.pending-approvals.v1'
const ACCOUNTS_STORAGE_KEY = 'lumi.wallet.accounts.v1'
const WALLET_SESSION_STATE_KEY = 'lumi.wallet.session.v1'
const MAX_DAPP_INTERACTION_LOGS = 300
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000
const APPROVAL_WINDOW_WIDTH = 380
const APPROVAL_WINDOW_HEIGHT = 640

let interactionLogWriteQueue: Promise<void> = Promise.resolve()

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

type DappInteractionAction = 'login' | 'authorize' | 'account_query' | 'network_query' | 'rpc'

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
}

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
  return value.accounts.every((item) => isRecord(item) && typeof item.address === 'string')
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

const isDappInteractionAction = (value: unknown): value is DappInteractionAction =>
  value === 'login' ||
  value === 'authorize' ||
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
    typeof value.createdAt === 'string'
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
    console.warn('[LumiWallet][DApp] Failed to persist interaction log', error)
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
    throw toRpcError(4100, 'Invalid request origin.')
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

const requestUserApproval = async (origin: string, method: string): Promise<boolean> => {
  const approvalId = createApprovalId()
  const record: PendingApprovalRecord = {
    id: approvalId,
    origin,
    method,
    createdAt: new Date().toISOString()
  }

  await addPendingApproval(record)
  const approvalDecisionPromise = waitForApprovalDecision(approvalId)

  try {
    await openApprovalWindow(approvalId)
    const approved = await approvalDecisionPromise
    return approved
  } catch {
    clearApprovalWaiter(approvalId)
    throw toRpcError(-32603, 'Failed to open approval window.')
  } finally {
    await removePendingApproval(approvalId)
  }
}

const handleRpcRequest = async (message: RpcRequestMessage): Promise<unknown> => {
  const method = message.payload.method

  if (method === 'eth_requestAccounts') {
    const unlocked = await isWalletUnlocked()
    if (!unlocked) {
      throw toRpcError(4100, 'Wallet is locked. Please unlock LumiWallet first.')
    }

    const normalizedOrigin = getValidatedOrigin(message.origin)
    const selectedAddress = await getSelectedAddress()
    if (!selectedAddress) {
      throw toRpcError(-32000, 'No account selected in wallet.')
    }

    const isAuthorized = await isOriginAuthorized(normalizedOrigin)
    if (!isAuthorized) {
      const approved = await requestUserApproval(normalizedOrigin, method)
      if (!approved) {
        throw toRpcError(4001, 'User rejected site connection.')
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

  if (method === 'wallet_requestPermissions') {
    const unlocked = await isWalletUnlocked()
    if (!unlocked) {
      throw toRpcError(4100, 'Wallet is locked. Please unlock LumiWallet first.')
    }

    if (!parseWalletPermissionRequest(message.payload.params)) {
      throw toRpcError(-32602, 'Invalid wallet permission request.')
    }
    const normalizedOrigin = getValidatedOrigin(message.origin)
    const selectedAddress = await getSelectedAddress()
    if (!selectedAddress) {
      throw toRpcError(-32000, 'No account selected in wallet.')
    }

    const approved = await requestUserApproval(normalizedOrigin, method)
    if (!approved) {
      throw toRpcError(4001, 'User rejected permission request.')
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

  throw toRpcError(-32601, `Unsupported method: ${method}`)
}

const handleApprovalGetRequest = async (
  message: ApprovalGetRequestMessage
): Promise<PendingApprovalRecord & { selectedAddress: string | null }> => {
  const approval = await getPendingApprovalById(message.approvalId)
  if (!approval) {
    throw toRpcError(-32000, 'Approval request not found.')
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
    throw toRpcError(-32000, 'Approval request not found.')
  }

  const settled = settleApprovalDecision(message.approvalId, message.approved)
  await removePendingApproval(message.approvalId)
  if (!settled) {
    throw toRpcError(-32000, 'Approval request is no longer active.')
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('LumiWallet background ready')
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: any) => {
      console.warn('Failed to set panel behavior', error)
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
          const fallback = toRpcError(-32603, 'Internal RPC error.')
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
          const fallback = toRpcError(-32603, 'Failed to load approval request.')
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
          const fallback = toRpcError(-32603, 'Failed to submit approval decision.')
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
