import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent text-sm font-semibold leading-none transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--brand)] text-white shadow-[0_10px_24px_rgba(11,108,255,0.28)] hover:-translate-y-0.5 hover:bg-[var(--brand-strong)]',
        destructive: 'bg-[#d93a4a] text-white hover:bg-[#bf2f3f]',
        outline: 'border-[var(--card-border)] bg-white/85 text-[var(--text-main)] hover:bg-white',
        secondary: 'bg-[var(--accent-soft)] text-[#7a4300] hover:bg-[#ffd5b2]',
        ghost: 'text-[var(--text-subtle)] hover:bg-white/85 hover:text-[var(--text-main)]',
        link: 'text-[var(--brand)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'min-h-11 pl-6 pr-6 pt-2.5 pb-2.5',
        sm: 'min-h-9 pl-4 pr-4 pt-2 pb-2 text-xs',
        lg: 'min-h-12 pl-8 pr-8 pt-3 pb-3 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
