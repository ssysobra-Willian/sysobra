'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter }                         from 'next/navigation'
import { Button }                            from '@/components/ui/Button'
import { Badge }                             from '@/components/ui/Badge'
import { Modal }                             from '@/components/ui/Modal'
import { Input }                             from '@/components/ui/Input'
import { PageHeader }                        from '@/components/ui/PageHeader'
import { usePermissions }                    from '@/hooks/usePermissions'
import { SemAcesso }                         from '@/components/SemAcesso'
import type { BadgeVariant }                 from '@/components/ui/Badge'
import type { MemberRole, MemberType }       from '@/lib/auth-cookies'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Member {
  id:          string
  userId:      string
  memberRole:  MemberRole
  memberType:  MemberType
  permissions: Record<string, string[]> | { all: true } | null
  createdAt:   string
  user: {
    id:    string
    name:  string
    email: string
  }
}

interface Invite {
  id:          string
  email:       string
  memberRole:  MemberRole
  memberType:  MemberType
  permissions: Record<string, string[]> | null
  createdAt:   string
}

type PermissionsMap = Record<string, string[]>

// ─── Definição de módulos e ações ─────────────────────────────────────────────

const MODULES = [
  { key: 'financeiro',    label: 'Financeiro',     actions: ['view','create','edit','delete','approve'] },
  { key: 'obras',         label: 'Obras',           actions: ['view','create','edit','delete'] },
  { key: 'compras',       label: 'Compras',         actions: ['view','create','edit','delete','approve'] },
  { key: 'deposito',      label: 'Depósito',        actions: ['view','create','edit','delete'] },
  { key: 'frota',         label: 'Frota',           actions: ['view','create','edit','delete'] },
  { key: 'colaboradores', label: 'Colaboradores',   actions: ['view','create','edit','delete'] },
  { key: 'diario_obra',   label: 'Diário de Obra',  actions: ['view','create','edit','delete','approve','comment'] },
  { key: 'orcamento',     label: 'Orçamento',       actions: ['view','create','edit','delete','approve'] },
  { key: 'contratos',     label: 'Contratos',       actions: ['view','create','edit','delete','approve'] },
] as const

const ACTION_LABEL: Record<string, string> = {
  view:    'Ver',
  create:  'Criar',
  edit:    'Editar',
  delete:  'Excluir',
  approve: 'Aprovar',
  comment: 'Comentar',
}

// ─── Labels de exibição ───────────────────────────────────────────────────────

const ROLE_CONFIG: Record<MemberRole, { label: string; variant: BadgeVariant }> = {
  OWNER:    { label: 'Proprietário', variant: 'orange' },
  ADMIN:    { label: 'Admin',        variant: 'orange' },
  MANAGER:  { label: 'Gestor',       variant: 'blue'   },
  MEMBER:   { label: 'Membro',       variant: 'gray'   },
  EXTERNAL: { label: 'Externo',      variant: 'teal'   },
  CLIENT:   { label: 'Cliente',      variant: 'green'  },
}

const TYPE_LABEL: Record<MemberType, string> = {
  INTERNAL: 'Interno',
  EXTERNAL: 'Externo',
  CLIENT:   'Cliente',
}

// ─── Permissões padrão por role ───────────────────────────────────────────────

function defaultPermissionsForRole(role: MemberRole): PermissionsMap {
  switch (role) {
    case 'OWNER':
    case 'ADMIN':
      return {}  // { all: true } — gerenciado pelo backend

    case 'MANAGER':
      return {
        financeiro:    ['view','create','edit','delete'],
        obras:         ['view','create','edit'],
        compras:       ['view','create','edit','approve'],
        deposito:      ['view','create','edit'],
        frota:         ['view','create','edit'],
        colaboradores: ['view','create'],
        diario_obra:   ['view','create','edit','approve','comment'],
        orcamento:     ['view','create','edit','approve'],
        contratos:     ['view','create','edit','approve'],
      }

    case 'MEMBER':
      return {
        financeiro:    ['view'],
        obras:         ['view'],
        compras:       ['view','create'],
        deposito:      ['view'],
        frota:         ['view'],
        colaboradores: ['view'],
        diario_obra:   ['view','create','edit','comment'],
        orcamento:     ['view'],
        contratos:     ['view'],
      }

    case 'EXTERNAL':
      return { diario_obra: ['view','create','edit','comment'] }

    case 'CLIENT':
      return { diario_obra: ['view','comment'] }

    default:
      return {}
  }
}

// ─── Utilitário: permissões restritas para EXTERNAL/CLIENT ────────────────────

function restrictPermissions(role: MemberRole, perms: PermissionsMap): PermissionsMap {
  if (role === 'EXTERNAL') {
    return {
      diario_obra: (perms.diario_obra ?? []).filter((a) =>
        ['view','create','edit','comment'].includes(a),
      ),
    }
  }
  if (role === 'CLIENT') {
    return { diario_obra: ['view','comment'] }
  }
  return perms
}

// ─── Componente de matriz de permissões ───────────────────────────────────────

interface PermissionMatrixProps {
  role:        MemberRole
  permissions: PermissionsMap
  onChange:    (perms: PermissionsMap) => void
}

function PermissionMatrix({ role, permissions, onChange }: PermissionMatrixProps) {
  // OWNER/ADMIN têm { all: true } — sem matriz
  if (role === 'OWNER' || role === 'ADMIN') {
    return (
      <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-700">
        <strong>Acesso total</strong> — {role === 'OWNER' ? 'Proprietários' : 'Admins'} têm
        acesso irrestrito a todos os módulos do sistema.
      </div>
    )
  }

  // Para EXTERNAL/CLIENT, somente diário de obra
  const availableModules = (role === 'EXTERNAL' || role === 'CLIENT')
    ? MODULES.filter((m) => m.key === 'diario_obra')
    : MODULES

  function toggle(module: string, action: string) {
    const current = permissions[module] ?? []
    const updated  = current.includes(action)
      ? current.filter((a) => a !== action)
      : [...current, action]

    const newPerms = { ...permissions, [module]: updated }
    // Limpa módulo sem ações
    if (!updated.length) delete newPerms[module]

    onChange(restrictPermissions(role, newPerms))
  }

  function toggleAll(module: string, actions: readonly string[]) {
    const current      = permissions[module] ?? []
    const hasAll       = actions.every((a) => current.includes(a))
    const restricted   = (role === 'EXTERNAL')
      ? actions.filter((a) => ['view','create','edit','comment'].includes(a))
      : (role === 'CLIENT')
      ? actions.filter((a) => ['view','comment'].includes(a))
      : actions

    const newPerms = { ...permissions, [module]: hasAll ? [] : [...restricted] }
    if (!newPerms[module]?.length) delete newPerms[module]
    onChange(newPerms)
  }

  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
      {availableModules.map(({ key, label, actions }) => {
        const current   = permissions[key] ?? []
        const hasAny    = current.length > 0
        const hasAll    = actions.every((a) => current.includes(a))

        return (
          <div key={key} className="border border-gray-200 rounded-xl overflow-hidden">
            {/* Cabeçalho do módulo */}
            <div
              className={`flex items-center justify-between px-4 py-2.5 ${
                hasAny ? 'bg-orange-50' : 'bg-gray-50'
              }`}
            >
              <span className="text-sm font-semibold text-gray-800">{label}</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasAll}
                  onChange={() => toggleAll(key, actions)}
                  className="w-3.5 h-3.5 accent-[#F5A623] cursor-pointer"
                />
                <span className="text-xs text-gray-500">Todos</span>
              </label>
            </div>

            {/* Ações */}
            <div className="grid grid-cols-3 gap-x-2 gap-y-2 px-4 py-3 bg-white">
              {actions.map((action) => {
                const blocked =
                  (role === 'EXTERNAL' && !['view','create','edit','comment'].includes(action)) ||
                  (role === 'CLIENT'   && !['view','comment'].includes(action))

                return (
                  <label
                    key={action}
                    className={`flex items-center gap-2 text-xs ${
                      blocked
                        ? 'opacity-30 cursor-not-allowed'
                        : 'cursor-pointer hover:text-gray-800'
                    } text-gray-600`}
                  >
                    <input
                      type="checkbox"
                      checked={current.includes(action)}
                      disabled={blocked}
                      onChange={() => !blocked && toggle(key, action)}
                      className="w-3.5 h-3.5 accent-[#F5A623] flex-shrink-0"
                    />
                    {ACTION_LABEL[action] ?? action}
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function UsuariosPage() {
  const router = useRouter()
  const { isOwnerOrAdmin } = usePermissions()

  const [tab,        setTab]        = useState<'members' | 'invites'>('members')
  const [members,    setMembers]    = useState<Member[]>([])
  const [invites,    setInvites]    = useState<Invite[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [actionMsg,  setActionMsg]  = useState('')

  // ── Modal de convite ───────────────────────────────────────────────────────
  const [inviteOpen,   setInviteOpen]   = useState(false)
  const [inviteEmail,  setInviteEmail]  = useState('')
  const [inviteRole,   setInviteRole]   = useState<MemberRole>('MEMBER')
  const [inviteType,   setInviteType]   = useState<MemberType>('INTERNAL')
  const [invitePerms,  setInvitePerms]  = useState<PermissionsMap>({})
  const [inviteSaving, setInviteSaving] = useState(false)
  const [inviteError,  setInviteError]  = useState('')

  // ── Modal de edição de permissões ──────────────────────────────────────────
  const [editMember,  setEditMember]  = useState<Member | null>(null)
  const [editPerms,   setEditPerms]   = useState<PermissionsMap>({})
  const [editSaving,  setEditSaving]  = useState(false)
  const [editError,   setEditError]   = useState('')

  // Redireciona não-admin
  if (!isOwnerOrAdmin) {
    return <SemAcesso modulo="Usuários" mensagem="Apenas proprietários e admins podem gerenciar usuários." />
  }

  // ── Carrega dados ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) { router.replace('/login'); return }

    setLoading(true)
    setError('')
    try {
      const [mRes, iRes] = await Promise.all([
        fetch(`${API}/api/v1/company/members`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/v1/company/invites`,  { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const [mData, iData] = await Promise.all([mRes.json(), iRes.json()])
      setMembers(mData.members ?? [])
      setInvites(iData.invites  ?? [])
    } catch {
      setError('Erro ao carregar dados. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { load() }, [load])

  // ── Helpers ────────────────────────────────────────────────────────────────

  function flash(msg: string) {
    setActionMsg(msg)
    setTimeout(() => setActionMsg(''), 3500)
  }

  function handleRoleChange(role: MemberRole) {
    setInviteRole(role)
    // Auto-ajusta type e permissões padrão
    if (role === 'EXTERNAL') setInviteType('EXTERNAL')
    else if (role === 'CLIENT') setInviteType('CLIENT')
    else setInviteType('INTERNAL')
    setInvitePerms(defaultPermissionsForRole(role))
  }

  // ── Enviar convite ─────────────────────────────────────────────────────────

  async function handleInvite() {
    if (!inviteEmail.trim()) { setInviteError('Informe o e-mail.'); return }

    const token = localStorage.getItem('token')
    if (!token) return

    setInviteSaving(true)
    setInviteError('')
    try {
      const isAdmin = inviteRole === 'OWNER' || inviteRole === 'ADMIN'
      const permsPayload = isAdmin ? { all: true } : restrictPermissions(inviteRole, invitePerms)

      const res = await fetch(`${API}/api/v1/company/invites`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email:       inviteEmail.trim(),
          memberRole:  inviteRole,
          memberType:  inviteType,
          permissions: permsPayload,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar convite')

      setInviteOpen(false)
      setInviteEmail('')
      setInviteRole('MEMBER')
      setInviteType('INTERNAL')
      setInvitePerms({})
      flash(`Convite enviado para ${inviteEmail.trim()}`)
      load()
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setInviteSaving(false)
    }
  }

  // ── Cancelar convite ───────────────────────────────────────────────────────

  async function handleCancelInvite(inviteId: string, email: string) {
    if (!confirm(`Cancelar convite para ${email}?`)) return
    const token = localStorage.getItem('token')
    if (!token) return

    try {
      await fetch(`${API}/api/v1/company/invites/${inviteId}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      flash('Convite cancelado.')
      load()
    } catch {
      flash('Erro ao cancelar convite.')
    }
  }

  // ── Remover membro ─────────────────────────────────────────────────────────

  async function handleRemoveMember(member: Member) {
    if (!confirm(`Remover ${member.user.name} da empresa?`)) return
    const token = localStorage.getItem('token')
    if (!token) return

    try {
      const res = await fetch(`${API}/api/v1/company/members/${member.id}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao remover membro')
      flash(`${member.user.name} removido da empresa.`)
      load()
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Erro ao remover.')
    }
  }

  // ── Salvar permissões ─────────────────────────────────────────────────────

  async function handleSavePermissions() {
    if (!editMember) return
    const token = localStorage.getItem('token')
    if (!token) return

    setEditSaving(true)
    setEditError('')
    try {
      const isAdmin = editMember.memberRole === 'OWNER' || editMember.memberRole === 'ADMIN'
      const permsPayload = isAdmin ? { all: true } : restrictPermissions(editMember.memberRole, editPerms)

      const res = await fetch(`${API}/api/v1/company/members/permissions`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ memberId: editMember.id, permissions: permsPayload }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar permissões')

      setEditMember(null)
      flash(`Permissões de ${editMember.user.name} atualizadas.`)
      load()
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setEditSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Usuários"
        subtitle="Gerencie membros, permissões e convites da empresa."
        breadcrumbs={[
          { label: 'Configurações', href: '/app/configuracoes' },
          { label: 'Usuários' },
        ]}
        actions={
          <Button
            onClick={() => {
              setInviteEmail('')
              setInviteRole('MEMBER')
              setInviteType('INTERNAL')
              setInvitePerms(defaultPermissionsForRole('MEMBER'))
              setInviteError('')
              setInviteOpen(true)
            }}
            size="sm"
          >
            + Convidar usuário
          </Button>
        }
      />

      {/* Feedback */}
      {actionMsg && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          {actionMsg}
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-gray-200">
        {(['members', 'invites'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-[#F5A623] text-[#F5A623]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'members' ? `Membros (${members.length})` : `Convites pendentes (${invites.length})`}
          </button>
        ))}
      </div>

      {/* ── Tab: Membros ──────────────────────────────────────────────────── */}
      {tab === 'members' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : members.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">Nenhum membro encontrado.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Usuário</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cargo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Desde</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const roleInfo = ROLE_CONFIG[m.memberRole] ?? ROLE_CONFIG.MEMBER
                  const isCurrentUser = m.userId === localStorage.getItem('userId')
                  const isOwner       = m.memberRole === 'OWNER'

                  return (
                    <tr key={m.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-[#F5A623]/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-[#F5A623] font-bold text-xs">
                              {m.user.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {m.user.name}
                              {isCurrentUser && (
                                <span className="ml-1.5 text-[10px] text-gray-400">(você)</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-400 truncate">{m.user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={roleInfo.variant} size="sm">
                          {roleInfo.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-xs text-gray-500">{TYPE_LABEL[m.memberType]}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-gray-400">
                          {new Date(m.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {!isOwner && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const perms = (m.permissions && !('all' in m.permissions))
                                  ? (m.permissions as PermissionsMap)
                                  : defaultPermissionsForRole(m.memberRole)
                                setEditMember(m)
                                setEditPerms(perms)
                                setEditError('')
                              }}
                            >
                              Permissões
                            </Button>
                          )}
                          {!isOwner && !isCurrentUser && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleRemoveMember(m)}
                            >
                              Remover
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tab: Convites ─────────────────────────────────────────────────── */}
      {tab === 'invites' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : invites.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              Nenhum convite pendente.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">E-mail</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cargo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Enviado em</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => {
                  const roleInfo = ROLE_CONFIG[inv.memberRole] ?? ROLE_CONFIG.MEMBER
                  return (
                    <tr key={inv.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <span className="text-sm text-gray-700">{inv.email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={roleInfo.variant} size="sm">
                          {roleInfo.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-xs text-gray-400">
                          {new Date(inv.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleCancelInvite(inv.id, inv.email)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Modal: Convidar usuário ────────────────────────────────────────── */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Convidar usuário"
        subtitle="Um link de acesso será enviado por e-mail."
        size="lg"
        actions={[
          { label: 'Cancelar', variant: 'secondary', onClick: () => setInviteOpen(false) },
          { label: 'Enviar convite', variant: 'primary', onClick: handleInvite, loading: inviteSaving },
        ]}
      >
        <div className="space-y-4">
          {inviteError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {inviteError}
            </div>
          )}

          <Input
            label="E-mail"
            type="email"
            required
            placeholder="usuario@empresa.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cargo <span className="text-red-500">*</span>
              </label>
              <select
                value={inviteRole}
                onChange={(e) => handleRoleChange(e.target.value as MemberRole)}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="ADMIN">Admin</option>
                <option value="MANAGER">Gestor</option>
                <option value="MEMBER">Membro</option>
                <option value="EXTERNAL">Externo</option>
                <option value="CLIENT">Cliente</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select
                value={inviteType}
                onChange={(e) => setInviteType(e.target.value as MemberType)}
                disabled={inviteRole === 'EXTERNAL' || inviteRole === 'CLIENT'}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
              >
                <option value="INTERNAL">Interno</option>
                <option value="EXTERNAL">Externo</option>
                <option value="CLIENT">Cliente</option>
              </select>
            </div>
          </div>

          {/* Matriz de permissões */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Permissões</p>
            <PermissionMatrix
              role={inviteRole}
              permissions={invitePerms}
              onChange={setInvitePerms}
            />
          </div>
        </div>
      </Modal>

      {/* ── Modal: Editar permissões ───────────────────────────────────────── */}
      <Modal
        open={!!editMember}
        onClose={() => setEditMember(null)}
        title={editMember ? `Permissões — ${editMember.user.name}` : ''}
        subtitle={editMember ? editMember.user.email : ''}
        size="lg"
        actions={[
          { label: 'Cancelar', variant: 'secondary', onClick: () => setEditMember(null) },
          { label: 'Salvar permissões', variant: 'primary', onClick: handleSavePermissions, loading: editSaving },
        ]}
      >
        {editMember && (
          <div className="space-y-4">
            {editError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                {editError}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Badge variant={ROLE_CONFIG[editMember.memberRole]?.variant ?? 'gray'}>
                {ROLE_CONFIG[editMember.memberRole]?.label ?? editMember.memberRole}
              </Badge>
              <span className="text-xs text-gray-500">
                {TYPE_LABEL[editMember.memberType]}
              </span>
            </div>

            <PermissionMatrix
              role={editMember.memberRole}
              permissions={editPerms}
              onChange={setEditPerms}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
