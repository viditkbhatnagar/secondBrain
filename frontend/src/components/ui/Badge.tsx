import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { X } from 'lucide-react';

const badgeVariants = cva(
  'inline-flex items-center font-medium transition-colors',
  {
    variants: {
      variant: {
        default: [
          'bg-secondary-100 text-secondary-700',
          'dark:bg-secondary-700 dark:text-secondary-300',
        ],
        primary: [
          'bg-primary-100 text-primary-700',
          'dark:bg-primary-900/30 dark:text-primary-300',
        ],
        secondary: [
          'bg-secondary-100 text-secondary-700',
          'dark:bg-secondary-700 dark:text-secondary-300',
        ],
        success: [
          'bg-success-100 text-success-700',
          'dark:bg-success-900/30 dark:text-success-300',
        ],
        warning: [
          'bg-warning-100 text-warning-700',
          'dark:bg-warning-900/30 dark:text-warning-300',
        ],
        danger: [
          'bg-danger-100 text-danger-700',
          'dark:bg-danger-900/30 dark:text-danger-300',
        ],
        info: [
          'bg-info-100 text-info-700',
          'dark:bg-info-900/30 dark:text-info-300',
        ],
        outline: [
          'border border-secondary-300 text-secondary-700 bg-transparent',
          'dark:border-secondary-600 dark:text-secondary-300',
        ],
      },
      size: {
        sm: 'px-2 py-0.5 text-xs rounded',
        md: 'px-2.5 py-0.5 text-xs rounded-md',
        lg: 'px-3 py-1 text-sm rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  removable?: boolean;
  onRemove?: () => void;
  icon?: React.ReactNode;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, removable, onRemove, icon, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={clsx(badgeVariants({ variant, size }), className)}
        {...props}
      >
        {icon && <span className="mr-1 -ml-0.5">{icon}</span>}
        {children}
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-1 -mr-0.5 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            aria-label="Remove"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

// Status Badge with dot indicator
export interface StatusBadgeProps {
  status: 'online' | 'offline' | 'busy' | 'away' | 'success' | 'error' | 'warning' | 'pending';
  label?: string;
  className?: string;
}

const statusColors: Record<StatusBadgeProps['status'], string> = {
  online: 'bg-success-500',
  offline: 'bg-secondary-400',
  busy: 'bg-danger-500',
  away: 'bg-warning-500',
  success: 'bg-success-500',
  error: 'bg-danger-500',
  warning: 'bg-warning-500',
  pending: 'bg-info-500',
};

const statusLabels: Record<StatusBadgeProps['status'], string> = {
  online: 'Online',
  offline: 'Offline',
  busy: 'Busy',
  away: 'Away',
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  pending: 'Pending',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, className }) => {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 text-xs font-medium text-secondary-600 dark:text-secondary-400',
        className
      )}
    >
      <span
        className={clsx(
          'h-2 w-2 rounded-full',
          statusColors[status],
          status === 'pending' && 'animate-pulse'
        )}
      />
      {label || statusLabels[status]}
    </span>
  );
};

// Count Badge (for notifications, etc.)
export interface CountBadgeProps {
  count: number;
  max?: number;
  variant?: 'primary' | 'danger' | 'secondary';
  className?: string;
}

export const CountBadge: React.FC<CountBadgeProps> = ({
  count,
  max = 99,
  variant = 'danger',
  className,
}) => {
  if (count <= 0) return null;

  const displayCount = count > max ? `${max}+` : count.toString();

  const variantClasses = {
    primary: 'bg-primary-600 text-white',
    danger: 'bg-danger-600 text-white',
    secondary: 'bg-secondary-600 text-white',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5',
        'text-xs font-semibold rounded-full',
        variantClasses[variant],
        className
      )}
    >
      {displayCount}
    </span>
  );
};

export { badgeVariants };
