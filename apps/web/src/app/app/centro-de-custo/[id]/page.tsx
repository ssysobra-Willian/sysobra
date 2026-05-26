'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Edit2, MoreHorizontal, HardHat, TrendingUp, TrendingDown,
  DollarSign, AlertTriangle, Calendar, MapPin, User, CheckCircle2,
  Circle, Clock, Banknote, ShoppingCart, FileText, BarChart3,
  ExternalLink, RefreshCw, ClipboardList, ChevronDown, ChevronRight,
  Layers, Plus,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { formatCurrency } from '@/lib/format'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { TableActionMenu } from '@/components/ui/TableActionMenu'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface StageTx {
  id: string; description: string; type: string; isPaid: boolean
  netAmount: number; referenceDate: string | null; dueDate: string | null
  category: { name: string; color: string | null; icon: string | null } | null
}

interface Stage {
  id: string
  code: string | null
  name: string
  order: number
  status: string
  progressPercent: number
  budgetMaterial: number
  budgetLabor: number
  budgetTotal: number
  realizedValue: number
  // computed by backend
  realizedFromAllocations: number
  balance: number
  deviationPercent: number
  isOverBudget: boolean
  recentTransactions: StageTx[]
  startDate: string | null
  endDate: string | null
}

interface FinTx {
  id: string
  description: string
  type: string
  isPaid: boolean
  netAmount: number
  referenceDate: string
  category: { name: string; color: string | null } | null
  bankAccount: { name: string } | null
  createdBy: { name: string; avatarUrl: string | null } | null
}

interface Project {
  id: string
  code: string | null
  name: string
  description: string | null
  address: string | null
  city: string | null
  state: string | null
  zipCode: string | null
  status: string
  coverImage: string | null
  progressPercent: number
  budgetAlert: boolean
  delayAlert: boolean
  globalBudget: number | null
  totalBudget: number
  totalRealized: number
  deviationAmount: number
  deviation: number
  isOverBudget: boolean
  isDelayed: boolean
  warrantyMonths: number
  cno: string | null
  artExecution: string | null
  artProjects: string | null
  technicalName: string | null
  technicalTitle: string | null
  technicalCrea: string | null
  startDate: string | null
  expectedEndDate: string | null
  actualEndDate: string | null
  createdAt: string
  updatedAt: string
  client: { id: string; name: string; email: string | null; phone: string | null } | null
  responsible: { id: string; name: string; avatarUrl: string | null } | null
  stages: Stage[]
  financialTransactions: FinTx[]
  _count: { financialTransactions: number; purchaseMaps: number; documents: number }
}

interface FinancialSummary {
  summary: { totalBudgeted: number; totalRealized: number; totalIncome: number; balance: number; deviation: number; transactionCount: number }
  byCategory: { name: string; color: string | null; value: number }[]
  monthly: { month: string; previsto: number; realizado: number }[]
  stages: { id: string; name: string; budgetTotal: number; realizedValue: number }[]
  lastTransactions: FinTx[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativa', IN_PROGRESS: 'Em andamento', PLANNING: 'Planejamento',
  PAUSED: 'Pausada', ON_HOLD: 'Em espera', COMPLETED: 'Concluída', CANCELLED: 'Cancelada',
}
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-blue-100 text-blue-700', IN_PROGRESS: 'bg-amber-100 text-amber-700',
  PLANNING: 'bg-gray-100 text-gray-600', PAUSED: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-600',
}
const STAGE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente', IN_PROGRESS: 'Em andamento', COMPLETED: 'Concluída', CANCELLED: 'Cancelada',
}

function formatDateBR(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function formatMonthLabel(ym: string) {
  const [y, m] = ym.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(m) - 1]}/${y.slice(2)}`
}

const DONUT_COLORS = ['#F5A623', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#F97316', '#06B6D4']

function budgetBadgeInfo(proj: Project) {
  if (proj.isOverBudget) return { label: 'Acima do orçamento', cls: 'bg-red-100 text-red-700' }
  if (proj.budgetAlert || proj.delayAlert) return { label: 'Atenção', cls: 'bg-yellow-100 text-yellow-700' }
  return { label: 'Dentro do orçamento', cls: 'bg-green-100 text-green-700' }
}

// ─── Tabela Orçado x Realizado ────────────────────────────────────────────────

function deviationCls(d: number) {
  if (d > 5)  return 'text-red-600'
  if (d > 0)  return 'text-amber-600'
  return 'text-green-600'
}
function deviationBg(d: number) {
  if (d > 5)  return 'bg-red-100 text-red-700'
  if (d > 0)  return 'bg-amber-100 text-amber-700'
  return 'bg-green-100 text-green-700'
}
function progressBarBudget(pct: number, d: number) {
  if (d > 5)  return 'bg-red-400'
  if (d > 0)  return 'bg-amber-400'
  return 'bg-green-400'
}

const STAGE_STATUS_BADGE: Record<string, string> = {
  PENDING:     'bg-gray-100 text-gray-500',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED:   'bg-green-100 text-green-700',
  CANCELLED:   'bg-red-100 text-red-600',
}

function BudgetTable({
  stages,
  projectId,
  onUpdateProgress,
}: {
  stages: Stage[]
  projectId: string
  onUpdateProgress: (stage: Stage) => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const fmt = formatCurrency

  const totalBudgetMat = stages.reduce((a, s) => a + s.budgetMaterial, 0)
  const totalBudgetLab = stages.reduce((a, s) => a + s.budgetLabor, 0)
  const totalBudget    = stages.reduce((a, s) => a + s.budgetTotal, 0)
  const totalRealized  = stages.reduce((a, s) => a + (s.realizedFromAllocations ?? s.realizedValue), 0)
  const totalBalance   = totalBudget - totalRealized
  const totalDeviation = totalBudget > 0 ? ((totalRealized - totalBudget) / totalBudget) * 100 : 0
  const avgProgress    = stages.length > 0
    ? stages.reduce((a, s) => a + s.progressPercent, 0) / stages.length
    : 0

  if (stages.length === 0) {
    return (
      <div className="text-center py-10">
        <Layers size={32} className="text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-400">Nenhuma etapa cadastrada</p>
      </div>
    )
  }

  return (
    <div>
      {/* Cards resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Total orçado</p>
          <p className="text-xl font-bold text-blue-600 mt-1">{fmt(totalBudget)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Orçamento total da obra</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Total realizado</p>
          <p className="text-xl font-bold text-gray-800 mt-1">{fmt(totalRealized)}</p>
          <div className="mt-1.5 w-full bg-gray-100 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full ${progressBarBudget(0, totalDeviation)}`}
              style={{ width: `${Math.min(100, totalBudget > 0 ? (totalRealized / totalBudget) * 100 : 0)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {totalBudget > 0 ? ((totalRealized / totalBudget) * 100).toFixed(1) : '0'}% do orçamento consumido
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Saldo disponível</p>
          <p className={`text-xl font-bold mt-1 ${totalBalance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {fmt(Math.abs(totalBalance))}
          </p>
          <p className={`text-xs mt-0.5 ${totalBalance < 0 ? 'text-red-500' : 'text-gray-400'}`}>
            {totalBalance < 0 ? 'Saldo negativo' : 'Disponível no orçamento'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Desvio geral</p>
          <p className={`text-xl font-bold mt-1 ${deviationCls(totalDeviation)}`}>
            {totalDeviation > 0 ? '+' : ''}{totalDeviation.toFixed(1)}%
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {totalDeviation > 5 ? '⚠ Acima do orçamento' : totalDeviation > 0 ? '⚡ Atenção ao desvio' : '✅ Dentro do orçamento'}
          </p>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap">Etapa</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap hidden md:table-cell">Orç. Material</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap hidden md:table-cell">Orç. MO</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap">Orç. Total</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap">Realizado</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap hidden lg:table-cell">Saldo</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap hidden lg:table-cell">Desvio</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap">Progresso</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap hidden xl:table-cell">Status</th>
                <th className="px-2 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stages.map((stage) => {
                const realized = stage.realizedFromAllocations ?? stage.realizedValue
                const balance  = stage.balance ?? (stage.budgetTotal - realized)
                const dev      = stage.deviationPercent ?? (stage.budgetTotal > 0 ? ((realized - stage.budgetTotal) / stage.budgetTotal) * 100 : 0)
                const isExp    = expanded[stage.id]
                const stBadge  = STAGE_STATUS_BADGE[stage.status] ?? 'bg-gray-100 text-gray-500'
                return (
                  <>
                    <tr
                      key={stage.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => setExpanded(e => ({ ...e, [stage.id]: !e[stage.id] }))}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isExp ? <ChevronDown size={13} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={13} className="text-gray-400 flex-shrink-0" />}
                          <span className="font-medium text-gray-800 text-sm">{stage.name}</span>
                          {stage.code && <span className="text-[10px] text-gray-400 font-mono hidden sm:inline">{stage.code}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-600 hidden md:table-cell">{fmt(stage.budgetMaterial)}</td>
                      <td className="px-4 py-3 text-right text-xs text-gray-600 hidden md:table-cell">{fmt(stage.budgetLabor)}</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-gray-800">{fmt(stage.budgetTotal)}</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-gray-800">{fmt(realized)}</td>
                      <td className={`px-4 py-3 text-right text-xs font-semibold hidden lg:table-cell ${balance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {balance < 0 ? '-' : ''}{fmt(Math.abs(balance))}
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        {stage.budgetTotal > 0 ? (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${deviationBg(dev)}`}>
                            {dev > 0 ? '+' : ''}{dev.toFixed(1)}%
                          </span>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-center gap-1 min-w-[70px]">
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${progressBarBudget(stage.progressPercent, dev)}`}
                              style={{ width: `${Math.min(100, stage.progressPercent)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-500">{stage.progressPercent.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center hidden xl:table-cell">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${stBadge}`}>
                          {STAGE_STATUS_LABELS[stage.status] ?? stage.status}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <button
                          title="Atualizar progresso"
                          onClick={(e) => { e.stopPropagation(); onUpdateProgress(stage) }}
                          className="text-gray-300 hover:text-[#F5A623] transition-colors"
                        >
                          <Edit2 size={13} />
                        </button>
                      </td>
                    </tr>

                    {/* Linha expandida */}
                    {isExp && (
                      <tr key={`${stage.id}-exp`} className="bg-amber-50/40">
                        <td colSpan={10} className="px-6 py-3">
                          {stage.recentTransactions && stage.recentTransactions.length > 0 ? (
                            <div>
                              <p className="text-[11px] font-semibold text-gray-500 uppercase mb-2">Últimos lançamentos desta etapa</p>
                              <table className="w-full">
                                <thead>
                                  <tr className="text-[10px] text-gray-400 uppercase">
                                    <th className="text-left pb-1 font-semibold">Descrição</th>
                                    <th className="text-left pb-1 font-semibold hidden sm:table-cell">Categoria</th>
                                    <th className="text-right pb-1 font-semibold">Valor</th>
                                    <th className="text-center pb-1 font-semibold">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-amber-100">
                                  {stage.recentTransactions.map(tx => (
                                    <tr key={tx.id}>
                                      <td className="py-1.5 pr-3 text-xs text-gray-700">{tx.description}</td>
                                      <td className="py-1.5 pr-3 text-xs text-gray-500 hidden sm:table-cell">
                                        {tx.category?.name ?? '—'}
                                      </td>
                                      <td className={`py-1.5 text-xs font-semibold text-right ${tx.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}`}>
                                        {tx.type === 'INCOME' ? '+' : '-'}{fmt(tx.netAmount)}
                                      </td>
                                      <td className="py-1.5 text-center">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${tx.isPaid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                          {tx.isPaid ? 'Pago' : 'Pendente'}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div className="flex items-center justify-between mt-2">
                                <a
                                  href={`/app/financeiro?projectId=${projectId}&stageId=${stage.id}`}
                                  className="text-[11px] text-[#F5A623] hover:underline font-medium"
                                >
                                  Ver todos os lançamentos desta etapa →
                                </a>
                                <button
                                  onClick={() => onUpdateProgress(stage)}
                                  className="text-[11px] font-semibold text-gray-600 border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-white flex items-center gap-1"
                                >
                                  <Edit2 size={10} /> Atualizar progresso
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-gray-400 italic">Nenhum lançamento vinculado a esta etapa via rateio.</p>
                              <button
                                onClick={() => onUpdateProgress(stage)}
                                className="text-[11px] font-semibold text-gray-600 border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-white flex items-center gap-1"
                              >
                                <Edit2 size={10} /> Atualizar progresso
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>

            {/* Linha de totais */}
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td className="px-4 py-3 font-bold text-sm text-gray-800">TOTAL</td>
                <td className="px-4 py-3 text-right text-xs font-bold text-gray-700 hidden md:table-cell">{fmt(totalBudgetMat)}</td>
                <td className="px-4 py-3 text-right text-xs font-bold text-gray-700 hidden md:table-cell">{fmt(totalBudgetLab)}</td>
                <td className="px-4 py-3 text-right text-xs font-bold text-gray-800">{fmt(totalBudget)}</td>
                <td className="px-4 py-3 text-right text-xs font-bold text-gray-800">{fmt(totalRealized)}</td>
                <td className={`px-4 py-3 text-right text-xs font-bold hidden lg:table-cell ${totalBalance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {totalBalance < 0 ? '-' : ''}{fmt(Math.abs(totalBalance))}
                </td>
                <td className="px-4 py-3 text-right hidden lg:table-cell">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${deviationBg(totalDeviation)}`}>
                    {totalDeviation > 0 ? '+' : ''}{totalDeviation.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-xs font-bold text-gray-700">{avgProgress.toFixed(0)}%</span>
                </td>
                <td className="hidden xl:table-cell" />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── StageIcon (mantido) ──────────────────────────────────────────────────────

function StageIcon({ status }: { status: string }) {
  if (status === 'COMPLETED')  return <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
  if (status === 'IN_PROGRESS')return <Clock size={14} className="text-amber-500 flex-shrink-0" />
  if (status === 'CANCELLED')  return <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
  return <Circle size={14} className="text-gray-300 flex-shrink-0" />
}

function progressBarColor(pct: number, status: string) {
  if (status === 'COMPLETED')  return 'bg-green-500'
  if (status === 'CANCELLED')  return 'bg-red-400'
  if (pct >= 80) return 'bg-green-400'
  if (pct >= 40) return 'bg-amber-400'
  return 'bg-blue-400'
}

// ─── Abas ─────────────────────────────────────────────────────────────────────

const TABS = ['Resumo', 'Apropriações', 'Compras', 'Medições', 'Documentos'] as const
type Tab = typeof TABS[number]

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ObraDetailPage() {
  const router        = useRouter()
  const params        = useParams()
  const id            = params.id as string

  const [project,   setProject]   = useState<Project | null>(null)
  const [financial, setFinancial] = useState<FinancialSummary | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState<Tab>('Resumo')
  const [showProgressModal, setShowProgressModal] = useState(false)
  const [progressStage, setProgressStage] = useState<Stage | null>(null)
  const [progressVal,   setProgressVal]   = useState('')
  const [realizedVal,   setRealizedVal]   = useState('')
  const [savingProgress, setSavingProgress] = useState(false)

  const loadProject = useCallback(async () => {
    setLoading(true)
    try {
      const token     = localStorage.getItem('token') || ''
      const companyId = localStorage.getItem('companyId') || ''

      const [projRes, finRes] = await Promise.all([
        fetch(`${API}/api/v1/projects/${id}`, {
          headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId },
        }),
        fetch(`${API}/api/v1/projects/${id}/financial`, {
          headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId },
        }),
      ])

      if (!projRes.ok) { router.push('/app/centro-de-custo'); return }

      const projData = await projRes.json()
      setProject(projData.project)

      if (finRes.ok) {
        const finData = await finRes.json()
        setFinancial(finData)
      }
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { loadProject() }, [loadProject])

  const handleProgressSave = async () => {
    if (!progressStage) return
    setSavingProgress(true)
    try {
      const token     = localStorage.getItem('token') || ''
      const companyId = localStorage.getItem('companyId') || ''
      await fetch(`${API}/api/v1/projects/${id}/stages/${progressStage.id}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-company-id': companyId },
        body: JSON.stringify({
          progressPercent: parseFloat(progressVal) || 0,
          realizedValue:   parseFloat(realizedVal)  || undefined,
          status: parseFloat(progressVal) >= 100 ? 'COMPLETED' : parseFloat(progressVal) > 0 ? 'IN_PROGRESS' : 'PENDING',
        }),
      })
      setShowProgressModal(false)
      setProgressStage(null)
      loadProject()
    } finally {
      setSavingProgress(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 rounded-full border-2 border-[#F5A623] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!project) return null

  const badge = budgetBadgeInfo(project)
  const saldo = (project.totalBudget || project.globalBudget || 0) - project.totalRealized

  // Resumo financeiro do painel direito
  const fin = financial?.summary

  return (
    <div className="space-y-5">
      {/* ── Breadcrumb + Header ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/app/centro-de-custo" className="hover:text-gray-900 flex items-center gap-1">
            <ChevronLeft size={14} /> Centro de Custo
          </Link>
          <span>/</span>
          <span className="text-gray-400">Todas as obras</span>
          <span>/</span>
          <span className="text-gray-900 font-medium truncate max-w-[200px]">{project.name}</span>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
              {project.code && <span className="text-sm text-gray-400 font-mono">{project.code}</span>}
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_COLORS[project.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {STATUS_LABELS[project.status] ?? project.status}
              </span>
            </div>
            {project.address && (
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                <MapPin size={13} /> {project.address}{project.city ? `, ${project.city}` : ''}{project.state ? `/${project.state}` : ''}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(`/app/centro-de-custo/${id}/placa`)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <FileText size={15} /> Placa de obra
            </button>
            <Link
              href={`/app/financeiro?projectId=${id}`}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ExternalLink size={15} /> Ver no financeiro
            </Link>
            <Link
              href={`/app/centro-de-custo/${id}/editar`}
              className="flex items-center gap-2 bg-[#F5A623] hover:bg-[#e09610] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Edit2 size={15} /> Editar obra
            </Link>
          </div>
        </div>
      </div>

      {/* ── Layout 2 colunas ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Coluna principal (2/3) ─────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">
          {/* ── Bloco identificação ───────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Capa */}
            <div className="h-40 bg-gradient-to-br from-gray-800 to-gray-600 relative">
              {project.coverImage ? (
                <img src={project.coverImage} alt={project.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <HardHat size={48} className="text-white/20" />
                </div>
              )}
              <span className={`absolute bottom-3 left-4 text-xs font-semibold px-3 py-1 rounded-full ${badge.cls}`}>
                {badge.label}
              </span>
            </div>

            <div className="p-4 space-y-4">
              {/* Barra de progresso */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-600">Progresso físico</span>
                  <span className="text-sm font-bold text-gray-900">{project.progressPercent.toFixed(1)}%</span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${project.deviation > 5 ? 'bg-red-500' : project.deviation > 0 ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(100, project.progressPercent)}%` }}
                  />
                </div>
              </div>

              {/* Infos */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {project.client && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Cliente</p>
                    <p className="text-sm font-medium text-gray-800">{project.client.name}</p>
                  </div>
                )}
                {project.responsible && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Responsável</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <UserAvatar name={project.responsible.name} avatarUrl={project.responsible.avatarUrl} size="xs" />
                      <span className="text-sm font-medium text-gray-800">{project.responsible.name.split(' ')[0]}</span>
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Prazo</p>
                  <p className={`text-sm font-medium ${project.isDelayed ? 'text-red-600' : 'text-gray-800'}`}>
                    {formatDateBR(project.expectedEndDate)}
                    {project.isDelayed && ' ⚠'}
                  </p>
                </div>
                {project.cno && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">CNO</p>
                    <p className="text-sm font-medium text-gray-800 font-mono">{project.cno}</p>
                  </div>
                )}
                {project.warrantyMonths > 0 && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Garantia</p>
                    <p className="text-sm font-medium text-gray-800">{project.warrantyMonths} meses</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Cards de métricas (6) ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: 'Orçado total', value: project.totalBudget || project.globalBudget, icon: DollarSign, color: 'text-blue-500', bg: 'bg-blue-50' },
              { label: 'Realizado',    value: project.totalRealized,                        icon: TrendingUp,  color: 'text-green-500', bg: 'bg-green-50' },
              { label: 'Saldo disponível', value: saldo,                                    icon: Banknote,    color: saldo < 0 ? 'text-red-500' : 'text-emerald-500', bg: saldo < 0 ? 'bg-red-50' : 'bg-emerald-50' },
              { label: 'Desvio %',   value: null, extra: `${project.deviation > 0 ? '+' : ''}${project.deviation.toFixed(1)}%`, icon: BarChart3, color: project.deviation > 5 ? 'text-red-500' : project.deviation > 0 ? 'text-yellow-500' : 'text-green-500', bg: project.deviation > 5 ? 'bg-red-50' : 'bg-yellow-50' },
              { label: 'Transações', value: null, extra: String(fin?.transactionCount ?? project._count.financialTransactions), icon: ClipboardList, color: 'text-purple-500', bg: 'bg-purple-50' },
              { label: 'Compras',    value: null, extra: String(project._count.purchaseMaps), icon: ShoppingCart, color: 'text-orange-500', bg: 'bg-orange-50' },
            ].map(({ label, value, extra, icon: Icon, color, bg }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${bg}`}>
                    <Icon size={14} className={color} />
                  </div>
                  <span className="text-[11px] text-gray-500">{label}</span>
                </div>
                <p className={`text-lg font-bold ${color}`}>
                  {value !== null && value !== undefined ? formatCurrency(value) : extra ?? '—'}
                </p>
              </div>
            ))}
          </div>

          {/* ── Gráfico evolução financeira ────────────────────────────────── */}
          {financial && financial.monthly.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Evolução financeira acumulada</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={financial.monthly}>
                  <defs>
                    <linearGradient id="gradPrev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#F5A623" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#F5A623" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradReal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10B981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tickFormatter={formatMonthLabel} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v) => formatCurrency(Number(v))}
                    labelFormatter={(label) => formatMonthLabel(String(label))}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="previsto"  name="Previsto"  stroke="#F5A623" strokeDasharray="5 3" fill="url(#gradPrev)" strokeWidth={2} />
                  <Area type="monotone" dataKey="realizado" name="Realizado" stroke="#10B981" fill="url(#gradReal)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Abas na parte inferior ────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-gray-100 overflow-x-auto">
              {TABS.map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                    tab === t ? 'border-[#F5A623] text-[#F5A623]' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Conteúdo da aba */}
            <div className="p-4">
              {tab === 'Resumo' && (
                <div className="space-y-3">
                  {project.financialTransactions.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">Nenhuma movimentação registrada</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50">
                            {['Data', 'Descrição', 'Categoria', 'Conta', 'Valor', 'Status'].map(h => (
                              <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {project.financialTransactions.map(tx => (
                            <tr key={tx.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-xs text-gray-500">{formatDateBR(tx.referenceDate)}</td>
                              <td className="px-3 py-2 text-xs text-gray-900 max-w-[200px] truncate">{tx.description}</td>
                              <td className="px-3 py-2">
                                {tx.category ? (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: `${tx.category.color ?? '#e5e7eb'}20`, color: tx.category.color ?? '#6b7280' }}>
                                    {tx.category.name}
                                  </span>
                                ) : <span className="text-xs text-gray-400">—</span>}
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-500">{tx.bankAccount?.name ?? '—'}</td>
                              <td className={`px-3 py-2 text-xs font-semibold ${tx.type === 'INCOME' ? 'text-green-600' : 'text-gray-900'}`}>
                                {tx.type === 'EXPENSE' ? '-' : '+'}{formatCurrency(tx.netAmount)}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${tx.isPaid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                  {tx.isPaid ? 'Pago' : 'Pendente'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {tab === 'Apropriações' && (
                <div className="py-6 text-center">
                  <ClipboardList size={32} className="text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-400 mb-3">Lançamentos financeiros vinculados a esta obra</p>
                  <Link href={`/app/financeiro?projectId=${id}`} className="text-sm text-[#F5A623] hover:text-[#e09610] flex items-center gap-1 justify-center">
                    Ver no módulo Financeiro <ExternalLink size={12} />
                  </Link>
                </div>
              )}

              {(tab === 'Compras' || tab === 'Medições' || tab === 'Documentos') && (
                <div className="py-8 text-center">
                  <p className="text-sm text-gray-400">Em desenvolvimento</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Coluna direita (1/3) ────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Alertas */}
          {(project.budgetAlert || project.delayAlert) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-500" />
                <h4 className="text-sm font-semibold text-amber-800">Alertas e pendências</h4>
              </div>
              {project.budgetAlert && (
                <p className="text-xs text-amber-700">⚠ Desvio orçamentário acima de 5%</p>
              )}
              {project.delayAlert && (
                <p className="text-xs text-amber-700">⚠ Obra atrasada em relação ao prazo previsto</p>
              )}
            </div>
          )}

          {/* Gráfico por etapa (donut) */}
          {financial && financial.stages.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Custos por etapa</h4>
              <div className="flex flex-col items-center">
                <PieChart width={160} height={160}>
                  <Pie
                    data={financial.stages.filter(s => s.budgetTotal > 0)}
                    cx={80} cy={80}
                    innerRadius={45} outerRadius={70}
                    dataKey="budgetTotal"
                    paddingAngle={2}
                  >
                    {financial.stages.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
                <div className="w-full space-y-1.5 mt-2">
                  {financial.stages.filter(s => s.budgetTotal > 0).map((s, i) => {
                    const totalBudget = financial.stages.reduce((a, x) => a + x.budgetTotal, 0)
                    const pct = totalBudget > 0 ? (s.budgetTotal / totalBudget * 100).toFixed(0) : '0'
                    return (
                      <div key={s.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                          <span className="text-gray-600 truncate max-w-[100px]" title={s.name}>{s.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-gray-400">{pct}%</span>
                          <span className="font-medium text-gray-800 text-[10px]">{formatCurrency(s.budgetTotal)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Etapas — compacto (visão rápida) */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">Etapas ({project.stages.length})</h4>
              <button onClick={loadProject} className="text-gray-400 hover:text-gray-600">
                <RefreshCw size={13} />
              </button>
            </div>
            {project.stages.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Nenhuma etapa cadastrada</p>
            ) : (
              <div className="space-y-2">
                {project.stages.map(stage => (
                  <div key={stage.id} className="flex items-center gap-2">
                    <StageIcon status={stage.status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium text-gray-700 truncate">{stage.name}</span>
                        <span className="text-[10px] text-gray-500 flex-shrink-0 ml-2">{stage.progressPercent.toFixed(0)}%</span>
                      </div>
                      <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${progressBarColor(stage.progressPercent, stage.status)}`}
                          style={{ width: `${Math.min(100, stage.progressPercent)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-gray-400 text-center mt-3">↓ Ver tabela completa abaixo</p>
          </div>

          {/* RT (Responsável Técnico) */}
          {(project.technicalName || project.artExecution || project.artProjects) && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Dados técnicos</h4>
              {project.technicalName && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Responsável técnico</p>
                  <p className="text-sm font-medium text-gray-800">{project.technicalName}</p>
                  {project.technicalTitle && <p className="text-xs text-gray-500">{project.technicalTitle}</p>}
                  {project.technicalCrea && <p className="text-xs text-gray-500 font-mono">{project.technicalCrea}</p>}
                </div>
              )}
              {project.artExecution && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">ART Execução</p>
                  <p className="text-sm font-medium text-gray-800 font-mono">{project.artExecution}</p>
                </div>
              )}
              {project.artProjects && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">ART Projetos</p>
                  <p className="text-sm font-medium text-gray-800 font-mono">{project.artProjects}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabela Orçado x Realizado (full-width) ────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Layers size={16} className="text-[#F5A623]" />
            Orçado × Realizado por etapa
          </h2>
          <Link
            href={`/app/financeiro?projectId=${id}`}
            className="text-xs text-[#F5A623] hover:underline font-medium flex items-center gap-1"
          >
            Ver todos os lançamentos <ExternalLink size={11} />
          </Link>
        </div>
        <BudgetTable
          stages={project.stages}
          projectId={id}
          onUpdateProgress={(stage) => {
            setProgressStage(stage)
            setProgressVal(String(stage.progressPercent))
            setRealizedVal(String(stage.realizedFromAllocations ?? stage.realizedValue))
            setShowProgressModal(true)
          }}
        />
      </div>

      {/* ── Modal de progresso ──────────────────────────────────────────────── */}
      {showProgressModal && progressStage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Atualizar progresso</h3>
            <p className="text-sm text-gray-500">{progressStage.name}</p>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Progresso físico (%)</label>
              <input
                type="number" min={0} max={100}
                value={progressVal}
                onChange={e => setProgressVal(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#F5A623]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Valor realizado (R$)</label>
              <input
                type="number" min={0}
                value={realizedVal}
                onChange={e => setRealizedVal(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#F5A623]"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button onClick={() => setShowProgressModal(false)} className="flex-1 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={handleProgressSave} disabled={savingProgress} className="flex-1 py-2 text-sm font-medium bg-[#F5A623] text-white rounded-lg hover:bg-[#e09610] disabled:opacity-50">
                {savingProgress ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
