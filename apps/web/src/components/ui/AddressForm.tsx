'use client'

import React, { useRef } from 'react'
import { Search, Loader2, AlertCircle } from 'lucide-react'
import { useCep } from '@/hooks/useCep'
import { formatCep } from '@/lib/validators'

export interface AddressData {
  zipCode:    string
  address:    string   // logradouro
  number:     string
  complement: string
  district:   string   // bairro
  city:       string
  state:      string   // UF
}

export const EMPTY_ADDRESS: AddressData = {
  zipCode: '', address: '', number: '', complement: '', district: '', city: '', state: '',
}

interface Props {
  data:     AddressData
  onChange: (data: AddressData) => void
  /** Classe extra no wrapper */
  className?: string
}

const fieldCls =
  'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-[#F5A623] transition-colors'

const readonlyCls =
  'w-full px-3 py-2.5 border border-gray-100 rounded-lg text-sm bg-gray-50 ' +
  'text-gray-600 focus:outline-none cursor-default'

const label = (text: string) => (
  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
    {text}
  </label>
)

export function AddressForm({ data, onChange, className = '' }: Props) {
  const cep       = useCep()
  const numberRef = useRef<HTMLInputElement>(null)

  function set(key: keyof AddressData, value: string) {
    onChange({ ...data, [key]: value })
  }

  async function lookupCep(raw: string) {
    const digits = raw.replace(/\D/g, '')
    if (digits.length !== 8) return
    const result = await cep.fetch(raw)
    if (result) {
      onChange({
        ...data,
        zipCode:    result.cep || formatCep(digits),
        address:    result.logradouro || data.address,
        district:   result.bairro     || data.district,
        city:       result.cidade,
        state:      result.estado,
      })
      // Foco automático no campo Número após preencher
      setTimeout(() => numberRef.current?.focus(), 50)
    }
  }

  function handleZipChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatCep(e.target.value)
    set('zipCode', formatted)
    if (formatted.replace(/\D/g,'').length === 8) {
      lookupCep(formatted)
    }
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Linha 1 — CEP + Logradouro */}
      <div className="grid grid-cols-12 gap-3">
        {/* CEP */}
        <div className="col-span-12 sm:col-span-3">
          {label('CEP')}
          <div className="relative">
            <input
              type="text"
              value={data.zipCode}
              onChange={handleZipChange}
              placeholder="00000-000"
              maxLength={9}
              inputMode="numeric"
              className={fieldCls}
            />
            <button
              type="button"
              onClick={() => lookupCep(data.zipCode)}
              title="Buscar CEP"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#F5A623] transition-colors"
            >
              {cep.loading
                ? <Loader2 size={14} className="animate-spin" />
                : <Search   size={14} />
              }
            </button>
          </div>
          {cep.error && (
            <p className="flex items-center gap-1 text-[11px] text-red-500 mt-0.5">
              <AlertCircle size={11} /> {cep.error}
            </p>
          )}
        </div>

        {/* Logradouro */}
        <div className="col-span-12 sm:col-span-9">
          {label('Logradouro')}
          <input
            type="text"
            value={data.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="Rua, Avenida, Praça..."
            className={fieldCls}
          />
        </div>
      </div>

      {/* Linha 2 — Número + Complemento + Bairro */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 sm:col-span-2">
          {label('Número')}
          <input
            ref={numberRef}
            type="text"
            value={data.number}
            onChange={(e) => set('number', e.target.value)}
            placeholder="Nº"
            className={fieldCls}
          />
        </div>
        <div className="col-span-12 sm:col-span-4">
          {label('Complemento')}
          <input
            type="text"
            value={data.complement}
            onChange={(e) => set('complement', e.target.value)}
            placeholder="Apto, Bloco, Sala..."
            className={fieldCls}
          />
        </div>
        <div className="col-span-12 sm:col-span-6">
          {label('Bairro')}
          <input
            type="text"
            value={data.district}
            onChange={(e) => set('district', e.target.value)}
            placeholder="Bairro"
            className={fieldCls}
          />
        </div>
      </div>

      {/* Linha 3 — Cidade + Estado */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 sm:col-span-8">
          {label('Cidade')}
          <input
            type="text"
            value={data.city}
            onChange={(e) => set('city', e.target.value)}
            placeholder="Cidade"
            className={cep.loading ? readonlyCls : fieldCls}
            readOnly={cep.loading}
          />
        </div>
        <div className="col-span-12 sm:col-span-4">
          {label('UF')}
          <input
            type="text"
            value={data.state}
            onChange={(e) => set('state', e.target.value.toUpperCase().slice(0, 2))}
            placeholder="SP"
            maxLength={2}
            className={cep.loading ? readonlyCls : fieldCls}
            readOnly={cep.loading}
          />
        </div>
      </div>
    </div>
  )
}
