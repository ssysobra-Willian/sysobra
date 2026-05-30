'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus, Building2, AlertTriangle, TrendingUp, CheckCircle2,
  LayoutGrid, List, Search, ChevronRight, HardHat,
  Calendar, ArrowUpRight, PackageX,
} from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { toImageUrl }  from '@/lib/imageUrl'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ProjectStage {
  id: string
  name: string
  budgetTotal: number
  realizedValue: number
  progressPercent: number
}

interface Project {
  id: string
  code: string | null
  name: string
  address: string | null
  city: string | null
  state: string | null
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
  startDate: string | null
  expectedEndDate: string | null
  stages: ProjectStage[]
  client: { id: string; name: string } | null
  responsible: { id: string; name: string; avatarUrl: string | null } | null
  _count?: { financialTransactions: number }
  pendingCosts: number
}

interface Meta {
  totalActive: number
  totalAlert: number
  totalOverBudget: number
  totalWithinBudget: number
  totalPendingCosts: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  ACTIVE:      'Ativa',
  IN_PROGRESS: 'Em andamento',
  PLANNING:    'Planejamento',
  PAUSED:      'Pausada',
  ON_HOLD:     'Em espera',
  COMPLETED:   'Concluída',
  CANCELLED:   'Cancelada',
}
const STATUS_COLORS: Record<string, string> = {
  ACTIVE:      'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  PLANNING:    'bg-gray-100 text-gray-600',
  PAUSED:      'bg-orange-100 text-orange-700',
  ON_HOLD:     'bg-yellow-100 text-yellow-700',
  COMPLETED:   'bg-green-100 text-green-700',
  CANCELLED:   'bg-red-100 text-red-600',
}

function budgetBadge(proj: Project) {
  if (proj.isOverBudget) return { label: 'Acima do orçamento', className: 'bg-red-100 text-red-700' }
  if (proj.budgetAlert || proj.delayAlert) return { label: 'Atenção', className: 'bg-yellow-100 text-yellow-700' }
  return { label: 'Dentro do orçamento', className: 'bg-green-100 text-green-700' }
}

function progressColor(deviation: number) {
  if (deviation > 10) return 'bg-red-500'
  if (deviation > 5)  return 'bg-yellow-500'
  return 'bg-green-500'
}

function formatDateBR(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

// ─── Card de projeto ──────────────────────────────────────────────────────────

function ProjectCard({ proj }: { proj: Project }) {
  const badge = budgetBadge(proj)
  const pct   = Math.min(100, Math.max(0, proj.progressPercent))
  const saldo = proj.totalBudget - proj.totalRealized

  return (
    <Link
      href={`/app/centro-de-custo/${proj.id}`}
      className="block group"
    >
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-[#F5A623]/40 transition-all flex flex-col cursor-pointer">
        {/* Capa */}
        <div className="h-32 bg-gradient-to-br from-gray-800 to-gray-600 relative flex-shrink-0">
          {proj.coverImage ? (
            <img
              src={toImageUrl(proj.coverImage)}
              alt={proj.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <HardHat size={40} className="text-white/30" />
            </div>
          )}
          {/* Status */}
          <span className={`absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[proj.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABELS[proj.status] ?? proj.status}
          </span>
        </div>

        {/* Corpo */}
        <div className="p-4 flex flex-col flex-1 gap-3">
          {/* Nome + Código */}
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2 group-hover:text-[#F5A623] transition-colors">{proj.name}</h3>
              {proj.code && <span className="text-[10px] text-gray-400 whitespace-nowrap">{proj.code}</span>}
            </div>
            {proj.city && (
              <p className="text-[11px] text-gray-400 mt-0.5">{proj.city}{proj.state ? `, ${proj.state}` : ''}</p>
            )}
          </div>

          {/* Responsável */}
          {proj.responsible && (
            <div className="flex items-center gap-1.5">
              <UserAvatar name={proj.responsible.name} avatarUrl={proj.responsible.avatarUrl} size="xs" />
              <span className="text-xs text-gray-500">{proj.responsible.name.split(' ')[0]}</span>
            </div>
          )}

          {/* Badge orçamento */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>
              {badge.label}
            </span>
            {proj.pendingCosts > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                <PackageX size={10} />
                {proj.pendingCosts} custo{proj.pendingCosts > 1 ? 's' : ''} p/ apropriar
              </span>
            )}
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <div>
              <p className="text-[9px] text-gray-400 uppercase tracking-wide">Orçado</p>
              <p className="text-xs font-semibold text-gray-700">{formatCurrency(proj.totalBudget || proj.globalBudget)}</p>
            </div>
            <div>
              <p className="text-[9px] text-gray-400 uppercase tracking-wide">Realizado</p>
              <p className="text-xs font-semibold text-gray-700">{formatCurrency(proj.totalRealized)}</p>
            </div>
            <div>
              <p className="text-[9px] text-gray-400 uppercase tracking-wide">Saldo</p>
              <p className={`text-xs font-semibold ${saldo < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(saldo)}</p>
            </div>
            <div>
              <p className="text-[9px] text-gray-400 uppercase tracking-wide">Desvio</p>
              <p className={`text-xs font-semibold ${proj.deviation > 5 ? 'text-red-600' : proj.deviation > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                {proj.deviation > 0 ? '+' : ''}{proj.deviation.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Barra de progresso */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-400">Progresso físico</span>
              <span className="text-[10px] font-semibold text-gray-700">{pct.toFixed(0)}%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${progressColor(proj.deviation)}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Datas */}
          <div className="flex items-center gap-1 text-[10px] text-gray-400">
            <Calendar size={10} />
            <span>{formatDateBR(proj.startDate)}</span>
            <span>→</span>
            <span className={proj.isDelayed ? 'text-red-500 font-medium' : ''}>{formatDateBR(proj.expectedEndDate)}</span>
          </div>

          {/* Rodapé */}
          <div className="mt-auto pt-2 border-t border-gray-100 flex items-center justify-end gap-1 text-[11px] font-medium text-[#F5A623] group-hover:text-[#e09610] transition-colors">
            Ver detalhes <ChevronRight size={12} />
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── Linha da tabela ──────────────────────────────────────────────────────────

function ProjectRow({ proj }: { proj: Project }) {
  const badge = budgetBadge(proj)
  const saldo = proj.totalBudget - proj.totalRealized

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-900">{proj.name}</p>
          {proj.code && <p className="text-[11px] text-gray-400">{proj.code}</p>}
        </div>
      </td>
      <td className="px-4 py-3">
        {proj.responsible ? (
          <div className="flex items-center gap-1.5">
            <UserAvatar name={proj.responsible.name} avatarUrl={proj.responsible.avatarUrl} size="xs" />
            <span className="text-xs text-gray-600">{proj.responsible.name.split(' ')[0]}</span>
          </div>
        ) : <span className="text-xs text-gray-400">—</span>}
      </td>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatCurrency(proj.totalBudget || proj.globalBudget)}</td>
      <td className="px-4 py-3 text-sm text-gray-900">{formatCurrency(proj.totalRealized)}</td>
      <td className={`px-4 py-3 text-sm font-medium ${saldo < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(saldo)}</td>
      <td className={`px-4 py-3 text-sm font-semibold ${proj.deviation > 5 ? 'text-red-600' : proj.deviation > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
        {proj.deviation > 0 ? '+' : ''}{proj.deviation.toFixed(1)}%
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${progressColor(proj.deviation)}`} style={{ width: `${Math.min(100, proj.progressPercent)}%` }} />
          </div>
          <span className="text-xs text-gray-600">{proj.progressPercent.toFixed(0)}%</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>{badge.label}</span>
      </td>
      <td className="px-4 py-3">
        {proj.pendingCosts > 0 ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
            <PackageX size={10} /> {proj.pendingCosts}
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <Link href={`/app/centro-de-custo/${proj.id}`} className="flex items-center gap-1 text-[11px] font-medium text-[#F5A623] hover:text-[#e09610]">
          Ver <ArrowUpRight size={11} />
        </Link>
      </td>
    </tr>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CentroDeCustoPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [meta,     setMeta]     = useState<Meta>({ totalActive: 0, totalAlert: 0, totalOverBudget: 0, totalWithinBudget: 0, totalPendingCosts: 0 })
  const [loading,  setLoading]  = useState(true)
  const [view,     setView]     = useState<'cards' | 'table'>('cards')

  // Filtros
  const [search,   setSearch]   = useState('')
  const [status,   setStatus]   = useState('ALL')

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    try {
      const token     = localStorage.getItem('token') || ''
      const companyId = localStorage.getItem('companyId') || ''

      const params = new URLSearchParams({ companyId, limit: '50' })
      if (status !== 'ALL') params.set('status', status)
      if (search)           params.set('search', search)

      const res  = await fetch(`${API}/api/v1/projects?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setProjects(data.projects ?? [])
      if (data.meta) setMeta(data.meta)
    } finally {
      setLoading(false)
    }
  }, [status, search])

  useEffect(() => {
    const t = setTimeout(fetchProjects, 300)
    return () => clearTimeout(t)
  }, [fetchProjects])

  const STATUS_FILTER_OPTIONS = [
    { value: 'ALL',         label: 'Todas' },
    { value: 'ACTIVE',      label: 'Ativas' },
    { value: 'IN_PROGRESS', label: 'Em andamento' },
    { value: 'PAUSED',      label: 'Pausadas' },
    { value: 'COMPLETED',   label: 'Concluídas' },
    { value: 'CANCELLED',   label: 'Canceladas' },
  ]

  const MetricCard = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Centro de Custo</h1>
          <p className="text-sm text-gray-500 mt-0.5">Visualize e acompanhe todas as obras monitoradas</p>
        </div>
        <button
          onClick={() => router.push('/app/centro-de-custo/nova')}
          className="flex items-center gap-2 bg-[#F5A623] hover:bg-[#e09610] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex-shrink-0"
        >
          <Plus size={16} /> Nova obra
        </button>
      </div>

      {/* ── Cards de métricas ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={Building2}      label="Obras ativas"          value={meta.totalActive}       color="bg-blue-500" />
        <MetricCard icon={AlertTriangle}  label="Em alerta"             value={meta.totalAlert}        color="bg-red-500"  />
        <MetricCard icon={TrendingUp}     label="Acima do orçamento"    value={meta.totalOverBudget}   color="bg-orange-500" />
        <MetricCard icon={CheckCircle2}   label="Dentro do orçamento"   value={meta.totalWithinBudget} color="bg-green-500" />
      </div>

      {/* ── Alerta custos pendentes ───────────────────────────────────────── */}
      {meta.totalPendingCosts > 0 && (
        <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
          <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-orange-100 flex items-center justify-center">
            <PackageX size={18} className="text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-orange-800">
              {meta.totalPendingCosts} custo{meta.totalPendingCosts > 1 ? 's' : ''} pendente{meta.totalPendingCosts > 1 ? 's' : ''} de apropriação
            </p>
            <p className="text-xs text-orange-600 mt-0.5">
              Saídas de material/EPI/equipamento aguardam vinculação a uma etapa da obra.
            </p>
          </div>
          <span className="flex-shrink-0 text-[11px] font-medium text-orange-600 bg-orange-100 px-2.5 py-1 rounded-full whitespace-nowrap">
            Ver na aba Apropriações → Materiais
          </span>
        </div>
      )}

      {/* ── Filtros + Toggle ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Busca */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou código..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#F5A623] bg-white"
          />
        </div>

        {/* Status */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {STATUS_FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                status === opt.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Toggle cards/tabela */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 ml-auto">
          <button
            onClick={() => setView('cards')}
            className={`p-1.5 rounded-md transition-colors ${view === 'cards' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            title="Cards"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => setView('table')}
            className={`p-1.5 rounded-md transition-colors ${view === 'table' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            title="Tabela"
          >
            <List size={15} />
          </button>
        </div>
      </div>

      {/* ── Conteúdo ─────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 rounded-full border-2 border-[#F5A623] border-t-transparent animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <HardHat size={40} className="text-gray-300 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-700 mb-1">Nenhuma obra encontrada</h3>
          <p className="text-sm text-gray-400 mb-6">Crie sua primeira obra para começar a controlar custos</p>
          <button
            onClick={() => router.push('/app/centro-de-custo/nova')}
            className="inline-flex items-center gap-2 bg-[#F5A623] text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-[#e09610] transition-colors"
          >
            <Plus size={15} /> Nova obra
          </button>
        </div>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {projects.map(p => <ProjectCard key={p.id} proj={p} />)}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Obra', 'Responsável', 'Orçado', 'Realizado', 'Saldo', 'Desvio', 'Progresso', 'Status', 'A Apropriar', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {projects.map(p => <ProjectRow key={p.id} proj={p} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
