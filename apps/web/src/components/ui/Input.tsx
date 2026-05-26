import { InputHTMLAttributes, forwardRef, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?:       string
  error?:       string
  hint?:        string
  leftAddon?:   ReactNode
  rightAddon?:  ReactNode
  wrapperClassName?: string
}

// ─── Componente ───────────────────────────────────────────────────────────────

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      leftAddon,
      rightAddon,
      wrapperClassName,
      className,
      id,
      ...props
    },
    ref,
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className={cn('flex flex-col gap-1', wrapperClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {label}
            {props.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}

        <div className="relative flex items-center">
          {leftAddon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
              {leftAddon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            className={cn(
              // base
              'w-full border rounded-lg text-sm text-gray-900 dark:text-gray-100',
              'bg-white dark:bg-neutral-800',
              'placeholder:text-gray-400 dark:placeholder:text-gray-500',
              'transition-colors duration-150',
              // focus
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
              // default border
              'border-gray-200 dark:border-neutral-600',
              // error state
              error
                ? 'border-red-400 focus:ring-red-400 dark:border-red-500'
                : 'hover:border-gray-300 dark:hover:border-neutral-500',
              // disabled
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50 dark:disabled:bg-neutral-900',
              // padding with addons
              leftAddon  ? 'pl-9'  : 'pl-3.5',
              rightAddon ? 'pr-9'  : 'pr-3.5',
              'py-2.5',
              className,
            )}
            {...props}
          />

          {rightAddon && (
            <div className="absolute right-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
              {rightAddon}
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
            <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </p>
        )}

        {hint && !error && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'

// ─── Textarea companion ───────────────────────────────────────────────────────

interface TextareaProps extends InputHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?:  string
  rows?:  number
  wrapperClassName?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, wrapperClassName, className, id, rows = 3, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className={cn('flex flex-col gap-1', wrapperClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {label}
            {props.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}

        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          className={cn(
            'w-full border rounded-lg text-sm text-gray-900 dark:text-gray-100 resize-y',
            'bg-white dark:bg-neutral-800',
            'placeholder:text-gray-400 dark:placeholder:text-gray-500',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
            'px-3.5 py-2.5',
            error
              ? 'border-red-400 focus:ring-red-400'
              : 'border-gray-200 dark:border-neutral-600 hover:border-gray-300',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className,
          )}
          {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
        {hint && !error && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
        )}
      </div>
    )
  },
)

Textarea.displayName = 'Textarea'
