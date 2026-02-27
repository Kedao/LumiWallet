import { useMemo, useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'

import type { UseWalletResult } from '@/hooks/useWallet'
import { requestErc20Approve } from '@/lib/erc20Approve'
import { showDialog, showErrorDialog } from '@/lib/dialogBus'
import { Button } from '@/components/ui/button'

interface ApproveRequestCardProps {
  wallet: UseWalletResult
}

type ApproveFormState = {
  tokenAddress: string
  spender: string
  amount: string
}

type ApprovePreset = 'normal' | 'risky'

const FIXED_SPENDER = '0x0bE276A9C0955610bF6D56b587cF7419AB0E79FF'

const approveInputByPreset: Record<ApprovePreset, ApproveFormState> = {
  normal: {
    tokenAddress: '0xee7977f3854377f6b8bdf6d0b715277834936b24',
    spender: FIXED_SPENDER,
    amount: '1',
  },
  risky: {
    tokenAddress: '0x30b19e878B2FC9E28E3C3f5EB63dB1695337F3e6',
    spender: FIXED_SPENDER,
    amount: 'max',
  },
}

const presetCopy: Record<ApprovePreset, { title: string; description: string; buttonText: string }> = {
  normal: {
    title: '正常合约',
    description: '这是正常合约授权请求。',
    buttonText: '请授权（正常合约）',
  },
  risky: {
    title: '风险合约',
    description: '这是风险合约授权请求，请谨慎确认。',
    buttonText: '请授权（风险合约）',
  },
}

function shortenHash(hash: string): string {
  if (hash.length < 16) return hash
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`
}

export function ApproveRequestCard({ wallet }: ApproveRequestCardProps) {
  const { account, isConnected, isLoading: isWalletLoading, getWalletProvider } = wallet
  const [submittingPreset, setSubmittingPreset] = useState<ApprovePreset | null>(null)
  const [lastTxHash, setLastTxHash] = useState<string | null>(null)

  const isSubmitting = submittingPreset !== null
  const canSubmit = useMemo(() => {
    return isConnected && !isWalletLoading && !isSubmitting
  }, [isConnected, isSubmitting, isWalletLoading])

  const submitApprove = async (preset: ApprovePreset) => {
    if (!isConnected) {
      showErrorDialog('请先连接钱包', '连接钱包后再发起 ERC20 授权请求。')
      return
    }

    const walletProvider = getWalletProvider()
    if (!walletProvider) {
      showErrorDialog('未检测到钱包 Provider', '请确认钱包插件可用并重新连接。')
      return
    }
    if (!account) {
      showErrorDialog('未检测到授权账户', '请重新连接钱包后重试。')
      return
    }

    setSubmittingPreset(preset)

    try {
      const result = await requestErc20Approve(walletProvider, {
        ...approveInputByPreset[preset],
        from: account,
      })
      setLastTxHash(result.txHash)

      showDialog({
        title: `${presetCopy[preset].title}授权交易已提交`,
        message: `Tx Hash: ${result.txHash}`,
        variant: 'success',
        actionText: '知道了',
      })
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err) {
        const providerError = err as { code: number; message?: string }
        if (providerError.code === 4001) {
          showErrorDialog('授权已取消', '你已取消本次授权请求。')
        } else if (providerError.code === -32002) {
          showDialog({
            title: '请前往钱包插件完成授权',
            message: '检测到已有待处理的交易请求，请在钱包插件中确认或拒绝。',
            variant: 'warning',
            actionText: '去处理',
          })
        } else {
          showErrorDialog('授权失败', providerError.message || '发起授权失败，请稍后重试。')
        }
      } else if (err instanceof Error) {
        showErrorDialog('授权失败', err.message)
      } else {
        showErrorDialog('授权失败', '发起授权失败，请稍后重试。')
      }
    } finally {
      setSubmittingPreset(null)
    }
  }

  return (
    <section className="approve-card">
      <div className="approve-head">
        <div>
          <p className="approve-eyebrow">Universal ERC20 Action</p>
          <h3>发起 ERC20 授权请求（approve）</h3>
        </div>
        <div className="approve-icon" aria-hidden>
          <ShieldCheck className="h-4 w-4" />
        </div>
      </div>

      <p className="approve-copy">
        提供两个快捷授权操作，已隐藏 token、spender 和授权额度等输入细节。
      </p>

      <div className="approve-form">
        <div className="approve-option">
          <p className="approve-option-title">{presetCopy.normal.title}</p>
          <p className="approve-option-desc">{presetCopy.normal.description}</p>
          <div className="approve-actions">
            <Button
              type="button"
              disabled={!canSubmit}
              className="w-full"
              onClick={() => void submitApprove('normal')}
            >
              {submittingPreset === 'normal' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  提交授权中...
                </>
              ) : (
                presetCopy.normal.buttonText
              )}
            </Button>
          </div>
        </div>

        <div className="approve-option approve-option-risky">
          <p className="approve-option-title">{presetCopy.risky.title}</p>
          <p className="approve-option-desc">{presetCopy.risky.description}</p>
          <div className="approve-actions">
            <Button
              type="button"
              disabled={!canSubmit}
              className="w-full"
              onClick={() => void submitApprove('risky')}
            >
              {submittingPreset === 'risky' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  提交授权中...
                </>
              ) : (
                presetCopy.risky.buttonText
              )}
            </Button>
          </div>
        </div>
      </div>
      {lastTxHash && <p className="approve-hash">最近交易: {shortenHash(lastTxHash)}</p>}
    </section>
  )
}
