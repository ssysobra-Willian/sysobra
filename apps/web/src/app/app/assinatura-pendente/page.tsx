'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const PLAN_INFO: Record<string, { name: string; price: string }> = {
  STARTER:      { name: 'Essencial',    price: 'R$ 99/mês'  },
  PROFESSIONAL: { name: 'Profissional', price: 'R$ 199/mês' },
  ENTERPRISE:   { name: 'Avançado',     price: 'R$ 349/mês' },
}

export default function AssinaturaPendentePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState('STARTER')
  const [companyId, setCompanyId] = useState('')

  useEffect(() => {
    setPlan(localStorage.getItem('selectedPlan') || 'STARTER')
    setCompanyId(localStorage.getItem('companyId') || '')
  }, [])

  const planInfo = PLAN_INFO[plan] ?? PLAN_INFO.STARTER

  async function handleFinalizar() {
    const token = localStorage.getItem('token')
    if (!token || !companyId) {
      setError('Sessão expirada. Faça login novamente.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${API}/api/stripe/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ empresaId: companyId, plano: plan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao iniciar pagamento')
      window.location.href = data.url
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#1a1a1a] px-6 py-4 flex-shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image src="/logo-dark.png" alt="SYSOBRA" width={160} height={36} style={{ height: 36, width: 'auto', objectFit: 'contain' }} priority />
          </Link>
          <span className="text-xs text-gray-500 border border-amber-500/40 text-amber-400 px-2.5 py-1 rounded-full font-medium">
            ⏳ Pagamento Pendente
          </span>
        </div>
      </header>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 w-full max-w-md">
          {/* Ícone */}
          <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-10 h-10 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          {/* Badge */}
          <div className="flex justify-center mb-4">
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest">
              Pendente
            </span>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
            Pagamento pendente
          </h1>
          <p className="text-gray-500 text-center text-sm mb-6">
            Sua conta foi criada, mas o pagamento ainda não foi concluído.
          </p>

          {/* Resumo do plano */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Plano selecionado</p>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-900">{planInfo.name}</span>
              <span className="font-bold text-[#F5A623]">{planInfo.price}</span>
            </div>
          </div>

          {/* Aviso */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-sm text-amber-700 flex gap-2">
            <span className="flex-shrink-0">⚠️</span>
            <span>Enquanto o pagamento não for concluído, sua conta permanece com acesso limitado.</span>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 text-center">
              {error}
            </div>
          )}

          {/* Ações */}
          <div className="space-y-3">
            <button
              onClick={handleFinalizar}
              disabled={loading}
              className="w-full py-3 bg-[#F5A623] text-white font-semibold rounded-xl hover:bg-[#d4891a] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Aguarde...</>
              ) : '🔒 Finalizar pagamento'}
            </button>

            <Link
              href="/planos"
              className="block w-full py-2.5 text-center border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 text-sm font-medium"
            >
              Trocar plano
            </Link>

            <a
              href="mailto:suporte@sysobra.com.br"
              className="block w-full py-2.5 text-center text-gray-400 hover:text-gray-600 text-sm"
            >
              Falar com suporte →
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
