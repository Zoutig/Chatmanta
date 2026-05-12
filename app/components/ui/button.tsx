import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-colors outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring,currentColor)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm shadow-black/5 hover:bg-[color-mix(in_oklab,var(--primary)_90%,black)]',
        destructive:
          'bg-[var(--destructive,#ef4444)] text-white shadow-sm shadow-black/5 hover:bg-[color-mix(in_oklab,var(--destructive,#ef4444)_90%,black)]',
        outline:
          'border border-[var(--border,#ececec)] bg-[var(--background,transparent)] text-[var(--foreground,inherit)] shadow-sm shadow-black/5 hover:bg-[var(--accent-soft,rgba(0,0,0,0.04))] hover:text-[var(--foreground,inherit)]',
        secondary:
          'bg-[var(--secondary,rgba(0,0,0,0.06))] text-[var(--secondary-foreground,inherit)] shadow-sm shadow-black/5 hover:bg-[color-mix(in_oklab,var(--secondary,rgba(0,0,0,0.06))_90%,black)]',
        ghost:
          'hover:bg-[var(--accent-soft,rgba(0,0,0,0.04))] hover:text-[var(--foreground,inherit)]',
        link: 'text-[var(--primary)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-10 rounded-lg px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
