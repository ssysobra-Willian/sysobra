'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, ArrowRightLeft, Loader2, CheckCircle, AlertTriangle, HardHat } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Project {
  id:   string
  name: string
  code: string | null
}

interface Props {
  isOpen:          boolean
  onClose:         () => void
  onSuccess:       () => void
  employeeId:      string
  employeeName:    string
  currentProject?: { id: string; name: string; code: string | null } | null
  currentLocationId?:   string | null
  currentLocationName?: string | null
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const FIXED_LOCATIONS = [
  { value: 'OFFICE',        label: 'Escritório' },
  { value: 'DEPOSIT',       label: 'Depósito' },
  { value: 'WAREHOUSE',     label: 'Almoxarifado' },
  { value: 'TOOL_ROOM',     label: 'Ferramentário' },
  { value: 'WORKSHOP',      label: 'Oficina' },
  { value: 'YARD',          label: 'Pátio' },
  { value: 'FIELD',         label: 'Externo / Campo' },
  { value: 'MEDICAL_LEAVE', label: 'Afastado médico' },
  { value: 'VACATION',      label: 'Férias' },
  { value: 'HOME_OFFICE',   label: 'Home office' },
]

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function getHeaders(): Record<string, string> {
  const token     = localStorage.getItem('token')     ?? ''
  const companyId = localStorage.getItem('companyId') ?? ''
  return { Authorization: `Bearer ${token}`, 'x-company-id': companyId }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function TransferProjectModal({
  isOpen, onClose, onSuccess,
  employeeId, employeeName,
  currentProject, currentLocationId, currentLocationName,
}: Props) {
  const [locationId,    setLocationId]    = useState('')
  const [transferDate,  setTransferDate]  = useState(todayIso())
  const [reason,        setReason]        = useState('')
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [success,       setSuccess]       = useState(false)
  const [projects,      setProjects]      = useState<Project[]>([])

  // Carregar obras
  useEffect(() => {
    if (!isOpen) return
    const h = getHeaders()
    fetch(`${API}/api/v1/projects?status=ACTIVE&limit=200`, {
      headers: { ...h, 'Content-Type': 'application/json' },
    }).then(r => r.json()).then(d => {
      const list = (d.projects ?? d) as any[]
      setProjects(list.map(p => ({ id: p.id, name: p.name, code: p.code ?? null })))
    }).catch(() => {})
  }, [isOpen])

  // Reset ao fechar
  useEffect(() => {
    if (!isOpen) { setLocationId(''); setReason(''); setTransferDate(todayIso()); setError(''); setSuccess(false) }
  }, [isOpen])

  const handleConfirm = useCallback(async () => {
    if (!locationId) { setError('Selecione o novo local ou obra'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API}/api/v1/employees/${employeeId}/transfer`, {
        method:  'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId, transferDate, reason: reason || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao transferir')
      setSuccess(true)
      setTimeout(() => { onSuccess(); onClose() }, 800)
    } catch (err: any) {
      setError(err.message || 'Erro')
    } finally {
      setLoading(false)
    }
  }, [locationId, transferDate, reason, employeeId, onSuccess, onClose])

  if (!isOpen) return null

  // Descrição do local atual
  const currentLabel = currentLocationName
    || (currentProject ? currentProject.name : null)
    || (currentLocationId ? FIXED_LOCATIONS.find(l => l.value === currentLocationId)?.label : null)
    || 'Sem local atribuído'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center">
              <ArrowRightLeft size={16} className="text-[#F5A623]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Transferir de obra</h2>
              <p className="text-xs text-gray-400">Alterar local / alocação do colaborador</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Nome do colaborador */}
          <div className="px-4 py-3 rounded-xl bg-gray-50 border border-gray-100">
            <p className="text-xs text-gray-500 mb-0.5">Colaborador</p>
            <p className="font-semibold text-gray-800">{employeeName}</p>
          </div>

          {/* Local atual */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-100">
            <HardHat size={14} className="text-blue-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-500">Atualmente em</p>
              <p className="text-sm font-medium text-blue-800">{currentLabel}</p>
            </div>
          </div>

          {/* Feedback */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
              <CheckCircle size={14} className="text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-700">Transferência realizada!</p>
            </div>
          )}

          {/* Nova obra / local */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Novo local / obra <span className="text-red-400">*</span>
            </label>
            <select
              value={locationId}
              onChange={e => setLocationId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
            >
              <option value="">Selecione o local...</option>
              <optgroup label="Locais fixos">
                {FIXED_LOCATIONS.map(l => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </optgroup>
              {projects.length > 0 && (
                <optgroup label="Obras">
                  {projects.map(p => (
                    <option key={p.id} value={`PROJECT_${p.id}`}>
                      {p.code ? `${p.code} — ` : ''}{p.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Data da transferência */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Data da transferência <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={transferDate}
              onChange={e => setTransferDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Motivo <span className="text-gray-400 font-normal normal-case">(opcional)</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="Ex: Conclusão da etapa, realocação de equipe..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || success}
            className="flex-1 bg-[#F5A623] hover:bg-[#d4891a] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 size={14} className="animate-spin" /> Transferindo...</>
            ) : success ? (
              <><CheckCircle size={14} /> Transferido!</>
            ) : (
              'Confirmar transferência'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
