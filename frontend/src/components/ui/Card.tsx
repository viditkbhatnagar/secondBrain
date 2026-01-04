import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { motion, type HTMLMotionProps } from 'framer-motion';

const cardVariants = cva(
  ['rounded-2xl transition-all duration-300'],
  {
    variants: {
      variant: {
        elevated: [
          'relative overflow-hidden',
          'bg-gradient-to-br from-white/95 to-white/85',
          'dark:from-secondary-800/95 dark:to-secondary-800/85',
          'backdrop-blur-xl',
        ],
        glossy: [
          'glass-card',
        ],
        outlined: [
          'bg-white border-2 border-secondary-200',
          'dark:bg-secondary-800 dark:border-secondary-700',
        ],
        filled: [
          'bg-secondary-50 border border-secondary-100',
          'dark:bg-secondary-800/50 dark:border-secondary-700/50',
        ],
        ghost: [
          'bg-transparent',
        ],
        glass: [
          'bg-white/80 backdrop-blur-md border border-white/20 shadow-lg',
          'dark:bg-secondary-900/80 dark:border-secondary-700/20',
        ],
      },
      padding: {
        none: 'p-0',
        sm: 'p-3',
        md: 'p-4',
        lg: 'p-6',
        xl: 'p-8',
      },
      hoverable: {
        true: '',
      },
      clickable: {
        true: 'cursor-pointer',
      },
    },
    compoundVariants: [
      {
        variant: 'elevated',
        hoverable: true,
        className: 'glass-elevated',
      },
      {
        variant: 'glossy',
        hoverable: true,
        className: 'glass-elevated',
      },
      {
        variant: 'outlined',
        hoverable: true,
        className: 'hover:border-primary-300 dark:hover:border-primary-600',
      },
      {
        variant: 'filled',
        hoverable: true,
        className: 'hover:bg-secondary-100 dark:hover:bg-secondary-700/50',
      },
    ],
    defaultVariants: {
      variant: 'elevated',
      padding: 'md',
    },
  }
);

// Glossy shadow styles
const glossyShadow = {
  boxShadow: `
    0 4px 6px -1px rgba(0, 0, 0, 0.05),
    0 10px 15px -3px rgba(0, 0, 0, 0.08),
    0 20px 25px -5px rgba(0, 0, 0, 0.08),
    0 0 0 1px rgba(255, 255, 255, 0.5),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.9),
    inset 0 -1px 0 0 rgba(0, 0, 0, 0.05)
  `
};

export interface CardProps
  extends Omit<HTMLMotionProps<'div'>, 'children'>,
    VariantProps<typeof cardVariants> {
  children?: React.ReactNode;
  as?: 'div' | 'article' | 'section';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, hoverable, clickable, children, as = 'div', style, ...props }, ref) => {
    const Component = motion[as];
    const isGlossy = variant === 'elevated' || variant === 'glossy';
    
    return (
      <Component
        ref={ref}
        className={clsx(cardVariants({ variant, padding, hoverable, clickable }), className)}
        style={isGlossy ? { ...glossyShadow, ...style } : style}
        whileHover={hoverable ? { y: -2 } : undefined}
        whileTap={clickable ? { scale: 0.99 } : undefined}
        transition={{ duration: 0.2 }}
        {...props}
      >
        {/* Glossy shine overlay */}
        {isGlossy && (
          <div 
            className="absolute inset-x-0 top-0 h-1/2 pointer-events-none rounded-t-2xl"
            style={{
              background: 'linear-gradient(to bottom, rgba(255,255,255,0.5), transparent)'
            }}
          />
        )}
        {/* Content */}
        <div className="relative z-10">
          {children}
        </div>
      </Component>
    );
  }
);

Card.displayName = 'Card';

// Card Header
export interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, title, subtitle, action, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={clsx('flex items-start justify-between gap-4', className)}
        {...props}
      >
        <div className="flex-1 min-w-0">
          {title && (
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100 truncate">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="mt-1 text-sm text-secondary-500 dark:text-secondary-400">
              {subtitle}
            </p>
          )}
          {children}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    );
  }
);

CardHeader.displayName = 'CardHeader';

// Card Content
export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={clsx('', className)} {...props} />
));

CardContent.displayName = 'CardContent';

// Card Footer
export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={clsx('flex items-center gap-3 pt-4 mt-4 border-t border-secondary-200/50 dark:border-secondary-700/50', className)}
    {...props}
  />
));

CardFooter.displayName = 'CardFooter';

export { cardVariants };
