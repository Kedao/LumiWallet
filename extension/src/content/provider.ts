const INPAGE_SOURCE = 'lumiwallet-inpage'
const CONTENT_SCRIPT_SOURCE = 'lumiwallet-contentscript'
const RPC_REQUEST = 'LUMI_DAPP_RPC_REQUEST'
const RPC_RESPONSE = 'LUMI_DAPP_RPC_RESPONSE'
const INPAGE_BUNDLE_FILENAME = 'inpage.js'
const INPAGE_SCRIPT_ID = 'lumiwallet-inpage-provider'
const CHANNEL_TOKEN_QUERY_KEY = 'lumiChannelToken'

interface JsonRpcErrorPayload {
  code: number
  message: string
  data?: unknown
}

interface InpageRpcRequestPayload {
  method: string
  params?: unknown
}

interface InpageRpcRequestMessage {
  source: typeof INPAGE_SOURCE
  target: typeof CONTENT_SCRIPT_SOURCE
  type: typeof RPC_REQUEST
  id: string
  auth: string
  payload: InpageRpcRequestPayload
}

interface BackgroundRpcRequestMessage {
  type: typeof RPC_REQUEST
  id: string
  origin: string
  payload: InpageRpcRequestPayload
}

interface BackgroundRpcResponseMessage {
  ok: boolean
  result?: unknown
  error?: JsonRpcErrorPayload
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

type InteractionAction = 'login' | 'authorize' | 'query' | 'rpc'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const createChannelToken = (): string => {
  const random = crypto.getRandomValues(new Uint32Array(2))
  return `${Date.now().toString(36)}-${random[0].toString(36)}${random[1].toString(36)}`
}

const CHANNEL_TOKEN = createChannelToken()

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

const isInpageRpcRequestMessage = (value: unknown): value is InpageRpcRequestMessage => {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.source === INPAGE_SOURCE &&
    value.target === CONTENT_SCRIPT_SOURCE &&
    value.type === RPC_REQUEST &&
    typeof value.id === 'string' &&
    typeof value.auth === 'string' &&
    isRecord(value.payload) &&
    typeof value.payload.method === 'string' &&
    value.auth === getRequestAuth(value.id, value.payload.method, value.payload.params)
  )
}

const classifyInteractionAction = (method: string): InteractionAction => {
  if (method === 'eth_requestAccounts') {
    return 'login'
  }
  if (method === 'wallet_requestPermissions' || method === 'wallet_getPermissions') {
    return 'authorize'
  }
  if (method === 'eth_accounts' || method === 'eth_chainId' || method === 'net_version') {
    return 'query'
  }
  return 'rpc'
}

const sendRuntimeMessage = async (
  message: BackgroundRpcRequestMessage
): Promise<BackgroundRpcResponseMessage> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: BackgroundRpcResponseMessage) => {
      const runtimeError = chrome.runtime?.lastError
      if (runtimeError) {
        reject(new Error(runtimeError.message))
        return
      }
      resolve(response)
    })
  })

const postToInpage = (message: InpageRpcResponseMessage) => {
  window.postMessage(message, '*')
}

const forwardRpcRequest = async (message: InpageRpcRequestMessage): Promise<void> => {
  const method = message.payload.method
  const action = classifyInteractionAction(method)
  const origin = window.location.origin

  console.info('[LumiWallet][DApp->Wallet]', {
    id: message.id,
    origin,
    action,
    method
  })

  try {
    const response = await sendRuntimeMessage({
      type: RPC_REQUEST,
      id: message.id,
      origin,
      payload: message.payload
    })

    if (!response) {
      postToInpage({
        source: CONTENT_SCRIPT_SOURCE,
        target: INPAGE_SOURCE,
        type: RPC_RESPONSE,
        id: message.id,
        auth: getResponseAuth(message.id, false, -32603),
        ok: false,
        error: { code: -32603, message: 'Empty response from extension background.' }
      })
      console.error('[LumiWallet][Wallet->DApp]', {
        id: message.id,
        origin,
        action,
        method,
        ok: false,
        error: 'Empty response from extension background.'
      })
      return
    }

    if (!response.ok) {
      console.error('[LumiWallet][Wallet->DApp]', {
        id: message.id,
        origin,
        action,
        method,
        ok: false,
        error: response.error?.message ?? 'Unknown background error.'
      })
    } else {
      console.info('[LumiWallet][Wallet->DApp]', {
        id: message.id,
        origin,
        action,
        method,
        ok: true
      })
    }

    postToInpage({
      source: CONTENT_SCRIPT_SOURCE,
      target: INPAGE_SOURCE,
      type: RPC_RESPONSE,
      id: message.id,
      auth: getResponseAuth(message.id, response.ok, response.error?.code),
      ok: response.ok,
      result: response.result,
      error: response.error
    })
  } catch (error) {
    console.error('[LumiWallet][Wallet->DApp]', {
      id: message.id,
      origin,
      action,
      method,
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to reach extension background.'
    })
    postToInpage({
      source: CONTENT_SCRIPT_SOURCE,
      target: INPAGE_SOURCE,
      type: RPC_RESPONSE,
      id: message.id,
      auth: getResponseAuth(message.id, false, -32603),
      ok: false,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Failed to reach extension background.'
      }
    })
  }
}

const injectInpageScript = () => {
  if (document.getElementById(INPAGE_SCRIPT_ID)) {
    return
  }

  const root = document.head ?? document.documentElement
  if (!root) {
    return
  }

  const script = document.createElement('script')
  script.id = INPAGE_SCRIPT_ID
  script.dataset.lumiChannelToken = CHANNEL_TOKEN
  script.src = chrome.runtime.getURL(
    `${INPAGE_BUNDLE_FILENAME}?${CHANNEL_TOKEN_QUERY_KEY}=${encodeURIComponent(CHANNEL_TOKEN)}`
  )
  script.type = 'text/javascript'
  script.async = false
  script.onload = () => {
    script.remove()
  }
  root.appendChild(script)
}

injectInpageScript()

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.source !== window) {
    return
  }

  if (!isInpageRpcRequestMessage(event.data)) {
    return
  }

  void forwardRpcRequest(event.data)
})

export {}
