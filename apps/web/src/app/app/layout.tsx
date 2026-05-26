'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { updateSubStatus } from '@/lib/auth-cookies'
import { ReactQueryProvider } from '@/providers/ReactQueryProvider'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Páginas de estado: sem sidebar, têm layout próprio
const STATUS_PAGES = [
  '/app/assinatura-pendente',
  '/app/assinatura-vencida',
  '/app/pagamento-recusado',
]

function Header() {
  const { theme, setTheme } = useTheme()
  const [info, setInfo] = useState({ company: '', user: '' })

  useEffect(() => {
    setInfo({
      company: localStorage.getItem('companyName') || 'Empresa',
      user: localStorage.getItem('userName') || '',
    })
  }, [])

  return (
    <header className="h-14 bg-[#1a1a1a] flex items-center justify-between px-6 flex-shrink-0">
      {/* Logo SYSOBRA — sempre fixa, nunca substituída pela logo do cliente */}
      <div className="flex items-center gap-3">
        <div className="h-7 w-7 rounded bg-[#F5A623] flex items-center justify-center">
          <span className="text-white text-xs font-bold">S</span>
        </div>
        <span className="text-white font-semibold text-sm">{info.company}</span>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="text-gray-400 hover:text-white transition-colors"
          title="Alternar tema"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-[#F5A623] flex items-center justify-center">
            <span className="text-white text-xs font-bold">
              {info.user.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
          <span className="text-gray-300 text-sm hidden md:block">{info.user}</span>
        </div>
      </div>
    </header>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  const isStatusPage = STATUS_PAGES.some((p) => pathname.startsWith(p))

  useEffect(() => {
    // 1. Auth check — token e empresa devem existir
    const token     = localStorage.getItem('token')
    const companyId = localStorage.getItem('companyId')

    if (!token) {
      router.replace('/login')
      return
    }

    // Se não há empresa selecionada no localStorage, volta para seleção
    if (!companyId) {
      router.replace('/selecionar-empresa')
      return
    }

    // 2. Verificação de subscription via API (autoritativa, inclui mudanças de webhook)
    if (!isStatusPage) {
      fetch(`${API}/api/v1/companies/current`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => {
          if (r.status === 401 || r.status === 403) {
            // Token inválido ou sem empresa → redireciona
            router.replace('/selecionar-empresa')
            return null
          }
          return r.ok ? r.json() : null
        })
        .then((data) => {
          if (!data?.company) return

          const { plan, subscriptionStatus, stripeSubscriptionId, logo, name } = data.company

          // Atualiza cache local com dados frescos do servidor
          if (logo) localStorage.setItem('companyLogoUrl', logo)
          if (name) localStorage.setItem('companyName', name)
          updateSubStatus(subscriptionStatus as any)

          // FREE sem stripe nem trial → planos
          if (plan === 'FREE' && !stripeSubscriptionId) return

          // Pago mas sem subscription ativa → pendente
          if (!stripeSubscriptionId && subscriptionStatus !== 'ACTIVE') {
            router.replace('/app/assinatura-pendente')
            return
          }

          if (subscriptionStatus === 'PAST_DUE' || subscriptionStatus === 'EXPIRED') {
            router.replace('/app/assinatura-vencida')
            return
          }

          if (subscriptionStatus === 'CANCELED') {
            router.replace('/app/assinatura-vencida')
            return
          }
        })
        .catch(() => {/* silencia erros de rede */})
    }
  }, [pathname, isStatusPage, router])

  // Páginas de estado rendem sem sidebar (têm seu próprio header)
  if (isStatusPage) {
    return <ReactQueryProvider>{children}</ReactQueryProvider>
  }

  return (
    <ReactQueryProvider>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </ReactQueryProvider>
  )
}
