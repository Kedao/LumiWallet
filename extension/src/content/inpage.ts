const INPAGE_SOURCE = 'lumiwallet-inpage'
const CONTENT_SCRIPT_SOURCE = 'lumiwallet-contentscript'
const RPC_REQUEST = 'LUMI_DAPP_RPC_REQUEST'
const RPC_RESPONSE = 'LUMI_DAPP_RPC_RESPONSE'
const PROVIDER_REQUEST_TIMEOUT_MS = 15_000
const CHANNEL_TOKEN_QUERY_KEY = 'lumiChannelToken'

interface ProviderRequestArgs {
  method: string
  params?: unknown
}

interface JsonRpcErrorPayload {
  code: number
  message: string
  data?: unknown
}

interface InpageRpcRequestMessage {
  source: typeof INPAGE_SOURCE
  target: typeof CONTENT_SCRIPT_SOURCE
  type: typeof RPC_REQUEST
  id: string
  auth: string
  payload: ProviderRequestArgs
}

interface InpageRpcResponseMessage {
  source: typeof CONTENT_SCRIPT_SOURCE
  target: typeof INPAGE_SOURCE
  type: typeof RPC_RESPONSE
  id: string
  auth: string
  ok: boolean
  result?: unknown
  error?: JsonRpcErrorPayload
}

type ProviderListener = (...args: unknown[]) => void

interface PendingRequest {
  method: string
  timeoutId: number
  resolve: (result: unknown) => void
  reject: (error: Error) => void
}

class ProviderRpcError extends Error {
  code: number
  data?: unknown

  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.code = code
    this.data = data
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const resolveChannelToken = (): string => {
  const currentScript = document.currentScript
  if (currentScript instanceof HTMLScriptElement) {
    const tokenFromDataset = currentScript.dataset.lumiChannelToken?.trim()
    if (tokenFromDataset) {
      return tokenFromDataset
    }

    try {
      const scriptUrl = new URL(currentScript.src)
      const tokenFromQuery = scriptUrl.searchParams.get(CHANNEL_TOKEN_QUERY_KEY)?.trim()
      if (tokenFromQuery) {
        return tokenFromQuery
      }
    } catch {
      return ''
    }
  }
  return ''
}

const CHANNEL_TOKEN = resolveChannelToken()

const createChannelAuth = (...parts: string[]): string => {
  const payload = [...parts, CHANNEL_TOKEN].join('|')
  let hash = 2166136261
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

const stringifyForAuth = (value: unknown): string => {
  try {
    return JSON.stringify(value, (_, item) => {
      if (typeof item === 'bigint') {
        return `bigint:${item.toString()}`
      }
      return item
    }) ?? 'null'
  } catch {
    return String(value)
  }
}

const getRequestAuth = (id: string, method: string, params?: unknown): string =>
  createChannelAuth('req', id, method, stringifyForAuth(params))

const getResponseAuth = (id: string, ok: boolean, errorCode?: number): string =>
  createChannelAuth('res', id, String(ok), String(errorCode ?? 0))

const isInpageRpcResponseMessage = (value: unknown): value is InpageRpcResponseMessage => {
  if (!isRecord(value)) {
    return false
  }
  if (typeof value.ok !== 'boolean') {
    return false
  }

  return (
    value.source === CONTENT_SCRIPT_SOURCE &&
    value.target === INPAGE_SOURCE &&
    value.type === RPC_RESPONSE &&
    typeof value.id === 'string' &&
    typeof value.auth === 'string' &&
    value.auth === getResponseAuth(
      value.id,
      value.ok,
      isRecord(value.error) && typeof value.error.code === 'number' ? value.error.code : undefined
    )
  )
}

class LumiEthereumProvider {
  isLumiWallet = true
  selectedAddress: string | null = null
  chainId: string | null = null

  private nextRequestId = 0
  private pending = new Map<string, PendingRequest>()
  private listeners = new Map<string, Set<ProviderListener>>()

  constructor() {
    window.addEventListener('message', this.handleWindowMessage)
  }

  request = async (args: ProviderRequestArgs): Promise<unknown> => {
    if (!CHANNEL_TOKEN) {
      throw new ProviderRpcError(-32603, 'Provider channel token is missing.')
    }

    if (!isRecord(args) || typeof args.method !== 'string' || args.method.trim().length === 0) {
      throw new ProviderRpcError(-32600, 'Invalid request method.')
    }

    const method = args.method.trim()
    const id = `${Date.now()}-${this.nextRequestId}`
    this.nextRequestId += 1

    return new Promise<unknown>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        const pendingRequest = this.takePendingRequest(id)
        if (!pendingRequest) {
          return
        }
        pendingRequest.reject(
          new ProviderRpcError(
            -32603,
            `Provider request timed out after ${PROVIDER_REQUEST_TIMEOUT_MS}ms.`
          )
        )
      }, PROVIDER_REQUEST_TIMEOUT_MS)

      this.pending.set(id, { method, timeoutId, resolve, reject })
      const message: InpageRpcRequestMessage = {
        source: INPAGE_SOURCE,
        target: CONTENT_SCRIPT_SOURCE,
        type: RPC_REQUEST,
        id,
        auth: getRequestAuth(id, method, args.params),
        payload: {
          method,
          params: args.params
        }
      }

      try {
        window.postMessage(message, '*')
      } catch {
        const pendingRequest = this.takePendingRequest(id)
        pendingRequest?.reject(new ProviderRpcError(-32603, 'Failed to dispatch provider request.'))
      }
    })
  }

  enable = async (): Promise<unknown> =>
    this.request({ method: 'eth_requestAccounts' })

  send = async (methodOrPayload: string | ProviderRequestArgs, params?: unknown): Promise<unknown> => {
    if (typeof methodOrPayload === 'string') {
      return this.request({ method: methodOrPayload, params })
    }
    return this.request(methodOrPayload)
  }

  on = (eventName: string, listener: ProviderListener): this => {
    const listeners = this.listeners.get(eventName) ?? new Set<ProviderListener>()
    listeners.add(listener)
    this.listeners.set(eventName, listeners)
    return this
  }

  removeListener = (eventName: string, listener: ProviderListener): this => {
    const listeners = this.listeners.get(eventName)
    if (!listeners) {
      return this
    }
    listeners.delete(listener)
    if (listeners.size === 0) {
      this.listeners.delete(eventName)
    }
    return this
  }

  private emit = (eventName: string, ...args: unknown[]) => {
    const listeners = this.listeners.get(eventName)
    if (!listeners) {
      return
    }
    listeners.forEach((listener) => listener(...args))
  }

  private takePendingRequest = (requestId: string): PendingRequest | null => {
    const request = this.pending.get(requestId)
    if (!request) {
      return null
    }
    this.pending.delete(requestId)
    window.clearTimeout(request.timeoutId)
    return request
  }

  private handleWindowMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== window) {
      return
    }
    if (!isInpageRpcResponseMessage(event.data)) {
      return
    }

    const request = this.takePendingRequest(event.data.id)
    if (!request) {
      return
    }

    if (!event.data.ok) {
      const code = event.data.error?.code ?? -32603
      const message = event.data.error?.message ?? 'Unknown provider error.'
      request.reject(new ProviderRpcError(code, message, event.data.error?.data))
      return
    }

    this.applyStateFromResult(request.method, event.data.result)
    request.resolve(event.data.result)
  }

  private applyStateFromResult = (method: string, result: unknown) => {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
      const nextAccounts = Array.isArray(result)
        ? result.filter((item): item is string => typeof item === 'string')
        : []
      const nextAddress = nextAccounts[0] ?? null
      if (nextAddress !== this.selectedAddress) {
        this.selectedAddress = nextAddress
        this.emit('accountsChanged', nextAccounts)
      }
      return
    }

    if (method === 'eth_chainId' && typeof result === 'string') {
      if (result !== this.chainId) {
        this.chainId = result
        this.emit('chainChanged', result)
      }
    }
  }
}

declare global {
  interface Window {
    ethereum?: unknown
    __lumiWalletProviderInjected__?: boolean
  }
}

const asProviderList = (ethereum: unknown): unknown[] => {
  if (!isRecord(ethereum)) {
    return []
  }
  if (Array.isArray(ethereum.providers)) {
    return ethereum.providers
  }
  return [ethereum]
}

const hasLumiProvider = (providers: unknown[]): boolean =>
  providers.some((item) => isRecord(item) && item.isLumiWallet === true)

const attachLumiProviderToWindowEthereum = (lumiProvider: LumiEthereumProvider): void => {
  const existingEthereum = window.ethereum
  if (!existingEthereum) {
    ;(lumiProvider as unknown as { providers: unknown[] }).providers = [lumiProvider]
    Object.defineProperty(window, 'ethereum', {
      value: lumiProvider,
      writable: false
    })
    return
  }

  if (!isRecord(existingEthereum)) {
    return
  }

  const providers = asProviderList(existingEthereum)
  if (!hasLumiProvider(providers)) {
    providers.push(lumiProvider)
  }
  existingEthereum.providers = providers
}

if (!window.__lumiWalletProviderInjected__) {
  const providers = asProviderList(window.ethereum)
  const existingLumiProvider = providers.find(
    (item) => isRecord(item) && item.isLumiWallet === true
  )

  if (!existingLumiProvider) {
    const lumiProvider = new LumiEthereumProvider()
    attachLumiProviderToWindowEthereum(lumiProvider)
  }

  window.__lumiWalletProviderInjected__ = true
  window.dispatchEvent(new Event('ethereum#initialized'))
}

export {}
