'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Building2, User, Mail, Phone, MapPin,
  TrendingUp, FileText, Briefcase, CheckCircle, XCircle,
  Plus, Pencil, ChevronRight, Sparkles, Download,
} from 'lucide-react'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Line, ComposedChart,
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
interface ClientMetrics {
  period:              { start: string; end: string }
  clientName:          string
  totalGross:          number
  totalNet:            number
  totalRetentions:     number
  totalInterest:       number
  transactionCount:    number
  averageTicket:       number
  retentionPercentage: number
  largestTransaction:  { amount: number; date: string; description: string } | null
  monthlyEvolution:    { month: string; grossAmount: number; netAmount: number; retentions: number; transactionCount: number }[]
  previousPeriod:      { totalGross: number; totalNet: number; transactionCount: number }
  variations:          { grossVariation: number; netVariation: number; countVariation: number }
  transactions:        {
    id: string; description: string; referenceDate: string; isPaid: boolean
    grossAmount: number; netAmount: number; retentionAmount: number; interestAmount: number
    category: { name: string; color: string | null } | null
  }[]
}

const PERIOD_OPTIONS = [
  { label: 'Este mês',         key: 'month'    },
  { label: 'Último trimestre', key: 'quarter'  },
  { label: 'Este ano',         key: 'year'     },
  { label: 'Ano passado',      key: 'lastyear' },
  { label: 'Personalizado',    key: 'custom'   },
] as const

// ─── Types ────────────────────────────────────────────────────────────────────
interface ClientDetail {
  id:               string
  type:             'PERSON' | 'COMPANY'
  name:             string
  tradeName:        string | null
  email:            string | null
  phone:            string | null
  phone2:           string | null
  whatsapp:         string | null
  cpfCnpj:          string | null
  address:          string | null
  city:             string | null
  state:            string | null
  zipCode:          string | null
  contactName:      string | null
  contactRole:      string | null
  contactEmail:     string | null
  contactPhone:     string | null
  notes:            string | null
  isActive:         boolean
  createdAt:        string
  projectCount:     number
  transactionCount: number
  totalReceivable:  number
  totalReceived:    number
  projects: {
    id: string; name: string; code: string | null; status: string
    progressPercent: number; budgetAlert: boolean; delayAlert: boolean
    globalBudget: number | null; expectedEndDate: string | null
  }[]
  financialTransactions: {
    id: string; description: string; type: string; isPaid: boolean
    netAmount: number; dueDate: string | null; referenceDate: string | null
    category: { name: string; color: string | null; icon: string | null } | null
  }[]
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

const PROJECT_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  ACTIVE:      { label: 'Ativo',      cls: 'bg-green-100 text-green-700'  },
  IN_PROGRESS: { label: 'Em obra',    cls: 'bg-blue-100 text-blue-700'    },
  PAUSED:      { label: 'Pausado',    cls: 'bg-amber-100 text-amber-700'  },
  COMPLETED:   { label: 'Concluído',  cls: 'bg-gray-100 text-gray-600'    },
  CANCELLED:   { label: 'Cancelado',  cls: 'bg-red-100 text-red-700'      },
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ClienteDetailPage() {
  const { id } = useParams() as { id: string }
  const [client,  setClient]  = useState<ClientDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [tab,     setTab]     = useState<'metricas' | 'obras' | 'financeiro'>('metricas')

  // ── Métricas ────────────────────────────────────────────────────────────────
  const [metrics,        setMetrics]        = useState<ClientMetrics | null>(null)
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
        `${API}/api/v1/clients/${id}/metrics?startDate=${start}&endDate=${end}`,
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
      const res  = await fetch(`${API}/api/v1/clients/${id}`, { headers: { Authorization: `Bearer ${token()}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar')
      setClient(data.client)
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
  if (error || !client) return (
    <div className="p-6 text-center">
      <p className="text-red-600 text-sm">{error || 'Cliente não encontrado.'}</p>
      <Link href="/app/financeiro/clientes" className="text-sm text-[#F5A623] hover:underline mt-2 inline-block">← Voltar</Link>
    </div>
  )

  const proj = client.projects ?? []
  const txs  = client.financialTransactions ?? []

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: 'Financeiro',  href: '/app/financeiro' },
        { label: 'Clientes',    href: '/app/financeiro/clientes' },
        { label: client.name },
      ]} className="mb-1" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
          {client.tradeName && <p className="text-sm text-gray-500">{client.tradeName}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${client.isActive?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>
            {client.isActive ? 'Ativo' : 'Inativo'}
          </span>
          <Link href={`/app/financeiro/clientes/${id}?edit=1`}
            className="flex items-center gap-1.5 text-xs border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50">
            <Pencil size={13} /> Editar
          </Link>
          <Link href={`/app/centro-de-custo/nova?clientId=${id}`}
            className="flex items-center gap-2 bg-[#F5A623] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-[#d4891a]">
            <Plus size={16} /> Nova obra
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Coluna esquerda — dados */}
        <div className="xl:col-span-1 space-y-4">
          {/* Dados principais */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${client.type==='PERSON'?'bg-indigo-50':'bg-blue-50'}`}>
                {client.type==='PERSON' ? <User size={22} className="text-indigo-500" /> : <Building2 size={22} className="text-blue-500" />}
              </div>
              <div>
                <p className="text-xs text-gray-400">{client.type==='PERSON'?'Pessoa Física':'Pessoa Jurídica'}</p>
                <p className="text-sm font-semibold text-gray-700">{fmtDoc(client.cpfCnpj)}</p>
              </div>
            </div>
            {client.email && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail size={14} className="text-gray-400 flex-shrink-0" />
                <a href={`mailto:${client.email}`} className="hover:text-[#F5A623] truncate">{client.email}</a>
              </div>
            )}
            {client.phone && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone size={14} className="text-gray-400 flex-shrink-0" />
                <span>{client.phone}</span>
                {client.phone2 && <span className="text-gray-400 text-xs">· {client.phone2}</span>}
              </div>
            )}
            {(client.address || client.city) && (
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <MapPin size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                <span>{[client.address, client.city, client.state].filter(Boolean).join(', ')}</span>
              </div>
            )}
            {client.notes && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400 font-semibold uppercase mb-1">Observações</p>
                <p className="text-sm text-gray-600">{client.notes}</p>
              </div>
            )}
          </div>

          {/* Contato principal (PJ) */}
          {client.type === 'COMPANY' && (client.contactName || client.contactEmail) && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Contato principal</p>
              {client.contactName  && <p className="text-sm font-semibold text-gray-800">{client.contactName}</p>}
              {client.contactRole  && <p className="text-xs text-gray-500 mb-2">{client.contactRole}</p>}
              {client.contactEmail && <p className="text-xs text-gray-600">{client.contactEmail}</p>}
              {client.contactPhone && <p className="text-xs text-gray-600">{client.contactPhone}</p>}
            </div>
          )}

          {/* Resumo rápido */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'A receber', value: fmt(client.totalReceivable), cls: 'text-green-600' },
              { label: 'Recebido',  value: fmt(client.totalReceived),   cls: 'text-gray-800' },
              { label: 'Obras',     value: String(proj.length),         cls: 'text-blue-600' },
              { label: 'Lançamentos', value: String(txs.length),        cls: 'text-gray-800' },
            ].map(m => (
              <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className={`text-lg font-bold ${m.cls}`}>{m.value}</p>
                <p className="text-[11px] font-semibold text-gray-400 uppercase">{m.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Coluna direita — abas */}
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-100 overflow-x-auto">
              {([
                { key: 'metricas',   label: '📊 Métricas' },
                { key: 'obras',      label: `Obras (${proj.length})` },
                { key: 'financeiro', label: `Financeiro (${txs.length})` },
              ] as const).map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${tab===t.key?'border-[#F5A623] text-[#F5A623]':'border-transparent text-gray-500 hover:text-gray-700'}`}>
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
                          title: 'Total faturado (bruto)',
                          value: fmt(metrics.totalGross),
                          sub:   'Soma bruta das receitas do cliente',
                          badge: metrics.variations.grossVariation !== 0
                            ? `${metrics.variations.grossVariation > 0 ? '▲' : '▼'} ${Math.abs(metrics.variations.grossVariation)}% vs anterior`
                            : null,
                          badgeCls: metrics.variations.grossVariation > 0 ? 'text-green-600' : 'text-red-600',
                          iconCls: 'bg-green-50 text-green-500',
                        },
                        {
                          title: 'Total de retenções',
                          value: fmt(metrics.totalRetentions),
                          sub:   `${metrics.retentionPercentage.toFixed(1)}% retido (ISS, INSS, IRRF)`,
                          badge: metrics.totalRetentions > 0 ? `${fmt(metrics.totalRetentions)} retidos na fonte` : 'Sem retenções',
                          badgeCls: metrics.totalRetentions > 0 ? 'text-amber-600' : 'text-gray-400',
                          iconCls: 'bg-amber-50 text-amber-500',
                        },
                        {
                          title: 'Total líquido recebido',
                          value: fmt(metrics.totalNet),
                          sub:   'Valor real que entrou no caixa',
                          badge: metrics.variations.netVariation !== 0
                            ? `${metrics.variations.netVariation > 0 ? '▲' : '▼'} ${Math.abs(metrics.variations.netVariation)}% vs anterior`
                            : null,
                          badgeCls: metrics.variations.netVariation > 0 ? 'text-green-600' : 'text-red-600',
                          iconCls: 'bg-blue-50 text-blue-500',
                        },
                        {
                          title: 'Recebimentos',
                          value: String(metrics.transactionCount),
                          sub:   `Ticket médio: ${fmt(metrics.averageTicket)}`,
                          badge: null, badgeCls: '',
                          iconCls: 'bg-violet-50 text-violet-500',
                        },
                        {
                          title: 'Maior recebimento',
                          value: metrics.largestTransaction ? fmt(metrics.largestTransaction.amount) : '—',
                          sub:   metrics.largestTransaction?.description ?? 'Nenhum recebimento no período',
                          badge: metrics.largestTransaction ? fmtDate(metrics.largestTransaction.date) : null,
                          badgeCls: 'text-gray-500',
                          iconCls: 'bg-teal-50 text-teal-500',
                        },
                        {
                          title: 'Juros recebidos',
                          value: fmt(metrics.totalInterest),
                          sub:   'Correções e multas recebidas',
                          badge: metrics.totalInterest > 0 ? '✅ Acréscimos cobrados' : '—',
                          badgeCls: metrics.totalInterest > 0 ? 'text-green-600' : 'text-gray-400',
                          iconCls: metrics.totalInterest > 0 ? 'bg-green-50 text-green-500' : 'bg-gray-50 text-gray-400',
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
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Evolução mensal de receitas</p>
                        <div className="flex items-center gap-4 mb-2">
                          {[['#D1D5DB','Bruto'],['#22C55E','Líquido'],['#F59E0B','Retenções']].map(([c,l]) => (
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
                            <Bar dataKey="grossAmount" name="Bruto"      fill="#D1D5DB" radius={[3,3,0,0]} />
                            <Bar dataKey="netAmount"   name="Líquido"    fill="#22C55E" radius={[3,3,0,0]} />
                            <Line type="monotone" dataKey="retentions" name="Retenções" stroke="#F59E0B" strokeWidth={2}
                              dot={{ r:3, fill:'#F59E0B', strokeWidth:0 }} />
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
                                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase hidden md:table-cell">Retenções</th>
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
                                  <td className="px-4 py-2.5 text-xs text-amber-600 text-right tabular-nums hidden md:table-cell">
                                    {tx.retentionAmount > 0 ? `−${fmt(tx.retentionAmount)}` : '—'}
                                  </td>
                                  <td className="px-4 py-2.5 text-xs text-green-600 text-right tabular-nums hidden md:table-cell">
                                    {tx.interestAmount > 0 ? `+${fmt(tx.interestAmount)}` : '—'}
                                  </td>
                                  <td className="px-4 py-2.5 text-xs font-semibold text-green-600 text-right tabular-nums">{fmt(tx.netAmount)}</td>
                                  <td className="px-4 py-2.5">
                                    {tx.isPaid
                                      ? <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Recebido</span>
                                      : <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Pendente</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gray-50 border-t border-gray-200">
                              <tr>
                                <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-gray-600">Totais</td>
                                <td className="px-4 py-2.5 text-xs font-semibold text-gray-700 text-right tabular-nums hidden md:table-cell">{fmt(metrics.totalGross)}</td>
                                <td className="px-4 py-2.5 text-xs font-semibold text-amber-600 text-right tabular-nums hidden md:table-cell">−{fmt(metrics.totalRetentions)}</td>
                                <td className="px-4 py-2.5 text-xs font-semibold text-green-600 text-right tabular-nums hidden md:table-cell">+{fmt(metrics.totalInterest)}</td>
                                <td className="px-4 py-2.5 text-xs font-semibold text-green-600 text-right tabular-nums">{fmt(metrics.totalNet)}</td>
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
                                ['Data','Descrição','Categoria','Bruto','Retenções','Juros','Líquido','Status'],
                                ...metrics.transactions.map(t => [
                                  fmtDate(t.referenceDate), t.description,
                                  t.category?.name ?? '', t.grossAmount, t.retentionAmount,
                                  t.interestAmount, t.netAmount, t.isPaid ? 'Recebido' : 'Pendente',
                                ]),
                              ]
                              const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
                              const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'})
                              const url  = URL.createObjectURL(blob)
                              const a    = document.createElement('a')
                              a.href     = url
                              a.download = `cliente-${client!.name}-receitas.csv`
                              a.click()
                            }}
                            className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            <Download size={12} /> Exportar CSV
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Card "Análise de relacionamento com cliente" */}
                    <div className="rounded-2xl border border-green-200 bg-green-50 p-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <Sparkles size={16} className="text-green-600" />
                        <p className="text-sm font-bold text-green-800">Análise de relacionamento com o cliente</p>
                      </div>
                      <div className="space-y-1.5 text-sm text-green-700">
                        <p>Você faturou <span className="font-semibold">{fmt(metrics.totalGross)}</span> com <span className="font-semibold">{metrics.clientName}</span> no período.</p>
                        {metrics.totalRetentions > 0 ? (
                          <p>Foram retidos <span className="font-semibold text-amber-700">{fmt(metrics.totalRetentions)}</span> na fonte (<span className="font-semibold">{metrics.retentionPercentage.toFixed(1)}%</span> de retenção média).</p>
                        ) : (
                          <p className="text-green-600">Sem retenções registradas no período.</p>
                        )}
                        <p>Valor líquido recebido: <span className="font-semibold">{fmt(metrics.totalNet)}</span></p>
                        <p>Ticket médio: <span className="font-semibold">{fmt(metrics.averageTicket)}</span> por recebimento.</p>
                        {metrics.totalInterest > 0 && (
                          <p className="text-green-800 font-medium">✅ Cobrou {fmt(metrics.totalInterest)} em juros/correções.</p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          const w = window.open('', '_blank')
                          if (!w) return
                          const { start, end } = getPeriodDates()
                          w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
                          <title>Relatório de Relacionamento — ${metrics.clientName}</title>
                          <style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#1f2937}
                          h1{color:#16a34a;font-size:22px}h2{color:#374151;font-size:16px;margin-top:24px}
                          table{width:100%;border-collapse:collapse;margin-top:12px}
                          th{background:#f0fdf4;padding:8px;text-align:left;font-size:12px;text-transform:uppercase}
                          td{padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px}
                          .big{font-size:28px;font-weight:bold;color:#16a34a}
                          .green{color:#16a34a}.amber{color:#d97706}.sub{font-size:12px;color:#6b7280}
                          @media print{button{display:none}}</style></head><body>
                          <h1>Relatório de Relacionamento Comercial</h1>
                          <p class="sub">Cliente: <strong>${metrics.clientName}</strong> &nbsp;|&nbsp; Período: ${start} a ${end}</p>
                          <h2>Resumo executivo</h2>
                          <table><tr><th>Indicador</th><th>Valor</th></tr>
                          <tr><td>Total faturado (bruto)</td><td class="big">${fmt(metrics.totalGross)}</td></tr>
                          <tr><td>Retenções na fonte</td><td class="amber">${fmt(metrics.totalRetentions)} (${metrics.retentionPercentage.toFixed(1)}%)</td></tr>
                          <tr><td>Juros e correções</td><td class="green">${fmt(metrics.totalInterest)}</td></tr>
                          <tr><td>Total líquido recebido</td><td><strong>${fmt(metrics.totalNet)}</strong></td></tr>
                          <tr><td>Quantidade de recebimentos</td><td>${metrics.transactionCount}</td></tr>
                          <tr><td>Ticket médio</td><td>${fmt(metrics.averageTicket)}</td></tr></table>
                          <h2>Histórico de recebimentos</h2>
                          <table><tr><th>Data</th><th>Descrição</th><th>Bruto</th><th>Retenções</th><th>Líquido</th><th>Status</th></tr>
                          ${metrics.transactions.map(t => `<tr><td>${fmtDate(t.referenceDate)}</td><td>${t.description}</td><td>${fmt(t.grossAmount)}</td><td class="amber">${t.retentionAmount>0?'−'+fmt(t.retentionAmount):'—'}</td><td class="green">${fmt(t.netAmount)}</td><td>${t.isPaid?'Recebido':'Pendente'}</td></tr>`).join('')}
                          </table><br><p class="sub">Gerado pelo SYSOBRA em ${new Date().toLocaleString('pt-BR')}</p>
                          <button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
                          </body></html>`)
                          w.document.close()
                        }}
                        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
                      >
                        <Download size={13} /> Gerar relatório de relacionamento
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ─── Aba Obras ─── */}
            {tab === 'obras' && (
              <div className="p-4 space-y-3">
                {proj.length === 0 ? (
                  <div className="text-center py-8">
                    <Briefcase size={32} className="text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Nenhuma obra vinculada</p>
                    <Link href={`/app/centro-de-custo/nova?clientId=${id}`}
                      className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-[#F5A623] hover:underline">
                      <Plus size={12} /> Nova obra para este cliente
                    </Link>
                  </div>
                ) : proj.map(p => {
                  const st = PROJECT_STATUS_LABEL[p.status] ?? { label: p.status, cls: 'bg-gray-100 text-gray-600' }
                  return (
                    <Link key={p.id} href={`/app/centro-de-custo/${p.id}`}
                      className="flex items-center gap-4 p-3 rounded-xl border border-gray-100 hover:border-[#F5A623]/30 hover:bg-orange-50/30 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                          {p.code && <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">{p.code}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                            <div className="bg-[#F5A623] h-1.5 rounded-full" style={{ width: `${Math.min(Number(p.progressPercent),100)}%` }} />
                          </div>
                          <span className="text-xs text-gray-500 flex-shrink-0">{Number(p.progressPercent).toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${st.cls}`}>{st.label}</span>
                        {p.globalBudget && <span className="text-xs text-gray-500">{fmt(Number(p.globalBudget))}</span>}
                      </div>
                      {(p.budgetAlert || p.delayAlert) && (
                        <span title={p.budgetAlert ? 'Orçamento estourado' : 'Prazo vencido'}>
                          <CheckCircle size={14} className="text-red-400 flex-shrink-0" />
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}

            {/* ─── Aba Financeiro ─── */}
            {tab === 'financeiro' && (
              <div className="overflow-x-auto">
                {txs.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText size={32} className="text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Nenhum lançamento vinculado</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase">Descrição</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase hidden md:table-cell">Data</th>
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
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-500 hidden md:table-cell">{fmtDate(tx.dueDate ?? tx.referenceDate)}</td>
                          <td className={`px-5 py-3 text-sm font-semibold ${tx.type==='INCOME'?'text-green-600':'text-red-500'}`}>
                            {tx.type==='INCOME'?'+':'-'}{fmt(tx.netAmount)}
                          </td>
                          <td className="px-5 py-3">
                            {tx.isPaid
                              ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Recebido</span>
                              : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pendente</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
