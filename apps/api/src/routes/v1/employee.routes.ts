import { FastifyInstance } from 'fastify'
import * as fs     from 'fs'
import * as path   from 'path'
import * as crypto from 'crypto'
import { prisma } from '@sysobra/database'
import {
  authenticate,
  requireCompany,
  RequestWithMember,
  JwtPayload,
} from '../../middlewares/auth.middleware'
import { createAuditLog } from '../../utils/audit'
import { processAndSaveImage } from '../../utils/imageProcessor'

const p = prisma as any

const UPLOADS_ROOT  = path.join(process.cwd(), 'uploads')
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0
  const n = Number(String(v))
  return isNaN(n) ? 0 : n
}

function formatDateBR(d: Date | string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR')
}

function daysUntil(date: Date | string | null | undefined): number | null {
  if (!date) return null
  const ms = new Date(date).getTime() - Date.now()
  return Math.ceil(ms / 86_400_000)
}

/** Gera próxima matrícula EMP-{ANO}-{SEQ} para a empresa */
async function nextEmployeeCode(companyId: string): Promise<string> {
  const year   = new Date().getFullYear()
  const prefix = `EMP-${year}-`
  const last   = await p.employee.findFirst({
    where:   { companyId, code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select:  { code: true },
  })
  const seq = last?.code
    ? parseInt(last.code.replace(prefix, ''), 10) + 1
    : 1
  return `${prefix}${String(seq).padStart(3, '0')}`
}

/** Valida CPF por dígitos verificadores */
function isValidCpf(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, '')
  if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(clean[i]) * (10 - i)
  let r = (sum * 10) % 11
  if (r === 10 || r === 11) r = 0
  if (r !== parseInt(clean[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(clean[i]) * (11 - i)
  r = (sum * 10) % 11
  if (r === 10 || r === 11) r = 0
  return r === parseInt(clean[10])
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
  }
  return Buffer.concat(chunks)
}

/** Serializa employee com campos calculados */
function serialiseEmployee(emp: any) {
  const docExpiries = (emp.documents ?? []).map((d: any) => ({
    ...d,
    daysToExpiry: daysUntil(d.expiryDate),
    isExpired:    d.expiryDate ? daysUntil(d.expiryDate)! < 0 : false,
    isExpiringSoon: d.expiryDate
      ? daysUntil(d.expiryDate)! >= 0 && daysUntil(d.expiryDate)! <= 30
      : false,
  }))
  return {
    ...emp,
    salary: emp.salary ? toNum(emp.salary) : null,
    documents: docExpiries,
    // Alertas rápidos para listagem
    hasExpiredDocs:  docExpiries.some((d: any) => d.isExpired),
    hasExpiringDocs: docExpiries.some((d: any) => d.isExpiringSoon),
  }
}

// ─── Rotas ───────────────────────────────────────────────────────────────────

export async function employeeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireCompany)

  // ══════════════════════════════════════════════════════════════════════════
  // COLABORADORES — CRUD
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v1/employees/summary
   * Métricas para o dashboard de colaboradores.
   * IMPORTANTE: deve vir ANTES de /:id para não ser capturado pela rota de perfil.
   */
  app.get('/summary', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!

    const now   = new Date()
    const ago30 = new Date(now.getTime() - 30 * 86_400_000)
    const in30  = new Date(now.getTime() + 30 * 86_400_000)

    const [
      totalAtivos, totalAfastados, totalDesligados,
      alocadosEmObras,
      admissoes30, desligamentos30,
      docsVencendo, docsVencidos,
      treinVencendo, treinVencidos,
      feriasAgendadas,
      porFuncao, porTipo, porObra,
    ] = await Promise.all([
      p.employee.count({ where: { companyId, status: 'ACTIVE',    isActive: true } }),
      p.employee.count({ where: { companyId, status: 'AWAY',      isActive: true } }),
      p.employee.count({ where: { companyId, status: 'DISMISSED', isActive: true } }),
      p.employee.count({ where: { companyId, status: 'ACTIVE', projectId: { not: null }, isActive: true } }),
      p.employee.count({ where: { companyId, isActive: true, admissionDate: { gte: ago30 } } }),
      p.employee.count({ where: { companyId, isActive: true, dismissalDate: { gte: ago30 } } }),
      p.employeeDocument.count({ where: { companyId, isActive: true, expiryDate: { gte: now, lte: in30 } } }),
      p.employeeDocument.count({ where: { companyId, isActive: true, expiryDate: { lt: now } } }),
      p.employeeTraining.count({ where: { companyId, isActive: true, expiresAt: { gte: now, lte: in30 } } }),
      p.employeeTraining.count({ where: { companyId, isActive: true, expiresAt: { lt: now } } }),
      p.employeeVacation.count({ where: { companyId, isActive: true, status: { in: ['SCHEDULED', 'ACTIVE'] } } }),
      // Distribuição por função
      p.employee.groupBy({
        by: ['role'],
        where: { companyId, status: 'ACTIVE', isActive: true },
        _count: true,
      }),
      // Distribuição por tipo
      p.employee.groupBy({
        by: ['type'],
        where: { companyId, isActive: true },
        _count: true,
      }),
      // Distribuição por obra (top obras)
      p.employee.groupBy({
        by: ['projectId'],
        where: { companyId, status: 'ACTIVE', projectId: { not: null }, isActive: true },
        _count: true,
      }),
    ])

    // Buscar nomes das obras
    const projectIds = (porObra as any[]).map((o: any) => o.projectId).filter(Boolean)
    const projects   = projectIds.length > 0
      ? await prisma.project.findMany({
          where:  { id: { in: projectIds } },
          select: { id: true, name: true },
        })
      : []
    const projectMap = Object.fromEntries(projects.map((p: any) => [p.id, p.name]))

    return reply.send({
      totalAtivos,
      totalAfastados,
      totalDesligados,
      alocadosEmObras,
      admissoesUltimos30:      admissoes30,
      desligamentosUltimos30:  desligamentos30,
      documentosVencendo:      docsVencendo,
      documentosVencidos:      docsVencidos,
      treinamentosVencendo:    treinVencendo,
      treinamentosVencidos:    treinVencidos,
      feriasAgendadas,
      porFuncao: (porFuncao as any[]).map((r: any) => ({
        role: r.role ?? '—', count: r._count,
      })).sort((a: any, b: any) => b.count - a.count),
      porTipo: (porTipo as any[]).map((r: any) => ({
        type: r.type, count: r._count,
      })),
      porObra: (porObra as any[]).map((r: any) => ({
        projectId:   r.projectId,
        projectName: projectMap[r.projectId] ?? r.projectId,
        count:       r._count,
      })).sort((a: any, b: any) => b.count - a.count).slice(0, 5),
    })
  })

  /**
   * GET /api/v1/employees
   * Lista colaboradores com filtros e paginação.
   */
  app.get('/', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!

    const q = request.query as {
      status?:    string
      type?:      string
      projectId?: string
      role?:      string
      search?:    string
      page?:      string
      limit?:     string
    }

    const page  = Math.max(1, parseInt(q.page  ?? '1',  10))
    const limit = Math.min(100, parseInt(q.limit ?? '20', 10))
    const skip  = (page - 1) * limit

    const where: any = { companyId, isActive: true }
    if (q.status    && q.status    !== 'ALL') where.status    = q.status
    if (q.type      && q.type      !== 'ALL') where.type      = q.type
    if (q.role      && q.role      !== 'ALL') where.role      = q.role
    if (q.projectId && q.projectId !== 'ALL') {
      where.projectId = q.projectId === 'NONE' ? null : q.projectId
    }
    if (q.search) {
      where.OR = [
        { name:  { contains: q.search, mode: 'insensitive' } },
        { code:  { contains: q.search, mode: 'insensitive' } },
        { role:  { contains: q.search, mode: 'insensitive' } },
        { cpf:   { contains: q.search } },
        { email: { contains: q.search, mode: 'insensitive' } },
      ]
    }

    const [employees, total] = await Promise.all([
      p.employee.findMany({
        where,
        include: {
          project:   { select: { id: true, name: true, code: true } },
          documents: { where: { isActive: true }, select: { id: true, expiryDate: true, type: true, name: true } },
          _count:    { select: { trainings: { where: { isActive: true } } } },
        },
        orderBy: { name: 'asc' },
        take:    limit,
        skip,
      }),
      p.employee.count({ where }),
    ])

    return reply.send({
      employees: employees.map(serialiseEmployee),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext:    page * limit < total,
        hasPrev:    page > 1,
      },
    })
  })

  /**
   * POST /api/v1/employees
   * Cria um novo colaborador.
   */
  app.post('/', async (request, reply) => {
    const req       = request as RequestWithMember
    const payload   = request.user as JwtPayload
    const companyId = req.companyId!
    const userId    = payload.sub

    const body = request.body as {
      name:          string
      cpf?:          string
      rg?:           string
      ctps?:         string
      pis?:          string
      birthDate?:    string
      admissionDate: string
      email?:        string
      phone?:        string
      address?:      string
      city?:         string
      state?:        string
      zipCode?:      string
      photo?:        string
      type:          string
      role:          string
      department?:   string
      salary?:       number
      projectId?:    string
    }

    if (!body.name || !body.admissionDate || !body.type || !body.role) {
      return reply.status(400).send({ error: 'Campos obrigatórios: name, admissionDate, type, role' })
    }

    // Validar CPF se fornecido
    if (body.cpf) {
      const cleanCpf = body.cpf.replace(/\D/g, '')
      if (!isValidCpf(cleanCpf)) {
        return reply.status(400).send({ error: 'CPF inválido' })
      }
      // Verificar unicidade
      const existing = await p.employee.findFirst({
        where: { companyId, cpf: cleanCpf, isActive: true },
      })
      if (existing) {
        return reply.status(409).send({ error: `CPF já cadastrado para o colaborador "${existing.name}"` })
      }
    }

    // Validar obra se fornecida
    if (body.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: body.projectId, companyId, isActive: true },
      })
      if (!project) return reply.status(404).send({ error: 'Obra não encontrada' })
    }

    const code = await nextEmployeeCode(companyId)

    const employee = await p.employee.create({
      data: {
        companyId,
        code,
        name:          body.name.trim(),
        cpf:           body.cpf ? body.cpf.replace(/\D/g, '') : null,
        rg:            body.rg  ?? null,
        ctps:          body.ctps ?? null,
        pis:           body.pis  ?? null,
        birthDate:     body.birthDate    ? new Date(body.birthDate)    : null,
        admissionDate: new Date(body.admissionDate),
        email:         body.email    ?? null,
        phone:         body.phone    ?? null,
        address:       body.address  ?? null,
        city:          body.city     ?? null,
        state:         body.state    ?? null,
        zipCode:       body.zipCode  ?? null,
        photo:         body.photo    ?? null,
        type:          body.type,
        role:          body.role.trim(),
        department:    body.department ?? null,
        salary:        body.salary    ?? null,
        projectId:     body.projectId ?? null,
        status:        'ACTIVE',
        isActive:      true,
      },
      include: { project: { select: { id: true, name: true, code: true } } },
    })

    await createAuditLog({
      prisma: p, companyId, userId,
      action:     'CREATE',
      module:     'COLLABORATORS',
      entity:     'Employee',
      entityId:   employee.id,
      entityName: employee.name,
      description: `Colaborador criado: '${employee.name}' (${code}) — Função: ${body.role} · Tipo: ${body.type}`,
      request,
    })

    return reply.status(201).send(serialiseEmployee(employee))
  })

  /**
   * GET /api/v1/employees/:id
   * Perfil completo do colaborador.
   */
  app.get('/:id', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id }    = request.params as { id: string }

    const employee = await p.employee.findFirst({
      where: { id, companyId, isActive: true },
      include: {
        project:    { select: { id: true, name: true, code: true, status: true } },
        documents:  { where: { isActive: true }, orderBy: { expiryDate: 'asc' } },
        trainings:  { where: { isActive: true }, orderBy: { expiresAt:  'asc' } },
        vacations:  { where: { isActive: true }, orderBy: { startDate: 'desc' } },
        epiDeliveries: {
          where:   { employee: { companyId } },
          orderBy: { deliveredAt: 'desc' },
          take:    20,
        },
      },
    })

    if (!employee) return reply.status(404).send({ error: 'Colaborador não encontrado' })

    return reply.send(serialiseEmployee(employee))
  })

  /**
   * PUT /api/v1/employees/:id
   * Edita dados do colaborador.
   */
  app.put('/:id', async (request, reply) => {
    const req       = request as RequestWithMember
    const payload   = request.user as JwtPayload
    const companyId = req.companyId!
    const userId    = payload.sub
    const { id }    = request.params as { id: string }

    const existing = await p.employee.findFirst({ where: { id, companyId, isActive: true } })
    if (!existing) return reply.status(404).send({ error: 'Colaborador não encontrado' })

    const body = request.body as Record<string, any>

    // Validar CPF se foi alterado
    if (body.cpf && body.cpf !== existing.cpf) {
      const cleanCpf = String(body.cpf).replace(/\D/g, '')
      if (!isValidCpf(cleanCpf)) return reply.status(400).send({ error: 'CPF inválido' })
      const dup = await p.employee.findFirst({
        where: { companyId, cpf: cleanCpf, isActive: true, id: { not: id } },
      })
      if (dup) return reply.status(409).send({ error: `CPF já cadastrado para o colaborador "${dup.name}"` })
      body.cpf = cleanCpf
    }

    const updated = await p.employee.update({
      where: { id },
      data: {
        name:          body.name          ?? undefined,
        cpf:           body.cpf           ?? undefined,
        rg:            body.rg            ?? undefined,
        ctps:          body.ctps          ?? undefined,
        pis:           body.pis           ?? undefined,
        birthDate:     body.birthDate     ? new Date(body.birthDate)     : undefined,
        admissionDate: body.admissionDate ? new Date(body.admissionDate) : undefined,
        email:         body.email         ?? undefined,
        phone:         body.phone         ?? undefined,
        address:       body.address       ?? undefined,
        city:          body.city          ?? undefined,
        state:         body.state         ?? undefined,
        zipCode:       body.zipCode       ?? undefined,
        photo:         body.photo         ?? undefined,
        type:          body.type          ?? undefined,
        role:          body.role          ?? undefined,
        department:    body.department    ?? undefined,
        salary:        body.salary        ?? undefined,
        projectId:     body.projectId     !== undefined ? (body.projectId || null) : undefined,
        locationId:    body.locationId   !== undefined ? (body.locationId   || null) : undefined,
        locationName:  body.locationName !== undefined ? (body.locationName || null) : undefined,
      },
      include: { project: { select: { id: true, name: true, code: true } } },
    })

    await createAuditLog({
      prisma: p, companyId, userId,
      action:     'UPDATE',
      module:     'COLLABORATORS',
      entity:     'Employee',
      entityId:   id,
      entityName: updated.name,
      description: `Colaborador editado: '${updated.name}' (${updated.code})`,
      request,
    })

    return reply.send(serialiseEmployee(updated))
  })

  /**
   * PATCH /api/v1/employees/:id/status
   * Muda situação: ACTIVE | AWAY | DISMISSED
   */
  app.patch('/:id/status', async (request, reply) => {
    const req       = request as RequestWithMember
    const payload   = request.user as JwtPayload
    const companyId = req.companyId!
    const userId    = payload.sub
    const { id }    = request.params as { id: string }

    const body = request.body as {
      status:         'ACTIVE' | 'AWAY' | 'DISMISSED'
      dismissalDate?: string
      reason?:        string
      observations?:  string
    }

    if (!['ACTIVE', 'AWAY', 'DISMISSED'].includes(body.status)) {
      return reply.status(400).send({ error: 'Status inválido' })
    }

    const existing = await p.employee.findFirst({ where: { id, companyId, isActive: true } })
    if (!existing) return reply.status(404).send({ error: 'Colaborador não encontrado' })

    const updateData: any = { status: body.status }
    if (body.status === 'DISMISSED') {
      updateData.dismissalDate = body.dismissalDate ? new Date(body.dismissalDate) : new Date()
      updateData.projectId     = null  // remover de obra automaticamente
    }

    const updated = await p.employee.update({ where: { id }, data: updateData })

    const statusLabels: Record<string, string> = {
      ACTIVE:    'reativado',
      AWAY:      'afastado',
      DISMISSED: 'desligado',
    }
    const action = body.status === 'DISMISSED' ? 'DELETE' : 'UPDATE'
    const desc   = body.status === 'DISMISSED'
      ? `Colaborador desligado: '${existing.name}' (${existing.code}) — Data: ${formatDateBR(updateData.dismissalDate)}${body.reason ? ` · Motivo: ${body.reason}` : ''}`
      : `Colaborador ${statusLabels[body.status]}: '${existing.name}' (${existing.code})`

    await createAuditLog({
      prisma: p, companyId, userId,
      action, module: 'COLLABORATORS', entity: 'Employee',
      entityId: id, entityName: existing.name,
      description: desc,
      metadata: { status: body.status, reason: body.reason, observations: body.observations },
      request,
    })

    return reply.send(updated)
  })

  /**
   * DELETE /api/v1/employees/:id  (soft delete)
   */
  app.delete('/:id', async (request, reply) => {
    const req       = request as RequestWithMember
    const payload   = request.user as JwtPayload
    const companyId = req.companyId!
    const userId    = payload.sub
    const { id }    = request.params as { id: string }

    const existing = await p.employee.findFirst({ where: { id, companyId, isActive: true } })
    if (!existing) return reply.status(404).send({ error: 'Colaborador não encontrado' })

    await p.employee.update({ where: { id }, data: { isActive: false } })

    await createAuditLog({
      prisma: p, companyId, userId,
      action: 'DELETE', module: 'COLLABORATORS', entity: 'Employee',
      entityId: id, entityName: existing.name,
      description: `Colaborador removido: '${existing.name}' (${existing.code})`,
      request,
    })

    return reply.send({ success: true })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // DOCUMENTOS
  // ══════════════════════════════════════════════════════════════════════════

  app.post('/:id/documents', async (request, reply) => {
    const req       = request as RequestWithMember
    const payload   = request.user as JwtPayload
    const companyId = req.companyId!
    const userId    = payload.sub
    const { id }    = request.params as { id: string }

    const emp = await p.employee.findFirst({ where: { id, companyId, isActive: true } })
    if (!emp) return reply.status(404).send({ error: 'Colaborador não encontrado' })

    const body = request.body as {
      type:           string
      name:           string
      fileUrl?:       string
      fileType?:      string
      issueDate?:     string
      expiryDate?:    string
      observations?:  string
    }

    if (!body.type || !body.name) return reply.status(400).send({ error: 'type e name são obrigatórios' })

    const doc = await p.employeeDocument.create({
      data: {
        companyId,
        employeeId:   id,
        type:         body.type,
        name:         body.name.trim(),
        fileUrl:      body.fileUrl    ?? null,
        fileType:     body.fileType   ?? null,
        issueDate:    body.issueDate  ? new Date(body.issueDate)  : null,
        expiryDate:   body.expiryDate ? new Date(body.expiryDate) : null,
        observations: body.observations ?? null,
      },
    })

    const expiryLabel = body.expiryDate ? ` — Vence: ${formatDateBR(body.expiryDate)}` : ''
    await createAuditLog({
      prisma: p, companyId, userId,
      action: 'CREATE', module: 'COLLABORATORS', entity: 'EmployeeDocument',
      entityId: doc.id, entityName: body.name,
      description: `Documento adicionado: '${body.name}' para '${emp.name}'${expiryLabel}`,
      request,
    })

    return reply.status(201).send(doc)
  })

  app.put('/:id/documents/:docId', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id, docId } = request.params as { id: string; docId: string }

    const doc = await p.employeeDocument.findFirst({
      where: { id: docId, employeeId: id, companyId, isActive: true },
    })
    if (!doc) return reply.status(404).send({ error: 'Documento não encontrado' })

    const body = request.body as Record<string, any>
    const updated = await p.employeeDocument.update({
      where: { id: docId },
      data: {
        type:         body.type         ?? undefined,
        name:         body.name         ?? undefined,
        fileUrl:      body.fileUrl      !== undefined ? (body.fileUrl || null) : undefined,
        issueDate:    body.issueDate    ? new Date(body.issueDate)  : undefined,
        expiryDate:   body.expiryDate   ? new Date(body.expiryDate) : undefined,
        observations: body.observations ?? undefined,
      },
    })

    return reply.send(updated)
  })

  app.delete('/:id/documents/:docId', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id, docId } = request.params as { id: string; docId: string }

    const doc = await p.employeeDocument.findFirst({
      where: { id: docId, employeeId: id, companyId, isActive: true },
    })
    if (!doc) return reply.status(404).send({ error: 'Documento não encontrado' })

    await p.employeeDocument.update({ where: { id: docId }, data: { isActive: false } })
    return reply.send({ success: true })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // TREINAMENTOS
  // ══════════════════════════════════════════════════════════════════════════

  app.post('/:id/trainings', async (request, reply) => {
    const req       = request as RequestWithMember
    const payload   = request.user as JwtPayload
    const companyId = req.companyId!
    const userId    = payload.sub
    const { id }    = request.params as { id: string }

    const emp = await p.employee.findFirst({ where: { id, companyId, isActive: true } })
    if (!emp) return reply.status(404).send({ error: 'Colaborador não encontrado' })

    const body = request.body as {
      name:             string
      provider?:        string
      workload?:        number
      completedAt:      string
      expiresAt?:       string
      certificateUrl?:  string
      certificateType?: string
      observations?:    string
    }

    if (!body.name || !body.completedAt) {
      return reply.status(400).send({ error: 'name e completedAt são obrigatórios' })
    }

    const training = await p.employeeTraining.create({
      data: {
        companyId,
        employeeId:      id,
        name:            body.name.trim(),
        provider:        body.provider       ?? null,
        workload:        body.workload        ?? null,
        completedAt:     new Date(body.completedAt),
        expiresAt:       body.expiresAt ? new Date(body.expiresAt) : null,
        certificateUrl:  body.certificateUrl  ?? null,
        certificateType: body.certificateType ?? null,
        observations:    body.observations    ?? null,
      },
    })

    const expiryLabel = body.expiresAt ? ` — Vence: ${formatDateBR(body.expiresAt)}` : ''
    await createAuditLog({
      prisma: p, companyId, userId,
      action: 'CREATE', module: 'COLLABORATORS', entity: 'EmployeeTraining',
      entityId: training.id, entityName: body.name,
      description: `Treinamento registrado: '${body.name}' para '${emp.name}'${expiryLabel}`,
      request,
    })

    return reply.status(201).send(training)
  })

  app.put('/:id/trainings/:trainingId', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id, trainingId } = request.params as { id: string; trainingId: string }

    const t = await p.employeeTraining.findFirst({
      where: { id: trainingId, employeeId: id, companyId, isActive: true },
    })
    if (!t) return reply.status(404).send({ error: 'Treinamento não encontrado' })

    const body = request.body as Record<string, any>
    const updated = await p.employeeTraining.update({
      where: { id: trainingId },
      data: {
        name:           body.name           ?? undefined,
        provider:       body.provider       ?? undefined,
        workload:       body.workload        ?? undefined,
        completedAt:    body.completedAt    ? new Date(body.completedAt)  : undefined,
        expiresAt:      body.expiresAt      ? new Date(body.expiresAt)    : undefined,
        certificateUrl: body.certificateUrl ?? undefined,
        observations:   body.observations   ?? undefined,
      },
    })

    return reply.send(updated)
  })

  app.delete('/:id/trainings/:trainingId', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id, trainingId } = request.params as { id: string; trainingId: string }

    const t = await p.employeeTraining.findFirst({
      where: { id: trainingId, employeeId: id, companyId, isActive: true },
    })
    if (!t) return reply.status(404).send({ error: 'Treinamento não encontrado' })

    await p.employeeTraining.update({ where: { id: trainingId }, data: { isActive: false } })
    return reply.send({ success: true })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // FÉRIAS
  // ══════════════════════════════════════════════════════════════════════════

  app.post('/:id/vacations', async (request, reply) => {
    const req       = request as RequestWithMember
    const payload   = request.user as JwtPayload
    const companyId = req.companyId!
    const userId    = payload.sub
    const { id }    = request.params as { id: string }

    const emp = await p.employee.findFirst({ where: { id, companyId, isActive: true } })
    if (!emp) return reply.status(404).send({ error: 'Colaborador não encontrado' })

    const body = request.body as {
      startDate:     string
      endDate:       string
      days:          number
      observations?: string
    }

    if (!body.startDate || !body.endDate || !body.days) {
      return reply.status(400).send({ error: 'startDate, endDate e days são obrigatórios' })
    }

    const vacation = await p.employeeVacation.create({
      data: {
        companyId,
        employeeId:   id,
        startDate:    new Date(body.startDate),
        endDate:      new Date(body.endDate),
        days:         body.days,
        status:       'SCHEDULED',
        observations: body.observations ?? null,
      },
    })

    await createAuditLog({
      prisma: p, companyId, userId,
      action: 'CREATE', module: 'COLLABORATORS', entity: 'EmployeeVacation',
      entityId: vacation.id, entityName: emp.name,
      description: `Férias agendadas para '${emp.name}': ${formatDateBR(body.startDate)} a ${formatDateBR(body.endDate)} (${body.days} dias)`,
      request,
    })

    return reply.status(201).send(vacation)
  })

  app.put('/:id/vacations/:vacationId', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id, vacationId } = request.params as { id: string; vacationId: string }

    const v = await p.employeeVacation.findFirst({
      where: { id: vacationId, employeeId: id, companyId, isActive: true },
    })
    if (!v) return reply.status(404).send({ error: 'Férias não encontradas' })

    const body = request.body as Record<string, any>
    const updated = await p.employeeVacation.update({
      where: { id: vacationId },
      data: {
        startDate:    body.startDate ? new Date(body.startDate) : undefined,
        endDate:      body.endDate   ? new Date(body.endDate)   : undefined,
        days:         body.days         ?? undefined,
        status:       body.status       ?? undefined,
        observations: body.observations ?? undefined,
      },
    })

    return reply.send(updated)
  })

  app.delete('/:id/vacations/:vacationId', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id, vacationId } = request.params as { id: string; vacationId: string }

    const v = await p.employeeVacation.findFirst({
      where: { id: vacationId, employeeId: id, companyId, isActive: true },
    })
    if (!v) return reply.status(404).send({ error: 'Férias não encontradas' })

    await p.employeeVacation.update({ where: { id: vacationId }, data: { isActive: false } })
    return reply.send({ success: true })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // HISTÓRICO DE OBRAS / TRANSFERÊNCIA
  // ══════════════════════════════════════════════════════════════════════════

  /** Retorna o nome legível de um locationId fixo */
  function locationLabel(locationId: string | null | undefined): string {
    const map: Record<string, string> = {
      OFFICE: 'Escritório', DEPOSIT: 'Depósito', WAREHOUSE: 'Almoxarifado',
      TOOL_ROOM: 'Ferramentário', WORKSHOP: 'Oficina', YARD: 'Pátio',
      FIELD: 'Externo / Campo', MEDICAL_LEAVE: 'Afastado médico',
      VACATION: 'Férias', HOME_OFFICE: 'Home office',
    }
    if (!locationId) return ''
    return map[locationId] ?? locationId
  }

  /**
   * GET /api/v1/employees/:id/history
   * Histórico de obras / locais do colaborador.
   */
  app.get('/:id/history', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id }    = request.params as { id: string }

    const emp = await p.employee.findFirst({ where: { id, companyId, isActive: true } })
    if (!emp) return reply.status(404).send({ error: 'Colaborador não encontrado' })

    const history = await p.employeeProjectHistory.findMany({
      where:   { employeeId: id, companyId },
      include: { project: { select: { id: true, name: true, code: true } } },
      orderBy: { startDate: 'desc' },
    })

    return reply.send(history)
  })

  /**
   * POST /api/v1/employees/:id/transfer
   * Transfere colaborador para nova obra / local.
   * Salva histórico da alocação anterior.
   */
  app.post('/:id/transfer', async (request, reply) => {
    const req       = request as RequestWithMember
    const payload   = request.user as JwtPayload
    const companyId = req.companyId!
    const userId    = payload.sub
    const { id }    = request.params as { id: string }

    const body = request.body as {
      locationId:    string
      transferDate?: string
      reason?:       string
    }

    if (!body.locationId) return reply.status(400).send({ error: 'locationId é obrigatório' })

    const emp = await p.employee.findFirst({
      where:   { id, companyId, isActive: true },
      include: { project: { select: { id: true, name: true } } },
    })
    if (!emp) return reply.status(404).send({ error: 'Colaborador não encontrado' })

    // Calcular novo projectId e locationName
    let newProjectId:   string | null = null
    let newLocationName = ''

    if (body.locationId.startsWith('PROJECT_')) {
      newProjectId = body.locationId.replace('PROJECT_', '')
      const proj   = await prisma.project.findFirst({ where: { id: newProjectId, companyId, isActive: true } })
      if (!proj) return reply.status(404).send({ error: 'Obra não encontrada' })
      newLocationName = proj.name
    } else {
      newLocationName = locationLabel(body.locationId)
    }

    const transferDate = body.transferDate ? new Date(body.transferDate) : new Date()

    // Salvar histórico da alocação anterior
    const prevStart = (emp as any).lastTransferDate ?? emp.admissionDate ?? new Date()
    await p.employeeProjectHistory.create({
      data: {
        id:           crypto.randomBytes(12).toString('hex'),
        companyId,
        employeeId:   id,
        projectId:    emp.projectId ?? null,
        locationId:   (emp as any).locationId   ?? null,
        locationName: (emp as any).locationName ?? (emp.projectId ? (emp as any).project?.name ?? '' : ''),
        startDate:    prevStart,
        endDate:      transferDate,
        reason:       body.reason ?? 'Transferência',
        isActive:     true,
      },
    })

    // Atualizar colaborador
    const updated = await p.employee.update({
      where: { id },
      data: {
        projectId:        newProjectId,
        locationId:       body.locationId,
        locationName:     newLocationName,
        lastTransferDate: transferDate,
      },
      include: { project: { select: { id: true, name: true, code: true } } },
    })

    const prevLabel = (emp as any).locationName || (emp as any).project?.name || 'sem local'
    await createAuditLog({
      prisma: p, companyId, userId,
      action:     'UPDATE',
      module:     'COLLABORATORS',
      entity:     'Employee',
      entityId:   id,
      entityName: emp.name,
      description: `Colaborador '${emp.name}' transferido: '${prevLabel}' → '${newLocationName}'${body.reason ? ` · Motivo: ${body.reason}` : ''}`,
      request,
    })

    return reply.send(serialiseEmployee(updated))
  })

  // ══════════════════════════════════════════════════════════════════════════
  // FOLHA DE PAGAMENTO
  // ══════════════════════════════════════════════════════════════════════════

  const ENCARGOS_CLT = {
    inss_empregado:   0.14,
    fgts:             0.08,
    inss_patronal:    0.20,
    rat:              0.03,
    terceiros:        0.058,
    ferias_provisao:  0.1111,
    decimo_provisao:  0.0833,
  }

  function calcPayrollEntry(emp: any, horasExtras: number) {
    const salario        = toNum(emp.salary)
    const valorHora      = (salario / 220) * 1.5
    const valorHE        = horasExtras * valorHora
    const salarioBruto   = salario + valorHE

    if (emp.type === 'PJ' || emp.type === 'THIRD_PARTY') {
      return {
        employeeId: emp.id, name: emp.name, type: emp.type, role: emp.role,
        projectId:  emp.projectId,
        project:    emp.project,
        salarioBase: salario, horasExtras, valorHorasExtras: 0,
        salarioBruto: salario, inss: 0, salarioLiquido: salario,
        fgts: 0, encargosPatronais: 0, custoTotal: salario,
      }
    }

    const totalEncPct = ENCARGOS_CLT.inss_patronal + ENCARGOS_CLT.rat + ENCARGOS_CLT.terceiros
                      + ENCARGOS_CLT.ferias_provisao + ENCARGOS_CLT.decimo_provisao
    const inss             = salarioBruto * ENCARGOS_CLT.inss_empregado
    const fgts             = salarioBruto * ENCARGOS_CLT.fgts
    const encargosPatronais = salarioBruto * totalEncPct
    const custoTotal       = salarioBruto + fgts + encargosPatronais

    return {
      employeeId: emp.id, name: emp.name, type: emp.type, role: emp.role,
      projectId:  emp.projectId,
      project:    emp.project,
      salarioBase: salario, horasExtras, valorHorasExtras: valorHE,
      salarioBruto, inss,
      salarioLiquido: salarioBruto - inss,
      fgts, encargosPatronais, custoTotal,
    }
  }

  /**
   * GET /api/v1/employees/payroll-preview
   * Prévia da folha de pagamento.
   */
  app.get('/payroll-preview', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!

    const q = request.query as { month?: string; year?: string; projectId?: string }
    const now   = new Date()
    const month = parseInt(q.month ?? String(now.getMonth() + 1), 10)
    const year  = parseInt(q.year  ?? String(now.getFullYear()),  10)

    const where: any = {
      companyId,
      isActive: true,
      status:   { in: ['ACTIVE', 'AWAY'] },
      salary:   { not: null },
    }
    if (q.projectId) where.projectId = q.projectId

    const employees = await p.employee.findMany({
      where,
      include: { project: { select: { id: true, name: true, code: true } } },
      orderBy: { name: 'asc' },
    })

    const entries = employees.map((emp: any) => calcPayrollEntry(emp, 0))

    const totals = entries.reduce((acc: any, e: any) => ({
      totalSalariosBrutos:  acc.totalSalariosBrutos  + e.salarioBruto,
      totalSalariosLiquidos: acc.totalSalariosLiquidos + e.salarioLiquido,
      totalFgts:            acc.totalFgts            + e.fgts,
      totalEncargos:        acc.totalEncargos        + e.encargosPatronais,
      totalCustoEmpresa:    acc.totalCustoEmpresa    + e.custoTotal,
    }), { totalSalariosBrutos: 0, totalSalariosLiquidos: 0, totalFgts: 0, totalEncargos: 0, totalCustoEmpresa: 0 })

    return reply.send({
      month, year,
      entries,
      totals: { ...totals, quantidadeColaboradores: entries.length },
    })
  })

  /**
   * POST /api/v1/employees/payroll-launch
   * Lança folha no financeiro, criando uma transação por obra.
   */
  app.post('/payroll-launch', async (request, reply) => {
    const req       = request as RequestWithMember
    const payload   = request.user as JwtPayload
    const companyId = req.companyId!
    const userId    = payload.sub

    const body = request.body as {
      month:       number
      year:        number
      description: string
      entries: {
        employeeId:          string
        projectId?:          string | null
        salarioBruto:        number
        salarioLiquido:      number
        horasExtras:         number
        valorHorasExtras:    number
        fgts:                number
        encargosPatronais:   number
        custoTotal:          number
      }[]
    }

    if (!body.month || !body.year || !body.entries?.length) {
      return reply.status(400).send({ error: 'month, year e entries são obrigatórios' })
    }

    const MONTH_LABELS = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho',
      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
    const mesLabel = MONTH_LABELS[body.month] ?? String(body.month)

    // Agrupar colaboradores por projectId (null = sem obra)
    const byProject: Record<string, typeof body.entries> = {}
    for (const entry of body.entries) {
      const key = entry.projectId ?? 'null'
      if (!byProject[key]) byProject[key] = []
      byProject[key].push(entry)
    }

    // Buscar categoria de despesa "Folha" se existir
    const payrollCat = await p.financialCategory.findFirst({
      where: {
        companyId,
        isActive: true,
        type: { in: ['EXPENSE', 'BOTH'] },
        OR: [
          { name: { contains: 'folha', mode: 'insensitive' } },
          { name: { contains: 'pagamento', mode: 'insensitive' } },
          { name: { contains: 'salário', mode: 'insensitive' } },
        ],
      },
    })

    const referenceDate = new Date(body.year, body.month - 1, 1)
    const dueDate       = new Date(body.year, body.month, 0) // último dia do mês
    const createdTransactions: any[] = []

    for (const [projectKey, entries] of Object.entries(byProject)) {
      const projectId   = projectKey === 'null' ? null : projectKey
      const total       = entries.reduce((sum, e) => sum + e.custoTotal, 0)
      const empNames    = entries.map(e => {
        const emp = body.entries.find(x => x.employeeId === e.employeeId)
        return emp?.employeeId ?? e.employeeId
      })

      // Buscar nomes
      const empRecs = await p.employee.findMany({
        where: { id: { in: entries.map(e => e.employeeId) }, companyId },
        select: { id: true, name: true },
      })
      const nameMap: Record<string, string> = Object.fromEntries(empRecs.map((e: any) => [e.id, e.name]))
      const names = entries.map(e => nameMap[e.employeeId] ?? e.employeeId).join(', ')

      let projectName = 'Administrativo'
      if (projectId) {
        const proj = await prisma.project.findFirst({ where: { id: projectId }, select: { name: true } })
        if (proj) projectName = proj.name
      }

      const txHash = crypto.randomBytes(16).toString('hex')
      const txNum  = `PAY-${body.year}${String(body.month).padStart(2,'0')}-${Date.now()}`

      const tx = await p.financialTransaction.create({
        data: {
          companyId,
          createdById:  userId,
          type:         'EXPENSE',
          status:       'PENDING',
          isPaid:       false,
          description:  `Folha ${mesLabel}/${body.year} — ${projectName} (${entries.length} colab.)`,
          observations: `Colaboradores: ${names}`,
          grossAmount:  total,
          netAmount:    total,
          dueDate,
          referenceDate,
          projectId:    projectId ?? undefined,
          categoryId:   payrollCat?.id ?? undefined,
          isPayroll:    true,
          payrollMonth: body.month,
          payrollYear:  body.year,
          transactionHash:   txHash,
          transactionNumber: txNum,
          isActive:     true,
          origin:       'SYSTEM',
        },
      })
      createdTransactions.push(tx)
    }

    const totalGeral = body.entries.reduce((sum, e) => sum + e.custoTotal, 0)
    const fmt = (n: number) => `R$ ${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`

    await createAuditLog({
      prisma: p, companyId, userId,
      action:     'CREATE',
      module:     'COLLABORATORS',
      entity:     'Payroll',
      entityId:   `${body.year}-${body.month}`,
      entityName: `Folha ${mesLabel}/${body.year}`,
      description: `Folha ${mesLabel}/${body.year} lançada — ${body.entries.length} colaboradores · Total: ${fmt(totalGeral)}`,
      request,
    })

    return reply.status(201).send({
      success: true,
      transactionsCreated: createdTransactions.length,
      total: totalGeral,
    })
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// UPLOAD de foto do colaborador (rota separada em /uploads/employee-photo)
// ══════════════════════════════════════════════════════════════════════════════

export async function employeePhotoUploadRoute(app: FastifyInstance) {

  // ─── Foto do colaborador ────────────────────────────────────────────────────
  app.post('/employee-photo', {
    preHandler: [authenticate, requireCompany],
  }, async (request, reply) => {
    const req       = request as RequestWithMember
    const { companyId } = req

    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado' })

    if (!ALLOWED_TYPES.includes(data.mimetype)) {
      return reply.status(400).send({ error: 'Tipo inválido. Apenas JPEG, PNG, WEBP e HEIC são aceitos.' })
    }

    let buffer: Buffer
    try {
      buffer = await streamToBuffer(data.file)
    } catch {
      return reply.status(500).send({ error: 'Erro ao ler arquivo' })
    }

    if (buffer.length > 5 * 1024 * 1024) {
      return reply.status(400).send({ error: 'Arquivo muito grande. Máximo 5MB.' })
    }

    const dir      = path.join(UPLOADS_ROOT, 'employees', companyId)
    const basename = `${Date.now()}-${data.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)}`

    const result = await processAndSaveImage({
      inputBuffer: buffer,
      outputDir:   dir,
      filename:    basename,
      type:        'avatar',
    })

    return reply.send({
      url:          result.relativePath,
      filename:     path.basename(result.savedPath),
      size:         result.compressedSize,
      originalSize: result.originalSize,
    })
  })

  // ─── Certificado de treinamento ─────────────────────────────────────────────
  app.post('/employee-certificate', {
    preHandler: [authenticate, requireCompany],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req

    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado' })

    const ALLOWED = [...ALLOWED_TYPES, 'application/pdf']
    if (!ALLOWED.includes(data.mimetype)) {
      return reply.status(400).send({ error: 'Tipo inválido. JPEG, PNG, WEBP ou PDF.' })
    }

    let buffer: Buffer
    try { buffer = await streamToBuffer(data.file) }
    catch { return reply.status(500).send({ error: 'Erro ao ler arquivo' }) }

    if (buffer.length > 10 * 1024 * 1024) {
      return reply.status(400).send({ error: 'Arquivo muito grande. Máximo 10MB.' })
    }

    const dir       = path.join(UPLOADS_ROOT, 'employees', companyId, 'certificates')
    fs.mkdirSync(dir, { recursive: true })
    const basename  = `${Date.now()}-${data.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)}`
    const isPdf     = data.mimetype === 'application/pdf'

    let filePath: string
    let relPath:  string

    if (isPdf) {
      filePath = path.join(dir, basename)
      fs.writeFileSync(filePath, buffer)
      relPath  = `/uploads/employees/${companyId}/certificates/${basename}`
    } else {
      const result = await processAndSaveImage({
        inputBuffer: buffer,
        outputDir:   dir,
        filename:    basename,
        type:        'diary',  // max 1200px, q85
      })
      filePath = result.savedPath
      relPath  = result.relativePath
    }

    return reply.send({
      url:  relPath,
      type: isPdf ? 'pdf' : 'image',
      size: buffer.length,
    })
  })

  // ─── Arquivo de documento do colaborador ───────────────────────────────────
  app.post('/employee-document', {
    preHandler: [authenticate, requireCompany],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req

    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado' })

    const ALLOWED = [...ALLOWED_TYPES, 'application/pdf']
    if (!ALLOWED.includes(data.mimetype)) {
      return reply.status(400).send({ error: 'Tipo inválido. JPEG, PNG, WEBP ou PDF.' })
    }

    let buffer: Buffer
    try { buffer = await streamToBuffer(data.file) }
    catch { return reply.status(500).send({ error: 'Erro ao ler arquivo' }) }

    if (buffer.length > 10 * 1024 * 1024) {
      return reply.status(400).send({ error: 'Arquivo muito grande. Máximo 10MB.' })
    }

    const dir       = path.join(UPLOADS_ROOT, 'employees', companyId, 'documents')
    fs.mkdirSync(dir, { recursive: true })
    const basename  = `${Date.now()}-${data.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)}`
    const isPdf     = data.mimetype === 'application/pdf'

    let relPath: string

    if (isPdf) {
      const filePath = path.join(dir, basename)
      fs.writeFileSync(filePath, buffer)
      relPath = `/uploads/employees/${companyId}/documents/${basename}`
    } else {
      const result = await processAndSaveImage({
        inputBuffer: buffer,
        outputDir:   dir,
        filename:    basename,
        type:        'diary',
      })
      relPath = result.relativePath
    }

    return reply.send({
      url:  relPath,
      type: isPdf ? 'pdf' : 'image',
      size: buffer.length,
    })
  })
}
