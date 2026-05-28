'use client'

import { useState } from 'react'
import { useBrandAutocomplete } from '@/hooks/useBrandAutocomplete'
import { cn } from '@/lib/utils'

interface BrandInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export default function BrandInput({ value, onChange, placeholder, className, disabled }: BrandInputProps) {
  const { getSuggestions } = useBrandAutocomplete()
  const [open, setOpen] = useState(false)

  const suggestions = open && value.length > 0 ? getSuggestions(value) : []

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? 'Ex: Gerdau, Tigre, Bosch…'}
        className={cn(className)}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map(brand => (
            <button
              key={brand}
              type="button"
              onMouseDown={() => { onChange(brand); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
            >
              <span className="text-gray-400 text-xs">🕐</span>
              <span className="text-gray-800 font-medium">{brand}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
