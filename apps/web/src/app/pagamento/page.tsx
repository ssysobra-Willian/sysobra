'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { saveCompanySession, updateSubStatus } from '@/lib/auth-cookies'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const PLAN_LABELS: Record<string, { name: string; price: string }> = {
  FREE:         { name: 'Grátis',       price: 'R$ 0'       },
  STARTER:      { name: 'Essencial',    price: 'R$ 99/mês'  },
  PROFESSIONAL: { name: 'Profissional', price: 'R$ 199/mês' },
  ENTERPRISE:   { name: 'Avançado',     price: 'R$ 349/mês' },
}

type PageState = 'loading' | 'free' | 'pending_payment' | 'success' | 'failed' | 'canceled'

// ─── Helper: renova o JWT de empresa após pagamento ───────────────────────────
// Isso garante que o middleware aceite /app/* com o companyId correto no JWT.

async function refreshCompanyToken(token: string, companyId: string, userId: string, userName: string) {
  try {
    const res = await fetch(`${API}/api/v1/auth/select-company`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ companyId }),
    })
    if (!res.ok) return
    const data = await res.json()
    if (!data.token) return

    saveCompanySession({
      token:       data.token,
      company:     data.company,
      member:      data.member,
      permissions: data.permissions,
      userId,
      userName,
    })
  } catch { /* silencioso */ }
}

// ─────────────────────────────────────────────────────────────────────────────

function PagamentoContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const sessionId = searchParams.get('session_id') || ''
  const canceled  = searchParams.get('canceled')   === 'true'
  const empresaId = searchParams.get('empresaId')  || ''

  const [pageState,     setPageState]     = useState<PageState>('loading')
  const [stripeLoading, setStripeLoading] = useState(false)
  const [error,         setError]         = useState('')
  const [plano,         setPlano]         = useState('FREE')

  // Lê plano do localStorage de forma segura (client-side only)
  useEffect(() => {
    const p = searchParams.get('plano') || localStorage.getItem('selectedPlan') || 'FREE'
    setPlano(p)
  }, [searchParams])

  const planInfo = PLAN_LABELS[plano] ?? PLAN_LABELS.FREE

  // ── Determina o estado inicial ─────────────────────────────────────────
  useEffect(() => {
    if (!plano || plano === 'FREE' && !sessionId) return // aguarda plano ser definido

    if (canceled) {
      setPageState('canceled')
      return
    }

    if (sessionId) {
      // Voltou do Stripe com session_id — verifica o status
      const token     = localStorage.getItem('token')
      const companyId = empresaId || localStorage.getItem('companyId') || ''
      const userId    = localStorage.getItem('userId')   || ''
      const userName  = localStorage.getItem('userName') || ''

      if (!token) { setPageState('failed'); return }

      // Passa companyId e plano para que o backend atualize o banco antes do webhook
      const qp = new URLSearchParams()
      if (companyId) qp.set('companyId', companyId)
      if (plano && plano !== 'FREE') qp.set('plano', plano)

      fetch(`${API}/api/stripe/session/${sessionId}?${qp.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then(async (data) => {
          if (data.status === 'paid') {
            // Atualiza cookie de status → próxima navegação passa no middleware
            updateSubStatus('ACTIVE')
            localStorage.setItem('selectedPlan', plano)

            // Renova o JWT de empresa com status ACTIVE (inclui companyId no token)
            if (companyId) {
              await refreshCompanyToken(token, companyId, userId, userName)
            }

            setPageState('success')
            // Redireciona ao dashboard após 2s
            setTimeout(() => router.push('/app/dashboard'), 2000)
          } else {
            setPageState('failed')
          }
        })
        .catch(() => setPageState('failed'))
      return
    }

    if (plano === 'FREE') {
      setPageState('free')
      return
    }

    setPageState('pending_payment')
  }, [sessionId, canceled, plano, empresaId, router])

  async function handlePagar() {
    const token  = localStorage.getItem('token')
    const compId = empresaId || localStorage.getItem('companyId') || ''

    if (!token || !compId || !plano) {
      setError('Sessão expirada. Refaça o cadastro.')
      return
    }

    setStripeLoading(true)
    setError('')

    try {
      const res = await fetch(`${API}/api/stripe/checkout`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ empresaId: compId, plano }),
      })

      if (!res.ok) {
        let msg = 'Erro ao iniciar pagamento'
        try { msg = (await res.json()).error || msg } catch { /* ignore */ }
        throw new Error(msg)
      }

      const data = await res.json()
      if (!data.url) throw new Error('URL de pagamento não recebida')

      window.location.href = data.url
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao iniciar pagamento'
      setError(msg)
      setStripeLoading(false)
    }
  }

  async function handleAcessarSistema() {
    // Para plano FREE: garante que o JWT tem companyId antes de ir ao dashboard
    const token     = localStorage.getItem('token')
    const companyId = empresaId || localStorage.getItem('companyId') || ''
    const userId    = localStorage.getItem('userId')   || ''
    const userName  = localStorage.getItem('userName') || ''

    if (token && companyId) {
      await refreshCompanyToken(token, companyId, userId, userName)
    }
    router.push('/app/dashboard')
  }

  // ── Loading ────────────────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Sucesso ────────────────────────────────────────────────────────────
  if (pageState === 'success') {
    return (
      <PageShell>
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Pagamento confirmado!</h1>
        <p className="text-gray-500 text-center mb-6">
          Plano <strong>{planInfo.name}</strong> ativado com sucesso. Redirecionando...
        </p>
        <div className="w-8 h-8 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin mx-auto" />
      </PageShell>
    )
  }

  // ── Falha de pagamento ─────────────────────────────────────────────────
  if (pageState === 'failed') {
    return (
      <PageShell>
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Pagamento não aprovado</h1>
        <p className="text-gray-500 text-center mb-6">
          Tente novamente com outro cartão ou entre em contato com seu banco.
        </p>
        {error && <p className="text-sm text-red-500 text-center mb-4">{error}</p>}
        <div className="space-y-3">
          <button onClick={handlePagar} disabled={stripeLoading}
            className="w-full py-3 bg-[#F5A623] text-white font-semibold rounded-xl hover:bg-[#d4891a] transition-colors disabled:opacity-60">
            {stripeLoading ? 'Aguarde...' : 'Tentar novamente'}
          </button>
          <Link href="/planos" className="block w-full py-3 text-center border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 text-sm">
            Trocar de plano
          </Link>
        </div>
      </PageShell>
    )
  }

  // ── Pagamento cancelado ────────────────────────────────────────────────
  if (pageState === 'canceled') {
    return (
      <PageShell>
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Pagamento cancelado</h1>
        <p className="text-gray-500 text-center mb-6">
          Você cancelou o processo de pagamento. Sua conta ainda está com acesso limitado.
        </p>
        {error && <p className="text-sm text-red-500 text-center mb-4">{error}</p>}
        <div className="space-y-3">
          <button onClick={handlePagar} disabled={stripeLoading}
            className="w-full py-3 bg-[#F5A623] text-white font-semibold rounded-xl hover:bg-[#d4891a] transition-colors disabled:opacity-60">
            {stripeLoading ? 'Aguarde...' : '🔒 Tentar novamente'}
          </button>
          <Link href="/planos" className="block w-full py-3 text-center border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 text-sm">
            Ver outros planos
          </Link>
          <Link href="/app/assinatura-pendente" className="block text-center text-xs text-gray-400 hover:text-gray-600 mt-2">
            Continuar com acesso limitado
          </Link>
        </div>
      </PageShell>
    )
  }

  // ── Plano Grátis ───────────────────────────────────────────────────────
  if (pageState === 'free') {
    return (
      <PageShell>
        <div className="w-16 h-16 bg-[#FFF8EC] rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🎉</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Conta criada!</h1>
        <p className="text-gray-500 text-center mb-2">Você está no plano</p>
        <p className="text-xl font-bold text-[#F5A623] text-center mb-2">Grátis</p>
        <p className="text-sm text-gray-400 text-center mb-8">
          Explore sem custo. Faça upgrade quando quiser.
        </p>
        <button
          onClick={handleAcessarSistema}
          className="w-full py-3 bg-[#F5A623] text-white font-semibold rounded-xl hover:bg-[#d4891a] transition-colors"
        >
          Acessar o sistema →
        </button>
      </PageShell>
    )
  }

  // ── Planos pagos (aguardando pagamento) ────────────────────────────────
  return (
    <PageShell>
      <div className="w-16 h-16 bg-[#FFF8EC] rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-[#F5A623]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1 text-center">Finalizar assinatura</h1>
      <p className="text-gray-500 text-sm text-center mb-1">Plano selecionado</p>
      <p className="text-lg font-bold text-gray-900 text-center mb-6">
        {planInfo.name} — {planInfo.price}
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 text-center">
          {error}
        </div>
      )}

      <div className="space-y-2 mb-6 text-sm text-gray-600">
        {[
          '🔒 Pagamento 100% seguro via Stripe',
          '📋 Assinatura mensal — cancele quando quiser',
          '✅ Ativação imediata',
        ].map((i) => (
          <p key={i}>{i}</p>
        ))}
      </div>

      <button onClick={handlePagar} disabled={stripeLoading}
        className="w-full py-3.5 bg-[#F5A623] text-white font-semibold rounded-xl hover:bg-[#d4891a] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
        {stripeLoading
          ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Aguarde...</>
          : '🔒 Pagar com segurança'
        }
      </button>

      <div className="mt-4 text-center">
        <Link href="/planos" className="text-sm text-gray-400 hover:text-gray-600">
          ← Trocar de plano
        </Link>
      </div>
    </PageShell>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-[#1a1a1a] px-6 py-4 flex-shrink-0">
        <div className="max-w-6xl mx-auto">
          <Link href="/" className="flex items-center gap-2 w-fit">
            <div className="h-9 w-9 rounded-lg bg-[#F5A623] flex items-center justify-center">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <span className="text-white font-bold text-xl">SYSOBRA</span>
          </Link>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  )
}

export default function PagamentoPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PagamentoContent />
    </Suspense>
  )
}
