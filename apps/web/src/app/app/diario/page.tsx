'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter }                         from 'next/navigation'
import Link                                  from 'next/link'
import Image                                 from 'next/image'
import { Button }                            from '@/components/ui/Button'
import { Badge }                             from '@/components/ui/Badge'
import { PageHeader }                        from '@/components/ui/PageHeader'
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

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DiarioPage() {
  const router = useRouter()
  const { canAccessModule, can } = usePermissions()

  const [projects, setProjects] = useState<DiaryProject[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [search,   setSearch]   = useState('')
  const [status,   setStatus]   = useState('ALL')

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
        }
      />

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Buscar obra..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white min-w-[200px]"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
        >
          <option value="ALL">Todos os status</option>
          <option value="IN_PROGRESS">Em andamento</option>
          <option value="PLANNING">Planejamento</option>
          <option value="ON_HOLD">Pausado</option>
          <option value="FINISHED">Concluído</option>
        </select>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {projects.map((proj) => (
            <ProjectCard key={proj.id} project={proj} canCreate={canCreate} />
          ))}
        </div>
      )}

      {/* FAB — navega para /app/diario para escolher obra (já estamos aqui) */}
      {canCreate && (
        <Link href="/app/diario/configuracoes"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[#F5A623] hover:bg-[#d4891a] text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          title="Configurações do Diário">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>
      )}
    </div>
  )
}

// ─── Card de projeto ──────────────────────────────────────────────────────────

function ProjectCard({ project: proj, canCreate }: { project: DiaryProject; canCreate: boolean }) {
  const sc = PROJECT_STATUS[proj.status] ?? PROJECT_STATUS.IN_PROGRESS
  const rpt = proj.lastReport ? (REPORT_STATUS[proj.lastReport.status] ?? REPORT_STATUS.PENDING) : null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow flex flex-col">
      {/* Cover / gradient */}
      <div className="relative h-36">
        {proj.coverImage ? (
          <Image
            src={proj.coverImage}
            alt={proj.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${sc.color} opacity-80`} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
          <div>
            <p className="text-white font-bold text-sm leading-tight line-clamp-1">{proj.name}</p>
            {proj.code && (
              <p className="text-white/80 text-[11px] mt-0.5">{proj.code}</p>
            )}
          </div>
          <Badge variant={sc.variant} size="sm">{sc.label}</Badge>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col gap-3">
        {/* Cliente */}
        {proj.client && (
          <p className="text-xs text-gray-500 truncate">
            <span className="font-medium text-gray-700">Cliente:</span> {proj.client.name}
          </p>
        )}

        {/* Progresso geral */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-500">Progresso geral</span>
            <span className="text-xs font-semibold text-gray-700">{proj.progressPercent.toFixed(0)}%</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#F5A623] rounded-full transition-all"
              style={{ width: `${Math.min(100, proj.progressPercent)}%` }}
            />
          </div>
        </div>

        {/* Último RDO */}
        <div className="bg-gray-50 rounded-xl p-3">
          {proj.lastReport ? (
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] text-gray-400 mb-0.5">Último RDO</p>
                <p className="text-xs font-semibold text-gray-800">
                  {proj.lastReport.reportNumber ? `${proj.lastReport.reportNumber} — ` : ''}
                  {fmtDate(proj.lastReport.date)}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">por {proj.lastReport.author.name}</p>
              </div>
              {rpt && (
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`w-2 h-2 rounded-full ${rpt.dot} flex-shrink-0`} />
                  <span className="text-[10px] text-gray-500">{rpt.label}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-gray-400">Nenhum RDO registrado ainda</p>
          )}
        </div>

        {/* Métricas de chuva */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <span>🌧</span>
            <span className="font-medium text-gray-700">{proj.totalRainMm.toFixed(0)} mm</span>
            <span>acumulados</span>
          </div>
          {proj.unworkableDays > 0 && (
            <div className="flex items-center gap-1 text-red-500">
              <span>⛔</span>
              <span className="font-semibold">{proj.unworkableDays}</span>
              <span>dias imp.</span>
            </div>
          )}
        </div>

        {/* Stats */}
        <p className="text-[11px] text-gray-400">
          {proj.totalReports} relatório{proj.totalReports !== 1 ? 's' : ''} registrado{proj.totalReports !== 1 ? 's' : ''}
        </p>

        {/* Ações */}
        <div className="flex gap-2 mt-auto pt-1">
          <Link href={`/app/diario/${proj.id}`} className="flex-1">
            <button className="w-full text-xs font-medium py-2 px-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              Ver RDOs
            </button>
          </Link>
          {canCreate && (
            <Link href={`/app/diario/${proj.id}/novo`} className="flex-1">
              <button className="w-full text-xs font-semibold py-2 px-3 bg-[#F5A623] text-white rounded-lg hover:bg-[#d4891a] transition-colors">
                + Novo RDO
              </button>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
