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
      // Férias: apenas tipos elegíveis (CLT, Estagiário, Temporário)
      p.employeeVacation.count({
        where: {
          companyId, isActive: true,
          status: { in: ['SCHEDULED', 'ACTIVE'] },
          employee: { type: { in: ['CLT', 'INTERN', 'TEMPORARY'] } },
        },
      }),
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
      status?:         string
      type?:           string
      projectId?:      string
      role?:           string
      search?:         string
      page?:           string
      limit?:          string
      semFornecedor?:  string
    }

    const page  = Math.max(1, parseInt(q.page  ?? '1',  10))
    const limit = Math.min(100, parseInt(q.limit ?? '20', 10))
    const skip  = (page - 1) * limit

    const where: any = { companyId, isActive: true }
    if (q.status    && q.status    !== 'ALL') where.status    = q.status
    if (q.role      && q.role      !== 'ALL') where.role      = q.role
    if (q.projectId && q.projectId !== 'ALL') {
      where.projectId = q.projectId === 'NONE' ? null : q.projectId
    }
    if (q.semFornecedor === 'true') {
      // Filtro especial: PJ/Terceirizado sem fornecedor vinculado
      where.type       = { in: ['PJ', 'THIRD_PARTY'] }
      where.supplierId = null
    } else if (q.type && q.type !== 'ALL') {
      // Múltiplos tipos separados por vírgula: ?type=PJ,THIRD_PARTY
      const types = q.type.split(',').map(t => t.trim()).filter(Boolean)
      where.type = types.length === 1 ? types[0] : { in: types }
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
          supplier:  { select: { id: true, name: true } },
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
      salary?:        number
      projectId?:     string
      locationId?:    string
      locationName?:  string
      locationType?:  string
      locationFixed?: string
      // Dados PJ
      pjCnpj?:         string
      pjRazaoSocial?:  string
      pjNomeFantasia?: string
      pjEmail?:        string
      pjPhone?:        string
      // Dados bancários
      bankType?:         string
      bankPixKey?:       string
      bankPixKeyType?:   string
      bankName?:         string
      bankCode?:         string
      bankAgency?:       string
      bankAgencyDigit?:  string
      bankAccount?:      string
      bankAccountDigit?: string
      bankAccountType?:  string
      bankHolderName?:   string
      bankHolderDoc?:    string
      supplierId?:       string | null
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

    // Validar fornecedor se fornecido
    if (body.supplierId) {
      const supplier = await p.supplier.findFirst({ where: { id: body.supplierId, companyId } })
      if (!supplier) {
        return reply.status(400).send({ error: 'INVALID_SUPPLIER', message: 'Fornecedor não encontrado ou não pertence a esta empresa' })
      }
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
        salary:        body.salary       ?? null,
        projectId:     body.projectId    ?? null,
        locationId:    body.locationId   ?? null,
        locationName:  body.locationName ?? null,
        locationType:  body.locationType  ?? null,
        locationFixed: body.locationFixed ?? null,
        // Dados PJ
        pjCnpj:        body.pjCnpj        ? body.pjCnpj.replace(/\D/g, '') : null,
        pjRazaoSocial: body.pjRazaoSocial  ?? null,
        pjNomeFantasia:body.pjNomeFantasia ?? null,
        pjEmail:       body.pjEmail        ?? null,
        pjPhone:       body.pjPhone        ? body.pjPhone.replace(/\D/g, '') : null,
        // Dados bancários
        bankType:        body.bankType        ?? null,
        bankPixKey:      body.bankPixKey      ?? null,
        bankPixKeyType:  body.bankPixKeyType  ?? null,
        bankName:        body.bankName        ?? null,
        bankCode:        body.bankCode        ?? null,
        bankAgency:      body.bankAgency      ?? null,
        bankAgencyDigit: body.bankAgencyDigit ?? null,
        bankAccount:     body.bankAccount     ?? null,
        bankAccountDigit:body.bankAccountDigit ?? null,
        bankAccountType: body.bankAccountType  ?? null,
        bankHolderName:  body.bankHolderName  ?? null,
        bankHolderDoc:   body.bankHolderDoc   ? body.bankHolderDoc.replace(/\D/g, '') : null,
        supplierId:      body.supplierId       ?? null,
        status:        'ACTIVE',
        isActive:      true,
      },
      include: {
        project:  { select: { id: true, name: true, code: true } },
        supplier: { select: { id: true, name: true, type: true, cpfCnpj: true, cnpj: true } },
      },
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
        supplier:   { select: { id: true, name: true, type: true, cpfCnpj: true, cnpj: true, category: true } },
        documents:  { where: { isActive: true }, orderBy: { expiryDate: 'asc' } },
        trainings:  { where: { isActive: true }, orderBy: { expiresAt:  'asc' } },
        vacations:  { where: { isActive: true }, orderBy: { startDate: 'desc' } },
        epiDeliveries: {
          where:   { employee: { companyId } },
          orderBy: { deliveredAt: 'desc' },
          take:    20,
        },
        // EPIs entregues via módulo de Depósito (StockEpiDelivery — vinculado ao item de estoque)
        stockEpiDeliveries: {
          where:   { companyId },
          orderBy: { deliveredAt: 'desc' },
          include: {
            stockItem:   { select: { id: true, name: true, code: true, unit: true, brand: true, caNumber: true } },
            location:    { select: { id: true, name: true } },
            responsible: { select: { id: true, name: true } },
          },
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

    // Validar fornecedor se fornecido
    if (body.supplierId) {
      const supplier = await p.supplier.findFirst({ where: { id: body.supplierId, companyId } })
      if (!supplier) {
        return reply.status(400).send({ error: 'INVALID_SUPPLIER', message: 'Fornecedor não encontrado ou não pertence a esta empresa' })
      }
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
        locationType:  body.locationType  !== undefined ? (body.locationType  || null) : undefined,
        locationFixed: body.locationFixed !== undefined ? (body.locationFixed || null) : undefined,
        // Dados PJ (limpar dígitos do CNPJ)
        pjCnpj:        body.pjCnpj        !== undefined ? (body.pjCnpj ? body.pjCnpj.replace(/\D/g, '') : null) : undefined,
        pjRazaoSocial: body.pjRazaoSocial  !== undefined ? (body.pjRazaoSocial  || null) : undefined,
        pjNomeFantasia:body.pjNomeFantasia !== undefined ? (body.pjNomeFantasia || null) : undefined,
        pjEmail:       body.pjEmail        !== undefined ? (body.pjEmail        || null) : undefined,
        pjPhone:       body.pjPhone        !== undefined ? (body.pjPhone ? body.pjPhone.replace(/\D/g, '') : null) : undefined,
        // Dados bancários
        bankType:        body.bankType        !== undefined ? (body.bankType        || null) : undefined,
        bankPixKey:      body.bankPixKey      !== undefined ? (body.bankPixKey      || null) : undefined,
        bankPixKeyType:  body.bankPixKeyType  !== undefined ? (body.bankPixKeyType  || null) : undefined,
        bankName:        body.bankName        !== undefined ? (body.bankName        || null) : undefined,
        bankCode:        body.bankCode        !== undefined ? (body.bankCode        || null) : undefined,
        bankAgency:      body.bankAgency      !== undefined ? (body.bankAgency      || null) : undefined,
        bankAgencyDigit: body.bankAgencyDigit !== undefined ? (body.bankAgencyDigit || null) : undefined,
        bankAccount:     body.bankAccount     !== undefined ? (body.bankAccount     || null) : undefined,
        bankAccountDigit:body.bankAccountDigit !== undefined ? (body.bankAccountDigit || null) : undefined,
        bankAccountType: body.bankAccountType  !== undefined ? (body.bankAccountType  || null) : undefined,
        bankHolderName:  body.bankHolderName  !== undefined ? (body.bankHolderName  || null) : undefined,
        bankHolderDoc:   body.bankHolderDoc   !== undefined ? (body.bankHolderDoc ? body.bankHolderDoc.replace(/\D/g, '') : null) : undefined,
        supplierId:      body.supplierId      !== undefined ? (body.supplierId || null) : undefined,
      },
      include: {
        project:  { select: { id: true, name: true, code: true } },
        supplier: { select: { id: true, name: true, type: true, cpfCnpj: true, cnpj: true } },
      },
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
   * GET /api/v1/employees/:id/financial-summary
   * Resumo financeiro do colaborador PJ/Terceirizado via fornecedor vinculado.
   */
  app.get('/:id/financial-summary', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { id }    = request.params as { id: string }

    const employee = await p.employee.findFirst({
      where:   { id, companyId, isActive: true },
      include: { supplier: true },
    })
    if (!employee) return reply.status(404).send({ error: 'Colaborador não encontrado' })

    if (!employee.supplierId) {
      return reply.send({ hasSupplier: false })
    }

    const transactions = await p.financialTransaction.findMany({
      where: {
        companyId,
        supplierId: employee.supplierId,
        isActive:   true,
        isPaid:     true,
        type:       'EXPENSE',
      },
      include: {
        project:  { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
      orderBy: { paymentDate: 'desc' },
    })

    const totalPago  = transactions.reduce((s: number, t: any) => s + Number(t.netValue ?? t.amount ?? 0), 0)
    const totalNFs   = transactions.length
    const ticketMedio = totalNFs > 0 ? totalPago / totalNFs : 0

    const porObraMap: Record<string, any> = {}
    for (const t of transactions) {
      const key  = t.projectId || 'sem-obra'
      const name = t.project?.name || 'Sem obra'
      if (!porObraMap[key]) porObraMap[key] = { projectId: t.projectId, name, total: 0, count: 0 }
      porObraMap[key].total += Number(t.netValue ?? t.amount ?? 0)
      porObraMap[key].count++
    }

    const porMesMap: Record<string, any> = {}
    for (const t of transactions) {
      const mes = t.paymentDate
        ? new Date(t.paymentDate).toISOString().slice(0, 7)
        : 'sem-data'
      if (!porMesMap[mes]) porMesMap[mes] = { mes, total: 0, count: 0 }
      porMesMap[mes].total += Number(t.netValue ?? t.amount ?? 0)
      porMesMap[mes].count++
    }

    return reply.send({
      hasSupplier: true,
      supplier:    employee.supplier,
      summary: {
        totalPago,
        totalNFs,
        ticketMedio,
        primeiroLancamento: transactions.length > 0 ? transactions[transactions.length - 1].paymentDate : null,
        ultimoLancamento:   transactions.length > 0 ? transactions[0].paymentDate : null,
      },
      porObra:            Object.values(porObraMap).sort((a: any, b: any) => b.total - a.total),
      porMes:             Object.values(porMesMap).sort((a: any, b: any) => a.mes.localeCompare(b.mes)),
      ultimosLancamentos: transactions.slice(0, 10),
    })
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

  // Tipos de colaborador elegíveis para férias CLT
  const VACATION_ELIGIBLE = ['CLT', 'INTERN', 'TEMPORARY']

  app.post('/:id/vacations', async (request, reply) => {
    const req       = request as RequestWithMember
    const payload   = request.user as JwtPayload
    const companyId = req.companyId!
    const userId    = payload.sub
    const { id }    = request.params as { id: string }

    const emp = await p.employee.findFirst({ where: { id, companyId, isActive: true } })
    if (!emp) return reply.status(404).send({ error: 'Colaborador não encontrado' })

    // Validar elegibilidade
    if (!VACATION_ELIGIBLE.includes(emp.type)) {
      return reply.status(400).send({
        error: `Colaboradores do tipo "${emp.type}" não têm direito a férias pelo regime CLT. Apenas CLT, Estagiário e Temporário são elegíveis.`,
        type:  emp.type,
        eligible: false,
      })
    }

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
  // EQUIPE POR OBRA
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v1/employees/by-project/:projectId
   * Retorna colaboradores alocados e não alocados nessa obra.
   * Usado pelo RDO e pela aba Equipe do Centro de Custo.
   */
  app.get('/by-project/:projectId', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const { projectId } = request.params as { projectId: string }

    const [allocated, others, historyRaw] = await Promise.all([
      // Colaboradores atualmente nessa obra
      p.employee.findMany({
        where:   { companyId, projectId, isActive: true, status: { in: ['ACTIVE', 'AWAY'] } },
        select:  {
          id: true, name: true, code: true, role: true, type: true, status: true,
          photo: true, phone: true, admissionDate: true,
          lastTransferDate: true,
        },
        orderBy: { name: 'asc' },
      }),
      // Demais colaboradores ativos (sem essa obra)
      p.employee.findMany({
        where: {
          companyId, isActive: true, status: { in: ['ACTIVE', 'AWAY'] },
          OR: [{ projectId: null }, { projectId: { not: projectId } }],
        },
        select: {
          id: true, name: true, code: true, role: true, type: true, status: true,
          photo: true, projectId: true,
          project: { select: { id: true, name: true, code: true } },
        },
        orderBy: { name: 'asc' },
      }),
      // Histórico de quem já esteve nessa obra
      p.employeeProjectHistory.findMany({
        where:   { companyId, projectId },
        include: { employee: { select: { id: true, name: true, code: true, role: true } } },
        orderBy: { startDate: 'desc' },
        take:    50,
      }),
    ])

    return reply.send({ allocated, others, history: historyRaw })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // VISÃO GERAL DE FÉRIAS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v1/employees/vacations-overview
   * Retorna: emFerias, agendadas, vencendo30/60/90, vencidas, todas, totais.
   */
  app.get('/vacations-overview', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const hoje = new Date()

    // Tipos de vínculo que têm direito a férias
    const VACATION_ELIGIBLE = ['CLT', 'INTERN', 'TEMPORARY']

    // Helper: calcula prazo de vencimento das férias
    function calcDeadline(admissionDate: Date, lastVacEnd?: Date): Date {
      const base   = lastVacEnd ?? admissionDate
      const months = lastVacEnd ? 12 : 24   // CLT: 1º período = adm+24m; demais = última+12m
      const d = new Date(base)
      d.setMonth(d.getMonth() + months)
      return d
    }

    const [emFeriasRaw, agendadasRaw, allActive, todasRaw] = await Promise.all([
      // Em férias agora: startDate <= hoje <= endDate — apenas tipos elegíveis
      p.employeeVacation.findMany({
        where: {
          companyId,
          isActive: true,
          startDate: { lte: hoje },
          endDate:   { gte: hoje },
          employee:  { type: { in: VACATION_ELIGIBLE } },
        },
        include: {
          employee: {
            select: {
              id: true, name: true, code: true, role: true, photo: true,
              project: { select: { name: true } },
            },
          },
        },
        orderBy: { endDate: 'asc' },
      }),

      // Agendadas (futuras) — apenas tipos elegíveis
      p.employeeVacation.findMany({
        where: {
          companyId,
          isActive:  true,
          status:    'SCHEDULED',
          startDate: { gt: hoje },
          employee:  { type: { in: VACATION_ELIGIBLE } },
        },
        include: {
          employee: {
            select: { id: true, name: true, code: true, role: true, photo: true },
          },
        },
        orderBy: { startDate: 'asc' },
      }),

      // Colaboradores ativos para cálculo de vencimento — apenas tipos elegíveis
      p.employee.findMany({
        where: {
          companyId,
          isActive: true,
          status:   { in: ['ACTIVE', 'AWAY'] },
          admissionDate: { not: null },
          type: { in: VACATION_ELIGIBLE },
        },
        select: {
          id: true, name: true, code: true, role: true, photo: true,
          admissionDate: true,
          project: { select: { name: true } },
          vacations: {
            where:   { isActive: true, status: 'COMPLETED' },
            orderBy: { endDate: 'desc' },
            take: 1,
            select: { endDate: true },
          },
        },
      }),

      // Todas as férias (histórico) — apenas tipos elegíveis
      p.employeeVacation.findMany({
        where:   { companyId, isActive: true, employee: { type: { in: VACATION_ELIGIBLE } } },
        include: {
          employee: {
            select: { id: true, name: true, code: true, role: true, photo: true },
          },
        },
        orderBy: { startDate: 'desc' },
        take: 300,
      }),
    ])

    // Classificar colaboradores por vencimento de férias
    const emFeriasIds = new Set(emFeriasRaw.map((v: any) => v.employee?.id).filter(Boolean))
    const agendadasIds = new Set(agendadasRaw.map((v: any) => v.employee?.id).filter(Boolean))

    const vencendo30: any[] = []
    const vencendo60: any[] = []
    const vencendo90: any[] = []
    const vencidas:   any[] = []

    for (const emp of allActive) {
      // Pular quem está em férias agora ou tem agendamento futuro
      if (emFeriasIds.has(emp.id) || agendadasIds.has(emp.id)) continue

      const lastVacEnd   = emp.vacations?.[0]?.endDate ? new Date(emp.vacations[0].endDate) : undefined
      const deadline     = calcDeadline(new Date(emp.admissionDate), lastVacEnd)
      const daysToDeadline = Math.ceil((deadline.getTime() - hoje.getTime()) / 86_400_000)

      const entry = {
        ...emp,
        deadline:       deadline.toISOString(),
        daysToDeadline,
        admissionDate:  emp.admissionDate instanceof Date ? emp.admissionDate.toISOString() : emp.admissionDate,
      }

      if      (daysToDeadline < 0)  vencidas.push(entry)
      else if (daysToDeadline <= 30) vencendo30.push(entry)
      else if (daysToDeadline <= 60) vencendo60.push(entry)
      else if (daysToDeadline <= 90) vencendo90.push(entry)
    }

    // Ordenar vencidas pelo mais atrasado primeiro
    vencidas.sort((a: any, b: any) => a.daysToDeadline - b.daysToDeadline)

    return reply.send({
      emFerias:  emFeriasRaw,
      agendadas: agendadasRaw,
      vencendo30,
      vencendo60,
      vencendo90,
      vencidas,
      todas: todasRaw,
      totais: {
        emFerias:   emFeriasRaw.length,
        agendadas:  agendadasRaw.length,
        vencendo30: vencendo30.length,
        vencendo60: vencendo60.length,
        vencendo90: vencendo90.length,
        vencidas:   vencidas.length,
      },
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // FOLHA DE PAGAMENTO
  // ══════════════════════════════════════════════════════════════════════════

  const ENCARGOS_CLT = {
    fgts:            0.08,
    inss_patronal:   0.20,
    rat:             0.03,
    terceiros:       0.058,
    ferias_provisao: 0.1111,
    decimo_provisao: 0.0833,
  }

  /** INSS progressivo 2024 — tabela empregado */
  function calcularINSS(salarioBruto: number): number {
    const faixas = [
      { limite: 1412.00,  aliquota: 0.075 },
      { limite: 2666.68,  aliquota: 0.09  },
      { limite: 4000.03,  aliquota: 0.12  },
      { limite: 7786.02,  aliquota: 0.14  },
    ]
    let inss = 0; let anterior = 0
    for (const faixa of faixas) {
      const base = Math.min(salarioBruto, faixa.limite) - anterior
      if (base <= 0) break
      inss += base * faixa.aliquota
      anterior = faixa.limite
      if (salarioBruto <= faixa.limite) break
    }
    return parseFloat(inss.toFixed(2))
  }

  /** IRRF 2024 — deducao padrão (sem dependentes para simplificar) */
  function calcularIRRF(baseCalculo: number): number {
    if (baseCalculo <= 2259.20) return 0
    if (baseCalculo <= 2826.65) return parseFloat((baseCalculo * 0.075 - 169.44).toFixed(2))
    if (baseCalculo <= 3751.05) return parseFloat((baseCalculo * 0.15  - 381.44).toFixed(2))
    if (baseCalculo <= 4664.68) return parseFloat((baseCalculo * 0.225 - 662.77).toFixed(2))
    return parseFloat((baseCalculo * 0.275 - 896.00).toFixed(2))
  }

  function calcPayrollEntry(
    emp: any,
    horasExtras60: number,
    horasExtras100: number,
  ) {
    const salario   = toNum(emp.salary)
    const valorHora = salario / 220

    const valorHE60  = horasExtras60  * valorHora * 1.60
    const valorHE100 = horasExtras100 * valorHora * 2.00
    const valorHETotal = valorHE60 + valorHE100

    const salarioBruto = salario + valorHETotal

    if (emp.type === 'PJ' || emp.type === 'THIRD_PARTY') {
      return {
        employeeId: emp.id, name: emp.name, type: emp.type, role: emp.role,
        projectId:  emp.projectId,
        project:    emp.project,
        salarioBase: salario,
        horasExtras60: 0, horasExtras100: 0,
        valorHorasExtras60: 0, valorHorasExtras100: 0, valorHorasExtras: 0,
        salarioBruto: salario, inss: 0, irrf: 0, salarioLiquido: salario,
        fgts: 0, encargosPatronais: 0, custoTotal: salario,
      }
    }

    const totalEncPct = ENCARGOS_CLT.inss_patronal + ENCARGOS_CLT.rat + ENCARGOS_CLT.terceiros
                      + ENCARGOS_CLT.ferias_provisao + ENCARGOS_CLT.decimo_provisao
    const inss             = calcularINSS(salarioBruto)
    const baseIRRF         = Math.max(0, salarioBruto - inss)
    const irrf             = calcularIRRF(baseIRRF)
    const fgts             = parseFloat((salarioBruto * ENCARGOS_CLT.fgts).toFixed(2))
    const encargosPatronais = parseFloat((salarioBruto * totalEncPct).toFixed(2))
    const custoTotal       = parseFloat((salarioBruto + fgts + encargosPatronais).toFixed(2))

    return {
      employeeId: emp.id, name: emp.name, type: emp.type, role: emp.role,
      projectId:  emp.projectId,
      project:    emp.project,
      salarioBase: salario,
      horasExtras60,  valorHorasExtras60:  parseFloat(valorHE60.toFixed(2)),
      horasExtras100, valorHorasExtras100: parseFloat(valorHE100.toFixed(2)),
      valorHorasExtras: parseFloat(valorHETotal.toFixed(2)),
      salarioBruto: parseFloat(salarioBruto.toFixed(2)),
      inss, irrf,
      salarioLiquido: parseFloat((salarioBruto - inss - irrf).toFixed(2)),
      fgts, encargosPatronais, custoTotal,
    }
  }

  /**
   * GET /api/v1/employees/payroll-preview
   * Prévia da folha de pagamento.
   * Parâmetros:
   *   month, year         — período (default: mês atual)
   *   projectId           — filtrar por obra
   *   horasExtras60/100   — horas extras globais
   *   includeAll=true     — incluir PJ e Terceirizados (sem encargos)
   */
  app.get('/payroll-preview', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!

    const q = request.query as {
      month?: string; year?: string; projectId?: string
      horasExtras60?: string; horasExtras100?: string
      includeAll?: string
    }
    const now        = new Date()
    const month      = parseInt(q.month ?? String(now.getMonth() + 1), 10)
    const year       = parseInt(q.year  ?? String(now.getFullYear()),  10)
    const he60       = parseFloat(q.horasExtras60  ?? '0') || 0
    const he100      = parseFloat(q.horasExtras100 ?? '0') || 0
    const includeAll = q.includeAll === 'true'

    const CLT_TYPES = ['CLT', 'INTERN', 'TEMPORARY']
    const ALL_TYPES = ['CLT', 'INTERN', 'TEMPORARY', 'PJ', 'THIRD_PARTY']

    const where: any = {
      companyId,
      isActive: true,
      status:   { in: ['ACTIVE', 'AWAY'] },
      salary:   { not: null },
      type:     { in: includeAll ? ALL_TYPES : CLT_TYPES },
    }
    if (q.projectId) where.projectId = q.projectId

    const employees = await p.employee.findMany({
      where,
      include: {
        project:  { select: { id: true, name: true, code: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    })

    const entries = employees.map((emp: any) => {
      const isClt = CLT_TYPES.includes(emp.type)
      if (!isClt) {
        // PJ / Terceirizado: sem encargos — apenas salário acordado
        const salario = parseFloat(emp.salary ?? 0)
        return {
          employeeId:          emp.id,
          name:                emp.name,
          type:                emp.type,
          role:                emp.role,
          projectId:           emp.projectId,
          project:             emp.project,
          supplierId:          emp.supplierId   ?? null,
          supplierName:        emp.supplier?.name ?? null,
          salarioBase:         salario,
          horasExtras60:       0,
          horasExtras100:      0,
          valorHorasExtras60:  0,
          valorHorasExtras100: 0,
          valorHorasExtras:    0,
          salarioBruto:        salario,
          inss:                0,
          irrf:                0,
          salarioLiquido:      salario,
          fgts:                0,
          encargosPatronais:   0,
          custoTotal:          salario,
          isClt:               false,
        }
      }
      return { ...calcPayrollEntry(emp, he60, he100), isClt: true, supplierId: null, supplierName: null }
    })

    const totals = entries.reduce((acc: any, e: any) => ({
      totalSalariosBrutos:   acc.totalSalariosBrutos   + e.salarioBruto,
      totalSalariosLiquidos: acc.totalSalariosLiquidos  + e.salarioLiquido,
      totalINSS:             acc.totalINSS              + e.inss,
      totalIRRF:             acc.totalIRRF              + e.irrf,
      totalFgts:             acc.totalFgts              + e.fgts,
      totalEncargos:         acc.totalEncargos          + e.encargosPatronais,
      totalCustoEmpresa:     acc.totalCustoEmpresa      + e.custoTotal,
      totalHorasExtras60:    acc.totalHorasExtras60     + (e.horasExtras60  ?? 0),
      totalHorasExtras100:   acc.totalHorasExtras100    + (e.horasExtras100 ?? 0),
    }), {
      totalSalariosBrutos: 0, totalSalariosLiquidos: 0,
      totalINSS: 0, totalIRRF: 0,
      totalFgts: 0, totalEncargos: 0, totalCustoEmpresa: 0,
      totalHorasExtras60: 0, totalHorasExtras100: 0,
    })

    return reply.send({
      month, year,
      entries,
      totals: { ...totals, quantidadeColaboradores: entries.length },
    })
  })

  /**
   * GET /api/v1/employees/payroll-draft?month=&year=
   * Carrega rascunho de folha existente.
   */
  app.get('/payroll-draft', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const q         = request.query as { month?: string; year?: string }
    const month     = parseInt(q.month ?? '0', 10)
    const year      = parseInt(q.year  ?? '0', 10)

    if (!month || !year) {
      return reply.status(400).send({ error: 'month e year são obrigatórios' })
    }

    const draft = await p.payrollDraft.findUnique({
      where: { companyId_month_year: { companyId, month, year } },
    })

    if (!draft) return reply.status(404).send({ error: 'Nenhum rascunho encontrado' })
    return reply.send({ draft })
  })

  /**
   * POST /api/v1/employees/payroll-draft
   * Salva/atualiza rascunho de folha (upsert por companyId+month+year).
   */
  app.post('/payroll-draft', async (request, reply) => {
    const req       = request as RequestWithMember
    const payload   = request.user as JwtPayload
    const companyId = req.companyId!
    const userId    = payload.sub

    const body = request.body as {
      month:              number
      year:               number
      data:               any
      totalBruto:         number
      totalLiquido:       number
      totalColaboradores: number
      observations?:      string
    }

    if (!body.month || !body.year || !body.data) {
      return reply.status(400).send({ error: 'month, year e data são obrigatórios' })
    }

    const draft = await p.payrollDraft.upsert({
      where:  { companyId_month_year: { companyId, month: body.month, year: body.year } },
      update: {
        data:               body.data,
        totalBruto:         body.totalBruto,
        totalLiquido:       body.totalLiquido,
        totalColaboradores: body.totalColaboradores,
        observations:       body.observations ?? null,
        status:             'DRAFT',
      },
      create: {
        companyId,
        month:              body.month,
        year:               body.year,
        data:               body.data,
        totalBruto:         body.totalBruto,
        totalLiquido:       body.totalLiquido,
        totalColaboradores: body.totalColaboradores,
        observations:       body.observations ?? null,
        status:             'DRAFT',
        createdBy:          userId,
      },
    })

    return reply.status(201).send({ draft })
  })

  /**
   * DELETE /api/v1/employees/payroll-draft?month=&year=
   * Descarta rascunho de folha.
   */
  app.delete('/payroll-draft', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!
    const q         = request.query as { month?: string; year?: string }
    const month     = parseInt(q.month ?? '', 10)
    const year      = parseInt(q.year  ?? '', 10)
    if (!month || !year) {
      return reply.status(400).send({ error: 'month e year são obrigatórios' })
    }
    await p.payrollDraft.deleteMany({ where: { companyId, month, year } })
    return reply.send({ ok: true })
  })

  /**
   * POST /api/v1/employees/payroll-pdf
   * Gera PDF profissional da folha (A4 paisagem) via Puppeteer.
   */
  app.post('/payroll-pdf', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!

    const body = request.body as {
      month:   number
      year:    number
      entries: {
        employeeId:         string
        name:               string
        type:               string
        role?:              string | null
        projectName?:       string | null
        salarioBase:        number
        horasExtras60:      number
        valorHorasExtras60: number
        horasExtras100:     number
        valorHorasExtras100:number
        salarioBruto:       number
        desconto:           number
        inss:               number
        irrf:               number
        salarioLiquido:     number
        fgts:               number
        encargosPatronais:  number
        custoTotal:         number
      }[]
    }

    if (!body.month || !body.year || !body.entries?.length) {
      return reply.status(400).send({ error: 'Dados insuficientes para gerar PDF' })
    }

    const MONTH_LABELS = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho',
      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
    const mesLabel = MONTH_LABELS[body.month] ?? String(body.month)

    // Buscar dados da empresa
    const company = await p.company.findUnique({
      where:  { id: companyId },
      select: { name: true, cnpj: true, city: true, state: true },
    })
    const companyName = company?.name ?? 'Empresa'

    const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const pct = (n: number) => `${(n * 100).toFixed(1)}%`

    const totals = body.entries.reduce((acc, e) => ({
      salarioBruto:      acc.salarioBruto      + e.salarioBruto,
      descontos:         acc.descontos         + (e.desconto ?? 0),
      inss:              acc.inss              + e.inss,
      irrf:              acc.irrf              + e.irrf,
      salarioLiquido:    acc.salarioLiquido    + e.salarioLiquido - (e.desconto ?? 0),
      fgts:              acc.fgts              + e.fgts,
      encargosPatronais: acc.encargosPatronais + e.encargosPatronais,
      custoTotal:        acc.custoTotal        + e.custoTotal,
      he60:              acc.he60              + e.valorHorasExtras60,
      he100:             acc.he100             + e.valorHorasExtras100,
    }), { salarioBruto: 0, descontos: 0, inss: 0, irrf: 0, salarioLiquido: 0,
          fgts: 0, encargosPatronais: 0, custoTotal: 0, he60: 0, he100: 0 })

    const rowsHtml = body.entries.map((e, i) => {
      const isPj      = e.type === 'PJ' || e.type === 'THIRD_PARTY'
      const liquido   = e.salarioLiquido - (e.desconto ?? 0)
      const bg        = i % 2 === 0 ? '#FFFFFF' : '#F9FAFB'
      return `
        <tr style="background:${bg}">
          <td>${i + 1}</td>
          <td class="name-cell">
            <strong>${e.name}</strong>
            ${e.role ? `<br><span class="sub">${e.role}</span>` : ''}
            ${e.projectName ? `<br><span class="sub obra">${e.projectName}</span>` : ''}
          </td>
          <td><span class="badge ${isPj ? 'badge-pj' : 'badge-clt'}">${e.type}</span></td>
          <td class="num">${fmt(e.salarioBase)}</td>
          <td class="num ${e.horasExtras60 > 0 ? 'he60' : ''}">
            ${e.horasExtras60 > 0 ? `${e.horasExtras60}h<br><small>${fmt(e.valorHorasExtras60)}</small>` : '—'}
          </td>
          <td class="num ${e.horasExtras100 > 0 ? 'he100' : ''}">
            ${e.horasExtras100 > 0 ? `${e.horasExtras100}h<br><small>${fmt(e.valorHorasExtras100)}</small>` : '—'}
          </td>
          <td class="num"><strong>${fmt(e.salarioBruto)}</strong></td>
          <td class="num red">${isPj ? '—' : fmt(e.inss)}</td>
          <td class="num red">${isPj ? '—' : fmt(e.irrf)}</td>
          <td class="num ${e.desconto > 0 ? 'red' : ''}">${e.desconto > 0 ? fmt(e.desconto) : '—'}</td>
          <td class="num green"><strong>${fmt(liquido)}</strong></td>
          <td class="num blue">${isPj ? '—' : fmt(e.fgts)}</td>
          <td class="num orange"><strong>${fmt(e.custoTotal)}</strong></td>
        </tr>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4 landscape; margin: 12mm 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8px; color: #1F2937; }

  .header { display: flex; justify-content: space-between; align-items: flex-start;
            border-bottom: 2px solid #F5A623; padding-bottom: 8px; margin-bottom: 10px; }
  .header-left h1 { font-size: 16px; font-weight: 700; color: #111827; }
  .header-left h2 { font-size: 11px; font-weight: 500; color: #6B7280; margin-top: 2px; }
  .header-right { text-align: right; }
  .header-right .company { font-size: 10px; font-weight: 600; color: #374151; }
  .header-right .meta { font-size: 8px; color: #9CA3AF; margin-top: 2px; }
  .badge-period { background: #FEF3C7; color: #92400E; border-radius: 4px;
                  padding: 2px 8px; font-size: 9px; font-weight: 700; }

  .cards { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; margin-bottom: 10px; }
  .card { border-radius: 6px; padding: 8px 10px; border: 1px solid; }
  .card-gray   { background: #F9FAFB; border-color: #E5E7EB; }
  .card-red    { background: #FEF2F2; border-color: #FECACA; }
  .card-green  { background: #F0FDF4; border-color: #BBF7D0; }
  .card-orange { background: #FFF7ED; border-color: #FED7AA; }
  .card label  { font-size: 7px; text-transform: uppercase; font-weight: 600;
                 letter-spacing: 0.5px; color: #9CA3AF; display: block; margin-bottom: 2px; }
  .card .val   { font-size: 12px; font-weight: 700; }
  .card-gray   .val { color: #374151; }
  .card-red    .val { color: #DC2626; }
  .card-green  .val { color: #16A34A; }
  .card-orange .val { color: #C2410C; }

  table { width: 100%; border-collapse: collapse; font-size: 7.5px; }
  thead { background: #1F2937; color: white; }
  thead th { padding: 5px 4px; text-align: right; font-weight: 600;
             font-size: 7px; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }
  thead th:nth-child(1) { text-align: center; width: 22px; }
  thead th:nth-child(2) { text-align: left; }
  thead th:nth-child(3) { text-align: center; }
  tbody td { padding: 4px 4px; border-bottom: 1px solid #F3F4F6; vertical-align: top; }
  tbody td:nth-child(1) { text-align: center; color: #9CA3AF; }
  tfoot td { padding: 5px 4px; font-weight: 700; font-size: 8px;
             background: #F3F4F6; border-top: 2px solid #D1D5DB; }
  tfoot td:nth-child(1) { text-align: center; }

  .name-cell { text-align: left !important; min-width: 90px; }
  .num { text-align: right; white-space: nowrap; }
  .red { color: #DC2626; }
  .green { color: #16A34A; }
  .blue { color: #2563EB; }
  .orange { color: #C2410C; }
  .he60  { color: #D97706; }
  .he100 { color: #DC2626; }
  .sub { font-size: 7px; color: #9CA3AF; }
  .obra { color: #7C3AED; }
  .badge { border-radius: 3px; padding: 1px 5px; font-size: 7px; font-weight: 600; }
  .badge-clt { background: #DBEAFE; color: #1D4ED8; }
  .badge-pj  { background: #EDE9FE; color: #7C3AED; }

  .footer-section { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .charges-box { background: #FFF7ED; border: 1px solid #FED7AA; border-radius: 6px; padding: 8px 10px; }
  .charges-box h4 { font-size: 8px; font-weight: 700; color: #92400E; margin-bottom: 6px;
                    border-bottom: 1px solid #FED7AA; padding-bottom: 3px; }
  .charges-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; }
  .charge-item label { font-size: 7px; color: #9CA3AF; display: block; }
  .charge-item .val  { font-size: 9px; font-weight: 600; color: #374151; }

  .sign-box { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; padding: 10px; }
  .sign-line { border-top: 1px solid #9CA3AF; padding-top: 4px; text-align: center; margin-top: 20px; }
  .sign-line span { font-size: 7px; color: #6B7280; }

  .disclaimer { font-size: 7px; color: #9CA3AF; margin-top: 8px; text-align: center;
                border-top: 1px solid #E5E7EB; padding-top: 6px; }
</style>
</head>
<body>
  <!-- Cabeçalho -->
  <div class="header">
    <div class="header-left">
      <h1>Folha de Pagamento</h1>
      <h2>${mesLabel} / ${body.year} &nbsp;·&nbsp; <span class="badge-period">${body.entries.length} colaborador${body.entries.length !== 1 ? 'es' : ''}</span></h2>
    </div>
    <div class="header-right">
      <div class="company">${companyName}</div>
      ${company?.cnpj ? `<div class="meta">CNPJ: ${company.cnpj}</div>` : ''}
      ${company?.city ? `<div class="meta">${company.city}${company.state ? ` — ${company.state}` : ''}</div>` : ''}
      <div class="meta">Emitido em: ${new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' })}</div>
    </div>
  </div>

  <!-- Cards de totais -->
  <div class="cards">
    <div class="card card-gray">
      <label>Salários brutos</label>
      <div class="val">${fmt(totals.salarioBruto)}</div>
    </div>
    <div class="card card-red">
      <label>Descontos (INSS + IRRF + Outros)</label>
      <div class="val">${fmt(totals.inss + totals.irrf + totals.descontos)}</div>
    </div>
    <div class="card card-green">
      <label>Salários líquidos</label>
      <div class="val">${fmt(totals.salarioLiquido)}</div>
    </div>
    <div class="card card-orange">
      <label>Custo total empresa</label>
      <div class="val">${fmt(totals.custoTotal)}</div>
    </div>
  </div>

  <!-- Tabela -->
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th style="text-align:left">Colaborador</th>
        <th style="text-align:center">Tipo</th>
        <th>Sal. base</th>
        <th>HE 60%</th>
        <th>HE 100%</th>
        <th>Sal. bruto</th>
        <th style="color:#FCA5A5">INSS</th>
        <th style="color:#FCA5A5">IRRF</th>
        <th style="color:#FCA5A5">Descontos</th>
        <th style="color:#86EFAC">Sal. líquido</th>
        <th style="color:#93C5FD">FGTS *</th>
        <th style="color:#FED7AA">Custo total</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td>—</td>
        <td style="text-align:left">Total (${body.entries.length})</td>
        <td></td>
        <td class="num">${fmt(totals.salarioBruto - totals.he60 - totals.he100)}</td>
        <td class="num he60">${totals.he60 > 0 ? fmt(totals.he60) : '—'}</td>
        <td class="num he100">${totals.he100 > 0 ? fmt(totals.he100) : '—'}</td>
        <td class="num">${fmt(totals.salarioBruto)}</td>
        <td class="num red">${fmt(totals.inss)}</td>
        <td class="num red">${fmt(totals.irrf)}</td>
        <td class="num red">${totals.descontos > 0 ? fmt(totals.descontos) : '—'}</td>
        <td class="num green">${fmt(totals.salarioLiquido)}</td>
        <td class="num blue">${fmt(totals.fgts)}</td>
        <td class="num orange">${fmt(totals.custoTotal)}</td>
      </tr>
    </tfoot>
  </table>

  <!-- Rodapé: encargos + assinaturas -->
  <div class="footer-section">
    <div class="charges-box">
      <h4>⚠️ Guias a recolher separadamente (não lançadas na folha)</h4>
      <div class="charges-grid">
        <div class="charge-item">
          <label>FGTS (8%)</label>
          <div class="val">${fmt(totals.fgts)}</div>
        </div>
        <div class="charge-item">
          <label>INSS empregador (20%+RAT+3ºs)</label>
          <div class="val">${fmt(totals.encargosPatronais)}</div>
        </div>
        <div class="charge-item">
          <label>INSS empregado (retido)</label>
          <div class="val">${fmt(totals.inss)}</div>
        </div>
        <div class="charge-item">
          <label>IRRF retido</label>
          <div class="val">${fmt(totals.irrf)}</div>
        </div>
        <div class="charge-item">
          <label>Provisão férias (~11,11%)</label>
          <div class="val">${fmt(totals.salarioBruto * 0.1111)}</div>
        </div>
        <div class="charge-item">
          <label>Provisão 13º (~8,33%)</label>
          <div class="val">${fmt(totals.salarioBruto * 0.0833)}</div>
        </div>
      </div>
    </div>

    <div>
      <div class="sign-box">
        <div>
          <div class="sign-line">
            <span>Responsável Financeiro / RH</span>
          </div>
        </div>
        <div>
          <div class="sign-line">
            <span>Diretor / Responsável Legal</span>
          </div>
        </div>
      </div>
      <p class="disclaimer">
        * FGTS e encargos patronais não estão incluídos nos lançamentos da folha — devem ser recolhidos por guias separadas (GFIP/eSocial).
        Tabela INSS 2024: faixas progressivas 7,5% / 9% / 12% / 14%. IRRF 2024: isenção até R$ 2.259,20.
      </p>
    </div>
  </div>
</body>
</html>`

    let browser: any = null
    try {
      const puppeteer = await import('puppeteer')
      browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      })
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle0' })
      const pdfBuffer = await page.pdf({
        format:    'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
      })

      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition',
        `attachment; filename="folha-${body.year}-${String(body.month).padStart(2,'0')}.pdf"`)
      return reply.send(pdfBuffer)
    } catch (err: any) {
      return reply.status(500).send({ error: `Erro ao gerar PDF: ${err.message}` })
    } finally {
      if (browser) await browser.close().catch(() => {})
    }
  })

  /**
   * POST /api/v1/employees/payroll-launch
   * Lança folha no financeiro — UMA transação por colaborador (salário líquido).
   * Categoria automática "Mão de obra" (EXPENSE).
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
        employeeId:           string
        name?:                string
        projectId?:           string | null
        salarioBruto:         number
        salarioLiquido:       number
        desconto?:            number
        horasExtras60?:       number
        horasExtras100?:      number
        valorHorasExtras60?:  number
        valorHorasExtras100?: number
        valorHorasExtras?:    number
        inss?:                number
        irrf?:                number
        fgts:                 number
        encargosPatronais:    number
        custoTotal:           number
      }[]
    }

    if (!body.month || !body.year || !body.entries?.length) {
      return reply.status(400).send({ error: 'month, year e entries são obrigatórios' })
    }

    const MONTH_LABELS = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho',
      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
    const mesLabel = MONTH_LABELS[body.month] ?? String(body.month)

    // ── Categoria "Mão de obra" — deduplicar e garantir exatamente uma ─────────
    // Buscar TODAS as variações (inclusive nomes errados com "users")
    const allMaoCats = await (p as any).financialCategory.findMany({
      where: {
        companyId,
        OR: [
          { name: { contains: 'mão de obra',  mode: 'insensitive' } },
          { name: { contains: 'mao de obra',  mode: 'insensitive' } },
          { name: { contains: 'users',        mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    })

    let maoCat: any

    if (allMaoCats.length === 0) {
      // Criar pela primeira vez
      maoCat = await (p as any).financialCategory.create({
        data: {
          companyId,
          name:  'Mão de obra',
          type:  'EXPENSE',
          color: '#F5A623',
          icon:  null,
        },
      })
    } else {
      // Manter o mais antigo, remover duplicados
      maoCat = allMaoCats[0]

      if (allMaoCats.length > 1) {
        const duplicateIds = allMaoCats.slice(1).map((c: any) => c.id)
        // Redirecionar transações dos duplicados para o canonical
        await (p as any).financialTransaction.updateMany({
          where: { companyId, categoryId: { in: duplicateIds } },
          data:  { categoryId: maoCat.id },
        })
        // Remover os duplicados
        await (p as any).financialCategory.deleteMany({
          where: { id: { in: duplicateIds } },
        })
      }

      // Garantir nome e icon corretos no canonical
      if (maoCat.name !== 'Mão de obra' || maoCat.icon != null) {
        await (p as any).financialCategory.update({
          where: { id: maoCat.id },
          data:  { name: 'Mão de obra', icon: null },
        })
      }
    }

    // ── Buscar dados completos dos colaboradores ──────────────────────────────
    const empRecs = await p.employee.findMany({
      where:  { id: { in: body.entries.map(e => e.employeeId) }, companyId },
      select: { id: true, name: true, type: true, supplierId: true, projectId: true, role: true, code: true },
    })
    const empMap: Record<string, typeof empRecs[0]> = Object.fromEntries(
      empRecs.map((e: any) => [e.id, e])
    )

    const referenceDate = new Date(body.year, body.month - 1, 1)
    const dueDate       = new Date(body.year, body.month, 0) // último dia do mês
    const createdTransactions: any[] = []

    // ── Uma transação por colaborador ──────────────────────────────────────────
    for (const entry of body.entries) {
      const emp        = empMap[entry.employeeId] as any
      const empName    = entry.name ?? emp?.name ?? entry.employeeId
      const desconto   = entry.desconto ?? 0
      const liquido    = parseFloat((entry.salarioLiquido - desconto).toFixed(2))
      const txHash     = crypto.randomBytes(16).toString('hex')
      const txNum      = `PAY-${body.year}${String(body.month).padStart(2,'0')}-${entry.employeeId.slice(-6).toUpperCase()}`

      // supplierId: apenas para PJ / Terceirizado
      const isPjType   = emp && ['PJ', 'THIRD_PARTY'].includes(emp.type)
      const supplierId = isPjType ? (emp.supplierId ?? null) : null

      // projectId: da entry (pode ter sido alterado na tela), fallback para o do colaborador
      const projectId  = entry.projectId ?? emp?.projectId ?? null

      // Montar observações detalhadas
      const obsLines: string[] = [
        `Folha ${mesLabel}/${body.year}`,
        `Sal. bruto: R$ ${entry.salarioBruto.toFixed(2)}`,
      ]
      if (entry.inss)   obsLines.push(`INSS: R$ ${entry.inss.toFixed(2)}`)
      if (entry.irrf)   obsLines.push(`IRRF: R$ ${entry.irrf.toFixed(2)}`)
      if (desconto > 0) obsLines.push(`Outros descontos: R$ ${desconto.toFixed(2)}`)
      obsLines.push(`Sal. líquido: R$ ${liquido.toFixed(2)}`)
      if ((entry.horasExtras60 ?? 0) > 0)  obsLines.push(`HE 60%: ${entry.horasExtras60}h (R$ ${(entry.valorHorasExtras60 ?? 0).toFixed(2)})`)
      if ((entry.horasExtras100 ?? 0) > 0) obsLines.push(`HE 100%: ${entry.horasExtras100}h (R$ ${(entry.valorHorasExtras100 ?? 0).toFixed(2)})`)
      obsLines.push(`FGTS: R$ ${entry.fgts.toFixed(2)} | Encargos: R$ ${entry.encargosPatronais.toFixed(2)} (guias separadas)`)

      const tx = await p.financialTransaction.create({
        data: {
          companyId,
          createdById:       userId,
          type:              'EXPENSE',
          status:            'PENDING',
          isPaid:            false,
          description:       `Salário ${mesLabel}/${body.year} — ${empName}`,
          observations:      obsLines.join('\n'),
          grossAmount:       entry.salarioBruto,
          netAmount:         liquido,
          dueDate,
          referenceDate,
          projectId:         projectId  ?? undefined,
          supplierId:        supplierId ?? undefined,   // ← CAMPO CRÍTICO
          categoryId:        maoCat.id,
          isPayroll:         true,
          payrollMonth:      body.month,
          payrollYear:       body.year,
          payrollEmployeeId: entry.employeeId,
          employeeId:        entry.employeeId,
          transactionHash:   txHash,
          transactionNumber: txNum,
          isActive:          true,
          origin:            'SYSTEM',
        },
      })
      createdTransactions.push(tx)

      // ── Registrar custo de mão de obra no Centro de Custo ──────────────────
      if (projectId) {
        try {
          await p.projectCostEntry.create({
            data: {
              companyId,
              projectId,
              description: `Folha ${mesLabel}/${body.year} — ${empName}${emp?.role ? ` (${emp.role})` : ''}`,
              category:    'LABOR',
              quantity:    1,
              unitCost:    liquido,
              totalCost:   liquido,
              date:        referenceDate,
              notes:       `Tipo: ${emp?.type ?? 'CLT'} | Transação: ${tx.id}${supplierId ? ` | Fornecedor: ${supplierId}` : ''}`,
            },
          })
        } catch { /* silencioso — não bloqueia o lançamento */ }
      }

      // Audit log individual
      await createAuditLog({
        prisma: p, companyId, userId,
        action:     'CREATE',
        module:     'COLLABORATORS',
        entity:     'PayrollEntry',
        entityId:   entry.employeeId,
        entityName: empName,
        description: `Salário ${mesLabel}/${body.year} lançado — Líquido: R$ ${liquido.toFixed(2)}`
          + (projectId  ? ` · Obra vinculada`       : '')
          + (supplierId ? ` · Fornecedor vinculado`  : ''),
        request,
      })
    }

    const totalLiquido = body.entries.reduce((sum, e) => {
      const desc = e.desconto ?? 0
      return sum + e.salarioLiquido - desc
    }, 0)
    const fmt = (n: number) => `R$ ${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`

    // Audit log geral da folha
    await createAuditLog({
      prisma: p, companyId, userId,
      action:     'CREATE',
      module:     'COLLABORATORS',
      entity:     'Payroll',
      entityId:   `${body.year}-${body.month}`,
      entityName: `Folha ${mesLabel}/${body.year}`,
      description: `Folha ${mesLabel}/${body.year} lançada — ${body.entries.length} colaboradores · Total líquido: ${fmt(totalLiquido)}`,
      request,
    })

    return reply.status(201).send({
      success:             true,
      transactionsCreated: createdTransactions.length,
      total:               totalLiquido,
    })
  })

  /**
   * POST /api/v1/employees/admin/fix-payroll-transactions
   * Corrige lançamentos de folha já existentes sem supplierId ou projectId.
   * Uso interno — protegido por autenticação JWT normal.
   */
  app.post('/admin/fix-payroll-transactions', async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = req.companyId!

    // Lançamentos de folha sem supplierId ou projectId
    const payrollTxs = await p.financialTransaction.findMany({
      where: {
        companyId,
        isPayroll:  true,
        isActive:   true,
        OR: [
          { supplierId: null },
          { projectId:  null },
        ],
      },
      select: {
        id: true,
        description: true,
        payrollEmployeeId: true,
        supplierId: true,
        projectId:  true,
        netAmount:  true,
        referenceDate: true,
      },
    })

    let fixed = 0
    let skipped = 0
    const details: string[] = []

    for (const tx of payrollTxs as any[]) {
      if (!tx.payrollEmployeeId) { skipped++; continue }

      const emp = await p.employee.findFirst({
        where: { id: tx.payrollEmployeeId, companyId },
        select: { id: true, name: true, type: true, supplierId: true, projectId: true, role: true },
      }) as any
      if (!emp) { skipped++; continue }

      const updates: any = {}

      // Adicionar supplierId se PJ/Terceirizado e tem fornecedor
      if (!tx.supplierId && ['PJ', 'THIRD_PARTY'].includes(emp.type) && emp.supplierId) {
        updates.supplierId = emp.supplierId
      }

      // Adicionar projectId se colaborador tem obra
      if (!tx.projectId && emp.projectId) {
        updates.projectId = emp.projectId
      }

      if (Object.keys(updates).length === 0) { skipped++; continue }

      await p.financialTransaction.update({ where: { id: tx.id }, data: updates })

      // Criar ProjectCostEntry se projectId foi adicionado e não havia ainda
      if (updates.projectId && !tx.projectId) {
        const pid = updates.projectId
        try {
          const alreadyExists = await p.projectCostEntry.findFirst({
            where: {
              companyId, projectId: pid,
              notes: { contains: tx.id },
            },
          })
          if (!alreadyExists) {
            await p.projectCostEntry.create({
              data: {
                companyId,
                projectId:   pid,
                description: tx.description ?? `Folha — ${emp.name}`,
                category:    'LABOR',
                quantity:    1,
                unitCost:    Number(tx.netAmount),
                totalCost:   Number(tx.netAmount),
                date:        tx.referenceDate ?? new Date(),
                notes:       `Correção retroativa | Transação: ${tx.id}`,
              },
            })
          }
        } catch { /* silencioso */ }
      }

      details.push(`${tx.id}: ${JSON.stringify(updates)}`)
      fixed++
    }

    return reply.send({
      success: true,
      total:   payrollTxs.length,
      fixed,
      skipped,
      details,
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
