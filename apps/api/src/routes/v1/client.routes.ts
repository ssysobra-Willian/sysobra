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

// ─── Validação CPF ────────────────────────────────────────────────────────────

function validarCpf(cpf: string): boolean {
  const c = cpf.replace(/\D/g, '')
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(c[i]) * (10 - i)
  let r = (sum * 10) % 11; if (r === 10 || r === 11) r = 0
  if (r !== parseInt(c[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(c[i]) * (11 - i)
  r = (sum * 10) % 11; if (r === 10 || r === 11) r = 0
  return r === parseInt(c[10])
}

// ─── Validação CNPJ ───────────────────────────────────────────────────────────

function validarCnpj(cnpj: string): boolean {
  const c = cnpj.replace(/\D/g, '')
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false
  const calc = (str: string, weights: number[]) =>
    weights.reduce((s, w, i) => s + parseInt(str[i]) * w, 0)
  const w1 = [5,4,3,2,9,8,7,6,5,4,3,2]
  const w2 = [6,5,4,3,2,9,8,7,6,5,4,3,2]
  const d1 = 11 - (calc(c, w1) % 11); const r1 = d1 >= 10 ? 0 : d1
  if (r1 !== parseInt(c[12])) return false
  const d2 = 11 - (calc(c, w2) % 11); const r2 = d2 >= 10 ? 0 : d2
  return r2 === parseInt(c[13])
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createClientSchema = z.object({
  type:         z.enum(['PERSON', 'COMPANY']).default('COMPANY'),
  name:         z.string().min(2).max(200),
  tradeName:    z.string().max(200).nullable().optional(),
  email:        z.string().email().nullable().optional(),
  phone:        z.string().max(30).nullable().optional(),
  phone2:       z.string().max(30).nullable().optional(),
  whatsapp:     z.string().max(30).nullable().optional(),
  cpfCnpj:      z.string().max(20).nullable().optional(),
  address:      z.string().max(300).nullable().optional(),
  city:         z.string().max(100).nullable().optional(),
  state:        z.string().max(2).nullable().optional(),
  zipCode:      z.string().max(10).nullable().optional(),
  contactName:  z.string().max(150).nullable().optional(),
  contactRole:  z.string().max(100).nullable().optional(),
  contactEmail: z.string().email().max(200).nullable().optional(),
  contactPhone: z.string().max(30).nullable().optional(),
  notes:        z.string().max(1000).nullable().optional(),
})

const updateClientSchema = createClientSchema.partial()

// ─── Helper — serializar cliente ──────────────────────────────────────────────

function serialiseClient(c: any) {
  return {
    ...c,
    // campos calculados
    projectCount:     c._count?.projects              ?? c.projectCount     ?? 0,
    transactionCount: c._count?.financialTransactions ?? c.transactionCount ?? 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function clientRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireCompany)

  // ── GET /api/v1/clients ─────────────────────────────────────────────────────
  app.get('/', {
    preHandler: [requirePermission('financeiro', 'view')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const q = request.query as {
      search?: string; type?: string; isActive?: string
      page?: string; limit?: string; orderBy?: string
    }

    const page  = Math.max(1, parseInt(q.page  ?? '1'))
    const limit = Math.min(100, parseInt(q.limit ?? '30'))
    const skip  = (page - 1) * limit

    const where: any = { companyId }
    if (q.isActive !== undefined) where.isActive = q.isActive === 'true'
    else where.isActive = true
    if (q.type)   where.type = q.type
    if (q.search) {
      where.OR = [
        { name:    { contains: q.search, mode: 'insensitive' } },
        { cpfCnpj: { contains: q.search, mode: 'insensitive' } },
        { email:   { contains: q.search, mode: 'insensitive' } },
      ]
    }

    const orderField = q.orderBy === 'name' ? 'name' : 'createdAt'
    const orderDir   = q.orderBy === 'name' ? 'asc'  : 'desc'

    const [total, clients] = await Promise.all([
      prisma.client.count({ where }),
      (prisma as any).client.findMany({
        where,
        orderBy: { [orderField]: orderDir },
        skip,
        take: limit,
        include: {
          _count: { select: { projects: true, financialTransactions: true } },
        },
      }),
    ])

    // resumo financeiro (a receber) por cliente
    const ids = clients.map((c: any) => c.id)
    const receivables = await (prisma as any).financialTransaction.groupBy({
      by: ['clientId'],
      where: { companyId, clientId: { in: ids }, type: 'INCOME', isPaid: false, isActive: true },
      _sum: { netAmount: true },
    })
    const receivableMap: Record<string, number> = {}
    for (const r of receivables) {
      if (r.clientId) receivableMap[r.clientId] = Number(r._sum.netAmount ?? 0)
    }

    const result = clients.map((c: any) => ({
      ...serialiseClient(c),
      totalReceivable: receivableMap[c.id] ?? 0,
    }))

    return reply.send({
      clients: result,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    })
  })

  // ── POST /api/v1/clients ─────────────────────────────────────────────────────
  app.post('/', {
    preHandler: [requirePermission('financeiro', 'create')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const payload = request.user as JwtPayload

    const body = createClientSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Dados inválidos', details: body.error.flatten() })
    const d = body.data

    // validação CPF/CNPJ
    if (d.cpfCnpj) {
      const digits = d.cpfCnpj.replace(/\D/g, '')
      if (digits.length === 11 && !validarCpf(digits)) return reply.status(400).send({ error: 'CPF inválido' })
      if (digits.length === 14 && !validarCnpj(digits)) return reply.status(400).send({ error: 'CNPJ inválido' })
    }

    const client = await (prisma as any).client.create({
      data: {
        companyId,
        createdById:  payload.sub,
        type:         d.type,
        name:         d.name,
        tradeName:    d.tradeName   ?? null,
        email:        d.email       ?? null,
        phone:        d.phone       ?? null,
        phone2:       d.phone2      ?? null,
        whatsapp:     d.whatsapp    ?? null,
        cpfCnpj:      d.cpfCnpj    ?? null,
        address:      d.address     ?? null,
        city:         d.city        ?? null,
        state:        d.state       ?? null,
        zipCode:      d.zipCode     ?? null,
        contactName:  d.contactName ?? null,
        contactRole:  d.contactRole ?? null,
        contactEmail: d.contactEmail ?? null,
        contactPhone: d.contactPhone ?? null,
        notes:        d.notes       ?? null,
      },
    })

    return reply.status(201).send({ client })
  })

  // ── GET /api/v1/clients/:id ──────────────────────────────────────────────────
  app.get('/:id', {
    preHandler: [requirePermission('financeiro', 'view')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const { id } = request.params as { id: string }

    const client = await (prisma as any).client.findFirst({
      where: { id, companyId },
      include: {
        projects: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, name: true, code: true, status: true,
            progressPercent: true, budgetAlert: true, delayAlert: true,
            globalBudget: true, expectedEndDate: true, startDate: true,
          },
        },
        financialTransactions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true, description: true, type: true, isPaid: true,
            netAmount: true, dueDate: true, paidAt: true, referenceDate: true,
            category: { select: { name: true, color: true, icon: true } },
          },
        },
        _count: { select: { projects: true, financialTransactions: true } },
      },
    })

    if (!client) return reply.status(404).send({ error: 'Cliente não encontrado' })

    // somar a receber (não pago)
    const receivable = await (prisma as any).financialTransaction.aggregate({
      where: { companyId, clientId: id, type: 'INCOME', isPaid: false, isActive: true },
      _sum: { netAmount: true },
    })
    // somar recebido (pago)
    const received = await (prisma as any).financialTransaction.aggregate({
      where: { companyId, clientId: id, type: 'INCOME', isPaid: true, isActive: true },
      _sum: { netAmount: true },
    })

    return reply.send({
      client: {
        ...serialiseClient(client),
        totalReceivable: Number(receivable._sum.netAmount ?? 0),
        totalReceived:   Number(received._sum.netAmount   ?? 0),
      },
    })
  })

  // ── PUT /api/v1/clients/:id ──────────────────────────────────────────────────
  app.put('/:id', {
    preHandler: [requirePermission('financeiro', 'edit')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const { id } = request.params as { id: string }

    const body = updateClientSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Dados inválidos', details: body.error.flatten() })
    const d = body.data

    const existing = await prisma.client.findFirst({ where: { id, companyId } })
    if (!existing) return reply.status(404).send({ error: 'Cliente não encontrado' })

    if (d.cpfCnpj) {
      const digits = d.cpfCnpj.replace(/\D/g, '')
      if (digits.length === 11 && !validarCpf(digits)) return reply.status(400).send({ error: 'CPF inválido' })
      if (digits.length === 14 && !validarCnpj(digits)) return reply.status(400).send({ error: 'CNPJ inválido' })
    }

    const client = await (prisma as any).client.update({
      where: { id },
      data: {
        ...(d.type         !== undefined && { type:         d.type         }),
        ...(d.name         !== undefined && { name:         d.name         }),
        ...(d.tradeName    !== undefined && { tradeName:    d.tradeName    ?? null }),
        ...(d.email        !== undefined && { email:        d.email        ?? null }),
        ...(d.phone        !== undefined && { phone:        d.phone        ?? null }),
        ...(d.phone2       !== undefined && { phone2:       d.phone2       ?? null }),
        ...(d.whatsapp     !== undefined && { whatsapp:     d.whatsapp     ?? null }),
        ...(d.cpfCnpj      !== undefined && { cpfCnpj:      d.cpfCnpj      ?? null }),
        ...(d.address      !== undefined && { address:      d.address      ?? null }),
        ...(d.city         !== undefined && { city:         d.city         ?? null }),
        ...(d.state        !== undefined && { state:        d.state        ?? null }),
        ...(d.zipCode      !== undefined && { zipCode:      d.zipCode      ?? null }),
        ...(d.contactName  !== undefined && { contactName:  d.contactName  ?? null }),
        ...(d.contactRole  !== undefined && { contactRole:  d.contactRole  ?? null }),
        ...(d.contactEmail !== undefined && { contactEmail: d.contactEmail ?? null }),
        ...(d.contactPhone !== undefined && { contactPhone: d.contactPhone ?? null }),
        ...(d.notes        !== undefined && { notes:        d.notes        ?? null }),
      },
    })

    return reply.send({ client })
  })

  // ── PATCH /api/v1/clients/:id/toggle ─────────────────────────────────────────
  app.patch('/:id/toggle', {
    preHandler: [requirePermission('financeiro', 'edit')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const { id } = request.params as { id: string }

    const existing = await prisma.client.findFirst({ where: { id, companyId } })
    if (!existing) return reply.status(404).send({ error: 'Cliente não encontrado' })

    const client = await prisma.client.update({
      where: { id },
      data: { isActive: !existing.isActive },
    })

    return reply.send({ client, isActive: client.isActive })
  })
}
