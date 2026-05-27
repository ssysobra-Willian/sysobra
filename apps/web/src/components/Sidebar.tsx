'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  DollarSign,
  ShoppingCart,
  HardHat,
  Warehouse,
  Truck,
  Users,
  BookOpen,
  FileText,
  FileCheck,
  MapPin,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
  X,
} from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import { clearSession, saveBaseToken } from '@/lib/auth-cookies'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Itens de navegação com chave de módulo ───────────────────────────────────

const NAV_ITEMS = [
  { label: 'Dashboard',       module: 'dashboard',    icon: LayoutDashboard, href: '/app/dashboard'        },
  { label: 'Financeiro',      module: 'financeiro',   icon: DollarSign,      href: '/app/financeiro'       },
  { label: 'Centro de Custo', module: 'obras',        icon: HardHat,         href: '/app/centro-de-custo'  },
  { label: 'Compras',         module: 'compras',      icon: ShoppingCart,    href: '/app/compras'          },
  { label: 'Depósito',        module: 'deposito',     icon: Warehouse,       href: '/app/deposito'         },
  { label: 'Frota',           module: 'frota',        icon: Truck,           href: '/app/frota'            },
  { label: 'Colaboradores',   module: 'colaboradores',icon: Users,           href: '/app/colaboradores'    },
  { label: 'Diário de Obra',  module: 'diario_obra',  icon: BookOpen,        href: '/app/diario'           },
  { label: 'Orçamento',       module: 'orcamento',    icon: FileText,        href: '/app/orcamento'        },
  { label: 'Contratos',       module: 'contratos',    icon: FileCheck,       href: '/app/contratos'        },
  { label: 'Rastreador',      module: 'rastreador',   icon: MapPin,          href: '/app/rastreador'       },
] as const

// ─── Props ───────────────────────────────────────────────────────────────────

interface SidebarProps {
  /** Mobile: drawer aberto */
  mobileOpen?: boolean
  /** Callback para fechar o drawer no mobile */
  onMobileClose?: () => void
}

// ─── Conteúdo interno da sidebar ─────────────────────────────────────────────

interface SidebarContentProps {
  collapsed: boolean
  onToggleCollapsed?: () => void
  showCloseButton?: boolean
  onClose?: () => void
}

function SidebarContent({ collapsed, onToggleCollapsed, showCloseButton, onClose }: SidebarContentProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const { canAccessModule, isOwnerOrAdmin } = usePermissions()

  const [companyName, setCompanyName] = useState('Empresa')
  const [companyCnpj, setCompanyCnpj] = useState('')

  useEffect(() => {
    setCompanyName(localStorage.getItem('companyName') || 'Empresa')
    setCompanyCnpj(localStorage.getItem('companyCnpj') || '')
  }, [])

  function handleLogout() {
    clearSession()
    sessionStorage.removeItem('sysobra_companies')
    router.push('/login')
  }

  async function handleSwitchCompany() {
    const token = localStorage.getItem('token')
    if (token) {
      try {
        const res = await fetch(`${API}/api/v1/auth/logout-company`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) { const data = await res.json(); saveBaseToken(data.token) }
      } catch { /* silencioso */ }
    }
    sessionStorage.removeItem('sysobra_companies')
    router.push('/selecionar-empresa')
  }

  const visibleItems = NAV_ITEMS.filter(item => canAccessModule(item.module))

  return (
    <div className={`flex flex-col h-full bg-[#111827] transition-all duration-200 ${collapsed ? 'w-16' : 'w-60'}`}>
      {/* ── Logo + botões de controle ────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-white/10">
        {!collapsed ? (
          <Link href="/app/dashboard" className="flex items-center min-w-0">
            <Image
              src="/logo-dark.png"
              alt="SYSOBRA"
              width={140}
              height={32}
              style={{ height: 32, width: 'auto', objectFit: 'contain' }}
              priority
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.style.display = 'none'
                const span = document.createElement('span')
                span.className = 'text-white font-bold text-sm tracking-wide'
                span.textContent = 'SYSOBRA'
                target.parentNode?.appendChild(span)
              }}
            />
          </Link>
        ) : (
          <Link href="/app/dashboard" className="mx-auto">
            <Image
              src="/logo-icon.png"
              alt="S"
              width={32}
              height={32}
              style={{ height: 32, width: 32, objectFit: 'contain' }}
              priority
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.style.display = 'none'
                const div = document.createElement('div')
                div.className = 'h-8 w-8 rounded-md bg-[#F5A623] flex items-center justify-center'
                div.innerHTML = '<span class="text-white font-bold text-sm">S</span>'
                target.parentNode?.appendChild(div)
              }}
            />
          </Link>
        )}

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Botão fechar no mobile */}
          {showCloseButton && (
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-white/10"
              title="Fechar menu"
            >
              <X size={16} />
            </button>
          )}
          {/* Botão colapsar no desktop */}
          {onToggleCollapsed && (
            <button
              onClick={onToggleCollapsed}
              className="text-gray-500 hover:text-white transition-colors ml-1"
              title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* ── Navegação ───────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {visibleItems.map(({ label, icon: Icon, href }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group ${
                active
                  ? 'bg-[#F5A623] text-gray-900'
                  : 'text-[#9CA3AF] hover:bg-[#1F2937] hover:text-white'
              }`}
            >
              <Icon size={18} className={`flex-shrink-0 ${active ? 'text-gray-900' : 'text-gray-500 group-hover:text-white'}`} />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* ── Configurações ────────────────────────────────────────────── */}
      {isOwnerOrAdmin && (
        <div className="border-t border-white/10 px-2 pt-2 pb-1">
          <Link
            href="/app/configuracoes"
            title={collapsed ? 'Configurações' : undefined}
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group ${
              pathname.startsWith('/app/configuracoes')
                ? 'bg-[#F5A623] text-gray-900'
                : 'text-[#9CA3AF] hover:bg-[#1F2937] hover:text-white'
            }`}
          >
            <Settings size={18} className="flex-shrink-0 text-gray-500 group-hover:text-white" />
            {!collapsed && <span>Configurações</span>}
          </Link>
        </div>
      )}

      {/* ── Rodapé ───────────────────────────────────────────────────── */}
      <div className="border-t border-white/10 p-3 space-y-2">
        {!collapsed && (
          <div className="px-2">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="h-7 w-7 rounded-full bg-[#F5A623]/20 flex items-center justify-center flex-shrink-0">
                <span className="text-[#F5A623] text-xs font-bold">{companyName.charAt(0).toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-200 truncate">{companyName}</p>
                {companyCnpj && <p className="text-[10px] text-gray-500 truncate">{companyCnpj}</p>}
              </div>
            </div>
            <button
              onClick={handleSwitchCompany}
              className="w-full flex items-center gap-1.5 text-xs text-gray-400 border border-white/10 rounded-lg px-2.5 py-1.5 hover:bg-white/5 hover:text-white transition-colors"
            >
              <ArrowLeftRight size={12} />
              <span>Trocar empresa</span>
            </button>
          </div>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? 'Sair' : undefined}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-white/5 hover:text-red-400 transition-colors group"
        >
          <LogOut size={18} className="flex-shrink-0 group-hover:text-red-400" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </div>
  )
}

// ─── Componente exportado ─────────────────────────────────────────────────────

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  // Fecha o drawer mobile ao navegar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onMobileClose?.() }, [pathname])

  return (
    <>
      {/* ─── Desktop: sticky no layout ────────────────────────────────── */}
      <div className={`hidden lg:block flex-shrink-0 transition-all duration-200 ${collapsed ? 'w-16' : 'w-60'}`}>
        <div className="sticky top-0 h-screen overflow-hidden">
          <SidebarContent
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed(c => !c)}
          />
        </div>
      </div>

      {/* ─── Mobile/Tablet: overlay + drawer ──────────────────────────── */}
      <>
        {/* Backdrop */}
        <div
          className={`lg:hidden fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
            mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={onMobileClose}
        />
        {/* Drawer */}
        <div
          className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-300 ease-in-out ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <SidebarContent
            collapsed={false}
            showCloseButton
            onClose={onMobileClose}
          />
        </div>
      </>
    </>
  )
}
