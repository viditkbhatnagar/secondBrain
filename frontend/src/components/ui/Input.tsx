import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle, Search, X } from 'lucide-react';

const inputVariants = cva(
  [
    'w-full rounded-lg border bg-white text-secondary-900',
    'placeholder-secondary-400',
    'transition-all duration-200',
    'focus:outline-none focus:ring-2 focus:ring-offset-0',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-secondary-50',
    'dark:bg-secondary-800 dark:text-secondary-100 dark:placeholder-secondary-500',
  ],
  {
    variants: {
      variant: {
        default: [
          'border-secondary-300',
          'focus:border-primary-500 focus:ring-primary-500/20',
          'dark:border-secondary-600 dark:focus:border-primary-400',
        ],
        error: [
          'border-danger-500',
          'focus:border-danger-500 focus:ring-danger-500/20',
          'dark:border-danger-400',
        ],
        success: [
          'border-success-500',
          'focus:border-success-500 focus:ring-success-500/20',
          'dark:border-success-400',
        ],
      },
      inputSize: {
        sm: 'px-3 py-2 text-sm',
        md: 'px-4 py-2.5 text-sm',
        lg: 'px-4 py-3 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      inputSize: 'md',
    },
  }
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  label?: string;
  helperText?: string;
  errorMessage?: string;
  successMessage?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onClear?: () => void;
  showClearButton?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      variant,
      inputSize,
      label,
      helperText,
      errorMessage,
      successMessage,
      leftIcon,
      rightIcon,
      onClear,
      showClearButton,
      id,
      value,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id || `input-${generatedId}`;
    const hasError = !!errorMessage;
    const hasSuccess = !!successMessage;
    const computedVariant = hasError ? 'error' : hasSuccess ? 'success' : variant;
    const showClear = showClearButton && value && String(value).length > 0;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400 pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            value={value}
            className={clsx(
              inputVariants({ variant: computedVariant, inputSize }),
              leftIcon && 'pl-10',
              (rightIcon || showClear || hasError || hasSuccess) && 'pr-10',
              className
            )}
            aria-invalid={hasError}
            aria-describedby={
              hasError ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
            }
            {...props}
          />
          {(rightIcon || showClear || hasError || hasSuccess) && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {showClear && onClear && (
                <button
                  type="button"
                  onClick={onClear}
                  className="p-0.5 text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300 transition-colors"
                  aria-label="Clear input"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {hasError && <AlertCircle className="h-4 w-4 text-danger-500" />}
              {hasSuccess && !hasError && <CheckCircle className="h-4 w-4 text-success-500" />}
              {rightIcon && !hasError && !hasSuccess && (
                <span className="text-secondary-400">{rightIcon}</span>
              )}
            </div>
          )}
        </div>
        {(helperText || errorMessage || successMessage) && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className={clsx(
              'mt-1.5 text-sm',
              hasError && 'text-danger-600 dark:text-danger-400',
              hasSuccess && !hasError && 'text-success-600 dark:text-success-400',
              !hasError && !hasSuccess && 'text-secondary-500 dark:text-secondary-400'
            )}
            id={hasError ? `${inputId}-error` : `${inputId}-helper`}
            role={hasError ? 'alert' : undefined}
          >
            {errorMessage || successMessage || helperText}
          </motion.p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

// Search Input variant
export interface SearchInputProps extends Omit<InputProps, 'leftIcon'> {
  onSearch?: (value: string) => void;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ onSearch, onKeyDown, ...props }, ref) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && onSearch) {
        onSearch((e.target as HTMLInputElement).value);
      }
      onKeyDown?.(e);
    };

    return (
      <Input
        ref={ref}
        type="search"
        leftIcon={<Search className="h-4 w-4" />}
        showClearButton
        onKeyDown={handleKeyDown}
        {...props}
      />
    );
  }
);

SearchInput.displayName = 'SearchInput';

// Textarea
export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  errorMessage?: string;
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, helperText, errorMessage, resize = 'vertical', id, ...props }, ref) => {
    const generatedId = React.useId();
    const textareaId = id || `textarea-${generatedId}`;
    const hasError = !!errorMessage;

    const resizeClass = {
      none: 'resize-none',
      vertical: 'resize-y',
      horizontal: 'resize-x',
      both: 'resize',
    }[resize];

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1.5"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={clsx(
            'w-full px-4 py-3 rounded-lg border bg-white text-secondary-900',
            'placeholder-secondary-400 min-h-[100px]',
            'transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            'dark:bg-secondary-800 dark:text-secondary-100 dark:placeholder-secondary-500',
            hasError
              ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/20'
              : 'border-secondary-300 focus:border-primary-500 focus:ring-primary-500/20 dark:border-secondary-600',
            resizeClass,
            className
          )}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined}
          {...props}
        />
        {(helperText || errorMessage) && (
          <p
            className={clsx(
              'mt-1.5 text-sm',
              hasError ? 'text-danger-600 dark:text-danger-400' : 'text-secondary-500 dark:text-secondary-400'
            )}
            id={hasError ? `${textareaId}-error` : `${textareaId}-helper`}
            role={hasError ? 'alert' : undefined}
          >
            {errorMessage || helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export { inputVariants };
