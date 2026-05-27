'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X, Loader2, CheckCircle, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/format'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface BankAccountBasic {
  id:      string
  name:    string
  bank:    string | null
  balance: number
  status:  string
}

export interface PaymentData {
  bankAccountId: string
  paymentMethod: string
  paymentDate:   string
}

interface PaymentModalProps {
  isOpen:      boolean
  onClose:     () => void
  onConfirm:   (data: PaymentData) => Promise<void>
  transaction: {
    id:              string
    description:     string
    netAmount:       number
    type:            'INCOME' | 'EXPENSE'
    dueDate?:        string | null
    bankAccountId?:  string | null
    paymentMethod?:  string | null
  } | null
  accounts:    BankAccountBasic[]
}

// ─── Constantes ───────────────────────────────────────────────────────────────

export const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: 'PIX',         label: '⚡ PIX' },
  { value: 'TED',         label: '🏦 TED' },
  { value: 'DOC',         label: '🏦 DOC' },
  { value: 'TRANSFER',    label: '↔️ Transferência' },
  { value: 'BOLETO',      label: '📄 Boleto bancário' },
  { value: 'DEBIT_CARD',  label: '💳 Cartão de débito' },
  { value: 'CREDIT_CARD', label: '💳 Cartão de crédito' },
  { value: 'CASH',        label: '💵 Dinheiro / Espécie' },
  { value: 'DEBIT',       label: '🔄 Débito automático' },
  { value: 'CHECK',       label: '📝 Cheque' },
  { value: 'OTHER',       label: '📋 Outro' },
]

export const PAYMENT_METHOD_ICONS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map(m => [m.value, m.label.split(' ')[0]])
)

// ─── Helper ───────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function PaymentModal({ isOpen, onClose, onConfirm, transaction, accounts }: PaymentModalProps) {
  const [bankAccountId, setBankAccountId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentDate,   setPaymentDate]   = useState(todayIso())
  const [submitting,    setSubmitting]    = useState(false)
  const [error,         setError]         = useState('')

  // Pré-preencher quando o modal abre
  useEffect(() => {
    if (!isOpen || !transaction) return
    setBankAccountId(transaction.bankAccountId ?? '')
    setPaymentMethod(transaction.paymentMethod ?? '')
    setPaymentDate(todayIso())
    setError('')
  }, [isOpen, transaction])

  if (!isOpen || !transaction) return null

  const isExpense        = transaction.type === 'EXPENSE'
  const activeAccounts   = accounts.filter(a => a.status === 'ACTIVE')
  const selectedAccount  = activeAccounts.find(a => a.id === bankAccountId)
  const balanceAfter     = selectedAccount
    ? (isExpense
      ? selectedAccount.balance - transaction.netAmount
      : selectedAccount.balance + transaction.netAmount)
    : null
  const canConfirm       = !!(bankAccountId && paymentMethod && paymentDate)

  async function handleSubmit() {
    if (!canConfirm) return
    setSubmitting(true); setError('')
    try {
      await onConfirm({ bankAccountId, paymentMethod, paymentDate })
    } catch (e: any) {
      setError(e.message ?? 'Erro ao registrar pagamento')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b rounded-t-2xl ${
          isExpense ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              isExpense ? 'bg-red-100' : 'bg-green-100'
            }`}>
              <CheckCircle size={16} className={isExpense ? 'text-red-600' : 'text-green-600'} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">
                {isExpense ? 'Confirmar pagamento' : 'Confirmar recebimento'}
              </p>
              <p className="text-xs text-gray-500">Preencha os dados abaixo para registrar</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Resumo da transação */}
          <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
            <p className="text-xs text-gray-500 mb-0.5">Lançamento</p>
            <p className="text-sm font-semibold text-gray-800 line-clamp-2">{transaction.description}</p>
            <p className={`text-lg font-bold mt-1 ${isExpense ? 'text-red-600' : 'text-green-600'}`}>
              {isExpense ? '− ' : '+ '}{formatCurrency(transaction.netAmount)}
            </p>
            {transaction.dueDate && (
              <p className="text-xs text-gray-400 mt-0.5">
                Vencimento: {new Date(transaction.dueDate + 'T00:00').toLocaleDateString('pt-BR')}
              </p>
            )}
          </div>

          {/* Conta bancária */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              {isExpense ? 'Conta de débito' : 'Conta de crédito'} <span className="text-red-400">*</span>
            </label>
            {activeAccounts.length === 0 ? (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                <AlertTriangle size={13} className="flex-shrink-0" />
                <span>
                  Nenhuma conta bancária ativa.{' '}
                  <Link href="/app/financeiro/contas-bancarias" className="underline font-medium">Cadastrar conta →</Link>
                </span>
              </div>
            ) : (
              <select
                value={bankAccountId}
                onChange={e => setBankAccountId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] bg-white"
              >
                <option value="">Selecionar conta...</option>
                {activeAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.bank ? ` — ${a.bank}` : ''} · Saldo: {formatCurrency(a.balance)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Forma de pagamento */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Forma de pagamento <span className="text-red-400">*</span>
            </label>
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] bg-white"
            >
              <option value="">Selecionar...</option>
              {PAYMENT_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Data do pagamento */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Data do pagamento <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={paymentDate}
              max={todayIso()}
              onChange={e => setPaymentDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
            />
          </div>

          {/* Preview de saldo */}
          {selectedAccount && balanceAfter !== null && (
            <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
              <p className="text-xs text-gray-500 mb-2">
                Saldo após {isExpense ? 'pagamento' : 'recebimento'}
              </p>
              <div className="flex items-center justify-between text-sm">
                <div>
                  <span className="text-gray-500">Saldo atual</span>
                  <p className="font-semibold text-gray-800">{formatCurrency(selectedAccount.balance)}</p>
                </div>
                <span className="text-gray-300 text-lg">→</span>
                <div className="text-right">
                  <span className="text-gray-500">Novo saldo</span>
                  <p className={`font-bold ${balanceAfter < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(balanceAfter)}
                  </p>
                </div>
              </div>
              {isExpense && balanceAfter < 0 && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600">
                  <AlertTriangle size={11} />
                  <span>Saldo insuficiente — o lançamento será registrado mesmo assim</span>
                </div>
              )}
            </div>
          )}

          {/* Erro */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs text-red-700">
              <AlertTriangle size={13} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canConfirm || submitting || activeAccounts.length === 0}
            className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl text-white transition-colors disabled:opacity-50 ${
              isExpense ? 'bg-[#F5A623] hover:bg-[#d4891a]' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {submitting
              ? <><Loader2 size={14} className="animate-spin" /> Registrando...</>
              : <><CheckCircle size={14} /> {isExpense ? 'Confirmar pagamento' : 'Confirmar recebimento'}</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
