'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, RefreshCw, ClipboardCheck, PlusCircle, Pencil, Trash2, Send, CheckCircle, XCircle, MessageSquare, UploadCloud } from 'lucide-react'
import { UserAvatar } from './UserAvatar'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id:          string
  action:      string
  entity:      string
  entityId:    string
  entityName?: string | null
  description: string
  metadata?:   Record<string, unknown> | null
  createdAt:   string
  user: {
    id:        string
    name:      string
    avatarUrl?: string | null
  }
}

// ─── Ícones e cores por ação ──────────────────────────────────────────────────

const ACTION_CONFIG: Record<string, { Icon: React.ElementType; color: string; bg: string }> = {
  CREATE:          { Icon: PlusCircle,    color: 'text-green-600',  bg: 'bg-green-100'  },
  UPDATE:          { Icon: Pencil,        color: 'text-blue-600',   bg: 'bg-blue-100'   },
  DELETE:          { Icon: Trash2,        color: 'text-red-500',    bg: 'bg-red-100'    },
  SUBMIT:          { Icon: Send,          color: 'text-amber-600',  bg: 'bg-amber-100'  },
  APPROVE:         { Icon: CheckCircle,   color: 'text-green-600',  bg: 'bg-green-100'  },
  REJECT:          { Icon: XCircle,       color: 'text-red-500',    bg: 'bg-red-100'    },
  COMMENT:         { Icon: MessageSquare, color: 'text-purple-600', bg: 'bg-purple-100' },
  PROGRESS_UPDATE: { Icon: ClipboardCheck,color: 'text-blue-600',  bg: 'bg-blue-100'   },
  UPLOAD:          { Icon: UploadCloud,   color: 'text-teal-600',   bg: 'bg-teal-100'   },
}

function getActionCfg(action: string) {
  return ACTION_CONFIG[action] ?? { Icon: RefreshCw, color: 'text-gray-500', bg: 'bg-gray-100' }
}

// ─── Formatação de data ───────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'agora mesmo'
  if (m < 60) return `há ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7)  return `há ${d} dia${d > 1 ? 's' : ''}`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ActivityFeedProps {
  /** Filtro por entidade: "DiaryEntry", "Project", etc. */
  entity?:     string
  /** Filtro por ID da entidade específica */
  entityId?:   string
  /** Filtro por obra (retorna todos os logs relacionados ao projeto) */
  projectId?:  string
  /** Máximo de itens a exibir */
  limit?:      number
  /** Exibe cabeçalho "Atividade recente" */
  showHeader?: boolean
  /** Modo compacto (avatar menor, menos padding) */
  compact?:    boolean
  /** Título customizado do cabeçalho */
  title?:      string
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Componente ───────────────────────────────────────────────────────────────

export function ActivityFeed({
  entity,
  entityId,
  projectId,
  limit = 20,
  showHeader = true,
  compact = false,
  title = 'Atividade recente',
}: ActivityFeedProps) {
  const [logs,    setLogs]    = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const token     = localStorage.getItem('token')     || ''
      const companyId = localStorage.getItem('companyId') || ''

      const params = new URLSearchParams({ limit: String(limit) })
      if (entity)    params.set('entity',    entity)
      if (entityId)  params.set('entityId',  entityId)
      if (projectId) params.set('projectId', projectId)

      const res = await fetch(`${API}/api/v1/audit-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId },
      })

      if (!res.ok) { setError('Erro ao carregar atividades'); return }

      const data = await res.json()
      setLogs(data.logs ?? [])
    } catch {
      setError('Erro ao carregar atividades')
    } finally {
      setLoading(false)
    }
  }, [entity, entityId, projectId, limit])

  useEffect(() => { load() }, [load])

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={`flex items-center justify-center ${compact ? 'py-6' : 'py-10'}`}>
        <Loader2 size={20} className="animate-spin text-[#F5A623]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-red-500">{error}</p>
        <button onClick={load} className="text-xs text-[#F5A623] mt-1 hover:underline">Tentar novamente</button>
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8">
        <ClipboardCheck size={24} className="text-gray-300 mx-auto mb-2" />
        <p className="text-xs text-gray-400">Nenhuma atividade registrada</p>
      </div>
    )
  }

  return (
    <div>
      {showHeader && (
        <div className="flex items-center justify-between mb-3">
          <h3 className={`font-semibold text-gray-700 ${compact ? 'text-xs' : 'text-sm'}`}>{title}</h3>
          <button onClick={load} className="text-gray-300 hover:text-gray-500 transition-colors" title="Atualizar">
            <RefreshCw size={13} />
          </button>
        </div>
      )}

      <div className="relative">
        {/* Linha vertical da timeline */}
        <div className="absolute left-3.5 top-4 bottom-4 w-px bg-gray-100" />

        <div className="space-y-0">
          {logs.map((log, idx) => {
            const cfg  = getActionCfg(log.action)
            const Icon = cfg.Icon

            return (
              <div key={log.id} className="relative flex gap-3 group">
                {/* Ícone */}
                <div className={`relative z-10 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${cfg.bg} mt-1`}>
                  <Icon size={13} className={cfg.color} />
                </div>

                {/* Conteúdo */}
                <div className={`flex-1 min-w-0 pb-4 ${idx === logs.length - 1 ? 'pb-0' : ''}`}>
                  <div className="flex items-start gap-2">
                    <UserAvatar
                      name={log.user.name}
                      avatarUrl={log.user.avatarUrl}
                      size="xs"
                      tooltip={false}
                      className="mt-0.5 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 leading-snug">
                        <span className="font-semibold">{log.user.name}</span>
                        {' '}
                        <span className="text-gray-500">{log.description}</span>
                      </p>

                      {/* Nota de rejeição */}
                      {log.action === 'REJECT' && (log.metadata as any)?.note && (
                        <p className="text-[10px] text-red-500 mt-0.5 italic line-clamp-2">
                          "{(log.metadata as any).note}"
                        </p>
                      )}

                      {/* Preview de comentário */}
                      {log.action === 'COMMENT' && (log.metadata as any)?.preview && (
                        <p className="text-[10px] text-gray-400 mt-0.5 italic line-clamp-2">
                          "{(log.metadata as any).preview}"
                        </p>
                      )}

                      <p className="text-[10px] text-gray-400 mt-0.5">{formatRelative(log.createdAt)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
