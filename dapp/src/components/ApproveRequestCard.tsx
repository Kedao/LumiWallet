import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
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

const initialForm: ApproveFormState = {
  tokenAddress: '',
  spender: '',
  amount: '',
}

function shortenHash(hash: string): string {
  if (hash.length < 16) return hash
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`
}

export function ApproveRequestCard({ wallet }: ApproveRequestCardProps) {
  const { account, isConnected, isLoading: isWalletLoading, getWalletProvider } = wallet
  const [form, setForm] = useState<ApproveFormState>(initialForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lastTxHash, setLastTxHash] = useState<string | null>(null)

  const canSubmit = useMemo(() => {
    return (
      isConnected &&
      !isWalletLoading &&
      !isSubmitting &&
      form.tokenAddress.trim().length > 0 &&
      form.spender.trim().length > 0 &&
      form.amount.trim().length > 0
    )
  }, [form.amount, form.spender, form.tokenAddress, isConnected, isSubmitting, isWalletLoading])

  const updateField =
    (key: keyof ApproveFormState) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value
      setForm((prev) => ({
        ...prev,
        [key]: value,
      }))
    }

  const submitApprove = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

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

    setIsSubmitting(true)

    try {
      const result = await requestErc20Approve(walletProvider, {
        ...form,
        from: account,
      })
      setLastTxHash(result.txHash)

      showDialog({
        title: '授权交易已提交',
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
      setIsSubmitting(false)
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
        输入 token 合约地址、spender 地址和授权额度，即可通过当前已连接的钱包发起授权交易。
      </p>

      <form className="approve-form" onSubmit={submitApprove}>
        <label className="approve-field" htmlFor="approve-token-address">
          <span>Token 合约地址</span>
          <input
            id="approve-token-address"
            type="text"
            className="approve-input"
            placeholder="0x..."
            value={form.tokenAddress}
            onChange={updateField('tokenAddress')}
          />
        </label>

        <label className="approve-field" htmlFor="approve-spender-address">
          <span>Spender 地址</span>
          <input
            id="approve-spender-address"
            type="text"
            className="approve-input"
            placeholder="0x..."
            value={form.spender}
            onChange={updateField('spender')}
          />
        </label>

        <label className="approve-field" htmlFor="approve-amount">
          <span>授权额度</span>
          <input
            id="approve-amount"
            type="text"
            className="approve-input"
            placeholder="如 1000000 / 1.5 / max"
            value={form.amount}
            onChange={updateField('amount')}
          />
        </label>

        <div className="approve-actions">
          <Button type="submit" disabled={!canSubmit} className="w-full">
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                提交授权中...
              </>
            ) : (
              '发起授权交易'
            )}
          </Button>
        </div>
      </form>

      <p className="approve-hint">
        金额支持整数和小数，都会自动按 token decimals 转换；也支持 `max`（最大授权）。
      </p>
      {lastTxHash && <p className="approve-hash">最近交易: {shortenHash(lastTxHash)}</p>}
    </section>
  )
}
