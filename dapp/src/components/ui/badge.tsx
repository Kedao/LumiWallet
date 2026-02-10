import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.02em] transition-colors backdrop-blur-sm',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[var(--brand)] text-white shadow-[0_8px_18px_rgba(11,108,255,0.24)] hover:bg-[var(--brand-strong)]',
        secondary: 'border-transparent bg-white/85 text-[var(--text-main)] hover:bg-white',
        destructive: 'border-transparent bg-[#d93a4a] text-white hover:bg-[#bf2f3f]',
        outline: 'border-[var(--card-border)] bg-white/72 text-[var(--text-main)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
