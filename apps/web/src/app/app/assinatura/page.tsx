'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

type SubStatus = 'ACTIVE' | 'PENDING' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE' | 'EXPIRED'

const STATUS_INFO: Record<SubStatus, { label: string; color: string; bg: string; border: string }> = {
  ACTIVE:     { label: 'Ativa',      color: 'text-green-700', bg: 'bg-green-100', border: 'border-green-200' },
  PENDING:    { label: 'Pendente',   color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-amber-200' },
  PAST_DUE:   { label: 'Vencida',    color: 'text-red-700',   bg: 'bg-red-100',   border: 'border-red-200'   },
  EXPIRED:    { label: 'Expirada',   color: 'text-red-700',   bg: 'bg-red-100',   border: 'border-red-200'   },
  CANCELED:   { label: 'Cancelada',  color: 'text-gray-700',  bg: 'bg-gray-100',  border: 'border-gray-200'  },
  INCOMPLETE: { label: 'Incompleta', color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-amber-200' },
}

const PLAN_DETAILS: Record<string, {
  name: string; price: string; color: string;
  features: string[]; badge?: string
}> = {
  FREE: {
    name: 'Grátis', price: 'R$ 0', color: 'text-gray-600',
    features: ['1 usuário', '1 obra', 'Financeiro básico', '1 GB de armazenamento'],
  },
  STARTER: {
    name: 'Essencial', price: 'R$ 99/mês', color: 'text-[#F5A623]',
    features: ['5 usuários', '10 obras', 'Financeiro completo', 'Módulo de frota', '2 GB de armazenamento'],
  },
  PROFESSIONAL: {
    name: 'Profissional', price: 'R$ 199/mês', color: 'text-[#F5A623]', badge: 'Mais contratado',
    features: ['10 usuários', '20 obras', 'Depósito', 'Financeiro completo', '5 GB de armazenamento'],
  },
  ENTERPRISE: {
    name: 'Avançado', price: 'R$ 349/mês', color: 'text-[#F5A623]',
    features: ['Usuários ilimitados', 'Open Finance', 'Compras', 'Diário de obra', '7 GB de armazenamento'],
  },
}

interface CompanyInfo {
  plan: string
  subscriptionStatus: SubStatus
  stripeSubscriptionId: string | null
  stripeCustomerId: string | null
  subscriptionExpiresAt: string | null
}

export default function AssinaturaPage() {
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [upgradeLoading, setUpgradeLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    fetch(`${API}/api/v1/companies/current`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.company) setCompany(data.company)
      })
      .catch(() => setError('Erro ao carregar dados da assinatura'))
      .finally(() => setLoading(false))
  }, [])

  async function handleUpgrade(targetPlan: string) {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('companyId')
    if (!token || !companyId) return

    setUpgradeLoading(true)
    setError('')

    try {
      const res = await fetch(`${API}/api/stripe/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ empresaId: companyId, plano: targetPlan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao iniciar checkout')
      window.location.href = data.url
    } catch (err: any) {
      setError(err.message)
      setUpgradeLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const plan = company?.plan || 'FREE'
  const status = (company?.subscriptionStatus || 'ACTIVE') as SubStatus
  const statusInfo = STATUS_INFO[status] ?? STATUS_INFO.ACTIVE
  const planDetails = PLAN_DETAILS[plan] ?? PLAN_DETAILS.FREE

  const upgradePlans = Object.entries(PLAN_DETAILS).filter(
    ([key]) => key !== 'FREE' && key !== plan
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Título */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Assinatura</h1>
        <p className="text-sm text-gray-500 mt-1">Gerencie seu plano e cobrança</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Card do plano atual */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Plano atual</p>
            <h2 className="text-2xl font-bold text-gray-900">{planDetails.name}</h2>
            <p className={`text-lg font-semibold mt-1 ${planDetails.color}`}>{planDetails.price}</p>
          </div>
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${statusInfo.bg} ${statusInfo.color} border ${statusInfo.border}`}>
            {statusInfo.label}
          </span>
        </div>

        <ul className="space-y-2 mb-6">
          {planDetails.features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4 text-[#F5A623] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {f}
            </li>
          ))}
        </ul>

        {company?.stripeSubscriptionId && (
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-500 space-y-1">
            <p><span className="font-medium text-gray-700">ID da assinatura:</span> {company.stripeSubscriptionId}</p>
            {company.subscriptionExpiresAt && (
              <p>
                <span className="font-medium text-gray-700">Próxima cobrança:</span>{' '}
                {new Date(company.subscriptionExpiresAt).toLocaleDateString('pt-BR')}
              </p>
            )}
          </div>
        )}

        {status !== 'ACTIVE' && plan !== 'FREE' && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
            ⚠️ Sua assinatura está com status <strong>{statusInfo.label}</strong>. Regularize para restaurar o acesso completo.
          </div>
        )}
      </div>

      {/* Upgrade / mudar plano */}
      {plan !== 'ENTERPRISE' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            {plan === 'FREE' ? 'Escolher um plano pago' : 'Fazer upgrade'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {upgradePlans.map(([key, details]) => (
              <div key={key} className="border border-gray-200 rounded-xl p-4 relative">
                {details.badge && (
                  <span className="absolute -top-2.5 left-4 text-[10px] font-bold bg-[#F5A623] text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
                    {details.badge}
                  </span>
                )}
                <p className="font-semibold text-gray-900">{details.name}</p>
                <p className={`text-sm font-bold mb-3 ${details.color}`}>{details.price}</p>
                <ul className="space-y-1 mb-4">
                  {details.features.slice(0, 3).map((f) => (
                    <li key={f} className="text-xs text-gray-500 flex items-center gap-1.5">
                      <span className="text-[#F5A623]">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgrade(key)}
                  disabled={upgradeLoading}
                  className="w-full py-2 bg-[#F5A623] text-white text-sm font-semibold rounded-lg hover:bg-[#d4891a] transition-colors disabled:opacity-60"
                >
                  {upgradeLoading ? 'Aguarde...' : 'Selecionar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suporte */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 flex items-center justify-between">
        <div>
          <p className="font-medium text-gray-900">Precisa de ajuda?</p>
          <p className="text-sm text-gray-500 mt-0.5">Entre em contato com nosso suporte</p>
        </div>
        <a
          href="mailto:suporte@sysobra.com.br"
          className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Falar com suporte →
        </a>
      </div>
    </div>
  )
}
