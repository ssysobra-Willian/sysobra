'use client'

import { useState, useCallback } from 'react'
import {
  Building2, Package, Warehouse, CheckCircle, Loader2,
  ArrowLeft, Info, User, UserPlus, X,
} from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

function getHeaders() {
  const t = typeof window !== 'undefined' ? (localStorage.getItem('token')     ?? '') : ''
  const c = typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : ''
  return { Authorization: `Bearer ${t}`, 'x-company-id': c }
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2)  return d.replace(/^(\d{0,2})/, '($1')
  if (d.length <= 7)  return d.replace(/^(\d{2})(\d{0,5})/, '($1) $2')
  return d.replace(/^(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3')
}

interface DepositoOnboardingProps {
  onComplete: () => void
}

type Step = 'intro' | 'form'
type ManagerMode = 'existing' | 'new'

export default function DepositoOnboarding({ onComplete }: DepositoOnboardingProps) {
  const [step,         setStep]         = useState<Step>('intro')
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')

  // Campos do depósito
  const [name,        setName]        = useState('Depósito Central')
  const [address,     setAddress]     = useState('')
  const [description, setDescription] = useState('')

  // Responsável
  const [managerMode,     setManagerMode]     = useState<ManagerMode>('existing')
  const [selectedManager, setSelectedManager] = useState<any>(null)
  const [userSearch,      setUserSearch]      = useState('')
  const [userResults,     setUserResults]     = useState<any[]>([])
  const [searchLoading,   setSearchLoading]   = useState(false)

  // Criar novo usuário
  const [newManagerName,  setNewManagerName]  = useState('')
  const [newManagerEmail, setNewManagerEmail] = useState('')
  const [newManagerPhone, setNewManagerPhone] = useState('')

  const searchUsers = useCallback(async (q: string) => {
    if (q.length < 2) { setUserResults([]); return }
    setSearchLoading(true)
    try {
      const res = await fetch(
        `${API}/api/v1/company/users?search=${encodeURIComponent(q)}`,
        { headers: getHeaders() }
      )
      const data = await res.json()
      setUserResults(data.users ?? data ?? [])
    } catch {} finally {
      setSearchLoading(false)
    }
  }, [])

  const canSubmit =
    !!name.trim() && (
      (managerMode === 'existing' && !!selectedManager) ||
      (managerMode === 'new'      && !!newManagerName.trim() && !!newManagerEmail.trim())
    )

  const handleCreate = async () => {
    if (!canSubmit) return
    setLoading(true)
    setError('')
    try {
      const body: any = {
        name:        name.trim(),
        type:        'CENTRAL',
        address:     address.trim()     || undefined,
        description: description.trim() || undefined,
      }
      if (managerMode === 'existing') {
        body.managerId = selectedManager.id
      } else {
        body.managerName  = newManagerName.trim()
        body.managerEmail = newManagerEmail.trim()
        body.managerPhone = newManagerPhone.trim() || undefined
      }

      const res = await fetch(`${API}/api/v1/deposit/locations`, {
        method:  'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || err.error || `Erro ${res.status}`)
      }

      onComplete()
    } catch (e: any) {
      setError(e.message || 'Erro ao criar depósito')
    } finally {
      setLoading(false)
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TELA INTRO
  // ──────────────────────────────────────────────────────────────────────────
  if (step === 'intro') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-10 text-center max-w-[560px] mx-auto">
        {/* Ícone */}
        <div className="w-24 h-24 rounded-full bg-orange-50 flex items-center justify-center mb-6">
          <Warehouse size={48} className="text-[#F5A623]" />
        </div>

        {/* Título */}
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Configure o Depósito
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed mb-8 max-w-md">
          Para começar a usar o módulo de Depósito, é necessário criar o{' '}
          <strong className="text-gray-800">Depósito Central</strong> da sua empresa.
          Ele será o estoque principal de onde partem todos os materiais.
        </p>

        {/* Cards explicativos */}
        <div className="grid grid-cols-3 gap-3 mb-8 w-full">
          {[
            {
              icon: Warehouse,
              color: 'text-[#F5A623]',
              bg:    'bg-orange-50',
              title: '1. Depósito Central',
              desc:  'Estoque principal da empresa. Criado agora.',
            },
            {
              icon: Package,
              color: 'text-blue-600',
              bg:    'bg-blue-50',
              title: '2. Cadastrar itens',
              desc:  'Materiais, ferramentas, EPIs e uniformes.',
            },
            {
              icon: Building2,
              color: 'text-green-600',
              bg:    'bg-green-50',
              title: '3. Almoxarifados',
              desc:  'Criar por obra quando necessário.',
            },
          ].map((card, i) => {
            const Icon = card.icon
            return (
              <div key={i} className="p-4 rounded-2xl border border-gray-100 bg-white text-center">
                <div className={`w-11 h-11 rounded-full ${card.bg} flex items-center justify-center mx-auto mb-3`}>
                  <Icon size={22} className={card.color} />
                </div>
                <p className="text-[13px] font-semibold text-gray-800 mb-1">{card.title}</p>
                <p className="text-[11px] text-gray-400 leading-snug">{card.desc}</p>
              </div>
            )
          })}
        </div>

        {/* Botão */}
        <button
          onClick={() => setStep('form')}
          className="flex items-center gap-2 px-7 py-3.5 bg-[#F5A623] hover:bg-[#d4891a] text-white text-base font-bold rounded-xl transition-colors"
        >
          <Warehouse size={18} />
          Criar Depósito Central agora
        </button>

        <p className="text-xs text-gray-400 mt-3">
          Você não poderá cadastrar itens ou movimentações antes desta etapa
        </p>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TELA FORMULÁRIO
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[600px] mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-7">
        <button
          onClick={() => setStep('intro')}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Criar Depósito Central</h2>
          <p className="text-sm text-gray-400">Estoque principal da empresa</p>
        </div>
      </div>

      {/* Badge informativo */}
      <div className="flex items-start gap-2.5 px-4 py-3 mb-6 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-800">
        <Info size={16} className="mt-0.5 flex-shrink-0 text-[#F5A623]" />
        <span>
          Sua empresa pode ter apenas <strong>1 Depósito Central</strong>.
          Almoxarifados de obras são criados separadamente depois.
        </span>
      </div>

      {/* Erro global */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <Info size={14} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── SEÇÃO 1: Dados do depósito ─────────────────────────────────── */}
      <div className="border border-gray-200 rounded-2xl p-5 mb-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Info size={14} className="text-[#F5A623]" />
          Dados do depósito
        </h3>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Nome *
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex: Depósito Central"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Endereço <span className="normal-case font-normal text-gray-400">(opcional)</span>
          </label>
          <input
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="Rua, número, bairro — cidade/UF"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Descrição <span className="normal-case font-normal text-gray-400">(opcional)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Informações adicionais sobre o depósito..."
            rows={2}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
          />
        </div>
      </div>

      {/* ── SEÇÃO 2: Responsável ───────────────────────────────────────── */}
      <div className="border border-gray-200 rounded-2xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-1">
          <User size={14} className="text-[#F5A623]" />
          Responsável pelo depósito *
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          O responsável poderá registrar entradas, saídas e transferências de materiais.
        </p>

        {/* Toggle modo */}
        <div className="flex gap-2 mb-4">
          {[
            { value: 'existing', label: '👤 Usuário existente' },
            { value: 'new',      label: '➕ Criar novo usuário' },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setManagerMode(opt.value as ManagerMode)
                setSelectedManager(null)
                setUserSearch('')
                setUserResults([])
              }}
              className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium border-2 transition-colors ${
                managerMode === opt.value
                  ? 'border-[#F5A623] bg-orange-50 text-orange-800'
                  : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Usuário existente */}
        {managerMode === 'existing' && (
          <div>
            {!selectedManager ? (
              <div className="relative">
                <input
                  value={userSearch}
                  onChange={e => { setUserSearch(e.target.value); searchUsers(e.target.value) }}
                  placeholder="Buscar por nome ou email..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
                {searchLoading && (
                  <Loader2 size={14} className="animate-spin text-gray-300 absolute right-3 top-3" />
                )}
                {userResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-[200px] overflow-y-auto">
                    {userResults.map((u: any) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => { setSelectedManager(u); setUserSearch(''); setUserResults([]) }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
                      >
                        <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center text-xs font-bold text-orange-700 flex-shrink-0">
                          {u.name?.slice(0, 2).toUpperCase() ?? 'US'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{u.name}</p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {userSearch.length >= 2 && !searchLoading && userResults.length === 0 && (
                  <p className="text-xs text-gray-400 mt-2">
                    Nenhum usuário encontrado. Tente criar um novo.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
                <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-green-800">{selectedManager.name}</p>
                  <p className="text-xs text-green-600">{selectedManager.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedManager(null)}
                  className="p-1 rounded-lg hover:bg-green-100 text-green-600 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Criar novo usuário */}
        {managerMode === 'new' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Nome completo *
              </label>
              <input
                value={newManagerName}
                onChange={e => setNewManagerName(e.target.value)}
                placeholder="Nome do responsável"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Email *
                </label>
                <input
                  type="email"
                  value={newManagerEmail}
                  onChange={e => setNewManagerEmail(e.target.value)}
                  placeholder="email@empresa.com"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Telefone
                </label>
                <input
                  value={newManagerPhone}
                  onChange={e => setNewManagerPhone(maskPhone(e.target.value))}
                  placeholder="(00) 00000-0000"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
            </div>
            <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
              <UserPlus size={13} className="mt-0.5 flex-shrink-0" />
              Um email com login e senha provisória será enviado automaticamente.
              O usuário terá acesso restrito apenas ao módulo Depósito.
            </div>
          </div>
        )}
      </div>

      {/* Botão criar */}
      <button
        onClick={handleCreate}
        disabled={!canSubmit || loading}
        className={`w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
          !canSubmit || loading
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-[#F5A623] hover:bg-[#d4891a] text-white'
        }`}
      >
        {loading
          ? <><Loader2 size={16} className="animate-spin" /> Criando depósito...</>
          : <><Warehouse size={16} /> Criar Depósito Central</>
        }
      </button>

      {!canSubmit && (
        <p className="text-xs text-red-500 text-center mt-2">
          ⚠️ Preencha o nome e informe o responsável para continuar
        </p>
      )}
    </div>
  )
}
