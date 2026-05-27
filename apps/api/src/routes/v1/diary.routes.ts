import { FastifyInstance } from 'fastify'
import { prisma }          from '@sysobra/database'
import {
  authenticate,
  requireCompany,
  requirePermission,
  RequestWithMember,
  JwtPayload,
} from '../../middlewares/auth.middleware'
import { generatePdf } from '../../utils/pdf'

const p = prisma as any

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Limiar padrão de chuva (mm) para sugerir dia impraticável */
const DEFAULT_RAIN_THRESHOLD = 10

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getProjectOfCompany(projectId: string, companyId: string) {
  return p.project.findFirst({
    where: { id: projectId, companyId },
    select: {
      id: true, name: true, code: true, coverImage: true, status: true,
      startDate: true, expectedEndDate: true, progressPercent: true,
      client:      { select: { id: true, name: true } },
      responsible: { select: { id: true, name: true, avatarUrl: true } },
    },
  })
}

async function getAccessibleProjectIds(memberId: string): Promise<string[]> {
  const accesses = await prisma.memberProjectAccess.findMany({
    where: { memberId }, select: { projectId: true },
  })
  return accesses.map((a: any) => a.projectId)
}

/** Gera número sequencial RDO-XXX para a obra (apenas para RDOs principais) */
async function nextReportNumber(projectId: string): Promise<string> {
  const last = await p.diaryEntry.findFirst({
    where:   { projectId, isComplement: false, reportNumber: { not: null } },
    orderBy: { createdAt: 'desc' },
    select:  { reportNumber: true },
  })
  if (!last?.reportNumber) return 'RDO-001'
  // Extrai só o número base (ignora sufixo de complemento se houver)
  const match = last.reportNumber.match(/^RDO-(\d+)/)
  const num = match ? parseInt(match[1], 10) + 1 : 1
  return `RDO-${String(num).padStart(3, '0')}`
}

// ─── Utilitários de data (timezone-safe) ──────────────────────────────────────

/**
 * Faz parse de "yyyy-MM-dd" como MEIO-DIA UTC.
 * `new Date("2026-05-27")` interpreta como UTC meia-noite; em server UTC-3 isso
 * vira o dia anterior. Usar meio-dia UTC é seguro para todos os fusos horários.
 */
function parseDateParam(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00.000Z')
}

/**
 * Retorna o intervalo de um dia completo em UTC para "yyyy-MM-dd".
 * Independe do timezone do servidor.
 */
function dayRangeUTC(dateStr: string): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split('-').map(Number)
  return {
    start: new Date(Date.UTC(y, m - 1, d,  0,  0,  0,   0)),
    end:   new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999)),
  }
}

/** Extrai "yyyy-MM-dd" de um objeto Date ou string ISO */
function toDateStr(date: Date | string): string {
  return (date instanceof Date ? date.toISOString() : date).slice(0, 10)
}

// ─── Fim utilitários de data ──────────────────────────────────────────────────

/** Gera letra do complemento (A, B, C…) para RDOs do mesmo dia */
async function nextComplementLetter(projectId: string, date: Date): Promise<{ letter: string; parentId: string; parentNumber: string }> {
  const { start: dateStart, end: dateEnd } = dayRangeUTC(toDateStr(date))

  // Buscar o RDO principal do dia
  const parent = await p.diaryEntry.findFirst({
    where:   { projectId, isComplement: false, date: { gte: dateStart, lte: dateEnd } },
    select:  { id: true, reportNumber: true },
  })
  if (!parent) throw new Error('RDO principal não encontrado para este dia')

  // Contar complementos existentes
  const existingCount = await p.diaryEntry.count({
    where: { projectId, isComplement: true, date: { gte: dateStart, lte: dateEnd } },
  })

  const letter = String.fromCharCode(65 + existingCount) // A=65, B=66…
  return { letter, parentId: parent.id, parentNumber: parent.reportNumber ?? '' }
}

/** Calcula totalRainMm e suggestedUnworkable */
function calcRain(morning: number, afternoon: number, night: number, threshold = DEFAULT_RAIN_THRESHOLD) {
  const total = morning + afternoon + night
  return { total, suggested: total >= threshold }
}

/** Formata data para pt-BR */
function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString('pt-BR')
}

// ─── Helpers de configuração ─────────────────────────────────────────────────

const DIARY_ADDON_KEY = 'diary'

export interface DiaryConfig {
  rainThreshold:    number   // mm para sugerir impraticável
  requireClimate:   boolean  // obrigar preencher clima antes de submeter
  requireActivities:boolean  // obrigar preencher atividades
  notifyOnSubmit:   boolean  // notificar aprovadores ao submeter
  notifyOnApprove:  boolean  // notificar autor ao aprovar
  notifyOnReject:   boolean  // notificar autor ao devolver
}

const DEFAULT_CONFIG: DiaryConfig = {
  rainThreshold:     10,
  requireClimate:    false,
  requireActivities: false,
  notifyOnSubmit:    true,
  notifyOnApprove:   true,
  notifyOnReject:    true,
}

async function getDiaryConfig(companyId: string): Promise<DiaryConfig> {
  const addon = await prisma.companyAddon.findUnique({
    where: { companyId_addonKey: { companyId, addonKey: DIARY_ADDON_KEY } },
    select: { config: true },
  })
  if (!addon?.config) return DEFAULT_CONFIG
  return { ...DEFAULT_CONFIG, ...(addon.config as Record<string, unknown>) } as DiaryConfig
}

// ─── Rotas ────────────────────────────────────────────────────────────────────

export async function diaryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireCompany)

  // ═══════════════════════════════════════════════════════════════════════════
  // ROTAS NOVAS — RDO Reformulado
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /api/v1/diary/projects — obras com diário ─────────────────────────
  app.get('/projects', { preHandler: [requirePermission('diario_obra', 'view')] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const q = request.query as { search?: string; status?: string }

    const projectWhere: any = { companyId, isActive: true }
    if (q.status && q.status !== 'ALL') projectWhere.status = q.status
    if (q.search) {
      projectWhere.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { code: { contains: q.search, mode: 'insensitive' } },
      ]
    }

    // Restrição EXTERNAL/CLIENT
    if (req.memberRole === 'EXTERNAL' || req.memberRole === 'CLIENT') {
      const ids = await getAccessibleProjectIds(req.memberId)
      projectWhere.id = { in: ids }
    }

    const projects = await p.project.findMany({
      where:   projectWhere,
      include: {
        client:      { select: { id: true, name: true } },
        responsible: { select: { id: true, name: true, avatarUrl: true } },
        stages:      { where: { status: { not: 'CANCELLED' } }, select: { id: true, name: true, progressPercent: true, status: true }, orderBy: { order: 'asc' } },
        diaryEntries: {
          orderBy: { date: 'desc' },
          take: 1,
          select: { id: true, date: true, status: true, reportNumber: true, author: { select: { name: true } } },
        },
        _count: { select: { diaryEntries: true } },
      },
      orderBy: { name: 'asc' },
    })

    // Calcula totais pluviométricos por obra
    const result = await Promise.all(projects.map(async (proj: any) => {
      const rainAgg = await p.diaryRainRecord.aggregate({
        where: { projectId: proj.id },
        _sum:  { totalMm: true },
        _count: { isUnworkable: true },
      })
      const unworkableDays = await p.diaryRainRecord.count({
        where: { projectId: proj.id, isUnworkable: true },
      })
      return {
        id:              proj.id,
        name:            proj.name,
        code:            proj.code,
        coverImage:      proj.coverImage,
        status:          proj.status,
        client:          proj.client,
        responsible:     proj.responsible,
        startDate:       proj.startDate,
        expectedEndDate: proj.expectedEndDate,
        progressPercent: Number(proj.progressPercent),
        stages:          proj.stages.map((s: any) => ({ ...s, progressPercent: Number(s.progressPercent) })),
        lastReport:      proj.diaryEntries[0] ?? null,
        totalReports:    proj._count.diaryEntries,
        totalRainMm:     rainAgg._sum.totalMm ?? 0,
        unworkableDays,
      }
    }))

    return reply.send({ projects: result })
  })

  // ── GET /api/v1/diary/projects/:projectId/reports — histórico ─────────────
  app.get('/projects/:projectId/reports', { preHandler: [requirePermission('diario_obra', 'view')] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { projectId } = request.params as { projectId: string }
    const q = request.query as { status?: string; startDate?: string; endDate?: string; page?: string; limit?: string }

    const proj = await getProjectOfCompany(projectId, companyId)
    if (!proj) return reply.status(404).send({ error: 'Obra não encontrada' })

    const page  = Math.max(1, parseInt(q.page  ?? '1',  10))
    const limit = Math.min(50, parseInt(q.limit ?? '20', 10))

    const where: any = { projectId }
    if (q.status && q.status !== 'ALL') where.status = q.status
    if (q.startDate) where.date = { ...where.date, gte: new Date(q.startDate) }
    if (q.endDate)   where.date = { ...where.date, lte: new Date(q.endDate + 'T23:59:59') }

    const [entries, total] = await Promise.all([
      p.diaryEntry.findMany({
        where,
        include: {
          author:      { select: { id: true, name: true, avatarUrl: true } },
          approvedBy:  { select: { id: true, name: true } },
          rejectedBy:  { select: { id: true, name: true } },
          stageEntries:{ include: { stage: { select: { id: true, name: true, code: true } } } },
          occurrences: true,
          rainRecord:  true,
          _count:      { select: { comments: true } },
        },
        orderBy: { date: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
      p.diaryEntry.count({ where }),
    ])

    return reply.send({ project: proj, entries, total, page, limit })
  })

  // ── POST /api/v1/diary/reports — criar relatório ──────────────────────────
  app.post('/reports', { preHandler: [requirePermission('diario_obra', 'create')] }, async (request, reply) => {
    const req     = request as RequestWithMember
    const payload = request.user as JwtPayload
    const companyId = req.companyId!
    const userId    = payload.sub

    const body = request.body as {
      projectId:          string
      date?:              string
      status?:            string
      isComplement?:      boolean
      // Clima
      weatherMorning?:    string
      weatherAfternoon?:  string
      weatherNight?:      string
      rainMorningMm?:     number
      rainAfternoonMm?:   number
      rainNightMm?:       number
      workableMorning?:   boolean
      workableAfternoon?: boolean
      workableNight?:     boolean
      unworkableConfirmedBy?: string
      // Conteúdo
      generalActivities?: string
      generalNotes?:      string
      notesPublic?:       boolean
      activities?:        string
      observations?:      string
      // DDS
      ddsTheme?:          string
      ddsDone?:           boolean
      ddsTime?:           string
      // Fotos
      imageUrls?:         string[]
      // Etapas
      stageEntries?: {
        stageId:          string
        previousProgress: number
        currentProgress:  number
        activities:       string
        comments?:        string
        photos?:          string[]
      }[]
      // Ocorrências
      occurrences?: {
        type:             string
        severity:         string
        description:      string
        action?:          string
        responsible?:     string
        visitorName?:     string
        visitorCompany?:  string
        visitorPurpose?:  string
        photos?:          string[]
        notifyManager?:   boolean
      }[]
    }

    if (!body.projectId) return reply.status(400).send({ error: 'projectId é obrigatório' })

    const proj = await getProjectOfCompany(body.projectId, companyId)
    if (!proj) return reply.status(404).send({ error: 'Obra não encontrada' })

    // Verifica duplicata de data (timezone-safe: parseDateParam usa meio-dia UTC)
    const entryDateStr  = body.date ?? toDateStr(new Date())
    const entryDate     = parseDateParam(entryDateStr)
    const { start: dateStart, end: dateEnd } = dayRangeUTC(entryDateStr)

    const existingMain = await p.diaryEntry.findFirst({
      where: { projectId: body.projectId, isComplement: false, date: { gte: dateStart, lte: dateEnd } },
      select: { id: true, reportNumber: true },
    })

    // Determina se é complemento (há RDO principal E o body pede complemento OU há duplicata)
    const forceComplement = body.isComplement === true
    const isComplement    = forceComplement || (!!existingMain && !forceComplement)

    if (isComplement && !existingMain) {
      return reply.status(400).send({ error: 'Não há RDO principal para este dia. Crie o RDO principal primeiro.' })
    }

    // Cálculo pluviométrico — usa threshold da empresa
    const mMm = body.rainMorningMm   ?? 0
    const aMm = body.rainAfternoonMm ?? 0
    const nMm = body.rainNightMm     ?? 0
    const cfg = await getDiaryConfig(companyId)
    const { total: totalRainMm, suggested } = calcRain(mMm, aMm, nMm, cfg.rainThreshold)

    // Número do relatório
    let reportNumber: string
    let parentReportId: string | null = null
    let complementLetter: string | null = null

    if (isComplement) {
      const comp = await nextComplementLetter(body.projectId, entryDate)
      complementLetter = comp.letter
      parentReportId   = comp.parentId
      reportNumber     = `${comp.parentNumber}-${comp.letter}`
    } else {
      reportNumber = await nextReportNumber(body.projectId)
    }

    // Cria entrada (principal ou complemento)
    const entry = await p.diaryEntry.create({
      data: {
        projectId:       body.projectId,
        authorId:        userId,
        isComplement,
        parentReportId,
        complementLetter,
        date:         entryDate,
        reportNumber,
        status:       body.status ?? 'DRAFT',
        // Clima
        weatherMorning:       body.weatherMorning   ?? null,
        weatherAfternoon:     body.weatherAfternoon ?? null,
        weatherNight:         body.weatherNight     ?? null,
        rainMorningMm:        mMm,
        rainAfternoonMm:      aMm,
        rainNightMm:          nMm,
        totalRainMm,
        workableMorning:      body.workableMorning   ?? true,
        workableAfternoon:    body.workableAfternoon ?? true,
        workableNight:        body.workableNight     ?? true,
        suggestedUnworkable:  suggested,
        unworkableConfirmedBy:body.unworkableConfirmedBy ?? null,
        // Conteúdo
        generalActivities: body.generalActivities ?? null,
        generalNotes:      body.generalNotes      ?? null,
        notesPublic:       body.notesPublic       ?? false,
        activities:        body.activities        ?? null,
        observations:      body.observations      ?? null,
        // DDS
        ddsTheme: body.ddsTheme ?? null,
        ddsDone:  body.ddsDone  ?? false,
        ddsTime:  body.ddsTime  ? new Date(body.ddsTime) : null,
        imageUrls:body.imageUrls ?? [],
      },
    })

    // Cria stageEntries e atualiza progresso das etapas
    if (body.stageEntries?.length) {
      for (const se of body.stageEntries) {
        const delta = se.currentProgress - se.previousProgress
        await p.diaryStageEntry.create({
          data: {
            diaryId:          entry.id,
            stageId:          se.stageId,
            previousProgress: se.previousProgress,
            currentProgress:  se.currentProgress,
            progressDelta:    delta,
            activities:       se.activities ?? '',
            comments:         se.comments   ?? null,
            photos:           se.photos     ?? [],
          },
        })
        // Atualiza progressPercent da etapa
        await p.projectStage.update({
          where: { id: se.stageId },
          data:  { progressPercent: Math.min(100, Math.max(0, se.currentProgress)) },
        })
      }
      // Recalcula progresso geral da obra
      await recalcProjectProgress(body.projectId)
    }

    // Cria ocorrências
    if (body.occurrences?.length) {
      for (const occ of body.occurrences) {
        await p.diaryOccurrence.create({
          data: {
            diaryId:        entry.id,
            type:           occ.type        ?? 'OTHER',
            severity:       occ.severity    ?? 'LOW',
            description:    occ.description,
            action:         occ.action      ?? null,
            responsible:    occ.responsible ?? null,
            visitorName:    occ.visitorName    ?? null,
            visitorCompany: occ.visitorCompany ?? null,
            visitorPurpose: occ.visitorPurpose ?? null,
            photos:         occ.photos       ?? [],
            notifyManager:  occ.notifyManager ?? false,
          },
        })
      }
    }

    // Cria registro pluviométrico
    const isUnworkable = !(body.workableMorning ?? true) || !(body.workableAfternoon ?? true) || !(body.workableNight ?? true)
    await p.diaryRainRecord.create({
      data: {
        companyId,
        projectId: body.projectId,
        diaryId:   entry.id,
        date:      entryDate,
        morningMm:   mMm,
        afternoonMm: aMm,
        nightMm:     nMm,
        totalMm:     totalRainMm,
        isUnworkable,
        unworkableReason: isUnworkable ? body.unworkableConfirmedBy : null,
      },
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        companyId,
        userId,
        action:   'CREATE',
        entity:   'DiaryEntry',
        entityId: entry.id,
        after:    { reportNumber, projectId: body.projectId, date: entryDate },
      },
    })

    const created = await p.diaryEntry.findUnique({
      where:   { id: entry.id },
      include: {
        author:       { select: { id: true, name: true, avatarUrl: true } },
        stageEntries: { include: { stage: { select: { id: true, name: true } } } },
        occurrences:  true,
        rainRecord:   true,
      },
    })

    return reply.status(201).send({ entry: created })
  })

  // ── GET /api/v1/diary/reports/:id — detalhe do relatório ─────────────────
  app.get('/reports/:id', { preHandler: [requirePermission('diario_obra', 'view')] }, async (request, reply) => {
    const req        = request as RequestWithMember
    const companyId  = req.companyId!
    const { id }     = request.params as { id: string }
    const isInternal = req.memberType === 'INTERNAL'

    const entry = await p.diaryEntry.findFirst({
      where:   { id, project: { companyId } },
      include: {
        author:      { select: { id: true, name: true, avatarUrl: true } },
        approvedBy:  { select: { id: true, name: true } },
        rejectedBy:  { select: { id: true, name: true } },
        project: {
          select: {
            id: true, name: true, code: true, address: true, city: true, state: true,
            startDate: true, expectedEndDate: true, coverImage: true,
            client:      { select: { id: true, name: true } },
            responsible: { select: { id: true, name: true } },
            company:     { select: { name: true, cnpj: true, logo: true } },
          },
        },
        stageEntries: {
          include: { stage: { select: { id: true, name: true, code: true, budgetTotal: true } } },
          orderBy: { createdAt: 'asc' },
        },
        occurrences: { orderBy: { createdAt: 'asc' } },
        rainRecord:  true,
        comments: {
          where:   isInternal ? {} : { isInternal: false },
          include: { author: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!entry) return reply.status(404).send({ error: 'Relatório não encontrado' })

    return reply.send({ entry })
  })

  // ── PUT /api/v1/diary/reports/:id — editar relatório ─────────────────────
  app.put('/reports/:id', { preHandler: [requirePermission('diario_obra', 'edit')] }, async (request, reply) => {
    const req     = request as RequestWithMember
    const payload = request.user as JwtPayload
    const { id }  = request.params as { id: string }
    const companyId = req.companyId!
    const userId    = payload.sub

    const entry = await p.diaryEntry.findFirst({
      where: { id, project: { companyId } },
    })
    if (!entry) return reply.status(404).send({ error: 'Relatório não encontrado' })

    const isAdminLike = (req.permissions as any).all === true || req.memberRole === 'MANAGER'
    const isOwnEntry  = entry.authorId === userId

    if (!isAdminLike && !isOwnEntry)
      return reply.status(403).send({ error: 'Você só pode editar seus próprios relatórios' })
    if (!isAdminLike && entry.status === 'APPROVED')
      return reply.status(409).send({ error: 'Não é possível editar um relatório já aprovado' })
    if (!isAdminLike && entry.status !== 'DRAFT' && entry.status !== 'REJECTED')
      return reply.status(409).send({ error: 'Relatório só pode ser editado quando em rascunho ou devolvido' })

    const body = request.body as any

    const mMm = body.rainMorningMm   ?? Number(entry.rainMorningMm)   ?? 0
    const aMm = body.rainAfternoonMm ?? Number(entry.rainAfternoonMm) ?? 0
    const nMm = body.rainNightMm     ?? Number(entry.rainNightMm)     ?? 0
    const { total: totalRainMm, suggested } = calcRain(mMm, aMm, nMm)

    const data: any = { updatedBy: userId }
    const fields = [
      'weatherMorning','weatherAfternoon','weatherNight',
      'workableMorning','workableAfternoon','workableNight',
      'unworkableConfirmedBy','generalActivities','generalNotes','notesPublic',
      'activities','observations','ddsTheme','ddsDone','imageUrls',
    ]
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f]
    }
    if (body.date) data.date = parseDateParam(body.date)
    if (body.ddsTime) data.ddsTime = new Date(body.ddsTime)
    data.rainMorningMm   = mMm
    data.rainAfternoonMm = aMm
    data.rainNightMm     = nMm
    data.totalRainMm     = totalRainMm
    data.suggestedUnworkable = suggested
    // Volta para PENDING se enviado
    if (body.submit) data.status = 'PENDING'
    else             data.status = 'DRAFT'

    await p.diaryEntry.update({ where: { id }, data })

    // Atualiza stageEntries se fornecidos
    if (body.stageEntries?.length) {
      for (const se of body.stageEntries) {
        const delta = se.currentProgress - se.previousProgress
        await p.diaryStageEntry.upsert({
          where:  { diaryId_stageId: { diaryId: id, stageId: se.stageId } },
          update: { previousProgress: se.previousProgress, currentProgress: se.currentProgress, progressDelta: delta, activities: se.activities, comments: se.comments ?? null, photos: se.photos ?? [] },
          create: { diaryId: id, stageId: se.stageId, previousProgress: se.previousProgress, currentProgress: se.currentProgress, progressDelta: delta, activities: se.activities ?? '', comments: se.comments ?? null, photos: se.photos ?? [] },
        })
        await p.projectStage.update({
          where: { id: se.stageId },
          data:  { progressPercent: Math.min(100, Math.max(0, se.currentProgress)) },
        })
      }
      await recalcProjectProgress(entry.projectId)
    }

    // Atualiza rainRecord
    const isUnworkable = !(body.workableMorning ?? entry.workableMorning) || !(body.workableAfternoon ?? entry.workableAfternoon) || !(body.workableNight ?? entry.workableNight)
    await p.diaryRainRecord.upsert({
      where:  { diaryId: id },
      update: { morningMm: mMm, afternoonMm: aMm, nightMm: nMm, totalMm: totalRainMm, isUnworkable },
      create: {
        companyId, projectId: entry.projectId, diaryId: id,
        date: entry.date, morningMm: mMm, afternoonMm: aMm, nightMm: nMm, totalMm: totalRainMm, isUnworkable,
      },
    })

    const updated = await p.diaryEntry.findUnique({
      where:   { id },
      include: {
        author:       { select: { id: true, name: true, avatarUrl: true } },
        stageEntries: { include: { stage: { select: { id: true, name: true } } } },
        occurrences:  true,
        rainRecord:   true,
      },
    })

    return reply.send({ entry: updated })
  })

  // ── POST /api/v1/diary/reports/:id/approve ────────────────────────────────
  app.post('/reports/:id/approve', { preHandler: [requirePermission('diario_obra', 'approve')] }, async (request, reply) => {
    const req     = request as RequestWithMember
    const payload = request.user as JwtPayload
    const { id }  = request.params as { id: string }

    const entry = await p.diaryEntry.findFirst({ where: { id, project: { companyId: req.companyId } } })
    if (!entry) return reply.status(404).send({ error: 'Relatório não encontrado' })
    if (entry.status !== 'PENDING') return reply.status(409).send({ error: 'Relatório não está pendente de aprovação' })

    const updated = await p.diaryEntry.update({
      where: { id },
      data:  { status: 'APPROVED', approvedById: payload.sub, approvedAt: new Date(), rejectionNote: null },
    })

    await (prisma as any).auditLog.create({
      data: {
        companyId:   entry.projectId ? (await p.project.findUnique({ where: { id: entry.projectId }, select: { companyId: true } }))?.companyId ?? req.companyId : req.companyId,
        userId:      payload.sub,
        action:      'APPROVE',
        entity:      'DiaryEntry',
        entityId:    id,
        entityName:  entry.reportNumber ?? id,
        description: `RDO ${entry.reportNumber ?? ''} aprovado`,
      },
    }).catch(() => null)

    return reply.send({ entry: updated })
  })

  // ── POST /api/v1/diary/reports/:id/reject ────────────────────────────────
  app.post('/reports/:id/reject', { preHandler: [requirePermission('diario_obra', 'approve')] }, async (request, reply) => {
    const req  = request as RequestWithMember
    const payload = request.user as JwtPayload
    const { id } = request.params as { id: string }
    const { rejectionNote } = request.body as { rejectionNote?: string }

    if (!rejectionNote?.trim()) return reply.status(400).send({ error: 'rejectionNote é obrigatório' })

    const entry = await p.diaryEntry.findFirst({ where: { id, project: { companyId: req.companyId } } })
    if (!entry) return reply.status(404).send({ error: 'Relatório não encontrado' })
    if (entry.status !== 'PENDING') return reply.status(409).send({ error: 'Relatório não está pendente' })

    const updated = await p.diaryEntry.update({
      where: { id },
      data: {
        status:        'REJECTED',
        rejectionNote: rejectionNote.trim(),
        rejectedById:  payload.sub,
        rejectedAt:    new Date(),
      },
    })

    await (prisma as any).auditLog.create({
      data: {
        companyId:   entry.projectId ? (await p.project.findUnique({ where: { id: entry.projectId }, select: { companyId: true } }))?.companyId ?? req.companyId : req.companyId,
        userId:      payload.sub,
        action:      'REJECT',
        entity:      'DiaryEntry',
        entityId:    id,
        entityName:  entry.reportNumber ?? id,
        description: `RDO ${entry.reportNumber ?? ''} devolvido`,
        metadata:    { note: rejectionNote.trim() },
      },
    }).catch(() => null)

    return reply.send({ entry: updated })
  })

  // ── POST /api/v1/diary/reports/:id/submit — enviar para aprovação ─────────
  app.post('/reports/:id/submit', { preHandler: [requirePermission('diario_obra', 'create')] }, async (request, reply) => {
    const req     = request as RequestWithMember
    const payload = request.user as JwtPayload
    const { id }  = request.params as { id: string }

    const entry = await p.diaryEntry.findFirst({ where: { id, project: { companyId: req.companyId } } })
    if (!entry) return reply.status(404).send({ error: 'Relatório não encontrado' })

    const isOwn      = entry.authorId === payload.sub
    const isAdminLike= (req.permissions as any).all === true
    if (!isOwn && !isAdminLike) return reply.status(403).send({ error: 'Sem permissão' })
    if (entry.status !== 'DRAFT' && entry.status !== 'REJECTED')
      return reply.status(409).send({ error: 'Relatório não está em rascunho' })

    const updated = await p.diaryEntry.update({ where: { id }, data: { status: 'PENDING' } })

    await (prisma as any).auditLog.create({
      data: {
        companyId:   req.companyId!,
        userId:      payload.sub,
        action:      'SUBMIT',
        entity:      'DiaryEntry',
        entityId:    id,
        entityName:  entry.reportNumber ?? id,
        description: `RDO ${entry.reportNumber ?? ''} enviado para aprovação`,
      },
    }).catch(() => null)

    return reply.send({ entry: updated })
  })

  // ── GET /api/v1/diary/projects/:projectId/rain — histórico pluviométrico ──
  app.get('/projects/:projectId/rain', { preHandler: [requirePermission('diario_obra', 'view')] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { projectId } = request.params as { projectId: string }
    const q = request.query as { startDate?: string; endDate?: string }

    const proj = await getProjectOfCompany(projectId, companyId)
    if (!proj) return reply.status(404).send({ error: 'Obra não encontrada' })

    const where: any = { projectId }
    if (q.startDate) where.date = { ...where.date, gte: new Date(q.startDate) }
    if (q.endDate)   where.date = { ...where.date, lte: new Date(q.endDate + 'T23:59:59') }

    const records = await p.diaryRainRecord.findMany({
      where,
      orderBy: { date: 'asc' },
    })

    // Sumariza
    const totalMm      = records.reduce((s: number, r: any) => s + r.totalMm, 0)
    const rainyDays    = records.filter((r: any) => r.totalMm > 0).length
    const unworkable   = records.filter((r: any) => r.isUnworkable).length
    const maxRainDay   = records.reduce((mx: any, r: any) => !mx || r.totalMm > mx.totalMm ? r : mx, null)

    // Resumo mensal
    const monthMap: Record<string, { totalMm: number; unworkableDays: number; rainyDays: number }> = {}
    for (const r of records) {
      const key = toDateStr(r.date).slice(0, 7)  // "yyyy-MM" — sem fuso horário
      if (!monthMap[key]) monthMap[key] = { totalMm: 0, unworkableDays: 0, rainyDays: 0 }
      monthMap[key].totalMm      += r.totalMm
      if (r.isUnworkable) monthMap[key].unworkableDays++
      if (r.totalMm > 0)  monthMap[key].rainyDays++
    }
    const averagePerMonth = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }))

    return reply.send({
      project: proj,
      records: records.map((r: any) => ({
        date:        r.date,
        totalMm:     r.totalMm,
        morningMm:   r.morningMm,
        afternoonMm: r.afternoonMm,
        nightMm:     r.nightMm,
        isUnworkable:r.isUnworkable,
        unworkableReason: r.unworkableReason,
      })),
      summary: {
        totalMm:       Math.round(totalMm * 10) / 10,
        rainyDays,
        unworkableDays:unworkable,
        maxRainDay:    maxRainDay ? { date: maxRainDay.date, totalMm: maxRainDay.totalMm } : null,
        averagePerMonth,
      },
    })
  })

  // ── GET /api/v1/diary/reports/:id/pdf — PDF do relatório ─────────────────
  app.get('/reports/:id/pdf', { preHandler: [requirePermission('diario_obra', 'view')] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id }    = request.params as { id: string }

    const entry = await p.diaryEntry.findFirst({
      where:   { id, project: { companyId } },
      include: {
        author:  { select: { name: true } },
        project: {
          include: { company: { select: { name: true, cnpj: true, logo: true, address: true, city: true, state: true } } },
        },
        stageEntries: { include: { stage: { select: { name: true, code: true } } } },
        occurrences:  true,
        rainRecord:   true,
      },
    })
    if (!entry) return reply.status(404).send({ error: 'Relatório não encontrado' })

    const proj    = entry.project
    const company = proj.company

    const html = buildDiaryPdfHtml(entry, proj, company)
    try {
      const pdfBuffer = await generatePdf({ kind: 'raw', html } as any)
      const filename = `RDO-${entry.reportNumber ?? id}-${proj.name.replace(/\s+/g,'-').toLowerCase()}.pdf`
      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(pdfBuffer)
    } catch (err) {
      request.log.error(err, 'PDF generation failed')
      return reply.status(500).send({ error: 'Falha ao gerar PDF' })
    }
  })

  // ── GET /api/v1/diary/projects/:projectId/rain-report — PDF pluviométrico ─
  app.get('/projects/:projectId/rain-report', { preHandler: [requirePermission('diario_obra', 'view')] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { projectId } = request.params as { projectId: string }
    const q = request.query as { startDate?: string; endDate?: string }

    const proj = await p.project.findFirst({
      where:   { id: projectId, companyId },
      include: { company: { select: { name: true, cnpj: true, logo: true } } },
    })
    if (!proj) return reply.status(404).send({ error: 'Obra não encontrada' })

    const where: any = { projectId }
    if (q.startDate) where.date = { ...where.date, gte: new Date(q.startDate) }
    if (q.endDate)   where.date = { ...where.date, lte: new Date(q.endDate + 'T23:59:59') }

    const records = await p.diaryRainRecord.findMany({ where, orderBy: { date: 'asc' } })
    const totalMm      = records.reduce((s: number, r: any) => s + r.totalMm, 0)
    const unworkable   = records.filter((r: any) => r.isUnworkable).length

    const html = buildRainReportHtml(proj, records, { totalMm, unworkable }, q.startDate, q.endDate)
    try {
      const pdfBuffer = await generatePdf({ kind: 'raw', html } as any)
      const filename = `relatorio-pluviometrico-${proj.name.replace(/\s+/g,'-').toLowerCase()}.pdf`
      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(pdfBuffer)
    } catch (err) {
      return reply.status(500).send({ error: 'Falha ao gerar PDF' })
    }
  })

  // ── GET /api/v1/diary/projects/:projectId/pdf/rain-chart — gráfico pluviométrico ─
  app.get('/projects/:projectId/pdf/rain-chart', { preHandler: [requirePermission('diario_obra', 'view')] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { projectId } = request.params as { projectId: string }
    const q = request.query as { startDate?: string; endDate?: string; period?: string }

    const proj = await p.project.findFirst({
      where:   { id: projectId, companyId },
      select:  { id: true, name: true, code: true },
    })
    if (!proj) return reply.status(404).send({ error: 'Obra não encontrada' })

    const where: any = { projectId }
    if (q.startDate) where.date = { ...where.date, gte: new Date(q.startDate) }
    if (q.endDate)   where.date = { ...where.date, lte: new Date(q.endDate + 'T23:59:59') }

    const records  = await p.diaryRainRecord.findMany({ where, orderBy: { date: 'asc' } })
    const totalMm  = records.reduce((s: number, r: any) => s + r.totalMm, 0)
    const unworkable = records.filter((r: any) => r.isUnworkable).length
    const rainyDays  = records.filter((r: any) => r.totalMm > 0).length
    const maxDay     = records.reduce((mx: any, r: any) => (!mx || r.totalMm > mx.totalMm) ? r : mx, null as any)

    const labels    = records.map((r: any) => {
      const d = toDateStr(r.date)   // "2026-05-27"
      const [, m, dd] = d.split('-')
      return `${dd}/${m}`           // "27/05" — sem fuso horário
    })
    const mmPorDia  = records.map((r: any) => r.totalMm)
    let acc = 0
    const acumulado = records.map((r: any) => { acc += r.totalMm; return Math.round(acc * 10) / 10 })

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; padding: 32px; background: white; color: #111; }
    h1 { font-size: 18px; font-weight: 800; color: #111827; margin-bottom: 4px; }
    .subtitle { color: #6B7280; font-size: 12px; margin-bottom: 24px; }
    .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .card { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px 16px; }
    .card-label { font-size: 11px; color: #6B7280; margin-bottom: 4px; text-transform: uppercase; letter-spacing: .04em; }
    .card-value { font-size: 20px; font-weight: 700; color: #111827; }
    .footer { margin-top: 20px; font-size: 10px; color: #9CA3AF; text-align: right; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
</head>
<body>
  <h1>Relatório Pluviométrico — ${proj.name}${proj.code ? ' (' + proj.code + ')' : ''}</h1>
  <p class="subtitle">Período: ${q.startDate ? new Date(q.startDate).toLocaleDateString('pt-BR') : 'início'} a ${q.endDate ? new Date(q.endDate).toLocaleDateString('pt-BR') : 'hoje'} · Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>

  <div class="cards">
    <div class="card"><div class="card-label">Acumulado total</div><div class="card-value">${Math.round(totalMm * 10) / 10} mm</div></div>
    <div class="card"><div class="card-label">Dias com chuva</div><div class="card-value">${rainyDays}</div></div>
    <div class="card"><div class="card-label">Dias impraticáveis</div><div class="card-value" style="color:${unworkable > 0 ? '#dc2626' : '#111'}">${unworkable}</div></div>
    <div class="card"><div class="card-label">Maior evento</div><div class="card-value">${maxDay ? maxDay.totalMm.toFixed(1) + ' mm' : '—'}</div></div>
  </div>

  <canvas id="chart" width="900" height="380"></canvas>

  <script>
    const ctx = document.getElementById('chart')
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(labels)},
        datasets: [
          {
            type: 'bar',
            label: 'Precipitação (mm)',
            data: ${JSON.stringify(mmPorDia)},
            backgroundColor: ${JSON.stringify(records.map((r: any) => r.isUnworkable ? '#ef4444' : '#3b82f6'))},
            borderRadius: 3,
            yAxisID: 'y'
          },
          {
            type: 'line',
            label: 'Acumulado (mm)',
            data: ${JSON.stringify(acumulado)},
            borderColor: '#F5A623',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 2,
            tension: 0.3,
            yAxisID: 'y2'
          }
        ]
      },
      options: {
        responsive: false,
        animation: false,
        plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
        scales: {
          y:  { beginAtZero: true, title: { display: true, text: 'mm' }, ticks: { font: { size: 10 } } },
          y2: { beginAtZero: true, position: 'right', title: { display: true, text: 'acum. mm' }, grid: { drawOnChartArea: false }, ticks: { font: { size: 10 } } },
          x:  { ticks: { font: { size: 9 }, maxRotation: 45 } }
        }
      }
    })
  </script>
  <p class="footer">Documento gerado pelo SYSOBRA · ${proj.name}</p>
</body>
</html>`

    try {
      const pdfBuffer = await generatePdf({ kind: 'raw', html } as any)
      const filename  = `pluviometrico-grafico-${proj.name.replace(/\s+/g, '-').toLowerCase()}.pdf`
      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(pdfBuffer)
    } catch (err) {
      return reply.status(500).send({ error: 'Falha ao gerar PDF do gráfico' })
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // ROTAS LEGADAS — mantidas para compatibilidade
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /api/v1/diary/entries ─────────────────────────────────────────────
  app.get('/entries', { preHandler: [requirePermission('diario_obra', 'view')] }, async (request, reply) => {
    const req = request as RequestWithMember
    const { projectId, page = '1', limit = '20' } = request.query as { projectId?: string; page?: string; limit?: string }

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const take = parseInt(limit)
    const where: any = { project: { companyId: req.companyId } }
    if (projectId) where.projectId = projectId

    if (req.memberRole === 'EXTERNAL' || req.memberRole === 'CLIENT') {
      const accessibleIds = await getAccessibleProjectIds(req.memberId)
      if (!accessibleIds.length) return reply.send({ entries: [], total: 0 })
      where.projectId = projectId
        ? accessibleIds.includes(projectId) ? projectId : undefined
        : { in: accessibleIds }
      if (where.projectId === undefined) return reply.send({ entries: [], total: 0 })
    }

    const [entries, total] = await Promise.all([
      p.diaryEntry.findMany({
        where,
        include: {
          author:     { select: { id: true, name: true, avatarUrl: true } },
          approvedBy: { select: { id: true, name: true } },
          project:    { select: { id: true, name: true } },
          _count:     { select: { comments: true } },
        },
        orderBy: { date: 'desc' },
        skip, take,
      }),
      p.diaryEntry.count({ where }),
    ])

    return reply.send({ entries, total, page: parseInt(page), limit: take })
  })

  // ── POST /api/v1/diary/entries — criar (legacy) ────────────────────────────
  app.post('/entries', { preHandler: [requirePermission('diario_obra', 'create')] }, async (request, reply) => {
    const req     = request as RequestWithMember
    const payload = request.user as JwtPayload
    const body    = request.body as any

    if (!body.projectId) return reply.status(400).send({ error: 'projectId é obrigatório' })

    const project = await getProjectOfCompany(body.projectId, req.companyId)
    if (!project) return reply.status(404).send({ error: 'Obra não encontrada' })

    const entry = await p.diaryEntry.create({
      data: {
        projectId:    body.projectId,
        authorId:     payload.sub,
        date:         body.date ? parseDateParam(body.date) : parseDateParam(toDateStr(new Date())),
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
  })

  // ── GET /api/v1/diary/entries/:id ─────────────────────────────────────────
  app.get('/entries/:id', { preHandler: [requirePermission('diario_obra', 'view')] }, async (request, reply) => {
    const req            = request as RequestWithMember
    const { id }         = request.params as { id: string }
    const isInternal     = req.memberType === 'INTERNAL'

    const entry = await p.diaryEntry.findFirst({
      where: { id, project: { companyId: req.companyId } },
      include: {
        author:     { select: { id: true, name: true, avatarUrl: true } },
        approvedBy: { select: { id: true, name: true } },
        project:    { select: { id: true, name: true, stages: { orderBy: { order: 'asc' } } } },
        comments: {
          where:   isInternal ? {} : { isInternal: false },
          include: { author: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        stageEntries: {
          include: { stage: { select: { id: true, name: true, progressPercent: true, status: true } } },
          orderBy: { createdAt: 'asc' },
        },
        occurrences: { orderBy: { createdAt: 'asc' } },
        rainRecord:  true,
      },
    })
    if (!entry) return reply.status(404).send({ error: 'Registro não encontrado' })
    return reply.send({ entry })
  })

  // ── PUT /api/v1/diary/entries/:id ─────────────────────────────────────────
  app.put('/entries/:id', { preHandler: [requirePermission('diario_obra', 'edit')] }, async (request, reply) => {
    const req     = request as RequestWithMember
    const payload = request.user as JwtPayload
    const { id }  = request.params as { id: string }
    const body    = request.body as any

    const entry = await p.diaryEntry.findFirst({ where: { id, project: { companyId: req.companyId } } })
    if (!entry) return reply.status(404).send({ error: 'Registro não encontrado' })

    const isAdminLike = (req.permissions as any).all === true || req.memberRole === 'MANAGER'
    const isOwnEntry  = entry.authorId === payload.sub

    if (!isAdminLike && !isOwnEntry) return reply.status(403).send({ error: 'Você só pode editar seus próprios registros' })
    if (!isAdminLike && entry.status === 'APPROVED') return reply.status(409).send({ error: 'Não é possível editar um registro já aprovado' })

    // Recalcula chuva
    const mMm = body.rainMorningMm   ?? entry.rainMorningMm   ?? 0
    const aMm = body.rainAfternoonMm ?? entry.rainAfternoonMm ?? 0
    const nMm = body.rainNightMm     ?? entry.rainNightMm     ?? 0
    const cfg = await getDiaryConfig(req.companyId!)
    const { total: totalRainMm, suggested } = calcRain(mMm, aMm, nMm, cfg.rainThreshold)

    const updated = await p.diaryEntry.update({
      where: { id },
      data: {
        ...(body.date         && { date: parseDateParam(body.date) }),
        // Clima legado
        ...(body.weather      !== undefined && { weather:      body.weather }),
        ...(body.temperature  !== undefined && { temperature:  body.temperature }),
        ...(body.workers      !== undefined && { workers:      body.workers }),
        ...(body.activities   !== undefined && { activities:   body.activities }),
        ...(body.observations !== undefined && { observations: body.observations }),
        // Clima rico
        ...(body.weatherMorning   !== undefined && { weatherMorning:   body.weatherMorning   }),
        ...(body.weatherAfternoon !== undefined && { weatherAfternoon: body.weatherAfternoon }),
        ...(body.weatherNight     !== undefined && { weatherNight:     body.weatherNight     }),
        rainMorningMm:        mMm,
        rainAfternoonMm:      aMm,
        rainNightMm:          nMm,
        totalRainMm,
        ...(body.workableMorning   !== undefined && { workableMorning:   body.workableMorning   }),
        ...(body.workableAfternoon !== undefined && { workableAfternoon: body.workableAfternoon }),
        ...(body.workableNight     !== undefined && { workableNight:     body.workableNight     }),
        ...(body.unworkableConfirmedBy !== undefined && { unworkableConfirmedBy: body.unworkableConfirmedBy }),
        suggestedUnworkable: suggested,
        // Conteúdo rico
        ...(body.generalActivities !== undefined && { generalActivities: body.generalActivities }),
        ...(body.generalNotes      !== undefined && { generalNotes:      body.generalNotes      }),
        ...(body.notesPublic       !== undefined && { notesPublic:       body.notesPublic       }),
        // DDS
        ...(body.ddsTheme !== undefined && { ddsTheme: body.ddsTheme }),
        ...(body.ddsDone  !== undefined && { ddsDone:  body.ddsDone  }),
        ...(body.ddsTime  !== undefined && { ddsTime: body.ddsTime ? new Date(body.ddsTime) : null }),
        // Mídias
        ...(body.imageUrls !== undefined && { imageUrls: body.imageUrls }),
        // Status
        ...(body.status !== undefined ? { status: body.status } : { status: 'DRAFT' as any }),
        updatedBy: payload.sub,
      },
      include: {
        author:       { select: { id: true, name: true, avatarUrl: true } },
        project:      { select: { id: true, name: true } },
        stageEntries: { include: { stage: { select: { id: true, name: true } } } },
        occurrences:  true,
      },
    })

    // Atualiza stageEntries se fornecidas
    if (Array.isArray(body.stageEntries)) {
      // Remove entradas antigas e recria
      await p.diaryStageEntry.deleteMany({ where: { diaryId: id } })
      for (const se of body.stageEntries) {
        const delta = se.currentProgress - se.previousProgress
        await p.diaryStageEntry.create({
          data: {
            diaryId:          id,
            stageId:          se.stageId,
            previousProgress: se.previousProgress,
            currentProgress:  se.currentProgress,
            progressDelta:    delta,
            activities:       se.activities ?? '',
            comments:         se.comments   ?? null,
          },
        })
        await p.projectStage.update({
          where: { id: se.stageId },
          data:  { progressPercent: Math.min(100, Math.max(0, se.currentProgress)) },
        })
      }
      await recalcProjectProgress(entry.projectId)
    }

    // Atualiza ocorrências se fornecidas
    if (Array.isArray(body.occurrences)) {
      await p.diaryOccurrence.deleteMany({ where: { diaryId: id } })
      for (const occ of body.occurrences.filter((o: any) => o.description?.trim())) {
        await p.diaryOccurrence.create({
          data: {
            diaryId:        id,
            type:           occ.type        ?? 'OTHER',
            severity:       occ.severity    ?? 'LOW',
            description:    occ.description,
            action:         occ.action      ?? null,
            responsible:    occ.responsible ?? null,
            visitorName:    occ.visitorName    ?? null,
            visitorCompany: occ.visitorCompany ?? null,
            notifyManager:  occ.notifyManager  ?? false,
          },
        })
      }
    }

    // Atualiza registro pluviométrico
    const isUnworkable = !(body.workableMorning ?? entry.workableMorning ?? true)
      || !(body.workableAfternoon ?? entry.workableAfternoon ?? true)
      || !(body.workableNight     ?? entry.workableNight     ?? true)
    const existingRain = await p.diaryRainRecord.findUnique({ where: { diaryId: id } })
    if (existingRain) {
      await p.diaryRainRecord.update({
        where: { diaryId: id },
        data: {
          morningMm:   mMm,
          afternoonMm: aMm,
          nightMm:     nMm,
          totalMm:     totalRainMm,
          isUnworkable,
          unworkableReason: isUnworkable ? (body.unworkableConfirmedBy ?? null) : null,
        },
      })
    }

    // Audit log
    await (prisma as any).auditLog.create({
      data: {
        companyId:   req.companyId!,
        userId:      payload.sub,
        action:      'UPDATE',
        entity:      'DiaryEntry',
        entityId:    id,
        entityName:  entry.reportNumber ?? id,
        description: `RDO ${entry.reportNumber ?? ''} atualizado`,
      },
    }).catch(() => null)

    return reply.send({ entry: updated })
  })

  // ── DELETE /api/v1/diary/entries/:id ──────────────────────────────────────
  app.delete('/entries/:id', { preHandler: [requirePermission('diario_obra', 'delete')] }, async (request, reply) => {
    const req     = request as RequestWithMember
    const payload = request.user as JwtPayload
    const { id }  = request.params as { id: string }

    const entry = await p.diaryEntry.findFirst({ where: { id, project: { companyId: req.companyId } } })
    if (!entry) return reply.status(404).send({ error: 'Registro não encontrado' })

    const isAdminLike = (req.permissions as any).all === true
    const isOwnEntry  = entry.authorId === payload.sub
    if (!isAdminLike && !isOwnEntry) return reply.status(403).send({ error: 'Sem permissão para excluir este registro' })

    await p.diaryEntry.delete({ where: { id } })
    return reply.send({ success: true })
  })

  // ── POST /api/v1/diary/entries/:id/approve ────────────────────────────────
  app.post('/entries/:id/approve', { preHandler: [requirePermission('diario_obra', 'approve')] }, async (request, reply) => {
    const req     = request as RequestWithMember
    const payload = request.user as JwtPayload
    const { id }  = request.params as { id: string }

    const entry = await p.diaryEntry.findFirst({ where: { id, project: { companyId: req.companyId } } })
    if (!entry) return reply.status(404).send({ error: 'Registro não encontrado' })
    if (entry.status !== 'PENDING') return reply.status(409).send({ error: `Registro já está ${entry.status === 'APPROVED' ? 'aprovado' : 'rejeitado'}` })

    const updated = await p.diaryEntry.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: payload.sub, approvedAt: new Date(), rejectionNote: null },
    })

    await (prisma as any).auditLog.create({
      data: {
        companyId:   req.companyId!,
        userId:      payload.sub,
        action:      'APPROVE',
        entity:      'DiaryEntry',
        entityId:    id,
        entityName:  entry.reportNumber ?? id,
        description: `Registro ${entry.reportNumber ?? ''} aprovado`,
      },
    }).catch(() => null)

    return reply.send({ entry: updated })
  })

  // ── POST /api/v1/diary/entries/:id/reject ────────────────────────────────
  app.post('/entries/:id/reject', { preHandler: [requirePermission('diario_obra', 'approve')] }, async (request, reply) => {
    const req  = request as RequestWithMember
    const payload = request.user as JwtPayload
    const { id } = request.params as { id: string }
    const { rejectionNote } = request.body as { rejectionNote?: string }

    if (!rejectionNote?.trim()) return reply.status(400).send({ error: 'rejectionNote é obrigatório ao rejeitar um registro' })

    const entry = await p.diaryEntry.findFirst({ where: { id, project: { companyId: req.companyId } } })
    if (!entry) return reply.status(404).send({ error: 'Registro não encontrado' })
    if (entry.status !== 'PENDING') return reply.status(409).send({ error: 'Registro não está pendente' })

    const updated = await p.diaryEntry.update({ where: { id }, data: { status: 'REJECTED', rejectionNote: rejectionNote.trim() } })

    await (prisma as any).auditLog.create({
      data: {
        companyId:   req.companyId!,
        userId:      payload.sub,
        action:      'REJECT',
        entity:      'DiaryEntry',
        entityId:    id,
        entityName:  entry.reportNumber ?? id,
        description: `Registro ${entry.reportNumber ?? ''} devolvido`,
        metadata:    { note: rejectionNote.trim() },
      },
    }).catch(() => null)

    return reply.send({ entry: updated })
  })

  // ── POST /api/v1/diary/entries/:id/comments ───────────────────────────────
  app.post('/entries/:id/comments', { preHandler: [requirePermission('diario_obra', 'comment')] }, async (request, reply) => {
    const req     = request as RequestWithMember
    const payload = request.user as JwtPayload
    const { id }  = request.params as { id: string }
    const { content, isInternal = false } = request.body as { content?: string; isInternal?: boolean }

    if (!content?.trim()) return reply.status(400).send({ error: 'content é obrigatório' })

    const entry = await p.diaryEntry.findFirst({ where: { id, project: { companyId: req.companyId } } })
    if (!entry) return reply.status(404).send({ error: 'Registro não encontrado' })

    const authorType     = req.memberType as 'INTERNAL' | 'EXTERNAL' | 'CLIENT'
    const actualInternal = authorType === 'INTERNAL' ? isInternal : false
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { name: true } })

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

    await (prisma as any).auditLog.create({
      data: {
        companyId:   req.companyId!,
        userId:      payload.sub,
        action:      'COMMENT',
        entity:      'DiaryEntry',
        entityId:    id,
        entityName:  entry.reportNumber ?? id,
        description: `Comentário adicionado ao RDO ${entry.reportNumber ?? ''}`,
        metadata:    { isInternal: actualInternal, preview: content.trim().slice(0, 80) },
      },
    }).catch(() => null)

    return reply.status(201).send({ comment })
  })

  // ── GET /api/v1/diary/settings ────────────────────────────────────────────
  app.get('/settings', { preHandler: [requirePermission('diario_obra', 'view')] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const cfg = await getDiaryConfig(companyId)
    return reply.send({ settings: cfg })
  })

  // ── PUT /api/v1/diary/settings ────────────────────────────────────────────
  app.put('/settings', { preHandler: [requirePermission('diario_obra', 'edit')] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const body      = request.body as Partial<DiaryConfig>

    // Valida valores
    const current = await getDiaryConfig(companyId)
    const updated: DiaryConfig = {
      rainThreshold:     typeof body.rainThreshold     === 'number' ? Math.max(0, body.rainThreshold)   : current.rainThreshold,
      requireClimate:    typeof body.requireClimate    === 'boolean' ? body.requireClimate    : current.requireClimate,
      requireActivities: typeof body.requireActivities === 'boolean' ? body.requireActivities : current.requireActivities,
      notifyOnSubmit:    typeof body.notifyOnSubmit    === 'boolean' ? body.notifyOnSubmit    : current.notifyOnSubmit,
      notifyOnApprove:   typeof body.notifyOnApprove   === 'boolean' ? body.notifyOnApprove   : current.notifyOnApprove,
      notifyOnReject:    typeof body.notifyOnReject    === 'boolean' ? body.notifyOnReject    : current.notifyOnReject,
    }

    await prisma.companyAddon.upsert({
      where:  { companyId_addonKey: { companyId, addonKey: DIARY_ADDON_KEY } },
      update: { config: updated as any, isEnabled: true },
      create: { companyId, addonKey: DIARY_ADDON_KEY, isEnabled: true, config: updated as any },
    })

    return reply.send({ settings: updated })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // DDS — Diálogo Diário de Segurança
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /api/v1/diary/dds — listar DDS disponíveis ───────────────────────
  app.get('/dds', { preHandler: [requirePermission('diario_obra', 'view')] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const q = request.query as { category?: string; search?: string; page?: string; limit?: string }

    const page  = Math.max(1, parseInt(q.page  ?? '1',  10))
    const limit = Math.min(100, parseInt(q.limit ?? '50', 10))

    const where: any = {
      isActive: true,
      OR: [{ companyId: null }, { companyId }],
    }
    if (q.category) where.category = q.category
    if (q.search) {
      where.AND = [{
        OR: [
          { title:   { contains: q.search, mode: 'insensitive' } },
          { tags:    { has: q.search.toLowerCase() } },
        ],
      }]
    }

    const [themes, total] = await Promise.all([
      p.ddsTheme.findMany({
        where,
        orderBy: [{ companyId: 'asc' }, { category: 'asc' }, { order: 'asc' }, { title: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, title: true, category: true, tags: true,
          duration: true, order: true, companyId: true, isActive: true,
          createdAt: true,
        },
      }),
      p.ddsTheme.count({ where }),
    ])

    return reply.send({ themes, total, page, limit })
  })

  // ── GET /api/v1/diary/dds/today — DDS sugerido do dia ────────────────────
  app.get('/dds/today', { preHandler: [requirePermission('diario_obra', 'view')] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!

    // Total de DDS disponíveis para esta empresa
    const allThemes = await p.ddsTheme.findMany({
      where:   { isActive: true, OR: [{ companyId: null }, { companyId }] },
      orderBy: [{ companyId: 'asc' }, { category: 'asc' }, { order: 'asc' }],
      select:  { id: true, title: true, category: true, tags: true, duration: true, content: true, companyId: true },
    })

    if (!allThemes.length) return reply.status(404).send({ error: 'Nenhum DDS disponível' })

    // Seleciona pelo dia do ano (1-365) para rotação determinística
    const now    = new Date()
    const start  = new Date(now.getFullYear(), 0, 0)
    const diff   = now.getTime() - start.getTime()
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24))
    const idx    = (dayOfYear - 1) % allThemes.length

    const theme = allThemes[idx]
    return reply.send({ theme, dayOfYear, total: allThemes.length })
  })

  // ── GET /api/v1/diary/dds/:id — detalhe completo ─────────────────────────
  app.get('/dds/:id', { preHandler: [requirePermission('diario_obra', 'view')] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id }    = request.params as { id: string }

    const theme = await p.ddsTheme.findFirst({
      where: { id, OR: [{ companyId: null }, { companyId }] },
    })
    if (!theme) return reply.status(404).send({ error: 'DDS não encontrado' })
    return reply.send({ theme })
  })

  // ── POST /api/v1/diary/dds — criar DDS da empresa ────────────────────────
  app.post('/dds', { preHandler: [requirePermission('diario_obra', 'create')] }, async (request, reply) => {
    const req     = request as RequestWithMember
    const payload = request.user as JwtPayload
    const companyId = req.companyId!
    const body = request.body as {
      title: string; content: string; category?: string
      tags?: string[]; duration?: number; order?: number
    }

    if (!body.title?.trim())   return reply.status(400).send({ error: 'title é obrigatório' })
    if (!body.content?.trim()) return reply.status(400).send({ error: 'content é obrigatório' })

    const theme = await p.ddsTheme.create({
      data: {
        companyId,
        title:       body.title.trim(),
        content:     body.content.trim(),
        category:    body.category ?? 'OTHER',
        tags:        body.tags     ?? [],
        duration:    body.duration ?? 15,
        order:       body.order    ?? 0,
        createdById: payload.sub,
      },
    })
    return reply.status(201).send({ theme })
  })

  // ── PUT /api/v1/diary/dds/:id — editar DDS da empresa ────────────────────
  app.put('/dds/:id', { preHandler: [requirePermission('diario_obra', 'edit')] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id }    = request.params as { id: string }
    const body      = request.body as any

    const theme = await p.ddsTheme.findFirst({ where: { id, companyId } })
    if (!theme) return reply.status(404).send({ error: 'DDS não encontrado ou não pertence à sua empresa' })

    const updated = await p.ddsTheme.update({
      where: { id },
      data: {
        ...(body.title    !== undefined && { title:    body.title.trim() }),
        ...(body.content  !== undefined && { content:  body.content.trim() }),
        ...(body.category !== undefined && { category: body.category }),
        ...(body.tags     !== undefined && { tags:     body.tags }),
        ...(body.duration !== undefined && { duration: body.duration }),
        ...(body.order    !== undefined && { order:    body.order }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    })
    return reply.send({ theme: updated })
  })

  // ── DELETE /api/v1/diary/dds/:id — desativar DDS da empresa ──────────────
  app.delete('/dds/:id', { preHandler: [requirePermission('diario_obra', 'delete')] }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id }    = request.params as { id: string }

    const theme = await p.ddsTheme.findFirst({ where: { id, companyId } })
    if (!theme) return reply.status(404).send({ error: 'DDS não encontrado ou não pertence à sua empresa' })

    // Soft delete — desativa
    await p.ddsTheme.update({ where: { id }, data: { isActive: false } })
    return reply.send({ success: true })
  })

  // ── DELETE /api/v1/diary/comments/:commentId ─────────────────────────────
  app.delete('/comments/:commentId', { preHandler: [requirePermission('diario_obra', 'comment')] }, async (request, reply) => {
    const req     = request as RequestWithMember
    const payload = request.user as JwtPayload
    const { commentId } = request.params as { commentId: string }

    const comment = await prisma.diaryComment.findUnique({
      where:   { id: commentId },
      include: { diaryEntry: { select: { project: { select: { companyId: true } } } } },
    })
    if (!comment) return reply.status(404).send({ error: 'Comentário não encontrado' })
    if (comment.diaryEntry.project.companyId !== req.companyId) return reply.status(404).send({ error: 'Comentário não encontrado' })

    const isAdmin = (req.permissions as any).all === true
    if (!isAdmin && comment.authorId !== payload.sub) return reply.status(403).send({ error: 'Sem permissão para excluir este comentário' })

    await prisma.diaryComment.delete({ where: { id: commentId } })
    return reply.send({ success: true })
  })
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

async function recalcProjectProgress(projectId: string) {
  const stages = await p.projectStage.findMany({
    where:  { projectId },
    select: { budgetTotal: true, progressPercent: true },
  })
  const totalBudget = stages.reduce((a: number, s: any) => a + Number(s.budgetTotal), 0)
  const weighted    = totalBudget > 0
    ? stages.reduce((a: number, s: any) => a + Number(s.progressPercent) * Number(s.budgetTotal), 0) / totalBudget
    : stages.length > 0
      ? stages.reduce((a: number, s: any) => a + Number(s.progressPercent), 0) / stages.length
      : 0
  await p.project.update({
    where: { id: projectId },
    data:  { progressPercent: Math.min(100, Math.round(weighted * 100) / 100) },
  })
}

// ─── Templates HTML para PDF ──────────────────────────────────────────────────

const WEATHER_LABEL: Record<string, string> = {
  SUNNY: '☀️ Ensolarado', CLOUDY: '🌤 Nublado', OVERCAST: '☁️ Encoberto',
  RAINY: '🌧 Chuvoso',    STORMY: '⛈ Tempestade',
}
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho', PENDING: 'Aguardando aprovação', APPROVED: 'Aprovado', REJECTED: 'Devolvido',
}

function buildDiaryPdfHtml(entry: any, proj: any, company: any): string {
  const fmtCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtDate     = (d: Date | string) => new Date(d).toLocaleDateString('pt-BR')
  const genAt       = new Date().toLocaleString('pt-BR')

  const logoBlock = company?.logo
    ? `<img src="${company.logo}" alt="Logo" style="height:40px;object-fit:contain;" />`
    : `<span style="font-size:20px;font-weight:800;color:#1d4ed8;">${company?.name ?? 'SYSOBRA'}</span>`

  const weatherRow = (period: string, cond: string | null, rain: number, workable: boolean) => `
    <tr>
      <td style="padding:6px 8px;font-weight:600;">${period}</td>
      <td style="padding:6px 8px;">${cond ? (WEATHER_LABEL[cond] ?? cond) : '—'}</td>
      <td style="padding:6px 8px;text-align:right;">${rain > 0 ? rain + ' mm' : '—'}</td>
      <td style="padding:6px 8px;text-align:center;">
        <span style="padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;background:${workable ? '#dcfce7' : '#fee2e2'};color:${workable ? '#16a34a' : '#dc2626'};">
          ${workable ? 'Praticável' : 'Impraticável'}
        </span>
      </td>
    </tr>`

  const stageRows = (entry.stageEntries ?? []).map((se: any, i: number) => `
    <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
      <td style="padding:6px 8px;">${se.stage?.name ?? '—'}</td>
      <td style="padding:6px 8px;text-align:right;">${se.previousProgress?.toFixed(1) ?? 0}%</td>
      <td style="padding:6px 8px;text-align:right;font-weight:600;">${se.currentProgress?.toFixed(1) ?? 0}%</td>
      <td style="padding:6px 8px;text-align:right;color:${se.progressDelta>=0?'#16a34a':'#dc2626'};">${se.progressDelta>=0?'+':''}${se.progressDelta?.toFixed(1) ?? 0}%</td>
      <td style="padding:6px 8px;font-size:11px;">${se.activities || '—'}</td>
    </tr>`).join('')

  const occurrenceRows = (entry.occurrences ?? []).map((o: any, i: number) => `
    <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
      <td style="padding:6px 8px;font-size:11px;">${o.type}</td>
      <td style="padding:6px 8px;font-size:11px;">${o.severity}</td>
      <td style="padding:6px 8px;font-size:11px;">${o.description}</td>
      <td style="padding:6px 8px;font-size:11px;">${o.action || '—'}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>RDO ${entry.reportNumber ?? ''} — ${proj?.name ?? ''}</title>
<style>
* { box-sizing:border-box;margin:0;padding:0; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;font-size:13px; }
@page { size:A4;margin:18mm; }
table { border-collapse:collapse;width:100%; }
th { background:#1d4ed8;color:#fff;padding:7px 8px;font-size:11px;text-align:left; }
td { border-bottom:1px solid #f3f4f6;vertical-align:top; }
h2 { font-size:13px;color:#1d4ed8;margin:20px 0 8px;padding-bottom:4px;border-bottom:2px solid #dbeafe; }
.footer { margin-top:24px;padding-top:10px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:10px;display:flex;justify-content:space-between; }
</style></head><body>

<table style="margin-bottom:18px;">
  <tr>
    <td style="width:55%;">${logoBlock}
      <div style="font-size:10px;color:#6b7280;margin-top:4px;">${company?.name ?? ''} ${company?.cnpj ? '— CNPJ: '+company.cnpj : ''}</div>
    </td>
    <td style="text-align:right;vertical-align:top;">
      <div style="font-size:17px;font-weight:700;color:#1d4ed8;">RELATÓRIO DIÁRIO DE OBRA</div>
      <div style="font-size:14px;font-weight:700;color:#374151;">RDO Nº ${entry.reportNumber ?? '—'}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px;">Data: <strong>${fmtDate(entry.date)}</strong></div>
      <div style="font-size:11px;color:#6b7280;">Responsável: <strong>${entry.author?.name ?? '—'}</strong></div>
      <div style="margin-top:4px;">
        <span style="background:${entry.status==='APPROVED'?'#dcfce7':entry.status==='REJECTED'?'#fee2e2':'#fef3c7'};color:${entry.status==='APPROVED'?'#16a34a':entry.status==='REJECTED'?'#dc2626':'#d97706'};padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;">
          ${STATUS_LABEL[entry.status] ?? entry.status}
        </span>
      </div>
    </td>
  </tr>
</table>

<h2>1. Identificação da Obra</h2>
<table><tbody>
  <tr><td style="padding:5px 8px;width:30%;color:#6b7280;">Obra</td><td style="padding:5px 8px;font-weight:600;">${proj?.name ?? '—'}</td><td style="padding:5px 8px;width:20%;color:#6b7280;">Código</td><td style="padding:5px 8px;">${proj?.code ?? '—'}</td></tr>
  <tr><td style="padding:5px 8px;color:#6b7280;">Endereço</td><td colspan="3" style="padding:5px 8px;">${[proj?.address, proj?.city, proj?.state].filter(Boolean).join(', ') || '—'}</td></tr>
  <tr><td style="padding:5px 8px;color:#6b7280;">Cliente</td><td style="padding:5px 8px;">${proj?.client?.name ?? '—'}</td><td style="padding:5px 8px;color:#6b7280;">Responsável</td><td style="padding:5px 8px;">${proj?.responsible?.name ?? '—'}</td></tr>
</tbody></table>

<h2>2. Condições Climáticas</h2>
<table><thead><tr><th>Período</th><th>Condição</th><th class="right" style="text-align:right;">Chuva (mm)</th><th style="text-align:center;">Praticabilidade</th></tr></thead>
<tbody>
  ${weatherRow('Manhã',  entry.weatherMorning,   Number(entry.rainMorningMm   ?? 0), entry.workableMorning   !== false)}
  ${weatherRow('Tarde',  entry.weatherAfternoon, Number(entry.rainAfternoonMm ?? 0), entry.workableAfternoon !== false)}
  ${weatherRow('Noite',  entry.weatherNight,     Number(entry.rainNightMm     ?? 0), entry.workableNight     !== false)}
  <tr style="background:#f9fafb;font-weight:700;"><td colspan="2" style="padding:6px 8px;">Total do dia</td><td style="padding:6px 8px;text-align:right;">${Number(entry.totalRainMm ?? 0)} mm</td><td></td></tr>
</tbody></table>

${(entry.stageEntries ?? []).length > 0 ? `
<h2>3. Progresso por Etapa</h2>
<table><thead><tr><th>Etapa</th><th style="text-align:right;">Anterior</th><th style="text-align:right;">Atual</th><th style="text-align:right;">Evolução</th><th>Atividades</th></tr></thead>
<tbody>${stageRows}</tbody></table>` : ''}

${entry.generalActivities ? `<h2>4. Atividades Gerais</h2><div style="background:#f9fafb;padding:10px 12px;border-radius:6px;font-size:12px;line-height:1.6;">${entry.generalActivities}</div>` : ''}

${(entry.occurrences ?? []).length > 0 ? `
<h2>5. Ocorrências</h2>
<table><thead><tr><th>Tipo</th><th>Severidade</th><th>Descrição</th><th>Providência</th></tr></thead>
<tbody>${occurrenceRows}</tbody></table>` : ''}

${entry.generalNotes ? `<h2>6. Observações Gerais</h2><div style="background:#fffbeb;padding:10px 12px;border-radius:6px;font-size:12px;line-height:1.6;">${entry.generalNotes}</div>` : ''}

<div class="footer">
  <span>Gerado pelo <strong>SYSOBRA</strong> em ${genAt}</span>
  <span>${company?.name ?? 'SYSOBRA'}</span>
</div>
</body></html>`
}

function buildRainReportHtml(proj: any, records: any[], summary: any, startDate?: string, endDate?: string): string {
  const company = proj.company
  const genAt   = new Date().toLocaleString('pt-BR')
  const logoBlock = company?.logo
    ? `<img src="${company.logo}" alt="Logo" style="height:36px;object-fit:contain;" />`
    : `<span style="font-size:18px;font-weight:800;color:#1d4ed8;">${company?.name ?? 'SYSOBRA'}</span>`

  const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString('pt-BR')

  const rows = records.map((r: any, i: number) => `
    <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
      <td style="padding:6px 8px;">${fmtDate(r.date)}</td>
      <td style="padding:6px 8px;text-align:right;">${r.morningMm > 0 ? r.morningMm+' mm' : '—'}</td>
      <td style="padding:6px 8px;text-align:right;">${r.afternoonMm > 0 ? r.afternoonMm+' mm' : '—'}</td>
      <td style="padding:6px 8px;text-align:right;">${r.nightMm > 0 ? r.nightMm+' mm' : '—'}</td>
      <td style="padding:6px 8px;text-align:right;font-weight:600;">${r.totalMm} mm</td>
      <td style="padding:6px 8px;text-align:center;"><span style="padding:2px 6px;border-radius:99px;font-size:10px;font-weight:600;background:${r.isUnworkable?'#fee2e2':'#dcfce7'};color:${r.isUnworkable?'#dc2626':'#16a34a'};">${r.isUnworkable?'Impraticável':'Praticável'}</span></td>
    </tr>`).join('')

  const periodLabel = startDate && endDate
    ? `${new Date(startDate).toLocaleDateString('pt-BR')} a ${new Date(endDate).toLocaleDateString('pt-BR')}`
    : 'Todo o período'

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Relatório Pluviométrico — ${proj.name}</title>
<style>
* { box-sizing:border-box;margin:0;padding:0; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;font-size:13px; }
@page { size:A4;margin:18mm; }
table { border-collapse:collapse;width:100%; }
th { background:#1d4ed8;color:#fff;padding:7px 8px;font-size:11px;text-align:left; }
td { border-bottom:1px solid #f3f4f6;vertical-align:top; }
h2 { font-size:13px;color:#1d4ed8;margin:18px 0 8px;padding-bottom:4px;border-bottom:2px solid #dbeafe; }
.card { background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:12px; }
.footer { margin-top:24px;padding-top:10px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:10px;display:flex;justify-content:space-between; }
</style></head><body>

<table style="margin-bottom:18px;">
  <tr>
    <td style="width:55%;">${logoBlock}</td>
    <td style="text-align:right;vertical-align:top;">
      <div style="font-size:16px;font-weight:700;color:#1d4ed8;">RELATÓRIO PLUVIOMÉTRICO</div>
      <div style="font-size:12px;color:#374151;margin-top:4px;">Obra: <strong>${proj.name}</strong> ${proj.code ? '('+proj.code+')' : ''}</div>
      <div style="font-size:11px;color:#6b7280;">Período: ${periodLabel}</div>
    </td>
  </tr>
</table>

<h2>Resumo Executivo</h2>
<table><tbody>
  <tr><td style="padding:6px 8px;width:35%;color:#6b7280;">Total de precipitação</td><td style="padding:6px 8px;font-weight:700;font-size:15px;">${Math.round(summary.totalMm * 10) / 10} mm</td></tr>
  <tr><td style="padding:6px 8px;color:#6b7280;">Dias com chuva (> 0mm)</td><td style="padding:6px 8px;">${records.filter((r: any) => r.totalMm > 0).length} dias</td></tr>
  <tr><td style="padding:6px 8px;color:#6b7280;">Dias impraticáveis</td><td style="padding:6px 8px;font-weight:600;color:#dc2626;">${summary.unworkable} dias</td></tr>
  <tr><td style="padding:6px 8px;color:#6b7280;">Total de registros</td><td style="padding:6px 8px;">${records.length} dias com relatório</td></tr>
</tbody></table>

<div style="margin-top:20px;padding:16px 20px;border:2px solid #1d4ed8;border-radius:10px;background:#dbeafe;">
  <h3 style="color:#1d4ed8;font-size:13px;margin-bottom:10px;">📋 Embasamento para Aditivo de Prazo</h3>
  <p style="font-size:12px;line-height:1.7;color:#374151;">
    Com base nos registros pluviométricos da obra <strong>${proj.name}</strong>, foram identificados
    <strong>${summary.unworkable} dias impraticáveis</strong> no período analisado, com precipitação
    total acumulada de <strong>${Math.round(summary.totalMm * 10) / 10} mm</strong>.<br/><br/>
    Conforme documentação técnica e legislação pertinente às condições climáticas em obras de construção civil,
    solicita-se reconhecimento formal de <strong>${summary.unworkable} dias de aditivo de prazo</strong>
    em razão das condições adversas de chuva que inviabilizaram a execução dos serviços.
  </p>
</div>

<h2>Histórico Diário de Precipitação</h2>
<table>
  <thead><tr><th>Data</th><th style="text-align:right;">Manhã</th><th style="text-align:right;">Tarde</th><th style="text-align:right;">Noite</th><th style="text-align:right;">Total</th><th style="text-align:center;">Praticabilidade</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr style="background:#f3f4f6;font-weight:700;">
      <td colspan="4" style="padding:7px 8px;">TOTAL ACUMULADO</td>
      <td style="padding:7px 8px;text-align:right;">${Math.round(summary.totalMm * 10) / 10} mm</td>
      <td style="padding:7px 8px;text-align:center;color:#dc2626;">${summary.unworkable} dias imp.</td>
    </tr>
  </tfoot>
</table>

<div class="footer">
  <span>Gerado pelo <strong>SYSOBRA</strong> em ${genAt}</span>
  <span>${company?.name ?? 'SYSOBRA'}</span>
</div>
</body></html>`
}
