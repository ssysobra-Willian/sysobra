'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Loader2, Building2 } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Bancos favoritos — mostrados por padrão sem digitar ──────────────────────

const FAVORITES = [
  { code: '001', name: 'Banco do Brasil' },
  { code: '237', name: 'Bradesco' },
  { code: '104', name: 'Caixa Econômica Federal' },
  { code: '341', name: 'Itaú' },
  { code: '033', name: 'Santander' },
  { code: '260', name: 'Nubank' },
  { code: '077', name: 'Banco Inter' },
  { code: '756', name: 'Sicoob' },
  { code: '748', name: 'Sicredi' },
]

export interface BankOption {
  id:       string
  code:     string | null
  name:     string
  fullName?: string | null
}

interface Props {
  token:      string
  value:      string        // texto exibido no input
  bankId?:    string
  bankCode?:  string
  onChange:   (opt: { value: string; id: string; code: string }) => void
  label?:     string
  placeholder?: string
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function BankSearchInput({
  token, value, onChange, label = 'Banco', placeholder = 'Buscar banco pelo nome ou código...',
}: Props) {
  const [query,    setQuery]    = useState(value)
  const [results,  setResults]  = useState<BankOption[]>([])
  const [open,     setOpen]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const timer   = useRef<ReturnType<typeof setTimeout>>()

  // Sync externo → input
  useEffect(() => { setQuery(value) }, [value])

  // Fechar ao clicar fora
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Busca com debounce 300ms
  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      // Mostra favoritos
      setResults(FAVORITES.map((f, i) => ({ id: `fav-${i}`, code: f.code, name: f.name })))
      setOpen(true)
      return
    }
    setLoading(true)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const res = await fetch(
        `${API}/api/financial/banks?search=${encodeURIComponent(q)}&limit=12`,
        { headers },
      )
      if (res.ok) {
        const data = await res.json()
        setResults(data.banks ?? [])
        setOpen(true)
      }
    } catch { /* silent */ } finally { setLoading(false) }
  }, [token])

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setQuery(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(v), 300)
  }

  function handleFocus() {
    if (!open) search(query)
  }

  function selectBank(bank: BankOption) {
    const id   = bank.id.startsWith('fav-') ? '' : bank.id
    const code = bank.code ?? ''
    setQuery(bank.code ? `${bank.code} — ${bank.name}` : bank.name)
    onChange({ value: bank.name, id, code })
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative space-y-1">
      {label && (
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {label}
        </label>
      )}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={handleFocus}
          placeholder={placeholder}
          className="w-full pl-8 pr-8 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
        />
        {loading && (
          <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin pointer-events-none" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-30 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto mt-1">
          {/* Cabeçalho favoritos */}
          {!query.trim() && (
            <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Bancos mais usados</p>
            </div>
          )}
          {results.map((b) => (
            <button
              key={b.id}
              onMouseDown={(e) => { e.preventDefault(); selectBank(b) }}
              className="w-full text-left px-4 py-2.5 hover:bg-orange-50 transition-colors border-b border-gray-50 last:border-0 flex items-center gap-3"
            >
              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Building2 size={13} className="text-gray-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {b.code ? <span className="text-gray-400 font-mono text-xs mr-1">{b.code}</span> : null}
                  {b.name}
                </p>
                {b.fullName && b.fullName !== b.name && (
                  <p className="text-[11px] text-gray-400 truncate">{b.fullName}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
