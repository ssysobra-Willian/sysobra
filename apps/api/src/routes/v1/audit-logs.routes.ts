import { FastifyInstance } from 'fastify'
import { prisma }          from '@sysobra/database'
import {
  authenticate,
  requireCompany,
  RequestWithMember,
} from '../../middlewares/auth.middleware'

const p = prisma as any

// ─── Labels legíveis ──────────────────────────────────────────────────────────

const ACTION_LABEL: Record<string, string> = {
  CREATE:          'criou',
  UPDATE:          'atualizou',
  DELETE:          'excluiu',
  SUBMIT:          'enviou para aprovação',
  APPROVE:         'aprovou',
  REJECT:          'devolveu',
  COMMENT:         'comentou em',
  PROGRESS_UPDATE: 'atualizou progresso de',
  UPLOAD:          'fez upload em',
  LOGO_UPDATE:     'atualizou a logo de',
}

const ENTITY_LABEL: Record<string, string> = {
  Project:    'obra',
  Stage:      'etapa',
  DiaryEntry: 'RDO',
  Company:    'empresa',
}

function buildDescription(action: string, entity: string, entityName?: string | null): string {
  const verb   = ACTION_LABEL[action]  ?? action.toLowerCase()
  const noun   = ENTITY_LABEL[entity]  ?? entity
  const name   = entityName ? ` "${entityName}"` : ''
  return `${verb} ${noun}${name}`
}

// ─── Rota ─────────────────────────────────────────────────────────────────────

export async function auditLogRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireCompany)

  /**
   * GET /api/v1/audit-logs
   *
   * Query params:
   *   entity    — filtrar por entidade (ex.: "DiaryEntry", "Project")
   *   entityId  — filtrar por ID da entidade específica
   *   limit     — máximo de registros (padrão 20, máx 100)
   *   offset    — paginação
   *   projectId — filtrar por obra (para DiaryEntry vinculado a um projeto)
   */
  app.get('/', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!

    const q = request.query as {
      entity?:    string
      entityId?:  string
      projectId?: string
      limit?:     string
      offset?:    string
    }

    const limit  = Math.min(parseInt(q.limit  ?? '20', 10), 100)
    const offset = parseInt(q.offset ?? '0', 10)

    // Se vier projectId, busca os entityIds (DiaryEntries) relacionados
    let entityIds: string[] | undefined
    if (q.projectId && !q.entityId) {
      const entries = await p.diaryEntry.findMany({
        where:  { projectId: q.projectId, project: { companyId } },
        select: { id: true },
      })
      const stageIds = await p.stage.findMany({
        where:  { projectId: q.projectId, project: { companyId } },
        select: { id: true },
      })
      entityIds = [
        q.projectId,
        ...entries.map((e: any) => e.id),
        ...stageIds.map((s: any) => s.id),
      ]
    }

    const where: any = { companyId }

    if (q.entity)   where.entity   = q.entity
    if (q.entityId) where.entityId = q.entityId

    if (entityIds) {
      where.entityId = { in: entityIds }
    }

    const [logs, total] = await Promise.all([
      p.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take:    limit,
        skip:    offset,
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      p.auditLog.count({ where }),
    ])

    const formatted = logs.map((log: any) => ({
      id:          log.id,
      action:      log.action,
      entity:      log.entity,
      entityId:    log.entityId,
      entityName:  log.entityName,
      description: log.description ?? buildDescription(log.action, log.entity, log.entityName),
      metadata:    log.metadata,
      before:      log.before,
      after:       log.after,
      createdAt:   log.createdAt,
      user: {
        id:        log.user.id,
        name:      log.user.name,
        avatarUrl: log.user.avatarUrl,
      },
    }))

    return reply.send({ logs: formatted, total, limit, offset })
  })
}
