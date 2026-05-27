'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter }                         from 'next/navigation'
import Link                                  from 'next/link'
import Image                                 from 'next/image'
import { PageHeader }                        from '@/components/ui/PageHeader'
import { Badge }                             from '@/components/ui/Badge'
import { SemAcesso }                         from '@/components/SemAcesso'
import { usePermissions }                    from '@/hooks/usePermissions'
import type { BadgeVariant }                 from '@/components/ui/Badge'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Stage {
  id:              string
  name:            string
  progressPercent: number
  status:          string
}

interface LastReport {
  id:           string
  date:         string
  status:       string
  reportNumber: string | null
  author:       { name: string }
}

interface DiaryProject {
  id:              string
  name:            string
  code:            string | null
  coverImage:      string | null
  status:          string
  client:          { id: string; name: string } | null
  responsible:     { id: string; name: string; avatarUrl: string | null } | null
  startDate:       string | null
  expectedEndDate: string | null
  progressPercent: number
  stages:          Stage[]
  lastReport:      LastReport | null
  totalReports:    number
  totalRainMm:     number
  unworkableDays:  number
}

// ─── Configurações ────────────────────────────────────────────────────────────

const PROJECT_STATUS: Record<string, { label: string; variant: BadgeVariant; color: string }> = {
  PLANNING:    { label: 'Planejamento', variant: 'blue',   color: 'from-blue-400   to-blue-600'   },
  IN_PROGRESS: { label: 'Em andamento', variant: 'green',  color: 'from-emerald-400 to-emerald-600' },
  ON_HOLD:     { label: 'Pausado',      variant: 'yellow', color: 'from-amber-400  to-amber-600'  },
  FINISHED:    { label: 'Concluído',    variant: 'teal',   color: 'from-teal-400   to-teal-600'   },
  CANCELLED:   { label: 'Cancelado',    variant: 'red',    color: 'from-gray-400   to-gray-600'   },
}

const REPORT_STATUS: Record<string, { label: string; dot: string }> = {
  DRAFT:    { label: 'Rascunho',       dot: 'bg-gray-400'  },
  PENDING:  { label: 'Aguard. aprov.', dot: 'bg-amber-400' },
  APPROVED: { label: 'Aprovado',       dot: 'bg-green-500' },
  REJECTED: { label: 'Devolvido',      dot: 'bg-red-500'   },
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Modal de seleção de obra ─────────────────────────────────────────────────

function ProjectSelectModal({
  projects,
  onClose,
}: {
  projects: DiaryProject[]
  onClose:  () => void
}) {
  const router  = useRouter()
  const [search, setSearch] = useState('')

  const filtered = projects.filter((p) =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.code ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.client?.name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  function go(projectId: string) {
    onClose()
    router.push(`/app/diario/${projectId}/novo`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-800">Selecionar obra para o RDO</h2>
            <p className="text-xs text-gray-400 mt-0.5">{projects.length} obra{projects.length !== 1 ? 's' : ''} disponível{projects.length !== 1 ? 'is' : ''}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            ✕
          </button>
        </div>

        {/* Busca */}
        <div className="px-5 py-3 border-b border-gray-100">
          <input
            type="text"
            autoFocus
            placeholder="Buscar por nome, código ou cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>

        {/* Lista de obras */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">Nenhuma obra encontrada</p>
          ) : (
            filtered.map((proj) => {
              const sc = PROJECT_STATUS[proj.status] ?? PROJECT_STATUS.IN_PROGRESS
              return (
                <button
                  key={proj.id}
                  onClick={() => go(proj.id)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-orange-50 transition-colors text-left group"
                >
                  {/* Miniatura */}
                  <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                    {proj.coverImage ? (
                      <Image src={proj.coverImage} alt={proj.name} width={40} height={40} className="object-cover w-full h-full" />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-br ${sc.color} opacity-80`} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-[#F5A623] transition-colors">
                      {proj.name}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {[proj.code, proj.client?.name].filter(Boolean).join(' · ')}
                    </p>
                  </div>

                  {/* Status + progresso */}
                  <div className="flex-shrink-0 text-right">
                    <p className="text-sm font-bold text-gray-700">{proj.progressPercent.toFixed(0)}%</p>
                    <Badge variant={sc.variant} size="sm">{sc.label}</Badge>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DiarioPage() {
  const router = useRouter()
  const { canAccessModule, can } = usePermissions()

  const [projects,       setProjects]       = useState<DiaryProject[]>([])
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState('')
  const [search,         setSearch]         = useState('')
  const [status,         setStatus]         = useState('ALL')
  const [showNewModal,   setShowNewModal]   = useState(false)

  const canCreate = can('diario_obra', 'create')

  // ── Todos os hooks ANTES do return condicional ────────────────────────────
  const loadProjects = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) { router.replace('/login'); return }
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (status !== 'ALL') params.set('status', status)
      const res  = await fetch(`${API}/api/v1/diary/projects?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar obras')
      setProjects(data.projects ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [router, search, status])

  useEffect(() => { loadProjects() }, [loadProjects])

  // Return condicional APÓS todos os hooks
  if (!canAccessModule('diario_obra')) {
    return <SemAcesso modulo="Diário de Obra" />
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Diário de Obra"
        subtitle="Relatórios Diários de Obra (RDO) por projeto."
        actions={
          <div className="flex items-center gap-2">
            {canCreate && (
              <button
                onClick={() => setShowNewModal(true)}
                className="flex items-center gap-2 bg-[#F5A623] hover:bg-[#d4891a] text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Novo RDO
              </button>
            )}
            <Link href="/app/diario/configuracoes">
              <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Configurações
              </button>
            </Link>
          </div>
        }
      />

      {/* Modal de seleção de obra */}
      {showNewModal && (
        <ProjectSelectModal
          projects={projects}
          onClose={() => setShowNewModal(false)}
        />
      )}

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          type="text"
          placeholder="Buscar obra..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white min-w-[200px]"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
        >
          <option value="ALL">Todos os status</option>
          <option value="IN_PROGRESS">Em andamento</option>
          <option value="PLANNING">Planejamento</option>
          <option value="ON_HOLD">Pausado</option>
          <option value="FINISHED">Concluído</option>
        </select>
        {projects.length > 0 && (
          <span className="text-xs text-gray-400">{projects.length} obra{projects.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-9 h-9 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-gray-400">
          <svg className="w-14 h-14 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5" />
          </svg>
          <p className="text-sm font-medium">Nenhuma obra encontrada</p>
          <p className="text-xs">Verifique os filtros ou aguarde obras serem cadastradas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {projects.map((proj) => (
            <ProjectCard key={proj.id} project={proj} canCreate={canCreate} />
          ))}
        </div>
      )}

      {/* FAB — Novo RDO */}
      {canCreate && (
        <button
          onClick={() => setShowNewModal(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[#F5A623] hover:bg-[#d4891a] text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          title="Novo RDO"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ─── Card compacto de projeto ─────────────────────────────────────────────────

function ProjectCard({ project: proj, canCreate }: { project: DiaryProject; canCreate: boolean }) {
  const sc  = PROJECT_STATUS[proj.status] ?? PROJECT_STATUS.IN_PROGRESS
  const rpt = proj.lastReport ? (REPORT_STATUS[proj.lastReport.status] ?? REPORT_STATUS.PENDING) : null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-[#F5A623]/40 transition-all group flex items-stretch gap-0 overflow-hidden">

      {/* ── Miniatura lateral ─────────────────────────────────── */}
      <div className="relative w-[68px] flex-shrink-0">
        {proj.coverImage ? (
          <Image
            src={proj.coverImage}
            alt={proj.name}
            fill
            className="object-cover"
            sizes="68px"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-b ${sc.color}`} />
        )}
        {/* Barra de progresso vertical */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
          <div
            className="h-full bg-white/80 transition-all"
            style={{ width: `${Math.min(100, proj.progressPercent)}%` }}
          />
        </div>
      </div>

      {/* ── Conteúdo central ─────────────────────────────────── */}
      <div className="flex-1 min-w-0 px-3 py-2.5 flex flex-col justify-between">
        {/* Linha 1: nome + status */}
        <div className="flex items-start gap-1.5">
          <p className="text-sm font-semibold text-gray-800 truncate flex-1 leading-tight">
            {proj.name}
          </p>
          <Badge variant={sc.variant} size="sm">{sc.label}</Badge>
        </div>

        {/* Linha 2: código + cliente */}
        <p className="text-[11px] text-gray-400 truncate mt-0.5">
          {[proj.code, proj.client?.name].filter(Boolean).join(' · ') || <span className="italic">Sem cliente</span>}
        </p>

        {/* Linha 3: Último RDO */}
        {proj.lastReport ? (
          <div className="flex items-center gap-1.5 mt-1">
            {rpt && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${rpt.dot}`} />}
            <p className="text-[11px] text-gray-500 truncate">
              Último: <span className="font-medium text-gray-700">{fmtDate(proj.lastReport.date)}</span>
              {proj.lastReport.reportNumber && ` — ${proj.lastReport.reportNumber}`}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 mt-1 italic">Sem RDOs ainda</p>
        )}

        {/* Linha 4: métricas + botões */}
        <div className="flex items-center gap-2 mt-2">
          {/* Métricas */}
          <div className="flex items-center gap-2 text-[11px] text-gray-400 flex-1 min-w-0">
            <span>🌧 {proj.totalRainMm.toFixed(0)}mm</span>
            {proj.unworkableDays > 0 && (
              <span className="text-red-500">⛔ {proj.unworkableDays}d</span>
            )}
            <span>{proj.totalReports} RDO{proj.totalReports !== 1 ? 's' : ''}</span>
          </div>

          {/* Botões */}
          <div className="flex gap-1 flex-shrink-0">
            <Link href={`/app/diario/${proj.id}`}>
              <button className="text-[11px] font-medium px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors whitespace-nowrap">
                RDOs
              </button>
            </Link>
            {canCreate && (
              <Link href={`/app/diario/${proj.id}/novo`}>
                <button className="text-[11px] font-semibold px-2.5 py-1.5 bg-[#F5A623] text-white rounded-lg hover:bg-[#d4891a] transition-colors whitespace-nowrap">
                  + Novo
                </button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Progresso direito ─────────────────────────────────── */}
      <div className="flex-shrink-0 flex flex-col items-center justify-center px-3 border-l border-gray-100 min-w-[52px]">
        <span className="text-lg font-black text-gray-800 leading-none">
          {proj.progressPercent.toFixed(0)}
        </span>
        <span className="text-[10px] text-gray-400 font-medium">%</span>
        <div className="w-6 h-1 bg-gray-100 rounded-full mt-1 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#F5A623]"
            style={{ width: `${Math.min(100, proj.progressPercent)}%` }}
          />
        </div>
      </div>
    </div>
  )
}
