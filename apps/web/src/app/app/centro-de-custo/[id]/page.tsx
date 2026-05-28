'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Edit2, MoreHorizontal, HardHat, TrendingUp, TrendingDown,
  DollarSign, AlertTriangle, Calendar, MapPin, User, CheckCircle2,
  Circle, Clock, Banknote, ShoppingCart, FileText, BarChart3,
  ExternalLink, RefreshCw, ClipboardList, ChevronDown, ChevronRight,
  Layers, Plus, Users, ArrowRightLeft, History, Upload, FolderOpen,
  Download, Eye, Trash2, Box, Loader2,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart, Bar, Line,
} from 'recharts'
import { formatCurrency } from '@/lib/format'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { TableActionMenu } from '@/components/ui/TableActionMenu'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { StageFormModal, type ProjectStage as StagePayload } from '../components/StageFormModal'
import { toImageUrl }  from '@/lib/imageUrl'
import { ActivityFeed } from '@/components/ui/ActivityFeed'
import Pagination from '@/components/ui/Pagination'
import { usePagination } from '@/hooks/usePagination'
import dynamic from 'next/dynamic'

const PastaDeProjetosTab = dynamic(
  () => import('@/components/project/PastaDeProjetosTab').then(m => m.PastaDeProjetosTab),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 border-2 border-[#F5A623] animate-spin text-[#F5A623]" />
      </div>
    ),
  },
)

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

interface TeamMember {
  id: string; name: string; code: string; role: string | null; type: string; status: string
  photo: string | null; admissionDate: string | null; lastTransferDate: string | null
}

interface PastTeamEntry {
  id: string; startDate: string; endDate: string | null; reason: string | null
  employee: { id: string; name: string; code: string; role: string | null; photo: string | null }
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
  diaryEntries: ProjectDiaryEntry[]
  _count: { financialTransactions: number; purchaseMaps: number; documents: number; diaryEntries: number }
  currentTeam?: TeamMember[]
  pastTeam?: PastTeamEntry[]
  laborCosts?: {
    total: number
    entries: { id: string; description: string; totalCost: number; date: string }[]
  }
}

interface FinancialSummary {
  summary: { totalBudgeted: number; totalRealized: number; totalIncome: number; balance: number; deviation: number; transactionCount: number }
  byCategory: { name: string; color: string | null; value: number }[]
  monthly: { month: string; previsto: number; realizado: number }[]
  stages: { id: string; name: string; budgetTotal: number; realizedValue: number }[]
  lastTransactions: FinTx[]
}

interface RainRecord {
  id:               string
  date:             string
  morningMm:        number
  afternoonMm:      number
  nightMm:          number
  totalMm:          number
  isUnworkable:     boolean
  unworkableReason: string | null
}

interface AllocTx {
  id:              string
  description:     string
  type:            string
  isPaid:          boolean
  isPayroll?:      boolean
  netAmount:       number
  referenceDate:   string | null
  dueDate:         string | null
  category:        { id: string; name: string; color: string | null } | null
  bankAccount:     { id: string; name: string } | null
  costCenterAllocations: {
    project: { id: string; name: string } | null
    stage:   { id: string; name: string } | null
    amount:  number
  }[]
}

interface AllocSummary {
  totalReceitas: number
  totalDespesas: number
  totalPago:     number
  totalPendente: number
  countTotal:    number
  countPago:     number
  countPendente: number
  countVencido:  number
}

interface ProjectDiaryEntry {
  id:           string
  reportNumber: string | null
  date:         string
  status:       string
  author:       { id: string; name: string }
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

// ─── TeamTab ──────────────────────────────────────────────────────────────────

function TeamTab({
  projectId, currentTeam, pastTeam,
}: {
  projectId:   string
  currentTeam: TeamMember[]
  pastTeam:    PastTeamEntry[]
}) {
  const [showPast, setShowPast] = useState(false)

  const fmtDate = (d: string | null | undefined) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('pt-BR')
  }

  const typeLabel: Record<string, string> = {
    CLT: 'CLT', PJ: 'PJ', TEMPORARY: 'Temporário', INTERN: 'Estagiário', THIRD_PARTY: 'Terceirizado',
  }

  const statusColor: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700',
    AWAY:   'bg-amber-100 text-amber-700',
    DISMISSED: 'bg-red-100 text-red-700',
  }
  const statusLabel: Record<string, string> = {
    ACTIVE: 'Ativo', AWAY: 'Afastado', DISMISSED: 'Desligado',
  }

  return (
    <div className="py-4 space-y-6">
      {/* Equipe atual */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Users size={15} className="text-[#F5A623]" />
          <h3 className="text-sm font-semibold text-gray-700">
            Equipe atual ({currentTeam.length})
          </h3>
          <Link href="/app/colaboradores" className="ml-auto text-xs text-[#F5A623] hover:underline">
            Gerenciar colaboradores →
          </Link>
        </div>

        {currentTeam.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            <Users size={28} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Nenhum colaborador alocado nesta obra</p>
            <p className="text-xs text-gray-400 mt-1">
              Transfira colaboradores via módulo de Colaboradores
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {currentTeam.map(m => (
              <Link
                key={m.id}
                href={`/app/colaboradores/${m.id}`}
                className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-orange-200 hover:shadow-sm transition-all group"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
                  {m.photo
                    ? <img src={`${API}${m.photo.startsWith('/') ? '' : '/'}${m.photo}`} alt={m.name} className="w-full h-full object-cover" />
                    : <User size={18} className="text-gray-300" />
                  }
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-[#F5A623]">{m.name}</p>
                  <p className="text-xs text-gray-400 truncate">{m.role ?? 'Sem função'}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${statusColor[m.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {statusLabel[m.status] ?? m.status}
                    </span>
                    <span className="text-[9px] text-gray-400">{typeLabel[m.type] ?? m.type}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Histórico de equipe */}
      {pastTeam.length > 0 && (
        <div>
          <button
            onClick={() => setShowPast(s => !s)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 mb-3"
          >
            <History size={14} className="text-gray-400" />
            Histórico de alocações ({pastTeam.length})
            {showPast ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>

          {showPast && (
            <div className="space-y-2">
              {pastTeam.map(h => (
                <div key={h.id} className="flex items-center gap-3 py-2.5 px-3 bg-gray-50 rounded-xl border border-gray-100">
                  <ArrowRightLeft size={13} className="text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">
                      {h.employee?.name ?? '—'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {h.employee?.role ?? 'Sem função'} · {fmtDate(h.startDate)} → {fmtDate(h.endDate ?? undefined)}
                    </p>
                    {h.reason && (
                      <p className="text-xs text-gray-400 italic mt-0.5">"{h.reason}"</p>
                    )}
                  </div>
                  <Link href={`/app/colaboradores/${h.employee?.id}`}
                    className="text-xs text-[#F5A623] hover:underline flex-shrink-0">
                    Ver
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function progressBarColor(pct: number, status: string) {
  if (status === 'COMPLETED')  return 'bg-green-500'
  if (status === 'CANCELLED')  return 'bg-red-400'
  if (pct >= 80) return 'bg-green-400'
  if (pct >= 40) return 'bg-amber-400'
  return 'bg-blue-400'
}

// ─── Abas ─────────────────────────────────────────────────────────────────────

const TABS = ['Resumo', 'Apropriações', 'Pluviometria', 'Compras', 'Medições', 'Equipe', 'Documentos', 'Pasta de Projetos', 'Histórico'] as const
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
  const [rainRecords, setRainRecords] = useState<RainRecord[]>([])
  const [rainPeriod,  setRainPeriod]  = useState<30 | 60 | 90>(60)
  const [rainLoading, setRainLoading] = useState(false)

  // ── Gerenciamento de etapas ───────────────────────────────────────────────
  const [stageModal, setStageModal]      = useState(false)
  const [editingStage, setEditingStage]  = useState<StagePayload | null>(null)

  // ── Pasta de Projetos ────────────────────────────────────────────────────
  const [projectFiles,     setProjectFiles]     = useState<any>({ pdfs: [], dwgs: [], ifcs: [], others: [] })
  const [filesLoading,     setFilesLoading]     = useState(false)
  const [ifcViewerUrl,     setIfcViewerUrl]     = useState<string | null>(null)
  const [pdfViewerUrl,     setPdfViewerUrl]     = useState<string | null>(null)
  const [uploadingFile,    setUploadingFile]    = useState(false)

  // ── Aba Apropriações ──────────────────────────────────────────────────────
  const [allocTxs,      setAllocTxs]      = useState<AllocTx[]>([])
  const [allocTotal,    setAllocTotal]     = useState(0)
  const [allocPage,     setAllocPage]      = useState(1)
  const [allocLoading,  setAllocLoading]   = useState(false)
  const [allocSummary,  setAllocSummary]   = useState<AllocSummary | null>(null)
  const [allocTypeFilter,   setAllocTypeFilter]   = useState('ALL')
  const [allocStatusFilter, setAllocStatusFilter] = useState('ALL')
  const [allocSearch,       setAllocSearch]       = useState('')
  const [allocPeriod,       setAllocPeriod]       = useState('ALL')
  const [allocLimit,        setAllocLimit]        = useState(10)

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

  // Carrega lançamentos + summary da aba Apropriações
  useEffect(() => {
    if (tab !== 'Apropriações') return
    const token     = localStorage.getItem('token') || ''
    const companyId = localStorage.getItem('companyId') || ''
    if (!token || !id) return

    // Summary (totais corretos usando allocatedValue) — carrega uma vez por projeto
    if (!allocSummary) {
      fetch(`${API}/api/financial/transactions/summary?projectId=${id}`, {
        headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId },
      })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) setAllocSummary(d) })
        .catch(() => {/* silencioso */})
    }

    setAllocLoading(true)
    const qs = new URLSearchParams({ projectId: id, page: String(allocPage), limit: String(allocLimit) })
    if (allocTypeFilter !== 'ALL')   qs.set('type',   allocTypeFilter)
    if (allocStatusFilter === 'PAID')    qs.set('isPaid', 'true')
    if (allocStatusFilter === 'PENDING') qs.set('isPaid', 'false')
    if (allocSearch.trim())              qs.set('search', allocSearch.trim())
    if (allocPeriod === 'THIS_MONTH') {
      const now = new Date()
      qs.set('startDate', new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10))
      qs.set('endDate',   now.toISOString().slice(0, 10))
    } else if (allocPeriod === 'THIS_YEAR') {
      qs.set('startDate', `${new Date().getFullYear()}-01-01`)
      qs.set('endDate',   new Date().toISOString().slice(0, 10))
    }

    fetch(`${API}/api/financial/transactions?${qs}`, {
      headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId },
    })
      .then((r) => r.json())
      .then((d) => { setAllocTxs(d.transactions ?? []); setAllocTotal(d.total ?? 0) })
      .catch(() => { setAllocTxs([]); setAllocTotal(0) })
      .finally(() => setAllocLoading(false))
  }, [tab, id, allocPage, allocLimit, allocTypeFilter, allocStatusFilter, allocSearch, allocPeriod, allocSummary])

  // Carrega pasta de projetos quando a aba for aberta
  useEffect(() => {
    if (tab !== 'Pasta de Projetos') return
    const token     = localStorage.getItem('token') || ''
    const companyId = localStorage.getItem('companyId') || ''
    if (!token || !id) return
    setFilesLoading(true)
    fetch(`${API}/api/v1/projects/${id}/files`, {
      headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId },
    })
      .then(r => r.json())
      .then(d => setProjectFiles(d))
      .catch(() => {})
      .finally(() => setFilesLoading(false))
  }, [tab, id])

  // Carrega dados pluviométricos quando a aba for aberta
  useEffect(() => {
    if (tab !== 'Pluviometria') return
    const token     = localStorage.getItem('token') || ''
    const companyId = localStorage.getItem('companyId') || ''
    if (!token || !id) return
    setRainLoading(true)
    const end   = new Date()
    const start = new Date()
    start.setDate(start.getDate() - rainPeriod)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    fetch(`${API}/api/v1/diary/projects/${id}/rain?startDate=${fmt(start)}&endDate=${fmt(end)}&limit=${rainPeriod}`, {
      headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId },
    })
      .then((r) => r.json())
      .then((d) => setRainRecords(d.records ?? []))
      .catch(() => setRainRecords([]))
      .finally(() => setRainLoading(false))
  }, [tab, id, rainPeriod])

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

  // ── Hooks de paginação (devem vir antes de qualquer return condicional) ──────
  const resumoPagination = usePagination({
    items:        project?.financialTransactions ?? [],
    itemsPerPage: 10,
  })

  const unworkableDays = rainRecords
    .filter(r => r.isUnworkable)
    .sort((a, b) => b.date.localeCompare(a.date))
  const rainUnworkablePage = usePagination({ items: unworkableDays, itemsPerPage: 10 })

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
      <Breadcrumb items={[
        { label: 'Centro de Custo', href: '/app/centro-de-custo' },
        { label: 'Todas as obras',  href: '/app/centro-de-custo' },
        { label: project.name },
      ]} className="mb-1" />

      <div>

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
                <img
                  src={toImageUrl(project.coverImage)}
                  alt={project.name}
                  className="w-full h-full object-cover"
                />
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
                          {resumoPagination.currentItems.map(tx => (
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
                      <Pagination
                        currentPage={resumoPagination.currentPage}
                        totalPages={resumoPagination.totalPages}
                        totalItems={resumoPagination.totalItems}
                        itemsPerPage={resumoPagination.itemsPerPage}
                        onPageChange={resumoPagination.goToPage}
                        onPerPageChange={resumoPagination.setItemsPerPage}
                        perPageOptions={[5, 10, 25]}
                        label="movimentações"
                        compact
                      />
                    </div>
                  )}
                </div>
              )}

              {tab === 'Apropriações' && (
                <div className="space-y-4">
                  {/* Cards de resumo — usa totais do backend (allocatedValue correto) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
                      <p className="text-[10px] font-semibold text-green-500 uppercase tracking-wide mb-1">Receitas</p>
                      <p className="text-sm font-bold text-green-700">
                        {allocSummary ? formatCurrency(allocSummary.totalReceitas) : <span className="text-gray-300 animate-pulse">—</span>}
                      </p>
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                      <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1">Despesas</p>
                      <p className="text-sm font-bold text-red-700">
                        {allocSummary ? formatCurrency(allocSummary.totalDespesas) : <span className="text-gray-300 animate-pulse">—</span>}
                      </p>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                      <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-1">Pago</p>
                      <p className="text-sm font-bold text-blue-700">
                        {allocSummary ? formatCurrency(allocSummary.totalPago) : <span className="text-gray-300 animate-pulse">—</span>}
                      </p>
                    </div>
                    <div className={`rounded-xl p-3 text-center border ${allocSummary && allocSummary.countVencido > 0 ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
                      <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${allocSummary && allocSummary.countVencido > 0 ? 'text-red-500' : 'text-amber-500'}`}>
                        Pendente{allocSummary && allocSummary.countVencido > 0 ? ` · ${allocSummary.countVencido} venc.` : ''}
                      </p>
                      <p className={`text-sm font-bold ${allocSummary && allocSummary.countVencido > 0 ? 'text-red-700' : 'text-amber-700'}`}>
                        {allocSummary ? formatCurrency(allocSummary.totalPendente) : <span className="text-gray-300 animate-pulse">—</span>}
                      </p>
                    </div>
                  </div>

                  {/* Filtros */}
                  <div className="flex flex-wrap gap-2 items-center">
                    <select value={allocTypeFilter} onChange={e => { setAllocTypeFilter(e.target.value); setAllocPage(1) }}
                      className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#F5A623]">
                      <option value="ALL">Todos os tipos</option>
                      <option value="INCOME">Receitas</option>
                      <option value="EXPENSE">Despesas</option>
                    </select>
                    <select value={allocStatusFilter} onChange={e => { setAllocStatusFilter(e.target.value); setAllocPage(1) }}
                      className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#F5A623]">
                      <option value="ALL">Todos os status</option>
                      <option value="PAID">Pago</option>
                      <option value="PENDING">Pendente</option>
                    </select>
                    <select value={allocPeriod} onChange={e => { setAllocPeriod(e.target.value); setAllocPage(1) }}
                      className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#F5A623]">
                      <option value="ALL">Todos os períodos</option>
                      <option value="THIS_MONTH">Este mês</option>
                      <option value="THIS_YEAR">Este ano</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Buscar descrição..."
                      value={allocSearch}
                      onChange={e => { setAllocSearch(e.target.value); setAllocPage(1) }}
                      className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs flex-1 min-w-[140px] focus:outline-none focus:ring-1 focus:ring-[#F5A623]"
                    />
                    <Link href={`/app/financeiro?projectId=${id}`}
                      className="text-xs text-[#F5A623] hover:text-[#d4891a] font-medium flex items-center gap-1 flex-shrink-0">
                      Ver no financeiro <ExternalLink size={11} />
                    </Link>
                  </div>

                  {/* Tabela / estados */}
                  {allocLoading ? (
                    <div className="flex justify-center py-10">
                      <div className="h-6 w-6 rounded-full border-2 border-[#F5A623] border-t-transparent animate-spin" />
                    </div>
                  ) : allocTxs.length === 0 ? (
                    <div className="text-center py-10">
                      <ClipboardList size={32} className="text-gray-300 mx-auto mb-3" />
                      <p className="text-sm text-gray-500 font-medium">Nenhuma apropriação encontrada</p>
                      <p className="text-xs text-gray-400 mt-1 mb-4">Lançamentos financeiros vinculados a esta obra aparecerão aqui</p>
                      <Link href={`/app/financeiro/lancamentos/novo?projectId=${id}`}
                        className="inline-block text-xs font-semibold py-1.5 px-3 bg-[#F5A623] text-white rounded-lg hover:bg-[#d4891a] transition-colors">
                        + Novo lançamento
                      </Link>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-xl border border-gray-100">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                              {['Data', 'Descrição', 'Categoria', 'Etapa', 'Valor', 'Status', 'Conta'].map(h => (
                                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {allocTxs.map(tx => {
                              const stage = tx.costCenterAllocations.find(a => a.stage)?.stage
                              const isOverdue = !tx.isPaid && tx.dueDate && new Date(tx.dueDate) < new Date()
                              return (
                                <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                                    {tx.referenceDate ? formatDateBR(tx.referenceDate) : '—'}
                                  </td>
                                  <td className="px-3 py-2.5 text-xs text-gray-900 max-w-[200px]">
                                    <p className="truncate font-medium">{tx.description}</p>
                                    {tx.isPayroll && (
                                      <span className="inline-block mt-0.5 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-semibold">
                                        Folha
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {tx.category ? (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                                        style={{ backgroundColor: `${tx.category.color ?? '#e5e7eb'}22`, color: tx.category.color ?? '#6b7280' }}>
                                        {tx.category.name}
                                      </span>
                                    ) : <span className="text-xs text-gray-400">—</span>}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {stage ? (
                                      <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap">{stage.name}</span>
                                    ) : <span className="text-xs text-gray-400">—</span>}
                                  </td>
                                  <td className={`px-3 py-2.5 text-xs font-semibold whitespace-nowrap ${tx.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                                    {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.netAmount)}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                      tx.isPaid      ? 'bg-green-100 text-green-700'  :
                                      isOverdue      ? 'bg-red-100 text-red-600'      :
                                      'bg-amber-100 text-amber-700'
                                    }`}>
                                      {tx.isPaid ? 'Pago' : isOverdue ? 'Vencido' : 'Pendente'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                                    {tx.bankAccount?.name ?? '—'}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Paginação */}
                      <Pagination
                        currentPage={allocPage}
                        totalPages={Math.max(1, Math.ceil(allocTotal / allocLimit))}
                        totalItems={allocTotal}
                        itemsPerPage={allocLimit}
                        onPageChange={setAllocPage}
                        onPerPageChange={n => { setAllocLimit(n); setAllocPage(1) }}
                        perPageOptions={[10, 25, 50]}
                        label="lançamentos"
                      />
                    </>
                  )}
                </div>
              )}

              {tab === 'Pluviometria' && (
                <div className="space-y-5">
                  {/* Filtro de período */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      🌧 Pluviometria
                    </h3>
                    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                      {([30, 60, 90] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => setRainPeriod(p)}
                          className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                            rainPeriod === p ? 'bg-white shadow text-[#F5A623]' : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          {p} dias
                        </button>
                      ))}
                    </div>
                  </div>

                  {rainLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="h-8 w-8 rounded-full border-2 border-[#F5A623] border-t-transparent animate-spin" />
                    </div>
                  ) : rainRecords.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-3xl mb-3">🌤</p>
                      <p className="text-sm text-gray-400">Nenhum registro pluviométrico nos últimos {rainPeriod} dias</p>
                      <p className="text-xs text-gray-300 mt-1">Os dados são gerados automaticamente a partir dos RDOs</p>
                    </div>
                  ) : (() => {
                    // Computa totais
                    const totalMm      = rainRecords.reduce((s, r) => s + r.totalMm, 0)
                    const rainyDays    = rainRecords.filter((r) => r.totalMm > 0).length
                    const unworkable   = rainRecords.filter((r) => r.isUnworkable).length
                    const maxDay       = rainRecords.reduce((m, r) => r.totalMm > m ? r.totalMm : m, 0)

                    // Prepara dados do gráfico (últimos N dias agrupados)
                    const chartData = [...rainRecords]
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((r) => ({
                        label:       new Date(r.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                        total:       r.totalMm,
                        manha:       r.morningMm,
                        tarde:       r.afternoonMm,
                        noite:       r.nightMm,
                        impraticavel: r.isUnworkable ? r.totalMm || 1 : null,
                      }))

                    return (
                      <>
                        {/* Cards de resumo */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                            <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-1">Total acumulado</p>
                            <p className="text-2xl font-bold text-blue-700">{totalMm.toFixed(0)}</p>
                            <p className="text-[10px] text-blue-400 font-medium">mm</p>
                          </div>
                          <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 text-center">
                            <p className="text-[10px] font-semibold text-sky-500 uppercase tracking-wide mb-1">Dias com chuva</p>
                            <p className="text-2xl font-bold text-sky-700">{rainyDays}</p>
                            <p className="text-[10px] text-sky-400 font-medium">de {rainRecords.length} dias</p>
                          </div>
                          <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                            <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1">Impraticáveis</p>
                            <p className="text-2xl font-bold text-red-700">{unworkable}</p>
                            <p className="text-[10px] text-red-400 font-medium">dias ⛔</p>
                          </div>
                          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
                            <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide mb-1">Maior registro</p>
                            <p className="text-2xl font-bold text-indigo-700">{maxDay.toFixed(0)}</p>
                            <p className="text-[10px] text-indigo-400 font-medium">mm/dia</p>
                          </div>
                        </div>

                        {/* Gráfico */}
                        <div className="bg-gray-50 rounded-xl border border-gray-100 p-3">
                          <p className="text-xs font-semibold text-gray-500 mb-3">Precipitação diária (mm)</p>
                          <ResponsiveContainer width="100%" height={220}>
                            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis
                                dataKey="label"
                                tick={{ fontSize: 10, fill: '#9ca3af' }}
                                tickLine={false}
                                interval={Math.floor(chartData.length / 8)}
                              />
                              <YAxis
                                tick={{ fontSize: 10, fill: '#9ca3af' }}
                                tickLine={false}
                                axisLine={false}
                                unit=" mm"
                              />
                              <Tooltip
                                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                                formatter={(value, name) => [
                                  `${Number(value).toFixed(1)} mm`,
                                  name === 'total' ? 'Total' :
                                  name === 'manha' ? 'Manhã' :
                                  name === 'tarde' ? 'Tarde' :
                                  name === 'noite' ? 'Noite' : String(name),
                                ]}
                              />
                              <Bar dataKey="manha"  stackId="a" fill="#93c5fd" name="manha"  maxBarSize={20} />
                              <Bar dataKey="tarde"  stackId="a" fill="#3b82f6" name="tarde"  maxBarSize={20} />
                              <Bar dataKey="noite"  stackId="a" fill="#1e40af" name="noite"  maxBarSize={20} radius={[2, 2, 0, 0]} />
                              <Line
                                type="monotone"
                                dataKey="impraticavel"
                                stroke="#ef4444"
                                strokeWidth={0}
                                dot={(props: any) => {
                                  if (!props.payload.impraticavel) return <g key={props.key} />
                                  return (
                                    <g key={props.key}>
                                      <circle cx={props.cx} cy={props.cy} r={5} fill="#ef4444" opacity={0.9} />
                                      <text x={props.cx} y={props.cy - 8} textAnchor="middle" fontSize={9} fill="#ef4444">⛔</text>
                                    </g>
                                  )
                                }}
                                name="Impraticável"
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                          {/* Legenda manual */}
                          <div className="flex items-center gap-4 justify-center mt-2">
                            <div className="flex items-center gap-1.5">
                              <div className="flex gap-0.5">
                                <div className="w-2.5 h-2.5 rounded-sm bg-[#93c5fd]" />
                                <div className="w-2.5 h-2.5 rounded-sm bg-[#3b82f6]" />
                                <div className="w-2.5 h-2.5 rounded-sm bg-[#1e40af]" />
                              </div>
                              <span className="text-[10px] text-gray-500">Manhã / Tarde / Noite</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-3 h-3 rounded-full bg-red-500" />
                              <span className="text-[10px] text-gray-500">Impraticável</span>
                            </div>
                          </div>
                        </div>

                        {/* Lista de dias impraticáveis (paginada) */}
                        {unworkable > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-red-600">
                                ⛔ Dias impraticáveis no período
                              </p>
                              <span className="text-[11px] font-semibold text-red-500 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
                                {unworkable} dia{unworkable !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              {rainUnworkablePage.currentItems.map((r) => (
                                <div key={r.id} className="flex items-center justify-between bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                  <div>
                                    <p className="text-xs font-semibold text-red-700">
                                      {new Date(r.date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' })}
                                    </p>
                                    {r.unworkableReason && (
                                      <p className="text-[10px] text-red-400 mt-0.5">{r.unworkableReason}</p>
                                    )}
                                  </div>
                                  <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                                    {r.totalMm.toFixed(0)} mm
                                  </span>
                                </div>
                              ))}
                            </div>
                            <Pagination
                              currentPage={rainUnworkablePage.currentPage}
                              totalPages={rainUnworkablePage.totalPages}
                              totalItems={rainUnworkablePage.totalItems}
                              itemsPerPage={rainUnworkablePage.itemsPerPage}
                              onPageChange={rainUnworkablePage.goToPage}
                              onPerPageChange={rainUnworkablePage.setItemsPerPage}
                              perPageOptions={[10, 20, 50]}
                              label="dias impraticáveis"
                              compact
                            />
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              )}

              {(tab === 'Compras' || tab === 'Medições' || tab === 'Documentos') && (
                <div className="py-8 text-center">
                  <p className="text-sm text-gray-400">Em desenvolvimento</p>
                </div>
              )}

              {/* ── Aba Pasta de Projetos ───────────────────────────────────── */}
              {tab === 'Pasta de Projetos' && (
                <PastaDeProjetosTab projectId={id} />
              )}

              {/* ── Aba Equipe ─────────────────────────────────────────────── */}
              {tab === 'Equipe' && (
                <TeamTab
                  projectId={id}
                  currentTeam={project?.currentTeam ?? []}
                  pastTeam={project?.pastTeam ?? []}
                />
              )}

              {tab === 'Histórico' && (
                <div className="py-4">
                  <ActivityFeed
                    projectId={id}
                    limit={10}
                    showHeader={false}
                    showPaging={true}
                    title="Histórico da obra"
                  />
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

          {/* Mão de obra lançada via folha */}
          {project.laborCosts && project.laborCosts.total > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-amber-600" />
                  <h4 className="text-sm font-semibold text-amber-800">Mão de obra (folha)</h4>
                </div>
                <span className="text-sm font-bold text-amber-700">
                  {formatCurrency(project.laborCosts.total)}
                </span>
              </div>
              {project.laborCosts.entries.slice(0, 4).map(c => (
                <div key={c.id} className="flex items-center justify-between text-xs text-amber-700 py-0.5 border-t border-amber-100 first:border-0">
                  <span className="truncate mr-2" title={c.description}>{c.description}</span>
                  <span className="flex-shrink-0 font-medium">{formatCurrency(c.totalCost)}</span>
                </div>
              ))}
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
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { setEditingStage(null); setStageModal(true) }}
                  className="flex items-center gap-1 text-xs text-[#F5A623] border border-[#F5A623]/40 rounded-lg px-2 py-1 hover:bg-orange-50 transition-colors"
                >
                  <Plus size={11} /> Adicionar
                </button>
                <button onClick={loadProject} className="text-gray-400 hover:text-gray-600 p-1">
                  <RefreshCw size={13} />
                </button>
              </div>
            </div>
            {project.stages.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Nenhuma etapa cadastrada</p>
            ) : (
              <div className="space-y-2">
                {project.stages.map(stage => {
                  const deviation    = stage.budgetTotal > 0 ? ((stage.realizedValue - stage.budgetTotal) / stage.budgetTotal) * 100 : 0
                  const isOverBudget = deviation > 5
                  return (
                    <div key={stage.id} className="group">
                      <div className="flex items-start gap-2">
                        <StageIcon status={stage.status} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-medium text-gray-700 truncate">{stage.name}</span>
                            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                              <span className="text-[10px] text-gray-500">{stage.progressPercent.toFixed(0)}%</span>
                              <TableActionMenu
                                actions={[
                                  {
                                    label: 'Editar etapa',
                                    icon: <Edit2 size={12} />,
                                    onClick: () => {
                                      setEditingStage({
                                        id:              stage.id,
                                        name:            stage.name,
                                        code:            stage.code ?? null,
                                        order:           stage.order ?? 0,
                                        status:          stage.status,
                                        budgetMaterial:  stage.budgetMaterial ?? 0,
                                        budgetLabor:     stage.budgetLabor ?? 0,
                                        budgetTotal:     stage.budgetTotal ?? 0,
                                        realizedValue:   stage.realizedValue ?? 0,
                                        progressPercent: stage.progressPercent ?? 0,
                                        startDate:       stage.startDate ?? null,
                                        endDate:         stage.endDate   ?? null,
                                      })
                                      setStageModal(true)
                                    },
                                  },
                                ]}
                              />
                            </div>
                          </div>
                          <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${progressBarColor(stage.progressPercent, stage.status)}`}
                              style={{ width: `${Math.min(100, stage.progressPercent)}%` }}
                            />
                          </div>
                          {/* Linha de valores */}
                          {stage.budgetTotal > 0 && (
                            <div className="flex items-center gap-2 mt-1 text-[10px]">
                              <span className="text-gray-400">Orç: {formatCurrency(stage.budgetTotal)}</span>
                              {stage.realizedValue > 0 && (
                                <>
                                  <span className="text-gray-300">·</span>
                                  <span className={isOverBudget ? 'text-red-500 font-semibold' : 'text-green-600'}>
                                    {isOverBudget ? '▲' : '▼'} {Math.abs(deviation).toFixed(1)}%
                                  </span>
                                </>
                              )}
                              {stage.startDate && (
                                <>
                                  <span className="text-gray-300">·</span>
                                  <span className="text-gray-400 hidden sm:inline">
                                    {new Date(stage.startDate).toLocaleDateString('pt-BR', { day:'2-digit',month:'2-digit' })}
                                    {stage.endDate ? ` → ${new Date(stage.endDate).toLocaleDateString('pt-BR', { day:'2-digit',month:'2-digit' })}` : ''}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <p className="text-[10px] text-gray-400 text-center mt-3">↓ Ver tabela completa abaixo</p>
          </div>

          {/* Diário de Obra */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-gray-700">📋 Diário de Obra</h4>
                {(project._count?.diaryEntries ?? 0) > 0 && (
                  <span className="text-[10px] font-bold bg-[#F5A623]/15 text-[#c57a00] px-1.5 py-0.5 rounded-full">
                    {project._count.diaryEntries} RDO{project._count.diaryEntries !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <Link
                href={`/app/diario/${id}`}
                className="text-[11px] text-[#F5A623] hover:text-[#d4891a] font-medium flex items-center gap-1"
              >
                Ver todos <ExternalLink size={10} />
              </Link>
            </div>

            {(project.diaryEntries?.length ?? 0) > 0 ? (
              <div className="space-y-1.5">
                {/* Lista dos últimos 3 RDOs */}
                {(project.diaryEntries ?? []).map((entry) => (
                  <Link
                    key={entry.id}
                    href={`/app/diario/${id}/${entry.id}`}
                    className="flex items-center gap-2.5 p-2 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-xs font-semibold text-gray-800 truncate">
                          {entry.reportNumber ?? 'RDO'}
                        </p>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                          entry.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                          entry.status === 'REJECTED' ? 'bg-red-100 text-red-700'    :
                          entry.status === 'DRAFT'    ? 'bg-gray-100 text-gray-500'  :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {entry.status === 'APPROVED' ? '✓ Aprovado'     :
                           entry.status === 'REJECTED' ? '✗ Devolvido'    :
                           entry.status === 'DRAFT'    ? 'Rascunho'       : 'Ag. aprovação'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-[10px] text-gray-400">
                          {new Date(entry.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                        <span className="text-[10px] text-gray-300">·</span>
                        <p className="text-[10px] text-gray-400 truncate">{entry.author.name}</p>
                      </div>
                    </div>
                    <ExternalLink size={10} className="text-gray-300 flex-shrink-0" />
                  </Link>
                ))}

                {/* Ações */}
                <div className="flex gap-2 pt-1.5">
                  <Link href={`/app/diario/${id}/novo`}
                    className="flex-1 text-center text-xs font-semibold py-1.5 px-3 bg-[#F5A623] text-white rounded-lg hover:bg-[#d4891a] transition-colors">
                    + Novo RDO
                  </Link>
                  <Link href={`/app/diario/${id}`}
                    className="text-xs font-medium py-1.5 px-3 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap">
                    Ver todos
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-2xl mb-2">📋</p>
                <p className="text-xs font-medium text-gray-500 mb-0.5">Nenhum RDO registrado</p>
                <p className="text-[10px] text-gray-400 mb-3">Comece criando o primeiro relatório diário</p>
                <Link href={`/app/diario/${id}/novo`}
                  className="inline-block text-xs font-semibold py-1.5 px-4 bg-[#F5A623] text-white rounded-lg hover:bg-[#d4891a] transition-colors">
                  + Criar primeiro RDO
                </Link>
              </div>
            )}
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

      {/* Modal de etapa */}
      <StageFormModal
        isOpen={stageModal}
        onClose={() => { setStageModal(false); setEditingStage(null) }}
        projectId={id}
        stage={editingStage ?? undefined}
        onSuccess={() => {
          setStageModal(false)
          setEditingStage(null)
          loadProject()
        }}
      />
    </div>
  )
}
