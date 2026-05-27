'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { saveCompanySession, clearSession } from '@/lib/auth-cookies'
import type { MemberRole, MemberType } from '@/lib/auth-cookies'
import { toImageUrl } from '@/lib/imageUrl'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Labels ───────────────────────────────────────────────────────────────────

const PLAN_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  FREE:         { label: 'Grátis',       color: 'text-gray-600',   bg: 'bg-gray-100'    },
  STARTER:      { label: 'Essencial',    color: 'text-amber-700',  bg: 'bg-amber-100'   },
  PROFESSIONAL: { label: 'Profissional', color: 'text-blue-700',   bg: 'bg-blue-100'    },
  ENTERPRISE:   { label: 'Avançado',     color: 'text-purple-700', bg: 'bg-purple-100'  },
}

const ROLE_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  OWNER:    { label: 'Proprietário', color: 'text-orange-700', bg: 'bg-orange-100' },
  ADMIN:    { label: 'Admin',        color: 'text-orange-700', bg: 'bg-orange-100' },
  MANAGER:  { label: 'Gestor',       color: 'text-blue-700',   bg: 'bg-blue-100'   },
  MEMBER:   { label: 'Membro',       color: 'text-gray-700',   bg: 'bg-gray-100'   },
  EXTERNAL: { label: 'Externo',      color: 'text-teal-700',   bg: 'bg-teal-100'   },
  CLIENT:   { label: 'Cliente',      color: 'text-green-700',  bg: 'bg-green-100'  },
}

const SUB_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  ACTIVE:    { label: 'Ativa',    color: 'text-green-700',  bg: 'bg-green-100'   },
  TRIAL:     { label: 'Trial',    color: 'text-blue-700',   bg: 'bg-blue-100'    },
  PENDING:   { label: 'Pendente', color: 'text-amber-700',  bg: 'bg-amber-100'   },
  EXPIRED:   { label: 'Vencida',  color: 'text-red-700',    bg: 'bg-red-100'     },
  CANCELLED: { label: 'Inativa',  color: 'text-gray-600',   bg: 'bg-gray-100'    },
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CompanyOption {
  id:                   string
  name:                 string
  cnpj?:                string | null
  logo?:                string | null
  plan:                 string
  subscriptionStatus:   string
  stripeSubscriptionId?: string | null
  memberRole:           MemberRole
  memberType:           MemberType
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function SelecionarEmpresaPage() {
  const router = useRouter()
  const [companies, setCompanies]   = useState<CompanyOption[]>([])
  const [loading, setLoading]       = useState(true)
  const [selecting, setSelecting]   = useState<string | null>(null)
  const [error, setError]           = useState('')

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return
    }

    // 1. Tenta carregar do sessionStorage (colocado pelo login para múltiplas empresas)
    const stored = sessionStorage.getItem('sysobra_companies')
    if (stored) {
      try {
        const parsed: CompanyOption[] = JSON.parse(stored)
        if (parsed.length === 0) {
          router.replace('/planos')
          return
        }
        setCompanies(parsed)
        setLoading(false)
        return
      } catch { /* fallthrough */ }
    }

    // 2. Fallback: busca direto da API (ex.: usuário voltou à página via back-button)
    fetch(`${API}/api/v1/companies/my-companies`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const list: CompanyOption[] = data.companies ?? []
        if (list.length === 0) {
          router.replace('/planos')
          return
        }
        setCompanies(list)
      })
      .catch(() => setError('Erro ao carregar empresas. Tente novamente.'))
      .finally(() => setLoading(false))
  }, [router])

  async function handleSelect(company: CompanyOption) {
    const token = localStorage.getItem('token')
    if (!token) { router.replace('/login'); return }

    setSelecting(company.id)
    setError('')

    try {
      const res = await fetch(`${API}/api/v1/auth/select-company`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ companyId: company.id }),
      })

      const data = await res.json()

      // Empresa sem acesso (FREE sem trial) → /planos
      if (res.status === 403) {
        const dest = data.redirectTo || '/planos'
        router.replace(dest)
        return
      }

      if (!res.ok) throw new Error(data.error || 'Erro ao selecionar empresa')

      const userId   = localStorage.getItem('userId')   || ''
      const userName = localStorage.getItem('userName') || ''

      saveCompanySession({
        token:       data.token,
        company:     data.company,
        member:      data.member,
        permissions: data.permissions,
        userId,
        userName,
      })

      if (data.company?.logo) {
        localStorage.setItem('companyLogoUrl', data.company.logo)
      }

      // Limpa cache de seleção
      sessionStorage.removeItem('sysobra_companies')

      // Backend já calcula o redirectTo correto
      const redirectTo: string = data.redirectTo || '/app/dashboard'
      router.replace(redirectTo)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      setSelecting(null)
    }
  }

  function handleLogout() {
    clearSession()
    sessionStorage.removeItem('sysobra_companies')
    router.replace('/login')
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#1a1a1a] px-6 py-4 flex-shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image src="/logo-dark.png" alt="SYSOBRA" width={160} height={36} style={{ height: 36, width: 'auto', objectFit: 'contain' }} priority />
          </Link>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Conteúdo */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          {/* Título */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Selecionar empresa</h1>
            <p className="text-sm text-gray-500 mt-1">
              Você tem acesso a {companies.length} empresa{companies.length !== 1 ? 's' : ''}.
              Escolha com qual deseja trabalhar.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 text-center">
              {error}
            </div>
          )}

          {/* Lista de empresas */}
          <div className="space-y-3">
            {companies.map((company) => {
              const planInfo = PLAN_LABEL[company.plan]       ?? PLAN_LABEL.FREE
              const roleInfo = ROLE_LABEL[company.memberRole] ?? ROLE_LABEL.MEMBER
              const subInfo  = SUB_LABEL[company.subscriptionStatus] ?? SUB_LABEL.ACTIVE
              const isLoading = selecting === company.id
              const isInactive = company.subscriptionStatus === 'CANCELLED' || company.subscriptionStatus === 'EXPIRED'

              return (
                <button
                  key={company.id}
                  onClick={() => handleSelect(company)}
                  disabled={!!selecting}
                  className={`w-full text-left bg-white rounded-2xl border shadow-sm px-5 py-4 transition-all disabled:opacity-60 group ${
                    isInactive
                      ? 'border-gray-200 opacity-70 hover:border-gray-300'
                      : 'border-gray-200 hover:border-[#F5A623] hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Avatar da empresa */}
                    <div className={`h-12 w-12 rounded-xl border flex items-center justify-center flex-shrink-0 transition-colors ${
                      isInactive
                        ? 'bg-gray-100 border-gray-200'
                        : 'bg-[#F5A623]/10 border-[#F5A623]/20 group-hover:bg-[#F5A623]/20'
                    }`}>
                      {company.logo ? (
                        <img
                          src={toImageUrl(company.logo)}
                          alt={company.name}
                          className="h-10 w-10 rounded-lg object-cover"
                        />
                      ) : (
                        <span className={`font-bold text-lg ${isInactive ? 'text-gray-400' : 'text-[#F5A623]'}`}>
                          {company.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{company.name}</p>
                      {company.cnpj && (
                        <p className="text-xs text-gray-400 mt-0.5">{company.cnpj}</p>
                      )}
                      {/* Badges */}
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${planInfo.bg} ${planInfo.color}`}>
                          {planInfo.label}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${roleInfo.bg} ${roleInfo.color}`}>
                          {roleInfo.label}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${subInfo.bg} ${subInfo.color}`}>
                          {subInfo.label}
                        </span>
                      </div>
                    </div>

                    {/* Ação */}
                    <div className="flex-shrink-0">
                      {isLoading ? (
                        <div className="w-5 h-5 border-2 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg
                          className={`w-5 h-5 transition-colors ${
                            isInactive
                              ? 'text-gray-300'
                              : 'text-gray-300 group-hover:text-[#F5A623]'
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Criar nova empresa */}
          <div className="mt-6 text-center">
            <Link
              href="/planos"
              className="text-sm text-gray-400 hover:text-[#F5A623] transition-colors"
            >
              + Criar nova empresa
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
