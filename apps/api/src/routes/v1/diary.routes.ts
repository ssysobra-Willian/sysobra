import { FastifyInstance } from 'fastify'
import { prisma } from '@sysobra/database'
import {
  authenticate,
  requireCompany,
  requirePermission,
  RequestWithMember,
  JwtPayload,
} from '../../middlewares/auth.middleware'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Verifica se o projeto pertence à empresa do membro autenticado */
async function getProjectOfCompany(projectId: string, companyId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, companyId },
    select: { id: true, name: true },
  })
}

/** Retorna os IDs de projetos acessíveis para EXTERNAL/CLIENT via MemberProjectAccess */
async function getAccessibleProjectIds(memberId: string): Promise<string[]> {
  const accesses = await prisma.memberProjectAccess.findMany({
    where: { memberId },
    select: { projectId: true },
  })
  return accesses.map((a) => a.projectId)
}

// ─── Rotas ────────────────────────────────────────────────────────────────────

export async function diaryRoutes(app: FastifyInstance) {
  // Aplica autenticação + empresa em TODAS as rotas do módulo
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireCompany)

  // ── GET /api/v1/diary/entries ─────────────────────────────────────────────
  // Query: projectId?, page?, limit?
  app.get(
    '/entries',
    { preHandler: [requirePermission('diario_obra', 'view')] },
    async (request, reply) => {
      const req = request as RequestWithMember
      const {
        projectId,
        page  = '1',
        limit = '20',
      } = request.query as { projectId?: string; page?: string; limit?: string }

      const skip = (parseInt(page) - 1) * parseInt(limit)
      const take = parseInt(limit)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = { project: { companyId: req.companyId } }
      if (projectId) where.projectId = projectId

      // EXTERNAL/CLIENT: restringe às obras com acesso explícito
      if (req.memberRole === 'EXTERNAL' || req.memberRole === 'CLIENT') {
        const accessibleIds = await getAccessibleProjectIds(req.memberId)
        if (!accessibleIds.length) return reply.send({ entries: [], total: 0 })
        where.projectId = projectId
          ? accessibleIds.includes(projectId) ? projectId : undefined
          : { in: accessibleIds }
        if (where.projectId === undefined) {
          return reply.send({ entries: [], total: 0 })
        }
      }

      const [entries, total] = await Promise.all([
        prisma.diaryEntry.findMany({
          where,
          include: {
            author:     { select: { id: true, name: true, avatarUrl: true } },
            approvedBy: { select: { id: true, name: true } },
            project:    { select: { id: true, name: true } },
            _count:     { select: { comments: true } },
          },
          orderBy: { date: 'desc' },
          skip,
          take,
        }),
        prisma.diaryEntry.count({ where }),
      ])

      return reply.send({ entries, total, page: parseInt(page), limit: take })
    },
  )

  // ── POST /api/v1/diary/entries ────────────────────────────────────────────
  app.post(
    '/entries',
    { preHandler: [requirePermission('diario_obra', 'create')] },
    async (request, reply) => {
      const req     = request as RequestWithMember
      const payload = request.user as JwtPayload
      const body    = request.body as {
        projectId:    string
        date?:        string
        weather?:     string
        temperature?: number
        workers?:     number
        activities?:  string
        observations?:string
        imageUrls?:   string[]
      }

      if (!body.projectId) {
        return reply.status(400).send({ error: 'projectId é obrigatório' })
      }

      const project = await getProjectOfCompany(body.projectId, req.companyId)
      if (!project) {
        return reply.status(404).send({ error: 'Obra não encontrada nesta empresa' })
      }

      // EXTERNAL/CLIENT: verifica acesso explícito à obra
      if (req.memberRole === 'EXTERNAL' || req.memberRole === 'CLIENT') {
        const ids = await getAccessibleProjectIds(req.memberId)
        if (!ids.includes(body.projectId)) {
          return reply.status(403).send({ error: 'Sem acesso a esta obra' })
        }
      }

      const entry = await prisma.diaryEntry.create({
        data: {
          projectId:    body.projectId,
          authorId:     payload.sub,
          date:         body.date ? new Date(body.date) : new Date(),
          weather:      body.weather      ?? null,
          temperature:  body.temperature  ?? null,
          workers:      body.workers      ?? null,
          activities:   body.activities   ?? null,
          observations: body.observations ?? null,
          imageUrls:    body.imageUrls    ?? [],
          status:       'PENDING',
        },
        include: {
          author:  { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      })

      return reply.status(201).send({ entry })
    },
  )

  // ── GET /api/v1/diary/entries/:id ─────────────────────────────────────────
  app.get(
    '/entries/:id',
    { preHandler: [requirePermission('diario_obra', 'view')] },
    async (request, reply) => {
      const req            = request as RequestWithMember
      const { id }         = request.params as { id: string }
      const isInternal     = req.memberType === 'INTERNAL'

      const entry = await prisma.diaryEntry.findFirst({
        where: { id, project: { companyId: req.companyId } },
        include: {
          author:     { select: { id: true, name: true, avatarUrl: true } },
          approvedBy: { select: { id: true, name: true } },
          project:    { select: { id: true, name: true } },
          comments: {
            where: isInternal ? {} : { isInternal: false },
            orderBy: { createdAt: 'asc' },
          },
        },
      })

      if (!entry) return reply.status(404).send({ error: 'Registro não encontrado' })

      return reply.send({ entry })
    },
  )

  // ── PUT /api/v1/diary/entries/:id ─────────────────────────────────────────
  app.put(
    '/entries/:id',
    { preHandler: [requirePermission('diario_obra', 'edit')] },
    async (request, reply) => {
      const req     = request as RequestWithMember
      const payload = request.user as JwtPayload
      const { id }  = request.params as { id: string }
      const body    = request.body as Partial<{
        date:         string
        weather:      string
        temperature:  number
        workers:      number
        activities:   string
        observations: string
        imageUrls:    string[]
      }>

      const entry = await prisma.diaryEntry.findFirst({
        where: { id, project: { companyId: req.companyId } },
      })
      if (!entry) return reply.status(404).send({ error: 'Registro não encontrado' })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isAdminLike = (req.permissions as any).all === true || req.memberRole === 'MANAGER'
      const isOwnEntry  = entry.authorId === payload.sub

      if (!isAdminLike && !isOwnEntry) {
        return reply.status(403).send({ error: 'Você só pode editar seus próprios registros' })
      }
      if (!isAdminLike && entry.status === 'APPROVED') {
        return reply.status(409).send({ error: 'Não é possível editar um registro já aprovado' })
      }

      const updated = await prisma.diaryEntry.update({
        where: { id },
        data: {
          ...(body.date         && { date: new Date(body.date) }),
          ...(body.weather      !== undefined && { weather:      body.weather }),
          ...(body.temperature  !== undefined && { temperature:  body.temperature }),
          ...(body.workers      !== undefined && { workers:      body.workers }),
          ...(body.activities   !== undefined && { activities:   body.activities }),
          ...(body.observations !== undefined && { observations: body.observations }),
          ...(body.imageUrls    && { imageUrls: body.imageUrls }),
          // Volta para PENDING se editado após rejeição
          status: 'PENDING',
        },
        include: {
          author:  { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      })

      return reply.send({ entry: updated })
    },
  )

  // ── DELETE /api/v1/diary/entries/:id ──────────────────────────────────────
  app.delete(
    '/entries/:id',
    { preHandler: [requirePermission('diario_obra', 'delete')] },
    async (request, reply) => {
      const req     = request as RequestWithMember
      const payload = request.user as JwtPayload
      const { id }  = request.params as { id: string }

      const entry = await prisma.diaryEntry.findFirst({
        where: { id, project: { companyId: req.companyId } },
      })
      if (!entry) return reply.status(404).send({ error: 'Registro não encontrado' })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isAdminLike = (req.permissions as any).all === true
      const isOwnEntry  = entry.authorId === payload.sub

      if (!isAdminLike && !isOwnEntry) {
        return reply.status(403).send({ error: 'Sem permissão para excluir este registro' })
      }

      await prisma.diaryEntry.delete({ where: { id } })

      return reply.send({ success: true })
    },
  )

  // ── POST /api/v1/diary/entries/:id/approve ────────────────────────────────
  app.post(
    '/entries/:id/approve',
    { preHandler: [requirePermission('diario_obra', 'approve')] },
    async (request, reply) => {
      const req     = request as RequestWithMember
      const payload = request.user as JwtPayload
      const { id }  = request.params as { id: string }

      const entry = await prisma.diaryEntry.findFirst({
        where: { id, project: { companyId: req.companyId } },
      })
      if (!entry) return reply.status(404).send({ error: 'Registro não encontrado' })
      if (entry.status !== 'PENDING') {
        return reply.status(409).send({
          error: `Registro já está ${entry.status === 'APPROVED' ? 'aprovado' : 'rejeitado'}`,
        })
      }

      const updated = await prisma.diaryEntry.update({
        where: { id },
        data: {
          status:       'APPROVED',
          approvedById: payload.sub,
          approvedAt:   new Date(),
          rejectionNote:null,
        },
      })

      return reply.send({ entry: updated })
    },
  )

  // ── POST /api/v1/diary/entries/:id/reject ────────────────────────────────
  app.post(
    '/entries/:id/reject',
    { preHandler: [requirePermission('diario_obra', 'approve')] },
    async (request, reply) => {
      const req  = request as RequestWithMember
      const { id } = request.params as { id: string }
      const { rejectionNote } = request.body as { rejectionNote?: string }

      if (!rejectionNote?.trim()) {
        return reply.status(400).send({ error: 'rejectionNote é obrigatório ao rejeitar um registro' })
      }

      const entry = await prisma.diaryEntry.findFirst({
        where: { id, project: { companyId: req.companyId } },
      })
      if (!entry) return reply.status(404).send({ error: 'Registro não encontrado' })
      if (entry.status !== 'PENDING') {
        return reply.status(409).send({ error: 'Registro não está pendente' })
      }

      const updated = await prisma.diaryEntry.update({
        where: { id },
        data: { status: 'REJECTED', rejectionNote: rejectionNote.trim() },
      })

      return reply.send({ entry: updated })
    },
  )

  // ── POST /api/v1/diary/entries/:id/comments ───────────────────────────────
  app.post(
    '/entries/:id/comments',
    { preHandler: [requirePermission('diario_obra', 'comment')] },
    async (request, reply) => {
      const req     = request as RequestWithMember
      const payload = request.user as JwtPayload
      const { id }  = request.params as { id: string }
      const {
        content,
        isInternal = false,
      } = request.body as { content?: string; isInternal?: boolean }

      if (!content?.trim()) return reply.status(400).send({ error: 'content é obrigatório' })

      const entry = await prisma.diaryEntry.findFirst({
        where: { id, project: { companyId: req.companyId } },
      })
      if (!entry) return reply.status(404).send({ error: 'Registro não encontrado' })

      // EXTERNAL/CLIENT não podem marcar comentário como interno
      const authorType  = req.memberType as 'INTERNAL' | 'EXTERNAL' | 'CLIENT'
      const actualInternal = authorType === 'INTERNAL' ? isInternal : false

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { name: true },
      })

      const comment = await prisma.diaryComment.create({
        data: {
          diaryEntryId: id,
          authorId:     payload.sub,
          authorName:   user?.name ?? 'Usuário',
          authorType,
          content:      content.trim(),
          isInternal:   actualInternal,
        },
      })

      return reply.status(201).send({ comment })
    },
  )

  // ── DELETE /api/v1/diary/comments/:commentId ─────────────────────────────
  app.delete(
    '/comments/:commentId',
    { preHandler: [requirePermission('diario_obra', 'comment')] },
    async (request, reply) => {
      const req         = request as RequestWithMember
      const payload     = request.user as JwtPayload
      const { commentId } = request.params as { commentId: string }

      const comment = await prisma.diaryComment.findUnique({
        where: { id: commentId },
        include: { diaryEntry: { select: { project: { select: { companyId: true } } } } },
      })

      if (!comment) return reply.status(404).send({ error: 'Comentário não encontrado' })

      // Verifica pertence à empresa
      if (comment.diaryEntry.project.companyId !== req.companyId) {
        return reply.status(404).send({ error: 'Comentário não encontrado' })
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isAdmin = (req.permissions as any).all === true
      if (!isAdmin && comment.authorId !== payload.sub) {
        return reply.status(403).send({ error: 'Sem permissão para excluir este comentário' })
      }

      await prisma.diaryComment.delete({ where: { id: commentId } })

      return reply.send({ success: true })
    },
  )
}
