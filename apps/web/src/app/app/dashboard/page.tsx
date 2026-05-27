'use client'

import Link from 'next/link'
import { useState, useRef } from 'react'
import {
  ComposedChart, AreaChart, BarChart,
  Bar, Line, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Scale, Wallet,
  Bell, AlertTriangle, Info,
  ChevronLeft, ChevronRight, X, RefreshCw, AlertCircle,
  SlidersHorizontal, HardHat, Layers,
  Plus, Pencil, CheckCircle, XCircle, Trash2, RefreshCcw,
} from 'lucide-react'

import { useFilterState, useDashboardData, useBankAccounts, useProjects, useProjectAlerts, type ProjectOption } from './hooks'
import { ChartModal, ChartDropdown, ZoomBtn, makeChartTooltip, useChartExport, exportCsv } from './chart-actions'
import type { BillGroup, Transaction, ExpenseCategory, CashflowPoint, BalancePoint } from './data'
import { formatCurrency, formatCurrencyCompact } from '@/lib/format'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { ActivityFeed } from '@/components/ui/ActivityFeed'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt  = formatCurrency
const fmtK = formatCurrencyCompact

// ─── Skeletons ────────────────────────────────────────────────────────────────

function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded-lg ${className}`} />
}
function SkeletonMetric() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 xl:p-3">
      <div className="flex items-start justify-between mb-3 xl:mb-2">
        <Pulse className="w-10 h-10 xl:w-8 xl:h-8 rounded-xl" />
        <Pulse className="w-14 h-5 rounded-full xl:hidden" />
      </div>
      <Pulse className="h-8 xl:h-6 w-36 xl:w-24 mb-2 xl:mb-1" />
      <Pulse className="h-3 w-20 mb-1.5" />
      <Pulse className="h-3 w-28 xl:hidden" />
    </div>
  )
}
function SkeletonChart({ height = 230 }: { height?: number }) {
  return <div className="px-4 pb-4 animate-pulse"><div className="bg-gray-100 rounded-xl" style={{ height }} /></div>
}
function SkeletonRows({ n = 4 }: { n?: number }) {
  return (
    <div className="px-5 pb-5 space-y-3 animate-pulse">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex justify-between items-center">
          <Pulse className="h-3 w-2/3" /><Pulse className="h-3 w-1/5" />
        </div>
      ))}
    </div>
  )
}

// ─── Primitivos de layout ─────────────────────────────────────────────────────

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm ${className}`}>{children}</div>
}

function PanelHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pt-4 pb-3">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      {actions && <div className="flex items-center gap-1.5">{actions}</div>}
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  )
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

function MetricCard({ title, value, label, trendUp, trendPct, loading, icon: Icon, iconCls, iconBgCls }: {
  title: string; value: number; label: string
  trendUp?: boolean; trendPct?: string; loading: boolean
  icon: React.ElementType; iconCls: string; iconBgCls: string
}) {
  if (loading) return <SkeletonMetric />
  return (
    <Panel className="p-5 xl:p-3">
      <div className="flex items-start justify-between mb-3 xl:mb-2">
        <div className={`w-10 h-10 xl:w-8 xl:h-8 rounded-xl flex items-center justify-center ${iconBgCls}`}>
          <Icon size={20} className={`xl:hidden ${iconCls}`} />
          <Icon size={16} className={`hidden xl:block ${iconCls}`} />
        </div>
        {trendPct != null && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full xl:hidden ${trendUp ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {trendUp ? '▲' : '▼'} {trendPct}
          </span>
        )}
      </div>
      <p className="text-2xl xl:text-xl font-bold text-gray-900 leading-none mb-1">{fmt(value)}</p>
      <p className="text-[11px] xl:text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </Panel>
  )
}

// ─── AccountsCard ─────────────────────────────────────────────────────────────

function AccountsCard({ title, items, loading }: { title: string; items: BillGroup[]; loading: boolean }) {
  if (loading) return (
    <Panel className="flex flex-col h-full">
      <PanelHeader title={title} /><SkeletonRows n={3} />
    </Panel>
  )
  const total = items.reduce((s, i) => s + i.valor, 0)
  return (
    <Panel className="flex flex-col h-full">
      <PanelHeader title={title} actions={<button className="text-xs text-[#F5A623] hover:underline font-medium">Ver todas</button>} />
      <div className="px-5 pb-5 flex-1 flex flex-col justify-between">
        <ul className="space-y-3 mb-4">
          {items.map((item) => (
            <li key={item.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`min-w-[22px] text-center text-xs font-bold px-1.5 py-0.5 rounded-full ${item.badgeCls}`}>{item.count}</span>
                <span className="text-xs text-gray-600">{item.label}</span>
              </div>
              <span className="text-xs font-semibold text-gray-900 tabular-nums">{fmt(item.valor)}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
          <span className="text-xs font-semibold text-gray-600">Total em aberto</span>
          <span className="text-sm font-bold text-gray-900 tabular-nums">{fmt(total)}</span>
        </div>
      </div>
    </Panel>
  )
}

// ─── ActionIcon — ícone colorido por tipo de ação ────────────────────────────

function ActionIcon({ action, deleted }: { action: string; deleted: boolean }) {
  const map: Record<string, { Icon: React.ElementType; bg: string; color: string }> = {
    CREATED:    { Icon: Plus,        bg: 'bg-green-100',  color: 'text-green-600'  },
    EDITED:     { Icon: Pencil,      bg: 'bg-blue-100',   color: 'text-blue-600'   },
    PAID:       { Icon: CheckCircle, bg: 'bg-green-100',  color: 'text-green-600'  },
    CANCELLED:  { Icon: XCircle,     bg: 'bg-red-100',    color: 'text-red-500'    },
    DELETED:    { Icon: Trash2,      bg: 'bg-red-100',    color: 'text-red-500'    },
    RECONCILED: { Icon: RefreshCcw,  bg: 'bg-violet-100', color: 'text-violet-600' },
  }
  const entry = map[action] ?? { Icon: Plus, bg: 'bg-gray-100', color: 'text-gray-500' }
  const { Icon, bg, color } = entry
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 ${bg} ${deleted ? 'opacity-50' : ''}`}>
      <Icon size={11} className={color} />
    </span>
  )
}

// ─── ActivitiesCard (paginado) ────────────────────────────────────────────────

const ACT_PER_PAGE = 7

function ActivitiesCard({ activities, loading }: { activities: Transaction[]; loading: boolean }) {
  const [page, setPage] = useState(1)
  const total    = activities.length
  const pages    = Math.max(1, Math.ceil(total / ACT_PER_PAGE))
  const safePage = Math.min(page, pages)
  const slice    = activities.slice((safePage - 1) * ACT_PER_PAGE, safePage * ACT_PER_PAGE)

  return (
    <Panel className="flex flex-col">
      <PanelHeader title="Atividades recentes"
        actions={<button className="text-xs text-[#F5A623] hover:underline font-medium">Ver todas</button>} />
      {loading ? <SkeletonRows n={7} /> : (
        <>
          <div className="px-5 pb-0 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-2 text-left text-[11px] font-semibold text-gray-400 uppercase whitespace-nowrap">Data/Hora</th>
                  <th className="pb-2 text-left text-[11px] font-semibold text-gray-400 uppercase hidden sm:table-cell whitespace-nowrap">Usuário</th>
                  <th className="pb-2 text-left text-[11px] font-semibold text-gray-400 uppercase">Descrição</th>
                  <th className="pb-2 text-left text-[11px] font-semibold text-gray-400 uppercase hidden lg:table-cell whitespace-nowrap">Módulo</th>
                  <th className="pb-2 text-right text-[11px] font-semibold text-gray-400 uppercase whitespace-nowrap">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {slice.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-xs text-gray-400">Nenhuma atividade no período.</td></tr>
                ) : slice.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                    {/* Data e hora */}
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <p className="text-xs text-gray-700 font-mono leading-tight">
                        {a.date.slice(5).split('-').reverse().join('/')}
                      </p>
                      <p className="text-[10px] text-gray-400 font-mono leading-tight">{a.time}</p>
                    </td>
                    {/* Avatar + nome do usuário */}
                    <td className="py-2.5 pr-3 hidden sm:table-cell">
                      {a.createdBy ? (
                        <div className="flex items-center gap-1.5">
                          <UserAvatar name={a.createdBy.name} avatarUrl={a.createdBy.avatarUrl} size="xs" />
                          <span className="text-[11px] text-gray-500 truncate max-w-[80px]">{a.createdBy.name.split(' ')[0]}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-400">—</span>
                      )}
                    </td>
                    {/* Ícone + descrição */}
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-1.5">
                        <ActionIcon action={a.action} deleted={a.deleted} />
                        <span className={`text-xs line-clamp-1 ${a.deleted ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                          {a.description}
                        </span>
                      </div>
                    </td>
                    {/* Módulo */}
                    <td className="py-2.5 pr-3 hidden lg:table-cell">
                      <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full whitespace-nowrap">{a.module}</span>
                    </td>
                    {/* Valor */}
                    <td className={`py-2.5 text-right text-xs font-semibold tabular-nums whitespace-nowrap ${
                      a.type === 'entrada' ? 'text-green-600' : 'text-red-500'}`}>
                      {a.type === 'entrada' ? '+' : '-'}{fmt(a.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > ACT_PER_PAGE && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 mt-1">
              <p className="text-xs text-gray-400">{(safePage-1)*ACT_PER_PAGE+1}–{Math.min(safePage*ACT_PER_PAGE, total)} de {total}</p>
              <div className="flex gap-1">
                <button disabled={safePage<=1} onClick={()=>setPage(p=>p-1)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronLeft size={14} />
                </button>
                {Array.from({length:pages},(_,i)=>i+1).map((n)=>(
                  <button key={n} onClick={()=>setPage(n)}
                    className={`w-6 h-6 rounded-lg text-xs font-medium transition-colors ${n===safePage?'bg-[#F5A623] text-white':'text-gray-500 hover:bg-gray-100'}`}>
                    {n}
                  </button>
                ))}
                <button disabled={safePage>=pages} onClick={()=>setPage(p=>p+1)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}

// ─── AlertsCard ───────────────────────────────────────────────────────────────

function AlertsCard({
  budgetAlertCount, delayAlertCount, overduePayable, overdueReceivable,
}: {
  budgetAlertCount: number
  delayAlertCount:  number
  overduePayable:   { count: number; amount: number }
  overdueReceivable:{ count: number; amount: number }
}) {
  const items: { icon: React.ElementType; title: string; desc: string; action: string; href?: string; scheme: { bg:string; border:string; icon:string; text:string } }[] = []

  if (overduePayable.count > 0) items.push({
    icon: AlertTriangle,
    title: `${overduePayable.count} conta${overduePayable.count !== 1 ? 's' : ''} a pagar vencida${overduePayable.count !== 1 ? 's' : ''}`,
    desc:  `Total de ${fmt(overduePayable.amount)} em atraso`,
    action: 'Ver contas →', href: '/app/financeiro/contas-pagar',
    scheme: { bg:'bg-red-50', border:'border-red-200', icon:'text-red-500', text:'text-red-700' },
  })

  if (overdueReceivable.count > 0) items.push({
    icon: AlertTriangle,
    title: `${overdueReceivable.count} recebimento${overdueReceivable.count !== 1 ? 's' : ''} em atraso`,
    desc:  `Total de ${fmt(overdueReceivable.amount)} a receber`,
    action: 'Ver contas →', href: '/app/financeiro/contas-receber',
    scheme: { bg:'bg-amber-50', border:'border-amber-200', icon:'text-amber-500', text:'text-amber-700' },
  })

  if (budgetAlertCount > 0) items.push({
    icon: AlertCircle,
    title: `${budgetAlertCount} obra${budgetAlertCount !== 1 ? 's' : ''} com orçamento estourado`,
    desc:  'Desvio superior a 5% do orçamento previsto',
    action: 'Ver obras →', href: '/app/centro-de-custo',
    scheme: { bg:'bg-orange-50', border:'border-orange-200', icon:'text-orange-500', text:'text-orange-700' },
  })

  if (delayAlertCount > 0) items.push({
    icon: AlertTriangle,
    title: `${delayAlertCount} obra${delayAlertCount !== 1 ? 's' : ''} com prazo vencido`,
    desc:  'Data prevista de conclusão ultrapassada',
    action: 'Ver obras →', href: '/app/centro-de-custo',
    scheme: { bg:'bg-red-50', border:'border-red-200', icon:'text-red-500', text:'text-red-700' },
  })

  if (items.length === 0) items.push({
    icon: Bell,
    title: 'Tudo em dia!',
    desc:  'Nenhum alerta crítico no momento.',
    action: '',
    scheme: { bg:'bg-green-50', border:'border-green-200', icon:'text-green-500', text:'text-green-700' },
  })

  return (
    <Panel className="flex flex-col h-full">
      <PanelHeader title="Lembretes e alertas" />
      <div className="px-5 pb-5 flex-1 flex flex-col gap-2.5">
        {items.map((a, i) => (
          <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${a.scheme.bg} ${a.scheme.border}`}>
            <a.icon size={15} className={`flex-shrink-0 mt-0.5 ${a.scheme.icon}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold ${a.scheme.text}`}>{a.title}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">{a.desc}</p>
              {a.action && a.href && (
                <Link href={a.href} className={`text-[11px] font-medium mt-1 hover:underline ${a.scheme.text}`}>{a.action}</Link>
              )}
            </div>
          </div>
        ))}
        <button className="text-xs text-center text-gray-400 hover:text-[#F5A623] font-medium transition-colors mt-auto pt-1">
          Ver todos os alertas →
        </button>
      </div>
    </Panel>
  )
}

// ─── DonutCard ────────────────────────────────────────────────────────────────

function DonutCard({ categories, loading }: { categories: ExpenseCategory[]; loading: boolean }) {
  const total = categories.reduce((s, c) => s + c.amount, 0)
  return (
    <Panel className="flex flex-col">
      <PanelHeader title="Despesas por categoria" />
      {loading ? (
        <div className="px-4 pb-4 animate-pulse">
          <div className="h-[150px] bg-gray-100 rounded-xl mb-3" />
          <SkeletonRows n={4} />
        </div>
      ) : (
        <div className="px-4 pb-4">
          <div className="relative">
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={categories} innerRadius={46} outerRadius={66} paddingAngle={3}
                  dataKey="value" startAngle={90} endAngle={-270}>
                  {categories.map((c, i) => <Cell key={i} fill={c.color} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${v}%`, '']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[11px] text-gray-400 font-medium">Total</span>
              <span className="text-sm font-bold text-gray-800">{fmtK(total)}</span>
            </div>
          </div>
          {categories.length === 0 ? (
            <p className="text-xs text-center text-gray-400 mt-2">Sem despesas no período.</p>
          ) : (
            <div className="space-y-2 mt-1">
              {categories.map((c) => (
                <div key={c.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                    <span className="text-xs text-gray-600">{c.name}</span>
                  </div>
                  <span className="text-xs font-semibold text-gray-800">{c.value}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { filters, setFilter, resetFilters, activeCount, isPeriodoAlterado } = useFilterState()
  const { data, loading, error, refetch } = useDashboardData(filters)
  const bankAccounts  = useBankAccounts()
  const projects      = useProjects()
  const { alerts: projectAlerts } = useProjectAlerts()

  // Estado do accordion de filtros (mobile)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Estados de modal
  const [zoomCashflow, setZoomCashflow]   = useState(false)
  const [zoomBalance,  setZoomBalance]    = useState(false)

  // Projeto/etapa selecionados — para exibir o banner
  const selectedProject: ProjectOption | undefined = projects.find(p => p.id === filters.centroCusto)
  const selectedStageLabel = selectedProject?.stages.find(s => s.id === filters.etapa)?.name
  const availableStages    = selectedProject?.stages ?? []

  // Refs para exportação
  const cashflowRef = useRef<HTMLDivElement>(null)
  const balanceRef  = useRef<HTMLDivElement>(null)

  const cashflow:           CashflowPoint[]  = data?.cashflow           ?? []
  const balanceEvolution:   BalancePoint[]   = data?.balanceEvolution   ?? []
  const expenseCategories:  ExpenseCategory[]= data?.expenseCategories  ?? []
  const topObras                             = data?.topObras           ?? []
  const activities:         Transaction[]    = data?.activities         ?? []
  const accountsPayable:    BillGroup[]      = data?.accountsPayable    ?? []
  const accountsReceivable: BillGroup[]      = data?.accountsReceivable ?? []
  const metrics                              = data?.metrics

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfAny = cashflow  as Record<string, any>[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const beAny = balanceEvolution as Record<string, any>[]

  // Tooltips com variação vs mês anterior
  const cashflowTooltip = makeChartTooltip(cfAny, {
    dataKeys:  ['entradas', 'saidas', 'saldo'],
    keyLabels: { entradas: 'Entradas', saidas: 'Saídas', saldo: 'Saldo' },
    keyColors: { entradas: '#22C55E', saidas: '#F97316', saldo: '#3B82F6' },
  })
  const balanceTooltip = makeChartTooltip(beAny, {
    dataKeys:  ['saldo'],
    keyLabels: { saldo: 'Saldo acumulado' },
    keyColors: { saldo: '#3B82F6' },
  })

  // Exportações cashflow
  const cashflowCols = [
    { key: 'fullLabel', label: 'Mês'      },
    { key: 'entradas',  label: 'Entradas', fmt: (v: unknown) => fmt(Number(v)) },
    { key: 'saidas',    label: 'Saídas',   fmt: (v: unknown) => fmt(Number(v)) },
    { key: 'saldo',     label: 'Saldo',    fmt: (v: unknown) => fmt(Number(v)) },
  ]
  const cashflowExport = useChartExport(cashflowRef, 'fluxo-de-caixa', cfAny, cashflowCols)

  // Exportações saldo
  const balanceCols = [
    { key: 'fullLabel', label: 'Mês'              },
    { key: 'saldo',     label: 'Saldo Acumulado', fmt: (v: unknown) => fmt(Number(v)) },
  ]
  const balanceExport = useChartExport(balanceRef, 'evolucao-saldo', beAny, balanceCols)

  const SELECT_CLS = (active: boolean) =>
    `text-sm border rounded-lg px-3 py-2 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#F5A623] transition-colors ${
      active ? 'border-[#F5A623]' : 'border-gray-200'
    }`

  // Gráfico de cashflow reutilizável (usado tanto na página quanto no modal)
  function CashflowChart({ height }: { height: number }) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={cashflow} barSize={10} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis dataKey="axisLabel" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={52} />
          <Tooltip content={cashflowTooltip} />
          <Bar dataKey="entradas" name="Entradas" fill="#22C55E" radius={[4,4,0,0]} />
          <Bar dataKey="saidas"   name="Saídas"   fill="#F97316" radius={[4,4,0,0]} />
          <Line type="monotone" dataKey="saldo" name="Saldo" stroke="#3B82F6" strokeWidth={2.5}
            dot={{ r:3, fill:'#3B82F6', strokeWidth:0 }} activeDot={{ r:5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    )
  }

  // Gráfico de saldo reutilizável
  function BalanceChart({ height }: { height: number }) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={balanceEvolution}>
          <defs>
            <linearGradient id="gradSaldo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis dataKey="axisLabel" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={52} />
          <Tooltip content={balanceTooltip} />
          <Area type="monotone" dataKey="saldo" name="Saldo acumulado" stroke="#3B82F6" strokeWidth={2.5}
            fill="url(#gradSaldo)" dot={{ r:3.5, fill:'#3B82F6', strokeWidth:0 }} activeDot={{ r:5.5 }} />
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  return (
    <div className="space-y-5">

      {/* ── Header + Filtros ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Visão geral financeira e operacional</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão accordion mobile */}
          <button
            onClick={() => setFiltersOpen(v => !v)}
            className={`sm:hidden flex items-center gap-1.5 text-xs font-semibold border px-3 py-2 rounded-lg transition-colors ${filtersOpen ? 'bg-[#F5A623] text-white border-[#F5A623]' : 'bg-white text-gray-600 border-gray-200'}`}
          >
            <SlidersHorizontal size={13} />
            Filtros {activeCount > 0 && `(${activeCount})`}
          </button>

          {activeCount > 0 && (
            <button onClick={resetFilters}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#F5A623] px-3 py-1.5 rounded-full hover:bg-[#d4891a] transition-colors">
              {activeCount} {activeCount === 1 ? 'filtro ativo' : 'filtros ativos'}
              <X size={12} />
            </button>
          )}

          <button onClick={refetch} title="Atualizar dados"
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors ml-auto sm:ml-0">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Painel de filtros (desktop sempre visível; mobile accordion) ─── */}
      <div className={`flex-wrap items-center gap-2 ${filtersOpen ? 'flex' : 'hidden sm:flex'}`}>
        {/* Conta bancária */}
        <select value={filters.contaBancaria} onChange={(e) => setFilter('contaBancaria', e.target.value)}
          className={SELECT_CLS(!!filters.contaBancaria)}>
          <option value="">Todas as contas</option>
          {bankAccounts.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        {/* Centro de Custo */}
        <select
          value={filters.centroCusto}
          onChange={(e) => { setFilter('centroCusto', e.target.value); setFilter('etapa', '') }}
          className={SELECT_CLS(!!filters.centroCusto)}
        >
          <option value="">Todos os centros de custo</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code ? `${p.code} — ${p.name}` : p.name}
            </option>
          ))}
        </select>

        {/* Etapa (dependente do CC) */}
        <select
          value={filters.etapa}
          onChange={(e) => setFilter('etapa', e.target.value)}
          disabled={!filters.centroCusto}
          className={`${SELECT_CLS(!!filters.etapa)} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <option value="">{filters.centroCusto ? 'Todas as etapas' : 'Selecione uma obra primeiro'}</option>
          {availableStages.map((s) => (
            <option key={s.id} value={s.id}>
              {String(s.order + 1).padStart(2, '0')} — {s.name}
            </option>
          ))}
        </select>

        {/* Período */}
        <div className="flex items-center gap-1.5">
          <input type="date" value={filters.periodoInicio}
            onChange={(e) => setFilter('periodoInicio', e.target.value)}
            className={SELECT_CLS(isPeriodoAlterado)} />
          <span className="text-gray-400 text-sm">–</span>
          <input type="date" value={filters.periodoFim}
            onChange={(e) => setFilter('periodoFim', e.target.value)}
            className={SELECT_CLS(isPeriodoAlterado)} />
        </div>
      </div>

      {/* ── Banner de contexto CC/Etapa ─────────────────────────────────── */}
      {filters.centroCusto && selectedProject && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
          <HardHat size={15} className="text-blue-500 flex-shrink-0" />
          <p className="text-sm text-blue-700 flex-1 font-medium">
            Visualizando:{' '}
            <span className="font-semibold">{selectedProject.name}</span>
            {selectedProject.code && <span className="text-blue-500 font-normal"> ({selectedProject.code})</span>}
            {selectedStageLabel && (
              <> <span className="text-blue-400 mx-1">—</span> <span className="font-semibold">{selectedStageLabel}</span></>
            )}
          </p>
          <button
            onClick={() => { setFilter('centroCusto', ''); setFilter('etapa', '') }}
            className="text-blue-400 hover:text-blue-600 p-1 rounded-lg hover:bg-blue-100 transition-colors flex-shrink-0"
            title="Limpar filtro de obra"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Banner de erro ────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">Não foi possível carregar os dados</p>
            <p className="text-xs text-red-500 mt-0.5">Verifique sua conexão ou se a API está em execução.</p>
          </div>
          <button onClick={refetch}
            className="flex items-center gap-1.5 text-xs font-semibold text-red-700 border border-red-300 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors">
            <RefreshCw size={12} /> Tentar novamente
          </button>
        </div>
      )}

      {/* ── Linha 1: 4 métricas ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard loading={loading} title="Entradas"             value={metrics?.totalEntradas ?? 0} label="Recebido no período"
          trendUp trendPct={`${metrics?.entradasDelta ?? 0}%`} icon={TrendingUp}   iconCls="text-green-600"  iconBgCls="bg-green-100" />
        <MetricCard loading={loading} title="Saídas"               value={metrics?.totalSaidas ?? 0}   label="Pago no período"
          trendUp={false} trendPct={`${metrics?.saidasDelta ?? 0}%`} icon={TrendingDown} iconCls="text-orange-500" iconBgCls="bg-orange-100" />
        <MetricCard loading={loading} title="Saldo do Período"     value={metrics?.saldo ?? 0}         label="Resultado líquido"
          trendUp={(metrics?.saldo ?? 0) >= 0} icon={Scale}      iconCls="text-blue-600"  iconBgCls="bg-blue-100" />
        <MetricCard loading={loading} title="Saldo das Contas"      value={metrics?.previsto ?? 0}      label="Saldo consolidado das contas"
          icon={Wallet} iconCls="text-amber-600" iconBgCls="bg-amber-100" />
      </div>

      {/* ── Linha 2: Fluxo (50%) + Categorias (25%) + AP (25%) ──────── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">

        {/* Fluxo de caixa */}
        <Panel className="xl:col-span-2 flex flex-col">
          <PanelHeader title="Fluxo de caixa mensal" actions={
            <>
              <ZoomBtn onClick={() => setZoomCashflow(true)} />
              <ChartDropdown
                onZoom={() => setZoomCashflow(true)}
                onExportPng={cashflowExport.exportPng}
                onExportSvg={cashflowExport.exportSvg}
                onExportCsv={cashflowExport.exportCsv}
              />
            </>
          } />
          <div className="flex items-center gap-4 px-5 pb-1">
            <LegendDot color="#22C55E" label="Entradas" />
            <LegendDot color="#F97316" label="Saídas" />
            <LegendDot color="#3B82F6" label="Saldo" />
          </div>
          {loading ? <SkeletonChart /> : (
            <div ref={cashflowRef} className="px-4 pb-4">
              <CashflowChart height={230} />
            </div>
          )}
        </Panel>

        <DonutCard categories={expenseCategories} loading={loading} />
        <AccountsCard title="Contas a pagar" items={accountsPayable} loading={loading} />
      </div>

      {/* ── Linha 3: Evolução (50%) + TOP Obras (25%) + AR (25%) ─────── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">

        {/* Evolução do saldo */}
        <Panel className="xl:col-span-2 flex flex-col">
          <PanelHeader title="Evolução do saldo acumulado" actions={
            <>
              <ZoomBtn onClick={() => setZoomBalance(true)} />
              <ChartDropdown
                onZoom={() => setZoomBalance(true)}
                onExportPng={balanceExport.exportPng}
                onExportSvg={balanceExport.exportSvg}
                onExportCsv={balanceExport.exportCsv}
              />
            </>
          } />
          <div className="flex items-center gap-4 px-5 pb-1">
            <LegendDot color="#3B82F6" label="Saldo acumulado" />
          </div>
          {loading ? <SkeletonChart /> : (
            <div ref={balanceRef} className="px-4 pb-4">
              <BalanceChart height={230} />
            </div>
          )}
        </Panel>

        {/* TOP Obras */}
        <Panel className="flex flex-col">
          <PanelHeader title="Despesas por obra (Top 7)" />
          {loading ? <SkeletonChart height={230} /> : (
            <div className="px-4 pb-4">
              {topObras.length === 0 ? (
                <div className="flex items-center justify-center h-[230px] text-xs text-gray-400">Sem despesas no período.</div>
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={topObras} layout="vertical" barSize={10} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false}
                      width={90} tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 13) + '…' : v} />
                    <Tooltip
                      formatter={(v) => [fmt(v as number), 'Despesas']}
                      contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0,0,0,.07)' }}
                    />
                    <Bar dataKey="valor" name="Despesas" fill="#F5A623" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </Panel>

        <AccountsCard title="Contas a receber" items={accountsReceivable} loading={loading} />
      </div>

      {/* ── Linha 4: Atividades (60%) + Alertas (40%) ─────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-3"><ActivitiesCard activities={activities} loading={loading} /></div>
        <div className="xl:col-span-2">
          <AlertsCard
            budgetAlertCount={projectAlerts.budgetAlertCount}
            delayAlertCount={projectAlerts.delayAlertCount}
            overduePayable={{ count: accountsPayable[0]?.count ?? 0, amount: accountsPayable[0]?.valor ?? 0 }}
            overdueReceivable={{ count: accountsReceivable[0]?.count ?? 0, amount: accountsReceivable[0]?.valor ?? 0 }}
          />
        </div>
      </div>

      {/* ── Linha 5: Histórico de auditoria ─────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <ActivityFeed
          limit={15}
          showHeader
          title="Histórico de atividades"
        />
      </div>

      {/* ── Modais fullscreen ─────────────────────────────────────────── */}
      <ChartModal
        open={zoomCashflow}
        onClose={() => setZoomCashflow(false)}
        title="Fluxo de caixa mensal"
        chartNode={(h) => (
          <div>
            <div className="flex items-center gap-4 mb-3">
              <LegendDot color="#22C55E" label="Entradas" />
              <LegendDot color="#F97316" label="Saídas" />
              <LegendDot color="#3B82F6" label="Saldo" />
            </div>
            <CashflowChart height={h} />
          </div>
        )}
        tableData={cfAny}
        tableColumns={cashflowCols}
      />

      <ChartModal
        open={zoomBalance}
        onClose={() => setZoomBalance(false)}
        title="Evolução do saldo acumulado"
        chartNode={(h) => (
          <div>
            <div className="flex items-center gap-4 mb-3">
              <LegendDot color="#3B82F6" label="Saldo acumulado" />
            </div>
            <BalanceChart height={h} />
          </div>
        )}
        tableData={beAny}
        tableColumns={balanceCols}
      />

    </div>
  )
}
