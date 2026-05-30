import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import puppeteer from 'puppeteer'
import { prisma } from '@sysobra/database'
import path from 'path'
import fs from 'fs'
import {
  authenticate,
  requireCompany,
  requirePermission,
  RequestWithMember,
  JwtPayload,
} from '../../middlewares/auth.middleware'
import { createAuditLog, diffObjects } from '../../utils/audit'
import { notifyManagers, createNotification } from '../../utils/notifications'
import {
  gerarHtmlPlaca,
  getSyslobraLogoBase64,
  getCentralImageBase64,
} from '../../utils/placaTemplate'

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
    // normalize responsible: Employee has `photo`, frontend expects `avatarUrl`
    responsible: proj.responsible
      ? { ...proj.responsible, avatarUrl: proj.responsible.photo ?? proj.responsible.avatarUrl ?? null }
      : null,
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
    select: { id: true, budgetTotal: true, progressPercent: true },
  })

  // Calcular realizedValue real de cada etapa (allocs + entries)
  const [allocsByStage, entriesByStage] = await Promise.all([
    p.costCenterAllocation.groupBy({
      by:    ['stageId'],
      where: { companyId, projectId, stageId: { not: null }, transaction: { isActive: true, type: 'EXPENSE' } },
      _sum:  { amount: true },
    }),
    p.projectCostEntry.groupBy({
      by:    ['stageId'],
      where: { companyId, projectId, stageId: { not: null }, isCancelled: false },
      _sum:  { totalCost: true },
    }),
  ])
  const allocMap: Record<string, number> = {}
  for (const r of allocsByStage) { if (r.stageId) allocMap[r.stageId] = toNum(r._sum.amount ?? 0) }
  const entryMap: Record<string, number> = {}
  for (const r of entriesByStage) { if (r.stageId) entryMap[r.stageId] = toNum(r._sum.totalCost ?? 0) }

  const totalBudget   = stages.reduce((a: number, s: any) => a + toNum(s.budgetTotal), 0)
  const totalRealized = stages.reduce((a: number, s: any) =>
    a + (allocMap[s.id] ?? 0) + (entryMap[s.id] ?? 0), 0)

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
  // Dados técnicos adicionais
  totalArea:        z.number().optional().nullable(),
  floors:           z.number().int().optional().nullable(),
  buildingPermit:   z.string().optional().nullable(),
  slogan:           z.string().max(80).optional().nullable(),
  diaryMaxPhotos:   z.number().int().min(1).max(20).optional(),
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
          responsible: { select: { id: true, name: true, photo: true } },
          stages:      true,
          _count: { select: { financialTransactions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      p.project.count({ where }),
    ])

    // Custos pendentes de apropriação por projeto
    const pendingCostRows = await p.projectCostEntry.groupBy({
      by: ['projectId'],
      where: { companyId, needsAppropriation: true },
      _count: { id: true },
    })
    const pendingMap = new Map<string, number>(
      pendingCostRows.map((r: any) => [r.projectId, r._count.id])
    )
    const totalPendingCosts = pendingCostRows.reduce((a: number, r: any) => a + r._count.id, 0)

    const serialised = projects.map((proj: any) => ({
      ...serialiseProject(proj),
      pendingCosts: pendingMap.get(proj.id) ?? 0,
    }))

    // Contadores para os cards de métricas
    const allActive = await p.project.findMany({
      where: { companyId, isActive: true, status: { in: ['ACTIVE', 'IN_PROGRESS', 'PLANNING', 'PAUSED'] } },
      select: { budgetAlert: true, delayAlert: true },
    })
    const totalActive   = (await p.project.count({ where: { companyId, isActive: true, status: { not: 'CANCELLED' } } }))
    const totalAlert    = allActive.filter((p: any) => p.budgetAlert || p.delayAlert).length
    const totalOverBudget    = allActive.filter((p: any) => p.budgetAlert).length
    const totalWithinBudget  = allActive.filter((p: any) => !p.budgetAlert).length

    // Contagem de solicitações de encerramento pendentes
    const closeRequestsCount = await p.projectCloseRequest.count({
      where: { companyId, status: 'PENDING', isActive: true },
    })

    return reply.send({
      projects: serialised,
      total,
      page,
      limit,
      meta: { totalActive, totalAlert, totalOverBudget, totalWithinBudget, totalPendingCosts },
      closeRequestsCount,
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
        totalArea:       body.totalArea       ?? null,
        floors:          body.floors          ?? null,
        buildingPermit:  body.buildingPermit  ?? null,
        slogan:          body.slogan          ?? null,
        diaryMaxPhotos:  body.diaryMaxPhotos  ?? 10,
        stages: { create: stagesToCreate },
      },
      include: {
        client:      { select: { id: true, name: true } },
        responsible: { select: { id: true, name: true, photo: true } },
        stages:      true,
      },
    })

    // Auditoria
    await createAuditLog({
      prisma, companyId, userId, request,
      action:      'CREATE',
      module:      'PROJECT',
      entity:      'Project',
      entityId:    project.id,
      entityName:  project.name,
      description: `Obra "${project.name}" (${project.code}) criada`,
      metadata:    { code: project.code, status: project.status, globalBudget: body.globalBudget },
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
        responsible: { select: { id: true, name: true, photo: true } },
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

        // Comprometido = todas as despesas ativas (pagas + pendentes)
        if (tx.type === 'EXPENSE') {
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

      // Lançamentos diretos com stageId (sem CostCenterAllocation) — comprometido
      const directTxs = await p.financialTransaction.findMany({
        where: {
          companyId, projectId: id, isActive: true,
          type: 'EXPENSE', stageId: { not: null },
          costCenterAllocations: { none: {} },
        },
        select: {
          id: true, stageId: true, netAmount: true, isPaid: true,
          description: true, referenceDate: true, createdAt: true,
          category: { select: { name: true, color: true, icon: true } },
        },
      })
      for (const tx of directTxs) {
        if (!tx.stageId) continue
        stageRealizedMap[tx.stageId] = (stageRealizedMap[tx.stageId] ?? 0) + Number(tx.netAmount)
      }

      // Mapa stageId → total de ProjectCostEntry (material, EPI, equipamento) apropiados
      // E lista individual de entradas por etapa (para exibir na linha expandida)
      const [costEntriesByStage, costEntriesPerStage] = await Promise.all([
        p.projectCostEntry.groupBy({
          by:    ['stageId'],
          where: { companyId, projectId: id, stageId: { not: null }, isCancelled: false },
          _sum:  { totalCost: true },
        }),
        p.projectCostEntry.findMany({
          where: { companyId, projectId: id, stageId: { not: null }, isCancelled: false, category: { not: 'LABOR' } },
          select: { id: true, description: true, category: true, quantity: true, unitCost: true, totalCost: true, stageId: true },
          orderBy: { date: 'desc' },
        }),
      ])
      const entriesMap: Record<string, number> = {}
      for (const row of costEntriesByStage) {
        if (row.stageId) entriesMap[row.stageId] = Math.round(Number(row._sum.totalCost ?? 0) * 100) / 100
      }
      const stageEntriesMap: Record<string, any[]> = {}
      for (const entry of costEntriesPerStage) {
        if (!entry.stageId) continue
        if (!stageEntriesMap[entry.stageId]) stageEntriesMap[entry.stageId] = []
        stageEntriesMap[entry.stageId].push({
          ...entry,
          quantity:  Number(entry.quantity),
          unitCost:  Number(entry.unitCost),
          totalCost: Number(entry.totalCost),
        })
      }

      // Lançamentos financeiros por etapa (alocações + diretos) para exibição na linha expandida
      const stageFinancialMap: Record<string, any[]> = {}

      // Via CostCenterAllocation com stageId preenchido
      for (const alloc of allocations) {
        if (!alloc.stageId) continue
        const tx = alloc.transaction
        if (!tx) continue
        if (!stageFinancialMap[alloc.stageId]) stageFinancialMap[alloc.stageId] = []
        stageFinancialMap[alloc.stageId].push({
          id:          alloc.id,
          description: tx.description,
          type:        tx.type,
          isPaid:      tx.isPaid,
          date:        tx.referenceDate ?? tx.createdAt,
          amount:      Math.abs(Number(alloc.amount)),
          category:    tx.category ? tx.category.name : null,
          origin:      'FINANCIAL',
        })
      }
      // Via lançamentos diretos com stageId (já estão em directTxs com netAmount)
      for (const tx of directTxs) {
        if (!tx.stageId) continue
        if (!stageFinancialMap[tx.stageId]) stageFinancialMap[tx.stageId] = []
        stageFinancialMap[tx.stageId].push({
          id:          tx.id,
          description: tx.description || '—',
          type:        'EXPENSE',
          isPaid:      tx.isPaid,
          date:        tx.referenceDate ?? tx.createdAt ?? null,
          amount:      Math.abs(Number(tx.netAmount)),
          category:    tx.category?.name ?? null,
          origin:      'FINANCIAL_DIRECT',
        })
      }

      // Enriquecer cada etapa com os dados calculados
      serialised.stages = serialised.stages.map((stage: any) => {
        const realizedFromAllocations = stageRealizedMap[stage.id] ?? 0
        const realizedFromEntries     = entriesMap[stage.id] ?? 0
        const totalRealized           = realizedFromAllocations + realizedFromEntries
        const budget                  = stage.budgetTotal ?? 0
        const balance                 = budget - totalRealized
        const deviationPercent        = budget > 0
          ? ((totalRealized - budget) / budget) * 100
          : 0
        // progressPercent = % físico digitado pelo usuário (não sobrescrever com razão financeira)
        const progressPercent = Math.min(100, Math.max(0, toNum(stage.progressPercent) ?? 0))
        return {
          ...stage,
          realizedValue:           Math.round(totalRealized * 100) / 100,
          realizedFromAllocations: Math.round(realizedFromAllocations * 100) / 100,
          realizedFromEntries:     Math.round(realizedFromEntries * 100) / 100,
          balance:                 Math.round(balance * 100) / 100,
          progressPercent:         Math.round(progressPercent * 100) / 100,
          deviationPercent:        Math.round(deviationPercent * 100) / 100,
          isOverBudget:            deviationPercent > 5,
          recentTransactions:      stageTxMap[stage.id] ?? [],
          costEntries:             stageEntriesMap[stage.id] ?? [],
          financialEntries:        stageFinancialMap[stage.id] ?? [],
        }
      })
    } catch { /* silencioso: enriquecimento não bloqueia resposta */ }

    // ── Custo de mão de obra (ProjectCostEntry LABOR) ───────────────────────
    try {
      const laborEntries = await p.projectCostEntry.findMany({
        where:   { companyId, projectId: id, category: 'LABOR', isCancelled: false },
        orderBy: { date: 'desc' },
        take:    50,
      })
      const totalLabor = laborEntries.reduce((sum: number, c: any) => sum + Number(c.totalCost), 0)
      serialised.laborCosts = {
        total:   Math.round(totalLabor * 100) / 100,
        entries: laborEntries.slice(0, 10).map((c: any) => ({
          id:          c.id,
          description: c.description,
          totalCost:   Number(c.totalCost),
          date:        c.date,
        })),
      }
    } catch { /* silencioso */ }

    // ── Custos de material/EPI/equipamento (ProjectCostEntry não-LABOR) ──────
    try {
      const [materialAgg, byCategory] = await Promise.all([
        p.projectCostEntry.aggregate({
          where: { companyId, projectId: id, category: { not: 'LABOR' }, isCancelled: false },
          _sum:  { totalCost: true },
        }),
        p.projectCostEntry.groupBy({
          by:    ['category'],
          where: { companyId, projectId: id, isCancelled: false },
          _sum:  { totalCost: true },
          _count: { _all: true },
        }),
      ])
      serialised.materialCosts = {
        total:      Math.round(Number(materialAgg._sum.totalCost ?? 0) * 100) / 100,
        byCategory: byCategory.map((r: any) => ({
          category:  r.category,
          total:     Math.round(Number(r._sum.totalCost ?? 0) * 100) / 100,
          count:     r._count._all,
        })),
      }
    } catch { /* silencioso */ }

    // ── Equipe atual e histórico de colaboradores ───────────────────────────
    try {
      const [currentTeam, pastTeam] = await Promise.all([
        p.employee.findMany({
          where:   { companyId, projectId: id, isActive: true },
          select: {
            id: true, name: true, code: true, role: true, type: true, status: true,
            photo: true, admissionDate: true, lastTransferDate: true,
          },
          orderBy: { name: 'asc' },
        }),
        p.employeeProjectHistory.findMany({
          where:   { companyId, projectId: id },
          include: { employee: { select: { id: true, name: true, code: true, role: true, photo: true } } },
          orderBy: { startDate: 'desc' },
          take: 50,
        }),
      ])
      serialised.currentTeam = currentTeam
      serialised.pastTeam    = pastTeam
    } catch { /* silencioso */ }

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
    if (body.totalArea       !== undefined) data.totalArea       = body.totalArea
    if (body.floors          !== undefined) data.floors          = body.floors
    if (body.buildingPermit  !== undefined) data.buildingPermit  = body.buildingPermit
    if (body.slogan          !== undefined) data.slogan          = body.slogan
    if (body.diaryMaxPhotos  !== undefined) data.diaryMaxPhotos  = body.diaryMaxPhotos

    const project = await p.project.update({
      where: { id },
      data,
      include: {
        client:      { select: { id: true, name: true } },
        responsible: { select: { id: true, name: true, photo: true } },
        stages:      { orderBy: { order: 'asc' } },
      },
    })

    await recalcProject(id, companyId)

    await createAuditLog({
      prisma, companyId, userId, request,
      action:      'UPDATE',
      module:      'PROJECT',
      entity:      'Project',
      entityId:    id,
      entityName:  project.name,
      description: `Obra "${project.name}" editada`,
      metadata:    { changes: diffObjects({ name: existing.name, status: existing.status }, { name: project.name, status: project.status ?? existing.status }) },
    })

    const updated = await p.project.findUnique({
      where: { id },
      include: {
        client:      { select: { id: true, name: true } },
        responsible: { select: { id: true, name: true, photo: true } },
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

    await createAuditLog({
      prisma, companyId, userId, request,
      action:      'DELETE',
      module:      'PROJECT',
      entity:      'Project',
      entityId:    id,
      entityName:  project.name,
      description: `Obra "${project.name}" inativada`,
      metadata:    { txCount },
    })

    return reply.send({ success: true })
  })

  // ── GET /:id/stages — listar etapas (usado pelo formulário do RDO) ─────────
  app.get('/:id/stages', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id }    = request.params as { id: string }

    const project = await p.project.findFirst({ where: { id, companyId, isActive: true } })
    if (!project) return reply.status(404).send({ error: 'Obra não encontrada' })

    const stages = await p.projectStage.findMany({
      where:   { projectId: id, status: { not: 'CANCELLED' } },
      orderBy: { order: 'asc' },
      select: {
        id: true, name: true, code: true, order: true,
        progressPercent: true, status: true,
        budgetTotal: true, budgetMaterial: true, budgetLabor: true,
        startDate: true, endDate: true,
      },
    })

    return reply.send({ stages: stages.map(serialiseStage) })
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

    await createAuditLog({
      prisma, companyId, userId: payload.sub, request,
      action:      'CREATE',
      module:      'PROJECT',
      entity:      'ProjectStage',
      entityId:    stage.id,
      entityName:  stage.name,
      description: `Etapa "${stage.name}" adicionada à obra "${project.name}"`,
      metadata:    { projectId: id, budgetTotal: mat + labor },
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

    await createAuditLog({
      prisma, companyId, userId: payload.sub, request,
      action:      'UPDATE',
      module:      'PROJECT',
      entity:      'ProjectStage',
      entityId:    stageId,
      entityName:  body.name ?? stage.name,
      description: `Etapa "${body.name ?? stage.name}" da obra "${project.name}" editada`,
      metadata:    { projectId: id, changes: body },
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

    await createAuditLog({
      prisma, companyId, userId: payload.sub, request,
      action:      'DELETE',
      module:      'PROJECT',
      entity:      'ProjectStage',
      entityId:    stageId,
      entityName:  stage.name,
      description: `Etapa "${stage.name}" removida da obra "${project.name}"`,
      metadata:    { projectId: id },
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
    if (body.status !== undefined) data.status = body.status

    const updated = await p.projectStage.update({ where: { id: stageId }, data })
    await recalcProject(id, companyId)

    await createAuditLog({
      prisma, companyId, userId, request,
      action:      'UPDATE',
      module:      'PROJECT',
      entity:      'ProjectStage',
      entityId:    stageId,
      entityName:  stage.name,
      description: `Progresso da etapa "${stage.name}" (obra "${project.name}") atualizado para ${body.progressPercent}%`,
      metadata:    { progressPercent: body.progressPercent, previousProgress: toNum(stage.progressPercent), projectId: id },
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
        projectId:      project.id,
        projectName:    project.name,
        projectCode:    project.code,
        address:        project.address,
        city:           project.city,
        state:          project.state,
        clientName:     project.client?.name ?? null,
        cno:            project.cno,
        artExecution:   project.artExecution,
        artProjects:    project.artProjects,
        technicalName:  project.technicalName,
        technicalTitle: project.technicalTitle,
        technicalCrea:  project.technicalCrea,
        technicalPhoto: project.technicalPhoto,
        coverImage:     project.coverImage,
        startDate:      project.startDate,
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

  // ── Helper: carrega projeto + empresa + imagens para a placa ─────────────
  async function loadPlacaData(id: string, companyId: string, imageType: 'logo' | 'photo') {
    const [project, company] = await Promise.all([
      p.project.findFirst({
        where: { id, companyId, isActive: true },
        include: { client: { select: { id: true, name: true } } },
      }),
      p.company.findUnique({
        where: { id: companyId },
        select: { name: true, logo: true, slogan: true, cnpj: true, phone: true, email: true, address: true, city: true, state: true },
      }),
    ])
    if (!project) return null

    const syslobraLogoBase64 = getSyslobraLogoBase64()
    const centralImageBase64 = getCentralImageBase64(project, company, imageType)

    return { project, company, syslobraLogoBase64, centralImageBase64 }
  }

  // Faz parse do parâmetro visibleFields (JSON array na query string)
  function parseVisibleFields(raw?: string): string[] | undefined {
    if (!raw) return undefined
    try { return JSON.parse(raw) } catch { return undefined }
  }

  // ── GET /:id/plate/preview — retorna HTML sem Puppeteer (prévia fiel) ─────
  app.get('/:id/plate/preview', { preHandler: [requireCompany] }, async (request, reply) => {
    const req        = request as RequestWithMember
    const companyId  = req.companyId!
    const { id }     = request.params as { id: string }
    const q          = request.query as { imageType?: string; visibleFields?: string }
    const imageType  = (q.imageType ?? 'logo') as 'logo' | 'photo'
    const visibleFields = parseVisibleFields(q.visibleFields)

    const data = await loadPlacaData(id, companyId, imageType)
    if (!data) return reply.status(404).send({ error: 'Obra não encontrada' })

    const html = gerarHtmlPlaca({ ...data, imageType, visibleFields })

    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Cache-Control', 'no-cache')
      .send(html)
  })

  // ── GET /:id/plate/pdf — placa de obra em PDF (Puppeteer) ────────────────
  app.get('/:id/plate/pdf', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id }    = request.params as { id: string }
    const q         = request.query as { imageType?: string; visibleFields?: string }
    const imageType = (q.imageType ?? 'logo') as 'logo' | 'photo'
    const visibleFields = parseVisibleFields(q.visibleFields)

    const data = await loadPlacaData(id, companyId, imageType)
    if (!data) return reply.status(404).send({ error: 'Obra não encontrada' })

    const html    = gerarHtmlPlaca({ ...data, imageType, visibleFields })
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    try {
      const page = await browser.newPage()
      await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 2 })
      await page.setContent(html, { waitUntil: 'load' })
      await new Promise(resolve => setTimeout(resolve, 300))

      const pdf = await page.pdf({
        width:           '900px',
        height:          '1200px',
        printBackground: true,
        margin:          { top: '0', right: '0', bottom: '0', left: '0' },
        pageRanges:      '1',
      })

      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="placa-${data.project.code ?? id}.pdf"`)
        .send(Buffer.from(pdf))
    } finally {
      await browser.close()
    }
  })

  // ── GET /:id/plate/png — placa de obra em PNG (Puppeteer) ────────────────
  app.get('/:id/plate/png', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id }    = request.params as { id: string }
    const q         = request.query as { imageType?: string; visibleFields?: string }
    const imageType = (q.imageType ?? 'logo') as 'logo' | 'photo'
    const visibleFields = parseVisibleFields(q.visibleFields)

    const data = await loadPlacaData(id, companyId, imageType)
    if (!data) return reply.status(404).send({ error: 'Obra não encontrada' })

    const html    = gerarHtmlPlaca({ ...data, imageType, visibleFields })
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    try {
      const page = await browser.newPage()
      await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 2 })
      await page.setContent(html, { waitUntil: 'load' })
      await new Promise(resolve => setTimeout(resolve, 300))

      const png = await page.screenshot({
        type:           'png',
        clip:           { x: 0, y: 0, width: 900, height: 1200 },
        omitBackground: false,
      })

      reply
        .header('Content-Type', 'image/png')
        .header('Content-Disposition', `attachment; filename="placa-${data.project.code ?? id}.png"`)
        .send(Buffer.from(png))
    } finally {
      await browser.close()
    }
  })

  // ── GET /:id/folders — árvore de pastas ──────────────────────────────────
  app.get('/:id/folders', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id }    = request.params as { id: string }

    const project = await p.project.findFirst({ where: { id, companyId, isActive: true } })
    if (!project) return reply.status(404).send({ error: 'Obra não encontrada' })

    const folders = await p.projectFolder.findMany({
      where:   { projectId: id, companyId, isActive: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    })

    // Construir árvore
    function buildTree(parentId: string | null): any[] {
      return folders
        .filter((f: any) => f.parentId === parentId)
        .map((f: any) => ({ ...f, children: buildTree(f.id) }))
    }
    const tree = buildTree(null)

    return reply.send({ folders, tree })
  })

  // ── POST /:id/folders — criar pasta ──────────────────────────────────────
  app.post('/:id/folders', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id }    = request.params as { id: string }

    const project = await p.project.findFirst({ where: { id, companyId, isActive: true } })
    if (!project) return reply.status(404).send({ error: 'Obra não encontrada' })

    const body = z.object({
      name:     z.string().min(1).max(120),
      parentId: z.string().nullable().optional(),
      color:    z.string().optional().nullable(),
      order:    z.number().int().optional(),
    }).parse(request.body)

    // Calcular path
    let path_ = body.name
    if (body.parentId) {
      const parent = await p.projectFolder.findFirst({
        where: { id: body.parentId, projectId: id, isActive: true },
      })
      if (!parent) return reply.status(404).send({ error: 'Pasta pai não encontrada' })
      path_ = `${parent.path}/${body.name}`
    }

    const folder = await p.projectFolder.create({
      data: {
        companyId,
        projectId: id,
        name:     body.name,
        parentId: body.parentId ?? null,
        path:     path_,
        color:    body.color ?? null,
        order:    body.order ?? 0,
      },
    })

    return reply.status(201).send({ folder })
  })

  // ── PUT /:id/folders/:folderId — renomear / alterar cor ──────────────────
  app.put('/:id/folders/:folderId', { preHandler: [requireCompany] }, async (request, reply) => {
    const req                  = request as RequestWithMember
    const companyId            = req.companyId!
    const { id, folderId }     = request.params as { id: string; folderId: string }

    const folder = await p.projectFolder.findFirst({
      where: { id: folderId, projectId: id, companyId, isActive: true },
    })
    if (!folder) return reply.status(404).send({ error: 'Pasta não encontrada' })

    const body = z.object({
      name:  z.string().min(1).max(120).optional(),
      color: z.string().nullable().optional(),
      order: z.number().int().optional(),
    }).parse(request.body)

    const data: any = {}
    if (body.name  !== undefined) {
      data.name = body.name
      // Recalcular path
      const parentPath = folder.parentId
        ? (await p.projectFolder.findFirst({ where: { id: folder.parentId } }))?.path ?? ''
        : ''
      data.path = parentPath ? `${parentPath}/${body.name}` : body.name
    }
    if (body.color !== undefined) data.color = body.color
    if (body.order !== undefined) data.order = body.order

    const updated = await p.projectFolder.update({ where: { id: folderId }, data })
    return reply.send({ folder: updated })
  })

  // ── DELETE /:id/folders/:folderId — excluir pasta (só se vazia) ──────────
  app.delete('/:id/folders/:folderId', { preHandler: [requireCompany] }, async (request, reply) => {
    const req              = request as RequestWithMember
    const companyId        = req.companyId!
    const { id, folderId } = request.params as { id: string; folderId: string }

    const folder = await p.projectFolder.findFirst({
      where: { id: folderId, projectId: id, companyId, isActive: true },
    })
    if (!folder) return reply.status(404).send({ error: 'Pasta não encontrada' })

    const [childCount, fileCount] = await Promise.all([
      p.projectFolder.count({ where: { parentId: folderId, isActive: true } }),
      p.projectFile.count({ where: { folderId, isActive: true } }),
    ])

    if (childCount > 0 || fileCount > 0) {
      return reply.status(409).send({
        error: 'Pasta não está vazia. Mova ou exclua os itens antes de remover a pasta.',
        childCount,
        fileCount,
      })
    }

    await p.projectFolder.update({ where: { id: folderId }, data: { isActive: false } })
    return reply.send({ success: true })
  })

  // ── PATCH /:id/files/:fileId/move — mover arquivo para pasta ─────────────
  app.patch('/:id/files/:fileId/move', { preHandler: [requireCompany] }, async (request, reply) => {
    const req              = request as RequestWithMember
    const companyId        = req.companyId!
    const { id, fileId }   = request.params as { id: string; fileId: string }

    const file = await p.projectFile.findFirst({
      where: { id: fileId, projectId: id, companyId, isActive: true },
    })
    if (!file) return reply.status(404).send({ error: 'Arquivo não encontrado' })

    const body = z.object({ folderId: z.string().nullable() }).parse(request.body)

    if (body.folderId) {
      const folder = await p.projectFolder.findFirst({
        where: { id: body.folderId, projectId: id, companyId, isActive: true },
      })
      if (!folder) return reply.status(404).send({ error: 'Pasta destino não encontrada' })
    }

    const updated = await p.projectFile.update({
      where: { id: fileId },
      data:  { folderId: body.folderId },
    })
    return reply.send({ file: updated })
  })

  // ── POST /:id/files — upload de arquivo de projeto ────────────────────────
  app.post('/:id/files', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const payload   = request.user as JwtPayload
    const { id }    = request.params as { id: string }

    const project = await p.project.findFirst({ where: { id, companyId, isActive: true } })
    if (!project) return reply.status(404).send({ error: 'Obra não encontrada' })

    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado' })

    // Verificar tamanho (100 MB)
    const MAX_SIZE = 100 * 1024 * 1024
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of data.file) {
      size += chunk.length
      if (size > MAX_SIZE) return reply.status(413).send({ error: 'Arquivo excede 100 MB' })
      chunks.push(chunk)
    }
    const fileBuffer = Buffer.concat(chunks)

    const dir = path.join(process.cwd(), 'uploads', 'projects', companyId, id)
    fs.mkdirSync(dir, { recursive: true })

    const timestamp    = Date.now()
    const safeName     = data.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const savedName    = `${timestamp}-${safeName}`
    const filePath     = path.join(dir, savedName)
    fs.writeFileSync(filePath, fileBuffer)

    const ext = path.extname(data.filename).toLowerCase()
    const category = ext === '.pdf' ? 'pdf'
      : ext === '.dwg' || ext === '.dxf' ? 'dwg'
      : ext === '.ifc' ? 'ifc'
      : 'other'

    const fields = data.fields as any
    const name        = (fields?.name?.value ?? data.filename).slice(0, 200)
    const description = fields?.description?.value ?? null
    const version     = fields?.version?.value ?? null
    const folderId    = fields?.folderId?.value ?? null

    // Validar folderId se fornecido
    if (folderId) {
      const folderExists = await p.projectFolder.findFirst({
        where: { id: folderId, projectId: id, companyId, isActive: true },
      })
      if (!folderExists) return reply.status(404).send({ error: 'Pasta não encontrada' })
    }

    const projectFile = await p.projectFile.create({
      data: {
        companyId,
        projectId: id,
        folderId:    folderId ?? null,
        name,
        originalName: data.filename,
        type:         data.mimetype,
        size,
        url:          `uploads/projects/${companyId}/${id}/${savedName}`,
        category,
        description,
        version,
        uploadedBy:   payload.sub,
      },
    })

    return reply.status(201).send({ file: projectFile })
  })

  // ── GET /:id/files — listar arquivos (agrupados por categoria ou por pasta) ─
  app.get('/:id/files', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id }    = request.params as { id: string }
    const q         = request.query as { folderId?: string; all?: string }

    const project = await p.project.findFirst({ where: { id, companyId, isActive: true } })
    if (!project) return reply.status(404).send({ error: 'Obra não encontrada' })

    const where: any = { projectId: id, companyId, isActive: true }
    if (q.folderId === 'root') {
      where.folderId = null
    } else if (q.folderId) {
      where.folderId = q.folderId
    }

    const files = await p.projectFile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    // Se consulta por pasta específica, retornar lista plana
    if (q.folderId !== undefined) {
      return reply.send({ files })
    }

    // Compatibilidade: retornar agrupado por categoria
    const grouped = {
      pdfs:   files.filter((f: any) => f.category === 'pdf'),
      dwgs:   files.filter((f: any) => f.category === 'dwg'),
      ifcs:   files.filter((f: any) => f.category === 'ifc'),
      others: files.filter((f: any) => f.category === 'other'),
      all:    files,
    }

    return reply.send(grouped)
  })

  // ── DELETE /:id/files/:fileId — remover arquivo ───────────────────────────
  app.delete('/:id/files/:fileId', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id, fileId } = request.params as { id: string; fileId: string }

    const file = await p.projectFile.findFirst({
      where: { id: fileId, projectId: id, companyId, isActive: true },
    })
    if (!file) return reply.status(404).send({ error: 'Arquivo não encontrado' })

    // Soft delete + remoção em disco
    await p.projectFile.update({ where: { id: fileId }, data: { isActive: false } })

    try {
      const fullPath = path.join(process.cwd(), file.url)
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
    } catch { /* não bloquear se arquivo já não existir */ }

    return reply.send({ success: true })
  })

  // ── GET /:id/close-requests — solicitação pendente ───────────────────────
  app.get('/:id/close-requests', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id }    = request.params as { id: string }

    const pendingRequest = await p.projectCloseRequest.findFirst({
      where:   { projectId: id, companyId, status: 'PENDING', isActive: true },
      orderBy: { requestedAt: 'desc' },
    })

    return reply.send({ pendingRequest: pendingRequest ?? null })
  })

  // ── POST /:id/request-close — solicitar encerramento ─────────────────────
  app.post('/:id/request-close', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const payload   = request.user as JwtPayload
    const userId    = payload.sub
    const { id }    = request.params as { id: string }
    const body      = request.body as { reason?: string }

    const project = await p.project.findFirst({
      where: { id, companyId, isActive: true },
      select: { id: true, name: true, status: true },
    })
    if (!project) return reply.status(404).send({ error: 'Obra não encontrada' })
    if (project.status === 'COMPLETED' || project.status === 'CANCELLED') {
      return reply.status(400).send({ error: 'Obra já está encerrada ou cancelada' })
    }

    // Verificar ferramentas pendentes diretamente no banco
    const pendingTools = await p.stockItem.count({
      where: { companyId, requiresCustody: true, currentProjectId: id, toolStatus: 'IN_USE' },
    })

    const closeReq = await p.projectCloseRequest.create({
      data: {
        companyId,
        projectId:   id,
        requestedBy: userId,
        reason:      body.reason ?? null,
        pendingTools,
        status:      'PENDING',
        isActive:    true,
      },
    })

    await notifyManagers({
      companyId,
      type:    'ACTION_REQUIRED',
      title:   '🏗️ Solicitação de encerramento de obra',
      message: `Solicitação para encerrar "${project.name}".${
        pendingTools > 0
          ? ` ⚠️ ${pendingTools} ferramenta(s) ainda alocada(s).`
          : ' Sem pendências de ferramentas.'
      }`,
      link: `/app/centro-de-custo/${id}`,
      excludeUserId: userId,
    })

    return reply.send({
      success:     true,
      requestId:   closeReq.id,
      pendingTools,
      message: pendingTools > 0
        ? `Solicitação enviada. Há ${pendingTools} ferramenta(s) pendente(s) informadas ao gestor.`
        : 'Solicitação enviada ao gestor para aprovação.',
    })
  })

  // ── PATCH /:id/close-requests/:requestId/approve ─────────────────────────
  app.patch('/:id/close-requests/:requestId/approve', { preHandler: [requireCompany] }, async (request, reply) => {
    const req        = request as RequestWithMember
    const companyId  = req.companyId!
    const payload    = request.user as JwtPayload
    const userId     = payload.sub
    const memberRole = (req as any).memberRole as string | undefined
    const { id, requestId } = request.params as { id: string; requestId: string }

    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(memberRole ?? '')) {
      return reply.status(403).send({ error: 'Sem permissão para aprovar encerramento' })
    }

    const closeReq = await p.projectCloseRequest.findFirst({
      where: { id: requestId, projectId: id, status: 'PENDING', isActive: true },
    })
    if (!closeReq) return reply.status(404).send({ error: 'Solicitação não encontrada' })

    await p.project.update({ where: { id }, data: { status: 'COMPLETED' } })

    await p.projectCloseRequest.update({
      where: { id: requestId },
      data: { status: 'APPROVED', reviewedBy: userId, reviewedAt: new Date() },
    })

    await createNotification({
      companyId,
      userId: closeReq.requestedBy,
      type:    'INFO',
      title:   '✅ Encerramento de obra aprovado',
      message: 'O encerramento da obra foi aprovado pelo gestor.',
      link:    `/app/centro-de-custo/${id}`,
    })

    return reply.send({ success: true })
  })

  // ── PATCH /:id/close-requests/:requestId/reject ──────────────────────────
  app.patch('/:id/close-requests/:requestId/reject', { preHandler: [requireCompany] }, async (request, reply) => {
    const req        = request as RequestWithMember
    const companyId  = req.companyId!
    const payload    = request.user as JwtPayload
    const userId     = payload.sub
    const memberRole = (req as any).memberRole as string | undefined
    const { id, requestId } = request.params as { id: string; requestId: string }
    const body = request.body as { notes?: string }

    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(memberRole ?? '')) {
      return reply.status(403).send({ error: 'Sem permissão para recusar encerramento' })
    }

    const closeReq = await p.projectCloseRequest.findFirst({
      where: { id: requestId, projectId: id, status: 'PENDING', isActive: true },
    })
    if (!closeReq) return reply.status(404).send({ error: 'Solicitação não encontrada' })

    await p.projectCloseRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED', reviewedBy: userId, reviewedAt: new Date(), reviewNotes: body.notes ?? null },
    })

    await createNotification({
      companyId,
      userId: closeReq.requestedBy,
      type:    'WARNING',
      title:   '❌ Encerramento recusado',
      message: `O encerramento da obra foi recusado.${body.notes ? ` Motivo: ${body.notes}` : ''}`,
      link:    `/app/centro-de-custo/${id}`,
    })

    return reply.send({ success: true })
  })

  // ── GET /:id/costs — listar custos da obra ────────────────────────────────
  app.get('/:id/costs', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id }    = request.params as { id: string }
    const q         = request.query as { category?: string; pending?: string }

    const where: any = { projectId: id, companyId, isCancelled: false }
    // LABOR vai para folha de pagamento; excluir desta rota por padrão
    if (q.category) {
      where.category = q.category
    } else {
      where.category = { not: 'LABOR' }
    }
    if (q.pending === 'true') where.needsAppropriation = true

    const [costs, totals] = await Promise.all([
      p.projectCostEntry.findMany({
        where,
        include: {
          stage:         { select: { id: true, name: true } },
          stockMovement: { select: { id: true, type: true } },
        },
        orderBy: { date: 'desc' },
      }),
      p.projectCostEntry.groupBy({
        by:    ['category'],
        where: { projectId: id, companyId, isCancelled: false },
        _sum:  { totalCost: true },
        _count: { _all: true },
      }),
    ])

    const pendingCount = await p.projectCostEntry.count({
      where: { projectId: id, companyId, needsAppropriation: true, category: { not: 'LABOR' } },
    })

    return reply.send({
      costs: costs.map((c: any) => ({
        ...c,
        quantity:  Number(c.quantity),
        unitCost:  Number(c.unitCost),
        totalCost: Number(c.totalCost),
      })),
      totals: totals.map((t: any) => ({
        category:  t.category,
        total:     Number(t._sum.totalCost ?? 0),
        count:     t._count._all,
      })),
      pendingCount,
    })
  })

  // ── PATCH /:id/costs/:costId/appropriate — apropriar custo a etapa ─────────
  app.patch('/:id/costs/:costId/appropriate', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const payload   = request.user as JwtPayload
    const companyId = req.companyId!
    const { id, costId } = request.params as { id: string; costId: string }
    const body      = request.body as { stageId: string; notes?: string }

    if (!body.stageId) return reply.status(400).send({ error: 'stageId é obrigatório' })

    const cost = await p.projectCostEntry.findFirst({
      where: { id: costId, projectId: id, companyId },
    })
    if (!cost) return reply.status(404).send({ error: 'Custo não encontrado' })

    await p.projectCostEntry.update({
      where: { id: costId },
      data: {
        stageId:            body.stageId,
        needsAppropriation: false,
        appropriatedBy:     payload.sub,
        appropriatedAt:     new Date(),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    })

    return reply.send({ success: true })
  })

  // ── PATCH /:id/costs/appropriate-bulk — apropriar vários de uma vez ─────────
  app.patch('/:id/costs/appropriate-bulk', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const payload   = request.user as JwtPayload
    const companyId = req.companyId!
    const { id }    = request.params as { id: string }
    const body      = request.body as { costIds: string[]; stageId: string }

    if (!body.stageId)                   return reply.status(400).send({ error: 'stageId é obrigatório' })
    if (!body.costIds?.length)           return reply.status(400).send({ error: 'costIds é obrigatório' })

    await p.projectCostEntry.updateMany({
      where: { id: { in: body.costIds }, projectId: id, companyId },
      data: {
        stageId:            body.stageId,
        needsAppropriation: false,
        appropriatedBy:     payload.sub,
        appropriatedAt:     new Date(),
      },
    })

    return reply.send({ success: true })
  })

  // ── PATCH /:id/allocations/:allocationId/stage — definir etapa na alocação ──
  app.patch('/:id/allocations/:allocationId/stage', { preHandler: [requireCompany] }, async (request, reply) => {
    const req          = request as RequestWithMember
    const companyId    = req.companyId!
    const { id, allocationId } = request.params as { id: string; allocationId: string }
    const body         = request.body as { stageId: string }

    if (!body.stageId) return reply.status(400).send({ error: 'stageId é obrigatório' })

    // CostCenterAllocation não tem companyId — buscar só pelo id
    const alloc = await p.costCenterAllocation.findFirst({
      where: { id: allocationId },
    })
    if (!alloc) return reply.status(404).send({ error: 'Alocação não encontrada' })

    await p.costCenterAllocation.update({
      where: { id: allocationId },
      data:  { stageId: body.stageId },
    })

    // Sincronizar stageId no lançamento financeiro (CC ↔ Financeiro)
    if (alloc.transactionId) {
      try {
        await p.financialTransaction.update({
          where: { id: alloc.transactionId },
          data:  { stageId: body.stageId },
        })
      } catch { /* silencioso: campo pode não existir no DB ainda */ }
    }

    return reply.send({ success: true })
  })

  // ── PATCH /:id/transactions/:txId/stage — etapa em lançamento direto ─────────
  // Usado quando o lançamento usa projectId direto (sem CostCenterAllocation)
  app.patch('/:id/transactions/:txId/stage', { preHandler: [requireCompany] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id, txId } = request.params as { id: string; txId: string }
    const body      = request.body as { stageId: string }

    if (!body.stageId) return reply.status(400).send({ error: 'stageId é obrigatório' })

    // Validar que a transação pertence a este projeto e empresa
    const tx = await p.financialTransaction.findFirst({
      where: { id: txId, projectId: id, companyId },
    })
    if (!tx) return reply.status(404).send({ error: 'Lançamento não encontrado' })

    await p.financialTransaction.update({
      where: { id: txId },
      data:  { stageId: body.stageId },
    })

    return reply.send({ success: true })
  })
}

// buildPlacaHtml migrado para apps/api/src/utils/placaTemplate.ts
