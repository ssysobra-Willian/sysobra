import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@sysobra/database'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string       // userId
  email?: string
  companyId?: string // presente após select-company
}

export interface RequestWithMember extends FastifyRequest {
  companyId: string
  memberId: string
  memberRole: string
  memberType: string
  permissions: Record<string, unknown>
}

// ─── Middleware básico de autenticação ───────────────────────────────────────

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    return reply.status(401).send({
      error: 'Não autorizado',
      message: 'Token inválido ou expirado',
    })
  }
}

// ─── Middleware que exige empresa selecionada ────────────────────────────────
// Deve ser usado APÓS authenticate.
// Adiciona req.companyId, req.memberId, req.memberRole, req.permissions

export async function requireCompany(request: FastifyRequest, reply: FastifyReply) {
  const payload = request.user as JwtPayload

  // Suporte a tokens antigos (sem companyId): tenta usar a primeira empresa
  let companyId = payload.companyId
  if (!companyId) {
    const membership = await prisma.companyMember.findFirst({
      where: { userId: payload.sub, isActive: true },
      orderBy: { joinedAt: 'asc' },
    })
    if (!membership) {
      return reply.status(403).send({ error: 'Nenhuma empresa associada ao usuário' })
    }
    companyId = membership.companyId
  }

  const membership = await prisma.companyMember.findUnique({
    where: { companyId_userId: { companyId, userId: payload.sub } },
  })

  if (!membership || !membership.isActive) {
    return reply.status(403).send({ error: 'Usuário não é membro ativo desta empresa' })
  }

  // Injeta no request para uso posterior
  const req = request as RequestWithMember
  req.companyId = companyId
  req.memberId = membership.id
  req.memberRole = membership.memberRole
  req.memberType = membership.memberType
  req.permissions = (membership.permissions as Record<string, unknown>) ?? {}
}

// ─── Factory de middleware de permissão ──────────────────────────────────────

export function requirePermission(module: string, action: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // requireCompany deve ter sido chamado antes (via preHandler chain)
    const req = request as RequestWithMember
    if (!req.companyId) {
      await requireCompany(request, reply)
      if (reply.sent) return
    }

    const permissions = req.permissions ?? {}

    // OWNER / ADMIN têm acesso irrestrito
    if ((permissions as any).all === true) return

    const modulePerms: string[] = (permissions as any)[module] ?? []
    if (!modulePerms.includes(action)) {
      return reply.status(403).send({
        error: `Sem permissão para "${action}" em "${module}"`,
        module,
        action,
        upgrade: 'Solicite ao administrador da empresa para liberar seu acesso',
      })
    }
  }
}

// ─── Permissões padrão por role ───────────────────────────────────────────────

export type PermissionsMap = Record<string, string[]> | { all: true }

export const DEFAULT_PERMISSIONS: Record<string, PermissionsMap> = {
  OWNER:   { all: true },
  ADMIN:   { all: true },
  MANAGER: {
    financeiro:    ['view', 'create', 'edit', 'delete'],
    centro_custo:  ['view', 'create', 'edit'],
    compras:       ['view', 'create', 'approve'],
    deposito:      ['view', 'create', 'edit'],
    frota:         ['view', 'create', 'edit'],
    colaboradores: ['view', 'create', 'edit'],
    diario_obra:   ['view', 'create', 'edit', 'delete', 'approve', 'comment'],
    orcamento:     ['view', 'create', 'edit'],
    contratos:     ['view', 'create', 'edit', 'approve'],
    rastreador:    ['view', 'create', 'edit'],
    configuracoes: ['view'],
  },
  MEMBER: {
    financeiro:    ['view'],
    centro_custo:  ['view'],
    compras:       ['view', 'create'],
    deposito:      ['view'],
    frota:         ['view'],
    colaboradores: ['view'],
    diario_obra:   ['view', 'create', 'edit', 'approve', 'comment'],
    orcamento:     ['view'],
    contratos:     ['view'],
    rastreador:    ['view'],
    configuracoes: [],
  },
  EXTERNAL: {
    diario_obra: ['view', 'create', 'edit', 'comment'],
  },
  CLIENT: {
    diario_obra: ['view', 'comment'],
  },
}
