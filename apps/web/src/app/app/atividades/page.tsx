'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Search, Filter, ChevronLeft, ChevronRight,
  Download, Bot, RefreshCw, X, SlidersHorizontal,
  PlusCircle, Pencil, Trash2, Send, CheckCircle, XCircle,
  MessageSquare, UploadCloud, ArrowLeftRight, RotateCcw,
  CreditCard, Banknote, XOctagon, LogIn, LogOut, Mail,
  Shield, FileDown, Printer,
} from 'lucide-react'
import { UserAvatar } from '@/components/ui/UserAvatar'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AuditLog {
  id:          string
  action:      string
  module:      string
  entity:      string
  entityId?:   string | null
  entityName?: string | null
  description: string
  metadata?:   Record<string, any> | null
  ipAddress?:  string | null
  createdAt:   string
  user: { id: string; name: string; avatarUrl?: string | null } | null
}

interface Pagination {
  total:      number
  page:       number
  limit:      number
  totalPages: number
  hasNext:    boolean
  hasPrev:    boolean
}

interface UserOption {
  id:        string
  name:      string
  avatarUrl?: string | null
}

// ─── Configurações visuais ────────────────────────────────────────────────────

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

const ACTION_LABEL: Record<string, string> = {
  CREATE:            'Criação',
  UPDATE:            'Edição',
  DELETE:            'Exclusão',
  SUBMIT:            'Envio para aprovação',
  APPROVE:           'Aprovação',
  REJECT:            'Rejeição',
  COMMENT:           'Comentário',
  UPLOAD:            'Upload',
  PAY:               'Pagamento',
  RECEIVE:           'Recebimento',
  CANCEL:            'Cancelamento',
  TRANSFER:          'Transferência',
  REVERSE_TRANSFER:  'Estorno de Transferência',
  REVERSE:           'Estorno',
  LOGIN:             'Login',
  LOGOUT:            'Logout',
  INVITE:            'Convite',
  PERMISSION_CHANGE: 'Mudança de Permissão',
  EXPORT:            'Exportação',
  PRINT:             'Impressão/PDF',
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  CREATE:            PlusCircle,
  UPDATE:            Pencil,
  DELETE:            Trash2,
  SUBMIT:            Send,
  APPROVE:           CheckCircle,
  REJECT:            XCircle,
  COMMENT:           MessageSquare,
  UPLOAD:            UploadCloud,
  TRANSFER:          ArrowLeftRight,
  REVERSE_TRANSFER:  RotateCcw,
  REVERSE:           RotateCcw,
  PAY:               CreditCard,
  RECEIVE:           Banknote,
  CANCEL:            XOctagon,
  LOGIN:             LogIn,
  LOGOUT:            LogOut,
  INVITE:            Mail,
  PERMISSION_CHANGE: Shield,
  EXPORT:            FileDown,
  PRINT:             Printer,
}

const ACTION_COLOR: Record<string, string> = {
  CREATE:            'text-green-600 bg-green-50 border-green-200',
  UPDATE:            'text-blue-600  bg-blue-50  border-blue-200',
  DELETE:            'text-red-500   bg-red-50   border-red-200',
  SUBMIT:            'text-amber-600 bg-amber-50 border-amber-200',
  APPROVE:           'text-green-600 bg-green-50 border-green-200',
  REJECT:            'text-red-500   bg-red-50   border-red-200',
  COMMENT:           'text-purple-600 bg-purple-50 border-purple-200',
  UPLOAD:            'text-teal-600  bg-teal-50  border-teal-200',
  TRANSFER:          'text-blue-600  bg-blue-50  border-blue-200',
  REVERSE_TRANSFER:  'text-orange-500 bg-orange-50 border-orange-200',
  PAY:               'text-green-600 bg-green-50 border-green-200',
  RECEIVE:           'text-emerald-600 bg-emerald-50 border-emerald-200',
  CANCEL:            'text-red-500   bg-red-50   border-red-200',
  LOGIN:             'text-blue-500  bg-blue-50  border-blue-200',
  LOGOUT:            'text-gray-500  bg-gray-50  border-gray-200',
  INVITE:            'text-violet-600 bg-violet-50 border-violet-200',
}

function getEntityLink(module: string, entity: string, entityId?: string | null): string | null {
  if (!entityId) return null
  switch (module) {
    case 'FINANCIAL':
      if (entity === 'BankAccount')          return `/app/financeiro/contas-bancarias`
      if (entity === 'FinancialTransaction') return `/app/financeiro`
      if (entity === 'Client')               return `/app/financeiro/clientes`
      if (entity === 'Supplier')             return `/app/financeiro/fornecedores`
      break
    case 'PROJECT':  return `/app/centro-de-custo/${entityId}`
    case 'DIARY':    return `/app/diario/${entityId}`
  }
  return null
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const LIMIT_OPTIONS = [20, 50, 100]

export default function AtividadesPage() {
  const [logs,       setLogs]       = useState<AuditLog[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [users,      setUsers]      = useState<UserOption[]>([])

  // Filtros
  const [search,     setSearch]     = useState('')
  const [module,     setModule]     = useState('')
  const [action,     setAction]     = useState('')
  const [userId,     setUserId]     = useState('')
  const [startDate,  setStartDate]  = useState('')
  const [endDate,    setEndDate]    = useState('')
  const [page,       setPage]       = useState(1)
  const [limit,      setLimit]      = useState(20)
  const [exporting,  setExporting]  = useState(false)

  // Carregar lista de usuários para o filtro
  useEffect(() => {
    const token     = localStorage.getItem('token')     || ''
    const companyId = localStorage.getItem('companyId') || ''
    fetch(`${API}/api/v1/audit-logs/users`, {
      headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.users) setUsers(d.users) })
      .catch(() => {})
  }, [])

  const load = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const token     = localStorage.getItem('token')     || ''
      const companyId = localStorage.getItem('companyId') || ''

      const params = new URLSearchParams({ page: String(pg), limit: String(limit) })
      if (search)    params.set('search',    search)
      if (module)    params.set('module',    module)
      if (action)    params.set('action',    action)
      if (userId)    params.set('userId',    userId)
      if (startDate) params.set('startDate', startDate)
      if (endDate)   params.set('endDate',   endDate)

      const res = await fetch(`${API}/api/v1/audit-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId },
      })
      if (!res.ok) return

      const data = await res.json()
      setLogs(data.logs ?? [])
      setPagination(data.pagination ?? null)
    } finally {
      setLoading(false)
    }
  }, [search, module, action, userId, startDate, endDate, limit])

  useEffect(() => { load(page) }, [load, page])

  const applyFilters = () => { setPage(1); load(1) }

  const clearFilters = () => {
    setSearch(''); setModule(''); setAction(''); setUserId('')
    setStartDate(''); setEndDate(''); setPage(1)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const token     = localStorage.getItem('token')     || ''
      const companyId = localStorage.getItem('companyId') || ''

      const params = new URLSearchParams()
      if (search)    params.set('search',    search)
      if (module)    params.set('module',    module)
      if (action)    params.set('action',    action)
      if (userId)    params.set('userId',    userId)
      if (startDate) params.set('startDate', startDate)
      if (endDate)   params.set('endDate',   endDate)

      const res = await fetch(`${API}/api/v1/audit-logs/export?${params}`, {
        headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId },
      })
      if (!res.ok) return

      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const hasActiveFilters = !!(search || module || action || userId || startDate || endDate)

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link
                href="/app/dashboard"
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Dashboard
              </Link>
              <span className="text-gray-300 text-xs">/</span>
              <span className="text-xs text-gray-600 font-medium">Atividades</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Histórico de atividades</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Todos os registros de ações realizadas no sistema
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            <Download size={15} />
            {exporting ? 'Exportando...' : 'Exportar CSV'}
          </button>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Busca */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyFilters()}
                placeholder="Buscar na descrição..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30 focus:border-[#F5A623]"
              />
            </div>

            {/* Módulo */}
            <select
              value={module}
              onChange={e => { setModule(e.target.value); setPage(1) }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30 bg-white min-w-[150px]"
            >
              <option value="">Todos os módulos</option>
              <option value="FINANCIAL">Financeiro</option>
              <option value="PROJECT">Centro de Custo</option>
              <option value="DIARY">Diário de Obra</option>
              <option value="DEPOSIT">Depósito</option>
              <option value="FLEET">Frota</option>
              <option value="PURCHASES">Compras</option>
              <option value="SETTINGS">Configurações</option>
              <option value="AUTH">Acesso</option>
            </select>

            {/* Ação */}
            <select
              value={action}
              onChange={e => { setAction(e.target.value); setPage(1) }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30 bg-white min-w-[150px]"
            >
              <option value="">Todas as ações</option>
              <option value="CREATE">Criação</option>
              <option value="UPDATE">Edição</option>
              <option value="DELETE">Exclusão</option>
              <option value="PAY">Pagamento</option>
              <option value="RECEIVE">Recebimento</option>
              <option value="APPROVE">Aprovação</option>
              <option value="REJECT">Rejeição</option>
              <option value="SUBMIT">Envio para aprovação</option>
              <option value="TRANSFER">Transferência</option>
              <option value="REVERSE_TRANSFER">Estorno</option>
              <option value="COMMENT">Comentário</option>
              <option value="LOGIN">Login</option>
              <option value="UPLOAD">Upload</option>
              <option value="EXPORT">Exportação</option>
            </select>

            {/* Usuário */}
            {users.length > 0 && (
              <select
                value={userId}
                onChange={e => { setUserId(e.target.value); setPage(1) }}
                className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30 bg-white min-w-[150px]"
              >
                <option value="">Todos os usuários</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Datas + botões */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 whitespace-nowrap">De:</span>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 whitespace-nowrap">Até:</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30"
              />
            </div>

            <button
              onClick={applyFilters}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#F5A623] rounded-xl hover:bg-[#e09520] transition-colors"
            >
              <Filter size={13} /> Filtrar
            </button>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <X size={13} /> Limpar
              </button>
            )}

            <button
              onClick={() => load(page)}
              className="p-2 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              title="Atualizar"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Contagem */}
        {pagination && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {loading ? 'Carregando...' : (
                <>
                  Exibindo <span className="font-medium text-gray-700">
                    {((page - 1) * limit) + 1}–{Math.min(page * limit, pagination.total)}
                  </span> de <span className="font-medium text-gray-700">{pagination.total.toLocaleString('pt-BR')}</span> registros
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Itens por página:</span>
              <select
                value={limit}
                onChange={e => { setLimit(Number(e.target.value)); setPage(1) }}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30"
              >
                {LIMIT_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Lista */}
        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-gray-200 rounded-full mt-2" />
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <div className="h-4 bg-gray-200 rounded w-20" />
                      <div className="h-4 bg-gray-200 rounded w-16" />
                    </div>
                    <div className="h-3 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))
          ) : logs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
              <SlidersHorizontal size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Nenhuma atividade encontrada</p>
              <p className="text-gray-400 text-sm mt-1">Tente ajustar os filtros</p>
            </div>
          ) : (
            logs.map(log => {
              const mod       = MODULE_COLOR[log.module] ?? { dot: 'bg-gray-300', badge: 'bg-gray-50 text-gray-500 border-gray-200', label: log.module }
              const ActionIcon = ACTION_ICONS[log.action] ?? RefreshCw
              const actionColor = ACTION_COLOR[log.action] ?? 'text-gray-500 bg-gray-50 border-gray-200'
              const actionLabel = ACTION_LABEL[log.action] ?? log.action
              const entityLink  = getEntityLink(log.module, log.entity, log.entityId)

              return (
                <div key={log.id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                  {/* Tarja superior com módulo + ação + data */}
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      {/* Ponto colorido */}
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${mod.dot}`} />

                      {/* Badge módulo */}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${mod.badge}`}>
                        {mod.label}
                      </span>

                      {/* Badge ação */}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border flex items-center gap-1 ${actionColor}`}>
                        <ActionIcon size={9} />
                        {actionLabel}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {formatFullDate(log.createdAt)}
                    </span>
                  </div>

                  {/* Corpo */}
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        {log.user ? (
                          <UserAvatar
                            name={log.user.name}
                            avatarUrl={log.user.avatarUrl}
                            size="sm"
                            tooltip={false}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                            <Bot size={16} className="text-gray-400" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Usuário + Descrição */}
                        <p className="text-sm text-gray-800">
                          <span className="font-semibold">{log.user?.name ?? 'Sistema automático'}</span>
                          {' '}
                          <span className="text-gray-600">{log.description}</span>
                        </p>

                        {/* Nota de rejeição */}
                        {(log.action === 'REJECT') && (log.metadata as any)?.rejectionNote && (
                          <p className="text-xs text-red-400 mt-1 italic">
                            Motivo: "{(log.metadata as any).rejectionNote}"
                          </p>
                        )}

                        {/* Preview de comentário */}
                        {log.action === 'COMMENT' && (log.metadata as any)?.preview && (
                          <p className="text-xs text-gray-400 mt-1 italic">
                            "{(log.metadata as any).preview}"
                          </p>
                        )}

                        {/* Registro afetado + link */}
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          {log.entityName && (
                            <span className="text-xs text-gray-500">
                              <span className="text-gray-400">Registro: </span>
                              {log.entityName}
                            </span>
                          )}
                          {entityLink && (
                            <Link
                              href={entityLink}
                              className="text-xs text-[#F5A623] hover:underline font-medium"
                            >
                              Ver detalhes →
                            </Link>
                          )}
                          {log.ipAddress && (
                            <span className="text-[10px] text-gray-300 font-mono">IP: {log.ipAddress}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Paginação */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={!pagination.hasPrev}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={15} /> Anterior
            </button>

            {/* Números de páginas */}
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(pagination.totalPages, 7) }, (_, i) => {
                let p: number
                const total = pagination.totalPages
                if (total <= 7) {
                  p = i + 1
                } else if (page <= 4) {
                  p = i + 1 === 7 ? total : i + 1
                } else if (page >= total - 3) {
                  p = i + 1 === 1 ? 1 : (total - 6 + i)
                } else {
                  const positions = [1, page - 2, page - 1, page, page + 1, page + 2, total]
                  p = positions[i]
                }
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 text-xs rounded-lg transition-colors ${
                      p === page
                        ? 'bg-[#F5A623] text-white font-semibold'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {p}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={!pagination.hasNext}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Próxima <ChevronRight size={15} />
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
