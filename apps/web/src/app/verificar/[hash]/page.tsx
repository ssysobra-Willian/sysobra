'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  CheckCircle, XCircle, Clock, Shield, Hash, Building2,
  Calendar, Tag, User, CreditCard, AlertTriangle,
} from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}
function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface VerifyResult {
  valid:             boolean
  transactionNumber: string | null
  transactionHash:   string | null
  description:       string
  type:              'INCOME' | 'EXPENSE'
  status:            string
  isPaid:            boolean
  netAmount:         number
  grossAmount:       number
  dueDate:           string | null
  paidAt:            string | null
  referenceDate:     string
  createdAt:         string
  company:           { name: string; cnpj: string | null } | null
  category:          { name: string; color: string | null } | null
  client:            { name: string } | null
  supplier:          { name: string } | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VerificarPage() {
  const params  = useParams()
  const hash    = params?.hash as string | undefined

  const [result,  setResult]  = useState<VerifyResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    if (!hash) { setError('Hash inválido'); setLoading(false); return }

    fetch(`${API}/api/financial/verify/${hash}`)
      .then((r) => r.json())
      .then((data: any) => {
        if (!data.valid) { setError(data.error ?? 'Lançamento não encontrado'); return }
        setResult(data)
      })
      .catch(() => setError('Erro ao verificar. Tente novamente em instantes.'))
      .finally(() => setLoading(false))
  }, [hash])

  const statusMap = {
    PAID:      { label: 'Pago',      cls: 'bg-green-100 text-green-700 border-green-200',  icon: CheckCircle, iconCls: 'text-green-500' },
    PENDING:   { label: 'Pendente',  cls: 'bg-amber-100 text-amber-700 border-amber-200',  icon: Clock,       iconCls: 'text-amber-500' },
    CANCELLED: { label: 'Cancelado', cls: 'bg-red-100 text-red-700 border-red-200',        icon: XCircle,     iconCls: 'text-red-500'   },
  }
  const statusInfo = result ? (statusMap[(result.status as keyof typeof statusMap) ?? 'PENDING'] ?? statusMap.PENDING) : null
  const StatusIcon = statusInfo?.icon ?? Clock

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* ── Brand header ───────────────────────────────────────────── */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-xl bg-[#F5A623] flex items-center justify-center">
              <Shield size={18} className="text-white" />
            </div>
            <span className="text-lg font-bold text-gray-800">SYSOBRA</span>
          </div>
          <p className="text-sm text-gray-500">Verificação de autenticidade de lançamento financeiro</p>
        </div>

        {/* ── Card ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">

          {/* Indicator stripe */}
          {!loading && (
            <div className={`h-1.5 w-full ${result?.valid ? 'bg-green-400' : 'bg-red-400'}`} />
          )}

          <div className="p-6">
            {loading ? (
              <div className="flex flex-col items-center py-12 gap-3">
                <div className="w-10 h-10 border-3 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500">Verificando autenticidade...</p>
                <p className="text-xs text-gray-400 font-mono break-all text-center max-w-xs">{hash}</p>
              </div>
            ) : error || !result ? (
              <div className="flex flex-col items-center py-12 gap-4">
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                  <XCircle size={32} className="text-red-500" />
                </div>
                <div className="text-center">
                  <h2 className="text-lg font-bold text-gray-800 mb-1">Não autenticado</h2>
                  <p className="text-sm text-red-600">{error}</p>
                  <p className="text-xs text-gray-400 mt-3">
                    Este código não corresponde a nenhum lançamento válido no sistema.
                  </p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 w-full">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">
                      Se você recebeu este link e acredita que é legítimo, entre em contato com o emissor do documento.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">

                {/* Status badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                      <CheckCircle size={20} className="text-green-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">Lançamento autenticado</p>
                      <p className="text-xs text-gray-500">Emitido pelo sistema SYSOBRA</p>
                    </div>
                  </div>
                  {statusInfo && (
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${statusInfo.cls}`}>
                      <StatusIcon size={11} className={statusInfo.iconCls} /> {statusInfo.label}
                    </span>
                  )}
                </div>

                {/* Transaction number */}
                {result.transactionNumber && (
                  <div className="bg-gray-50 rounded-xl px-4 py-2.5 border border-gray-100">
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Número do lançamento</p>
                    <p className="text-sm font-bold text-gray-800 font-mono">{result.transactionNumber}</p>
                  </div>
                )}

                {/* Divider */}
                <hr className="border-gray-100" />

                {/* Description */}
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Descrição</p>
                  <p className="text-base font-semibold text-gray-800">{result.description}</p>
                  {result.company && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Building2 size={11} className="text-gray-400" />
                      <p className="text-xs text-gray-500">{result.company.name}</p>
                    </div>
                  )}
                </div>

                {/* Amount */}
                <div className={`rounded-2xl px-5 py-4 ${result.type === 'INCOME' ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                  <p className="text-xs text-gray-500 mb-0.5">Valor</p>
                  <p className={`text-3xl font-bold ${result.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}`}>
                    {formatCurrency(result.netAmount)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{result.type === 'INCOME' ? 'Receita' : 'Despesa'}</p>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-3">
                  <Stat icon={Calendar} label="Vencimento"   value={formatDate(result.dueDate)} />
                  <Stat icon={Calendar} label="Pagamento"    value={formatDate(result.paidAt)} />
                  <Stat icon={Calendar} label="Referência"   value={formatDate(result.referenceDate)} />
                  <Stat icon={Calendar} label="Emissão"      value={formatDate(result.createdAt)} />
                  {result.category  && <Stat icon={Tag}       label="Categoria"   value={result.category.name}  dot={result.category.color ?? undefined} />}
                  {result.client    && <Stat icon={User}      label="Cliente"     value={result.client.name} />}
                  {result.supplier  && <Stat icon={Building2} label="Fornecedor"  value={result.supplier.name} />}
                </div>

                {/* Hash */}
                <div className="border border-dashed border-gray-200 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Hash size={12} className="text-gray-400" />
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Hash de autenticidade</p>
                  </div>
                  <p className="text-[11px] font-mono text-gray-500 break-all leading-relaxed">
                    {result.transactionHash}
                  </p>
                </div>

                {/* Footer notice */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                  <div className="flex items-start gap-2">
                    <Shield size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700">
                      Este lançamento foi verificado e é autêntico. O hash acima garante que os dados não foram alterados desde a emissão.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Powered by <span className="font-semibold">SYSOBRA</span> · Gestão de Obras
        </p>
      </div>
    </div>
  )
}

// ─── Stat item ────────────────────────────────────────────────────────────────

function Stat({ icon: Icon, label, value, dot }: {
  icon: React.ElementType; label: string; value: string; dot?: string
}) {
  if (!value || value === '—') return null
  return (
    <div className="flex items-start gap-2">
      <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={11} className="text-gray-400" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
        <div className="flex items-center gap-1 mt-0.5">
          {dot && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />}
          <p className="text-xs text-gray-700 font-medium truncate">{value}</p>
        </div>
      </div>
    </div>
  )
}
