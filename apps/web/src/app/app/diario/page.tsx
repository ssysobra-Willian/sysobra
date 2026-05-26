'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter }                         from 'next/navigation'
import Link                                  from 'next/link'
import { Button }                            from '@/components/ui/Button'
import { Badge }                             from '@/components/ui/Badge'
import { PageHeader }                        from '@/components/ui/PageHeader'
import { SemAcesso }                         from '@/components/SemAcesso'
import { usePermissions }                    from '@/hooks/usePermissions'
import type { BadgeVariant }                 from '@/components/ui/Badge'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Project {
  id:   string
  name: string
}

interface DiaryEntry {
  id:           string
  date:         string
  weather:      string | null
  workers:      number | null
  activities:   string | null
  status:       'PENDING' | 'APPROVED' | 'REJECTED'
  author:       { id: string; name: string }
  project:      { id: string; name: string }
  approvedBy:   { id: string; name: string } | null
  rejectionNote:string | null
  _count:       { comments: number }
  createdAt:    string
}

// ─── Labels de status ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant; dot: boolean }> = {
  PENDING:  { label: 'Pendente',  variant: 'yellow', dot: true  },
  APPROVED: { label: 'Aprovado',  variant: 'green',  dot: false },
  REJECTED: { label: 'Devolvido', variant: 'red',    dot: false },
}

// ─── Formatadores ─────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function DiarioPage() {
  const router = useRouter()
  const { canAccessModule, can, isExternal, isClient } = usePermissions()

  const [projects,       setProjects]       = useState<Project[]>([])
  const [entries,        setEntries]        = useState<DiaryEntry[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState('')
  const [total,          setTotal]          = useState(0)
  const [page,           setPage]           = useState(1)

  const LIMIT = 15

  // Verifica acesso ao módulo
  if (!canAccessModule('diario_obra')) {
    return <SemAcesso modulo="Diário de Obra" />
  }

  const canCreate = can('diario_obra', 'create')

  // ── Carrega projetos ──────────────────────────────────────────────────────

  useEffect(() => {
    const token     = localStorage.getItem('token')
    const companyId = localStorage.getItem('companyId')
    if (!token || !companyId) { router.replace('/login'); return }

    fetch(`${API}/api/v1/projects?companyId=${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => {/* silencioso — projetos são opcionais no filtro */})
  }, [router])

  // ── Carrega entradas do diário ────────────────────────────────────────────

  const loadEntries = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) { router.replace('/login'); return }

    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        page:  String(page),
        limit: String(LIMIT),
      })
      if (selectedProject) params.set('projectId', selectedProject)

      const res  = await fetch(`${API}/api/v1/diary/entries?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar registros')

      setEntries(data.entries ?? [])
      setTotal(data.total ?? 0)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [router, selectedProject, page])

  useEffect(() => { loadEntries() }, [loadEntries])

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Diário de Obra"
        subtitle="Registros diários de atividades em obra."
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => router.push('/app/diario/novo')}>
              + Novo registro
            </Button>
          ) : undefined
        }
      />

      {/* Filtro de projeto */}
      {!isExternal && !isClient && projects.length > 0 && (
        <div className="mb-5 flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
            Filtrar por obra:
          </label>
          <select
            value={selectedProject}
            onChange={(e) => { setSelectedProject(e.target.value); setPage(1) }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          >
            <option value="">Todas as obras</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Lista de registros */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
            <svg className="w-12 h-12 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">Nenhum registro encontrado.</p>
            {canCreate && (
              <Button size="sm" onClick={() => router.push('/app/diario/novo')}>
                Criar primeiro registro
              </Button>
            )}
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Obra</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Autor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Atividades</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ação</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const status = STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.PENDING
                  return (
                    <tr
                      key={entry.id}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-900">{fmtDate(entry.date)}</p>
                        {entry._count.comments > 0 && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            💬 {entry._count.comments} comentário{entry._count.comments !== 1 ? 's' : ''}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <p className="text-sm text-gray-700 truncate max-w-[160px]">{entry.project.name}</p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className="text-xs text-gray-500">{entry.author.name}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={status.variant} dot={status.dot}>
                          {status.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell max-w-[240px]">
                        <p className="text-xs text-gray-500 line-clamp-2">
                          {entry.activities || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/app/diario/${entry.id}`}
                          className="text-xs font-medium text-[#F5A623] hover:text-[#d4891a] transition-colors"
                        >
                          Ver →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Paginação */}
            {total > LIMIT && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Exibindo {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} de {total}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    ← Anterior
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page * LIMIT >= total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima →
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
