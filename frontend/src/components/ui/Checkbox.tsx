import React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { Check, Minus } from 'lucide-react';

// Checkbox Component
export interface CheckboxProps {
  checked?: boolean | 'indeterminate';
  onCheckedChange?: (checked: boolean | 'indeterminate') => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
  id,
}) => {
  const generatedId = React.useId();
  const checkboxId = id || generatedId;

  return (
    <div className={clsx('flex items-start gap-3', className)}>
      <CheckboxPrimitive.Root
        id={checkboxId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={clsx(
          'h-5 w-5 shrink-0 rounded border-2 mt-0.5',
          'transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'dark:focus:ring-offset-secondary-900',
          checked
            ? 'bg-primary-600 border-primary-600 dark:bg-primary-500 dark:border-primary-500'
            : 'bg-white border-secondary-300 dark:bg-secondary-800 dark:border-secondary-600'
        )}
      >
        <CheckboxPrimitive.Indicator asChild>
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="flex items-center justify-center text-white"
          >
            {checked === 'indeterminate' ? (
              <Minus className="h-3.5 w-3.5" strokeWidth={3} />
            ) : (
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            )}
          </motion.span>
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <label
              htmlFor={checkboxId}
              className={clsx(
                'text-sm font-medium text-secondary-900 dark:text-secondary-100',
                'cursor-pointer select-none',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              {label}
            </label>
          )}
          {description && (
            <span className="text-sm text-secondary-500 dark:text-secondary-400">
              {description}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// Switch/Toggle Component
export interface SwitchProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  id?: string;
}

const switchSizes = {
  sm: {
    root: 'h-5 w-9',
    thumb: 'h-4 w-4 data-[state=checked]:translate-x-4',
  },
  md: {
    root: 'h-6 w-11',
    thumb: 'h-5 w-5 data-[state=checked]:translate-x-5',
  },
  lg: {
    root: 'h-7 w-14',
    thumb: 'h-6 w-6 data-[state=checked]:translate-x-7',
  },
};

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  size = 'md',
  className,
  id,
}) => {
  const generatedId = React.useId();
  const switchId = id || generatedId;
  const sizeClasses = switchSizes[size];

  return (
    <div className={clsx('flex items-start gap-3', className)}>
      <SwitchPrimitive.Root
        id={switchId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={clsx(
          'relative inline-flex shrink-0 cursor-pointer rounded-full',
          'transition-colors duration-200 ease-in-out',
          'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'dark:focus:ring-offset-secondary-900',
          sizeClasses.root,
          checked
            ? 'bg-primary-600 dark:bg-primary-500'
            : 'bg-secondary-200 dark:bg-secondary-700'
        )}
      >
        <SwitchPrimitive.Thumb
          className={clsx(
            'pointer-events-none inline-block rounded-full bg-white shadow-lg',
            'transform transition-transform duration-200 ease-in-out',
            sizeClasses.thumb
          )}
        />
      </SwitchPrimitive.Root>
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <label
              htmlFor={switchId}
              className={clsx(
                'text-sm font-medium text-secondary-900 dark:text-secondary-100',
                'cursor-pointer select-none',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              {label}
            </label>
          )}
          {description && (
            <span className="text-sm text-secondary-500 dark:text-secondary-400">
              {description}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
