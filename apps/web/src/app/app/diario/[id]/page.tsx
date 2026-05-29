'use client'

import { useEffect, useState, useCallback, type ReactNode } from 'react'
import { useRouter, useParams }              from 'next/navigation'
import Link                                  from 'next/link'
import dynamic                               from 'next/dynamic'
import { List, LayoutGrid, AlignLeft }       from 'lucide-react'
import { Button }                            from '@/components/ui/Button'
import { Badge }                             from '@/components/ui/Badge'
import { PageHeader }                        from '@/components/ui/PageHeader'
import { SemAcesso }                         from '@/components/SemAcesso'
import { usePermissions }                    from '@/hooks/usePermissions'
import type { BadgeVariant }                 from '@/components/ui/Badge'
import { resolveUploadUrl }                  from '@/lib/upload'
import { PhotoCarousel }                     from '../components/PhotoCarousel'

// RainChart carregado dinamicamente (usa recharts)
const RainChart = dynamic(() => import('@/components/diary/RainChart'), { ssr: false })

// Pasta de projetos — somente leitura (mesmo visual do Centro de Custo)
const PastaDeProjetosTab = dynamic(
  () => import('@/components/project/PastaDeProjetosTab').then(m => ({ default: m.PastaDeProjetosTab })),
  { ssr: false, loading: () => (
    <div className="flex items-center justify-center py-16">
      <svg className="animate-spin h-6 w-6 text-[#F5A623]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    </div>
  )},
)

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DiaryReport {
  id:               string
  date:             string
  reportNumber:     string | null
  status:           string
  signatureStatus?: string
  isComplement:   boolean
  complementLetter: string | null
  totalRainMm:    number
  weatherMorning: string | null
  workableMorning:   boolean
  workableAfternoon: boolean
  workableNight:     boolean
  generalActivities: string | null
  author:         { id: string; name: string; avatarUrl: string | null }
  approvedBy:     { id: string; name: string } | null
  stageEntries:   StageEntry[]
  occurrences:    Occurrence[]
  rainRecord:     RainRecord | null
  imageUrls:      string[]
  _count:         { comments: number }
}

interface StageEntry {
  stageId:          string
  currentProgress:  number
  previousProgress: number
  progressDelta:    number
  activities:       string
  stage:            { id: string; name: string; code: string | null }
}

interface Occurrence {
  id:          string
  type:        string
  severity:    string
  description: string
  action:      string | null
}

interface RainRecord {
  morningMm:   number
  afternoonMm: number
  nightMm:     number
  totalMm:     number
  isUnworkable:boolean
}

interface ProjectInfo {
  id:              string
  name:            string
  code:            string | null
  status:          string
  progressPercent: number
  client:          { id: string; name: string } | null
  responsible:     { id: string; name: string; avatarUrl: string | null } | null
  stages:          { id: string; name: string; progressPercent: number; status: string }[]
}

export interface RainDay {
  date:             string
  totalMm:          number
  morningMm:        number
  afternoonMm:      number
  nightMm:          number
  isUnworkable:     boolean
  unworkableReason: string | null
}

interface RainSummary {
  totalMm:        number
  rainyDays:      number
  unworkableDays: number
  maxRainDay:     { date: string; totalMm: number } | null
  averagePerMonth:{ month: string; totalMm: number; unworkableDays: number; rainyDays: number }[]
}

// ─── Labels ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; variant: BadgeVariant }> = {
  DRAFT:                       { label: 'Rascunho',              variant: 'gray'   },
  PENDING:                     { label: 'Aguardando aprovação',  variant: 'yellow' },
  APPROVED:                    { label: 'Aprovado',              variant: 'green'  },
  REJECTED:                    { label: 'Devolvido p/ correção', variant: 'red'    },
  APPROVED_PENDING_SIGNATURES: { label: 'Aprovado · Ass. pendentes', variant: 'orange' },
}

const WEATHER_LABEL: Record<string, string> = {
  SUNNY: '☀️ Ensolarado', CLOUDY: '🌤 Nublado', OVERCAST: '☁️ Encoberto',
  RAINY: '🌧 Chuvoso',    STORMY: '⛈ Tempestade',
}

const OCC_TYPE: Record<string, string> = {
  ACCIDENT: 'Acidente', INCIDENT: 'Incidente', VISIT: 'Visita',
  INSPECTION: 'Vistoria', STOPPAGE: 'Paralisação',
  NONCONFORMITY: 'Não-conformidade', OTHER: 'Outro',
}

const SEV_CFG: Record<string, { label: string; variant: BadgeVariant }> = {
  LOW:      { label: 'Baixa',    variant: 'gray'   },
  MEDIUM:   { label: 'Média',    variant: 'yellow' },
  HIGH:     { label: 'Alta',     variant: 'orange' },
  CRITICAL: { label: 'Crítica',  variant: 'red'    },
}

function fmtDate(iso: string) {
  const d = iso.slice(0, 10)
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}

type TabId    = 'reports' | 'stages' | 'rain' | 'photos' | 'files' | 'occurrences' | 'equipments'
type ViewMode = 'lista' | 'card' | 'compacto'

const LS_VIEW_KEY = 'sysobra:rdo-view-mode'

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DiarioProjectPage() {
  const router    = useRouter()
  const params    = useParams()
  const projectId = params.id as string

  const { canAccessModule, can } = usePermissions()

  // ── TODOS os hooks antes de qualquer return condicional ───────────────────
  const [project,  setProject]  = useState<ProjectInfo | null>(null)
  const [reports,  setReports]  = useState<DiaryReport[]>([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(1)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [tab,      setTab]      = useState<TabId>('reports')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [rainRecords,  setRainRecords]  = useState<RainDay[]>([])
  const [rainSummary,  setRainSummary]  = useState<RainSummary | null>(null)
  const [rainLoading,  setRainLoading]  = useState(false)
  const [viewMode,      setViewMode]      = useState<ViewMode>('lista')
  const [carouselOpen,  setCarouselOpen]  = useState(false)
  const [carouselIndex, setCarouselIndex] = useState(0)

  // ── Aba Ferramentas ──────────────────────────────────────────────────────
  const [rdoTools,       setRdoTools]       = useState<any[]>([])
  const [rdoToolsLoading, setRdoToolsLoading] = useState(false)

  const LIMIT    = 20
  const canCreate = can('diario_obra', 'create')

  // ── Carrega relatórios ────────────────────────────────────────────────────
  const loadReports = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) { router.replace('/login'); return }
    setLoading(true); setError('')
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
      if (statusFilter !== 'ALL') qs.set('status', statusFilter)
      const res  = await fetch(`${API}/api/v1/diary/projects/${projectId}/reports?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar relatórios')
      setProject(data.project)
      setReports(data.entries ?? [])
      setTotal(data.total ?? 0)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [router, projectId, page, statusFilter])

  useEffect(() => { loadReports() }, [loadReports])

  // ── Carrega chuva quando abre a aba ──────────────────────────────────────
  useEffect(() => {
    if (tab !== 'rain' || rainRecords.length > 0) return
    const token = localStorage.getItem('token')
    if (!token) return
    setRainLoading(true)
    fetch(`${API}/api/v1/diary/projects/${projectId}/rain`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => { setRainRecords(d.records ?? []); setRainSummary(d.summary ?? null) })
      .catch(() => {})
      .finally(() => setRainLoading(false))
  }, [tab, projectId, rainRecords.length])

  // ── Carrega ferramentas da obra quando a aba abre ─────────────────────────
  const loadRdoTools = async () => {
    const token     = localStorage.getItem('token') || ''
    const companyId = localStorage.getItem('companyId') || ''
    setRdoToolsLoading(true)
    try {
      const res  = await fetch(`${API}/api/v1/deposit/tools/by-project/${projectId}`, {
        headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId },
      })
      const data = await res.json()
      setRdoTools(data.tools ?? [])
    } catch {} finally { setRdoToolsLoading(false) }
  }

  useEffect(() => {
    if (tab === 'equipments') loadRdoTools()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // ── Restaura modo de visualização do localStorage ─────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(LS_VIEW_KEY) as ViewMode | null
    if (saved === 'lista' || saved === 'card' || saved === 'compacto') {
      setViewMode(saved)
    }
  }, [])

  // ── Return condicional DEPOIS de todos os hooks ───────────────────────────
  if (!canAccessModule('diario_obra')) return <SemAcesso modulo="Diário de Obra" />

  // ── Agrega fotos e ocorrências de todos os relatórios ────────────────────
  const allPhotos = reports.flatMap((r) => [
    ...(r.imageUrls ?? []),
    ...(r.stageEntries ?? []).flatMap((se: any) => se.photos ?? []),
  ])
  const allOccurrences = reports.flatMap((r) =>
    (r.occurrences ?? []).map((o) => ({ ...o, reportNumber: r.reportNumber, reportDate: r.date }))
  )

  // ── Agrupa relatórios por data ────────────────────────────────────────────
  const reportsByDate = reports.reduce<Record<string, DiaryReport[]>>((acc, r) => {
    const dateKey = r.date.substring(0, 10)
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(r)
    return acc
  }, {})

  // ─── Tabs com badge pluviométrico ─────────────────────────────────────────
  const rainTabLabel = rainSummary
    ? `🌧 Pluviometria — ${rainSummary.totalMm.toFixed(0)}mm${rainSummary.unworkableDays > 0 ? ` | ${rainSummary.unworkableDays} imp.` : ''}`
    : '🌧 Pluviometria'

  const TABS: { id: TabId; label: string }[] = [
    { id: 'reports',     label: `Relatórios${total > 0 ? ` (${total})` : ''}` },
    { id: 'stages',      label: 'Etapas' },
    { id: 'rain',        label: rainTabLabel },
    { id: 'photos',      label: `Fotos${allPhotos.length > 0 ? ` (${allPhotos.length})` : ''}` },
    { id: 'files',       label: '📁 Pasta de Projetos' },
    { id: 'occurrences', label: `Ocorrências${allOccurrences.length > 0 ? ` (${allOccurrences.length})` : ''}` },
    { id: 'equipments',  label: '🔧 Ferramentas' },
  ]

  return (
    <div className="relative pb-20">
      <PageHeader
        title={project?.name ?? 'Carregando...'}
        subtitle={project ? `${project.code ?? ''} — Diário de Obra`.replace(/^— /, '') : undefined}
        breadcrumbs={[
          { label: 'Diário de Obra', href: '/app/diario' },
          { label: project?.name ?? '...' },
        ]}
        actions={
          canCreate ? (
            <Link href={`/app/diario/${projectId}/novo`}>
              <Button size="sm">+ Novo RDO</Button>
            </Link>
          ) : undefined
        }
      />

      {/* Métricas rápidas */}
      {project && (
        <div className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
            <MetricCard icon="📋" label="Relatórios" value={String(total)} />
            <MetricCard icon="📈" label="Progresso"  value={`${Number(project.progressPercent).toFixed(0)}%`} bar={Number(project.progressPercent)} />
            <MetricCard icon="🌧" label="Chuva total" value={rainSummary ? `${rainSummary.totalMm.toFixed(0)} mm` : '—'} />
            <MetricCard icon="⛔" label="Dias imp."   value={rainSummary ? String(rainSummary.unworkableDays) : '—'} />
          </div>
          <Link href={`/app/centro-de-custo/${projectId}`}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#F5A623] transition-colors">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3" />
            </svg>
            Ver obra no Centro de Custo →
          </Link>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
      )}

      {/* Abas */}
      <div className="border-b border-gray-200 mb-5">
        <nav className="flex gap-0 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id
                  ? 'border-[#F5A623] text-[#F5A623]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Tab: Relatórios ─────────────────────────────────────────────── */}
      {tab === 'reports' && (
        <div>
          {/* Barra de filtros + toggle de visualização */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <select value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
              <option value="ALL">Todos os status</option>
              <option value="DRAFT">Rascunho</option>
              <option value="PENDING">Aguardando aprovação</option>
              <option value="APPROVED">Aprovado</option>
              <option value="REJECTED">Devolvido</option>
            </select>
            <span className="text-sm text-gray-400">{total} relatório{total !== 1 ? 's' : ''}</span>

            {/* Botões de visualização */}
            <div className="ml-auto flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {([
                { mode: 'lista'    as ViewMode, icon: <List size={14} />,       title: 'Lista'     },
                { mode: 'card'     as ViewMode, icon: <LayoutGrid size={14} />, title: 'Cards'     },
                { mode: 'compacto' as ViewMode, icon: <AlignLeft size={14} />,  title: 'Compacto'  },
              ] as { mode: ViewMode; icon: ReactNode; title: string }[]).map(({ mode, icon, title }) => (
                <button
                  key={mode}
                  title={title}
                  onClick={() => { setViewMode(mode); localStorage.setItem(LS_VIEW_KEY, mode) }}
                  className={`p-1.5 rounded-md transition-all ${
                    viewMode === mode
                      ? 'bg-white text-[#F5A623] shadow-sm'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : reports.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
              <p className="text-sm">Nenhum relatório encontrado.</p>
              {canCreate && (
                <Link href={`/app/diario/${projectId}/novo`} className="mt-3 inline-block">
                  <Button size="sm">Criar primeiro RDO</Button>
                </Link>
              )}
            </div>
          ) : (
            <>
              {/* ── Modo: LISTA (tabela agrupada por data) ──────────────── */}
              {viewMode === 'lista' && (
                <div className="space-y-3">
                  {Object.entries(reportsByDate)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .map(([dateKey, dayReports]) => (
                      <div key={dateKey} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-600">{fmtDate(dayReports[0].date)}</span>
                          {dayReports.length > 1 && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                              {dayReports.length} RDOs neste dia
                            </span>
                          )}
                        </div>
                        <table className="w-full">
                          <tbody>
                            {dayReports.map((r) => {
                              const sc = STATUS_CFG[r.signatureStatus ?? r.status] ?? STATUS_CFG.PENDING
                              const isUnworkable = !r.workableMorning || !r.workableAfternoon || !r.workableNight
                              return (
                                <tr key={r.id}
                                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                                  <td className="px-4 py-3" style={{ paddingLeft: r.isComplement ? '2rem' : undefined }}>
                                    <div className="flex items-center gap-2">
                                      {r.isComplement && <span className="w-1 h-5 bg-amber-300 rounded-full flex-shrink-0" />}
                                      <div>
                                        <span className="text-sm font-semibold text-gray-800">{r.reportNumber ?? '—'}</span>
                                        {r.isComplement && (
                                          <span className="ml-2 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-semibold">
                                            Complemento
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 hidden sm:table-cell">
                                    <div className="flex items-center gap-1.5">
                                      {r.weatherMorning && <span className="text-xs">{WEATHER_LABEL[r.weatherMorning]?.split(' ')[0]}</span>}
                                      {r.totalRainMm > 0 && <span className="text-xs text-blue-600 font-medium">{Number(r.totalRainMm).toFixed(0)} mm</span>}
                                      {isUnworkable && <span className="text-[10px] text-red-500 font-semibold">IMPRAT.</span>}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <Badge variant={sc.variant} size="sm">{sc.label}</Badge>
                                  </td>
                                  <td className="px-4 py-3 hidden md:table-cell">
                                    <p className="text-xs text-gray-500">{r.author.name}</p>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <Link href={`/app/diario/${projectId}/${r.id}`}
                                      className="text-xs font-medium text-[#F5A623] hover:text-[#d4891a]">
                                      Ver →
                                    </Link>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                </div>
              )}

              {/* ── Modo: CARD (grid 2 colunas) ─────────────────────────── */}
              {viewMode === 'card' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {reports
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((r) => {
                      const sc = STATUS_CFG[r.signatureStatus ?? r.status] ?? STATUS_CFG.PENDING
                      const isUnworkable = !r.workableMorning || !r.workableAfternoon || !r.workableNight
                      return (
                        <Link key={r.id} href={`/app/diario/${projectId}/${r.id}`}
                          className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-all hover:border-amber-200 flex flex-col" style={{ minHeight: 160, maxHeight: 200 }}>
                          {/* Topo */}
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="text-sm font-bold text-gray-800">{r.reportNumber ?? '—'}</p>
                              <p className="text-xs text-gray-400">{fmtDate(r.date)}</p>
                            </div>
                            <Badge variant={sc.variant} size="sm">{sc.label}</Badge>
                          </div>
                          {/* Clima */}
                          <div className="flex items-center gap-2 mb-2">
                            {r.weatherMorning && <span className="text-sm">{WEATHER_LABEL[r.weatherMorning]?.split(' ')[0]}</span>}
                            {r.totalRainMm > 0 && (
                              <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                🌧 {Number(r.totalRainMm).toFixed(0)} mm
                              </span>
                            )}
                            {isUnworkable && (
                              <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                                ⛔ Impraticável
                              </span>
                            )}
                          </div>
                          {/* Resumo de atividades */}
                          {r.generalActivities && (
                            <p className="text-xs text-gray-500 line-clamp-2 flex-1">{r.generalActivities}</p>
                          )}
                          {/* Rodapé */}
                          <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-50">
                            <p className="text-[10px] text-gray-400 truncate max-w-[60%]">{r.author.name}</p>
                            {r.isComplement && (
                              <span className="text-[9px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full font-semibold">
                                Complemento
                              </span>
                            )}
                          </div>
                        </Link>
                      )
                    })}
                </div>
              )}

              {/* ── Modo: COMPACTO (chips em linha única) ────────────────── */}
              {viewMode === 'compacto' && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  {reports
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((r, idx) => {
                      const sc = STATUS_CFG[r.signatureStatus ?? r.status] ?? STATUS_CFG.PENDING
                      const isUnworkable = !r.workableMorning || !r.workableAfternoon || !r.workableNight
                      return (
                        <Link key={r.id} href={`/app/diario/${projectId}/${r.id}`}
                          className={`flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors ${idx !== 0 ? 'border-t border-gray-100' : ''}`}>
                          {/* Número */}
                          <span className="text-xs font-mono font-semibold text-gray-700 w-16 flex-shrink-0">
                            {r.reportNumber ?? '—'}
                          </span>
                          {/* Data */}
                          <span className="text-xs text-gray-400 w-20 flex-shrink-0">
                            {fmtDate(r.date).slice(0, 5)}
                          </span>
                          {/* Clima + chuva */}
                          <span className="text-xs text-gray-500 flex items-center gap-1 w-24 flex-shrink-0">
                            {r.weatherMorning && WEATHER_LABEL[r.weatherMorning]?.split(' ')[0]}
                            {r.totalRainMm > 0 && <span className="text-blue-500">{Number(r.totalRainMm).toFixed(0)}mm</span>}
                          </span>
                          {/* Status */}
                          <Badge variant={sc.variant} size="sm">{sc.label}</Badge>
                          {/* Tags extras */}
                          <div className="flex items-center gap-1 flex-1">
                            {isUnworkable && <span className="text-[9px] text-red-500 font-bold bg-red-50 px-1.5 py-0.5 rounded-full">⛔</span>}
                            {r.isComplement && <span className="text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">Compl.</span>}
                            {(r.occurrences?.length ?? 0) > 0 && (
                              <span className="text-[9px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">
                                {r.occurrences.length} ocor.
                              </span>
                            )}
                          </div>
                          {/* Autor */}
                          <span className="text-[10px] text-gray-400 hidden lg:inline truncate max-w-[100px]">{r.author.name}</span>
                        </Link>
                      )
                    })}
                </div>
              )}

              {total > LIMIT && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-gray-400">
                    {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} de {total}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      ← Anterior
                    </Button>
                    <Button variant="secondary" size="sm" disabled={page * LIMIT >= total} onClick={() => setPage((p) => p + 1)}>
                      Próxima →
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Tab: Etapas ──────────────────────────────────────────────────── */}
      {tab === 'stages' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          {!project?.stages?.length ? (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-400 mb-3">Nenhuma etapa cadastrada nesta obra.</p>
              <a
                href={`/app/centro-de-custo/${projectId}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#F5A623] hover:underline"
              >
                Cadastrar etapas no Centro de Custo →
              </a>
            </div>
          ) : (
            (project.stages ?? []).map((stage) => {
              const pct = Math.min(100, Number(stage.progressPercent) || 0)
              return (
                <div key={stage.id} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-800">{stage.name}</p>
                    <span className={`text-sm font-bold ${pct >= 100 ? 'text-green-600' : 'text-gray-700'}`}>
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: pct >= 100 ? '#16a34a' : '#F5A623',
                      }} />
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── Tab: Pluviometria ────────────────────────────────────────────── */}
      {tab === 'rain' && (
        <div>
          {rainLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <RainChart
              records={rainRecords}
              summary={rainSummary}
              projectId={projectId}
              projectName={project?.name ?? ''}
            />
          )}
        </div>
      )}

      {/* ── Tab: Fotos ───────────────────────────────────────────────────── */}
      {tab === 'photos' && (
        <div>
          {allPhotos.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
              <p className="text-sm">Nenhuma foto registrada ainda.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {allPhotos.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setCarouselIndex(i); setCarouselOpen(true) }}
                    className="block rounded-xl overflow-hidden border border-gray-200 hover:border-[#F5A623] hover:opacity-90 transition-all focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveUploadUrl(url)}
                      alt={`Foto ${i + 1}`}
                      className="w-full h-32 object-cover"
                    />
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">Clique em uma foto para ampliar</p>
              <PhotoCarousel
                photos={allPhotos.map(url => ({ url }))}
                initialIndex={carouselIndex}
                isOpen={carouselOpen}
                onClose={() => setCarouselOpen(false)}
              />
            </>
          )}
        </div>
      )}

      {/* ── Tab: Pasta de Projetos (somente leitura) ────────────────────── */}
      {tab === 'files' && (
        <PastaDeProjetosTab
          projectId={projectId}
          readOnly
        />
      )}

      {/* ── Tab: Ocorrências ─────────────────────────────────────────────── */}
      {tab === 'occurrences' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {allOccurrences.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">Nenhuma ocorrência registrada.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">RDO / Data</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Severidade</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Descrição</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 hidden md:table-cell">Providência</th>
                </tr>
              </thead>
              <tbody>
                {allOccurrences.map((o: any, i: number) => {
                  const sev = SEV_CFG[o.severity] ?? SEV_CFG.LOW
                  return (
                    <tr key={o.id} className={`border-b border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-50'}`}>
                      <td className="px-4 py-3">
                        <p className="text-xs font-medium text-gray-700">{o.reportNumber ?? '—'}</p>
                        <p className="text-[10px] text-gray-400">{fmtDate(o.reportDate)}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700">{OCC_TYPE[o.type] ?? o.type}</td>
                      <td className="px-4 py-3"><Badge variant={sev.variant} size="sm">{sev.label}</Badge></td>
                      <td className="px-4 py-3 text-xs text-gray-600 max-w-[240px]">
                        <p className="line-clamp-2">{o.description}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">{o.action || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tab: Ferramentas ────────────────────────────────────────────── */}
      {tab === 'equipments' && (
        <div className="pb-6">
          <div className="mb-4">
            <h3 className="text-base font-bold text-gray-900">Ferramentas alocadas nesta obra</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Ferramentas atualmente em uso e histórico de devoluções.
            </p>
          </div>

          {rdoToolsLoading ? (
            <div className="text-center py-10 text-gray-400 text-sm">Carregando...</div>
          ) : rdoTools.length === 0 ? (
            <div className="text-center py-14 text-gray-400 text-sm">
              <i className="ti ti-tool text-4xl block mb-3 text-gray-300" />
              Nenhuma ferramenta alocada nesta obra
            </div>
          ) : (
            <div>
              {/* Em uso */}
              {rdoTools.filter((t: any) => !t.returnedAt).length > 0 && (
                <div className="mb-5">
                  <div className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-3">
                    ⚙️ Em uso ({rdoTools.filter((t: any) => !t.returnedAt).length})
                  </div>
                  <div className="space-y-2">
                    {rdoTools.filter((t: any) => !t.returnedAt).map((tool: any) => {
                      const imgUrl = tool.imageUrl
                        ? tool.imageUrl.startsWith('http') ? tool.imageUrl
                          : `${API}${tool.imageUrl.startsWith('/') ? '' : '/'}${tool.imageUrl}`
                        : null
                      return (
                        <div key={tool.id} className="flex items-center gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50">
                          {imgUrl ? (
                            <img src={imgUrl} className="w-10 h-10 rounded-lg object-cover border border-gray-200 flex-shrink-0"
                              onError={e => { e.currentTarget.style.display = 'none' }} />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <i className="ti ti-tool text-lg text-gray-300" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-gray-900">{tool.name}</div>
                            <div className="text-xs text-gray-500">
                              {[tool.brand, tool.model, tool.serialNumber ? `Série: ${tool.serialNumber}` : null].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                          <span className="flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">⚙️ Em uso</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Devolvidas */}
              {rdoTools.filter((t: any) => t.returnedAt).length > 0 && (
                <div>
                  <div className="text-xs font-bold text-green-600 uppercase tracking-wide mb-3">
                    ✅ Devolvidas ({rdoTools.filter((t: any) => t.returnedAt).length})
                  </div>
                  <div className="space-y-2">
                    {rdoTools.filter((t: any) => t.returnedAt).map((tool: any) => (
                      <div key={tool.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-green-200 bg-green-50 text-sm">
                        <div className="flex items-center gap-2">
                          <i className="ti ti-circle-check text-green-600" />
                          <span className="font-medium text-gray-900">{tool.name}</span>
                          {tool.serialNumber && <span className="text-xs text-gray-400">({tool.serialNumber})</span>}
                        </div>
                        <span className="text-xs text-gray-500">
                          Devolvida em {new Date(tool.returnedAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 text-center">
                <a href="/app/deposito" className="text-sm text-amber-600 hover:underline font-medium">
                  Gerenciar ferramentas no depósito →
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── FAB — Novo RDO ───────────────────────────────────────────────── */}
      {canCreate && (
        <Link href={`/app/diario/${projectId}/novo`}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[#F5A623] hover:bg-[#d4891a] text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          title="Novo RDO">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </Link>
      )}
    </div>
  )
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

function MetricCard({ icon, label, value, sub, bar }: {
  icon: string; label: string; value: string; sub?: string; bar?: number
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-1">
        <span>{icon}</span>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className="text-xl font-bold text-gray-800">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      {bar !== undefined && (
        <div className="mt-2 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-[#F5A623] rounded-full" style={{ width: `${Math.min(100, bar)}%` }} />
        </div>
      )}
    </div>
  )
}
