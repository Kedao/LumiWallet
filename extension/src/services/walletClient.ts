import { Balance, TransactionRecord, WalletAccount } from '../types/models'

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

const AUTH_STORAGE_KEY = 'lumi.wallet.auth.v1'
const PBKDF2_ITERATIONS = 600_000
const PBKDF2_SALT_BYTES = 16
const AES_GCM_IV_BYTES = 12
const PRIVATE_KEY_BYTES = 32
const LOGIN_PLACEHOLDER_ACCOUNT: WalletAccount = {
  // Placeholder only; real EVM address derivation will be implemented later.
  address: '0x0000000000000000000000000000000000000000',
  label: 'Primary Account'
}
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const canUseChromeStorage = () =>
  typeof chrome !== 'undefined' && Boolean(chrome?.storage?.local)

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

const getStoredAuth = async (): Promise<unknown | null> => {
  if (canUseChromeStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.get([AUTH_STORAGE_KEY], (items: Record<string, unknown>) => {
        resolve(items[AUTH_STORAGE_KEY] ?? null)
      })
    })
  }

  const raw = localStorage.getItem(AUTH_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

const setStoredAuth = async (payload: StoredWalletVaultV2): Promise<void> => {
  if (canUseChromeStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [AUTH_STORAGE_KEY]: payload }, () => resolve())
    })
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload))
}

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

const randomBytes = (size: number): Uint8Array => {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  return bytes
}

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

const isHex = (value: string): boolean => /^[0-9a-f]+$/i.test(value)

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
    throw new Error('Wallet vault payload is invalid.')
  }

  const privateKeyHex = parsed.privateKeyHex.toLowerCase()
  if (privateKeyHex.length !== PRIVATE_KEY_BYTES * 2 || !isHex(privateKeyHex)) {
    throw new Error('Wallet vault key is invalid.')
  }

  return { privateKeyHex }
}

const createPrivateKeyHex = (): string => toHex(randomBytes(PRIVATE_KEY_BYTES))

const getVaultV2 = async (): Promise<StoredWalletVaultV2 | null> => {
  const raw = await getStoredAuth()
  if (!isWalletVaultV2(raw)) {
    return null
  }
  return raw
}

const assertPasswordStrength = (password: string): void => {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters.')
  }
}

export const isWalletInitialized = async (): Promise<boolean> => {
  const auth = await getVaultV2()
  return Boolean(auth)
}

export const initializeWalletWithPassword = async (password: string): Promise<WalletAccount> => {
  assertPasswordStrength(password)

  const initialized = await isWalletInitialized()
  if (initialized) {
    throw new Error('Wallet is already initialized.')
  }

  const privateKeyHex = createPrivateKeyHex()
  const encryptedVault = await encryptVaultPayload({ privateKeyHex }, password)
  await setStoredAuth({
    version: 2,
    createdAt: new Date().toISOString(),
    ...encryptedVault
  })

  return LOGIN_PLACEHOLDER_ACCOUNT
}

export const loginWithPassword = async (password: string): Promise<WalletAccount> => {
  const auth = await getVaultV2()
  if (!auth) {
    throw new Error('Wallet is not initialized yet.')
  }

  try {
    await decryptVaultPayload(auth, password)
  } catch {
    throw new Error('Incorrect password.')
  }

  return LOGIN_PLACEHOLDER_ACCOUNT
}

export const fetchBalance = async (): Promise<Balance> => {
  // TODO: query Monad RPC.
  return { symbol: 'MON', amount: '0.00' }
}

export const fetchHistory = async (): Promise<TransactionRecord[]> => {
  // TODO: query indexer or RPC for activity.
  return []
}

export const sendTransfer = async (to: string, amount: string): Promise<string> => {
  // TODO: build and submit transfer transaction.
  void to
  void amount
  return '0x'
}

export const sendContractCall = async (contract: string, data: string): Promise<string> => {
  // TODO: build and submit contract call transaction.
  void contract
  void data
  return '0x'
}

export const sendSwap = async (routeId: string): Promise<string> => {
  // TODO: call 1inch aggregator or DEX router.
  void routeId
  return '0x'
}
