import { Balance, TransactionRecord, WalletAccount } from '../types/models'
import {
  Contract,
  ContractTransactionResponse,
  computeAddress,
  formatEther,
  formatUnits,
  getAddress,
  getBytes,
  hexlify,
  isHexString,
  JsonRpcProvider,
  parseEther,
  parseUnits,
  randomBytes as ethersRandomBytes,
  Wallet
} from 'ethers'
import { DEFAULT_EXTENSION_NETWORK } from '../config/networks'

interface StoredPbkdf2Config {
  algorithm: 'PBKDF2'
  hash: 'SHA-256'
  iterations: number
  saltBase64: string
}

interface StoredCipherConfig {
  algorithm: 'AES-GCM'
  ivBase64: string
}

interface StoredWalletVaultV2 {
  version: 2
  kdf: StoredPbkdf2Config
  cipher: StoredCipherConfig
  vaultCiphertextBase64: string
  createdAt: string
}

interface WalletVaultPayload {
  privateKeyHex: string
}

interface StoredImportedAccount {
  address: string
  label?: string
  cipher: {
    algorithm: 'AES-GCM'
    ivBase64: string
  }
  privateKeyCiphertextBase64: string
  importedAt: string
}

interface StoredAccountsV1 {
  version: 1
  selectedAddress: string | null
  accounts: StoredImportedAccount[]
}

interface AccountState {
  accounts: WalletAccount[]
  selectedAddress: string | null
}

interface StoredActivityItemV1 {
  accountAddress: string
  id: string
  type: TransactionRecord['type']
  timestamp: number
  amount: string
  status: TransactionRecord['status']
  to?: string
  contract?: string
  hash?: string
}

interface StoredActivityV1 {
  version: 1
  items: StoredActivityItemV1[]
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

export type SwapTargetToken = 'MON' | 'eGold'

export interface SwapQuote {
  inputToken: SwapTargetToken
  outputToken: SwapTargetToken
  inputAmount: string
  expectedOutputAmount: string
}

export interface SwapSlippagePoolRiskStats {
  poolAddress: string
  priceImpactPct: number | null
  poolTokenPayAmount: string | null
  poolTokenGetAmount: string | null
}

export interface LocalActivityInput {
  type: 'transfer' | 'dex'
  amount: string
  hash: string
  to?: string
}

export interface RecentAddressTransaction {
  hash: string
  blockNumber: number
  timestamp: number
  from: string
  to: string | null
  value: string
  direction: 'in' | 'out' | 'self'
  counterparty: string
  success: boolean | null
  tokenAddress: string | null
  tokenDecimals: number | null
  methodSig: string | null
  contractAddress: string | null
  phishingValue: string | null
}

export interface RecentAddressTransactionSummary {
  address: string
  fetchedAt: number
  requestedLimit: number
  total: number
  incomingCount: number
  outgoingCount: number
  selfCount: number
  records: RecentAddressTransaction[]
}

export interface AddressLifecycleInfo {
  first_seen_timestamp?: number
  last_seen_timestamp?: number
  active_days?: number
  account_age_days?: number
  gas_funder?: string
}

const AUTH_STORAGE_KEY = 'lumi.wallet.auth.v1'
const ACCOUNTS_STORAGE_KEY = 'lumi.wallet.accounts.v1'
const ACTIVITY_STORAGE_KEY = 'lumi.wallet.activity.v1'
const WALLET_SESSION_STATE_KEY = 'lumi.wallet.session.v1'
const WALLET_SESSION_SECRET_KEY = 'lumi.wallet.session.secret.v1'
const DAPP_PERMISSIONS_STORAGE_KEY = 'lumi.wallet.dapp.permissions.v1'
const PBKDF2_ITERATIONS = 600_000
const PBKDF2_SALT_BYTES = 16
const AES_GCM_IV_BYTES = 12
const PRIVATE_KEY_BYTES = 32
const MAX_ACTIVITY_RECORDS_PER_ACCOUNT = 50
const RECENT_ADDRESS_TX_LIMIT = 5
const MONADSCAN_V2_API_BASE_URL = 'https://api.etherscan.io/v2/api'
const MONADSCAN_API_KEY = String(import.meta.env.VITE_MONADSCAN_API_KEY ?? '').trim()
const EGOLD_CONTRACT_ADDRESS = getAddress('0xee7977f3854377f6b8bdf6d0b715277834936b24')
const AMM_CONTRACT_ADDRESS = getAddress('0x64a359881660bc623017a660f2322489c4cdda8b')
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function transfer(address to, uint256 amount) returns (bool)'
]
const AMM_ABI = [
  'function getReserves() view returns (uint256 reserveMON, uint256 reserveEGold)',
  'function getAmountOutMONToToken(uint256 amountIn) view returns (uint256 amountOut)',
  'function getAmountOutTokenToMON(uint256 amountIn) view returns (uint256 amountOut)',
  'function swapExactMONForTokens(address to, uint256 deadline) payable',
  'function swapExactTokensForMON(uint256 amountIn, address to, uint256 deadline)'
]
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const provider = new JsonRpcProvider(DEFAULT_EXTENSION_NETWORK.rpcUrls[0])
const eGoldContract = new Contract(EGOLD_CONTRACT_ADDRESS, ERC20_ABI, provider)
const ammContract = new Contract(AMM_CONTRACT_ADDRESS, AMM_ABI, provider)
let sessionSecretHex: string | null = null
const erc20DecimalsCache = new Map<string, Promise<number | null>>()

const ERC20_TRANSFER_METHOD_ID = '0xa9059cbb'
const ERC20_APPROVE_METHOD_ID = '0x095ea7b3'
const ERC20_TRANSFER_FROM_METHOD_ID = '0x23b872dd'

const normalizeOptionalAddress = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  try {
    return normalizeAddress(trimmed)
  } catch {
    return null
  }
}

const getMethodIdFromCallData = (input: string): string | null => {
  const trimmed = input.trim()
  if (!isHexString(trimmed) || trimmed.length < 10) {
    return null
  }
  return trimmed.slice(0, 10).toLowerCase()
}

const parseUint256ParamFromCallData = (input: string, paramIndex: number): bigint | null => {
  const trimmed = input.trim()
  if (!isHexString(trimmed) || trimmed.length < 10) {
    return null
  }
  const start = 10 + (paramIndex * 64)
  const end = start + 64
  if (trimmed.length < end) {
    return null
  }
  const word = trimmed.slice(start, end)
  if (!/^[0-9a-fA-F]{64}$/.test(word)) {
    return null
  }
  try {
    return BigInt(`0x${word}`)
  } catch {
    return null
  }
}

const getKnownTokenDecimals = (tokenAddress: string): number | null => {
  if (tokenAddress === EGOLD_CONTRACT_ADDRESS) {
    return 18
  }
  return null
}

const getErc20TokenDecimals = async (tokenAddress: string): Promise<number | null> => {
  const known = getKnownTokenDecimals(tokenAddress)
  if (known !== null) {
    return known
  }

  const cached = erc20DecimalsCache.get(tokenAddress)
  if (cached) {
    return cached
  }

  const pending = (async () => {
    try {
      const contract = new Contract(tokenAddress, ERC20_ABI, provider)
      const raw = await contract.decimals()
      const value = typeof raw === 'bigint' ? Number(raw) : Number(raw)
      if (!Number.isInteger(value) || value < 0 || value > 255) {
        return null
      }
      return value
    } catch {
      return null
    }
  })()
  erc20DecimalsCache.set(tokenAddress, pending)
  return pending
}

const canUseChromeStorage = () =>
  typeof chrome !== 'undefined' && Boolean(chrome?.storage?.local)

const canUseChromeSessionStorage = () =>
  typeof chrome !== 'undefined' && Boolean(chrome?.storage?.session)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isWalletVaultV2 = (value: unknown): value is StoredWalletVaultV2 => {
  if (!isRecord(value)) {
    return false
  }
  if (value.version !== 2) {
    return false
  }

  const kdf = value.kdf
  const cipher = value.cipher

  if (
    !isRecord(kdf) ||
    kdf.algorithm !== 'PBKDF2' ||
    kdf.hash !== 'SHA-256' ||
    typeof kdf.iterations !== 'number' ||
    typeof kdf.saltBase64 !== 'string'
  ) {
    return false
  }
  if (
    !isRecord(cipher) ||
    cipher.algorithm !== 'AES-GCM' ||
    typeof cipher.ivBase64 !== 'string'
  ) {
    return false
  }

  return (
    typeof value.vaultCiphertextBase64 === 'string' &&
    typeof value.createdAt === 'string'
  )
}

const isStoredImportedAccount = (value: unknown): value is StoredImportedAccount => {
  if (!isRecord(value)) {
    return false
  }

  const cipher = value.cipher
  return (
    typeof value.address === 'string' &&
    (typeof value.label === 'string' || typeof value.label === 'undefined') &&
    isRecord(cipher) &&
    cipher.algorithm === 'AES-GCM' &&
    typeof cipher.ivBase64 === 'string' &&
    typeof value.privateKeyCiphertextBase64 === 'string' &&
    typeof value.importedAt === 'string'
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

const isTransactionType = (value: unknown): value is TransactionRecord['type'] =>
  value === 'transfer' || value === 'contract' || value === 'dex'

const isTransactionStatus = (value: unknown): value is TransactionRecord['status'] =>
  value === 'pending' || value === 'success' || value === 'failed'

const isStoredActivityItemV1 = (value: unknown): value is StoredActivityItemV1 => {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.accountAddress === 'string' &&
    typeof value.id === 'string' &&
    isTransactionType(value.type) &&
    typeof value.timestamp === 'number' &&
    Number.isFinite(value.timestamp) &&
    typeof value.amount === 'string' &&
    isTransactionStatus(value.status) &&
    (typeof value.to === 'string' || typeof value.to === 'undefined') &&
    (typeof value.contract === 'string' || typeof value.contract === 'undefined') &&
    (typeof value.hash === 'string' || typeof value.hash === 'undefined')
  )
}

const isStoredActivityV1 = (value: unknown): value is StoredActivityV1 => {
  if (!isRecord(value)) {
    return false
  }
  return (
    value.version === 1 &&
    Array.isArray(value.items) &&
    value.items.every((item) => isStoredActivityItemV1(item))
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

const isTxHash = (value: string): boolean =>
  isHexString(value, 32)

const toTransactionRecord = (item: StoredActivityItemV1): TransactionRecord => ({
  id: item.id,
  type: item.type,
  timestamp: item.timestamp,
  amount: item.amount,
  status: item.status,
  to: item.to,
  contract: item.contract,
  hash: item.hash
})

const toStoredActivityItem = (
  accountAddress: string,
  input: LocalActivityInput,
  status: TransactionRecord['status']
): StoredActivityItemV1 => {
  const normalizedAmount = input.amount.trim()
  if (!normalizedAmount) {
    throw new Error('交易金额不能为空。')
  }

  const txHash = input.hash.trim()
  if (!isTxHash(txHash)) {
    throw new Error('无效的交易哈希。')
  }

  const timestamp = Date.now()
  const normalizedCounterparty = input.to
    ? validateAddress(input.to)
    : input.type === 'dex'
      ? normalizeAddress(AMM_CONTRACT_ADDRESS)
      : undefined
  return {
    accountAddress,
    id: txHash,
    type: input.type,
    timestamp,
    amount: normalizedAmount,
    status,
    to: normalizedCounterparty,
    contract: input.type === 'dex' ? normalizeAddress(AMM_CONTRACT_ADDRESS) : undefined,
    hash: txHash
  }
}

const resolveActivityStatus = async (txHash: string): Promise<TransactionRecord['status']> => {
  try {
    const receipt = await provider.getTransactionReceipt(txHash)
    if (!receipt) {
      return 'pending'
    }
    return receipt.status === 1 ? 'success' : 'failed'
  } catch {
    return 'pending'
  }
}

const sanitizeActivityItems = (
  items: StoredActivityItemV1[],
  accountAddress: string
): StoredActivityItemV1[] => {
  const currentAccountItems = items
    .filter((item) => item.accountAddress === accountAddress)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_ACTIVITY_RECORDS_PER_ACCOUNT)
  const otherAccountItems = items.filter((item) => item.accountAddress !== accountAddress)
  return [...currentAccountItems, ...otherAccountItems]
}

const mergeNewActivityRecord = (
  stored: StoredActivityV1,
  record: StoredActivityItemV1
): StoredActivityV1 => {
  const deduped = [
    record,
    ...stored.items.filter((item) => !(item.accountAddress === record.accountAddress && item.id === record.id))
  ]
  return {
    version: 1,
    items: sanitizeActivityItems(deduped, record.accountAddress)
  }
}

const getStoredActivity = async (): Promise<StoredActivityV1> => {
  const raw = await getStoredItem(ACTIVITY_STORAGE_KEY)
  if (!isStoredActivityV1(raw)) {
    return {
      version: 1,
      items: []
    }
  }
  return raw
}

const setStoredActivity = async (payload: StoredActivityV1): Promise<void> =>
  setStoredItem(ACTIVITY_STORAGE_KEY, payload)

const getActivityByAccount = (
  stored: StoredActivityV1,
  accountAddress: string
): TransactionRecord[] =>
  stored.items
    .filter((item) => item.accountAddress === accountAddress)
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((item) => toTransactionRecord(item))

const reconcilePendingActivityStatuses = async (
  stored: StoredActivityV1,
  accountAddress: string
): Promise<{ nextStored: StoredActivityV1; hasChanged: boolean }> => {
  let hasChanged = false
  const nextItems = await Promise.all(
    stored.items.map(async (item) => {
      if (item.accountAddress !== accountAddress || item.status !== 'pending' || !item.hash) {
        return item
      }

      const nextStatus = await resolveActivityStatus(item.hash)
      if (nextStatus === item.status) {
        return item
      }

      hasChanged = true
      return {
        ...item,
        status: nextStatus
      }
    })
  )

  return {
    nextStored: hasChanged
      ? {
        ...stored,
        items: nextItems
      }
      : stored,
    hasChanged
  }
}

const getBlockExplorerBaseUrl = (): string =>
  DEFAULT_EXTENSION_NETWORK.blockExplorerUrls?.[0]?.replace(/\/+$/, '') ?? ''

export const getExplorerTxUrl = (txHash: string): string => {
  const base = getBlockExplorerBaseUrl()
  const hash = txHash.trim()
  if (!base || !hash) {
    return ''
  }

  return `${base}/tx/${hash}`
}

const getStoredItem = async (key: string): Promise<unknown | null> => {
  if (canUseChromeStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (items: Record<string, unknown>) => {
        resolve(items[key] ?? null)
      })
    })
  }

  const raw = localStorage.getItem(key)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

const setStoredItem = async (key: string, payload: unknown): Promise<void> => {
  if (canUseChromeStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: payload }, () => resolve())
    })
  }
  localStorage.setItem(key, JSON.stringify(payload))
}

const getSessionItem = async (key: string): Promise<unknown | null> => {
  if (canUseChromeSessionStorage()) {
    return new Promise((resolve) => {
      chrome.storage.session.get([key], (items: Record<string, unknown>) => {
        resolve(items[key] ?? null)
      })
    })
  }

  const raw = sessionStorage.getItem(key)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

const setSessionItem = async (key: string, payload: unknown): Promise<void> => {
  if (canUseChromeSessionStorage()) {
    return new Promise((resolve) => {
      chrome.storage.session.set({ [key]: payload }, () => resolve())
    })
  }

  sessionStorage.setItem(key, JSON.stringify(payload))
}

const removeSessionItem = async (key: string): Promise<void> => {
  if (canUseChromeSessionStorage()) {
    return new Promise((resolve) => {
      chrome.storage.session.remove([key], () => resolve())
    })
  }

  sessionStorage.removeItem(key)
}

const setWalletSessionUnlocked = async (unlocked: boolean): Promise<void> => {
  await setSessionItem(WALLET_SESSION_STATE_KEY, {
    version: 1,
    unlocked,
    updatedAt: new Date().toISOString()
  } satisfies StoredWalletSessionStateV1)
}

const setWalletSessionSecret = async (secretHex: string | null): Promise<void> => {
  if (!secretHex) {
    await removeSessionItem(WALLET_SESSION_SECRET_KEY)
    return
  }

  await setSessionItem(WALLET_SESSION_SECRET_KEY, {
    version: 1,
    secretHex,
    updatedAt: new Date().toISOString()
  } satisfies StoredWalletSessionSecretV1)
}

const clearDappOriginPermissions = async (): Promise<void> => {
  await setStoredItem(DAPP_PERMISSIONS_STORAGE_KEY, {
    version: 1,
    allowedOrigins: []
  })
}

export const isWalletSessionUnlocked = async (): Promise<boolean> => {
  const raw = await getSessionItem(WALLET_SESSION_STATE_KEY)
  if (!isStoredWalletSessionStateV1(raw)) {
    return false
  }
  return raw.unlocked
}

const randomBytes = (size: number): Uint8Array => ethersRandomBytes(size)

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const normalizeAddress = (address: string): string => address.trim().toLowerCase()

const normalizePrivateKey = (privateKey: string): string =>
  privateKey.trim().toLowerCase().replace(/^0x/, '')

const validateAddress = (address: string): string => {
  try {
    return normalizeAddress(getAddress(address.trim()))
  } catch {
    throw new Error('地址格式无效。')
  }
}

const validateAddressIgnoreChecksum = (address: string): string => {
  try {
    return normalizeAddress(getAddress(address.trim().toLowerCase()))
  } catch {
    throw new Error('地址格式无效。')
  }
}

const validatePrivateKey = (privateKey: string): string => {
  const normalized = normalizePrivateKey(privateKey)
  const prefixed = `0x${normalized}`
  if (!isHexString(prefixed, PRIVATE_KEY_BYTES)) {
    throw new Error('私钥格式无效。')
  }
  try {
    computeAddress(prefixed)
  } catch {
    throw new Error('私钥格式无效。')
  }
  return normalized
}

const deriveAddressFromPrivateKey = (privateKeyHex: string): string => {
  try {
    return normalizeAddress(getAddress(computeAddress(`0x${privateKeyHex}`)))
  } catch {
    throw new Error('私钥格式无效。')
  }
}

const deriveEncryptionKey = async (
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> => {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      iterations
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256
    },
    false,
    ['encrypt', 'decrypt']
  )
}

const encryptVaultPayload = async (
  payload: WalletVaultPayload,
  password: string
): Promise<{
  kdf: StoredPbkdf2Config
  cipher: StoredCipherConfig
  vaultCiphertextBase64: string
}> => {
  const salt = randomBytes(PBKDF2_SALT_BYTES)
  const iv = randomBytes(AES_GCM_IV_BYTES)
  const key = await deriveEncryptionKey(password, salt, PBKDF2_ITERATIONS)

  const plaintext = textEncoder.encode(JSON.stringify(payload))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(plaintext)
  )

  return {
    kdf: {
      algorithm: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      saltBase64: toBase64(salt)
    },
    cipher: {
      algorithm: 'AES-GCM',
      ivBase64: toBase64(iv)
    },
    vaultCiphertextBase64: toBase64(new Uint8Array(ciphertext))
  }
}

const decryptVaultPayload = async (
  payload: StoredWalletVaultV2,
  password: string
): Promise<WalletVaultPayload> => {
  const salt = fromBase64(payload.kdf.saltBase64)
  const iv = fromBase64(payload.cipher.ivBase64)
  const ciphertext = fromBase64(payload.vaultCiphertextBase64)

  const key = await deriveEncryptionKey(password, salt, payload.kdf.iterations)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(ciphertext)
  )

  const parsed = JSON.parse(textDecoder.decode(new Uint8Array(decrypted))) as unknown
  if (!isRecord(parsed) || typeof parsed.privateKeyHex !== 'string') {
    throw new Error('钱包金库数据无效。')
  }

  const privateKeyHex = normalizePrivateKey(parsed.privateKeyHex)
  const prefixed = `0x${privateKeyHex}`
  if (!isHexString(prefixed, PRIVATE_KEY_BYTES)) {
    throw new Error('钱包金库密钥无效。')
  }
  try {
    computeAddress(prefixed)
  } catch {
    throw new Error('钱包金库密钥无效。')
  }

  return { privateKeyHex }
}

const createPrivateKeyHex = (): string => hexlify(randomBytes(PRIVATE_KEY_BYTES)).slice(2)

const getVaultV2 = async (): Promise<StoredWalletVaultV2 | null> => {
  const raw = await getStoredItem(AUTH_STORAGE_KEY)
  if (!isWalletVaultV2(raw)) {
    return null
  }
  return raw
}

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

const setStoredAccounts = async (payload: StoredAccountsV1): Promise<void> =>
  setStoredItem(ACCOUNTS_STORAGE_KEY, payload)

const deriveAccountEncryptionKey = async (): Promise<CryptoKey> => {
  if (!sessionSecretHex) {
    throw new Error('钱包已锁定。')
  }
  const secretBytes = getBytes(`0x${sessionSecretHex}`)
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(new Uint8Array(secretBytes)),
    {
      name: 'AES-GCM',
      length: 256
    },
    false,
    ['encrypt', 'decrypt']
  )
}

const encryptImportedPrivateKey = async (privateKeyHex: string): Promise<{
  ivBase64: string
  privateKeyCiphertextBase64: string
}> => {
  const iv = randomBytes(AES_GCM_IV_BYTES)
  const key = await deriveAccountEncryptionKey()
  const plaintext = textEncoder.encode(privateKeyHex)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(plaintext)
  )
  return {
    ivBase64: toBase64(iv),
    privateKeyCiphertextBase64: toBase64(new Uint8Array(ciphertext))
  }
}

const normalizeAccountState = (stored: StoredAccountsV1): AccountState => {
  const accounts: WalletAccount[] = stored.accounts.map((item, index) => ({
    address: item.address,
    label: item.label ?? `Account ${index + 1}`
  }))
  const hasSelected = accounts.some((item) => item.address === stored.selectedAddress)
  return {
    accounts,
    selectedAddress: hasSelected ? stored.selectedAddress : accounts[0]?.address ?? null
  }
}

const getSelectedStoredAccount = async (): Promise<StoredImportedAccount | null> => {
  const stored = await getStoredAccounts()
  if (!stored.selectedAddress) {
    return null
  }
  return stored.accounts.find((item) => item.address === stored.selectedAddress) ?? null
}

const decryptImportedPrivateKey = async (account: StoredImportedAccount): Promise<string> => {
  if (!sessionSecretHex) {
    throw new Error('钱包已锁定。')
  }

  try {
    const key = await deriveAccountEncryptionKey()
    const iv = fromBase64(account.cipher.ivBase64)
    const ciphertext = fromBase64(account.privateKeyCiphertextBase64)
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(ciphertext)
    )
    const decoded = textDecoder.decode(new Uint8Array(plaintext))
    return validatePrivateKey(decoded)
  } catch {
    throw new Error('无法解密账户私钥。')
  }
}

const getSelectedAccountWallet = async (): Promise<{ account: StoredImportedAccount; wallet: Wallet }> => {
  const account = await getSelectedStoredAccount()
  if (!account) {
    throw new Error('未选择账户。')
  }

  const privateKeyHex = await decryptImportedPrivateKey(account)
  const wallet = new Wallet(`0x${privateKeyHex}`, provider)
  if (normalizeAddress(wallet.address) !== normalizeAddress(account.address)) {
    throw new Error('账户私钥与当前地址不匹配。')
  }

  return { account, wallet }
}

const parseMonAmount = (amount: string): bigint => {
  try {
    const parsed = parseEther(amount)
    if (parsed <= 0n) {
      throw new Error('金额必须大于 0。')
    }
    return parsed
  } catch (error) {
    if (error instanceof Error && error.message === '金额必须大于 0。') {
      throw error
    }
    throw new Error('金额格式无效。')
  }
}

const parseErc20Amount = (amount: string, decimals: number): bigint => {
  try {
    const parsed = parseUnits(amount, decimals)
    if (parsed <= 0n) {
      throw new Error('金额必须大于 0。')
    }
    return parsed
  } catch (error) {
    if (error instanceof Error && error.message === '金额必须大于 0。') {
      throw error
    }
    throw new Error('金额格式无效。')
  }
}

const normalizeSwapTargetToken = (token: string): SwapTargetToken => {
  const normalized = token.trim().toUpperCase()
  if (normalized === 'MON') {
    return 'MON'
  }
  if (normalized === 'EGOLD') {
    return 'eGold'
  }
  throw new Error('不支持的兑换代币。')
}

const getSwapOutputForExactInput = async (
  inputToken: SwapTargetToken,
  inputAmount: string
): Promise<{
  inputToken: SwapTargetToken
  outputToken: SwapTargetToken
  inputAmountRaw: bigint
  expectedOutputRaw: bigint
  inputDecimals: number
  outputDecimals: number
}> => {
  const eGoldDecimals = await eGoldContract.decimals() as number
  const isInputMon = inputToken === 'MON'
  const inputDecimals = isInputMon ? DEFAULT_EXTENSION_NETWORK.nativeCurrency.decimals : eGoldDecimals
  const outputDecimals = isInputMon ? eGoldDecimals : DEFAULT_EXTENSION_NETWORK.nativeCurrency.decimals
  const inputAmountRaw = isInputMon
    ? parseMonAmount(inputAmount)
    : parseErc20Amount(inputAmount, eGoldDecimals)

  let expectedOutputRaw: bigint
  try {
    expectedOutputRaw = isInputMon
      ? await ammContract.getAmountOutMONToToken(inputAmountRaw) as bigint
      : await ammContract.getAmountOutTokenToMON(inputAmountRaw) as bigint
  } catch {
    throw new Error('无法估算兑换输出。')
  }
  if (expectedOutputRaw <= 0n) {
    throw new Error('兑换输出过小。')
  }

  return {
    inputToken,
    outputToken: isInputMon ? 'eGold' : 'MON',
    inputAmountRaw,
    expectedOutputRaw,
    inputDecimals,
    outputDecimals
  }
}

const assertPasswordStrength = (password: string): void => {
  if (password.length < 8) {
    throw new Error('密码至少需要 8 位。')
  }
}

export const isWalletInitialized = async (): Promise<boolean> => {
  const auth = await getVaultV2()
  return Boolean(auth)
}

export const initializeWalletWithPassword = async (password: string): Promise<void> => {
  assertPasswordStrength(password)

  const initialized = await isWalletInitialized()
  if (initialized) {
    throw new Error('钱包已初始化。')
  }

  const privateKeyHex = createPrivateKeyHex()
  const encryptedVault = await encryptVaultPayload({ privateKeyHex }, password)
  await setStoredItem(AUTH_STORAGE_KEY, {
    version: 2,
    createdAt: new Date().toISOString(),
    ...encryptedVault
  })
  await setStoredAccounts({ version: 1, selectedAddress: null, accounts: [] })
  sessionSecretHex = privateKeyHex
  await setWalletSessionSecret(privateKeyHex)
  await setWalletSessionUnlocked(true)
  await clearDappOriginPermissions()
}

export const loginWithPassword = async (password: string): Promise<void> => {
  const auth = await getVaultV2()
  if (!auth) {
    throw new Error('钱包尚未初始化。')
  }

  try {
    const vault = await decryptVaultPayload(auth, password)
    sessionSecretHex = vault.privateKeyHex
    await setWalletSessionSecret(vault.privateKeyHex)
    await setWalletSessionUnlocked(true)
    await clearDappOriginPermissions()
  } catch {
    throw new Error('密码错误。')
  }
}

export const clearWalletSession = async (): Promise<void> => {
  sessionSecretHex = null
  await setWalletSessionSecret(null)
  await setWalletSessionUnlocked(false)
  await clearDappOriginPermissions()
}

export const getImportedAccountState = async (): Promise<AccountState> => {
  const stored = await getStoredAccounts()
  const normalized = normalizeAccountState(stored)
  if (normalized.selectedAddress !== stored.selectedAddress) {
    await setStoredAccounts({
      ...stored,
      selectedAddress: normalized.selectedAddress
    })
  }
  return normalized
}

export const importAccountWithPrivateKey = async (privateKey: string): Promise<AccountState> => {
  const normalizedPrivateKey = validatePrivateKey(privateKey)
  const normalizedAddress = deriveAddressFromPrivateKey(normalizedPrivateKey)

  const stored = await getStoredAccounts()
  if (stored.accounts.some((item) => item.address === normalizedAddress)) {
    throw new Error('该账户已导入。')
  }

  const encryptedPrivateKey = await encryptImportedPrivateKey(normalizedPrivateKey)
  const nextStored: StoredAccountsV1 = {
    version: 1,
    selectedAddress: normalizedAddress,
    accounts: [
      ...stored.accounts,
      {
        address: normalizedAddress,
        label: `Account ${stored.accounts.length + 1}`,
        cipher: {
          algorithm: 'AES-GCM',
          ivBase64: encryptedPrivateKey.ivBase64
        },
        privateKeyCiphertextBase64: encryptedPrivateKey.privateKeyCiphertextBase64,
        importedAt: new Date().toISOString()
      }
    ]
  }
  await setStoredAccounts(nextStored)
  return normalizeAccountState(nextStored)
}

export const selectImportedAccount = async (address: string): Promise<AccountState> => {
  const normalizedAddress = validateAddress(address)
  const stored = await getStoredAccounts()
  if (!stored.accounts.some((item) => item.address === normalizedAddress)) {
    throw new Error('账户不存在。')
  }

  const nextStored: StoredAccountsV1 = {
    ...stored,
    selectedAddress: normalizedAddress
  }
  await setStoredAccounts(nextStored)
  return normalizeAccountState(nextStored)
}

export const removeImportedAccount = async (address: string): Promise<AccountState> => {
  const normalizedAddress = validateAddress(address)
  const stored = await getStoredAccounts()
  if (!stored.accounts.some((item) => item.address === normalizedAddress)) {
    throw new Error('账户不存在。')
  }

  const remaining = stored.accounts.filter((item) => item.address !== normalizedAddress)
  const selectedAddress = remaining.some((item) => item.address === stored.selectedAddress)
    ? stored.selectedAddress
    : remaining[0]?.address ?? null

  const nextStored: StoredAccountsV1 = {
    ...stored,
    selectedAddress,
    accounts: remaining
  }
  await setStoredAccounts(nextStored)
  return normalizeAccountState(nextStored)
}

export const fetchBalance = async (): Promise<Balance> => {
  const account = await getSelectedStoredAccount()
  if (!account) {
    return {
      assets: [
        { symbol: 'MON', amount: '0.00', decimals: 18, isNative: true },
        { symbol: 'eGold', amount: '0.00', decimals: 18, contractAddress: EGOLD_CONTRACT_ADDRESS }
      ]
    }
  }

  const ownerAddress = getAddress(account.address)
  const [monBalance, eGoldRawBalance, eGoldDecimals, eGoldSymbol] = await Promise.all([
    provider.getBalance(ownerAddress),
    eGoldContract.balanceOf(ownerAddress) as Promise<bigint>,
    eGoldContract.decimals() as Promise<number>,
    eGoldContract.symbol() as Promise<string>
  ])

  return {
    assets: [
      {
        symbol: 'MON',
        amount: formatEther(monBalance),
        decimals: DEFAULT_EXTENSION_NETWORK.nativeCurrency.decimals,
        isNative: true
      },
      {
        symbol: eGoldSymbol,
        amount: formatUnits(eGoldRawBalance, eGoldDecimals),
        decimals: eGoldDecimals,
        contractAddress: EGOLD_CONTRACT_ADDRESS
      }
    ]
  }
}

export const recordLocalActivity = async (
  input: LocalActivityInput
): Promise<TransactionRecord[]> => {
  const account = await getSelectedStoredAccount()
  if (!account) {
    throw new Error('未选择账户。')
  }

  const accountAddress = normalizeAddress(getAddress(account.address))
  const status = await resolveActivityStatus(input.hash.trim())
  const nextRecord = toStoredActivityItem(accountAddress, input, status)
  const stored = await getStoredActivity()
  const nextStored = mergeNewActivityRecord(stored, nextRecord)
  await setStoredActivity(nextStored)
  return getActivityByAccount(nextStored, accountAddress)
}

export const fetchHistory = async (): Promise<TransactionRecord[]> => {
  const account = await getSelectedStoredAccount()
  if (!account) {
    return []
  }

  try {
    const summary = await fetchRecentAddressTransactionSummary(account.address, { limit: RECENT_ADDRESS_TX_LIMIT })
    return summary.records.map((item) => ({
      id: item.hash,
      type: (() => {
        const methodSigLower = (item.methodSig ?? '').toLowerCase()
        const isDex =
          (item.to && normalizeAddress(item.to) === AMM_CONTRACT_ADDRESS) ||
          methodSigLower.includes('swap')
        const isApprove =
          methodSigLower.includes('approve') ||
          methodSigLower.startsWith(ERC20_APPROVE_METHOD_ID)
        const hasContractCall = Boolean(item.methodSig && item.methodSig !== '0x')
        const isTokenTransferMethod =
          item.tokenAddress !== null &&
          (
            methodSigLower.includes('transfer') ||
            methodSigLower.startsWith(ERC20_TRANSFER_METHOD_ID) ||
            methodSigLower.startsWith(ERC20_TRANSFER_FROM_METHOD_ID)
          )
        if (isDex) {
          return 'dex'
        }
        if (isApprove || (hasContractCall && !isTokenTransferMethod)) {
          return 'contract'
        }
        return 'transfer'
      })(),
      direction: item.direction,
      timestamp: item.timestamp,
      amount: (() => {
        const isEGoldTransfer = item.tokenAddress === EGOLD_CONTRACT_ADDRESS
        const rawAmount = isEGoldTransfer && item.phishingValue ? item.phishingValue : item.value
        const tokenSymbol = isEGoldTransfer ? 'eGold' : 'MON'
        return `${rawAmount} ${tokenSymbol}`
      })(),
      tokenSymbol: item.tokenAddress === EGOLD_CONTRACT_ADDRESS ? 'eGold' : 'MON',
      methodSig: item.methodSig ?? undefined,
      status: 'success',
      to: item.counterparty ?? undefined,
      hash: item.hash
    }))
  } catch {
    return []
  }
}

export const fetchRecentAddressTransactionSummary = async (
  address: string,
  options?: { limit?: number }
): Promise<RecentAddressTransactionSummary> => {
  const normalizedAddress = validateAddress(address)
  const limit = Math.max(1, Math.min(options?.limit ?? RECENT_ADDRESS_TX_LIMIT, 25))
  if (!MONADSCAN_API_KEY) {
    throw new Error('缺少 .env 中的 VITE_MONADSCAN_API_KEY。')
  }
  const query = new URLSearchParams({
    chainid: String(DEFAULT_EXTENSION_NETWORK.chainIdDecimal),
    module: 'account',
    action: 'txlist',
    address: getAddress(normalizedAddress),
    page: '1',
    offset: String(limit),
    sort: 'desc',
    apikey: MONADSCAN_API_KEY
  })
  const response = await fetch(`${MONADSCAN_V2_API_BASE_URL}?${query.toString()}`)
  if (!response.ok) {
    throw new Error('查询 Monadscan API 失败。')
  }

  const payload = await response.json() as unknown
  if (!isRecord(payload)) {
    throw new Error('Monadscan API 返回异常。')
  }

  const status = typeof payload.status === 'string' ? payload.status : ''
  const message = typeof payload.message === 'string' ? payload.message : ''
  const result = payload.result
  if (Array.isArray(result) && status === '0' && message.toLowerCase().includes('no transactions')) {
    return {
      address: normalizedAddress,
      fetchedAt: Date.now(),
      requestedLimit: limit,
      total: 0,
      incomingCount: 0,
      outgoingCount: 0,
      selfCount: 0,
      records: []
    }
  }
  if (!Array.isArray(result)) {
    const errorHint = typeof result === 'string' && result.trim() ? result : 'Monadscan API 返回异常。'
    throw new Error(errorHint)
  }

  const records = (await Promise.all(
    result.map(async (item) => {
      if (!isRecord(item)) {
        return null
      }
      const hash = typeof item.hash === 'string' ? item.hash : ''
      const fromRaw = typeof item.from === 'string' ? item.from : ''
      const toRaw = typeof item.to === 'string' ? item.to : ''
      const valueRaw = typeof item.value === 'string' ? item.value : ''
      const timestampRaw = typeof item.timeStamp === 'string' ? item.timeStamp : ''
      const blockRaw = typeof item.blockNumber === 'string' ? item.blockNumber : ''
      const inputRaw = typeof item.input === 'string' ? item.input : ''
      const methodIdRaw = typeof item.methodId === 'string' ? item.methodId : ''
      const functionNameRaw = typeof item.functionName === 'string' ? item.functionName : ''
      const txReceiptStatusRaw = typeof item.txreceipt_status === 'string' ? item.txreceipt_status : ''
      const isErrorRaw = typeof item.isError === 'string' ? item.isError : ''
      const contractAddressRaw = typeof item.contractAddress === 'string' ? item.contractAddress : ''
      if (!hash || !fromRaw) {
        return null
      }

      let value = '0'
      try {
        value = formatEther(BigInt(valueRaw || '0'))
      } catch {
        value = '0'
      }

      const from = normalizeAddress(fromRaw)
      const to = toRaw ? normalizeAddress(toRaw) : null
      const input = inputRaw.trim()
      const methodId = (methodIdRaw.trim() || getMethodIdFromCallData(input) || '').toLowerCase()
      const functionName = functionNameRaw.trim()
      const methodSig = functionName || methodId || null
      const isContractCall = Boolean(input && input !== '0x')
      const createdContractAddress = normalizeOptionalAddress(contractAddressRaw)
      const contractAddress = createdContractAddress ?? (isContractCall ? to : null)
      let success: boolean | null = null
      if (txReceiptStatusRaw === '1') {
        success = true
      } else if (txReceiptStatusRaw === '0') {
        success = false
      } else if (isErrorRaw === '0') {
        success = true
      } else if (isErrorRaw === '1') {
        success = false
      }

      const isTokenMethod =
        Boolean(to) &&
        (methodId === ERC20_TRANSFER_METHOD_ID ||
          methodId === ERC20_APPROVE_METHOD_ID ||
          methodId === ERC20_TRANSFER_FROM_METHOD_ID)
      const tokenAddress = isTokenMethod ? to : null
      let tokenDecimals: number | null = null
      let phishingValue: string | null = null
      if (tokenAddress === EGOLD_CONTRACT_ADDRESS) {
        tokenDecimals = await getErc20TokenDecimals(tokenAddress)
        const amountParamIndex = methodId === ERC20_TRANSFER_FROM_METHOD_ID ? 2 : 1
        const tokenAmountRaw = parseUint256ParamFromCallData(input, amountParamIndex)
        if (tokenAmountRaw !== null && tokenDecimals !== null) {
          phishingValue = formatUnits(tokenAmountRaw, tokenDecimals)
        }
      }

      const isFromMatch = from === normalizedAddress
      const isToMatch = to === normalizedAddress
      const direction = isFromMatch && isToMatch ? 'self' : isFromMatch ? 'out' : 'in'
      const counterparty =
        direction === 'out'
          ? to ?? '(contract creation)'
          : direction === 'in'
            ? from
            : to ?? from

      return {
        hash,
        blockNumber: Number(blockRaw || '0'),
        timestamp: Number(timestampRaw || '0') * 1000,
        from,
        to,
        value,
        direction,
        counterparty,
        success,
        tokenAddress,
        tokenDecimals,
        methodSig,
        contractAddress,
        phishingValue
      } satisfies RecentAddressTransaction
    })
  ))
    .filter((item): item is RecentAddressTransaction => item !== null)
    .slice(0, limit)

  const incomingCount = records.filter((item) => item.direction === 'in').length
  const outgoingCount = records.filter((item) => item.direction === 'out').length
  const selfCount = records.filter((item) => item.direction === 'self').length

  return {
    address: normalizedAddress,
    fetchedAt: Date.now(),
    requestedLimit: limit,
    total: records.length,
    incomingCount,
    outgoingCount,
    selfCount,
    records
  }
}

const fetchMonadscanTxlistTimestamps = async (
  address: string,
  sort: 'asc' | 'desc'
): Promise<number | null> => {
  const normalizedAddress = validateAddress(address)
  if (!MONADSCAN_API_KEY) {
    throw new Error('缺少 .env 中的 VITE_MONADSCAN_API_KEY。')
  }

  const query = new URLSearchParams({
    chainid: String(DEFAULT_EXTENSION_NETWORK.chainIdDecimal),
    module: 'account',
    action: 'txlist',
    address: getAddress(normalizedAddress),
    page: '1',
    offset: '1',
    sort,
    apikey: MONADSCAN_API_KEY
  })
  const response = await fetch(`${MONADSCAN_V2_API_BASE_URL}?${query.toString()}`)
  if (!response.ok) {
    throw new Error('查询 Monadscan API 失败。')
  }

  const payload = await response.json() as unknown
  if (!isRecord(payload)) {
    throw new Error('Monadscan API 返回异常。')
  }

  const status = typeof payload.status === 'string' ? payload.status : ''
  const message = typeof payload.message === 'string' ? payload.message : ''
  const result = payload.result
  if (Array.isArray(result) && status === '0' && message.toLowerCase().includes('no transactions')) {
    return null
  }
  if (!Array.isArray(result)) {
    const errorHint = typeof result === 'string' && result.trim() ? result : 'Monadscan API 返回异常。'
    throw new Error(errorHint)
  }

  const firstItem = result.find((item) => isRecord(item))
  if (!firstItem || typeof firstItem.timeStamp !== 'string') {
    return null
  }
  const timestamp = Number(firstItem.timeStamp)
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null
  }
  return Math.floor(timestamp)
}

export const fetchAddressLifecycleInfo = async (
  address: string
): Promise<{ address: string; lifecycle: AddressLifecycleInfo }> => {
  const normalizedAddress = validateAddress(address)
  const [firstSeen, lastSeen] = await Promise.all([
    fetchMonadscanTxlistTimestamps(normalizedAddress, 'asc'),
    fetchMonadscanTxlistTimestamps(normalizedAddress, 'desc')
  ])

  const nextFirstSeen = firstSeen ?? lastSeen ?? undefined
  const nextLastSeen = lastSeen ?? firstSeen ?? undefined
  const lifecycle: AddressLifecycleInfo = {}

  if (typeof nextFirstSeen === 'number') {
    lifecycle.first_seen_timestamp = nextFirstSeen
    const nowSeconds = Math.floor(Date.now() / 1000)
    lifecycle.account_age_days = Math.max(0, Math.floor((nowSeconds - nextFirstSeen) / 86_400))
  }

  if (typeof nextLastSeen === 'number') {
    lifecycle.last_seen_timestamp = nextLastSeen
  }

  if (typeof nextFirstSeen === 'number' && typeof nextLastSeen === 'number') {
    lifecycle.active_days = Math.max(1, Math.floor((nextLastSeen - nextFirstSeen) / 86_400) + 1)
  }

  return {
    address: normalizedAddress,
    lifecycle
  }
}

export const sendTransfer = async (to: string, amount: string): Promise<string> => {
  const normalizedTo = validateAddressIgnoreChecksum(to)
  const value = parseMonAmount(amount)
  const { wallet } = await getSelectedAccountWallet()
  const tx = await wallet.sendTransaction({
    to: getAddress(normalizedTo),
    value
  })
  return tx.hash
}

export const sendErc20Transfer = async (to: string, amount: string): Promise<string> => {
  const normalizedTo = validateAddressIgnoreChecksum(to)
  const { wallet } = await getSelectedAccountWallet()
  const decimals = await eGoldContract.decimals() as number
  const value = parseErc20Amount(amount, decimals)
  const contract = new Contract(EGOLD_CONTRACT_ADDRESS, ERC20_ABI, wallet)
  const tx = await contract.transfer(
    getAddress(normalizedTo),
    value
  ) as ContractTransactionResponse
  return tx.hash
}

export const sendTokenTransfer = async (
  tokenSymbol: string,
  to: string,
  amount: string
): Promise<string> => {
  const normalizedSymbol = tokenSymbol.trim().toUpperCase()
  if (normalizedSymbol === 'MON') {
    return sendTransfer(to, amount)
  }
  if (normalizedSymbol === 'EGOLD') {
    return sendErc20Transfer(to, amount)
  }
  throw new Error('不支持的代币。')
}

export const sendContractCall = async (contract: string, data: string): Promise<string> => {
  const normalizedContract = validateAddress(contract)
  if (!isHexString(data)) {
    throw new Error('合约调用数据无效。')
  }

  const { wallet } = await getSelectedAccountWallet()
  const tx = await wallet.sendTransaction({
    to: getAddress(normalizedContract),
    data
  })
  return tx.hash
}

export const fetchSwapQuoteByInputAmount = async (
  inputToken: SwapTargetToken,
  inputAmount: string
): Promise<SwapQuote> => {
  const normalizedInput = normalizeSwapTargetToken(inputToken)
  const output = await getSwapOutputForExactInput(normalizedInput, inputAmount)
  return {
    inputToken: output.inputToken,
    outputToken: output.outputToken,
    inputAmount: formatUnits(output.inputAmountRaw, output.inputDecimals),
    expectedOutputAmount: formatUnits(output.expectedOutputRaw, output.outputDecimals)
  }
}

export const fetchSwapSlippagePoolRiskStatsByInputAmount = async (
  inputToken: SwapTargetToken,
  inputAmount: string
): Promise<SwapSlippagePoolRiskStats> => {
  const normalizedInput = normalizeSwapTargetToken(inputToken)
  const output = await getSwapOutputForExactInput(normalizedInput, inputAmount)

  let priceImpactPct: number | null = null
  let poolTokenPayAmount: string | null = null
  let poolTokenGetAmount: string | null = null
  try {
    const reserves = await ammContract.getReserves() as [bigint, bigint]
    const reserveMONRaw = reserves[0]
    const reserveEGoldRaw = reserves[1]
    const reserveInRaw = output.inputToken === 'MON' ? reserveMONRaw : reserveEGoldRaw
    const reserveOutRaw = output.inputToken === 'MON' ? reserveEGoldRaw : reserveMONRaw

    poolTokenPayAmount = formatUnits(reserveInRaw, output.inputDecimals)
    poolTokenGetAmount = formatUnits(reserveOutRaw, output.outputDecimals)

    if (reserveInRaw > 0n && reserveOutRaw > 0n) {
      const inputAmountFloat = Number(formatUnits(output.inputAmountRaw, output.inputDecimals))
      const reserveInFloat = Number(formatUnits(reserveInRaw, output.inputDecimals))
      const reserveOutFloat = Number(formatUnits(reserveOutRaw, output.outputDecimals))
      const actualOutputFloat = Number(formatUnits(output.expectedOutputRaw, output.outputDecimals))
      if (
        Number.isFinite(inputAmountFloat) &&
        Number.isFinite(reserveInFloat) &&
        Number.isFinite(reserveOutFloat) &&
        Number.isFinite(actualOutputFloat) &&
        inputAmountFloat > 0 &&
        reserveInFloat > 0 &&
        reserveOutFloat > 0 &&
        actualOutputFloat >= 0
      ) {
        const spotOutputFloat = inputAmountFloat * (reserveOutFloat / reserveInFloat)
        if (spotOutputFloat > 0 && Number.isFinite(spotOutputFloat)) {
          const rawImpact = ((spotOutputFloat - actualOutputFloat) / spotOutputFloat) * 100
          if (Number.isFinite(rawImpact)) {
            priceImpactPct = Math.max(0, Number(rawImpact.toFixed(6)))
          }
        }
      }
    }
  } catch {
    priceImpactPct = null
    poolTokenPayAmount = null
    poolTokenGetAmount = null
  }

  return {
    poolAddress: AMM_CONTRACT_ADDRESS,
    priceImpactPct,
    poolTokenPayAmount,
    poolTokenGetAmount
  }
}

export const swapByInputAmount = async (
  inputToken: SwapTargetToken,
  inputAmount: string
): Promise<string> => {
  const normalizedInput = normalizeSwapTargetToken(inputToken)
  const output = await getSwapOutputForExactInput(normalizedInput, inputAmount)
  const { wallet } = await getSelectedAccountWallet()
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 10 * 60)
  const ammWithSigner = new Contract(AMM_CONTRACT_ADDRESS, AMM_ABI, wallet)

  if (output.inputToken === 'MON') {
    const monBalance = await provider.getBalance(wallet.address)
    if (monBalance < output.inputAmountRaw) {
      throw new Error('MON 余额不足。')
    }
    const tx = await ammWithSigner.swapExactMONForTokens(
      wallet.address,
      deadline,
      { value: output.inputAmountRaw }
    ) as ContractTransactionResponse
    return tx.hash
  }

  const eGoldWithSigner = new Contract(EGOLD_CONTRACT_ADDRESS, ERC20_ABI, wallet)
  const eGoldBalance = await eGoldWithSigner.balanceOf(wallet.address) as bigint
  if (eGoldBalance < output.inputAmountRaw) {
    throw new Error('eGold 余额不足。')
  }

  const allowance = await eGoldWithSigner.allowance(wallet.address, AMM_CONTRACT_ADDRESS) as bigint
  if (allowance < output.inputAmountRaw) {
    const approveTx = await eGoldWithSigner.approve(
      AMM_CONTRACT_ADDRESS,
      output.inputAmountRaw
    ) as ContractTransactionResponse
    await approveTx.wait()
  }

  const tx = await ammWithSigner.swapExactTokensForMON(
    output.inputAmountRaw,
    wallet.address,
    deadline
  ) as ContractTransactionResponse
  return tx.hash
}

export const sendSwap = async (inputToken: string, inputAmount: string): Promise<string> => {
  const normalizedInput = normalizeSwapTargetToken(inputToken)
  return swapByInputAmount(normalizedInput, inputAmount)
}
