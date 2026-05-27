import { FastifyInstance } from 'fastify'
import { prisma }          from '@sysobra/database'
import {
  authenticate,
  requireCompany,
  RequestWithMember,
} from '../../middlewares/auth.middleware'

const p = prisma as any

// ─────────────────────────────────────────────────────────────────────────────

export async function auditLogRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireCompany)

  /**
   * GET /api/v1/audit-logs
   *
   * SEGURANÇA: filtra SEMPRE por companyId do token — nunca vazar dados de outra empresa.
   *
   * Query params:
   *   module?    — filtrar por módulo (FINANCIAL, PROJECT, DIARY, AUTH, etc.)
   *   action?    — filtrar por ação (CREATE, UPDATE, PAY, APPROVE, etc.)
   *   userId?    — filtrar por usuário (só da mesma empresa, verificado internamente)
   *   entity?    — filtrar por entidade (FinancialTransaction, Project, etc.)
   *   entityId?  — filtrar por ID do registro afetado
   *   startDate? — yyyy-MM-dd — período início
   *   endDate?   — yyyy-MM-dd — período fim
   *   search?    — busca na descrição (case-insensitive)
   *   page?      — padrão 1
   *   limit?     — padrão 20, máx 100
   */
  app.get('/', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!

    const q = request.query as {
      module?:    string
      action?:    string
      userId?:    string
      entity?:    string
      entityId?:  string
      startDate?: string
      endDate?:   string
      search?:    string
      page?:      string
      limit?:     string
    }

    const page  = Math.max(1, parseInt(q.page  ?? '1',  10))
    const limit = Math.min(100, parseInt(q.limit ?? '20', 10))
    const skip  = (page - 1) * limit

    // ── Construir where — companyId é SEMPRE obrigatório ─────────────────────
    const where: any = { companyId }

    if (q.module)   where.module   = q.module
    if (q.action)   where.action   = q.action
    if (q.entity)   where.entity   = q.entity
    if (q.entityId) where.entityId = q.entityId

    // SEGURANÇA: ao filtrar por userId, verificar que o userId pertence à empresa
    if (q.userId) {
      const memberCheck = await p.companyMember.findFirst({
        where:  { companyId, userId: q.userId, isActive: true },
        select: { id: true },
      })
      if (memberCheck) {
        where.userId = q.userId
      }
      // Se não for membro, simplesmente ignora o filtro (não retorna erro)
    }

    if (q.search) {
      where.description = { contains: q.search, mode: 'insensitive' }
    }

    if (q.startDate || q.endDate) {
      where.createdAt = {}
      if (q.startDate) where.createdAt.gte = new Date(q.startDate + 'T00:00:00')
      if (q.endDate)   where.createdAt.lte = new Date(q.endDate   + 'T23:59:59')
    }

    // ── Queries paralelas ─────────────────────────────────────────────────────
    const [logs, total] = await Promise.all([
      p.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        take:    limit,
        skip,
      }),
      p.auditLog.count({ where }),
    ])

    // ── Formatar resposta ─────────────────────────────────────────────────────
    const formatted = logs.map((log: any) => ({
      id:          log.id,
      action:      log.action,
      module:      log.module,
      entity:      log.entity,
      entityId:    log.entityId,
      entityName:  log.entityName,
      description: log.description,
      metadata:    log.metadata,
      ipAddress:   log.ipAddress,
      createdAt:   log.createdAt,
      user:        log.user
        ? { id: log.user.id, name: log.user.name, avatarUrl: log.user.avatarUrl }
        : null,
    }))

    return reply.send({
      logs: formatted,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext:    page * limit < total,
        hasPrev:    page > 1,
      },
      // compat legado
      offset: skip,
    })
  })

  /**
   * GET /api/v1/audit-logs/today-count
   * Conta os logs de HOJE para o badge no dashboard
   */
  app.get('/today-count', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const count = await p.auditLog.count({
      where: {
        companyId,
        createdAt: { gte: today },
      },
    })

    return reply.send({ count })
  })

  /**
   * GET /api/v1/audit-logs/users
   * Lista usuários que aparecem nos logs (para o filtro de usuário)
   */
  app.get('/users', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!

    // Pegar IDs únicos de usuários que geraram logs nesta empresa
    const rawLogs = await p.auditLog.findMany({
      where:    { companyId, userId: { not: null } },
      select:   { userId: true },
      distinct: ['userId'],
    })

    const userIds = rawLogs.map((l: any) => l.userId).filter(Boolean)

    if (userIds.length === 0) return reply.send({ users: [] })

    const users = await prisma.user.findMany({
      where:  { id: { in: userIds } },
      select: { id: true, name: true, avatarUrl: true },
      orderBy: { name: 'asc' },
    })

    return reply.send({ users })
  })

  /**
   * GET /api/v1/audit-logs/export
   * Exporta os logs em formato CSV (respeita os mesmos filtros do GET /)
   */
  app.get('/export', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!

    const q = request.query as {
      module?:    string
      action?:    string
      userId?:    string
      entity?:    string
      startDate?: string
      endDate?:   string
      search?:    string
    }

    const where: any = { companyId }
    if (q.module)   where.module   = q.module
    if (q.action)   where.action   = q.action
    if (q.entity)   where.entity   = q.entity
    if (q.search)   where.description = { contains: q.search, mode: 'insensitive' }
    if (q.userId) {
      const memberCheck = await p.companyMember.findFirst({
        where: { companyId, userId: q.userId, isActive: true },
        select: { id: true },
      })
      if (memberCheck) where.userId = q.userId
    }
    if (q.startDate || q.endDate) {
      where.createdAt = {}
      if (q.startDate) where.createdAt.gte = new Date(q.startDate + 'T00:00:00')
      if (q.endDate)   where.createdAt.lte = new Date(q.endDate   + 'T23:59:59')
    }

    const logs = await p.auditLog.findMany({
      where,
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take:    5000, // máximo de 5000 linhas no CSV
    })

    // Gerar CSV
    const header = ['Data/Hora', 'Módulo', 'Ação', 'Entidade', 'ID Entidade', 'Nome', 'Usuário', 'Descrição', 'IP'].join(';')
    const rows   = logs.map((log: any) => [
      new Date(log.createdAt).toLocaleString('pt-BR'),
      log.module,
      log.action,
      log.entity,
      log.entityId ?? '',
      log.entityName ?? '',
      log.user?.name ?? 'Sistema',
      `"${(log.description ?? '').replace(/"/g, '""')}"`,
      log.ipAddress ?? '',
    ].join(';'))

    const csv = [header, ...rows].join('\n')

    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().slice(0,10)}.csv"`)
      .send('﻿' + csv) // BOM para UTF-8 no Excel
  })
}
