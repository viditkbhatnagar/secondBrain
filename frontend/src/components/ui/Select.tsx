import React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { clsx } from 'clsx';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  helperText?: string;
  errorMessage?: string;
  disabled?: boolean;
  className?: string;
}

export const Select: React.FC<SelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder = 'Select an option',
  label,
  helperText,
  errorMessage,
  disabled,
  className,
}) => {
  const hasError = !!errorMessage;
  const id = React.useId();

  return (
    <div className={clsx('w-full', className)}>
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1.5"
        >
          {label}
        </label>
      )}
      <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectPrimitive.Trigger
          id={id}
          className={clsx(
            'flex items-center justify-between w-full px-4 py-2.5',
            'text-sm rounded-lg border bg-white',
            'transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-secondary-50',
            'dark:bg-secondary-800 dark:text-secondary-100',
            hasError
              ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/20'
              : 'border-secondary-300 focus:border-primary-500 focus:ring-primary-500/20 dark:border-secondary-600',
            'data-[placeholder]:text-secondary-400'
          )}
          aria-invalid={hasError}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon>
            <ChevronDown className="h-4 w-4 text-secondary-400" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className={clsx(
              'z-[1060] overflow-hidden',
              'bg-white dark:bg-secondary-800',
              'border border-secondary-200 dark:border-secondary-700',
              'rounded-lg shadow-lg',
              'min-w-[var(--radix-select-trigger-width)]',
              'max-h-[var(--radix-select-content-available-height)]'
            )}
          >
            <SelectPrimitive.ScrollUpButton className="flex items-center justify-center h-6 bg-white dark:bg-secondary-800 cursor-default">
              <ChevronUp className="h-4 w-4 text-secondary-400" />
            </SelectPrimitive.ScrollUpButton>
            
            <SelectPrimitive.Viewport className="p-1">
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={clsx(
                    'relative flex items-center px-8 py-2 text-sm rounded-md',
                    'cursor-pointer select-none outline-none',
                    'text-secondary-900 dark:text-secondary-100',
                    'data-[highlighted]:bg-primary-50 data-[highlighted]:text-primary-900',
                    'dark:data-[highlighted]:bg-primary-900/20 dark:data-[highlighted]:text-primary-100',
                    'data-[disabled]:opacity-50 data-[disabled]:pointer-events-none'
                  )}
                >
                  <SelectPrimitive.ItemIndicator className="absolute left-2">
                    <Check className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                  </SelectPrimitive.ItemIndicator>
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>

            <SelectPrimitive.ScrollDownButton className="flex items-center justify-center h-6 bg-white dark:bg-secondary-800 cursor-default">
              <ChevronDown className="h-4 w-4 text-secondary-400" />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>

      {(helperText || errorMessage) && (
        <p
          className={clsx(
            'mt-1.5 text-sm',
            hasError ? 'text-danger-600 dark:text-danger-400' : 'text-secondary-500 dark:text-secondary-400'
          )}
          role={hasError ? 'alert' : undefined}
        >
          {errorMessage || helperText}
        </p>
      )}
    </div>
  );
};
