'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Users, UserCheck, UserX, UserMinus, HardHat, TrendingUp,
  TrendingDown, AlertTriangle, Clock, Plus, Search, X, RefreshCw,
  Loader2, FileDown, ChevronLeft, ChevronRight,
  Eye, Pencil, UserCog, CalendarDays, Shield, DollarSign,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { Breadcrumb }       from '@/components/ui/Breadcrumb'
import { TableActionMenu }  from '@/components/ui/TableActionMenu'
import { UserAvatar }       from '@/components/ui/UserAvatar'
import { EmployeeFormModal }from './components/EmployeeFormModal'
import { DismissalModal }   from './components/DismissalModal'
import { toImageUrl }       from '@/lib/imageUrl'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Employee {
  id:            string
  code:          string
  name:          string
  cpf?:          string | null
  email?:        string | null
  photo?:        string | null
  type:          string
  role?:         string | null
  department?:   string | null
  status:        string
  admissionDate: string | null
  projectId?:    string | null
  project?:      { id: string; name: string; code: string | null } | null
  supplierId?:   string | null
  supplier?:     { id: string; name: string } | null
  documents?:    { id: string; expiryDate?: string | null; isExpired?: boolean; isExpiringSoon?: boolean }[]
  hasExpiredDocs?:  boolean
  hasExpiringDocs?: boolean
}

interface Summary {
  totalAtivos:             number
  totalAfastados:          number
  totalDesligados:         number
  alocadosEmObras:         number
  admissoesUltimos30:      number
  desligamentosUltimos30:  number
  documentosVencendo:      number
  documentosVencidos:      number
  treinamentosVencendo:    number
  treinamentosVencidos:    number
  feriasAgendadas:         number
  porFuncao: { role: string; count: number }[]
  porTipo:   { type: string; count: number }[]
  porObra:   { projectId: string; projectName: string; count: number }[]
}

interface Project {
  id: string; name: string; code: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const token     = localStorage.getItem('token')     ?? ''
  const companyId = localStorage.getItem('companyId') ?? ''
  return { Authorization: `Bearer ${token}`, 'x-company-id': companyId }
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

const TYPE_LABELS: Record<string, string> = {
  CLT:         'CLT',
  PJ:          'PJ',
  TEMPORARY:   'Temporário',
  INTERN:      'Estagiário',
  THIRD_PARTY: 'Terceirizado',
}
const TYPE_COLORS: Record<string, string> = {
  CLT:         'bg-blue-100 text-blue-700 border-blue-200',
  PJ:          'bg-purple-100 text-purple-700 border-purple-200',
  TEMPORARY:   'bg-amber-100 text-amber-700 border-amber-200',
  INTERN:      'bg-green-100 text-green-700 border-green-200',
  THIRD_PARTY: 'bg-gray-100 text-gray-600 border-gray-200',
}
const STATUS_LABELS: Record<string, string> = { ACTIVE: 'Ativo', AWAY: 'Afastado', DISMISSED: 'Desligado' }
const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    'bg-green-100 text-green-700',
  AWAY:      'bg-amber-100 text-amber-700',
  DISMISSED: 'bg-red-100 text-red-600',
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
}

function avatarColor(name: string) {
  const colors = ['bg-orange-400','bg-blue-400','bg-green-400','bg-purple-400','bg-teal-400','bg-pink-400']
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return colors[h % colors.length]
}

const PIE_COLORS = ['#22c55e','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#14b8a6','#f97316']
const TABS = ['Colaboradores','Férias','Documentos','Treinamentos'] as const
type Tab = typeof TABS[number]

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ColaboradoresPage() {
  const searchParams = useSearchParams()
  const router       = useRouter()

  const [tab,            setTab]            = useState<Tab>('Colaboradores')
  const [summary,        setSummary]        = useState<Summary | null>(null)
  const [employees,      setEmployees]      = useState<Employee[]>([])
  const [projects,       setProjects]       = useState<Project[]>([])
  const [loadingSum,     setLoadingSum]     = useState(true)
  const [loadingEmp,     setLoadingEmp]     = useState(true)
  const [total,          setTotal]          = useState(0)
  const [page,           setPage]           = useState(1)
  const [totalPages,     setTotalPages]     = useState(1)
  const LIMIT = 15

  // Filtros
  const [search,              setSearch]              = useState('')
  const [filterStatus,        setFilterStatus]        = useState('ACTIVE')
  const [filterType,          setFilterType]          = useState('')
  const [filterProject,       setFilterProject]       = useState('')
  const [semFornecedorFilter, setSemFornecedorFilter] = useState(false)

  // Modais
  const [showForm,       setShowForm]       = useState(false)
  const [editingId,      setEditingId]      = useState<string | null>(null)
  const [dismissing,     setDismissing]     = useState<{ id: string; name: string; mode: 'dismiss' | 'away' } | null>(null)

  // ── Aplicar filtros vindos da URL (ex: link do alerta financeiro) ─────────
  useEffect(() => {
    const typeParam       = searchParams.get('type')
    const semFornecedor   = searchParams.get('semFornecedor')
    if (typeParam)              setFilterType(typeParam)
    if (semFornecedor === 'true') setSemFornecedorFilter(true)
  // Apenas na montagem inicial
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Carregar summary ──────────────────────────────────────────────────────
  const loadSummary = useCallback(async () => {
    setLoadingSum(true)
    try {
      const res = await fetch(`${API}/api/v1/employees/summary`, { headers: getHeaders() })
      if (res.ok) setSummary(await res.json())
    } finally {
      setLoadingSum(false)
    }
  }, [])

  // ── Carregar colaboradores ────────────────────────────────────────────────
  const loadEmployees = useCallback(async (pg = 1) => {
    setLoadingEmp(true)
    try {
      const qp = new URLSearchParams({ page: String(pg), limit: String(LIMIT) })
      if (search)        qp.set('search',    search)
      if (filterStatus && filterStatus !== 'ALL') qp.set('status', filterStatus)
      if (filterProject && filterProject !== 'ALL') qp.set('projectId', filterProject)

      if (semFornecedorFilter) {
        // Filtro especial: manda semFornecedor=true (o backend aplica type PJ/THIRD_PARTY + supplierId null)
        qp.set('semFornecedor', 'true')
      } else if (filterType && filterType !== 'ALL') {
        qp.set('type', filterType)
      }

      const res  = await fetch(`${API}/api/v1/employees?${qp}`, { headers: getHeaders() })
      const data = await res.json()
      setEmployees(data.employees ?? [])
      setTotal(data.pagination?.total ?? 0)
      setTotalPages(data.pagination?.totalPages ?? 1)
    } finally {
      setLoadingEmp(false)
    }
  }, [search, filterStatus, filterType, filterProject, semFornecedorFilter])

  // ── Carregar obras para filtro ────────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/api/v1/projects?limit=200&status=ALL`, { headers: getHeaders() })
      const data = await res.json()
      const all  = (data.projects ?? []) as any[]
      setProjects(all
        .filter((p: any) => !['COMPLETED','CANCELLED'].includes(p.status))
        .map((p: any) => ({ id: p.id, name: p.name, code: p.code }))
      )
    } catch { /* silent */ }
  }, [])

  useEffect(() => { loadSummary(); loadProjects() }, [loadSummary, loadProjects])
  useEffect(() => { setPage(1); loadEmployees(1) }, [loadEmployees])

  function goPage(pg: number) { setPage(pg); loadEmployees(pg) }

  function clearFilters() {
    setSearch(''); setFilterStatus('ACTIVE'); setFilterType(''); setFilterProject('')
    setSemFornecedorFilter(false)
  }

  function handleFormSuccess(emp: any) {
    setShowForm(false); setEditingId(null)
    loadSummary(); loadEmployees(page)
  }

  function handleDismissSuccess() {
    setDismissing(null)
    loadSummary(); loadEmployees(page)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const totalAll = (summary?.totalAtivos ?? 0) + (summary?.totalAfastados ?? 0) + (summary?.totalDesligados ?? 0)

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
      <Breadcrumb items={[
        { label: 'Colaboradores' },
      ]} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Colaboradores</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie os colaboradores da empresa</p>
        </div>
        <button
          onClick={() => { setEditingId(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-[#F5A623] hover:bg-[#d4891a] text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-colors"
        >
          <Plus size={16} /> Novo colaborador
        </button>
        <Link href="/app/colaboradores/folha"
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-colors">
          <DollarSign size={16} /> Folha de pagamento
        </Link>
      </div>

      {/* ── Banner de filtro ativo vindo da URL ───────────────────────── */}
      {semFornecedorFilter && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            Filtro ativo: <strong>PJ e Terceirizados sem fornecedor vinculado</strong>
            {total > 0 && <span className="ml-1 text-amber-600">— {total} colaborador{total !== 1 ? 'es' : ''} encontrado{total !== 1 ? 's' : ''}</span>}
          </p>
          <button
            onClick={clearFilters}
            className="text-xs text-amber-700 font-semibold hover:underline whitespace-nowrap flex items-center gap-1"
          >
            <X size={12} /> Limpar filtro
          </button>
        </div>
      )}

      {/* ── Alertas de urgência ────────────────────────────────────────── */}
      {!loadingSum && summary && (
        <div className="flex flex-col gap-2">
          {summary.documentosVencidos > 0 && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700 flex-1">
                ⚠️ <strong>{summary.documentosVencidos}</strong> documento(s) vencido(s) — ação necessária
              </p>
              <button onClick={() => { setTab('Documentos') }} className="text-xs text-red-600 font-semibold hover:underline whitespace-nowrap">
                Ver detalhes →
              </button>
            </div>
          )}
          {summary.documentosVencendo > 0 && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <Clock size={16} className="text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-700 flex-1">
                ⏰ <strong>{summary.documentosVencendo}</strong> documento(s) vencem nos próximos 30 dias
              </p>
              <button onClick={() => setTab('Documentos')} className="text-xs text-amber-600 font-semibold hover:underline whitespace-nowrap">
                Ver detalhes →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Métricas ──────────────────────────────────────────────────── */}
      {loadingSum ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 animate-pulse">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="bg-gray-200 h-24 rounded-2xl" />
          ))}
        </div>
      ) : summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {/* Card 1 */}
          <MetricCard
            icon={<Users size={18} className="text-[#F5A623]" />}
            label="Total de colaboradores"
            value={totalAll}
            sub={`Ativos: ${summary.totalAtivos} · Afastados: ${summary.totalAfastados} · Desligados: ${summary.totalDesligados}`}
            bg="bg-orange-50"
          />
          {/* Card 2 */}
          <MetricCard
            icon={<HardHat size={18} className="text-blue-500" />}
            label="Alocados em obras"
            value={summary.alocadosEmObras}
            sub={totalAll > 0 ? `${Math.round(summary.alocadosEmObras / Math.max(summary.totalAtivos,1) * 100)}% dos ativos` : '—'}
            bg="bg-blue-50"
          />
          {/* Card 3 */}
          <MetricCard
            icon={<TrendingUp size={18} className="text-green-500" />}
            label="Admissões (30 dias)"
            value={summary.admissoesUltimos30}
            sub="Novos colaboradores"
            bg="bg-green-50"
            valueColor="text-green-600"
          />
          {/* Card 4 */}
          <MetricCard
            icon={<TrendingDown size={18} className="text-red-400" />}
            label="Desligamentos (30 dias)"
            value={summary.desligamentosUltimos30}
            sub="Saídas recentes"
            bg="bg-red-50"
            valueColor={summary.desligamentosUltimos30 > 0 ? 'text-red-500' : undefined}
          />
          {/* Card 5 */}
          <MetricCard
            icon={<AlertTriangle size={18} className={summary.documentosVencidos > 0 ? 'text-red-500' : 'text-gray-400'} />}
            label="Docs. a vencer (30 dias)"
            value={summary.documentosVencendo}
            sub={summary.documentosVencidos > 0 ? `${summary.documentosVencidos} já vencido(s)` : 'Próximos 30 dias'}
            bg={summary.documentosVencendo > 0 ? 'bg-red-50' : 'bg-gray-50'}
            valueColor={summary.documentosVencendo > 0 ? 'text-red-500' : undefined}
          />
          {/* Card 6 */}
          <MetricCard
            icon={<Shield size={18} className={summary.treinamentosVencendo > 0 ? 'text-amber-500' : 'text-gray-400'} />}
            label="Treinamentos pendentes"
            value={summary.treinamentosVencendo}
            sub="Vencendo em 30 dias"
            bg={summary.treinamentosVencendo > 0 ? 'bg-amber-50' : 'bg-gray-50'}
            valueColor={summary.treinamentosVencendo > 0 ? 'text-amber-500' : undefined}
          />
          {/* Card 7 */}
          <MetricCard
            icon={<CalendarDays size={18} className="text-teal-500" />}
            label="Férias agendadas"
            value={summary.feriasAgendadas}
            sub="Próximas férias"
            bg="bg-teal-50"
          />
        </div>
      )}

      {/* ── Gráficos ──────────────────────────────────────────────────── */}
      {summary && !loadingSum && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Por função (donut) */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Por função</h3>
            {summary.porFuncao.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-xs text-gray-400">Sem dados</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie data={summary.porFuncao} dataKey="count" nameKey="role" innerRadius={36} outerRadius={56} paddingAngle={2}>
                      {summary.porFuncao.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [v, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1 mt-1">
                  {summary.porFuncao.slice(0, 4).map((r, i) => (
                    <div key={r.role} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-gray-600 truncate max-w-[100px]">{r.role}</span>
                      </div>
                      <span className="font-semibold text-gray-700">{r.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Por situação (donut) */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Por situação</h3>
            {totalAll === 0 ? (
              <div className="flex items-center justify-center h-32 text-xs text-gray-400">Sem dados</div>
            ) : (() => {
              const data = [
                { name: 'Ativo',      value: summary.totalAtivos,     color: '#22c55e' },
                { name: 'Afastado',   value: summary.totalAfastados,  color: '#f59e0b' },
                { name: 'Desligado',  value: summary.totalDesligados, color: '#ef4444' },
              ].filter(d => d.value > 0)
              return (
                <div className="relative">
                  <ResponsiveContainer width="100%" height={130}>
                    <PieChart>
                      <Pie data={data} dataKey="value" innerRadius={36} outerRadius={56} paddingAngle={2}>
                        {data.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-lg font-bold text-gray-800">{totalAll}</span>
                  </div>
                  <div className="space-y-1 mt-1">
                    {data.map(d => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                          <span className="text-gray-600">{d.name}</span>
                        </div>
                        <span className="font-semibold">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Por obra (barras horizontais) */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Por obra (top 5)</h3>
            {summary.porObra.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-xs text-gray-400">Nenhum alocado</div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={summary.porObra} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="projectName" tick={{ fontSize: 9 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#F5A623" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* ── Abas ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Nav das abas */}
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t
                  ? 'text-[#F5A623] border-b-2 border-[#F5A623]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── ABA COLABORADORES ────────────────────────────────────── */}
        {tab === 'Colaboradores' && (
          <div className="p-4 space-y-4">
            {/* Filtros */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-48">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar nome, CPF, matrícula..."
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white">
                <option value="ALL">Situação: Todas</option>
                <option value="ACTIVE">Ativo</option>
                <option value="AWAY">Afastado</option>
                <option value="DISMISSED">Desligado</option>
              </select>
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white">
                <option value="">Tipo: Todos</option>
                <option value="CLT">CLT</option>
                <option value="PJ">PJ</option>
                <option value="TEMPORARY">Temporário</option>
                <option value="INTERN">Estagiário</option>
                <option value="THIRD_PARTY">Terceirizado</option>
              </select>
              <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white">
                <option value="">Obra: Todas</option>
                <option value="NONE">Sem obra</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {(search || filterStatus !== 'ACTIVE' || filterType || filterProject) && (
                <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5">
                  <X size={12} /> Limpar
                </button>
              )}
              <button onClick={() => loadEmployees(page)} className="ml-auto text-gray-400 hover:text-gray-600 transition-colors" title="Atualizar">
                <RefreshCw size={14} />
              </button>
            </div>

            {/* Contador */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">{total} colaborador{total !== 1 ? 'es' : ''} encontrado{total !== 1 ? 's' : ''}</p>
            </div>

            {/* Tabela */}
            {loadingEmp ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={22} className="animate-spin text-[#F5A623]" />
              </div>
            ) : employees.length === 0 ? (
              <div className="text-center py-12">
                <Users size={32} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Nenhum colaborador encontrado</p>
                <button onClick={() => { setEditingId(null); setShowForm(true) }}
                  className="mt-3 text-sm text-[#F5A623] hover:underline">
                  + Cadastrar primeiro colaborador
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Colaborador</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Matrícula</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Função</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Obra</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Situação</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Admissão</th>
                      <th className="px-3 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map(emp => {
                      const rowBg = emp.hasExpiredDocs
                        ? 'bg-red-50/50 hover:bg-red-50'
                        : emp.hasExpiringDocs
                          ? 'bg-amber-50/40 hover:bg-amber-50'
                          : 'hover:bg-gray-50/50'
                      return (
                        <tr
                          key={emp.id}
                          className={`border-b border-gray-50 transition-colors cursor-pointer ${rowBg}`}
                          onClick={() => router.push(`/app/colaboradores/${emp.id}`)}
                        >
                          {/* Colaborador */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              {emp.photo ? (
                                <img src={toImageUrl(emp.photo)} alt={emp.name}
                                  className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                              ) : (
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${avatarColor(emp.name)}`}>
                                  {initials(emp.name)}
                                </div>
                              )}
                              <div className="min-w-0">
                                <Link href={`/app/colaboradores/${emp.id}`}
                                  className="font-medium text-gray-800 hover:text-[#F5A623] truncate block">
                                  {emp.name}
                                </Link>
                                {emp.email && <p className="text-[11px] text-gray-400 truncate">{emp.email}</p>}
                                {emp.hasExpiredDocs && (
                                  <span className="text-[10px] text-red-500 font-medium">⚠ Doc. vencido</span>
                                )}
                                {!emp.hasExpiredDocs && emp.hasExpiringDocs && (
                                  <span className="text-[10px] text-amber-500 font-medium">⏰ Doc. vencendo</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="font-mono text-xs text-gray-500">{emp.code}</span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${TYPE_COLORS[emp.type] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                {TYPE_LABELS[emp.type] ?? emp.type}
                              </span>
                              {emp.supplierId && (
                                <span title={`Fornecedor: ${emp.supplier?.name ?? 'vinculado'}`}
                                  className="text-[#F5A623] text-xs">🔗</span>
                              )}
                              {['PJ', 'THIRD_PARTY'].includes(emp.type) && !emp.supplierId && (
                                <span title="Sem fornecedor vinculado — pagamentos não rastreados"
                                  className="text-amber-500 text-xs">⚠️</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-600">{emp.role ?? '—'}</td>
                          <td className="px-3 py-3 text-xs text-gray-600">
                            {emp.project
                              ? <Link href={`/app/centro-de-custo/${emp.project.id}`} className="hover:text-[#F5A623] hover:underline">{emp.project.name}</Link>
                              : '—'}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[emp.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {STATUS_LABELS[emp.status] ?? emp.status}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-500">{fmtDate(emp.admissionDate)}</td>
                          <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                            <TableActionMenu actions={[
                              { label: 'Ver perfil', icon: <Eye size={14} />, onClick: () => router.push(`/app/colaboradores/${emp.id}`) },
                              { label: 'Editar', icon: <Pencil size={14} />, onClick: () => { setEditingId(emp.id); setShowForm(true) } },
                              { separator: true, label: 'Afastar', icon: <UserMinus size={14} />,
                                onClick: () => setDismissing({ id: emp.id, name: emp.name, mode: 'away' }),
                                variant: 'warning', disabled: emp.status === 'DISMISSED' },
                              { label: 'Desligar', icon: <UserX size={14} />,
                                onClick: () => setDismissing({ id: emp.id, name: emp.name, mode: 'dismiss' }),
                                variant: 'danger', disabled: emp.status === 'DISMISSED' },
                            ]} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <button onClick={() => goPage(page - 1)} disabled={page === 1}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#F5A623] disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronLeft size={13} /> Anterior
                </button>
                <span className="text-xs text-gray-400">Página {page} de {totalPages} · {total} registros</span>
                <button onClick={() => goPage(page + 1)} disabled={page === totalPages}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#F5A623] disabled:opacity-40 disabled:cursor-not-allowed">
                  Próxima <ChevronRight size={13} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── ABA DOCUMENTOS ───────────────────────────────────────── */}
        {tab === 'Documentos' && (
          <DocumentsTab projects={projects} />
        )}

        {/* ── ABA TREINAMENTOS ─────────────────────────────────────── */}
        {tab === 'Treinamentos' && (
          <TrainingsTab projects={projects} />
        )}

        {/* ── ABA FÉRIAS ───────────────────────────────────────────── */}
        {tab === 'Férias' && (
          <VacationsTab projects={projects} />
        )}
      </div>

      {/* ── Modais ────────────────────────────────────────────────────── */}
      <EmployeeFormModal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditingId(null) }}
        onSuccess={handleFormSuccess}
        editId={editingId}
        projects={projects}
      />

      {dismissing && (
        <DismissalModal
          isOpen
          onClose={() => setDismissing(null)}
          onSuccess={handleDismissSuccess}
          employeeId={dismissing.id}
          employeeName={dismissing.name}
          mode={dismissing.mode}
        />
      )}
    </div>
  )
}

// ─── Subcomponente: card métrica ──────────────────────────────────────────────

function MetricCard({ icon, label, value, sub, bg, valueColor }: {
  icon: React.ReactNode
  label: string
  value: number
  sub?: string
  bg?: string
  valueColor?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-start justify-between mb-2">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${bg ?? 'bg-gray-50'}`}>
          {icon}
        </div>
      </div>
      <p className={`text-2xl font-bold mb-0.5 ${valueColor ?? 'text-gray-900'}`}>{value}</p>
      <p className="text-xs font-medium text-gray-600 leading-tight">{label}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-1 leading-snug">{sub}</p>}
    </div>
  )
}

// ─── Subcomponente: aba Documentos ────────────────────────────────────────────

function DocumentsTab({ projects }: { projects: Project[] }) {
  const [docs,       setDocs]       = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [filterEmp,  setFilterEmp]  = useState('')
  const [employees,  setEmployees]  = useState<{ id: string; name: string }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const token     = localStorage.getItem('token')     ?? ''
      const companyId = localStorage.getItem('companyId') ?? ''
      // Buscar todos os colaboradores e seus documentos
      const res  = await fetch(
        `${API}/api/v1/employees?limit=100&status=ALL`,
        { headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId } }
      )
      const data = await res.json()
      const emps = (data.employees ?? []) as any[]
      setEmployees(emps.map((e: any) => ({ id: e.id, name: e.name })))
      const allDocs = emps.flatMap((e: any) => (e.documents ?? []).map((d: any) => ({
        ...d,
        employeeId:   e.id,
        employeeName: e.name,
        employeePhoto: e.photo,
        daysToExpiry:  d.expiryDate ? Math.ceil((new Date(d.expiryDate).getTime() - Date.now()) / 86_400_000) : null,
      })))
      allDocs.sort((a: any, b: any) => {
        if (a.daysToExpiry === null) return 1
        if (b.daysToExpiry === null) return -1
        return a.daysToExpiry - b.daysToExpiry
      })
      setDocs(allDocs)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = filterEmp ? docs.filter(d => d.employeeId === filterEmp) : docs

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2 items-center flex-wrap">
        <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">
          <option value="">Todos os colaboradores</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <button onClick={load} className="text-gray-400 hover:text-gray-600"><RefreshCw size={14} /></button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-10"><Loader2 size={20} className="animate-spin text-[#F5A623]" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">Nenhum documento encontrado</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Colaborador</th>
                <th className="text-left px-3 py-3">Tipo</th>
                <th className="text-left px-3 py-3">Nome</th>
                <th className="text-left px-3 py-3">Emissão</th>
                <th className="text-left px-3 py-3">Vencimento</th>
                <th className="text-left px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d: any) => {
                const days = d.daysToExpiry
                const badge = days === null ? null
                  : days < 0    ? { text: `Vencido há ${Math.abs(days)} dias`, cls: 'bg-red-100 text-red-700' }
                  : days <= 7   ? { text: `Vence em ${days} dias`, cls: 'bg-red-100 text-red-700' }
                  : days <= 30  ? { text: `Vence em ${days} dias`, cls: 'bg-amber-100 text-amber-700' }
                  : { text: 'Válido', cls: 'bg-green-100 text-green-700' }
                return (
                  <tr key={d.id} className={`border-b border-gray-50 ${days !== null && days < 0 ? 'bg-red-50/40' : days !== null && days <= 7 ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-4 py-2.5 text-xs text-gray-700">{d.employeeName}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">{d.type}</td>
                    <td className="px-3 py-2.5 text-xs font-medium text-gray-700">{d.name}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">{d.issueDate ? new Date(d.issueDate).toLocaleDateString('pt-BR') : '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">{d.expiryDate ? new Date(d.expiryDate).toLocaleDateString('pt-BR') : '—'}</td>
                    <td className="px-3 py-2.5">
                      {badge && <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.text}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Subcomponente: aba Treinamentos ─────────────────────────────────────────

function TrainingsTab({ projects }: { projects: Project[] }) {
  const [trainings, setTrainings] = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [filterEmp, setFilterEmp] = useState('')
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const token     = localStorage.getItem('token')     ?? ''
      const companyId = localStorage.getItem('companyId') ?? ''
      const res  = await fetch(`${API}/api/v1/employees?limit=100&status=ALL`,
        { headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId } })
      const data = await res.json()
      const emps = (data.employees ?? []) as any[]
      setEmployees(emps.map((e: any) => ({ id: e.id, name: e.name })))
      const all = emps.flatMap((e: any) => (e._count?.trainings > 0 ? [] : []))
      // trainings precisam ser carregados via perfil — para listagem, só mostramos o count
      setTrainings([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-4">
      <div className="text-center py-10 space-y-2">
        <Shield size={28} className="text-gray-200 mx-auto" />
        <p className="text-sm text-gray-500">Visualize os treinamentos de cada colaborador no perfil individual</p>
        <p className="text-xs text-gray-400">Acesse um colaborador e vá para a aba "Treinamentos"</p>
      </div>
    </div>
  )
}

// ─── Subcomponente: aba Férias ────────────────────────────────────────────────

type VacTab = 'emFerias' | 'agendadas' | 'vencendo30' | 'vencendo60' | 'vencendo90' | 'vencidas' | 'todas'

interface VacOverview {
  emFerias:  any[]
  agendadas: any[]
  vencendo30: any[]
  vencendo60: any[]
  vencendo90: any[]
  vencidas:   any[]
  todas:      any[]
  totais: {
    emFerias: number; agendadas: number
    vencendo30: number; vencendo60: number; vencendo90: number; vencidas: number
  }
}

function VacationsTab({ projects }: { projects: Project[] }) {
  const [data,    setData]    = useState<VacOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [vacTab,  setVacTab]  = useState<VacTab>('emFerias')
  const [search,  setSearch]  = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [schedEmpId,   setSchedEmpId]   = useState('')
  const [schedEmpName, setSchedEmpName] = useState('')
  const [schedStart,   setSchedStart]   = useState('')
  const [schedEnd,     setSchedEnd]     = useState('')
  const [schedDays,    setSchedDays]    = useState('')
  const [schedObs,     setSchedObs]     = useState('')
  const [schedLoading, setSchedLoading] = useState(false)
  const [schedError,   setSchedError]   = useState('')
  const [allEmployees, setAllEmployees] = useState<{id: string; name: string}[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`${API}/api/v1/employees/vacations-overview`, { headers: getHeaders() })
      const json = await res.json()
      if (res.ok) setData(json)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Carregar colaboradores para o modal de agendamento
  useEffect(() => {
    fetch(`${API}/api/v1/employees?status=ACTIVE&limit=200`, { headers: getHeaders() })
      .then(r => r.json())
      .then(d => setAllEmployees((d.employees ?? []).map((e: any) => ({ id: e.id, name: e.name }))))
      .catch(() => {})
  }, [])

  const fmt = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
  const daysLeft = (d: string) => {
    const ms = new Date(d).getTime() - Date.now()
    return Math.ceil(ms / 86_400_000)
  }

  // Calcula daysCount a partir de start/end
  const calcDays = (s: string, e: string) => {
    if (!s || !e) return 0
    return Math.max(1, Math.round((new Date(e).getTime() - new Date(s).getTime()) / 86_400_000) + 1)
  }

  async function handleSchedule() {
    if (!schedEmpId || !schedStart || !schedEnd) {
      setSchedError('Preencha colaborador, data de início e data de fim')
      return
    }
    const days = parseInt(schedDays) || calcDays(schedStart, schedEnd)
    setSchedLoading(true); setSchedError('')
    try {
      const res = await fetch(`${API}/api/v1/employees/${schedEmpId}/vacations`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: schedStart, endDate: schedEnd, days, observations: schedObs || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao agendar')
      setShowScheduleModal(false)
      setSchedEmpId(''); setSchedEmpName(''); setSchedStart(''); setSchedEnd(''); setSchedDays(''); setSchedObs('')
      loadData()
    } catch (e: any) {
      setSchedError(e.message)
    } finally {
      setSchedLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-[#F5A623]" />
      </div>
    )
  }

  if (!data) return <div className="p-6 text-sm text-gray-400">Erro ao carregar dados de férias.</div>

  const { totais } = data

  // Tabs configuração
  const vacTabs: { id: VacTab; label: string; count: number; color?: string }[] = [
    { id: 'emFerias',   label: 'Em férias agora',     count: totais.emFerias,   color: 'blue'   },
    { id: 'agendadas',  label: 'Agendadas',            count: totais.agendadas,  color: 'green'  },
    { id: 'vencendo30', label: 'Vencendo em 30 dias',  count: totais.vencendo30, color: totais.vencendo30 > 0 ? 'amber' : 'gray' },
    { id: 'vencendo60', label: 'Vencendo em 60 dias',  count: totais.vencendo60, color: 'gray'   },
    { id: 'vencendo90', label: 'Vencendo em 90 dias',  count: totais.vencendo90, color: 'gray'   },
    { id: 'vencidas',   label: 'Vencidas',             count: totais.vencidas,   color: totais.vencidas > 0 ? 'red' : 'gray' },
    { id: 'todas',      label: 'Todas',                count: data.todas.length, color: 'gray'   },
  ]

  const tabColor: Record<string, string> = {
    blue:  'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    red:   'bg-red-100 text-red-600',
    gray:  'bg-gray-100 text-gray-500',
  }

  // Conteúdo de cada tab
  function renderVacationCard(v: any) {
    const emp = v.employee ?? v
    const pid = emp?.id
    return (
      <div key={v.id ?? pid} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-orange-200 transition-all">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
          {emp?.photo
            ? <img src={`${API}${emp.photo.startsWith('/') ? '' : '/'}${emp.photo}`} alt={emp.name} className="w-full h-full object-cover" />
            : <span className="text-xs font-bold text-gray-500">{emp?.name?.[0] ?? '?'}</span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-800 truncate">{emp?.name}</p>
            <span className="text-[10px] text-gray-400">{emp?.code}</span>
          </div>
          <p className="text-xs text-gray-400 truncate">{emp?.role ?? 'Sem função'}</p>
          {v.startDate && (
            <p className="text-xs text-blue-600 mt-0.5">
              🏖️ {fmt(v.startDate)} → {fmt(v.endDate)}
              {v.days ? ` (${v.days} dias)` : ''}
            </p>
          )}
          {v.endDate && vacTab === 'emFerias' && (
            <p className="text-xs text-gray-400">Retorno: {fmt(new Date(new Date(v.endDate).getTime() + 86_400_000).toISOString())}</p>
          )}
          {vacTab === 'agendadas' && v.startDate && (
            <p className="text-xs text-gray-400">Começa em {daysLeft(v.startDate)} dias</p>
          )}
        </div>
        <Link href={`/app/colaboradores/${pid}`}
          className="text-xs text-[#F5A623] hover:underline flex-shrink-0 font-medium">
          Ver perfil
        </Link>
      </div>
    )
  }

  function renderDeadlineCard(emp: any, urgent = false) {
    const dl = daysLeft(emp.deadline)
    return (
      <div key={emp.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${urgent ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
          {emp.photo
            ? <img src={`${API}${emp.photo.startsWith('/') ? '' : '/'}${emp.photo}`} alt={emp.name} className="w-full h-full object-cover" />
            : <span className="text-xs font-bold text-gray-500">{emp.name?.[0] ?? '?'}</span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm font-semibold truncate ${urgent ? 'text-red-800' : 'text-gray-800'}`}>{emp.name}</p>
            <span className="text-[10px] text-gray-400">{emp.code}</span>
          </div>
          <p className="text-xs text-gray-400 truncate">{emp.role ?? 'Sem função'}{emp.project?.name ? ` · ${emp.project.name}` : ''}</p>
          <p className={`text-xs mt-0.5 font-medium ${urgent ? 'text-red-700' : 'text-amber-700'}`}>
            {urgent
              ? `⚠️ FÉRIAS VENCIDAS há ${Math.abs(dl)} dias — venceu em ${fmt(emp.deadline)}`
              : `⏰ Prazo vence em ${dl} dias (${fmt(emp.deadline)})`
            }
          </p>
          <p className="text-xs text-gray-400">Admissão: {fmt(emp.admissionDate)}</p>
        </div>
        <button
          onClick={() => { setSchedEmpId(emp.id); setSchedEmpName(emp.name); setShowScheduleModal(true) }}
          className={`text-xs px-2 py-1 rounded-lg flex-shrink-0 font-medium ${urgent ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-amber-500 text-white hover:bg-amber-600'}`}>
          Agendar
        </button>
      </div>
    )
  }

  // Tab "Todas" com filtros
  const todasFiltered = data.todas.filter((v: any) => {
    const name = v.employee?.name ?? ''
    if (search && !name.toLowerCase().includes(search.toLowerCase())) return false
    if (filterStatus !== 'ALL' && v.status !== filterStatus) return false
    return true
  })

  const statusLabel: Record<string, string> = { SCHEDULED: 'Agendada', ACTIVE: 'Ativa', COMPLETED: 'Concluída', CANCELLED: 'Cancelada' }
  const statusColor: Record<string, string> = {
    SCHEDULED: 'bg-blue-100 text-blue-700', ACTIVE: 'bg-green-100 text-green-700',
    COMPLETED: 'bg-gray-100 text-gray-600', CANCELLED: 'bg-red-100 text-red-500',
  }

  return (
    <div className="p-4 space-y-5">
      {/* Cards de alerta */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Em férias agora',      value: totais.emFerias,   icon: '🏖️', bg: 'bg-blue-50',   border: 'border-blue-100',   text: 'text-blue-700',   sub: 'em gozo' },
          { label: 'Férias agendadas',     value: totais.agendadas,  icon: '📅', bg: 'bg-green-50',  border: 'border-green-100',  text: 'text-green-700',  sub: 'próximas programadas' },
          { label: 'Vencendo em 30 dias',  value: totais.vencendo30, icon: '⏰', bg: totais.vencendo30 > 0 ? 'bg-amber-50' : 'bg-gray-50',   border: totais.vencendo30 > 0 ? 'border-amber-100' : 'border-gray-100',   text: totais.vencendo30 > 0 ? 'text-amber-700' : 'text-gray-500', sub: 'prazo se aproximando' },
          { label: 'Férias vencidas',      value: totais.vencidas,   icon: '⚠️', bg: totais.vencidas > 0 ? 'bg-red-50' : 'bg-gray-50',     border: totais.vencidas > 0 ? 'border-red-100' : 'border-gray-100',     text: totais.vencidas > 0 ? 'text-red-700' : 'text-gray-500',   sub: 'ação necessária' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} border ${c.border} rounded-2xl px-4 py-3`}>
            <div className="flex items-start justify-between mb-1">
              <span className="text-lg">{c.icon}</span>
              <p className={`text-xl font-bold ${c.text}`}>{c.value}</p>
            </div>
            <p className="text-[11px] font-semibold text-gray-600 leading-tight">{c.label}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Header com botão agendar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Gestão de férias</h3>
        <button
          onClick={() => { setSchedEmpId(''); setSchedEmpName(''); setShowScheduleModal(true) }}
          className="flex items-center gap-1.5 text-sm bg-[#F5A623] hover:bg-[#d4891a] text-white font-semibold px-3 py-1.5 rounded-xl transition-colors"
        >
          <Plus size={14} /> Agendar férias
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {vacTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setVacTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              vacTab === t.id
                ? 'bg-gray-800 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                vacTab === t.id ? 'bg-white/20 text-white' : tabColor[t.color ?? 'gray']
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo das tabs */}
      <div className="space-y-2">
        {vacTab === 'emFerias' && (
          data.emFerias.length === 0
            ? <EmptyState label="Nenhum colaborador em férias agora" />
            : data.emFerias.map(renderVacationCard)
        )}

        {vacTab === 'agendadas' && (
          data.agendadas.length === 0
            ? <EmptyState label="Nenhuma férias agendada" />
            : data.agendadas.map(renderVacationCard)
        )}

        {vacTab === 'vencendo30' && (
          data.vencendo30.length === 0
            ? <EmptyState label="Nenhum colaborador com férias vencendo em 30 dias" icon="✅" />
            : data.vencendo30.map(emp => renderDeadlineCard(emp, false))
        )}

        {vacTab === 'vencendo60' && (
          data.vencendo60.length === 0
            ? <EmptyState label="Nenhum colaborador com férias vencendo em 60 dias" icon="✅" />
            : data.vencendo60.map(emp => renderDeadlineCard(emp, false))
        )}

        {vacTab === 'vencendo90' && (
          data.vencendo90.length === 0
            ? <EmptyState label="Nenhum colaborador com férias vencendo em 90 dias" icon="✅" />
            : data.vencendo90.map(emp => renderDeadlineCard(emp, false))
        )}

        {vacTab === 'vencidas' && (
          data.vencidas.length === 0
            ? <EmptyState label="Nenhum colaborador com férias vencidas — tudo em dia! ✅" />
            : data.vencidas.map(emp => renderDeadlineCard(emp, true))
        )}

        {vacTab === 'todas' && (
          <div className="space-y-3">
            {/* Filtros da tab Todas */}
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar colaborador..."
                  className="border border-gray-200 rounded-lg pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-300 w-48"
                />
              </div>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white"
              >
                <option value="ALL">Todos os status</option>
                <option value="SCHEDULED">Agendada</option>
                <option value="ACTIVE">Ativa</option>
                <option value="COMPLETED">Concluída</option>
                <option value="CANCELLED">Cancelada</option>
              </select>
            </div>
            {/* Tabela */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold">Colaborador</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Função</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Início</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Fim</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Dias</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Status</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {todasFiltered.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-6 text-sm text-gray-400">Nenhuma férias encontrada</td></tr>
                    ) : todasFiltered.map((v: any) => (
                      <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-gray-800 text-sm">{v.employee?.name ?? '—'}</p>
                          <p className="text-xs text-gray-400">{v.employee?.code}</p>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">{v.employee?.role ?? '—'}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-600">{fmt(v.startDate)}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-600">{fmt(v.endDate)}</td>
                        <td className="px-3 py-2.5 text-center text-xs font-semibold text-gray-700">{v.days ?? '—'}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor[v.status] ?? 'bg-gray-100 text-gray-500'}`}>
                            {statusLabel[v.status] ?? v.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Link href={`/app/colaboradores/${v.employee?.id}`}
                            className="text-xs text-[#F5A623] hover:underline">
                            Ver
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Agendar férias */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowScheduleModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Agendar férias</h3>
              <button onClick={() => setShowScheduleModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                <X size={16} />
              </button>
            </div>

            {schedError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />
                <p className="text-xs text-red-700">{schedError}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Colaborador <span className="text-red-400">*</span>
                </label>
                <select
                  value={schedEmpId}
                  onChange={e => {
                    const emp = allEmployees.find(x => x.id === e.target.value)
                    setSchedEmpId(e.target.value)
                    setSchedEmpName(emp?.name ?? '')
                  }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                >
                  <option value="">Selecione o colaborador...</option>
                  {allEmployees.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Data início <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={schedStart}
                    onChange={e => {
                      setSchedStart(e.target.value)
                      if (e.target.value && schedEnd) setSchedDays(String(calcDays(e.target.value, schedEnd)))
                    }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Data fim <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={schedEnd}
                    onChange={e => {
                      setSchedEnd(e.target.value)
                      if (schedStart && e.target.value) setSchedDays(String(calcDays(schedStart, e.target.value)))
                    }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Dias de férias <span className="text-gray-400 font-normal normal-case">(calculado automaticamente)</span>
                </label>
                <input
                  type="number"
                  value={schedDays}
                  onChange={e => setSchedDays(e.target.value)}
                  placeholder="Ex: 30"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Observações <span className="text-gray-400 font-normal normal-case">(opcional)</span>
                </label>
                <textarea
                  value={schedObs}
                  onChange={e => setSchedObs(e.target.value)}
                  rows={2}
                  placeholder="Ex: Férias combinadas com RH..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowScheduleModal(false)}
                disabled={schedLoading}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSchedule}
                disabled={schedLoading}
                className="flex-1 bg-[#F5A623] hover:bg-[#d4891a] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {schedLoading ? <Loader2 size={14} className="animate-spin" /> : <CalendarDays size={14} />}
                Agendar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState({ label, icon = '📭' }: { label: string; icon?: string }) {
  return (
    <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
      <span className="text-3xl block mb-2">{icon}</span>
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  )
}
