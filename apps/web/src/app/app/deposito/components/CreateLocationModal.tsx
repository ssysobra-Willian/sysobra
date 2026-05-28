'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { X, Warehouse, Loader2, CheckCircle2, AlertCircle, Building2, User, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
function getToken()     { return typeof window !== 'undefined' ? localStorage.getItem('token')     ?? '' : '' }
function getCompanyId() { return typeof window !== 'undefined' ? localStorage.getItem('companyId') ?? '' : '' }
async function apiFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, 'x-company-id': getCompanyId(), ...(opts.headers ?? {}) },
  })
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/\($/, '').trimEnd()
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3')
}

interface Project  { id: string; name: string; code?: string | null }
interface UserItem { id: string; name: string; email: string }
interface SelfUser { id: string; name: string }

interface Props {
  isOpen:        boolean
  onClose:       () => void
  onSuccess:     () => void
  projects?:     Project[]
  hasCentral?:   boolean
}

const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#F5A623] focus:ring-1 focus:ring-[#F5A623]/20 bg-white placeholder:text-gray-300'

export function CreateLocationModal({ isOpen, onClose, onSuccess, projects = [], hasCentral = false }: Props) {
  // Dados do almoxarifado
  const [name,        setName]        = useState('')
  const [type,        setType]        = useState<'CENTRAL' | 'WAREHOUSE'>('WAREHOUSE')
  const [projectId,   setProjectId]   = useState('')
  const [address,     setAddress]     = useState('')
  const [description, setDescription] = useState('')

  // Usuário atual (lido do localStorage)
  const [selfUser, setSelfUser] = useState<SelfUser>({ id: '', name: '' })
  useEffect(() => {
    setSelfUser({
      id:   localStorage.getItem('userId')   ?? '',
      name: localStorage.getItem('userName') ?? '',
    })
  }, [])

  // Responsável — padrão: "Eu mesmo"
  const [managerMode,     setManagerMode]     = useState<'self' | 'existing' | 'new'>('self')
  const [userSearch,      setUserSearch]      = useState('')
  const [userResults,     setUserResults]     = useState<UserItem[]>([])
  const [selectedManager, setSelectedManager] = useState<UserItem | null>(null)
  const [newManagerName,  setNewManagerName]  = useState('')
  const [newManagerEmail, setNewManagerEmail] = useState('')
  const [newManagerPhone, setNewManagerPhone] = useState('')

  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState(false)

  // Reset ao fechar
  useEffect(() => {
    if (!isOpen) {
      setName(''); setType('WAREHOUSE'); setProjectId(''); setAddress(''); setDescription('')
      setManagerMode('self'); setUserSearch(''); setUserResults([]); setSelectedManager(null)
      setNewManagerName(''); setNewManagerEmail(''); setNewManagerPhone('')
      setError(''); setSuccess(false)
    }
  }, [isOpen])

  // Busca de usuários (membros da empresa)
  const searchUsers = useCallback(async (q: string) => {
    if (q.length < 2) { setUserResults([]); return }
    try {
      const res  = await apiFetch('/api/v1/members')
      const data = await res.json()
      const members: any[] = data.members ?? []
      const filtered = members
        .filter(m =>
          m.name.toLowerCase().includes(q.toLowerCase()) ||
          (m.email ?? '').toLowerCase().includes(q.toLowerCase())
        )
        .slice(0, 8)
        .map(m => ({ id: m.userId, name: m.name, email: m.email ?? '' }))
      setUserResults(filtered)
    } catch { setUserResults([]) }
  }, [])

  // Debounce da busca
  useEffect(() => {
    const t = setTimeout(() => searchUsers(userSearch), 300)
    return () => clearTimeout(t)
  }, [userSearch, searchUsers])

  const selectManager = (u: UserItem) => {
    setSelectedManager(u)
    setUserSearch('')
    setUserResults([])
  }

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Nome é obrigatório'); return }
    if (type === 'WAREHOUSE' && !projectId) { setError('Selecione a obra vinculada'); return }
    if (managerMode === 'self' && !selfUser.id) { setError('Usuário atual não identificado'); return }
    if (managerMode === 'existing' && !selectedManager) { setError('Selecione o responsável'); return }
    if (managerMode === 'new' && (!newManagerName.trim() || !newManagerEmail.trim())) {
      setError('Nome e email do novo responsável são obrigatórios'); return
    }

    setSaving(true); setError('')
    try {
      const body: any = {
        name: name.trim(),
        type,
        address:     address     || undefined,
        description: description || undefined,
        projectId:   type === 'WAREHOUSE' ? (projectId || undefined) : undefined,
      }

      if (managerMode === 'self') {
        body.managerId = selfUser.id
      } else if (managerMode === 'existing' && selectedManager) {
        body.managerId = selectedManager.id
      } else if (managerMode === 'new') {
        body.managerName = newManagerName.trim()
        body.newManagerEmail = newManagerEmail.trim()
        body.newManagerPhone = newManagerPhone.replace(/\D/g, '') || undefined
      }

      const res = await apiFetch('/api/v1/deposit/locations', { method: 'POST', body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`)

      setSuccess(true)
      setTimeout(() => { onSuccess(); onClose() }, 800)
    } catch (err: any) {
      setError(err.message ?? 'Erro ao criar almoxarifado')
    } finally { setSaving(false) }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 bg-white w-full sm:max-w-lg sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] rounded-t-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center">
              <Warehouse size={18} className="text-[#F5A623]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Novo almoxarifado</h2>
              <p className="text-xs text-gray-400">Crie um local de estoque para sua empresa</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Feedback */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
              <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
              <p className="text-xs text-green-700">Almoxarifado criado com sucesso!</p>
            </div>
          )}

          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Nome <span className="text-red-400">*</span>
            </label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Ex: Almoxarifado — Residencial Alpha"
              className={inp} />
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tipo</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'CENTRAL',   label: '🏭 Depósito Central',      desc: 'Estoque principal da empresa',  disabled: hasCentral },
                { value: 'WAREHOUSE', label: '🏗️ Almoxarifado de Obra', desc: 'Estoque vinculado a uma obra',  disabled: false },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => setType(opt.value)}
                  className={cn(
                    'border rounded-xl p-3 text-left transition text-sm',
                    type === opt.value
                      ? 'border-[#F5A623] bg-amber-50 ring-1 ring-[#F5A623]/30'
                      : 'border-gray-200 hover:border-gray-300',
                    opt.disabled && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  <div className="font-medium text-gray-800 text-xs">{opt.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{opt.desc}</div>
                  {opt.disabled && <div className="text-[10px] text-amber-600 mt-0.5">Já existe um Central</div>}
                </button>
              ))}
            </div>
          </div>

          {/* Obra vinculada */}
          {type === 'WAREHOUSE' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Obra vinculada <span className="text-red-400">*</span>
              </label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inp}>
                <option value="">Selecione a obra...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `${p.code} — ` : ''}{p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Endereço */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Endereço (opcional)</label>
            <input value={address} onChange={e => setAddress(e.target.value)}
              placeholder="Rua, número, bairro..."
              className={inp} />
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Descrição (opcional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              rows={2} placeholder="Informações adicionais sobre este almoxarifado..."
              className={cn(inp, 'resize-none')} />
          </div>

          {/* ── Responsável ── */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <User size={14} className="text-[#F5A623]" />
              <h4 className="text-sm font-semibold text-gray-700">
                Responsável pelo almoxarifado
                <span className="text-xs font-normal text-red-500 ml-1">*</span>
              </h4>
            </div>

            {/* Toggle — 3 opções */}
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {([
                { value: 'self',     emoji: '⭐', label: 'Eu mesmo'      },
                { value: 'existing', emoji: '👤', label: 'Outro usuário' },
                { value: 'new',      emoji: '➕', label: 'Criar novo'    },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setManagerMode(opt.value)
                    setSelectedManager(null)
                    setUserSearch('')
                    setUserResults([])
                  }}
                  className={cn(
                    'py-2 px-1.5 rounded-xl text-center border transition-colors',
                    managerMode === opt.value
                      ? 'border-[#F5A623] bg-amber-50 text-amber-800 font-semibold'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300',
                  )}
                >
                  <div className="text-sm leading-none mb-0.5">{opt.emoji}</div>
                  <div className="text-[11px] font-medium leading-tight">{opt.label}</div>
                </button>
              ))}
            </div>

            {/* Eu mesmo */}
            {managerMode === 'self' && (
              <div className="flex items-center gap-3 p-2.5 bg-green-50 border border-green-200 rounded-xl">
                <div className="w-9 h-9 rounded-full bg-[#F5A623] flex items-center justify-center font-bold text-sm text-white flex-shrink-0">
                  {selfUser.name ? selfUser.name.slice(0, 2).toUpperCase() : <Star size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-green-800 truncate">
                    {selfUser.name || 'Usuário atual'}
                  </div>
                  <div className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                    <CheckCircle2 size={11} />
                    Você será o responsável
                  </div>
                </div>
              </div>
            )}

            {/* Selecionar usuário existente */}
            {managerMode === 'existing' && !selectedManager && (
              <div className="relative">
                <input
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Buscar por nome ou email..."
                  className={inp}
                />
                {userResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-44 overflow-y-auto">
                    {userResults.map(u => (
                      <button key={u.id} type="button" onClick={() => selectManager(u)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0">
                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center font-bold text-xs text-amber-800 flex-shrink-0">
                          {u.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">{u.name}</div>
                          <div className="text-xs text-gray-500 truncate">{u.email}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Responsável selecionado */}
            {managerMode === 'existing' && selectedManager && (
              <div className="flex items-center gap-3 p-2.5 bg-green-50 border border-green-200 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center font-bold text-xs text-green-800 flex-shrink-0">
                  {selectedManager.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-green-800 truncate">{selectedManager.name}</div>
                  <div className="text-xs text-green-700 opacity-80">{selectedManager.email}</div>
                </div>
                <button type="button" onClick={() => setSelectedManager(null)}
                  className="text-gray-400 hover:text-red-500 text-sm p-1">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Criar novo usuário */}
            {managerMode === 'new' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Nome completo <span className="text-red-400">*</span></label>
                    <input value={newManagerName} onChange={e => setNewManagerName(e.target.value)}
                      placeholder="Nome do almoxarife" className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Email <span className="text-red-400">*</span></label>
                    <input type="email" value={newManagerEmail} onChange={e => setNewManagerEmail(e.target.value)}
                      placeholder="email@empresa.com" className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Telefone</label>
                    <input value={newManagerPhone}
                      onChange={e => setNewManagerPhone(maskPhone(e.target.value))}
                      placeholder="(11) 99999-9999" className={inp} />
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                  <Building2 size={12} className="flex-shrink-0 mt-0.5 text-[#F5A623]" />
                  <span>Um email com as credenciais de acesso será enviado ao novo usuário. Ele terá acesso restrito apenas ao módulo Depósito.</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex gap-3 rounded-b-2xl flex-shrink-0">
          <button type="button" onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving || success}
            className="flex-1 py-2.5 text-sm bg-[#F5A623] hover:bg-[#e09610] text-white font-semibold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
            {saving   ? <><Loader2 size={14} className="animate-spin" /> Criando...</>
            : success ? <><CheckCircle2 size={14} /> Criado!</>
            : 'Criar almoxarifado'}
          </button>
        </div>
      </div>
    </div>
  )
}
