import { useWallet } from '@/hooks/useWallet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Wallet, Loader2 } from 'lucide-react'
import type { KeyboardEvent } from 'react'

/**
 * Format address: 0x1234...5678
 */
function formatAddress(address: string): string {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function handleKeyboardActivate(
  event: KeyboardEvent<HTMLDivElement>,
  disabled: boolean,
  action: () => void
) {
  if (disabled) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    action()
  }
}

/**
 * WalletConnect Component
 * Displays wallet connection status and provides connect/disconnect actions
 */
export function WalletConnect() {
  const { account, chainId, isConnected, isLoading, connect, disconnect } = useWallet()

  // Connected state
  if (isConnected && account) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Badge variant="secondary" className="flex items-center gap-2 px-3 py-1.5">
          <Wallet className="h-4 w-4" />
          <span className="font-mono">{formatAddress(account)}</span>
        </Badge>
        {chainId && (
          <Badge variant="outline" className="px-3 py-1.5">
            Chain ID: {parseInt(chainId, 16)}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={disconnect}
          className="border border-[var(--card-border)]"
        >
          断开连接
        </Button>
      </div>
    )
  }

  // Not connected state
  return (
    <div
      role="button"
      tabIndex={isLoading ? -1 : 0}
      aria-disabled={isLoading}
      onClick={() => {
        if (!isLoading) connect()
      }}
      onKeyDown={(event) => handleKeyboardActivate(event, isLoading, connect)}
      className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-[var(--brand)] text-sm font-semibold leading-none text-white shadow-[0_10px_24px_rgba(11,108,255,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--brand-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      style={{
        paddingLeft: '1.75rem',
        paddingRight: '1.75rem',
        paddingTop: '0.75rem',
        paddingBottom: '0.75rem',
        opacity: isLoading ? 0.5 : 1,
        pointerEvents: isLoading ? 'none' : 'auto',
      }}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          连接中...
        </>
      ) : (
        <>
          <Wallet className="h-4 w-4" />
          连接钱包
        </>
      )}
    </div>
  )
}
