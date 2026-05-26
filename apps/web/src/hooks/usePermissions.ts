'use client'

import { useMemo } from 'react'
import type { MemberRole, MemberType, PermissionsMap } from '@/lib/auth-cookies'

// ─── Mapa de módulos disponíveis por plano ────────────────────────────────────
// Módulos bloqueados em planos menores não aparecem na sidebar, mesmo que o
// usuário tenha permissão — a conta precisa do plano adequado.
const PLAN_MODULES: Record<string, string[]> = {
  FREE: ['dashboard', 'diario_obra'],
  STARTER: [
    'dashboard', 'financeiro', 'obras', 'compras', 'deposito',
    'frota', 'colaboradores', 'diario_obra', 'orcamento', 'contratos',
    'configuracoes',
  ],
  PROFESSIONAL: [
    'dashboard', 'financeiro', 'obras', 'compras', 'deposito',
    'frota', 'colaboradores', 'diario_obra', 'orcamento', 'contratos',
    'rastreador', 'configuracoes',
  ],
  ENTERPRISE: [
    'dashboard', 'financeiro', 'obras', 'compras', 'deposito',
    'frota', 'colaboradores', 'diario_obra', 'orcamento', 'contratos',
    'rastreador', 'configuracoes',
  ],
}

function readPermissions(): PermissionsMap {
  if (typeof window === 'undefined') return { all: true }
  try {
    return JSON.parse(localStorage.getItem('sysobra_permissions') ?? '{"all":true}')
  } catch {
    return { all: true }
  }
}

function readPlan(): string {
  if (typeof window === 'undefined') return 'STARTER'
  return localStorage.getItem('selectedPlan') ?? 'STARTER'
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function usePermissions() {
  // useMemo evita re-parse a cada render; re-calcula só quando o componente
  // remonta (o token/permissão raramente muda em tempo de vida de uma página).
  const permissions = useMemo(readPermissions, [])
  const plan = useMemo(readPlan, [])

  /**
   * Verifica se o usuário pode executar `action` no `module`.
   * Exemplos: can('financeiro', 'view'), can('compras', 'approve')
   */
  const can = (module: string, action: string): boolean => {
    if ((permissions as { all?: boolean }).all === true) return true
    const perms = permissions as Record<string, string[]>
    return perms[module]?.includes(action) ?? false
  }

  /**
   * Verifica se o usuário tem pelo menos permissão 'view' no módulo
   * E se o módulo está disponível no plano da empresa.
   */
  const canAccessModule = (module: string): boolean => {
    // dashboard é sempre visível para qualquer usuário autenticado
    if (module === 'dashboard') return true

    // Verifica se o plano inclui o módulo
    const planModules = PLAN_MODULES[plan] ?? PLAN_MODULES.STARTER
    if (!planModules.includes(module)) return false

    if ((permissions as { all?: boolean }).all === true) return true
    const perms = permissions as Record<string, string[]>
    return !!(perms[module]?.length)
  }

  const memberRole = (typeof window !== 'undefined'
    ? localStorage.getItem('memberRole')
    : 'MEMBER') as MemberRole

  const memberType = (typeof window !== 'undefined'
    ? localStorage.getItem('memberType')
    : 'INTERNAL') as MemberType

  const isOwnerOrAdmin = memberRole === 'OWNER' || memberRole === 'ADMIN'
  const isExternal     = memberType === 'EXTERNAL'
  const isClient       = memberType === 'CLIENT'

  return {
    can,
    canAccessModule,
    permissions,
    plan,
    memberRole,
    memberType,
    isOwnerOrAdmin,
    isExternal,
    isClient,
  }
}
