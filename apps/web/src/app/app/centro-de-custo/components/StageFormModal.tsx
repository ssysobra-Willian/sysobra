'use client'

import { useEffect, useState, useRef } from 'react'
import { X, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/format'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectStage {
  id:             string
  name:           string
  code:           string | null
  order:          number
  status:         string
  budgetMaterial: number
  budgetLabor:    number
  budgetTotal:    number
  realizedValue:  number
  progressPercent:number
  startDate:      string | null
  endDate:        string | null
}

interface StageFormModalProps {
  isOpen:    boolean
  onClose:   () => void
  onSuccess: (stage: ProjectStage) => void
  projectId: string
  stage?:    ProjectStage
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseBRL(value: string): number {
  return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0
}

function fmtBRL(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── StageFormModal ───────────────────────────────────────────────────────────

export function StageFormModal({ isOpen, onClose, onSuccess, projectId, stage }: StageFormModalProps) {
  const isEdit = !!stage

  const [name,     setName]     = useState('')
  const [material, setMaterial] = useState('')
  const [labor,    setLabor]    = useState('')
  const [startDate,setStartDate]= useState('')
  const [endDate,  setEndDate]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)

  const nameRef = useRef<HTMLInputElement>(null)

  // Populate on edit
  useEffect(() => {
    if (!isOpen) {
      setName(''); setMaterial(''); setLabor('')
      setStartDate(''); setEndDate(''); setError(''); setConfirmRemove(false)
      return
    }
    if (stage) {
      setName(stage.name)
      setMaterial(fmtBRL(stage.budgetMaterial))
      setLabor(fmtBRL(stage.budgetLabor))
      setStartDate(stage.startDate ? stage.startDate.slice(0, 10) : '')
      setEndDate(stage.endDate   ? stage.endDate.slice(0, 10)   : '')
    }
    setTimeout(() => nameRef.current?.focus(), 50)
  }, [isOpen, stage])

  if (!isOpen) return null

  function getToken() {
    return typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
  }

  const matNum = parseBRL(material)
  const labNum = parseBRL(labor)
  const total  = matNum + labNum

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimName = name.trim()
    if (!trimName || trimName.length < 2) { setError('Nome deve ter pelo menos 2 caracteres.'); return }

    setLoading(true); setError('')

    const body: Record<string, unknown> = {
      name: trimName,
      budgetMaterial: matNum,
      budgetLabor:    labNum,
      startDate: startDate || null,
      endDate:   endDate   || null,
    }

    const url    = isEdit
      ? `${API}/api/v1/projects/${projectId}/stages/${stage!.id}`
      : `${API}/api/v1/projects/${projectId}/stages`
    const method = isEdit ? 'PUT' : 'POST'

    try {
      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Erro ao salvar'); return }
      onSuccess(data.stage)
      onClose()
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!stage) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API}/api/v1/projects/${projectId}/stages/${stage.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Não foi possível remover'); setConfirmRemove(false); return }
      onSuccess({ ...stage, id: `__deleted__${stage.id}` })
      onClose()
    } catch {
      setError('Erro de conexão.')
    } finally {
      setLoading(false)
    }
  }

  function handleMaskInput(
    value: string,
    setter: (v: string) => void,
  ) {
    const digits = value.replace(/\D/g, '')
    if (!digits) { setter(''); return }
    const num = parseInt(digits, 10) / 100
    setter(fmtBRL(num))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Editar etapa' : 'Nova etapa'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">{error}</div>
          )}

          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Nome da etapa <span className="text-red-500">*</span>
            </label>
            <input
              ref={nameRef}
              value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              placeholder="Ex: Estrutura, Alvenaria, Acabamento..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
            />
          </div>

          {/* Orçado */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Materiais</label>
              <input
                type="text"
                inputMode="numeric"
                value={material}
                onChange={e => handleMaskInput(e.target.value, setMaterial)}
                placeholder="R$ 0,00"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Mão de obra</label>
              <input
                type="text"
                inputMode="numeric"
                value={labor}
                onChange={e => handleMaskInput(e.target.value, setLabor)}
                placeholder="R$ 0,00"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
              />
            </div>
          </div>

          {/* Total calculado */}
          {total > 0 && (
            <div className="text-right">
              <span className="text-xs text-gray-500">Total orçado: </span>
              <span className="text-base font-bold text-[#F5A623]">{formatCurrency(total)}</span>
            </div>
          )}

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Início previsto</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Término previsto</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
              />
            </div>
          </div>

          {/* Confirmação de remoção */}
          {confirmRemove && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm">
              <p className="font-semibold text-red-700 mb-2">⚠️ Tem certeza?</p>
              <p className="text-red-600 text-xs mb-3">Esta ação não pode ser desfeita. A etapa e seus dados serão removidos.</p>
              <div className="flex gap-2">
                <button type="button" onClick={handleDelete} disabled={loading}
                  className="flex-1 py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 disabled:opacity-50">
                  {loading ? 'Removendo...' : 'Sim, remover'}
                </button>
                <button type="button" onClick={() => setConfirmRemove(false)}
                  className="flex-1 py-2 border border-gray-200 text-xs text-gray-600 font-medium rounded-lg hover:bg-gray-50">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Rodapé */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <div>
              {isEdit && !confirmRemove && (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  className="flex items-center gap-1.5 text-xs text-red-500 border border-red-200 rounded-lg px-3 py-2 hover:bg-red-50"
                >
                  <Trash2 size={12} /> Remover etapa
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                Cancelar
              </button>
              <button type="submit" disabled={loading}
                className="px-4 py-2 text-sm font-semibold bg-[#F5A623] text-white rounded-xl hover:bg-[#d4891a] disabled:opacity-50 flex items-center gap-2">
                {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {loading ? 'Salvando...' : 'Salvar etapa'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
