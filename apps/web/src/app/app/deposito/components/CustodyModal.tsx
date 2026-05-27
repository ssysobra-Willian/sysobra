'use client'

import React, { useState, useEffect, useRef } from 'react'
import { X, Package, User, MapPin, Calendar, Camera, Loader2, CheckCircle2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
function getToken()     { return typeof window !== 'undefined' ? (localStorage.getItem('token')     ?? '') : '' }
function getCompanyId() { return typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : '' }

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockItem {
  id:   string
  name: string
  unit: string
  serialNumber?: string | null
  quantity: number
}

interface Employee  { id: string; name: string; position?: string | null }
interface Project   { id: string; name: string }

interface CustodyPayload {
  stockItemId: string
  employeeId:  string
  projectId?:  string
  quantity:    number
  dueDate?:    string
  notes?:      string
  photoUrl?:   string
}

interface Props {
  item:      StockItem
  employees: Employee[]
  projects:  Project[]
  onClose:   () => void
  onSaved:   () => void
}

function addDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const QUICK_DATES = [
  { label: '7 dias',    days: 7  },
  { label: '15 dias',   days: 15 },
  { label: '30 dias',   days: 30 },
  { label: '60 dias',   days: 60 },
]

// ─── Searchable Select ────────────────────────────────────────────────────────

function SearchSelect<T extends { id: string; name: string; position?: string | null }>({
  options, value, onChange, placeholder, label,
}: {
  options:     T[]
  value:       string
  onChange:    (id: string) => void
  placeholder: string
  label:       string
}) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const filtered = options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()))
  const selected = options.find(o => o.id === value)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center justify-between border rounded-xl px-3 py-2.5 text-sm text-left transition',
          open ? 'border-[#F5A623] ring-2 ring-[#F5A623]/20' : 'border-gray-200 hover:border-gray-300',
          !selected && 'text-gray-400',
        )}
      >
        <span className={selected ? 'text-gray-800' : 'text-gray-400'}>
          {selected ? selected.name : placeholder}
        </span>
        <Search size={14} className="text-gray-400 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#F5A623]"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Nenhum resultado</p>
            ) : filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setQuery(''); setOpen(false) }}
                className={cn(
                  'w-full flex flex-col items-start px-3 py-2 text-sm hover:bg-gray-50 transition',
                  value === o.id && 'bg-orange-50',
                )}
              >
                <span className={cn('font-medium', value === o.id ? 'text-[#F5A623]' : 'text-gray-800')}>{o.name}</span>
                {(o as any).position && (
                  <span className="text-xs text-gray-400">{(o as any).position}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CustodyModal({ item, employees, projects, onClose, onSaved }: Props) {
  const photoRef = useRef<HTMLInputElement>(null)

  const [employeeId, setEmployeeId] = useState('')
  const [projectId,  setProjectId]  = useState('')
  const [quantity,   setQuantity]   = useState(1)
  const [dueDate,    setDueDate]    = useState('')
  const [notes,      setNotes]      = useState('')
  const [photoUrl,   setPhotoUrl]   = useState('')
  const [uploading,  setUploading]  = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState(false)

  const handlePhotoUpload = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${API}/api/v1/uploads/file`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'x-company-id': getCompanyId() },
        body: fd,
      })
      if (res.ok) {
        const d = await res.json()
        setPhotoUrl(d.url)
      }
    } catch { /* silencioso */ }
    finally { setUploading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!employeeId) { setError('Selecione o colaborador'); return }
    if (quantity < 1) { setError('Quantidade deve ser ≥ 1'); return }
    setSaving(true)
    setError('')
    try {
      const body: CustodyPayload = {
        stockItemId: item.id,
        employeeId,
        quantity,
        projectId:  projectId || undefined,
        dueDate:    dueDate   || undefined,
        notes:      notes     || undefined,
        photoUrl:   photoUrl  || undefined,
      }
      const res = await fetch(`${API}/api/v1/deposit/custodies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${getToken()}`,
          'x-company-id': getCompanyId(),
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `Erro ${res.status}`)
      }
      setSuccess(true)
      setTimeout(() => { onSaved(); onClose() }, 700)
    } catch (err: any) {
      setError(err.message ?? 'Erro ao registrar cautela')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      {/* Drag handle on mobile */}
      <div className="sm:hidden absolute top-0 inset-x-0 flex justify-center pt-2 pb-1">
        <div className="w-10 h-1 bg-white/40 rounded-full" />
      </div>

      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[96dvh] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
              <Package size={15} className="text-[#F5A623]" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800 text-sm">Cautela de Ferramenta</h2>
              <p className="text-xs text-gray-400 truncate max-w-48">{item.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Info da ferramenta */}
        <div className="mx-5 mt-4 bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <Package size={18} className="text-gray-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
            {item.serialNumber && (
              <p className="text-xs text-gray-400">Nº Série: {item.serialNumber}</p>
            )}
            <p className="text-xs text-gray-400">Disponível: {item.quantity} {item.unit}</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-4">

            {/* Colaborador */}
            <SearchSelect
              options={employees}
              value={employeeId}
              onChange={setEmployeeId}
              placeholder="Selecione o colaborador..."
              label="👷 Colaborador *"
            />

            {/* Obra */}
            <SearchSelect
              options={projects}
              value={projectId}
              onChange={setProjectId}
              placeholder="Selecione a obra (opcional)..."
              label="🏗️ Obra / Local"
            />

            {/* Quantidade */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Quantidade</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-10 h-10 rounded-xl border border-gray-200 text-xl text-gray-600 hover:bg-gray-50 transition font-light flex items-center justify-center"
                >−</button>
                <input
                  type="number"
                  min="1"
                  max={item.quantity}
                  value={quantity}
                  onChange={e => setQuantity(Math.min(item.quantity, Math.max(1, Number(e.target.value))))}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30 focus:border-[#F5A623]"
                />
                <button
                  type="button"
                  onClick={() => setQuantity(q => Math.min(item.quantity, q + 1))}
                  className="w-10 h-10 rounded-xl border border-gray-200 text-xl text-gray-600 hover:bg-gray-50 transition font-light flex items-center justify-center"
                >+</button>
                <span className="text-xs text-gray-400">{item.unit}</span>
              </div>
            </div>

            {/* Prazo de devolução */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                <Calendar size={10} className="inline mr-1" />Prazo de Devolução
              </label>
              <div className="flex gap-2 mb-2 flex-wrap">
                {QUICK_DATES.map(q => (
                  <button
                    key={q.days}
                    type="button"
                    onClick={() => setDueDate(addDays(q.days))}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs border transition',
                      dueDate === addDays(q.days)
                        ? 'bg-[#F5A623] border-[#F5A623] text-white'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300',
                    )}
                  >{q.label}</button>
                ))}
                {dueDate && (
                  <button
                    type="button"
                    onClick={() => setDueDate('')}
                    className="px-2.5 py-1 rounded-lg text-xs border border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500"
                  >✕ Limpar</button>
                )}
              </div>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30 focus:border-[#F5A623]"
              />
            </div>

            {/* Observações */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Observações</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Estado da ferramenta, condições de uso..."
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30 focus:border-[#F5A623] resize-none"
              />
            </div>

            {/* Foto */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                <Camera size={10} className="inline mr-1" />Foto da Entrega
              </label>
              <input
                ref={photoRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])}
              />
              {photoUrl ? (
                <div className="relative rounded-xl overflow-hidden border border-gray-200">
                  <img
                    src={photoUrl.startsWith('http') ? photoUrl : `${API}/${photoUrl}`}
                    alt="Foto"
                    className="w-full h-32 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPhotoUrl('')}
                    className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                  >✕</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => photoRef.current?.click()}
                  disabled={uploading}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl py-4 flex flex-col items-center gap-1.5 text-gray-400 hover:border-gray-300 hover:text-gray-500 transition disabled:opacity-60"
                >
                  {uploading ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
                  <span className="text-xs">{uploading ? 'Enviando...' : 'Tirar foto ou selecionar'}</span>
                </button>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-xs text-red-700">{error}</div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0 pb-[env(safe-area-inset-bottom,16px)]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
          >Cancelar</button>
          <button
            onClick={handleSubmit as any}
            disabled={saving || success}
            className="flex-1 py-3 rounded-xl bg-[#F5A623] text-white text-sm font-semibold hover:bg-[#e09610] transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {success ? (
              <><CheckCircle2 size={15} />Registrado!</>
            ) : saving ? (
              <><Loader2 size={15} className="animate-spin" />Salvando...</>
            ) : (
              '✅ Registrar Cautela'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
