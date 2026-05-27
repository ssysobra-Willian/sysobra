'use client'

import React, { useState, useRef } from 'react'
import { X, Wrench, Calendar, DollarSign, FileText, Loader2, Upload, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
function getToken()     { return typeof window !== 'undefined' ? (localStorage.getItem('token')     ?? '') : '' }
function getCompanyId() { return typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : '' }

// ─── Types ────────────────────────────────────────────────────────────────────

interface MaintenanceRecord {
  id?:          string
  type:         string
  date:         string
  performedBy?: string
  description:  string
  cost?:        number
  nextDate?:    string
  result?:      string
  notes?:       string
  fileUrl?:     string
}

interface Props {
  toolId:      string
  toolName:    string
  existing?:   MaintenanceRecord
  onClose:     () => void
  onSaved:     () => void
}

const MAINTENANCE_TYPES = [
  { value: 'PREVENTIVE', label: 'Preventiva', color: 'text-blue-600',  bg: 'bg-blue-50 border-blue-200'  },
  { value: 'CORRECTIVE', label: 'Corretiva',  color: 'text-red-600',   bg: 'bg-red-50 border-red-200'    },
  { value: 'INSPECTION', label: 'Inspeção',   color: 'text-green-600', bg: 'bg-green-50 border-green-200'},
]

const RESULT_OPTIONS = [
  { value: 'OK',           label: '✅ Aprovado / OK'          },
  { value: 'NEEDS_PARTS',  label: '🔧 Aguardando peças'       },
  { value: 'WAITING_QUOTE',label: '💬 Aguardando orçamento'   },
]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MaintenanceModal({ toolId, toolName, existing, onClose, onSaved }: Props) {
  const isEdit = !!existing?.id
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<MaintenanceRecord>({
    type:        existing?.type        ?? 'PREVENTIVE',
    date:        existing?.date        ?? todayISO(),
    performedBy: existing?.performedBy ?? '',
    description: existing?.description ?? '',
    cost:        existing?.cost        ?? undefined,
    nextDate:    existing?.nextDate    ?? '',
    result:      existing?.result      ?? '',
    notes:       existing?.notes       ?? '',
    fileUrl:     existing?.fileUrl     ?? '',
  })

  const [saving,    setSaving]    = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState(false)

  const update = (k: keyof MaintenanceRecord, v: string | number | undefined) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleFileUpload = async (file: File) => {
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
        update('fileUrl', d.url)
      }
    } catch { /* silencioso */ }
    finally { setUploading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.description.trim()) { setError('Descrição é obrigatória'); return }
    setSaving(true)
    setError('')
    try {
      const body = {
        type:        form.type,
        date:        form.date,
        performedBy: form.performedBy || undefined,
        description: form.description,
        cost:        form.cost ? Number(form.cost) : undefined,
        nextDate:    form.nextDate || undefined,
        result:      form.result || undefined,
        notes:       form.notes || undefined,
        fileUrl:     form.fileUrl || undefined,
      }
      const url    = isEdit
        ? `${API}/api/v1/deposit/tools/${toolId}/maintenances/${existing!.id}`
        : `${API}/api/v1/deposit/tools/${toolId}/maintenances`
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${getToken()}`,
          'x-company-id':  getCompanyId(),
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `Erro ${res.status}`)
      }
      setSuccess(true)
      setTimeout(() => { onSaved(); onClose() }, 800)
    } catch (err: any) {
      setError(err.message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const selectedType = MAINTENANCE_TYPES.find(t => t.value === form.type)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[95dvh] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
              <Wrench size={15} className="text-[#F5A623]" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800 text-sm">{isEdit ? 'Editar Manutenção' : 'Nova Manutenção'}</h2>
              <p className="text-xs text-gray-400 truncate max-w-48">{toolName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">

            {/* Tipo */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tipo de Manutenção</label>
              <div className="grid grid-cols-2 gap-2">
                {MAINTENANCE_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => update('type', t.value)}
                    className={cn(
                      'px-3 py-2.5 rounded-xl border text-sm font-medium text-left transition-all',
                      form.type === t.value
                        ? `${t.bg} ${t.color} shadow-sm`
                        : 'border-gray-200 text-gray-500 hover:border-gray-300',
                    )}
                  >{t.label}</button>
                ))}
              </div>
            </div>

            {/* Data + Próxima */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  <Calendar size={10} className="inline mr-1" />Data
                </label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => update('date', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30 focus:border-[#F5A623]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Próxima Manutenção
                </label>
                <input
                  type="date"
                  value={form.nextDate ?? ''}
                  onChange={e => update('nextDate', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30 focus:border-[#F5A623]"
                />
              </div>
            </div>

            {/* Realizado por */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Realizado por</label>
              <input
                type="text"
                value={form.performedBy ?? ''}
                onChange={e => update('performedBy', e.target.value)}
                placeholder="Técnico, empresa ou responsável..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30 focus:border-[#F5A623]"
              />
            </div>

            {/* Descrição */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                <FileText size={10} className="inline mr-1" />Descrição *
              </label>
              <textarea
                value={form.description}
                onChange={e => update('description', e.target.value)}
                placeholder="Descreva o serviço realizado..."
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30 focus:border-[#F5A623] resize-none"
                required
              />
            </div>

            {/* Custo + Resultado */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  <DollarSign size={10} className="inline mr-1" />Custo (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost ?? ''}
                  onChange={e => update('cost', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="0,00"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30 focus:border-[#F5A623]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Resultado</label>
                <select
                  value={form.result ?? ''}
                  onChange={e => update('result', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30 focus:border-[#F5A623] bg-white"
                >
                  <option value="">Selecionar...</option>
                  {RESULT_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Observações */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Observações</label>
              <textarea
                value={form.notes ?? ''}
                onChange={e => update('notes', e.target.value)}
                placeholder="Peças trocadas, recomendações, defeitos encontrados..."
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30 focus:border-[#F5A623] resize-none"
              />
            </div>

            {/* Comprovante */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Comprovante / Nota</label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              />
              {form.fileUrl ? (
                <div className="flex items-center gap-2 border border-green-200 bg-green-50 rounded-xl px-3 py-2.5">
                  <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
                  <span className="text-xs text-green-700 flex-1 min-w-0 truncate">Arquivo enviado</span>
                  <button type="button" onClick={() => update('fileUrl', '')} className="text-xs text-gray-400 hover:text-red-500">✕</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl px-3 py-3 flex items-center justify-center gap-2 text-sm text-gray-400 hover:border-gray-300 hover:text-gray-500 transition disabled:opacity-60"
                >
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {uploading ? 'Enviando...' : 'Anexar comprovante (PDF, imagem)'}
                </button>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-xs text-red-700">{error}</div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
          >Cancelar</button>
          <button
            onClick={handleSubmit as any}
            disabled={saving || success}
            className="flex-1 py-2.5 rounded-xl bg-[#F5A623] text-white text-sm font-semibold hover:bg-[#e09610] transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {success ? (
              <><CheckCircle2 size={15} />Salvo!</>
            ) : saving ? (
              <><Loader2 size={15} className="animate-spin" />Salvando...</>
            ) : (
              isEdit ? 'Atualizar' : 'Registrar'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
