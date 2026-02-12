interface HashTextProps {
  value: string
  mode?: 'wrap' | 'compact'
  startChars?: number
  endChars?: number
  fontSize?: number
  color?: string
}

const HashText = ({
  value,
  mode = 'wrap',
  startChars = 6,
  endChars = 4,
  fontSize = 12,
  color = 'inherit'
}: HashTextProps) => {
  const compactValue =
    value.length > startChars + endChars + 3
      ? `${value.slice(0, startChars)}...${value.slice(-endChars)}`
      : value

  return (
    <span
      title={value}
      style={{
        display: mode === 'wrap' ? 'block' : 'inline-block',
        minWidth: 0,
        fontFamily: 'monospace',
        fontSize,
        color,
        overflowWrap: mode === 'wrap' ? 'anywhere' : 'normal',
        wordBreak: mode === 'wrap' ? 'break-word' : 'normal',
        whiteSpace: mode === 'wrap' ? 'normal' : 'nowrap'
      }}
    >
      {mode === 'compact' ? compactValue : value}
    </span>
  )
}

export default HashText
