'use client'

import React, { useId } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import {
  maskCpfCnpj, validateCpfCnpj,
  formatPhone, formatCep,
  formatBankAgency, formatCno,
} from '@/lib/validators'

// ─── Tipos de máscara ─────────────────────────────────────────────────────────

export type MaskType =
  | 'cpfCnpj'
  | 'cpf'
  | 'cnpj'
  | 'phone'
  | 'cep'
  | 'bankAgency'
  | 'bankAccount'
  | 'cno'
  | 'none'

function applyMask(raw: string, mask: MaskType): string {
  switch (mask) {
    case 'cpfCnpj':    return maskCpfCnpj(raw)
    case 'cpf':        return maskCpfCnpj(raw)
    case 'cnpj':       return maskCpfCnpj(raw)
    case 'phone':      return formatPhone(raw)
    case 'cep':        return formatCep(raw)
    case 'bankAgency': return formatBankAgency(raw)
    case 'cno':        return formatCno(raw)
    case 'bankAccount':
      // Livre — só limita 20 caracteres
      return raw.replace(/[^\d\w-]/g, '').slice(0, 20)
    default:           return raw
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface MaskedInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  mask:        MaskType
  value:       string
  onChange:    (value: string) => void
  label?:      string
  error?:      string
  /** Se true, exibe ícone verde/vermelho de validação */
  showValid?:  boolean
  /** Classe extra para o wrapper */
  wrapperCls?: string
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function MaskedInput({
  mask,
  value,
  onChange,
  label,
  error,
  showValid = false,
  wrapperCls = '',
  className = '',
  ...rest
}: MaskedInputProps) {
  const uid = useId()

  // Valida CPF/CNPJ inline quando showValid=true
  const validity: boolean | null =
    showValid && (mask === 'cpfCnpj' || mask === 'cpf' || mask === 'cnpj')
      ? validateCpfCnpj(value)
      : null

  const borderCls =
    error
      ? 'border-red-400 focus:ring-red-400'
      : validity === true
        ? 'border-green-400 focus:ring-green-400'
        : validity === false
          ? 'border-red-400 focus:ring-red-400'
          : 'border-gray-200 focus:ring-[#F5A623]'

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const masked = applyMask(e.target.value, mask)
    onChange(masked)
  }

  return (
    <div className={`space-y-1 ${wrapperCls}`}>
      {label && (
        <label htmlFor={uid} className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={uid}
          value={value}
          onChange={handleChange}
          className={`
            w-full px-3 py-2.5 border rounded-lg text-sm bg-white
            focus:outline-none focus:ring-2 transition-colors pr-8
            ${borderCls}
            ${className}
          `}
          {...rest}
        />
        {/* Ícone de validação — só CPF/CNPJ */}
        {showValid && validity !== null && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
            {validity
              ? <CheckCircle2 size={15} className="text-green-500" />
              : <AlertCircle  size={15} className="text-red-400"   />
            }
          </span>
        )}
      </div>
      {/* Mensagem de erro inline */}
      {(error || (validity === false && value.replace(/\D/g,'').length >= 11)) && (
        <p className="text-xs text-red-500">
          {error ?? (
            value.replace(/\D/g,'').length <= 11
              ? 'CPF inválido'
              : 'CNPJ inválido'
          )}
        </p>
      )}
    </div>
  )
}
