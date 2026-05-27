'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Loader2, RefreshCw, ClipboardCheck,
  PlusCircle, Pencil, Trash2, Send, CheckCircle, XCircle,
  MessageSquare, UploadCloud, ArrowLeftRight, RotateCcw,
  CreditCard, Banknote, XOctagon, LogIn, LogOut, Mail,
  Shield, FileDown, Printer, ChevronLeft, ChevronRight, Bot,
} from 'lucide-react'
import { UserAvatar } from './UserAvatar'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id:          string
  action:      string
  module:      string
  entity:      string
  entityId?:   string | null
  entityName?: string | null
  description: string
  metadata?:   Record<string, unknown> | null
  createdAt:   string
  user: {
    id:        string
    name:      string
    avatarUrl?: string | null
  } | null
}

// ─── Módulos: cor do ponto lateral ───────────────────────────────────────────

const MODULE_COLOR: Record<string, { dot: string; badge: string; label: string }> = {
  FINANCIAL:     { dot: 'bg-green-500',  badge: 'bg-green-50  text-green-700  border-green-200',  label: 'Financeiro'      },
  PROJECT:       { dot: 'bg-blue-500',   badge: 'bg-blue-50   text-blue-700   border-blue-200',   label: 'Centro de Custo' },
  DIARY:         { dot: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700 border-orange-200', label: 'Diário de Obra'  },
  DEPOSIT:       { dot: 'bg-purple-500', badge: 'bg-purple-50 text-purple-700 border-purple-200', label: 'Depósito'        },
  FLEET:         { dot: 'bg-cyan-500',   badge: 'bg-cyan-50   text-cyan-700   border-cyan-200',   label: 'Frota'           },
  PURCHASES:     { dot: 'bg-yellow-500', badge: 'bg-yellow-50 text-yellow-700 border-yellow-200', label: 'Compras'         },
  AUTH:          { dot: 'bg-gray-400',   badge: 'bg-gray-50   text-gray-600   border-gray-200',   label: 'Acesso'          },
  SETTINGS:      { dot: 'bg-slate-400',  badge: 'bg-slate-50  text-slate-600  border-slate-200',  label: 'Configurações'   },
  REPORTS:       { dot: 'bg-teal-500',   badge: 'bg-teal-50   text-teal-700   border-teal-200',   label: 'Relatórios'      },
  COLLABORATORS: { dot: 'bg-rose-400',   badge: 'bg-rose-50   text-rose-700   border-rose-200',   label: 'Colaboradores'   },
}

function getModule(module: string) {
  return MODULE_COLOR[module] ?? { dot: 'bg-gray-300', badge: 'bg-gray-50 text-gray-500 border-gray-200', label: module }
}

// ─── Ícones por ação ──────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<string, { Icon: React.ElementType; color: string; bg: string }> = {
  CREATE:            { Icon: PlusCircle,     color: 'text-green-600',  bg: 'bg-green-100'  },
  UPDATE:            { Icon: Pencil,         color: 'text-blue-600',   bg: 'bg-blue-100'   },
  DELETE:            { Icon: Trash2,         color: 'text-red-500',    bg: 'bg-red-100'    },
  SUBMIT:            { Icon: Send,           color: 'text-amber-600',  bg: 'bg-amber-100'  },
  APPROVE:           { Icon: CheckCircle,    color: 'text-green-600',  bg: 'bg-green-100'  },
  REJECT:            { Icon: XCircle,        color: 'text-red-500',    bg: 'bg-red-100'    },
  COMMENT:           { Icon: MessageSquare,  color: 'text-purple-600', bg: 'bg-purple-100' },
  UPLOAD:            { Icon: UploadCloud,    color: 'text-teal-600',   bg: 'bg-teal-100'   },
  TRANSFER:          { Icon: ArrowLeftRight, color: 'text-blue-600',   bg: 'bg-blue-100'   },
  REVERSE_TRANSFER:  { Icon: RotateCcw,      color: 'text-orange-500', bg: 'bg-orange-100' },
  REVERSE:           { Icon: RotateCcw,      color: 'text-orange-500', bg: 'bg-orange-100' },
  PAY:               { Icon: CreditCard,     color: 'text-green-600',  bg: 'bg-green-100'  },
  RECEIVE:           { Icon: Banknote,       color: 'text-emerald-600',bg: 'bg-emerald-100'},
  CANCEL:            { Icon: XOctagon,       color: 'text-red-500',    bg: 'bg-red-100'    },
  LOGIN:             { Icon: LogIn,          color: 'text-blue-500',   bg: 'bg-blue-50'    },
  LOGOUT:            { Icon: LogOut,         color: 'text-gray-500',   bg: 'bg-gray-100'   },
  INVITE:            { Icon: Mail,           color: 'text-violet-600', bg: 'bg-violet-100' },
  PERMISSION_CHANGE: { Icon: Shield,         color: 'text-amber-600',  bg: 'bg-amber-100'  },
  EXPORT:            { Icon: FileDown,       color: 'text-teal-600',   bg: 'bg-teal-100'   },
  PRINT:             { Icon: Printer,        color: 'text-gray-500',   bg: 'bg-gray-100'   },
}

function getActionCfg(action: string) {
  return ACTION_CONFIG[action] ?? { Icon: RefreshCw, color: 'text-gray-500', bg: 'bg-gray-100' }
}

// ─── Formatação de data ───────────────────────────────────────────────────────

function formatSmartDate(iso: string): string {
  const d    = new Date(iso)
  const now  = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)

  if (mins < 1)   return 'agora mesmo'
  if (mins < 60)  return `há ${mins} min`

  const h = Math.floor(mins / 60)
  if (h < 24) return `às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`

  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) {
    return `Ontem às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  }

  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay())
  if (d >= startOfWeek) {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
    return `${days[d.getDay()]} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  }

  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ` às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ActivityFeedProps {
  entity?:      string
  entityId?:    string
  projectId?:   string
  limit?:       number
  showHeader?:  boolean
  compact?:     boolean
  title?:       string
  showModule?:  boolean  // mostrar badge do módulo em cada item
  showPaging?:  boolean  // mostrar paginação interna
  className?:   string
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Componente ───────────────────────────────────────────────────────────────

export function ActivityFeed({
  entity,
  entityId,
  projectId,
  limit = 20,
  showHeader  = true,
  compact     = false,
  title       = 'Atividade recente',
  showModule  = false,
  showPaging  = false,
  className   = '',
}: ActivityFeedProps) {
  const [logs,       setLogs]       = useState<AuditLogEntry[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [page,       setPage]       = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [todayCount, setTodayCount] = useState<number | null>(null)

  const load = useCallback(async (pg = 1) => {
    setLoading(true)
    setError('')
    try {
      const token     = localStorage.getItem('token')     || ''
      const companyId = localStorage.getItem('companyId') || ''

      const params = new URLSearchParams({ limit: String(limit), page: String(pg) })
      if (entity)    params.set('entity',    entity)
      if (entityId)  params.set('entityId',  entityId)
      if (projectId) params.set('projectId', projectId)

      const [logsRes, countRes] = await Promise.all([
        fetch(`${API}/api/v1/audit-logs?${params}`, {
          headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId },
        }),
        showPaging ? fetch(`${API}/api/v1/audit-logs/today-count`, {
          headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId },
        }) : Promise.resolve(null),
      ])

      if (!logsRes.ok) { setError('Erro ao carregar atividades'); return }

      const data = await logsRes.json()
      setLogs(data.logs ?? [])
      setTotalPages(data.pagination?.totalPages ?? 1)

      if (countRes?.ok) {
        const cd = await countRes.json()
        setTodayCount(cd.count ?? null)
      }
    } catch {
      setError('Erro ao carregar atividades')
    } finally {
      setLoading(false)
    }
  }, [entity, entityId, projectId, limit, showPaging])

  useEffect(() => { load(page) }, [load, page])

  const goPage = (pg: number) => {
    setPage(pg)
    load(pg)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={`flex items-center justify-center ${compact ? 'py-6' : 'py-10'} ${className}`}>
        <Loader2 size={20} className="animate-spin text-[#F5A623]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={`text-center py-6 ${className}`}>
        <p className="text-xs text-red-500">{error}</p>
        <button onClick={() => load(page)} className="text-xs text-[#F5A623] mt-1 hover:underline">Tentar novamente</button>
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <ClipboardCheck size={24} className="text-gray-300 mx-auto mb-2" />
        <p className="text-xs text-gray-400">Nenhuma atividade registrada</p>
      </div>
    )
  }

  return (
    <div className={className}>
      {showHeader && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold text-gray-700 ${compact ? 'text-xs' : 'text-sm'}`}>{title}</h3>
            {todayCount !== null && todayCount > 0 && (
              <span className="text-[10px] font-semibold bg-[#F5A623]/10 text-[#F5A623] px-1.5 py-0.5 rounded-full">
                {todayCount} hoje
              </span>
            )}
          </div>
          <button onClick={() => load(page)} className="text-gray-300 hover:text-gray-500 transition-colors" title="Atualizar">
            <RefreshCw size={13} />
          </button>
        </div>
      )}

      <div className="relative">
        {/* Linha vertical da timeline */}
        {!compact && <div className="absolute left-4 top-4 bottom-4 w-px bg-gray-100" />}

        <div className="space-y-0">
          {logs.map((log, idx) => {
            const cfg    = getActionCfg(log.action)
            const mod    = getModule(log.module ?? '')
            const Icon   = cfg.Icon
            const isLast = idx === logs.length - 1

            return (
              <div key={log.id} className="relative flex gap-3 group">
                {/* Ponto colorido por módulo */}
                <div className="relative z-10 flex-shrink-0 flex flex-col items-center">
                  <div className={`w-2 h-2 rounded-full mt-2.5 ${mod.dot} flex-shrink-0`} />
                  {!isLast && <div className="w-px flex-1 bg-gray-100 mt-1" />}
                </div>

                {/* Avatar */}
                <div className="flex-shrink-0 mt-1">
                  {log.user ? (
                    <UserAvatar
                      name={log.user.name}
                      avatarUrl={log.user.avatarUrl}
                      size="xs"
                      tooltip={false}
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                      <Bot size={12} className="text-gray-400" />
                    </div>
                  )}
                </div>

                {/* Conteúdo */}
                <div className={`flex-1 min-w-0 pb-3 ${isLast ? 'pb-0' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`${compact ? 'text-[11px]' : 'text-xs'} text-gray-700 leading-snug`}>
                        <span className="font-semibold">{log.user?.name ?? 'Sistema'}</span>
                        {' '}
                        <span className="text-gray-500 truncate">{log.description}</span>
                      </p>

                      {/* Nota de rejeição */}
                      {(log.action === 'REJECT' || log.action === 'REVERSE') && (log.metadata as any)?.rejectionNote && (
                        <p className="text-[10px] text-red-400 mt-0.5 italic line-clamp-1">
                          "{(log.metadata as any).rejectionNote}"
                        </p>
                      )}

                      {/* Preview de comentário */}
                      {log.action === 'COMMENT' && (log.metadata as any)?.preview && (
                        <p className="text-[10px] text-gray-400 mt-0.5 italic line-clamp-1">
                          "{(log.metadata as any).preview}"
                        </p>
                      )}

                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <p className="text-[10px] text-gray-400">{formatSmartDate(log.createdAt)}</p>
                        {showModule && (
                          <span className={`text-[9px] font-medium px-1.5 py-px rounded border ${mod.badge}`}>
                            {mod.label}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ícone da ação (desktop) */}
                    {!compact && (
                      <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${cfg.bg}`}>
                        <Icon size={11} className={cfg.color} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Paginação simples */}
      {showPaging && totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => goPage(page - 1)}
            disabled={page === 1}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#F5A623] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={13} /> Anterior
          </button>
          <span className="text-[10px] text-gray-400">
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => goPage(page + 1)}
            disabled={page === totalPages}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#F5A623] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Próxima <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
