'use client'

import { useState, useCallback } from 'react'
import { X, AlertTriangle, CheckCircle, Loader2, UserX } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Props {
  isOpen:       boolean
  onClose:      () => void
  onSuccess:    () => void
  employeeId:   string
  employeeName: string
  mode?:        'dismiss' | 'away'  // desligar ou afastar
}

const DISMISSAL_REASONS = [
  'Pedido de demissão',
  'Demissão sem justa causa',
  'Demissão com justa causa',
  'Fim de contrato',
  'Aposentadoria',
  'Acordo entre as partes',
  'Outro',
]

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function getHeaders() {
  const token     = localStorage.getItem('token')     ?? ''
  const companyId = localStorage.getItem('companyId') ?? ''
  return {
    'Content-Type': 'application/json',
    Authorization:  `Bearer ${token}`,
    'x-company-id': companyId,
  }
}

export function DismissalModal({ isOpen, onClose, onSuccess, employeeId, employeeName, mode = 'dismiss' }: Props) {
  const [date,         setDate]         = useState(todayIso())
  const [reason,       setReason]       = useState('')
  const [observations, setObservations] = useState('')
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [success,      setSuccess]      = useState(false)

  const isDismiss = mode === 'dismiss'

  const handleConfirm = useCallback(async () => {
    if (isDismiss && !date) { setError('Informe a data'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/v1/employees/${employeeId}/status`, {
        method:  'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({
          status:        isDismiss ? 'DISMISSED' : 'AWAY',
          dismissalDate: isDismiss ? date         : undefined,
          reason:        reason       || undefined,
          observations:  observations || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar situação')
      setSuccess(true)
      setTimeout(() => { onSuccess(); onClose() }, 800)
    } catch (err: any) {
      setError(err.message || 'Erro')
    } finally {
      setLoading(false)
    }
  }, [isDismiss, date, reason, observations, employeeId, onSuccess, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDismiss ? 'bg-red-50' : 'bg-amber-50'}`}>
              <UserX size={18} className={isDismiss ? 'text-red-500' : 'text-amber-500'} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {isDismiss ? 'Desligar colaborador' : 'Afastar colaborador'}
              </h2>
              <p className="text-xs text-gray-400">Esta ação pode ser revertida</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Nome do colaborador */}
          <div className={`px-4 py-3 rounded-xl border ${isDismiss ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
            <p className="text-xs text-gray-500 mb-0.5">Colaborador</p>
            <p className={`font-semibold ${isDismiss ? 'text-red-800' : 'text-amber-800'}`}>{employeeName}</p>
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
              <p className="text-sm text-green-700">Situação atualizada com sucesso!</p>
            </div>
          )}

          {/* Data (só para desligamento) */}
          {isDismiss && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Data do desligamento <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              />
            </div>
          )}

          {/* Motivo */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              {isDismiss ? 'Motivo do desligamento' : 'Motivo do afastamento'}
            </label>
            {isDismiss ? (
              <select
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white"
              >
                <option value="">Selecione...</option>
                {DISMISSAL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            ) : (
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Ex: Afastamento médico, acidente de trabalho..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            )}
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Observações <span className="text-gray-400 font-normal normal-case">(opcional)</span>
            </label>
            <textarea
              value={observations}
              onChange={e => setObservations(e.target.value)}
              rows={2}
              placeholder="Informações adicionais..."
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
            className={`flex-1 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
              isDismiss ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'
            }`}
          >
            {loading ? (
              <><Loader2 size={14} className="animate-spin" /> Processando...</>
            ) : success ? (
              <><CheckCircle size={14} /> Pronto!</>
            ) : isDismiss ? 'Confirmar desligamento' : 'Confirmar afastamento'}
          </button>
        </div>
      </div>
    </div>
  )
}
