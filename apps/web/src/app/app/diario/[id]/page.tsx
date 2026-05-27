'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams }              from 'next/navigation'
import Link                                  from 'next/link'
import dynamic                               from 'next/dynamic'
import { Button }                            from '@/components/ui/Button'
import { Badge }                             from '@/components/ui/Badge'
import { PageHeader }                        from '@/components/ui/PageHeader'
import { SemAcesso }                         from '@/components/SemAcesso'
import { usePermissions }                    from '@/hooks/usePermissions'
import type { BadgeVariant }                 from '@/components/ui/Badge'

// RainChart carregado dinamicamente (usa recharts)
const RainChart = dynamic(() => import('@/components/diary/RainChart'), { ssr: false })

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DiaryReport {
  id:             string
  date:           string
  reportNumber:   string | null
  status:         string
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
  DRAFT:    { label: 'Rascunho',              variant: 'gray'   },
  PENDING:  { label: 'Aguardando aprovação',  variant: 'yellow' },
  APPROVED: { label: 'Aprovado',              variant: 'green'  },
  REJECTED: { label: 'Devolvido p/ correção', variant: 'red'    },
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
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

type TabId = 'reports' | 'stages' | 'rain' | 'photos' | 'occurrences'

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
    { id: 'occurrences', label: `Ocorrências${allOccurrences.length > 0 ? ` (${allOccurrences.length})` : ''}` },
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
          <div className="flex items-center gap-3 mb-4">
            <select value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
              <option value="ALL">Todos os status</option>
              <option value="DRAFT">Rascunho</option>
              <option value="PENDING">Aguardando aprovação</option>
              <option value="APPROVED">Aprovado</option>
              <option value="REJECTED">Devolvido</option>
            </select>
            <span className="text-sm text-gray-400">{total} relatório{total !== 1 ? 's' : ''}</span>
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
              {/* Relatórios agrupados por data */}
              <div className="space-y-3">
                {Object.entries(reportsByDate)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([dateKey, dayReports]) => (
                    <div key={dateKey} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                      {/* Cabeçalho do grupo (data) */}
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
                            const sc = STATUS_CFG[r.status] ?? STATUS_CFG.PENDING
                            const isUnworkable = !r.workableMorning || !r.workableAfternoon || !r.workableNight
                            return (
                              <tr key={r.id}
                                className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors ${r.isComplement ? 'pl-4' : ''}`}>
                                <td className="px-4 py-3" style={{ paddingLeft: r.isComplement ? '2rem' : undefined }}>
                                  <div className="flex items-center gap-2">
                                    {r.isComplement && <span className="w-1 h-full bg-amber-300 rounded-full" />}
                                    <div>
                                      <span className="text-sm font-semibold text-gray-800">
                                        {r.reportNumber ?? '—'}
                                      </span>
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
                                    {r.weatherMorning && (
                                      <span className="text-xs">{WEATHER_LABEL[r.weatherMorning]?.split(' ')[0]}</span>
                                    )}
                                    {r.totalRainMm > 0 && (
                                      <span className="text-xs text-blue-600 font-medium">{Number(r.totalRainMm).toFixed(0)} mm</span>
                                    )}
                                    {isUnworkable && (
                                      <span className="text-[10px] text-red-500 font-semibold">IMPRAT.</span>
                                    )}
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
            <p className="p-8 text-center text-sm text-gray-400">Nenhuma etapa cadastrada.</p>
          ) : (
            (project.stages ?? []).map((stage) => (
              <div key={stage.id} className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-800">{stage.name}</p>
                  <span className="text-sm font-bold text-gray-700">{Number(stage.progressPercent).toFixed(0)}%</span>
                </div>
                <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, Number(stage.progressPercent))}%`,
                      background: Number(stage.progressPercent) >= 100 ? '#16a34a' : '#F5A623',
                    }} />
                </div>
              </div>
            ))
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {allPhotos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Foto ${i + 1}`}
                    className="w-full h-32 object-cover rounded-xl border border-gray-200 hover:opacity-90 transition-opacity" />
                </a>
              ))}
            </div>
          )}
        </div>
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
