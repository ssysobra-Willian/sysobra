'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Building2, User, Mail, Phone, MapPin,
  TrendingDown, TrendingUp, FileText, ShoppingCart, Star, Truck,
  Plus, Pencil, ChevronRight, CreditCard, Landmark,
  CheckCircle, XCircle, Hash, KeyRound, AlertCircle,
  ChevronDown, ChevronUp, BarChart3, Sparkles, Download,
  TrendingDown as TrendDn, TrendingUp as TrendUp,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Line, ComposedChart,
} from 'recharts'
import { formatCurrency, formatCurrencyCompact } from '@/lib/format'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const fmt  = formatCurrency
const fmtK = formatCurrencyCompact

// ─── Período padrão — mês atual ──────────────────────────────────────────────
function currentMonth() {
  const now = new Date()
  const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0')
  const last = new Date(y, now.getMonth()+1, 0).getDate()
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${String(last).padStart(2,'0')}` }
}

function monthAgo(months: number) {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    start: d.toISOString().split('T')[0],
    end:   end.toISOString().split('T')[0],
  }
}

function yearRange(offset = 0) {
  const y = new Date().getFullYear() - offset
  return { start: `${y}-01-01`, end: `${y}-12-31` }
}

// ─── Tipos de métricas ────────────────────────────────────────────────────────
interface SupplierMetrics {
  period:             { start: string; end: string }
  supplierName:       string
  totalGross:         number
  totalNet:           number
  totalDiscounts:     number
  totalInterest:      number
  transactionCount:   number
  averageTicket:      number
  discountPercentage: number
  largestTransaction: { amount: number; date: string; description: string } | null
  monthlyEvolution:   { month: string; grossAmount: number; netAmount: number; discounts: number; transactionCount: number }[]
  previousPeriod:     { totalGross: number; totalNet: number; transactionCount: number }
  variations:         { grossVariation: number; netVariation: number; countVariation: number }
  transactions:       {
    id: string; description: string; referenceDate: string; isPaid: boolean
    grossAmount: number; netAmount: number; retentionAmount: number; interestAmount: number
    category: { name: string; color: string | null } | null
  }[]
}

const PERIOD_OPTIONS = [
  { label: 'Este mês',         key: 'month'  },
  { label: 'Último trimestre', key: 'quarter' },
  { label: 'Este ano',         key: 'year'   },
  { label: 'Ano passado',      key: 'lastyear' },
  { label: 'Personalizado',    key: 'custom' },
] as const

// ─── Types ────────────────────────────────────────────────────────────────────

interface SupplierDetail {
  id:                    string
  type:                  'PERSON' | 'COMPANY'
  name:                  string
  tradeName:             string | null
  email:                 string | null
  phone:                 string | null
  phone2:                string | null
  whatsapp:              string | null
  cpfCnpj:               string | null
  cnpj:                  string | null
  category:              string | null
  categoryLabel:         string
  address:               string | null
  city:                  string | null
  state:                 string | null
  zipCode:               string | null
  contactName:           string | null
  contactRole:           string | null
  contactEmail:          string | null
  contactPhone:          string | null
  profession:            string | null
  crea:                  string | null
  stateRegistration:     string | null
  municipalRegistration: string | null
  bankName:              string | null
  bankCode:              string | null
  bankAgency:            string | null
  bankAccount:           string | null
  bankAccountType:       string | null
  pixKey:                string | null
  pixKeyType:            string | null
  rating:                number | null
  notes:                 string | null
  isActive:              boolean
  createdAt:             string
  totalPaid:             number
  totalPayable:          number
  transactionCount:      number
  financialTransactions: {
    id: string; description: string; type: string; isPaid: boolean
    netAmount: number; dueDate: string | null; paidAt: string | null; referenceDate: string | null
    category: { name: string; color: string | null; icon: string | null } | null
  }[]
  purchaseOrders: {
    id: string; code: string | null; status: string; totalAmount: number; createdAt: string
  }[]
  _count: { financialTransactions: number; purchaseOrders: number }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDoc(v: string | null) {
  if (!v) return '—'
  const d = v.replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return v
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}
function token() { return localStorage.getItem('token') || '' }

const CAT_COLORS: Record<string, string> = {
  MATERIAL:  'bg-orange-100 text-orange-700',
  LABOR:     'bg-blue-100 text-blue-700',
  SERVICE:   'bg-violet-100 text-violet-700',
  EQUIPMENT: 'bg-amber-100 text-amber-700',
  TRANSPORT: 'bg-cyan-100 text-cyan-700',
  OTHER:     'bg-gray-100 text-gray-600',
}

const PO_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT:     { label: 'Rascunho',  cls: 'bg-gray-100 text-gray-600'   },
  SENT:      { label: 'Enviado',   cls: 'bg-blue-100 text-blue-700'   },
  APPROVED:  { label: 'Aprovado',  cls: 'bg-green-100 text-green-700' },
  RECEIVED:  { label: 'Recebido',  cls: 'bg-teal-100 text-teal-700'  },
  CANCELLED: { label: 'Cancelado', cls: 'bg-red-100 text-red-700'    },
}

const PIX_KEY_LABELS: Record<string, string> = {
  CPF:    'CPF',
  CNPJ:   'CNPJ',
  EMAIL:  'E-mail',
  PHONE:  'Telefone',
  RANDOM: 'Chave aleatória',
}

// ─── StarDisplay ──────────────────────────────────────────────────────────────

function StarDisplay({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-sm text-gray-400 italic">Sem avaliação</span>
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1,2,3,4,5].map(i => (
          <Star key={i} size={16} className={i <= rating ? 'text-[#F5A623] fill-[#F5A623]' : 'text-gray-200'} />
        ))}
      </div>
      <span className="text-sm text-gray-600 font-medium">{rating}/5</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FornecedorDetailPage() {
  const { id } = useParams() as { id: string }
  const [supplier,   setSupplier]   = useState<SupplierDetail | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [tab,        setTab]        = useState<'financeiro' | 'compras' | 'metricas'>('metricas')
  const [bankOpen,   setBankOpen]   = useState(false)

  // ── Métricas ────────────────────────────────────────────────────────────────
  const [metrics,        setMetrics]        = useState<SupplierMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [periodKey,      setPeriodKey]      = useState<string>('month')
  const [customStart,    setCustomStart]    = useState('')
  const [customEnd,      setCustomEnd]      = useState('')

  function getPeriodDates() {
    if (periodKey === 'month')    return currentMonth()
    if (periodKey === 'quarter')  return monthAgo(3)
    if (periodKey === 'year')     return yearRange(0)
    if (periodKey === 'lastyear') return yearRange(1)
    if (periodKey === 'custom' && customStart && customEnd) return { start: customStart, end: customEnd }
    return currentMonth()
  }

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true)
    try {
      const { start, end } = getPeriodDates()
      const res = await fetch(
        `${API}/api/v1/suppliers/${id}/metrics?startDate=${start}&endDate=${end}`,
        { headers: { Authorization: `Bearer ${token()}` } },
      )
      if (res.ok) setMetrics(await res.json())
    } catch { /* silent */ }
    finally { setMetricsLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, periodKey, customStart, customEnd])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`${API}/api/v1/suppliers/${id}`, { headers: { Authorization: `Bearer ${token()}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar')
      setSupplier(data.supplier)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadMetrics() }, [loadMetrics])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-8 h-8 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (error || !supplier) return (
    <div className="p-6 text-center">
      <p className="text-red-600 text-sm">{error || 'Fornecedor não encontrado.'}</p>
      <Link href="/app/financeiro/fornecedores" className="text-sm text-[#F5A623] hover:underline mt-2 inline-block">← Voltar</Link>
    </div>
  )

  const txs = supplier.financialTransactions ?? []
  const pos = supplier.purchaseOrders ?? []
  const hasBankData = supplier.bankName || supplier.bankAgency || supplier.bankAccount || supplier.pixKey

  return (
    <div className="space-y-5">

      {/* Breadcrumb + Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/app/financeiro" className="hover:text-gray-600">Financeiro</Link>
            <ChevronRight size={14} />
            <Link href="/app/financeiro/fornecedores" className="hover:text-gray-600">Fornecedores</Link>
            <ChevronRight size={14} />
            <span className="text-gray-700 font-medium truncate max-w-[200px]">{supplier.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{supplier.name}</h1>
          {supplier.tradeName && <p className="text-sm text-gray-500">{supplier.tradeName}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${supplier.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {supplier.isActive ? 'Ativo' : 'Inativo'}
          </span>
          {supplier.category && (
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${CAT_COLORS[supplier.category] ?? 'bg-gray-100 text-gray-600'}`}>
              {supplier.categoryLabel}
            </span>
          )}
          <Link href={`/app/financeiro/fornecedores?edit=${id}`}
            className="flex items-center gap-1.5 text-xs border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50">
            <Pencil size={13} /> Editar
          </Link>
          <Link
            href={`/app/financeiro?novo=1&supplierId=${id}`}
            className="flex items-center gap-2 bg-[#F5A623] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-[#d4891a]">
            <Plus size={16} /> Novo lançamento
          </Link>
        </div>
      </div>

      {/* Layout principal */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* ─── Coluna esquerda ─── */}
        <div className="xl:col-span-1 space-y-4">

          {/* Dados principais */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${supplier.type === 'PERSON' ? 'bg-indigo-50' : 'bg-blue-50'}`}>
                {supplier.type === 'PERSON'
                  ? <User size={22} className="text-indigo-500" />
                  : <Truck size={22} className="text-blue-500" />}
              </div>
              <div>
                <p className="text-xs text-gray-400">{supplier.type === 'PERSON' ? 'Pessoa Física' : 'Pessoa Jurídica'}</p>
                <p className="text-sm font-semibold text-gray-700">{fmtDoc(supplier.cpfCnpj || supplier.cnpj)}</p>
              </div>
            </div>

            {/* Avaliação */}
            <div className="flex items-center gap-2">
              <StarDisplay rating={supplier.rating} />
            </div>

            {supplier.email && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail size={14} className="text-gray-400 flex-shrink-0" />
                <a href={`mailto:${supplier.email}`} className="hover:text-[#F5A623] truncate">{supplier.email}</a>
              </div>
            )}
            {supplier.phone && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone size={14} className="text-gray-400 flex-shrink-0" />
                <span>{supplier.phone}</span>
                {supplier.phone2 && <span className="text-gray-400 text-xs">· {supplier.phone2}</span>}
              </div>
            )}
            {(supplier.address || supplier.city) && (
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <MapPin size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                <span>{[supplier.address, supplier.city, supplier.state].filter(Boolean).join(', ')}</span>
              </div>
            )}

            {/* PF: profissão / CREA */}
            {supplier.type === 'PERSON' && (supplier.profession || supplier.crea) && (
              <div className="pt-2 border-t border-gray-100 space-y-1">
                {supplier.profession && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Hash size={13} className="text-gray-400" />
                    <span>{supplier.profession}</span>
                  </div>
                )}
                {supplier.crea && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Hash size={13} className="text-gray-400" />
                    <span className="text-xs text-gray-500">CREA:</span>
                    <span>{supplier.crea}</span>
                  </div>
                )}
              </div>
            )}

            {/* PJ: IE / IM */}
            {supplier.type === 'COMPANY' && (supplier.stateRegistration || supplier.municipalRegistration) && (
              <div className="pt-2 border-t border-gray-100 space-y-1">
                {supplier.stateRegistration && (
                  <p className="text-xs text-gray-500">IE: <span className="text-gray-700">{supplier.stateRegistration}</span></p>
                )}
                {supplier.municipalRegistration && (
                  <p className="text-xs text-gray-500">IM: <span className="text-gray-700">{supplier.municipalRegistration}</span></p>
                )}
              </div>
            )}

            {supplier.notes && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400 font-semibold uppercase mb-1">Observações</p>
                <p className="text-sm text-gray-600">{supplier.notes}</p>
              </div>
            )}
          </div>

          {/* Contato principal (PJ) */}
          {supplier.type === 'COMPANY' && (supplier.contactName || supplier.contactEmail) && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Contato principal</p>
              {supplier.contactName  && <p className="text-sm font-semibold text-gray-800">{supplier.contactName}</p>}
              {supplier.contactRole  && <p className="text-xs text-gray-500 mb-2">{supplier.contactRole}</p>}
              {supplier.contactEmail && <p className="text-xs text-gray-600">{supplier.contactEmail}</p>}
              {supplier.contactPhone && <p className="text-xs text-gray-600">{supplier.contactPhone}</p>}
            </div>
          )}

          {/* Métricas */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total pago',    value: fmt(supplier.totalPaid),    cls: 'text-gray-800' },
              { label: 'A pagar',       value: fmt(supplier.totalPayable), cls: 'text-red-600'  },
              { label: 'Lançamentos',   value: String(supplier._count?.financialTransactions ?? supplier.transactionCount), cls: 'text-blue-600' },
              { label: 'Pedidos',       value: String(supplier._count?.purchaseOrders ?? pos.length), cls: 'text-gray-800' },
            ].map(m => (
              <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className={`text-lg font-bold ${m.cls}`}>{m.value}</p>
                <p className="text-[11px] font-semibold text-gray-400 uppercase">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Dados bancários — colapsável */}
          {hasBankData && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setBankOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2">
                  <Landmark size={15} className="text-gray-400" />
                  Dados bancários
                </div>
                {bankOpen ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
              </button>
              {bankOpen && (
                <div className="px-5 pb-5 space-y-3 border-t border-gray-100">
                  {supplier.bankName && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Banco</span>
                      <span className="text-gray-800 font-medium">
                        {supplier.bankName}{supplier.bankCode ? ` (${supplier.bankCode})` : ''}
                      </span>
                    </div>
                  )}
                  {supplier.bankAgency && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Agência</span>
                      <span className="text-gray-800 font-medium">{supplier.bankAgency}</span>
                    </div>
                  )}
                  {supplier.bankAccount && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Conta</span>
                      <span className="text-gray-800 font-medium">
                        {supplier.bankAccount}
                        {supplier.bankAccountType && (
                          <span className="ml-1 text-xs text-gray-400">({supplier.bankAccountType === 'CHECKING' ? 'Corrente' : supplier.bankAccountType === 'SAVINGS' ? 'Poupança' : supplier.bankAccountType})</span>
                        )}
                      </span>
                    </div>
                  )}
                  {supplier.pixKey && (
                    <div className="pt-2 border-t border-gray-100">
                      <div className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold uppercase mb-1">
                        <KeyRound size={11} /> Pix
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{PIX_KEY_LABELS[supplier.pixKeyType ?? ''] || supplier.pixKeyType || 'Chave'}</span>
                        <span className="text-gray-800 font-medium font-mono text-xs">{supplier.pixKey}</span>
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-gray-400 pt-2 border-t border-gray-100 italic">
                    Dados para conciliação interna. Não use como autorização de pagamento.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Coluna direita — abas ─── */}
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-100 overflow-x-auto">
              {([
                { key: 'metricas',   label: '📊 Métricas' },
                { key: 'financeiro', label: `Financeiro (${supplier._count?.financialTransactions ?? txs.length})` },
                { key: 'compras',    label: `Pedidos (${supplier._count?.purchaseOrders ?? pos.length})` },
              ] as const).map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${tab === t.key ? 'border-[#F5A623] text-[#F5A623]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ─── Aba Métricas ─── */}
            {tab === 'metricas' && (
              <div className="p-5 space-y-5">
                {/* Seletor de período */}
                <div className="flex flex-wrap items-center gap-2">
                  {PERIOD_OPTIONS.map(opt => (
                    <button key={opt.key} onClick={() => setPeriodKey(opt.key)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${periodKey === opt.key ? 'bg-[#F5A623] text-white border-[#F5A623]' : 'border-gray-200 text-gray-600 hover:border-[#F5A623]'}`}>
                      {opt.label}
                    </button>
                  ))}
                  {periodKey === 'custom' && (
                    <div className="flex items-center gap-1.5 mt-1 sm:mt-0">
                      <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
                      <span className="text-gray-400 text-xs">–</span>
                      <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
                    </div>
                  )}
                </div>

                {metricsLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 animate-pulse">
                    {Array.from({length:6}).map((_,i) => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
                  </div>
                ) : !metrics ? (
                  <p className="text-sm text-gray-400 text-center py-8">Sem dados para o período selecionado.</p>
                ) : (
                  <>
                    {/* Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        {
                          title: 'Total bruto gasto',
                          value: fmt(metrics.totalGross),
                          sub:   'Valor bruto total dos lançamentos',
                          badge: metrics.variations.grossVariation !== 0
                            ? `${metrics.variations.grossVariation > 0 ? '▲' : '▼'} ${Math.abs(metrics.variations.grossVariation)}% vs anterior`
                            : null,
                          badgeCls: metrics.variations.grossVariation > 0 ? 'text-red-600' : 'text-green-600',
                          iconCls: 'bg-red-50 text-red-500',
                        },
                        {
                          title: 'Descontos obtidos',
                          value: fmt(metrics.totalDiscounts),
                          sub:   `${metrics.discountPercentage.toFixed(1)}% de desconto médio`,
                          badge: metrics.totalDiscounts > 0 ? `Você economizou ${fmt(metrics.totalDiscounts)}` : 'Sem descontos',
                          badgeCls: metrics.totalDiscounts > 0 ? 'text-green-600' : 'text-gray-400',
                          iconCls: 'bg-green-50 text-green-500',
                        },
                        {
                          title: 'Total líquido pago',
                          value: fmt(metrics.totalNet),
                          sub:   'Valor real que saiu do caixa',
                          badge: metrics.variations.netVariation !== 0
                            ? `${metrics.variations.netVariation > 0 ? '▲' : '▼'} ${Math.abs(metrics.variations.netVariation)}% vs anterior`
                            : null,
                          badgeCls: metrics.variations.netVariation > 0 ? 'text-red-600' : 'text-green-600',
                          iconCls: 'bg-blue-50 text-blue-500',
                        },
                        {
                          title: 'Transações',
                          value: String(metrics.transactionCount),
                          sub:   `Ticket médio: ${fmt(metrics.averageTicket)}`,
                          badge: null, badgeCls: '',
                          iconCls: 'bg-violet-50 text-violet-500',
                        },
                        {
                          title: 'Maior compra',
                          value: metrics.largestTransaction ? fmt(metrics.largestTransaction.amount) : '—',
                          sub:   metrics.largestTransaction?.description ?? 'Nenhuma compra no período',
                          badge: metrics.largestTransaction ? fmtDate(metrics.largestTransaction.date) : null,
                          badgeCls: 'text-gray-500',
                          iconCls: 'bg-amber-50 text-amber-500',
                        },
                        {
                          title: 'Juros pagos',
                          value: fmt(metrics.totalInterest),
                          sub:   'Acréscimos sobre pagamentos',
                          badge: metrics.totalInterest > 0 ? '⚠️ Negocie prazos melhores' : '✅ Sem juros',
                          badgeCls: metrics.totalInterest > 0 ? 'text-amber-600' : 'text-green-600',
                          iconCls: metrics.totalInterest > 0 ? 'bg-amber-50 text-amber-500' : 'bg-gray-50 text-gray-400',
                        },
                      ].map((card) => (
                        <div key={card.title} className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-1">
                          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{card.title}</p>
                          <p className="text-xl font-bold text-gray-900">{card.value}</p>
                          <p className="text-xs text-gray-500 line-clamp-1">{card.sub}</p>
                          {card.badge && (
                            <p className={`text-[11px] font-semibold ${card.badgeCls}`}>{card.badge}</p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Gráfico evolução mensal */}
                    {metrics.monthlyEvolution.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Evolução mensal de gastos</p>
                        <div className="flex items-center gap-4 mb-2">
                          {[['#D1D5DB','Bruto'],['#3B82F6','Líquido'],['#22C55E','Descontos']].map(([c,l]) => (
                            <div key={l} className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full" style={{background:c}} />
                              <span className="text-xs text-gray-500">{l}</span>
                            </div>
                          ))}
                        </div>
                        <ResponsiveContainer width="100%" height={200}>
                          <ComposedChart data={metrics.monthlyEvolution} barSize={10} barGap={2}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={48} />
                            <Tooltip
                              formatter={(v, n) => [fmt(Number(v)), n as string]}
                              contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #E5E7EB' }}
                            />
                            <Bar dataKey="grossAmount" name="Bruto"     fill="#D1D5DB" radius={[3,3,0,0]} />
                            <Bar dataKey="netAmount"   name="Líquido"   fill="#3B82F6" radius={[3,3,0,0]} />
                            <Line type="monotone" dataKey="discounts" name="Descontos" stroke="#22C55E" strokeWidth={2}
                              dot={{ r:3, fill:'#22C55E', strokeWidth:0 }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Tabela de transações detalhada */}
                    {metrics.transactions.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Histórico do período</p>
                        <div className="overflow-x-auto rounded-xl border border-gray-100">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-100">
                              <tr>
                                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase">Data</th>
                                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase">Descrição</th>
                                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase hidden md:table-cell">Bruto</th>
                                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase hidden md:table-cell">Desconto</th>
                                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase hidden md:table-cell">Juros</th>
                                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase">Líquido</th>
                                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {metrics.transactions.map(tx => (
                                <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(tx.referenceDate)}</td>
                                  <td className="px-4 py-2.5">
                                    <p className="text-xs text-gray-800 line-clamp-1">{tx.description}</p>
                                    {tx.category && <p className="text-[10px] text-gray-400">{tx.category.name}</p>}
                                  </td>
                                  <td className="px-4 py-2.5 text-xs text-gray-500 text-right tabular-nums hidden md:table-cell">{fmt(tx.grossAmount)}</td>
                                  <td className="px-4 py-2.5 text-xs text-green-600 text-right tabular-nums hidden md:table-cell">
                                    {tx.retentionAmount > 0 ? `−${fmt(tx.retentionAmount)}` : '—'}
                                  </td>
                                  <td className="px-4 py-2.5 text-xs text-amber-600 text-right tabular-nums hidden md:table-cell">
                                    {tx.interestAmount > 0 ? `+${fmt(tx.interestAmount)}` : '—'}
                                  </td>
                                  <td className="px-4 py-2.5 text-xs font-semibold text-red-500 text-right tabular-nums">{fmt(tx.netAmount)}</td>
                                  <td className="px-4 py-2.5">
                                    {tx.isPaid
                                      ? <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Pago</span>
                                      : <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Pendente</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gray-50 border-t border-gray-200">
                              <tr>
                                <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-gray-600">Totais</td>
                                <td className="px-4 py-2.5 text-xs font-semibold text-gray-700 text-right tabular-nums hidden md:table-cell">{fmt(metrics.totalGross)}</td>
                                <td className="px-4 py-2.5 text-xs font-semibold text-green-600 text-right tabular-nums hidden md:table-cell">−{fmt(metrics.totalDiscounts)}</td>
                                <td className="px-4 py-2.5 text-xs font-semibold text-amber-600 text-right tabular-nums hidden md:table-cell">+{fmt(metrics.totalInterest)}</td>
                                <td className="px-4 py-2.5 text-xs font-semibold text-red-500 text-right tabular-nums">{fmt(metrics.totalNet)}</td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        {/* Exportar CSV */}
                        <div className="flex justify-end mt-2">
                          <button
                            onClick={() => {
                              const rows = [
                                ['Data','Descrição','Categoria','Bruto','Desconto','Juros','Líquido','Status'],
                                ...metrics.transactions.map(t => [
                                  fmtDate(t.referenceDate), t.description,
                                  t.category?.name ?? '', t.grossAmount, t.retentionAmount,
                                  t.interestAmount, t.netAmount, t.isPaid ? 'Pago' : 'Pendente',
                                ]),
                              ]
                              const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
                              const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'})
                              const url  = URL.createObjectURL(blob)
                              const a    = document.createElement('a')
                              a.href     = url
                              a.download = `fornecedor-${supplier!.name}-transacoes.csv`
                              a.click()
                            }}
                            className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            <Download size={12} /> Exportar CSV
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Card "Poder de negociação" */}
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <Sparkles size={16} className="text-blue-500" />
                        <p className="text-sm font-bold text-blue-800">Seu poder de negociação</p>
                      </div>
                      <div className="space-y-1.5 text-sm text-blue-700">
                        <p>Você gastou <span className="font-semibold">{fmt(metrics.totalGross)}</span> com <span className="font-semibold">{metrics.supplierName}</span> no período.</p>
                        {metrics.totalDiscounts > 0 ? (
                          <p>Obteve <span className="font-semibold text-green-700">{fmt(metrics.totalDiscounts)}</span> em descontos (<span className="font-semibold">{metrics.discountPercentage.toFixed(1)}%</span> de desconto médio).</p>
                        ) : (
                          <p className="text-blue-500">Sem descontos registrados — considere negociar abatimentos.</p>
                        )}
                        <p>Ticket médio: <span className="font-semibold">{fmt(metrics.averageTicket)}</span> por compra.</p>
                        {metrics.totalInterest > 0 && (
                          <p className="text-amber-700 font-medium">⚠️ Pagou {fmt(metrics.totalInterest)} em juros — negocie prazos melhores.</p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          const w = window.open('', '_blank')
                          if (!w) return
                          const { start, end } = getPeriodDates()
                          w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
                          <title>Relatório de Relacionamento — ${metrics.supplierName}</title>
                          <style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#1f2937}
                          h1{color:#1d4ed8;font-size:22px}h2{color:#374151;font-size:16px;margin-top:24px}
                          table{width:100%;border-collapse:collapse;margin-top:12px}
                          th{background:#f3f4f6;padding:8px;text-align:left;font-size:12px;text-transform:uppercase}
                          td{padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px}
                          .big{font-size:28px;font-weight:bold;color:#1d4ed8}
                          .green{color:#16a34a}.red{color:#dc2626}.sub{font-size:12px;color:#6b7280}
                          @media print{button{display:none}}</style></head><body>
                          <h1>Relatório de Relacionamento Comercial</h1>
                          <p class="sub">Fornecedor: <strong>${metrics.supplierName}</strong> &nbsp;|&nbsp; Período: ${start} a ${end}</p>
                          <h2>Resumo executivo</h2>
                          <table><tr><th>Indicador</th><th>Valor</th></tr>
                          <tr><td>Total bruto gasto</td><td class="big">${fmt(metrics.totalGross)}</td></tr>
                          <tr><td>Descontos obtidos</td><td class="green">${fmt(metrics.totalDiscounts)} (${metrics.discountPercentage.toFixed(1)}%)</td></tr>
                          <tr><td>Juros e acréscimos</td><td class="red">${fmt(metrics.totalInterest)}</td></tr>
                          <tr><td>Total líquido pago</td><td><strong>${fmt(metrics.totalNet)}</strong></td></tr>
                          <tr><td>Quantidade de compras</td><td>${metrics.transactionCount}</td></tr>
                          <tr><td>Ticket médio</td><td>${fmt(metrics.averageTicket)}</td></tr></table>
                          <h2>Proposta de negociação</h2>
                          <p>Baseado no histórico de <strong>${fmt(metrics.totalGross)}</strong> em compras:</p>
                          <ul><li>Desconto médio atual: <strong>${metrics.discountPercentage.toFixed(1)}%</strong></li>
                          <li>Meta de desconto proposta: <strong>${(metrics.discountPercentage + 2).toFixed(1)}%</strong></li></ul>
                          <h2>Histórico de transações</h2>
                          <table><tr><th>Data</th><th>Descrição</th><th>Bruto</th><th>Desconto</th><th>Líquido</th><th>Status</th></tr>
                          ${metrics.transactions.map(t => `<tr><td>${fmtDate(t.referenceDate)}</td><td>${t.description}</td><td>${fmt(t.grossAmount)}</td><td class="green">${t.retentionAmount>0?'−'+fmt(t.retentionAmount):'—'}</td><td>${fmt(t.netAmount)}</td><td>${t.isPaid?'Pago':'Pendente'}</td></tr>`).join('')}
                          </table><br><p class="sub">Gerado pelo SYSOBRA em ${new Date().toLocaleString('pt-BR')}</p>
                          <button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
                          </body></html>`)
                          w.document.close()
                        }}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
                      >
                        <Download size={13} /> Gerar relatório de relacionamento
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Aba Financeiro */}
            {tab === 'financeiro' && (
              <div className="overflow-x-auto">
                {txs.length === 0 ? (
                  <div className="text-center py-10">
                    <FileText size={32} className="text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 mb-3">Nenhum lançamento vinculado</p>
                    <Link href={`/app/financeiro?novo=1&supplierId=${id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F5A623] hover:underline">
                      <Plus size={12} /> Novo lançamento para este fornecedor
                    </Link>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase">Descrição</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase hidden md:table-cell">Vencimento</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase hidden md:table-cell">Pagamento</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase">Valor</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {txs.map(tx => (
                        <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              {tx.category?.icon && <span>{tx.category.icon}</span>}
                              <span className="text-sm text-gray-700">{tx.description}</span>
                            </div>
                            {tx.category && (
                              <p className="text-xs text-gray-400 mt-0.5">{tx.category.name}</p>
                            )}
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-500 hidden md:table-cell">
                            {fmtDate(tx.dueDate)}
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-500 hidden md:table-cell">
                            {tx.isPaid ? fmtDate(tx.paidAt) : '—'}
                          </td>
                          <td className={`px-5 py-3 text-sm font-semibold ${tx.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}`}>
                            {tx.type === 'INCOME' ? '+' : '-'}{fmt(tx.netAmount)}
                          </td>
                          <td className="px-5 py-3">
                            {tx.isPaid
                              ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Pago</span>
                              : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pendente</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Aba Pedidos de Compra */}
            {tab === 'compras' && (
              <div className="overflow-x-auto">
                {pos.length === 0 ? (
                  <div className="text-center py-10">
                    <ShoppingCart size={32} className="text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Nenhum pedido de compra vinculado</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase">Pedido</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase hidden md:table-cell">Data</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase">Valor</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pos.map(po => {
                        const st = PO_STATUS[po.status] ?? { label: po.status, cls: 'bg-gray-100 text-gray-600' }
                        return (
                          <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-5 py-3">
                              <span className="text-sm font-medium text-gray-800">
                                {po.code ?? `#${po.id.slice(-6).toUpperCase()}`}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-xs text-gray-500 hidden md:table-cell">
                              {fmtDate(po.createdAt)}
                            </td>
                            <td className="px-5 py-3 text-sm font-semibold text-gray-800">
                              {fmt(Number(po.totalAmount))}
                            </td>
                            <td className="px-5 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${st.cls}`}>{st.label}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* Info de segurança quando sem dados bancários */}
          {!hasBankData && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Nenhum dado bancário cadastrado para este fornecedor.{' '}
                <Link href={`/app/financeiro/fornecedores?edit=${id}`} className="font-semibold underline hover:no-underline">
                  Adicionar dados bancários
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
