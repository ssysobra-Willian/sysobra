'use client'

import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import { clearSession, saveBaseToken } from '@/lib/auth-cookies'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Itens de navegação com chave de módulo ───────────────────────────────────

const NAV_ITEMS = [
  { label: 'Dashboard',     module: 'dashboard',    icon: LayoutDashboard, href: '/app/dashboard'      },
  { label: 'Financeiro',    module: 'financeiro',   icon: DollarSign,      href: '/app/financeiro'     },
  { label: 'Obras',         module: 'obras',         icon: HardHat,         href: '/app/obras'          },
  { label: 'Compras',       module: 'compras',       icon: ShoppingCart,    href: '/app/compras'        },
  { label: 'Depósito',      module: 'deposito',      icon: Warehouse,       href: '/app/deposito'       },
  { label: 'Frota',         module: 'frota',         icon: Truck,           href: '/app/frota'          },
  { label: 'Colaboradores', module: 'colaboradores', icon: Users,           href: '/app/colaboradores'  },
  { label: 'Diário de Obra',module: 'diario_obra',   icon: BookOpen,        href: '/app/diario'         },
  { label: 'Orçamento',     module: 'orcamento',     icon: FileText,        href: '/app/orcamento'      },
  { label: 'Contratos',     module: 'contratos',     icon: FileCheck,       href: '/app/contratos'      },
  { label: 'Rastreador',    module: 'rastreador',    icon: MapPin,          href: '/app/rastreador'     },
] as const

export function Sidebar() {
  const pathname   = usePathname()
  const router     = useRouter()
  const { canAccessModule, isOwnerOrAdmin } = usePermissions()

  const [collapsed,    setCollapsed]    = useState(false)
  const [companyName,  setCompanyName]  = useState('Empresa')
  const [companyCnpj,  setCompanyCnpj]  = useState('')
  const [userName,     setUserName]     = useState('')

  useEffect(() => {
    setCompanyName(localStorage.getItem('companyName') || 'Empresa')
    setCompanyCnpj(localStorage.getItem('companyCnpj') || '')
    setUserName(localStorage.getItem('userName') || '')
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
        // Troca o token com empresa por um token base (sem companyId)
        const res = await fetch(`${API}/api/v1/auth/logout-company`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          saveBaseToken(data.token)
        }
      } catch { /* silencioso — redireciona de qualquer forma */ }
    }
    sessionStorage.removeItem('sysobra_companies')
    router.push('/selecionar-empresa')
  }

  // Filtra módulos que o usuário pode acessar (plano + permissão)
  const visibleItems = NAV_ITEMS.filter((item) => canAccessModule(item.module))

  return (
    <aside
      className={`flex flex-col bg-[#111827] h-screen sticky top-0 transition-all duration-200 flex-shrink-0 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* ── Logo SYSOBRA (sempre fixa, nunca substituída) ────────────────── */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-white/10">
        {!collapsed ? (
          <Link href="/app/dashboard" className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-md bg-[#F5A623] flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="text-white font-bold text-sm tracking-wide">SYSOBRA</span>
          </Link>
        ) : (
          <Link href="/app/dashboard" className="mx-auto">
            <div className="h-8 w-8 rounded-md bg-[#F5A623] flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
          </Link>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-gray-500 hover:text-white transition-colors ml-1 flex-shrink-0"
          title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* ── Navegação filtrada por permissões e plano ────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {visibleItems.map(({ label, icon: Icon, href }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group ${
                active
                  ? 'bg-[#F5A623] text-gray-900'
                  : 'text-[#9CA3AF] hover:bg-[#1F2937] hover:text-white'
              }`}
            >
              <Icon
                size={18}
                className={`flex-shrink-0 ${active ? 'text-gray-900' : 'text-gray-500 group-hover:text-white'}`}
              />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* ── Configurações (visível apenas para Owner/Admin) ──────────────── */}
      {isOwnerOrAdmin && (
        <div className="border-t border-white/10 px-2 pt-2 pb-1">
          <Link
            href="/app/configuracoes"
            title={collapsed ? 'Configurações' : undefined}
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

      {/* ── Rodapé: empresa + Trocar empresa + Sair ──────────────────────── */}
      <div className="border-t border-white/10 p-3 space-y-2">
        {!collapsed && (
          <div className="px-2">
            {/* Empresa atual */}
            <div className="flex items-center gap-2 mb-1.5">
              <div className="h-7 w-7 rounded-full bg-[#F5A623]/20 flex items-center justify-center flex-shrink-0">
                <span className="text-[#F5A623] text-xs font-bold">
                  {companyName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-200 truncate">{companyName}</p>
                {companyCnpj && (
                  <p className="text-[10px] text-gray-500 truncate">{companyCnpj}</p>
                )}
              </div>
            </div>

            {/* Botão Trocar empresa */}
            <button
              onClick={handleSwitchCompany}
              className="w-full flex items-center gap-1.5 text-xs text-gray-400 border border-white/10 rounded-lg px-2.5 py-1.5 hover:bg-white/5 hover:text-white transition-colors"
              title="Trocar de empresa"
            >
              <ArrowLeftRight size={12} />
              <span>Trocar empresa</span>
            </button>
          </div>
        )}

        {/* Sair */}
        <button
          onClick={handleLogout}
          title={collapsed ? 'Sair' : undefined}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-white/5 hover:text-red-400 transition-colors group"
        >
          <LogOut size={18} className="flex-shrink-0 group-hover:text-red-400" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  )
}
