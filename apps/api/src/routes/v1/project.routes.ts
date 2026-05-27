import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@sysobra/database'
import {
  authenticate,
  requireCompany,
  requirePermission,
  RequestWithMember,
  JwtPayload,
} from '../../middlewares/auth.middleware'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const p = prisma as any

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0
  const n = Number(String(v))
  return isNaN(n) ? 0 : n
}

function serialiseStage(s: any) {
  return {
    ...s,
    budgetMaterial:  toNum(s.budgetMaterial),
    budgetLabor:     toNum(s.budgetLabor),
    budgetTotal:     toNum(s.budgetTotal),
    realizedValue:   toNum(s.realizedValue),
    progressPercent: toNum(s.progressPercent),
  }
}

function serialiseProject(proj: any) {
  const stages: any[] = (proj.stages ?? []).map(serialiseStage)

  const totalBudget   = stages.reduce((a, s) => a + s.budgetTotal, 0)
  const totalRealized = stages.reduce((a, s) => a + s.realizedValue, 0)
  const deviationAmount = totalRealized - totalBudget
  const deviation = totalBudget > 0 ? (deviationAmount / totalBudget) * 100 : 0
  const isOverBudget = deviation > 5
  const isDelayed = proj.expectedEndDate
    ? proj.status !== 'COMPLETED' && new Date(proj.expectedEndDate) < new Date()
    : false

  return {
    ...proj,
    globalBudget:    toNum(proj.globalBudget),
    budget:          toNum(proj.budget),
    contractValue:   toNum(proj.contractValue),
    progressPercent: toNum(proj.progressPercent),
    stages,
    // computed
    totalBudget,
    totalRealized,
    deviationAmount,
    deviation: Math.round(deviation * 100) / 100,
    isOverBudget,
    isDelayed,
  }
}

/** Gera código sequencial CC-AAAA-NNN */
async function nextProjectCode(companyId: string): Promise<string> {
  const year   = new Date().getFullYear()
  const prefix = `CC-${year}-`
  const last   = await p.project.findFirst({
    where:   { companyId, code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select:  { code: true },
  })
  const seq = last?.code
    ? parseInt(last.code.replace(prefix, ''), 10) + 1
    : 1
  return `${prefix}${String(seq).padStart(3, '0')}`
}

/** Recalcula progressPercent e alertas da obra a partir das etapas */
async function recalcProject(projectId: string, companyId: string) {
  const stages = await p.projectStage.findMany({
    where:  { projectId },
    select: { budgetTotal: true, realizedValue: true, progressPercent: true },
  })

  const totalBudget   = stages.reduce((a: number, s: any) => a + toNum(s.budgetTotal),  0)
  const totalRealized = stages.reduce((a: number, s: any) => a + toNum(s.realizedValue), 0)

  // Média ponderada do progresso físico
  const totalWeight = stages.reduce((a: number, s: any) => a + toNum(s.budgetTotal), 0)
  const weightedProgress = totalWeight > 0
    ? stages.reduce((a: number, s: any) => a + toNum(s.progressPercent) * toNum(s.budgetTotal), 0) / totalWeight
    : stages.length > 0
      ? stages.reduce((a: number, s: any) => a + toNum(s.progressPercent), 0) / stages.length
      : 0

  const deviation  = totalBudget > 0 ? ((totalRealized - totalBudget) / totalBudget) * 100 : 0
  const budgetAlert = deviation > 5

  const proj = await p.project.findUnique({ where: { id: projectId }, select: { expectedEndDate: true, status: true } })
  const delayAlert = proj?.expectedEndDate
    ? proj.status !== 'COMPLETED' && new Date(proj.expectedEndDate) < new Date()
    : false

  await p.project.update({
    where: { id: projectId },
    data: {
      progressPercent: Math.min(100, Math.round(weightedProgress * 100) / 100),
      budgetAlert,
      delayAlert,
    },
  })
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createProjectSchema = z.object({
  name:             z.string().min(1),
  description:      z.string().optional(),
  clientId:         z.string().optional().nullable(),
  responsibleId:    z.string().optional().nullable(),
  code:             z.string().optional().nullable(),
  address:          z.string().optional().nullable(),
  city:             z.string().optional().nullable(),
  state:            z.string().optional().nullable(),
  zipCode:          z.string().optional().nullable(),
  status:           z.enum(['PLANNING','ACTIVE','IN_PROGRESS','PAUSED','ON_HOLD','COMPLETED','CANCELLED']).optional(),
  globalBudget:     z.number().optional().nullable(),
  startDate:        z.string().optional().nullable(),
  expectedEndDate:  z.string().optional().nullable(),
  actualEndDate:    z.string().optional().nullable(),
  warrantyMonths:   z.number().int().optional(),
  cno:              z.string().optional().nullable(),
  artExecution:     z.string().optional().nullable(),
  artExecutionFile: z.string().optional().nullable(),
  artProjects:      z.string().optional().nullable(),
  artProjectsFile:  z.string().optional().nullable(),
  technicalName:    z.string().optional().nullable(),
  technicalTitle:   z.string().optional().nullable(),
  technicalCrea:    z.string().optional().nullable(),
  technicalPhoto:   z.string().optional().nullable(),
  coverImage:       z.string().optional().nullable(),
  stages: z.array(z.object({
    code:           z.string().optional().nullable(),
    name:           z.string().min(1),
    description:    z.string().optional().nullable(),
    order:          z.number().int().optional(),
    budgetMaterial: z.number().optional(),
    budgetLabor:    z.number().optional(),
    startDate:      z.string().optional().nullable(),
    endDate:        z.string().optional().nullable(),
  })).optional(),
})

const updateProjectSchema = createProjectSchema.partial()

const createStageSchema = z.object({
  code:           z.string().optional().nullable(),
  name:           z.string().min(1),
  description:    z.string().optional().nullable(),
  order:          z.number().int().optional(),
  budgetMaterial: z.number().optional(),
  budgetLabor:    z.number().optional(),
  startDate:      z.string().optional().nullable(),
  endDate:        z.string().optional().nullable(),
  status:         z.enum(['PENDING','IN_PROGRESS','COMPLETED','CANCELLED']).optional(),
})

const updateProgressSchema = z.object({
  progressPercent: z.number().min(0).max(100),
  realizedValue:   z.number().optional(),
  status:          z.enum(['PENDING','IN_PROGRESS','COMPLETED','CANCELLED']).optional(),
})

// ─── Rotas ───────────────────────────────────────────────────────────────────

export async function projectRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // ── GET / — listar obras ─────────────────────────────────────────────────
  app.get('/', { preHandler: [requireCompany] }, async (request, reply) => {
    const req   = request as RequestWithMember
    const companyId = req.companyId!

    const q = request.query as {
      status?: string
      responsibleId?: string
      clientId?: string
      search?: string
      page?: string
      limit?: string
    }

    const page  = Math.max(1, parseInt(q.page  ?? '1',  10))
    const limit = Math.min(50, parseInt(q.limit ?? '20', 10))
    const skip  = (page - 1) * limit

    const where: any = { companyId, isActive: true }
    if (q.status && q.status !== 'ALL')    where.status        = q.status
    if (q.responsibleId)                    where.responsibleId = q.responsibleId
    if (q.clientId)                         where.clientId      = q.clientId
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { code: { contains: q.search, mode: 'insensitive' } },
      ]
    }

    const [projects, total] = await Promise.all([
      p.project.findMany({
        where,
        include: {
          client:      { select: { id: true, name: true } },
          responsible: { select: { id: true, name: true, avatarUrl: true } },
          stages:      true,
          _count: { select: { financialTransactions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      p.project.count({ where }),
    ])

    const serialised = projects.map(serialiseProject)

    // Contadores para os cards de métricas
    const allActive = await p.project.findMany({
      where: { companyId, isActive: true, status: { in: ['ACTIVE', 'IN_PROGRESS', 'PLANNING', 'PAUSED'] } },
      select: { budgetAlert: true, delayAlert: true },
    })
    const totalActive   = (await p.project.count({ where: { companyId, isActive: true, status: { not: 'CANCELLED' } } }))
    const totalAlert    = allActive.filter((p: any) => p.budgetAlert || p.delayAlert).length
    const totalOverBudget    = allActive.filter((p: any) => p.budgetAlert).length
    const totalWithinBudget  = allActive.filter((p: any) => !p.budgetAlert).length

    return reply.send({
      projects: serialised,
      total,
      page,
      limit,
      meta: { totalActive, totalAlert, totalOverBudget, totalWithinBudget },
    })
  })

  // ── POST / — criar obra ──────────────────────────────────────────────────
  app.post('/', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const payload   = request.user as JwtPayload
    const userId    = payload.sub

    const body = createProjectSchema.parse(request.body)

    const code = body.code || (await nextProjectCode(companyId))

    const stages = body.stages ?? []
    const stagesToCreate = stages.map((s, i) => {
      const mat   = s.budgetMaterial ?? 0
      const labor = s.budgetLabor ?? 0
      return {
        code:           s.code ?? null,
        name:           s.name,
        description:    s.description ?? null,
        order:          s.order ?? i,
        budgetMaterial: mat,
        budgetLabor:    labor,
        budgetTotal:    mat + labor,
        startDate:      s.startDate ? new Date(s.startDate) : null,
        endDate:        s.endDate ? new Date(s.endDate) : null,
      }
    })

    const project = await p.project.create({
      data: {
        companyId,
        code,
        name:            body.name,
        description:     body.description,
        clientId:        body.clientId    ?? null,
        responsibleId:   body.responsibleId ?? null,
        address:         body.address     ?? null,
        city:            body.city        ?? null,
        state:           body.state       ?? null,
        zipCode:         body.zipCode     ?? null,
        status:          body.status      ?? 'ACTIVE',
        globalBudget:    body.globalBudget ?? null,
        startDate:       body.startDate       ? new Date(body.startDate)       : null,
        expectedEndDate: body.expectedEndDate ? new Date(body.expectedEndDate) : null,
        actualEndDate:   body.actualEndDate   ? new Date(body.actualEndDate)   : null,
        warrantyMonths:  body.warrantyMonths  ?? 60,
        cno:             body.cno             ?? null,
        artExecution:    body.artExecution    ?? null,
        artExecutionFile:body.artExecutionFile ?? null,
        artProjects:     body.artProjects     ?? null,
        artProjectsFile: body.artProjectsFile ?? null,
        technicalName:   body.technicalName   ?? null,
        technicalTitle:  body.technicalTitle  ?? null,
        technicalCrea:   body.technicalCrea   ?? null,
        technicalPhoto:  body.technicalPhoto  ?? null,
        coverImage:      body.coverImage      ?? null,
        stages: { create: stagesToCreate },
      },
      include: {
        client:      { select: { id: true, name: true } },
        responsible: { select: { id: true, name: true, avatarUrl: true } },
        stages:      true,
      },
    })

    // Auditoria
    await prisma.auditLog.create({
      data: {
        companyId,
        userId,
        action:   'CREATE',
        entity:   'Project',
        entityId: project.id,
        after:    { name: project.name, code: project.code },
      },
    })

    return reply.status(201).send({ project: serialiseProject(project) })
  })

  // ── GET /:id — detalhe ───────────────────────────────────────────────────
  app.get('/:id', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id }    = request.params as { id: string }

    const project = await p.project.findFirst({
      where: { id, companyId, isActive: true },
      include: {
        client:      { select: { id: true, name: true, email: true, phone: true } },
        responsible: { select: { id: true, name: true, avatarUrl: true } },
        stages:      { orderBy: { order: 'asc' } },
        financialTransactions: {
          where:   { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            category:    { select: { id: true, name: true, color: true } },
            bankAccount: { select: { id: true, name: true } },
            createdBy:   { select: { id: true, name: true, avatarUrl: true } },
          },
        },
        purchaseMaps: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        // Últimos 3 RDOs para exibir no card do Centro de Custo
        diaryEntries: {
          orderBy: { date: 'desc' },
          take: 3,
          select: {
            id:           true,
            reportNumber: true,
            date:         true,
            status:       true,
            author: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: { financialTransactions: true, purchaseMaps: true, documents: true, diaryEntries: true },
        },
      },
    })

    if (!project) return reply.status(404).send({ error: 'Obra não encontrada' })

    const serialised = serialiseProject(project)

    // Serializar transações financeiras
    serialised.financialTransactions = (project.financialTransactions ?? []).map((tx: any) => ({
      ...tx,
      grossAmount:    Number(tx.grossAmount),
      interestAmount: Number(tx.interestAmount),
      retentionAmount:Number(tx.retentionAmount),
      netAmount:      Number(tx.netAmount),
    }))

    // Serializar diary entries (datas como ISO string)
    serialised.diaryEntries = (project.diaryEntries ?? []).map((e: any) => ({
      ...e,
      date: e.date instanceof Date ? e.date.toISOString() : e.date,
    }))

    // ── Enriquecer etapas com realizado calculado via CostCenterAllocation ──
    try {
      // Buscar todas as alocações da obra com dados da transação
      const allocations = await p.costCenterAllocation.findMany({
        where: { projectId: id },
        include: {
          transaction: {
            select: {
              id: true, description: true, type: true, isPaid: true,
              netAmount: true, dueDate: true, paidAt: true, referenceDate: true, createdAt: true,
              category: { select: { name: true, color: true, icon: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      // Mapas por stageId
      const stageRealizedMap:   Record<string, number>   = {}
      const stageTxMap:         Record<string, any[]>    = {}

      for (const alloc of allocations) {
        if (!alloc.stageId) continue
        const tx = alloc.transaction
        if (!tx) continue

        // Realizado = apenas despesas pagas
        if (tx.type === 'EXPENSE' && tx.isPaid) {
          stageRealizedMap[alloc.stageId] = (stageRealizedMap[alloc.stageId] ?? 0) + Number(alloc.amount)
        }

        // Últimas 5 transações por etapa (qualquer tipo)
        if (!stageTxMap[alloc.stageId]) stageTxMap[alloc.stageId] = []
        if (stageTxMap[alloc.stageId].length < 5) {
          stageTxMap[alloc.stageId].push({
            id:            tx.id,
            description:   tx.description,
            type:          tx.type,
            isPaid:        tx.isPaid,
            netAmount:     Number(tx.netAmount),
            dueDate:       tx.dueDate,
            paidAt:        tx.paidAt,
            referenceDate: tx.referenceDate,
            createdAt:     tx.createdAt,
            category:      tx.category,
          })
        }
      }

      // Enriquecer cada etapa com os dados calculados
      serialised.stages = serialised.stages.map((stage: any) => {
        const realizedFromAllocations = stageRealizedMap[stage.id] ?? stage.realizedValue ?? 0
        const balance                 = stage.budgetTotal - realizedFromAllocations
        const deviationPercent        = stage.budgetTotal > 0
          ? ((realizedFromAllocations - stage.budgetTotal) / stage.budgetTotal) * 100
          : 0
        return {
          ...stage,
          realizedFromAllocations,
          balance:           Math.round(balance * 100) / 100,
          deviationPercent:  Math.round(deviationPercent * 100) / 100,
          isOverBudget:      deviationPercent > 5,
          recentTransactions: stageTxMap[stage.id] ?? [],
        }
      })
    } catch { /* silencioso: enriquecimento não bloqueia resposta */ }

    return reply.send({ project: serialised })
  })

  // ── PUT /:id — editar obra ───────────────────────────────────────────────
  app.put('/:id', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const payload   = request.user as JwtPayload
    const userId    = payload.sub
    const { id }    = request.params as { id: string }

    const existing = await p.project.findFirst({ where: { id, companyId, isActive: true } })
    if (!existing) return reply.status(404).send({ error: 'Obra não encontrada' })

    const body = updateProjectSchema.parse(request.body)

    const data: any = {}
    if (body.name            !== undefined) data.name            = body.name
    if (body.description     !== undefined) data.description     = body.description
    if (body.clientId        !== undefined) data.clientId        = body.clientId
    if (body.responsibleId   !== undefined) data.responsibleId   = body.responsibleId
    if (body.code            !== undefined) data.code            = body.code
    if (body.address         !== undefined) data.address         = body.address
    if (body.city            !== undefined) data.city            = body.city
    if (body.state           !== undefined) data.state           = body.state
    if (body.zipCode         !== undefined) data.zipCode         = body.zipCode
    if (body.status          !== undefined) data.status          = body.status
    if (body.globalBudget    !== undefined) data.globalBudget    = body.globalBudget
    if (body.startDate       !== undefined) data.startDate       = body.startDate       ? new Date(body.startDate)       : null
    if (body.expectedEndDate !== undefined) data.expectedEndDate = body.expectedEndDate ? new Date(body.expectedEndDate) : null
    if (body.actualEndDate   !== undefined) data.actualEndDate   = body.actualEndDate   ? new Date(body.actualEndDate)   : null
    if (body.warrantyMonths  !== undefined) data.warrantyMonths  = body.warrantyMonths
    if (body.cno             !== undefined) data.cno             = body.cno
    if (body.artExecution    !== undefined) data.artExecution    = body.artExecution
    if (body.artExecutionFile!== undefined) data.artExecutionFile= body.artExecutionFile
    if (body.artProjects     !== undefined) data.artProjects     = body.artProjects
    if (body.artProjectsFile !== undefined) data.artProjectsFile = body.artProjectsFile
    if (body.technicalName   !== undefined) data.technicalName   = body.technicalName
    if (body.technicalTitle  !== undefined) data.technicalTitle  = body.technicalTitle
    if (body.technicalCrea   !== undefined) data.technicalCrea   = body.technicalCrea
    if (body.technicalPhoto  !== undefined) data.technicalPhoto  = body.technicalPhoto
    if (body.coverImage      !== undefined) data.coverImage      = body.coverImage

    const project = await p.project.update({
      where: { id },
      data,
      include: {
        client:      { select: { id: true, name: true } },
        responsible: { select: { id: true, name: true, avatarUrl: true } },
        stages:      { orderBy: { order: 'asc' } },
      },
    })

    await recalcProject(id, companyId)

    await prisma.auditLog.create({
      data: {
        companyId,
        userId,
        action:   'UPDATE',
        entity:   'Project',
        entityId: id,
        before:   { name: existing.name },
        after:    { name: project.name },
      },
    })

    const updated = await p.project.findUnique({
      where: { id },
      include: {
        client:      { select: { id: true, name: true } },
        responsible: { select: { id: true, name: true, avatarUrl: true } },
        stages:      { orderBy: { order: 'asc' } },
      },
    })

    return reply.send({ project: serialiseProject(updated) })
  })

  // ── DELETE /:id — inativar obra ──────────────────────────────────────────
  app.delete('/:id', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const payload   = request.user as JwtPayload
    const userId    = payload.sub
    const { id }    = request.params as { id: string }
    const q         = request.query as { force?: string }

    const project = await p.project.findFirst({ where: { id, companyId, isActive: true } })
    if (!project) return reply.status(404).send({ error: 'Obra não encontrada' })

    const txCount = await p.financialTransaction.count({
      where: { projectId: id, isActive: true },
    })

    if (txCount > 0 && q.force !== 'true') {
      return reply.status(409).send({
        error:   'Obra possui lançamentos financeiros vinculados',
        count:   txCount,
        confirm: 'Envie force=true para confirmar a inativação',
      })
    }

    await p.project.update({
      where: { id },
      data:  { isActive: false },
    })

    await prisma.auditLog.create({
      data: {
        companyId,
        userId,
        action:   'DELETE',
        entity:   'Project',
        entityId: id,
        before:   { name: project.name },
      },
    })

    return reply.send({ success: true })
  })

  // ── POST /:id/stages — criar etapa ───────────────────────────────────────
  app.post('/:id/stages', {
    preHandler: [requirePermission('projetos', 'edit')],
  }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const payload   = request.user as JwtPayload
    const { id }    = request.params as { id: string }

    const project = await p.project.findFirst({ where: { id, companyId, isActive: true } })
    if (!project) return reply.status(404).send({ error: 'Obra não encontrada' })

    const body = createStageSchema.parse(request.body)

    // Verificar unicidade do nome na obra
    const existing = await p.projectStage.findFirst({
      where: { projectId: id, name: body.name },
    })
    if (existing) return reply.status(400).send({ error: `Já existe uma etapa com o nome "${body.name}" nesta obra.` })

    // Próxima ordem
    const lastStage = await p.projectStage.findFirst({
      where:   { projectId: id },
      orderBy: { order: 'desc' },
      select:  { order: true },
    })
    const order = body.order ?? ((lastStage?.order ?? -1) + 1)

    const mat   = body.budgetMaterial ?? 0
    const labor = body.budgetLabor    ?? 0

    const stage = await p.projectStage.create({
      data: {
        projectId:      id,
        code:           body.code        ?? null,
        name:           body.name,
        description:    body.description ?? null,
        order,
        status:         body.status      ?? 'PENDING',
        budgetMaterial: mat,
        budgetLabor:    labor,
        budgetTotal:    mat + labor,
        startDate:      body.startDate ? new Date(body.startDate) : null,
        endDate:        body.endDate   ? new Date(body.endDate)   : null,
      },
    })

    await recalcProject(id, companyId)

    await prisma.auditLog.create({
      data: {
        companyId,
        userId:   payload.sub,
        action:   'CREATE',
        entity:   'ProjectStage',
        entityId: stage.id,
        after:    { projectId: id, name: body.name, budgetTotal: mat + labor },
      },
    })

    return reply.status(201).send({ stage: serialiseStage(stage), message: 'Etapa criada com sucesso' })
  })

  // ── PUT /:id/stages/:stageId — editar etapa ──────────────────────────────
  app.put('/:id/stages/:stageId', {
    preHandler: [requirePermission('projetos', 'edit')],
  }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const payload   = request.user as JwtPayload
    const { id, stageId } = request.params as { id: string; stageId: string }

    const project = await p.project.findFirst({ where: { id, companyId, isActive: true } })
    if (!project) return reply.status(404).send({ error: 'Obra não encontrada' })

    const stage = await p.projectStage.findFirst({ where: { id: stageId, projectId: id } })
    if (!stage) return reply.status(404).send({ error: 'Etapa não encontrada' })

    const body = createStageSchema.partial().parse(request.body)

    // Unicidade do nome (exceto ela mesma)
    if (body.name && body.name !== stage.name) {
      const duplicate = await p.projectStage.findFirst({
        where: { projectId: id, name: body.name, id: { not: stageId } },
      })
      if (duplicate) return reply.status(400).send({ error: `Já existe uma etapa com o nome "${body.name}" nesta obra.` })
    }

    const mat   = body.budgetMaterial !== undefined ? body.budgetMaterial : toNum(stage.budgetMaterial)
    const labor = body.budgetLabor    !== undefined ? body.budgetLabor    : toNum(stage.budgetLabor)

    const data: any = {}
    if (body.code           !== undefined) data.code           = body.code
    if (body.name           !== undefined) data.name           = body.name
    if (body.description    !== undefined) data.description    = body.description
    if (body.order          !== undefined) data.order          = body.order
    if (body.status         !== undefined) data.status         = body.status
    if (body.budgetMaterial !== undefined || body.budgetLabor !== undefined) {
      data.budgetMaterial = mat
      data.budgetLabor    = labor
      data.budgetTotal    = mat + labor
    }
    if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null
    if (body.endDate   !== undefined) data.endDate   = body.endDate   ? new Date(body.endDate)   : null

    const updated = await p.projectStage.update({ where: { id: stageId }, data })
    await recalcProject(id, companyId)

    await prisma.auditLog.create({
      data: {
        companyId,
        userId:   payload.sub,
        action:   'UPDATE',
        entity:   'ProjectStage',
        entityId: stageId,
        after:    { changes: body, projectId: id },
      },
    })

    return reply.send({ stage: serialiseStage(updated) })
  })

  // ── DELETE /:id/stages/:stageId — remover etapa ───────────────────────────
  app.delete('/:id/stages/:stageId', {
    preHandler: [requirePermission('projetos', 'edit')],
  }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const payload   = request.user as JwtPayload
    const { id, stageId } = request.params as { id: string; stageId: string }

    const project = await p.project.findFirst({ where: { id, companyId, isActive: true } })
    if (!project) return reply.status(404).send({ error: 'Obra não encontrada' })

    const stage = await p.projectStage.findFirst({ where: { id: stageId, projectId: id } })
    if (!stage) return reply.status(404).send({ error: 'Etapa não encontrada' })

    // Verificar lançamentos financeiros vinculados
    const txCount = await p.financialTransaction.count({ where: { stageId, isActive: true } })
    if (txCount > 0) {
      return reply.status(400).send({
        error: 'Esta etapa possui lançamentos financeiros vinculados e não pode ser removida. Transfira os lançamentos para outra etapa antes de remover.',
      })
    }

    // Verificar registros no Diário de Obra vinculados
    const diaryCount = await p.diaryStageEntry.count({ where: { stageId } })
    if (diaryCount > 0) {
      return reply.status(400).send({
        error: 'Esta etapa possui registros no Diário de Obra vinculados e não pode ser removida.',
      })
    }

    await p.projectStage.delete({ where: { id: stageId } })
    await recalcProject(id, companyId)

    await prisma.auditLog.create({
      data: {
        companyId,
        userId:   payload.sub,
        action:   'DELETE',
        entity:   'ProjectStage',
        entityId: stageId,
        before:   { name: stage.name, projectId: id },
      },
    })

    return reply.send({ success: true })
  })

  // ── PATCH /:id/stages/:stageId/progress — atualizar progresso ───────────
  app.patch('/:id/stages/:stageId/progress', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const payload   = request.user as JwtPayload
    const userId    = payload.sub
    const { id, stageId } = request.params as { id: string; stageId: string }

    const project = await p.project.findFirst({ where: { id, companyId, isActive: true } })
    if (!project) return reply.status(404).send({ error: 'Obra não encontrada' })

    const stage = await p.projectStage.findFirst({ where: { id: stageId, projectId: id } })
    if (!stage) return reply.status(404).send({ error: 'Etapa não encontrada' })

    const body = updateProgressSchema.parse(request.body)

    const data: any = { progressPercent: body.progressPercent }
    if (body.realizedValue !== undefined) data.realizedValue = body.realizedValue
    if (body.status        !== undefined) data.status        = body.status

    const updated = await p.projectStage.update({ where: { id: stageId }, data })
    await recalcProject(id, companyId)

    await prisma.auditLog.create({
      data: {
        companyId,
        userId,
        action:   'PROGRESS_UPDATE',
        entity:   'ProjectStage',
        entityId: stageId,
        after:    { progressPercent: body.progressPercent, stageId, projectId: id },
      },
    })

    const projUpdated = await p.project.findUnique({
      where: { id },
      select: { progressPercent: true, budgetAlert: true, delayAlert: true },
    })

    return reply.send({
      stage:   serialiseStage(updated),
      project: {
        progressPercent: toNum(projUpdated?.progressPercent),
        budgetAlert:     projUpdated?.budgetAlert,
        delayAlert:      projUpdated?.delayAlert,
      },
    })
  })

  // ── GET /:id/financial — resumo financeiro ───────────────────────────────
  app.get('/:id/financial', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id }    = request.params as { id: string }

    const project = await p.project.findFirst({ where: { id, companyId, isActive: true } })
    if (!project) return reply.status(404).send({ error: 'Obra não encontrada' })

    const transactions = await p.financialTransaction.findMany({
      where: { projectId: id, isActive: true },
      include: {
        category:    { select: { id: true, name: true, color: true } },
        bankAccount: { select: { id: true, name: true } },
      },
      orderBy: { referenceDate: 'asc' },
    })

    const serialisedTxs = transactions.map((tx: any) => ({
      ...tx,
      grossAmount:    Number(tx.grossAmount),
      interestAmount: Number(tx.interestAmount),
      retentionAmount:Number(tx.retentionAmount),
      netAmount:      Number(tx.netAmount),
    }))

    // Totais
    const totalBudgeted = serialisedTxs
      .filter((t: any) => t.type === 'EXPENSE')
      .reduce((a: number, t: any) => a + t.netAmount, 0)
    const totalRealized = serialisedTxs
      .filter((t: any) => t.type === 'EXPENSE' && t.isPaid)
      .reduce((a: number, t: any) => a + t.netAmount, 0)
    const totalIncome = serialisedTxs
      .filter((t: any) => t.type === 'INCOME' && t.isPaid)
      .reduce((a: number, t: any) => a + t.netAmount, 0)
    const balance    = totalIncome - totalRealized
    const deviation  = totalBudgeted > 0 ? ((totalRealized - totalBudgeted) / totalBudgeted) * 100 : 0

    // Gastos por categoria
    const byCategory: Record<string, { name: string; color: string | null; value: number }> = {}
    for (const tx of serialisedTxs) {
      if (tx.type !== 'EXPENSE') continue
      const key  = tx.category?.id  ?? '__no_cat'
      const name = tx.category?.name ?? 'Sem categoria'
      const color= tx.category?.color ?? null
      if (!byCategory[key]) byCategory[key] = { name, color, value: 0 }
      byCategory[key].value += tx.netAmount
    }

    // Evolução mensal (acumulado)
    const monthlyMap: Record<string, { month: string; previsto: number; realizado: number }> = {}
    for (const tx of serialisedTxs) {
      const d = new Date(tx.referenceDate)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!monthlyMap[key]) monthlyMap[key] = { month: key, previsto: 0, realizado: 0 }
      if (tx.type === 'EXPENSE') {
        monthlyMap[key].previsto += tx.netAmount
        if (tx.isPaid) monthlyMap[key].realizado += tx.netAmount
      }
    }
    const monthly = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month))
    // Acumular
    let accPrev = 0; let accReal = 0
    const monthlyAccum = monthly.map(m => {
      accPrev += m.previsto; accReal += m.realizado
      return { ...m, previsto: accPrev, realizado: accReal }
    })

    // Gastos por etapa
    const stages = await p.projectStage.findMany({
      where: { projectId: id },
      select: { id: true, name: true, budgetTotal: true, realizedValue: true },
    })

    return reply.send({
      summary: {
        totalBudgeted,
        totalRealized,
        totalIncome,
        balance,
        deviation: Math.round(deviation * 100) / 100,
        transactionCount: serialisedTxs.length,
      },
      byCategory: Object.values(byCategory),
      monthly:    monthlyAccum,
      stages:     stages.map((s: any) => ({
        id:           s.id,
        name:         s.name,
        budgetTotal:  toNum(s.budgetTotal),
        realizedValue:toNum(s.realizedValue),
      })),
      lastTransactions: serialisedTxs.slice(-10).reverse(),
    })
  })

  // ── GET /:id/plate — dados da placa de obra ──────────────────────────────
  app.get('/:id/plate', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id }    = request.params as { id: string }

    const [project, company] = await Promise.all([
      p.project.findFirst({
        where: { id, companyId, isActive: true },
        include: { client: { select: { id: true, name: true } } },
      }),
      prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true, logo: true, cnpj: true, phone: true, email: true, address: true, city: true, state: true },
      }),
    ])

    if (!project) return reply.status(404).send({ error: 'Obra não encontrada' })

    return reply.send({
      plate: {
        projectId:     project.id,
        projectName:   project.name,
        projectCode:   project.code,
        address:       project.address,
        city:          project.city,
        state:         project.state,
        clientName:    project.client?.name ?? null,
        cno:           project.cno,
        artExecution:  project.artExecution,
        artProjects:   project.artProjects,
        technicalName: project.technicalName,
        technicalTitle:project.technicalTitle,
        technicalCrea: project.technicalCrea,
        technicalPhoto:project.technicalPhoto,
        startDate:     project.startDate,
        expectedEndDate:project.expectedEndDate,
        company: {
          name:    company?.name,
          logo:    company?.logo,
          cnpj:    company?.cnpj,
          phone:   company?.phone,
          email:   company?.email,
          address: company?.address,
          city:    company?.city,
          state:   company?.state,
        },
      },
    })
  })
}
