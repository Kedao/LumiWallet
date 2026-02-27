import { CSSProperties } from 'react'
import { getTokenIconSrc } from '../assets/tokenIcons'

type TokenIconProps = {
  symbol: string
  size?: number
  background?: string
  borderColor?: string
  style?: CSSProperties
}

const TokenIcon = ({ symbol, size = 24, background = '#f3f5f8', borderColor = 'var(--border)', style }: TokenIconProps) => {
  const iconSrc = getTokenIconSrc(symbol)

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background,
        border: `1px solid ${borderColor}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flex: '0 0 auto',
        ...style
      }}
    >
      {iconSrc ? (
        <img
          src={iconSrc}
          alt={`${symbol} icon`}
          width={size}
          height={size}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span style={{ fontSize: Math.max(10, Math.floor(size * 0.4)), fontWeight: 700, color: 'var(--ink)' }}>
          {symbol.slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  )
}

export default TokenIcon
