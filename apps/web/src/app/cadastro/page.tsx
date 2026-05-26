'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { saveCompanySession } from '@/lib/auth-cookies'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const PLAN_INFO: Record<string, { name: string; price: string; period: string; features: string[] }> = {
  FREE: {
    name: 'Grátis',
    price: 'R$ 0',
    period: '',
    features: ['1 usuário', '1 obra', 'Financeiro básico', '1 GB'],
  },
  STARTER: {
    name: 'Essencial',
    price: 'R$ 99',
    period: '/mês',
    features: ['5 usuários', '10 obras', 'Financeiro completo', 'Frota', '2 GB'],
  },
  PROFESSIONAL: {
    name: 'Profissional',
    price: 'R$ 199',
    period: '/mês',
    features: ['10 usuários', '20 obras', 'Depósito', 'Financeiro completo', '5 GB'],
  },
  ENTERPRISE: {
    name: 'Avançado',
    price: 'R$ 349',
    period: '/mês',
    features: ['Ilimitado', 'Open Finance', 'Compras', 'Diário de obra', '7 GB'],
  },
}

function CadastroForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const plano = searchParams.get('plano') || 'FREE'
  const plan = PLAN_INFO[plano] ?? PLAN_INFO.FREE

  const [form, setForm] = useState({
    name:            '',
    email:           '',
    password:        '',
    confirmPassword: '',
    companyName:     '',
    companyType:     'PJ',
    cnpj:            '',
    phone:           '',
    terms:           false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  function set(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password !== form.confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }
    if (!form.terms) {
      setError('Você precisa aceitar os termos de uso.')
      return
    }

    setLoading(true)
    setError('')

    try {
      // ── 1. Cria o usuário ──────────────────────────────────────────────────
      const regRes = await fetch(`${API}/api/v1/auth/register`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: form.name, email: form.email, password: form.password }),
      })
      const regData = await regRes.json()
      if (!regRes.ok) throw new Error(regData.error || 'Erro ao criar usuário')

      const baseToken: string = regData.token

      // ── 2. Cria a empresa ──────────────────────────────────────────────────
      const compRes = await fetch(`${API}/api/v1/companies`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${baseToken}` },
        body:    JSON.stringify({
          name:        form.companyName,
          cnpj:        form.cnpj  || undefined,
          phone:       form.phone || undefined,
          companyType: form.companyType,
        }),
      })
      const compData = await compRes.json()
      if (!compRes.ok) throw new Error(compData.error || 'Erro ao criar empresa')

      const companyId: string = compData.company.id

      // ── 3. Seleciona empresa → obtém JWT com companyId ─────────────────────
      // Necessário para que o middleware aceite rotas /app/* após o pagamento.
      // Empresas recém-criadas têm status CANCELLED (FREE sem assinatura) mas
      // o backend retorna o token mesmo assim — o redirectTo orienta o frontend.
      const selRes = await fetch(`${API}/api/v1/auth/select-company`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${baseToken}` },
        body:    JSON.stringify({ companyId }),
      })
      const selData = await selRes.json()

      if (selRes.ok && selData.token) {
        // Salva sessão completa com JWT de empresa
        saveCompanySession({
          token:       selData.token,
          company:     selData.company,
          member:      selData.member,
          permissions: selData.permissions,
          userId:      regData.user.id,
          userName:    regData.user.name,
        })
      } else {
        // Fallback: salva só o token base (sem empresa selecionada)
        localStorage.setItem('token',       baseToken)
        localStorage.setItem('userId',      regData.user.id)
        localStorage.setItem('userName',    regData.user.name)
        localStorage.setItem('companyId',   companyId)
        localStorage.setItem('companyName', compData.company.name)
        localStorage.setItem('selectedPlan', plano)
      }

      // ── 4. Vai para o pagamento (ou dashboard se FREE) ─────────────────────
      router.push(`/pagamento?empresaId=${companyId}&plano=${plano}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ocorreu um erro. Tente novamente.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#1a1a1a] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-[#F5A623] flex items-center justify-center">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <span className="text-white font-bold text-xl">SYSOBRA</span>
          </Link>
          <span className="text-gray-400 text-sm">Criar conta</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* ── Esquerda: Resumo do plano ─────────────────────────────────── */}
        <aside className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 sticky top-6">
            <p className="text-xs font-semibold text-[#F5A623] uppercase tracking-widest mb-2">
              Plano selecionado
            </p>
            <h2 className="text-2xl font-extrabold text-gray-900">{plan.name}</h2>
            <div className="flex items-end gap-1 mt-2 mb-6">
              <span className="text-3xl font-bold text-gray-900">{plan.price}</span>
              <span className="text-gray-400 mb-1">{plan.period}</span>
            </div>
            <ul className="space-y-2">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-[#F5A623] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-6 pt-4 border-t border-gray-100">
              <Link href="/planos" className="text-sm text-gray-400 hover:text-[#F5A623] transition-colors">
                ← Mudar de plano
              </Link>
            </div>
          </div>
        </aside>

        {/* ── Direita: Formulário ───────────────────────────────────────── */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <h1 className="text-xl font-bold text-gray-900 mb-6">Criar sua conta</h1>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Dados do responsável */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  Dados do responsável
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo *</label>
                    <input type="text" required value={form.name}
                      onChange={(e) => set('name', e.target.value)}
                      placeholder="João da Silva"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
                    <input type="email" required value={form.email}
                      onChange={(e) => set('email', e.target.value)}
                      placeholder="joao@construtora.com.br"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] focus:border-transparent" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
                      <input type="password" required minLength={8} value={form.password}
                        onChange={(e) => set('password', e.target.value)}
                        placeholder="Mín. 8 caracteres"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] focus:border-transparent" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar senha *</label>
                      <input type="password" required value={form.confirmPassword}
                        onChange={(e) => set('confirmPassword', e.target.value)}
                        placeholder="Repita a senha"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] focus:border-transparent" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Dados da empresa */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  Dados da empresa
                </p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
                      <select value={form.companyType} onChange={(e) => set('companyType', e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] bg-white">
                        <option value="PJ">Pessoa Jurídica</option>
                        <option value="PF">Pessoa Física</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        CNPJ {form.companyType === 'PJ' ? '*' : ''}
                      </label>
                      <input type="text" value={form.cnpj}
                        onChange={(e) => set('cnpj', e.target.value)}
                        placeholder="00.000.000/0001-00"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] focus:border-transparent" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Razão social *</label>
                    <input type="text" required value={form.companyName}
                      onChange={(e) => set('companyName', e.target.value)}
                      placeholder="Construtora Silva Ltda"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                    <input type="tel" value={form.phone}
                      onChange={(e) => set('phone', e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] focus:border-transparent" />
                  </div>
                </div>
              </div>

              {/* Termos */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={form.terms}
                  onChange={(e) => set('terms', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[#F5A623]" />
                <span className="text-sm text-gray-600">
                  Li e concordo com os{' '}
                  <a href="#" className="text-[#F5A623] hover:underline">Termos de Uso</a>{' '}
                  e a{' '}
                  <a href="#" className="text-[#F5A623] hover:underline">Política de Privacidade</a>
                </span>
              </label>

              {/* Submit */}
              <button type="submit" disabled={loading}
                className="w-full py-3 bg-[#F5A623] text-white font-semibold rounded-xl hover:bg-[#d4891a] transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? 'Criando conta...' : 'Criar conta e continuar →'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CadastroPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Carregando...</div>}>
      <CadastroForm />
    </Suspense>
  )
}
