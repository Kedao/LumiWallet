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
    <div className="relative">
      <div
        role="button"
        tabIndex={isLoading ? -1 : 0}
        aria-disabled={isLoading}
        onClick={() => {
          if (!isLoading) connect()
        }}
        onKeyDown={(event) => handleKeyboardActivate(event, isLoading, connect)}
        className={`wallet-connect-trigger ${
          isLoading ? 'wallet-connect-trigger-loading' : ''
        }`}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            等待钱包授权...
          </>
        ) : (
          <>
            <Wallet className="h-4 w-4" />
            连接钱包
          </>
        )}
      </div>

      {isLoading && (
        <p className="wallet-auth-hint">
          需手动打开 MetaMask 插件并确认连接
        </p>
      )}
    </div>
  )
}
