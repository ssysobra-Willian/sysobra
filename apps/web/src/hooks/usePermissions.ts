'use client'

import { useMemo, useState, useEffect } from 'react'
import type { MemberRole, MemberType, PermissionsMap } from '@/lib/auth-cookies'

// ─── Mapa de módulos disponíveis por plano ────────────────────────────────────
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

// ─── Leituras seguras do localStorage (apenas no cliente montado) ─────────────

function readPermissions(): PermissionsMap {
  try {
    return JSON.parse(localStorage.getItem('sysobra_permissions') ?? '{"all":true}')
  } catch {
    return { all: true }
  }
}

function readPlan(): string {
  return localStorage.getItem('selectedPlan') ?? 'STARTER'
}

function readMemberRole(): MemberRole {
  return (localStorage.getItem('memberRole') ?? 'MEMBER') as MemberRole
}

function readMemberType(): MemberType {
  return (localStorage.getItem('memberType') ?? 'INTERNAL') as MemberType
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function usePermissions() {
  // ── Padrão anti-hydration-mismatch ──────────────────────────────────────────
  // O servidor (SSR) e o cliente na PRIMEIRA render devem produzir HTML idêntico.
  // Leituras de localStorage só são seguras APÓS o componente montar no cliente.
  // Com mounted=false: servidor e cliente produzem os mesmos valores padrão.
  // Com mounted=true (após useEffect): valores reais do localStorage são usados.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Valores derivados — recalculados apenas quando mounted muda
  const permissions = useMemo<PermissionsMap>(
    () => mounted ? readPermissions() : { all: true },
    [mounted],
  )

  const plan = useMemo(
    () => mounted ? readPlan() : 'STARTER',
    [mounted],
  )

  const memberRole = useMemo<MemberRole>(
    () => mounted ? readMemberRole() : 'MEMBER',
    [mounted],
  )

  const memberType = useMemo<MemberType>(
    () => mounted ? readMemberType() : 'INTERNAL',
    [mounted],
  )

  // ─── API pública ─────────────────────────────────────────────────────────────

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
    // Exposto para casos onde o consumer precisa saber se já montou
    mounted,
  }
}
