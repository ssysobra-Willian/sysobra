'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, ArrowLeftRight, ArrowRight, AlertTriangle, CheckCircle } from 'lucide-react'
import { NumericFormat } from 'react-number-format'
import { formatCurrency } from '@/lib/format'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface BankAccountOption {
  id:             string
  name:           string
  bank:           string | null
  balance:        number
  computedBalance:number
  status:         string
}

export interface TransferModalProps {
  isOpen:    boolean
  onClose:   () => void
  onSuccess: () => void
  accounts?: BankAccountOption[]   // se não passado, o modal busca internamente
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getHeaders() {
  const token     = localStorage.getItem('token')
  const companyId = localStorage.getItem('companyId')
  return {
    'Content-Type': 'application/json',
    ...(token     ? { Authorization: `Bearer ${token}` }       : {}),
    ...(companyId ? { 'x-company-id': companyId }              : {}),
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function TransferModal({ isOpen, onClose, onSuccess, accounts: propAccounts }: TransferModalProps) {
  const [accounts,      setAccounts]      = useState<BankAccountOption[]>(propAccounts ?? [])
  const [loadingAccts,  setLoadingAccts]  = useState(!propAccounts)

  const [fromId,        setFromId]        = useState('')
  const [toId,          setToId]          = useState('')
  const [amount,        setAmount]        = useState<number | undefined>(undefined)
  const [date,          setDate]          = useState(todayIso)
  const [description,   setDescription]   = useState('Transferência entre contas')
  const [observations,  setObservations]  = useState('')

  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [success,       setSuccess]       = useState(false)

  // ── Buscar contas quando não passadas por prop ─────────────────────────────
  const fetchAccounts = useCallback(async () => {
    if (propAccounts) { setAccounts(propAccounts); return }
    setLoadingAccts(true)
    try {
      const res  = await fetch(`${API}/api/v1/financial/bank-accounts?activeOnly=true`, { headers: getHeaders() })
      const data = await res.json()
      setAccounts((data.accounts ?? []).filter((a: any) => a.status === 'ACTIVE'))
    } catch {
      // silencioso
    } finally {
      setLoadingAccts(false)
    }
  }, [propAccounts])

  useEffect(() => {
    if (isOpen) {
      fetchAccounts()
      setError('')
      setSuccess(false)
      setAmount(undefined)
      setFromId('')
      setToId('')
      setDate(todayIso())
      setDescription('Transferência entre contas')
      setObservations('')
    }
  }, [isOpen, fetchAccounts])

  // ── Sync accounts when prop changes ───────────────────────────────────────
  useEffect(() => {
    if (propAccounts) setAccounts(propAccounts)
  }, [propAccounts])

  // ── Contas disponíveis para destino (exclui a origem) ─────────────────────
  const toAccounts = accounts.filter((a) => a.id !== fromId)

  // ── Swap origem ↔ destino ─────────────────────────────────────────────────
  function swapAccounts() {
    const tmp = fromId
    setFromId(toId)
    setToId(tmp)
  }

  // ── Conta selecionada como origem ─────────────────────────────────────────
  const fromAccount = accounts.find((a) => a.id === fromId)
  const toAccount   = accounts.find((a) => a.id === toId)

  // ── Validações ─────────────────────────────────────────────────────────────
  const sameAccount   = fromId !== '' && fromId === toId
  const insufficientBalance = fromAccount && amount !== undefined && amount > (fromAccount.computedBalance ?? fromAccount.balance)
  const canSubmit = fromId !== '' && toId !== '' && !sameAccount && amount !== undefined && amount > 0 && date !== ''

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!canSubmit || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/v1/financial/transfers`, {
        method:  'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          fromAccountId: fromId,
          toAccountId:   toId,
          amount,
          description:   description.trim() || 'Transferência entre contas',
          date,
          observations:  observations.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.message || 'Erro ao realizar transferência')
      setSuccess(true)
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 1200)
    } catch (err: any) {
      setError(err.message || 'Erro ao realizar transferência')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  // ── Preview de saldo ───────────────────────────────────────────────────────
  const fromBal   = fromAccount?.computedBalance ?? fromAccount?.balance ?? 0
  const toBal     = toAccount?.computedBalance   ?? toAccount?.balance   ?? 0
  const amt       = amount ?? 0
  const showPreview = fromAccount && toAccount && amt > 0

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-[480px] max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center">
              <ArrowLeftRight size={18} className="text-[#F5A623]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Transferência entre contas</h2>
              <p className="text-xs text-gray-400">Movimentação interna</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">

          {/* Success */}
          {success && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
              <p className="text-sm font-medium text-green-700">Transferência realizada com sucesso!</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {loadingAccts ? (
            <div className="py-8 text-center text-sm text-gray-400">Carregando contas...</div>
          ) : accounts.length < 2 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              É necessário ter pelo menos 2 contas ativas para realizar transferências.
            </div>
          ) : (
            <>
              {/* Contas de origem e destino */}
              <div className="flex items-end gap-2">
                {/* Conta de origem */}
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Conta de origem *
                  </label>
                  <select
                    value={fromId}
                    onChange={(e) => { setFromId(e.target.value); if (e.target.value === toId) setToId('') }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white text-gray-800"
                  >
                    <option value="">Selecione...</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {formatCurrency(a.computedBalance ?? a.balance)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Swap button */}
                <button
                  type="button"
                  onClick={swapAccounts}
                  disabled={!fromId || !toId}
                  title="Inverter contas"
                  className="mb-0.5 w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-[#F5A623] hover:border-[#F5A623] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowLeftRight size={15} />
                </button>

                {/* Conta de destino */}
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Conta de destino *
                  </label>
                  <select
                    value={toId}
                    onChange={(e) => setToId(e.target.value)}
                    disabled={!fromId}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white text-gray-800 disabled:opacity-50"
                  >
                    <option value="">Selecione...</option>
                    {toAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {formatCurrency(a.computedBalance ?? a.balance)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Erro: mesma conta */}
              {sameAccount && (
                <p className="text-xs text-red-500 -mt-2 flex items-center gap-1">
                  <AlertTriangle size={12} /> Selecione contas diferentes
                </p>
              )}

              {/* Valor */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Valor *
                </label>
                <NumericFormat
                  value={amount === undefined ? '' : amount}
                  onValueChange={({ floatValue }) => setAmount(floatValue)}
                  thousandSeparator="."
                  decimalSeparator=","
                  decimalScale={2}
                  fixedDecimalScale
                  prefix="R$ "
                  placeholder="R$ 0,00"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 text-gray-800"
                />

                {/* Alerta saldo insuficiente */}
                {insufficientBalance && (
                  <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      Saldo insuficiente na conta de origem.
                      Saldo atual: <strong>{formatCurrency(fromBal)}</strong>
                    </p>
                  </div>
                )}
              </div>

              {/* Preview de saldo */}
              {showPreview && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Saldo após a transferência</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 truncate max-w-[120px]">{fromAccount!.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400 line-through">{formatCurrency(fromBal)}</span>
                      <ArrowRight size={10} className="text-gray-300" />
                      <span className={`font-semibold ${fromBal - amt < 0 ? 'text-red-500' : 'text-red-600'}`}>
                        {formatCurrency(fromBal - amt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 truncate max-w-[120px]">{toAccount!.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400 line-through">{formatCurrency(toBal)}</span>
                      <ArrowRight size={10} className="text-gray-300" />
                      <span className="font-semibold text-green-600">{formatCurrency(toBal + amt)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Data */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Data *
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 text-gray-800"
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Descrição
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Transferência para caixa obra"
                  maxLength={200}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 text-gray-800"
                />
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Observações <span className="text-gray-300 font-normal normal-case">(opcional)</span>
                </label>
                <textarea
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  rows={2}
                  placeholder="Detalhes adicionais sobre a transferência..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 text-gray-800 resize-none"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loadingAccts && accounts.length >= 2 && (
          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex gap-3 rounded-b-2xl">
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
              onClick={handleSubmit}
              disabled={!canSubmit || loading || success}
              className="flex-1 bg-[#F5A623] hover:bg-[#d4891a] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Processando...
                </>
              ) : success ? (
                <>
                  <CheckCircle size={15} />
                  Transferido!
                </>
              ) : (
                <>
                  <ArrowLeftRight size={15} />
                  Confirmar transferência
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
