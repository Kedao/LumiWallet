import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react'

import { subscribeDialog, type AppDialogEvent, type AppDialogVariant } from '@/lib/dialogBus'

const variantIconMap: Record<AppDialogVariant, ReactNode> = {
  error: <AlertTriangle className="h-5 w-5" />,
  warning: <ShieldAlert className="h-5 w-5" />,
  info: <Info className="h-5 w-5" />,
  success: <CheckCircle2 className="h-5 w-5" />,
}

function isKeyboardActivate(event: ReactKeyboardEvent<HTMLDivElement>): boolean {
  return event.key === 'Enter' || event.key === ' '
}

export function GlobalDialogHost() {
  const [queue, setQueue] = useState<AppDialogEvent[]>([])

  useEffect(() => {
    return subscribeDialog((dialog) => {
      setQueue((prev) => [...prev, dialog])
    })
  }, [])

  const current = queue[0]

  const dismiss = useMemo(
    () => () => {
      setQueue((prev) => prev.slice(1))
    },
    []
  )

  useEffect(() => {
    if (!current) return

    const onEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismiss()
      }
    }

    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('keydown', onEsc)
    }
  }, [current, dismiss])

  if (!current) {
    return null
  }

  return (
    <div className="app-dialog-overlay" onClick={dismiss}>
      <section
        className={`app-dialog-card app-dialog-${current.variant}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`dialog-title-${current.id}`}
        aria-describedby={`dialog-message-${current.id}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="app-dialog-header">
          <div className="app-dialog-icon" aria-hidden>
            {variantIconMap[current.variant]}
          </div>
          <h3 id={`dialog-title-${current.id}`} className="app-dialog-title">
            {current.title}
          </h3>
        </div>

        <p id={`dialog-message-${current.id}`} className="app-dialog-message">
          {current.message}
        </p>

        <div
          role="button"
          tabIndex={0}
          className="app-dialog-action"
          onClick={dismiss}
          onKeyDown={(event) => {
            if (isKeyboardActivate(event)) {
              event.preventDefault()
              dismiss()
            }
          }}
        >
          {current.actionText}
        </div>
      </section>
    </div>
  )
}
