/**
 * Utilitários para gerenciar cookies de autenticação e sessão.
 * Cookies  → lidos pelo middleware Edge (server-side, sem DB)
 * localStorage → lido pelo client-side (hooks, componentes)
 * Ambos são atualizados em conjunto para garantir consistência.
 */

const SEVEN_DAYS = 7 * 24 * 60 * 60 // segundos

export type SubStatus =
  | 'ACTIVE'
  | 'PENDING'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'FAILED'
  | 'EXPIRED'

export type MemberRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER' | 'EXTERNAL' | 'CLIENT'
export type MemberType = 'INTERNAL' | 'EXTERNAL' | 'CLIENT'

export type PermissionsMap = Record<string, string[]> | { all: true }

// ─── Helpers de cookie ────────────────────────────────────────────────────────

function setCookie(name: string, value: string, maxAge = SEVEN_DAYS) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`
}

// ─── saveSession ──────────────────────────────────────────────────────────────
/** Salva sessão completa após login ou registro + criação de empresa */
export function saveSession(params: {
  token: string
  userId: string
  userName: string
  companyId: string
  companyName: string
  companyCnpj?: string
  plan: string
  subStatus: SubStatus
  memberRole?: MemberRole
  memberType?: MemberType
  permissions?: PermissionsMap
}) {
  // ── localStorage (client-side) ──────────────────────────────────────────
  localStorage.setItem('token', params.token)
  localStorage.setItem('userId', params.userId)
  localStorage.setItem('userName', params.userName)
  localStorage.setItem('companyId', params.companyId)
  localStorage.setItem('companyName', params.companyName)
  if (params.companyCnpj) localStorage.setItem('companyCnpj', params.companyCnpj)
  localStorage.setItem('selectedPlan', params.plan)
  localStorage.setItem('memberRole', params.memberRole ?? 'MEMBER')
  localStorage.setItem('memberType', params.memberType ?? 'INTERNAL')
  localStorage.setItem(
    'sysobra_permissions',
    JSON.stringify(params.permissions ?? { all: true }),
  )

  // ── cookies (middleware server-side) ────────────────────────────────────
  setCookie('sysobra_token', params.token)
  setCookie('sysobra_company_id', params.companyId)
  setCookie('sysobra_plan', params.plan)
  setCookie('sysobra_sub_status', params.subStatus)
  setCookie('sysobra_member_role', params.memberRole ?? 'MEMBER')
}

// ─── saveCompanySession ───────────────────────────────────────────────────────
/**
 * Salva a sessão de empresa APÓS a seleção de empresa via /selecionar-empresa.
 * Recebe a resposta completa de POST /api/v1/auth/select-company.
 */
export function saveCompanySession(params: {
  token: string
  company: {
    id: string
    name: string
    cnpj?: string | null
    plan: string
    subscriptionStatus: string
    stripeSubscriptionId?: string | null
  }
  member: {
    memberRole: MemberRole
    memberType: MemberType
  }
  permissions: PermissionsMap
  userId: string
  userName: string
}) {
  const subStatus = params.company.subscriptionStatus as SubStatus

  // ── localStorage ────────────────────────────────────────────────────────
  localStorage.setItem('token', params.token)
  localStorage.setItem('userId', params.userId)
  localStorage.setItem('userName', params.userName)
  localStorage.setItem('companyId', params.company.id)
  localStorage.setItem('companyName', params.company.name)
  if (params.company.cnpj) localStorage.setItem('companyCnpj', params.company.cnpj)
  localStorage.setItem('selectedPlan', params.company.plan)
  localStorage.setItem('memberRole', params.member.memberRole)
  localStorage.setItem('memberType', params.member.memberType)
  localStorage.setItem('sysobra_permissions', JSON.stringify(params.permissions))

  // ── cookies ──────────────────────────────────────────────────────────────
  setCookie('sysobra_token', params.token)
  setCookie('sysobra_company_id', params.company.id)
  setCookie('sysobra_plan', params.company.plan)
  setCookie('sysobra_sub_status', subStatus)
  setCookie('sysobra_member_role', params.member.memberRole)
}

// ─── updateSubStatus ─────────────────────────────────────────────────────────
/** Atualiza apenas o status da assinatura (após pagamento confirmado ou webhook) */
export function updateSubStatus(status: SubStatus) {
  setCookie('sysobra_sub_status', status)
}

// ─── saveBaseToken ────────────────────────────────────────────────────────────
/**
 * Salva apenas o token base (sem empresa selecionada).
 * Usado ao "Trocar empresa": mantém userId/userName mas remove dados da empresa.
 */
export function saveBaseToken(token: string) {
  localStorage.setItem('token', token)
  // Remove dados da empresa
  localStorage.removeItem('companyId')
  localStorage.removeItem('companyName')
  localStorage.removeItem('companyCnpj')
  localStorage.removeItem('selectedPlan')
  localStorage.removeItem('memberRole')
  localStorage.removeItem('memberType')
  localStorage.removeItem('sysobra_permissions')
  // Cookies
  setCookie('sysobra_token', token)
  deleteCookie('sysobra_company_id')
  deleteCookie('sysobra_plan')
  deleteCookie('sysobra_sub_status')
  deleteCookie('sysobra_member_role')
}

// ─── clearSession ─────────────────────────────────────────────────────────────
/** Limpa toda a sessão (logout) */
export function clearSession() {
  localStorage.clear()
  deleteCookie('sysobra_token')
  deleteCookie('sysobra_company_id')
  deleteCookie('sysobra_plan')
  deleteCookie('sysobra_sub_status')
  deleteCookie('sysobra_member_role')
}
