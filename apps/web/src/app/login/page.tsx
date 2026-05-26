'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { saveCompanySession } from '@/lib/auth-cookies'
import type { SubStatus } from '@/lib/auth-cookies'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/app/dashboard'

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${API}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Credenciais inválidas')

      // Salva dados do usuário (sempre disponíveis após login)
      localStorage.setItem('token',    data.token)
      localStorage.setItem('userId',   data.user?.id   || '')
      localStorage.setItem('userName', data.user?.name || '')

      // ── Sem empresa: vai para /planos ──────────────────────────────────────
      if (data.noCompanies || (Array.isArray(data.companies) && data.companies.length === 0 && !data.company)) {
        router.replace('/planos')
        return
      }

      // ── Múltiplas empresas → tela de seleção ──────────────────────────────
      if (data.requiresCompanySelection) {
        // Armazena lista de empresas no sessionStorage para a tela de seleção
        sessionStorage.setItem('sysobra_companies', JSON.stringify(data.companies))
        router.replace('/selecionar-empresa')
        return
      }

      // ── Empresa única (auto-selecionada pelo backend) ─────────────────────
      if (!data.company) {
        // Fallback: nenhuma empresa selecionável → planos
        router.replace('/planos')
        return
      }

      saveCompanySession({
        token:       data.token,
        company:     data.company,
        member:      data.member,
        permissions: data.permissions,
        userId:      data.user.id,
        userName:    data.user.name,
      })

      // Salva logo da empresa para uso em documentos
      if (data.company?.logo) {
        localStorage.setItem('companyLogoUrl', data.company.logo)
      }

      // Usa redirectTo do backend (já calcula status) ou fallback manual
      const redirectTo = data.redirectTo as string | undefined
      if (redirectTo && redirectTo !== '/app/dashboard') {
        router.replace(redirectTo)
      } else {
        // Compatibilidade: verifica status da assinatura localmente
        const status = data.company.subscriptionStatus as SubStatus
        if (status === 'PENDING') {
          router.replace('/app/assinatura-pendente')
        } else if (status === 'PAST_DUE' || status === 'CANCELED' || status === 'EXPIRED') {
          router.replace('/app/assinatura-vencida')
        } else {
          router.replace(redirect)
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header fixo com logo SYSOBRA */}
      <header className="bg-[#1a1a1a] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-[#F5A623] flex items-center justify-center">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <span className="text-white font-bold text-xl">SYSOBRA</span>
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 w-full max-w-md shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Entrar na sua conta</h1>
          <p className="text-sm text-gray-500 mb-6">
            Não tem conta?{' '}
            <Link href="/planos" className="text-[#F5A623] hover:underline font-medium">
              Ver planos
            </Link>
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#F5A623] text-white font-semibold rounded-xl hover:bg-[#d4891a] transition-colors disabled:opacity-60"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link
              href="/esqueci-senha"
              className="text-xs text-gray-400 hover:text-[#F5A623] transition-colors"
            >
              Esqueci minha senha
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="w-8 h-8 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
