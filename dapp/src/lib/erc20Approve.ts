import { Contract, Interface, JsonRpcProvider, MaxUint256, isAddress, isHexString, parseUnits } from 'ethers'
import { DEFAULT_NETWORK, type LumiWalletProvider } from '@shared/types'

const ERC20_APPROVE_ABI = [
  'function approve(address spender, uint256 value)',
  'function decimals() view returns (uint8)',
] as const

export interface Erc20ApproveInput {
  tokenAddress: string
  spender: string
  amount: string
  from: string
}

export interface Erc20ApproveResult {
  tokenAddress: string
  spender: string
  value: bigint
  txHash: string
}

function ensureAddress(fieldName: string, address: string): string {
  const normalized = address.trim()
  if (!isAddress(normalized)) {
    throw new Error(`${fieldName} 格式无效。`)
  }
  return normalized
}

function isTokenAmount(value: string): boolean {
  return /^[0-9]+(\.[0-9]+)?$/.test(value)
}

async function parseApproveAmount(tokenAddress: string, amountInput: string): Promise<bigint> {
  const normalized = amountInput.trim()
  if (!normalized) {
    throw new Error('授权额度不能为空。')
  }

  if (normalized.toLowerCase() === 'max') {
    return MaxUint256
  }

  if (!isTokenAmount(normalized)) {
    throw new Error('授权额度格式无效。请使用整数、小数或 max。')
  }

  try {
    const rpcProvider = new JsonRpcProvider(DEFAULT_NETWORK.rpcUrls[0])
    const tokenContract = new Contract(tokenAddress, ERC20_APPROVE_ABI, rpcProvider)
    const decimals = Number(await tokenContract.decimals())
    return parseUnits(normalized, decimals)
  } catch {
    throw new Error('无法按 token decimals 解析授权额度，请检查 token 地址和金额格式。')
  }
}

/**
 * Generic ERC20 approval request.
 * Accepts token address + spender + amount and dispatches approve() via connected wallet.
 */
export async function requestErc20Approve(
  walletProvider: LumiWalletProvider,
  input: Erc20ApproveInput
): Promise<Erc20ApproveResult> {
  const tokenAddress = ensureAddress('Token 合约地址', input.tokenAddress)
  const spender = ensureAddress('Spender 地址', input.spender)
  const from = ensureAddress('授权发起账户地址', input.from)
  const value = await parseApproveAmount(tokenAddress, input.amount)

  const erc20Interface = new Interface(ERC20_APPROVE_ABI)
  const data = erc20Interface.encodeFunctionData('approve', [spender, value])

  const txHash = (await walletProvider.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from,
        to: tokenAddress,
        data,
        value: '0x0',
      },
    ],
  })) as string

  if (typeof txHash !== 'string' || !isHexString(txHash)) {
    throw new Error('钱包返回了无效的交易哈希。')
  }

  return {
    tokenAddress,
    spender,
    value,
    txHash,
  }
}
