import eGoldTokenIcon from './tokens/eGold_token.png'
import monTokenIcon from './tokens/mon_token.ico'

const TOKEN_ICON_BY_SYMBOL: Record<string, string> = {
  MON: monTokenIcon,
  EGOLD: eGoldTokenIcon
}

const normalizeTokenSymbol = (symbol: string): string => symbol.replace(/[^a-z0-9]/gi, '').toUpperCase()

export const getTokenIconSrc = (symbol: string | null | undefined): string | null => {
  if (!symbol) {
    return null
  }
  const normalized = normalizeTokenSymbol(symbol)
  return TOKEN_ICON_BY_SYMBOL[normalized] ?? null
}
