import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
  // Base styles
  [
    'inline-flex items-center justify-center gap-2',
    'font-medium text-sm rounded-lg',
    'transition-all duration-200',
    'focus:outline-none focus:ring-2 focus:ring-offset-2',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
    'active:scale-[0.98]',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-primary-600 text-white',
          'hover:bg-primary-700',
          'focus:ring-primary-500',
          'dark:bg-primary-500 dark:hover:bg-primary-600',
        ],
        secondary: [
          'bg-secondary-100 text-secondary-700',
          'hover:bg-secondary-200',
          'focus:ring-secondary-500',
          'dark:bg-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-600',
        ],
        ghost: [
          'bg-transparent text-secondary-600',
          'hover:bg-secondary-100',
          'focus:ring-secondary-500',
          'dark:text-secondary-400 dark:hover:bg-secondary-800',
        ],
        danger: [
          'bg-danger-600 text-white',
          'hover:bg-danger-700',
          'focus:ring-danger-500',
        ],
        success: [
          'bg-success-600 text-white',
          'hover:bg-success-700',
          'focus:ring-success-500',
        ],
        outline: [
          'border-2 border-primary-600 text-primary-600 bg-transparent',
          'hover:bg-primary-50',
          'focus:ring-primary-500',
          'dark:border-primary-400 dark:text-primary-400 dark:hover:bg-primary-950',
        ],
        link: [
          'text-primary-600 underline-offset-4',
          'hover:underline',
          'focus:ring-primary-500',
          'dark:text-primary-400',
          'p-0',
        ],
      },
      size: {
        xs: 'px-2.5 py-1.5 text-xs',
        sm: 'px-3 py-2 text-sm',
        md: 'px-4 py-2.5 text-sm',
        lg: 'px-5 py-3 text-base',
        xl: 'px-6 py-3.5 text-lg',
        icon: 'p-2',
        'icon-sm': 'p-1.5',
        'icon-lg': 'p-3',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends Omit<HTMLMotionProps<'button'>, 'children'>,
    VariantProps<typeof buttonVariants> {
  children?: React.ReactNode;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      isLoading,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <motion.button
        ref={ref}
        className={clsx(buttonVariants({ variant, size, fullWidth }), className)}
        disabled={disabled || isLoading}
        whileHover={{ scale: disabled || isLoading ? 1 : 1.02 }}
        whileTap={{ scale: disabled || isLoading ? 1 : 0.98 }}
        transition={{ duration: 0.15 }}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : leftIcon ? (
          <span className="shrink-0">{leftIcon}</span>
        ) : null}
        {children}
        {rightIcon && !isLoading && <span className="shrink-0">{rightIcon}</span>}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';

// Icon Button variant
export interface IconButtonProps extends Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'children'> {
  icon: React.ReactNode;
  'aria-label': string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, size = 'icon', variant = 'ghost', className, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        className={clsx('rounded-lg', className)}
        {...props}
      >
        {icon}
      </Button>
    );
  }
);

IconButton.displayName = 'IconButton';

export { buttonVariants };
