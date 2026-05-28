'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { useTheme } from 'next-themes'
import { Sun, Moon, Menu } from 'lucide-react'
import { updateSubStatus } from '@/lib/auth-cookies'
import { ReactQueryProvider } from '@/providers/ReactQueryProvider'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Páginas de estado: sem sidebar, têm layout próprio
const STATUS_PAGES = [
  '/app/assinatura-pendente',
  '/app/assinatura-vencida',
  '/app/pagamento-recusado',
  '/app/ifc-viewer',
]

function Header({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { theme, setTheme } = useTheme()
  const [info, setInfo] = useState({ company: '', user: '' })

  useEffect(() => {
    setInfo({
      company: localStorage.getItem('companyName') || 'Empresa',
      user:    localStorage.getItem('userName')    || '',
    })
  }, [])

  return (
    <header className="h-14 bg-[#1a1a1a] flex items-center justify-between px-4 md:px-6 flex-shrink-0 gap-3">
      {/* ── Hamburger (apenas mobile/tablet) ─────────────────────────── */}
      <button
        onClick={onToggleSidebar}
        className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
        title="Abrir menu"
        aria-label="Abrir menu"
      >
        <Menu size={20} />
      </button>

      {/* ── Logo SYSOBRA (visível só no mobile quando sidebar fechada) ── */}
      <div className="lg:hidden flex items-center gap-2 flex-1 min-w-0">
        <div className="h-6 w-6 rounded bg-[#F5A623] flex items-center justify-center flex-shrink-0">
          <span className="text-white text-[10px] font-bold">S</span>
        </div>
        <span className="text-white font-semibold text-sm truncate">{info.company}</span>
      </div>

      {/* Desktop: empresa no centro/esquerda */}
      <div className="hidden lg:flex items-center gap-3 flex-1">
        <div className="h-7 w-7 rounded bg-[#F5A623] flex items-center justify-center">
          <span className="text-white text-xs font-bold">S</span>
        </div>
        <span className="text-white font-semibold text-sm">{info.company}</span>
      </div>

      {/* ── Direita: tema + usuário ───────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-shrink-0">
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
  const router   = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isStatusPage = STATUS_PAGES.some(p => pathname.startsWith(p))

  // Fecha sidebar mobile ao mudar de rota
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  // Fecha sidebar mobile ao redimensionar para desktop
  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= 1024) setSidebarOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Verificação de auth e subscription
  useEffect(() => {
    const token     = localStorage.getItem('token')
    const companyId = localStorage.getItem('companyId')

    if (!token) { router.replace('/login'); return }
    if (!companyId) { router.replace('/selecionar-empresa'); return }

    if (!isStatusPage) {
      fetch(`${API}/api/v1/companies/current`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => {
          if (r.status === 401 || r.status === 403) { router.replace('/selecionar-empresa'); return null }
          return r.ok ? r.json() : null
        })
        .then(data => {
          if (!data?.company) return
          const { plan, subscriptionStatus, stripeSubscriptionId, logo, name } = data.company
          if (logo) localStorage.setItem('companyLogoUrl', logo)
          if (name) localStorage.setItem('companyName', name)
          updateSubStatus(subscriptionStatus as any)

          if (plan === 'FREE' && !stripeSubscriptionId) return
          if (!stripeSubscriptionId && subscriptionStatus !== 'ACTIVE') { router.replace('/app/assinatura-pendente'); return }
          if (subscriptionStatus === 'PAST_DUE' || subscriptionStatus === 'EXPIRED') { router.replace('/app/assinatura-vencida'); return }
          if (subscriptionStatus === 'CANCELED') { router.replace('/app/assinatura-vencida'); return }
        })
        .catch(() => {})
    }
  }, [pathname, isStatusPage, router])

  if (isStatusPage) return <ReactQueryProvider>{children}</ReactQueryProvider>

  return (
    <ReactQueryProvider>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
        {/* ── Sidebar (desktop: no layout flex | mobile: drawer sobreposto) */}
        <Sidebar
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
        />

        {/* ── Área principal ──────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <Header onToggleSidebar={() => setSidebarOpen(v => !v)} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
    </ReactQueryProvider>
  )
}
