import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold transition-[background,color,border-color,box-shadow,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent)_92%,white),var(--accent-2))] text-accent-fg shadow-[0_8px_24px_-10px_var(--accent),inset_0_1px_0_rgb(255_255_255/0.35)] hover:brightness-110',
        secondary: 'border border-line-strong bg-surface-2 text-fg hover:border-[color-mix(in_oklab,var(--accent)_35%,var(--line-strong))] hover:bg-surface-3',
        ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg',
        outline: 'border border-[color-mix(in_oklab,var(--accent)_45%,transparent)] text-accent hover:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]',
        danger: 'border border-[color-mix(in_oklab,var(--c-crimson)_40%,transparent)] bg-[color-mix(in_oklab,var(--c-crimson)_14%,transparent)] text-crimson hover:bg-[color-mix(in_oklab,var(--c-crimson)_22%,transparent)]',
        gold: 'bg-[linear-gradient(180deg,#f6d389,var(--c-gold)_55%,#b07a1c)] text-[#1b1305] shadow-[0_8px_24px_-10px_var(--c-gold)] hover:brightness-110',
        success: 'bg-[color-mix(in_oklab,var(--c-emerald)_16%,transparent)] text-emerald border border-[color-mix(in_oklab,var(--c-emerald)_40%,transparent)] hover:bg-[color-mix(in_oklab,var(--c-emerald)_24%,transparent)]',
      },
      size: {
        xs: 'h-7 px-2.5 text-xs',
        sm: 'h-8 px-3 text-[0.8rem]',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-[0.95rem]',
        icon: 'size-9 p-0',
        'icon-sm': 'size-7 p-0 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = 'button', ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
