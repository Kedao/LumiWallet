export type AppDialogVariant = 'error' | 'warning' | 'info' | 'success'

export interface AppDialogInput {
  title: string
  message: string
  variant?: AppDialogVariant
  actionText?: string
}

export interface AppDialogEvent {
  id: number
  title: string
  message: string
  variant: AppDialogVariant
  actionText: string
}

type DialogListener = (dialog: AppDialogEvent) => void

const listeners = new Set<DialogListener>()
let sequence = 0

export function showDialog(input: AppDialogInput): void {
  const event: AppDialogEvent = {
    id: ++sequence,
    title: input.title,
    message: input.message,
    variant: input.variant ?? 'info',
    actionText: input.actionText ?? '我知道了',
  }

  listeners.forEach((listener) => listener(event))
}

export function showErrorDialog(title: string, message: string): void {
  showDialog({
    title,
    message,
    variant: 'error',
  })
}

export function subscribeDialog(listener: DialogListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
