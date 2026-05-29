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
import { PDF_COLORS, getPdfHeader, getPdfFooter, buildPdfDocument } from '../../utils/pdfTemplate'
import { createAuditLog } from '../../utils/audit'
import { notifyManagers }  from '../../utils/notifications'

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
      company:     { select: { id: true, name: true, cnpj: true, logo: true } },
      // Etapas: retornar sempre (necessário para aba Etapas do Diário)
      stages: {
        where:   { status: { not: 'CANCELLED' } },
        orderBy: { order: 'asc' },
        select: {
          id: true, name: true, code: true, order: true,
          progressPercent: true, status: true,
          budgetTotal: true, startDate: true, endDate: true,
        },
      },
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

// ─── signatureStatus virtual field ───────────────────────────────────────────

/**
 * Retorna status enriquecido com `APPROVED_PENDING_SIGNATURES` quando o RDO
 * está APPROVED mas ainda há assinaturas pendentes.
 */
function getSignatureStatus(entry: any): string {
  if (entry.status !== 'APPROVED') return entry.status
  const needsFiscal = !!(entry.fiscalEmail || entry.fiscalName)
  const allSigned =
    entry.authorSigned &&
    entry.approverSigned &&
    (!needsFiscal || entry.fiscalSigned)
  return allSigned ? 'APPROVED' : 'APPROVED_PENDING_SIGNATURES'
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

    const entriesWithStatus = entries.map((e: any) => ({
      ...e,
      signatureStatus: getSignatureStatus(e),
    }))

    return reply.send({ project: proj, entries: entriesWithStatus, total, page, limit })
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
      // Equipamentos utilizados no RDO
      equipments?: {
        itemId:     string
        usedInRdo:  boolean
        usageNotes?: string | null
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

    // Salvar equipamentos utilizados (se informados no formulário)
    if (Array.isArray(body.equipments) && body.equipments.length > 0) {
      await p.diaryEquipment.createMany({
        data: (body.equipments as any[]).map((eq: any) => ({
          companyId,
          diaryEntryId: entry.id,
          itemId:       eq.itemId,
          usedInRdo:    true,
          usedAt:       new Date(),
          usedBy:       userId,
          usageNotes:   eq.usageNotes ?? null,
          isActive:     true,
        })),
        skipDuplicates: true,
      })
    }

    // Audit log
    await createAuditLog({
      prisma, companyId, userId, request,
      action:      'CREATE',
      module:      'DIARY',
      entity:      'DiaryEntry',
      entityId:    entry.id,
      entityName:  reportNumber ?? entry.id,
      description: `RDO ${reportNumber} criado para obra "${body.projectId}"`,
      metadata:    { reportNumber, projectId: body.projectId, date: entryDate.toISOString() },
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

    await createAuditLog({
      prisma, companyId: req.companyId!, userId: payload.sub, request,
      action:      'APPROVE',
      module:      'DIARY',
      entity:      'DiaryEntry',
      entityId:    id,
      entityName:  entry.reportNumber ?? id,
      description: `RDO ${entry.reportNumber ?? ''} aprovado`,
    })

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

    await createAuditLog({
      prisma, companyId: req.companyId!, userId: payload.sub, request,
      action:      'REJECT',
      module:      'DIARY',
      entity:      'DiaryEntry',
      entityId:    id,
      entityName:  entry.reportNumber ?? id,
      description: `RDO ${entry.reportNumber ?? ''} rejeitado — motivo: "${rejectionNote.trim()}"`,
      metadata:    { rejectionNote: rejectionNote.trim() },
    })

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

    await createAuditLog({
      prisma, companyId: req.companyId!, userId: payload.sub, request,
      action:      'SUBMIT',
      module:      'DIARY',
      entity:      'DiaryEntry',
      entityId:    id,
      entityName:  entry.reportNumber ?? id,
      description: `RDO ${entry.reportNumber ?? ''} enviado para aprovação`,
    })

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
        author:     { select: { name: true } },
        approvedBy: { select: { name: true } },
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

    // Buscar ferramentas utilizadas neste RDO
    const equipments = await p.diaryEquipment.findMany({
      where: { diaryEntryId: id, usedInRdo: true, isActive: true },
      include: {
        item: { select: { name: true, brand: true, model: true, serialNumber: true, toolType: true } },
      },
    })

    const html = buildDiaryPdfHtml(entry, proj, company, equipments, {
      authorSignatureUrl:  entry.authorSignatureUrl,
      approverSignatureUrl: entry.approverSignatureUrl,
      fiscalSignatureUrl:  entry.fiscalSignatureUrl,
      authorName:          entry.author?.name,
      approverName:        entry.approvedBy?.name,
      fiscalName:          entry.fiscalName,
      fiscalDocument:      entry.fiscalDocument,
      authorSigned:        entry.authorSigned,
      approverSigned:      entry.approverSigned,
      fiscalSigned:        entry.fiscalSigned,
    })
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

    const periodLabel2 = q.startDate && q.endDate
      ? `${new Date(q.startDate).toLocaleDateString('pt-BR')} a ${new Date(q.endDate).toLocaleDateString('pt-BR')}`
      : 'Todo o período'

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: #fff; color: #111827; }
    @page { size: A4 landscape; margin: 0; }

    /* Header */
    .doc-header {
      background: #111827; color: #fff;
      padding: 16px 32px; display: flex; align-items: center; justify-content: space-between;
    }
    .doc-header .logo { font-size: 18px; font-weight: 800; letter-spacing: 2px; color: #fff; }
    .doc-header .logo span { color: #F5A623; }
    .doc-header .right { text-align: right; }
    .doc-header .title { font-size: 13px; font-weight: 700; color: #F5A623; text-transform: uppercase; letter-spacing: .06em; }
    .doc-header .sub { font-size: 10px; color: rgba(255,255,255,.55); margin-top: 2px; }
    .stripe { height: 4px; background: linear-gradient(90deg, #F5A623 0%, #D4860F 100%); }

    /* Body */
    .body { padding: 20px 32px 24px; }

    /* Cards */
    .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .card {
      background: #F3F4F6; border-radius: 8px; padding: 12px 14px;
      border-left: 3px solid #F5A623;
    }
    .card-label { font-size: 9px; color: #6B7280; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
    .card-value { font-size: 20px; font-weight: 800; color: #111827; }
    .card-unit  { font-size: 11px; color: #6B7280; margin-left: 2px; }

    /* Footer */
    .doc-footer {
      background: #F3F4F6; border-top: 3px solid #F5A623;
      padding: 8px 32px; display: flex; justify-content: space-between; align-items: center;
      font-size: 9px; color: #6B7280;
      position: fixed; bottom: 0; left: 0; right: 0;
    }
    .doc-footer .logo-sm { font-weight: 800; color: #111827; letter-spacing: 1px; font-size: 10px; }
    .doc-footer .logo-sm span { color: #F5A623; }

    .chart-wrap { padding-bottom: 60px; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
</head>
<body>
  <div class="doc-header">
    <div>
      <div class="logo">SYS<span>O</span>BRA</div>
      <div class="sub">Sistema de Gestão de Obras</div>
    </div>
    <div class="right">
      <div class="title">Gráfico Pluviométrico</div>
      <div class="sub">${proj.name}${proj.code ? ' · ' + proj.code : ''}</div>
      <div class="sub" style="margin-top:2px;">${periodLabel2}</div>
    </div>
  </div>
  <div class="stripe"></div>

  <div class="body">
    <div class="cards">
      <div class="card">
        <div class="card-label">Acumulado total</div>
        <div class="card-value">${Math.round(totalMm * 10) / 10}<span class="card-unit">mm</span></div>
      </div>
      <div class="card">
        <div class="card-label">Dias com chuva</div>
        <div class="card-value">${rainyDays}<span class="card-unit">dias</span></div>
      </div>
      <div class="card">
        <div class="card-label">Dias impraticáveis</div>
        <div class="card-value" style="color:${unworkable > 0 ? '#DC2626' : '#111827'};">
          ${unworkable}<span class="card-unit">dias</span>
        </div>
      </div>
      <div class="card">
        <div class="card-label">Maior evento</div>
        <div class="card-value">${maxDay ? maxDay.totalMm.toFixed(1) : '0'}<span class="card-unit">mm</span></div>
      </div>
    </div>

    <div class="chart-wrap">
      <canvas id="chart" width="1050" height="360"></canvas>
    </div>
  </div>

  <div class="doc-footer">
    <div class="logo-sm">SYS<span>O</span>BRA · Sistema de Gestão de Obras</div>
    <div>${proj.name}</div>
    <div>Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
  </div>

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
            backgroundColor: ${JSON.stringify(records.map((r: any) => r.isUnworkable ? '#EF4444' : '#F5A623'))},
            borderRadius: 3,
            yAxisID: 'y'
          },
          {
            type: 'line',
            label: 'Acumulado (mm)',
            data: ${JSON.stringify(acumulado)},
            borderColor: '#111827',
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
        plugins: { legend: { position: 'top', labels: { font: { size: 11 }, color: '#374151' } } },
        scales: {
          y:  { beginAtZero: true, title: { display: true, text: 'mm', color: '#6B7280' }, ticks: { font: { size: 10 }, color: '#6B7280' }, grid: { color: '#F3F4F6' } },
          y2: { beginAtZero: true, position: 'right', title: { display: true, text: 'acum. mm', color: '#6B7280' }, grid: { drawOnChartArea: false }, ticks: { font: { size: 10 }, color: '#6B7280' } },
          x:  { ticks: { font: { size: 9 }, maxRotation: 45, color: '#6B7280' }, grid: { color: '#F3F4F6' } }
        }
      }
    })
  </script>
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
        project: {
          select: {
            id: true, name: true, code: true,
            diaryMaxPhotos: true,
            // Etapas incluídas para o formulário de edição do RDO
            stages: {
              where:   { status: { not: 'CANCELLED' } },
              orderBy: { order: 'asc' },
              select: {
                id: true, name: true, code: true, order: true,
                progressPercent: true, status: true,
                budgetTotal: true, startDate: true, endDate: true,
              },
            },
          },
        },
        equipments: {
          where:   { usedInRdo: true },
          include: { item: { select: { id: true, name: true, serialNumber: true, brand: true, model: true } } },
        },
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

    // Serializa Decimal → number nas etapas do projeto
    const serialised: any = { ...entry }
    if (serialised.project?.stages) {
      serialised.project = {
        ...serialised.project,
        stages: serialised.project.stages.map((s: any) => ({
          ...s,
          progressPercent: parseFloat(String(s.progressPercent ?? 0)),
          budgetTotal:     parseFloat(String(s.budgetTotal     ?? 0)),
        })),
      }
    }
    if (serialised.stageEntries) {
      serialised.stageEntries = serialised.stageEntries.map((se: any) => ({
        ...se,
        previousProgress: parseFloat(String(se.previousProgress ?? 0)),
        currentProgress:  parseFloat(String(se.currentProgress  ?? 0)),
        stage: se.stage ? {
          ...se.stage,
          progressPercent: parseFloat(String(se.stage.progressPercent ?? 0)),
        } : null,
      }))
    }

    serialised.signatureStatus = getSignatureStatus(serialised)

    return reply.send({ entry: serialised })
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

    // Atualiza equipamentos utilizados se fornecidos
    if (Array.isArray(body.equipments)) {
      // Remove registros de uso anteriores e recria
      await p.diaryEquipment.deleteMany({ where: { diaryEntryId: id, usedInRdo: true } })
      const companyId = req.companyId!
      if (body.equipments.length > 0) {
        await p.diaryEquipment.createMany({
          data: (body.equipments as any[]).map((eq: any) => ({
            companyId,
            diaryEntryId: id,
            itemId:       eq.itemId,
            usedInRdo:    true,
            usedAt:       new Date(),
            usedBy:       payload.sub,
            usageNotes:   eq.usageNotes ?? null,
            isActive:     true,
          })),
          skipDuplicates: true,
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
    await createAuditLog({
      prisma, companyId: req.companyId!, userId: payload.sub, request,
      action:      'UPDATE',
      module:      'DIARY',
      entity:      'DiaryEntry',
      entityId:    id,
      entityName:  entry.reportNumber ?? id,
      description: `RDO ${entry.reportNumber ?? ''} editado`,
    })

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

    await createAuditLog({
      prisma, companyId: req.companyId!, userId: payload.sub, request,
      action:      'APPROVE',
      module:      'DIARY',
      entity:      'DiaryEntry',
      entityId:    id,
      entityName:  entry.reportNumber ?? id,
      description: `RDO ${entry.reportNumber ?? ''} aprovado`,
    })

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

    await createAuditLog({
      prisma, companyId: req.companyId!, userId: payload.sub, request,
      action:      'REJECT',
      module:      'DIARY',
      entity:      'DiaryEntry',
      entityId:    id,
      entityName:  entry.reportNumber ?? id,
      description: `RDO ${entry.reportNumber ?? ''} rejeitado — motivo: "${rejectionNote.trim()}"`,
      metadata:    { rejectionNote: rejectionNote.trim() },
    })

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

    await createAuditLog({
      prisma, companyId: req.companyId!, userId: payload.sub, request,
      action:      'COMMENT',
      module:      'DIARY',
      entity:      'DiaryEntry',
      entityId:    id,
      entityName:  entry.reportNumber ?? id,
      description: `Comentário adicionado ao RDO ${entry.reportNumber ?? ''}`,
      metadata:    { isInternal: actualInternal, preview: content.trim().slice(0, 80) },
    })

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

  // ── GET /api/v1/diary/entries/:entryId/equipments ───────────────────────
  app.get('/entries/:entryId/equipments', { preHandler: [requirePermission('diario_obra', 'view')] }, async (request, reply) => {
    const req        = request as RequestWithMember
    const companyId  = req.companyId!
    const { entryId } = request.params as { entryId: string }

    const entry = await p.diaryEntry.findFirst({
      where:  { id: entryId, project: { companyId } },
      select: { id: true, projectId: true, date: true },
    })
    if (!entry) return reply.status(404).send({ error: 'RDO não encontrado' })

    // Ferramentas alocadas na obra (via currentProjectId)
    const tools = await p.stockItem.findMany({
      where: {
        companyId,
        isActive:        true,
        requiresCustody: true,
        currentProjectId: entry.projectId,
        toolStatus: 'IN_USE',
      },
      select: {
        id: true, name: true, code: true,
        serialNumber: true, brand: true, model: true,
        imageUrl: true,
      },
    })

    // Confirmações já feitas para este RDO
    const confirmations = await p.diaryEquipment.findMany({
      where: { diaryEntryId: entryId, isActive: true },
    })

    const toolsWithConfirmation = tools.map((tool: any) => {
      const conf = confirmations.find((c: any) => c.itemId === tool.id)
      return {
        ...tool,
        confirmed:   conf?.confirmed   ?? false,
        confirmedAt: conf?.confirmedAt ?? null,
        notes:       conf?.notes       ?? null,
      }
    })

    return reply.send({
      tools:          toolsWithConfirmation,
      totalTools:     tools.length,
      confirmedCount: confirmations.filter((c: any) => c.confirmed).length,
    })
  })

  // ── POST /api/v1/diary/entries/:entryId/equipments/confirm ───────────────
  app.post('/entries/:entryId/equipments/confirm', { preHandler: [requirePermission('diario_obra', 'edit')] }, async (request, reply) => {
    const req        = request as RequestWithMember
    const companyId  = req.companyId!
    const payload    = request.user as JwtPayload
    const userId     = payload.sub
    const { entryId } = request.params as { entryId: string }
    const body        = request.body as { itemId: string; confirmed: boolean; notes?: string }

    const existing = await p.diaryEquipment.findFirst({
      where: { diaryEntryId: entryId, itemId: body.itemId, isActive: true },
    })

    if (existing) {
      await p.diaryEquipment.update({
        where: { id: existing.id },
        data: {
          confirmed:   body.confirmed,
          confirmedAt: body.confirmed ? new Date() : null,
          confirmedBy: body.confirmed ? userId : null,
          notes:       body.notes ?? existing.notes,
        },
      })
    } else {
      await p.diaryEquipment.create({
        data: {
          companyId,
          diaryEntryId: entryId,
          itemId:       body.itemId,
          confirmed:    body.confirmed,
          confirmedAt:  body.confirmed ? new Date() : null,
          confirmedBy:  body.confirmed ? userId : null,
          notes:        body.notes ?? null,
          isActive:     true,
        },
      })
    }

    // Se marcada como ausente e alerta ainda não foi enviado: notificar
    if (!body.confirmed && !existing?.alertSent) {
      const [tool, entry] = await Promise.all([
        p.stockItem.findFirst({ where: { id: body.itemId }, select: { name: true } }),
        p.diaryEntry.findFirst({ where: { id: entryId }, include: { project: { select: { name: true } } } }),
      ])
      await notifyManagers({
        companyId,
        type:    'ACTION_REQUIRED',
        title:   '⚠️ Ferramenta não confirmada no RDO',
        message: `A ferramenta "${tool?.name}" não foi confirmada no RDO de ${entry?.project?.name}. Verificar localização.`,
        link:    '/app/deposito?tab=ferramentas',
      })
      if (existing) {
        await p.diaryEquipment.update({ where: { id: existing.id }, data: { alertSent: true } })
      }
    }

    return reply.send({ success: true })
  })

  // ── GET /api/v1/diary/entries/:entryId/tools ────────────────────────────
  // Lista ferramentas IN_USE na obra com status de uso para este RDO
  app.get('/entries/:entryId/tools', { preHandler: [requirePermission('diario_obra', 'view')] }, async (request, reply) => {
    const req         = request as RequestWithMember
    const companyId   = req.companyId!
    const { entryId } = request.params as { entryId: string }

    const entry = await p.diaryEntry.findFirst({
      where:  { id: entryId, project: { companyId } },
      select: { id: true, projectId: true, date: true },
    })
    if (!entry) return reply.status(404).send({ error: 'RDO não encontrado' })

    const tools = await p.stockItem.findMany({
      where: {
        companyId,
        isActive:         true,
        requiresCustody:  true,
        currentProjectId: entry.projectId,
        toolStatus:       'IN_USE',
      },
      select: {
        id: true, name: true, code: true,
        serialNumber: true, brand: true, model: true,
        imageUrl: true, toolType: true,
      },
    })

    const usageRecords = await p.diaryEquipment.findMany({
      where: { diaryEntryId: entryId, isActive: true },
    })

    const toolsWithUsage = tools.map((tool: any) => {
      const rec = usageRecords.find((r: any) => r.itemId === tool.id)
      return {
        ...tool,
        usedInRdo:  rec?.usedInRdo  ?? false,
        usedAt:     rec?.usedAt     ?? null,
        usageNotes: rec?.usageNotes ?? '',
        recordId:   rec?.id         ?? null,
      }
    })

    return reply.send({
      tools:      toolsWithUsage,
      usedCount:  toolsWithUsage.filter((t: any) => t.usedInRdo).length,
      totalTools: tools.length,
    })
  })

  // ── POST /api/v1/diary/entries/:entryId/tools/usage ──────────────────────
  // Registrar/atualizar uso de ferramenta no RDO
  app.post('/entries/:entryId/tools/usage', { preHandler: [requirePermission('diario_obra', 'edit')] }, async (request, reply) => {
    const req         = request as RequestWithMember
    const companyId   = req.companyId!
    const payload     = request.user as JwtPayload
    const userId      = payload.sub
    const { entryId } = request.params as { entryId: string }
    const body        = request.body as { itemId: string; usedInRdo: boolean; usageNotes?: string }

    const existing = await p.diaryEquipment.findFirst({
      where: { diaryEntryId: entryId, itemId: body.itemId, isActive: true },
    })

    if (existing) {
      await p.diaryEquipment.update({
        where: { id: existing.id },
        data: {
          usedInRdo:  body.usedInRdo,
          usedAt:     body.usedInRdo ? new Date() : null,
          usedBy:     body.usedInRdo ? userId : null,
          usageNotes: body.usageNotes ?? existing.usageNotes,
        },
      })
    } else {
      await p.diaryEquipment.create({
        data: {
          companyId,
          diaryEntryId: entryId,
          itemId:       body.itemId,
          usedInRdo:    body.usedInRdo,
          usedAt:       body.usedInRdo ? new Date() : null,
          usedBy:       body.usedInRdo ? userId : null,
          usageNotes:   body.usageNotes ?? null,
          isActive:     true,
        },
      })
    }

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

  // ── POST /api/v1/diary/reports/:id/sign ──────────────────────────────────
  // Autor ou Aprovador assina o RDO internamente
  app.post('/reports/:id/sign', { preHandler: [requireCompany] }, async (request, reply) => {
    const req     = request as RequestWithMember
    const payload = request.user as JwtPayload
    const { id }  = request.params as { id: string }
    const body    = request.body as {
      signatureData: string
      role:          'author' | 'approver'
      saveSignature?: boolean
    }

    if (!body.signatureData) return reply.status(400).send({ error: 'signatureData é obrigatório' })
    if (!body.role || !['author', 'approver'].includes(body.role)) {
      return reply.status(400).send({ error: 'role deve ser author ou approver' })
    }

    const entry = await p.diaryEntry.findFirst({
      where: { id, project: { companyId: req.companyId } },
    })
    if (!entry) return reply.status(404).send({ error: 'RDO não encontrado' })

    // Salvar assinatura no perfil do usuário (se pedido ou se não tem ainda)
    if (body.saveSignature) {
      await p.user.update({
        where: { id: payload.sub },
        data:  { savedSignatureUrl: body.signatureData },
      })
    }

    const updateData: any = {}
    if (body.role === 'author') {
      updateData.authorSignatureUrl = body.signatureData
      updateData.authorSigned       = true
    } else {
      updateData.approverSignatureUrl = body.signatureData
      updateData.approverSigned       = true
    }

    await p.diaryEntry.update({ where: { id }, data: updateData })
    return reply.send({ success: true })
  })

  // ── POST /api/v1/diary/reports/:id/generate-fiscal-link ──────────────────
  // Gera token público de 48h para fiscal externo assinar
  app.post('/reports/:id/generate-fiscal-link', { preHandler: [requireCompany] }, async (request, reply) => {
    const req    = request as RequestWithMember
    const { id } = request.params as { id: string }
    const body   = request.body as { fiscalName?: string; fiscalEmail?: string }
    const crypto = await import('crypto')

    const entry = await p.diaryEntry.findFirst({
      where:   { id, project: { companyId: req.companyId } },
      include: {
        author:  { select: { name: true } },
        project: { select: { name: true } },
      },
    })
    if (!entry) return reply.status(404).send({ error: 'RDO não encontrado' })

    const token     = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000)

    await p.diaryEntry.update({
      where: { id },
      data: {
        fiscalSignatureToken:          token,
        fiscalSignatureTokenExpiresAt: expiresAt,
        fiscalName:  body.fiscalName  || null,
        fiscalEmail: body.fiscalEmail || null,
      },
    })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const link    = `${baseUrl}/assinar-rdo/${token}`

    return reply.send({ success: true, link, token, expiresAt })
  })

  // ── GET /api/v1/diary/reports/:id/signatures ─────────────────────────────
  // Status das assinaturas de um RDO
  app.get('/reports/:id/signatures', { preHandler: [requireCompany] }, async (request, reply) => {
    const req    = request as RequestWithMember
    const { id } = request.params as { id: string }

    const entry = await p.diaryEntry.findFirst({
      where: { id, project: { companyId: req.companyId } },
      select: {
        authorSigned:                  true,
        approverSigned:                true,
        fiscalSigned:                  true,
        fiscalName:                    true,
        fiscalEmail:                   true,
        fiscalSignatureToken:          true,
        fiscalSignatureTokenExpiresAt: true,
        authorSignatureUrl:            true,
        approverSignatureUrl:          true,
        fiscalSignatureUrl:            true,
        verificationHash:              true,
        status:                        true,
      },
    })

    if (!entry) return reply.status(404).send({ error: 'RDO não encontrado' })
    return reply.send({ signatures: entry })
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

export interface DiaryPdfSignatures {
  authorSignatureUrl?:  string | null
  approverSignatureUrl?: string | null
  fiscalSignatureUrl?:  string | null
  authorName?:          string | null
  approverName?:        string | null
  fiscalName?:          string | null
  fiscalDocument?:      string | null
  authorSigned?:        boolean
  approverSigned?:      boolean
  fiscalSigned?:        boolean
}

export function buildDiaryPdfHtml(
  entry:      any,
  proj:       any,
  company:    any,
  equipments: any[] = [],
  sigs?:      DiaryPdfSignatures,
): string {
  const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString('pt-BR')

  const statusColors: Record<string, { bg: string; color: string }> = {
    APPROVED: { bg: '#DCFCE7', color: '#166534' },
    REJECTED: { bg: '#FEE2E2', color: '#991B1B' },
    PENDING:  { bg: '#FEF3C7', color: '#92400E' },
    DRAFT:    { bg: PDF_COLORS.gray100, color: PDF_COLORS.gray700 },
  }
  const sc = statusColors[entry.status] ?? statusColors.DRAFT
  const statusBadge = `<span class="badge" style="background:${sc.bg};color:${sc.color};">${STATUS_LABEL[entry.status] ?? entry.status}</span>`

  const weatherRow = (period: string, cond: string | null, rain: number, workable: boolean) => `
    <tr class="${!workable ? 'row-impraticavel' : ''}">
      <td style="font-weight:600;">${period}</td>
      <td>${cond ? (WEATHER_LABEL[cond] ?? cond) : '—'}</td>
      <td class="right">${rain > 0 ? rain + ' mm' : '—'}</td>
      <td class="center"><span class="badge ${workable ? 'badge-success' : 'badge-danger'}">${workable ? 'Praticável' : 'Impraticável'}</span></td>
    </tr>`

  const stageRows = (entry.stageEntries ?? []).map((se: any) => `
    <tr>
      <td>${se.stage?.name ?? '—'}</td>
      <td class="right">${se.previousProgress?.toFixed(1) ?? 0}%</td>
      <td class="right" style="font-weight:700;">${se.currentProgress?.toFixed(1) ?? 0}%</td>
      <td class="right" style="font-weight:600;color:${(se.progressDelta ?? 0) >= 0 ? PDF_COLORS.success : PDF_COLORS.danger};">
        ${(se.progressDelta ?? 0) >= 0 ? '+' : ''}${se.progressDelta?.toFixed(1) ?? 0}%
      </td>
      <td style="font-size:11px;">${se.activities || '—'}</td>
    </tr>`).join('')

  const occurrenceRows = (entry.occurrences ?? []).map((o: any) => `
    <tr>
      <td style="font-size:11px;">${o.type}</td>
      <td style="font-size:11px;">${o.severity}</td>
      <td style="font-size:11px;">${o.description}</td>
      <td style="font-size:11px;">${o.action || '—'}</td>
    </tr>`).join('')

  const body = `
    <!-- Identificação da obra -->
    <div class="section">
      <div class="section-title">1. Identificação da Obra</div>
      <div class="info-grid">
        <div class="info-item"><span class="label">Obra</span><span class="value">${proj?.name ?? '—'}</span></div>
        <div class="info-item"><span class="label">Código</span><span class="value">${proj?.code ?? '—'}</span></div>
        <div class="info-item"><span class="label">Responsável</span><span class="value">${entry.author?.name ?? '—'}</span></div>
        <div class="info-item"><span class="label">Data</span><span class="value">${fmtDate(entry.date)}</span></div>
        <div class="info-item"><span class="label">Cliente</span><span class="value">${proj?.client?.name ?? '—'}</span></div>
        <div class="info-item"><span class="label">Endereço</span><span class="value">${[proj?.address, proj?.city, proj?.state].filter(Boolean).join(', ') || '—'}</span></div>
      </div>
    </div>

    <!-- Condições climáticas -->
    <div class="section">
      <div class="section-title">2. Condições Climáticas</div>
      <table>
        <thead><tr>
          <th>Período</th><th>Condição</th><th class="right">Chuva (mm)</th><th class="center">Praticabilidade</th>
        </tr></thead>
        <tbody>
          ${weatherRow('Manhã', entry.weatherMorning,   Number(entry.rainMorningMm   ?? 0), entry.workableMorning   !== false)}
          ${weatherRow('Tarde', entry.weatherAfternoon, Number(entry.rainAfternoonMm ?? 0), entry.workableAfternoon !== false)}
          ${weatherRow('Noite', entry.weatherNight,     Number(entry.rainNightMm     ?? 0), entry.workableNight     !== false)}
        </tbody>
        <tfoot><tr>
          <td colspan="2">Total do dia</td>
          <td class="right">${Number(entry.totalRainMm ?? 0).toFixed(1)} mm</td>
          <td></td>
        </tr></tfoot>
      </table>
    </div>

    ${(entry.stageEntries ?? []).length > 0 ? `
    <div class="section">
      <div class="section-title">3. Progresso por Etapa</div>
      <table>
        <thead><tr><th>Etapa</th><th class="right">Anterior</th><th class="right">Atual</th><th class="right">Evolução</th><th>Atividades</th></tr></thead>
        <tbody>${stageRows}</tbody>
      </table>
    </div>` : ''}

    ${entry.generalActivities ? `
    <div class="section">
      <div class="section-title">4. Atividades Gerais</div>
      <div class="text-block">${entry.generalActivities}</div>
    </div>` : ''}

    ${(entry.occurrences ?? []).length > 0 ? `
    <div class="section">
      <div class="section-title">5. Ocorrências</div>
      <table>
        <thead><tr><th>Tipo</th><th>Severidade</th><th>Descrição</th><th>Providência</th></tr></thead>
        <tbody>${occurrenceRows}</tbody>
      </table>
    </div>` : ''}

    ${entry.ddsDone || entry.ddsTheme ? `
    <div class="section">
      <div class="section-title">6. DDS — Diálogo Diário de Segurança</div>
      <div class="highlight-box">
        <h3>✅ DDS Realizado</h3>
        <p>Tema: <strong>${entry.ddsTheme ?? 'Não especificado'}</strong>
        ${entry.ddsTime ? ` — Realizado às ${new Date(entry.ddsTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
      </div>
    </div>` : ''}

    ${equipments.length > 0 ? `
    <div class="section">
      <div class="section-title">🔧 Ferramentas Utilizadas no Dia <span style="font-size:10px;font-weight:400;margin-left:6px">(${equipments.length} ferramenta${equipments.length !== 1 ? 's' : ''})</span></div>
      <table>
        <thead><tr><th>Ferramenta</th><th>Série</th><th>Tipo</th><th>Observações</th></tr></thead>
        <tbody>
          ${equipments.map((eq: any) => `
          <tr>
            <td><strong>${eq.item.name}</strong>${eq.item.brand ? `<br><span style="font-size:10px;color:#6B7280">${eq.item.brand}${eq.item.model ? ' ' + eq.item.model : ''}</span>` : ''}</td>
            <td style="font-size:11px;color:#6B7280">${eq.item.serialNumber || '—'}</td>
            <td style="font-size:11px">${eq.item.toolType || '—'}</td>
            <td style="font-size:11px;color:#6B7280">${eq.usageNotes || '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}

    ${entry.generalNotes ? `
    <div class="section">
      <div class="section-title">7. Observações Gerais</div>
      <div class="text-block-warn">${entry.generalNotes}</div>
    </div>` : ''}

    ${(entry.imageUrls ?? []).length > 0 ? `
    <div class="section">
      <div class="section-title">📷 Registro Fotográfico
        <span style="font-size:10px;font-weight:400;margin-left:8px">(${entry.imageUrls.length} foto${entry.imageUrls.length !== 1 ? 's' : ''})</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px">
        ${(entry.imageUrls as string[]).map((url: string) => {
          const apiBase = (process.env.API_URL || 'http://localhost:3001').replace(/\/$/, '')
          const absUrl  = url.startsWith('http') ? url : `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`
          return `<div style="break-inside:avoid"><img src="${absUrl}" style="width:100%;height:120px;object-fit:cover;border-radius:4px;border:1px solid #E5E7EB" onerror="this.style.display='none'" /></div>`
        }).join('')}
      </div>
    </div>` : ''}

    <!-- Assinaturas -->
    <div class="section" style="page-break-inside:avoid">
      <div class="section-title">✍️ Assinaturas</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:12px">

        <!-- Autor -->
        <div style="border:1px solid #E5E7EB;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:10px;color:#6B7280;font-weight:700;text-transform:uppercase;margin-bottom:8px">Autor do RDO</div>
          ${sigs?.authorSigned && sigs?.authorSignatureUrl ? `
            <img src="${sigs.authorSignatureUrl}" style="width:100%;max-height:60px;object-fit:contain;margin-bottom:6px" />
            <div style="font-size:10px;color:#16A34A;font-weight:600">✅ Assinado</div>
          ` : `
            <div style="height:60px;border-bottom:1px solid #374151;margin-bottom:6px"></div>
            <div style="font-size:10px;color:#9CA3AF">Aguardando</div>
          `}
          <div style="font-size:10px;color:#374151;margin-top:6px;font-weight:600">${sigs?.authorName ?? entry.author?.name ?? ''}</div>
        </div>

        <!-- Aprovador -->
        <div style="border:1px solid #E5E7EB;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:10px;color:#6B7280;font-weight:700;text-transform:uppercase;margin-bottom:8px">Aprovador</div>
          ${sigs?.approverSigned && sigs?.approverSignatureUrl ? `
            <img src="${sigs.approverSignatureUrl}" style="width:100%;max-height:60px;object-fit:contain;margin-bottom:6px" />
            <div style="font-size:10px;color:#16A34A;font-weight:600">✅ Assinado</div>
          ` : `
            <div style="height:60px;border-bottom:1px solid #374151;margin-bottom:6px"></div>
            <div style="font-size:10px;color:#9CA3AF">Aguardando</div>
          `}
          <div style="font-size:10px;color:#374151;margin-top:6px;font-weight:600">${sigs?.approverName ?? ''}</div>
        </div>

        <!-- Fiscal -->
        <div style="border:1px solid #E5E7EB;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:10px;color:#6B7280;font-weight:700;text-transform:uppercase;margin-bottom:8px">Fiscal / Engenheiro</div>
          ${sigs?.fiscalSigned && sigs?.fiscalSignatureUrl ? `
            <img src="${sigs.fiscalSignatureUrl}" style="width:100%;max-height:60px;object-fit:contain;margin-bottom:6px" />
            <div style="font-size:10px;color:#16A34A;font-weight:600">✅ Assinado</div>
          ` : `
            <div style="height:60px;border-bottom:1px solid #374151;margin-bottom:6px"></div>
            <div style="font-size:10px;color:#9CA3AF">Aguardando</div>
          `}
          <div style="font-size:10px;color:#374151;margin-top:6px;font-weight:600">${sigs?.fiscalName ?? ''}</div>
          ${sigs?.fiscalDocument ? `<div style="font-size:9px;color:#6B7280">CPF: ${sigs.fiscalDocument}</div>` : ''}
        </div>

      </div>
    </div>
  `

  const header = getPdfHeader({
    title:       'RELATÓRIO DIÁRIO DE OBRA',
    docNumber:   `RDO Nº ${entry.reportNumber ?? '—'}`,
    company:     { name: company?.name ?? 'SYSOBRA', document: company?.cnpj ? `CNPJ: ${company.cnpj}` : null, logo: company?.logo },
    date:        fmtDate(entry.date),
    statusBadge,
  })

  return buildPdfDocument({
    title:  `RDO ${entry.reportNumber ?? ''} — ${proj?.name ?? ''}`,
    header,
    body,
    footer: getPdfFooter(company?.name ?? 'SYSOBRA'),
  })
}

function buildRainReportHtml(proj: any, records: any[], summary: any, startDate?: string, endDate?: string): string {
  const company = proj.company

  const fmtDate = (d: Date | string) => {
    const dt = typeof d === 'string' ? new Date(d) : d
    return dt.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  }

  const periodLabel = startDate && endDate
    ? `${new Date(startDate).toLocaleDateString('pt-BR')} a ${new Date(endDate).toLocaleDateString('pt-BR')}`
    : 'Todo o período'

  const rainyDays = records.filter((r: any) => r.totalMm > 0).length

  const rows = records.map((r: any) => {
    const praticavel = !r.isUnworkable
    const rowCls = praticavel ? '' : 'class="row-impraticavel"'
    return `<tr ${rowCls}>
      <td>${fmtDate(r.date)}</td>
      <td class="right">${r.morningMm > 0 ? r.morningMm + ' mm' : '—'}</td>
      <td class="right">${r.afternoonMm > 0 ? r.afternoonMm + ' mm' : '—'}</td>
      <td class="right">${r.nightMm > 0 ? r.nightMm + ' mm' : '—'}</td>
      <td class="right" style="font-weight:700;">${r.totalMm} mm</td>
      <td class="center">
        <span class="badge ${praticavel ? 'badge-success' : 'badge-danger'}">${praticavel ? 'Praticável' : 'Impraticável'}</span>
      </td>
    </tr>`
  }).join('')

  const header = getPdfHeader({
    title:    'RELATÓRIO PLUVIOMÉTRICO',
    company:  { name: company?.name ?? 'SYSOBRA', document: company?.cnpj ?? null, logo: company?.logo ?? null },
    date:     periodLabel,
  })

  const footer = getPdfFooter(company?.name ?? 'SYSOBRA')

  const body = `
    <!-- Resumo executivo -->
    <div class="section">
      <div class="section-title">Resumo Executivo</div>
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="m-label">Precipitação total</div>
          <div class="m-value">${Math.round(summary.totalMm * 10) / 10}<span class="m-unit">mm</span></div>
        </div>
        <div class="metric-card">
          <div class="m-label">Dias com chuva</div>
          <div class="m-value">${rainyDays}<span class="m-unit">dias</span></div>
        </div>
        <div class="metric-card">
          <div class="m-label">Dias impraticáveis</div>
          <div class="m-value" style="color:${summary.unworkable > 0 ? PDF_COLORS.danger : PDF_COLORS.dark};">
            ${summary.unworkable}<span class="m-unit">dias</span>
          </div>
        </div>
        <div class="metric-card">
          <div class="m-label">Registros totais</div>
          <div class="m-value">${records.length}<span class="m-unit">dias</span></div>
        </div>
      </div>
    </div>

    <!-- Info da obra -->
    <div class="section">
      <div class="section-title">Identificação da Obra</div>
      <div class="info-grid">
        <div class="info-item">
          <span class="label">Obra</span>
          <span class="value">${proj.name}</span>
        </div>
        ${proj.code ? `<div class="info-item"><span class="label">Código</span><span class="value">${proj.code}</span></div>` : ''}
        <div class="info-item">
          <span class="label">Período analisado</span>
          <span class="value">${periodLabel}</span>
        </div>
      </div>
    </div>

    ${summary.unworkable > 0 ? `
    <!-- Bloco de aditivo -->
    <div class="section">
      <div class="highlight-box">
        <h3>📋 Embasamento para Aditivo de Prazo</h3>
        <p>
          Com base nos registros pluviométricos da obra <strong>${proj.name}</strong>, foram identificados
          <strong>${summary.unworkable} dias impraticáveis</strong> no período analisado, com precipitação
          total acumulada de <strong>${Math.round(summary.totalMm * 10) / 10} mm</strong>.<br/><br/>
          Conforme documentação técnica e legislação pertinente às condições climáticas em obras de construção civil,
          solicita-se reconhecimento formal de <strong>${summary.unworkable} dias de aditivo de prazo</strong>
          em razão das condições adversas de chuva que inviabilizaram a execução dos serviços.
        </p>
      </div>
    </div>` : ''}

    <!-- Tabela de registros -->
    <div class="section">
      <div class="section-title">Histórico Diário de Precipitação</div>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th class="right">Manhã</th>
            <th class="right">Tarde</th>
            <th class="right">Noite</th>
            <th class="right">Total</th>
            <th class="center">Praticabilidade</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="4">TOTAL ACUMULADO</td>
            <td class="right">${Math.round(summary.totalMm * 10) / 10} mm</td>
            <td class="center" style="color:${PDF_COLORS.danger};">${summary.unworkable} dias imp.</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `

  return buildPdfDocument({ title: `Relatório Pluviométrico — ${proj.name}`, header, body, footer })
}
