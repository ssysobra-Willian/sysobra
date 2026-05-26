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

const SUPPLIER_CATEGORIES = ['MATERIAL', 'LABOR', 'SERVICE', 'EQUIPMENT', 'TRANSPORT', 'OTHER'] as const

const createSupplierSchema = z.object({
  type:         z.enum(['PERSON', 'COMPANY']).default('COMPANY'),
  name:         z.string().min(2).max(200),
  tradeName:    z.string().max(200).nullable().optional(),
  email:        z.string().email().nullable().optional(),
  phone:        z.string().max(30).nullable().optional(),
  phone2:       z.string().max(30).nullable().optional(),
  whatsapp:     z.string().max(30).nullable().optional(),
  cpfCnpj:      z.string().max(20).nullable().optional(),
  category:     z.string().nullable().optional(),
  address:      z.string().max(300).nullable().optional(),
  city:         z.string().max(100).nullable().optional(),
  state:        z.string().max(2).nullable().optional(),
  zipCode:      z.string().max(10).nullable().optional(),
  contactName:  z.string().max(150).nullable().optional(),
  contactRole:  z.string().max(100).nullable().optional(),
  contactEmail: z.string().email().max(200).nullable().optional(),
  contactPhone: z.string().max(30).nullable().optional(),
  // PF
  profession:   z.string().max(100).nullable().optional(),
  crea:         z.string().max(50).nullable().optional(),
  // PJ
  stateRegistration:     z.string().max(30).nullable().optional(),
  municipalRegistration: z.string().max(30).nullable().optional(),
  // Dados bancários
  bankName:        z.string().max(100).nullable().optional(),
  bankCode:        z.string().max(10).nullable().optional(),
  bankAgency:      z.string().max(20).nullable().optional(),
  bankAccount:     z.string().max(30).nullable().optional(),
  bankAccountType: z.string().max(20).nullable().optional(),
  pixKey:          z.string().max(150).nullable().optional(),
  pixKeyType:      z.string().max(30).nullable().optional(),
  rating:          z.number().int().min(1).max(5).nullable().optional(),
  notes:           z.string().max(1000).nullable().optional(),
})

const updateSupplierSchema = createSupplierSchema.partial()

// ─── Helper — serializar fornecedor ──────────────────────────────────────────

function serialiseSupplier(s: any) {
  return {
    ...s,
    transactionCount: s._count?.financialTransactions ?? s.transactionCount ?? 0,
  }
}

// ─── Labels de categoria ──────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  MATERIAL:   'Material',
  LABOR:      'Mão de obra',
  SERVICE:    'Serviço',
  EQUIPMENT:  'Equipamento',
  TRANSPORT:  'Transporte',
  OTHER:      'Outro',
}

// ─────────────────────────────────────────────────────────────────────────────

export async function supplierRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireCompany)

  // ── GET /api/v1/suppliers ───────────────────────────────────────────────────
  app.get('/', {
    preHandler: [requirePermission('financeiro', 'view')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const q = request.query as {
      search?: string; type?: string; category?: string; isActive?: string
      page?: string; limit?: string; orderBy?: string
    }

    const page  = Math.max(1, parseInt(q.page  ?? '1'))
    const limit = Math.min(100, parseInt(q.limit ?? '30'))
    const skip  = (page - 1) * limit

    const where: any = { companyId }
    if (q.isActive !== undefined) where.isActive = q.isActive === 'true'
    else where.isActive = true
    if (q.type)     where.type = q.type
    if (q.category) where.category = q.category
    if (q.search) {
      where.OR = [
        { name:     { contains: q.search, mode: 'insensitive' } },
        { cpfCnpj:  { contains: q.search, mode: 'insensitive' } },
        { cnpj:     { contains: q.search, mode: 'insensitive' } },
        { email:    { contains: q.search, mode: 'insensitive' } },
      ]
    }

    const orderField = q.orderBy === 'name' ? 'name' : 'createdAt'
    const orderDir   = q.orderBy === 'name' ? 'asc'  : 'desc'

    const [total, suppliers] = await Promise.all([
      (prisma as any).supplier.count({ where }),
      (prisma as any).supplier.findMany({
        where,
        orderBy: { [orderField]: orderDir },
        skip,
        take: limit,
        include: {
          _count: { select: { financialTransactions: true } },
        },
      }),
    ])

    // pago no mês por fornecedor
    const ids = suppliers.map((s: any) => s.id)
    const now  = new Date()
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const mEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    const [paidMonth, payable] = await Promise.all([
      (prisma as any).financialTransaction.groupBy({
        by: ['supplierId'],
        where: { companyId, supplierId: { in: ids }, type: 'EXPENSE', isPaid: true, isActive: true, paidAt: { gte: mStart, lte: mEnd } },
        _sum: { netAmount: true },
      }),
      (prisma as any).financialTransaction.groupBy({
        by: ['supplierId'],
        where: { companyId, supplierId: { in: ids }, type: 'EXPENSE', isPaid: false, isActive: true },
        _sum: { netAmount: true },
      }),
    ])

    const paidMap:    Record<string, number> = {}
    const payableMap: Record<string, number> = {}
    for (const r of paidMonth) if (r.supplierId) paidMap[r.supplierId]    = Number(r._sum.netAmount ?? 0)
    for (const r of payable)   if (r.supplierId) payableMap[r.supplierId] = Number(r._sum.netAmount ?? 0)

    const result = suppliers.map((s: any) => ({
      ...serialiseSupplier(s),
      paidThisMonth:  paidMap[s.id]    ?? 0,
      totalPayable:   payableMap[s.id] ?? 0,
      categoryLabel:  CATEGORY_LABELS[s.category] ?? s.category ?? '—',
    }))

    return reply.send({ suppliers: result, total, page, limit, pages: Math.ceil(total / limit) })
  })

  // ── POST /api/v1/suppliers ──────────────────────────────────────────────────
  app.post('/', {
    preHandler: [requirePermission('financeiro', 'create')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const payload = request.user as JwtPayload

    const body = createSupplierSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Dados inválidos', details: body.error.flatten() })
    const d = body.data

    if (d.cpfCnpj) {
      const digits = d.cpfCnpj.replace(/\D/g, '')
      if (digits.length === 11 && !validarCpf(digits)) return reply.status(400).send({ error: 'CPF inválido' })
      if (digits.length === 14 && !validarCnpj(digits)) return reply.status(400).send({ error: 'CNPJ inválido' })
    }

    const supplier = await (prisma as any).supplier.create({
      data: {
        companyId,
        createdById:           payload.sub,
        type:                  d.type,
        name:                  d.name,
        tradeName:             d.tradeName             ?? null,
        email:                 d.email                ?? null,
        phone:                 d.phone                ?? null,
        phone2:                d.phone2               ?? null,
        whatsapp:              d.whatsapp             ?? null,
        cpfCnpj:               d.cpfCnpj              ?? null,
        cnpj:                  d.cpfCnpj?.replace(/\D/g, '').length === 14 ? d.cpfCnpj : null,
        category:              d.category             ?? null,
        address:               d.address              ?? null,
        city:                  d.city                 ?? null,
        state:                 d.state                ?? null,
        zipCode:               d.zipCode              ?? null,
        contactName:           d.contactName          ?? null,
        contactRole:           d.contactRole          ?? null,
        contactEmail:          d.contactEmail         ?? null,
        contactPhone:          d.contactPhone         ?? null,
        profession:            d.profession           ?? null,
        crea:                  d.crea                 ?? null,
        stateRegistration:     d.stateRegistration    ?? null,
        municipalRegistration: d.municipalRegistration ?? null,
        bankName:              d.bankName             ?? null,
        bankCode:              d.bankCode             ?? null,
        bankAgency:            d.bankAgency           ?? null,
        bankAccount:           d.bankAccount          ?? null,
        bankAccountType:       d.bankAccountType      ?? null,
        pixKey:                d.pixKey               ?? null,
        pixKeyType:            d.pixKeyType           ?? null,
        rating:                d.rating               ?? null,
        notes:                 d.notes                ?? null,
      },
    })

    return reply.status(201).send({ supplier })
  })

  // ── GET /api/v1/suppliers/:id ────────────────────────────────────────────────
  app.get('/:id', {
    preHandler: [requirePermission('financeiro', 'view')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const { id } = request.params as { id: string }

    const supplier = await (prisma as any).supplier.findFirst({
      where: { id, companyId },
      include: {
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
        purchaseOrders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true, status: true, totalAmount: true, createdAt: true,
            purchaseMap: { select: { id: true } },
          },
        },
        _count: { select: { financialTransactions: true, purchaseOrders: true } },
      },
    })

    if (!supplier) return reply.status(404).send({ error: 'Fornecedor não encontrado' })

    const [paid, payable] = await Promise.all([
      (prisma as any).financialTransaction.aggregate({
        where: { companyId, supplierId: id, type: 'EXPENSE', isPaid: true, isActive: true },
        _sum: { netAmount: true },
      }),
      (prisma as any).financialTransaction.aggregate({
        where: { companyId, supplierId: id, type: 'EXPENSE', isPaid: false, isActive: true },
        _sum: { netAmount: true },
      }),
    ])

    return reply.send({
      supplier: {
        ...serialiseSupplier(supplier),
        totalPaid:    Number(paid._sum.netAmount    ?? 0),
        totalPayable: Number(payable._sum.netAmount ?? 0),
        categoryLabel: CATEGORY_LABELS[supplier.category] ?? supplier.category ?? '—',
      },
    })
  })

  // ── PUT /api/v1/suppliers/:id ────────────────────────────────────────────────
  app.put('/:id', {
    preHandler: [requirePermission('financeiro', 'edit')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const { id } = request.params as { id: string }

    const body = updateSupplierSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Dados inválidos', details: body.error.flatten() })
    const d = body.data

    const existing = await (prisma as any).supplier.findFirst({ where: { id, companyId } })
    if (!existing) return reply.status(404).send({ error: 'Fornecedor não encontrado' })

    if (d.cpfCnpj) {
      const digits = d.cpfCnpj.replace(/\D/g, '')
      if (digits.length === 11 && !validarCpf(digits)) return reply.status(400).send({ error: 'CPF inválido' })
      if (digits.length === 14 && !validarCnpj(digits)) return reply.status(400).send({ error: 'CNPJ inválido' })
    }

    const update: any = {}
    const fields = ['type','name','tradeName','email','phone','phone2','whatsapp','cpfCnpj',
      'category','address','city','state','zipCode','contactName','contactRole','contactEmail',
      'contactPhone','profession','crea','stateRegistration','municipalRegistration',
      'bankName','bankCode','bankAgency','bankAccount','bankAccountType','pixKey','pixKeyType',
      'rating','notes'] as const
    for (const f of fields) {
      if ((d as any)[f] !== undefined) update[f] = (d as any)[f] ?? null
    }

    const supplier = await (prisma as any).supplier.update({ where: { id }, data: update })
    return reply.send({ supplier })
  })

  // ── PATCH /api/v1/suppliers/:id/toggle ──────────────────────────────────────
  app.patch('/:id/toggle', {
    preHandler: [requirePermission('financeiro', 'edit')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const { id } = request.params as { id: string }

    const existing = await (prisma as any).supplier.findFirst({ where: { id, companyId } })
    if (!existing) return reply.status(404).send({ error: 'Fornecedor não encontrado' })

    const supplier = await (prisma as any).supplier.update({
      where: { id },
      data: { isActive: !existing.isActive },
    })

    return reply.send({ supplier, isActive: supplier.isActive })
  })

  // ── GET /api/v1/suppliers/:id/metrics ──────────────────────────────────────
  app.get('/:id/metrics', {
    preHandler: [requirePermission('financeiro', 'view')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const { id } = request.params as { id: string }
    const q = request.query as { startDate?: string; endDate?: string }

    const supplier = await (prisma as any).supplier.findFirst({ where: { id, companyId } })
    if (!supplier) return reply.status(404).send({ error: 'Fornecedor não encontrado' })

    // Período principal
    const now   = new Date()
    const start = q.startDate ? new Date(q.startDate) : new Date(now.getFullYear(), now.getMonth(), 1)
    const end   = q.endDate   ? new Date(q.endDate)   : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    // Período anterior (mesmo tamanho)
    const diffMs = end.getTime() - start.getTime()
    const prevEnd   = new Date(start.getTime() - 1)
    const prevStart = new Date(prevEnd.getTime() - diffMs)

    const txWhere = (s: Date, e: Date) => ({
      companyId,
      supplierId: id,
      isActive:   true,
      type:       'EXPENSE' as const,
      referenceDate: { gte: s, lte: e },
    })

    const [txs, prevTxs] = await Promise.all([
      (prisma as any).financialTransaction.findMany({
        where:   txWhere(start, end),
        orderBy: { referenceDate: 'desc' },
        select: {
          id: true, description: true, isPaid: true, referenceDate: true, paidAt: true,
          grossAmount: true, netAmount: true, retentionAmount: true, interestAmount: true,
          category: { select: { name: true, color: true } },
        },
      }),
      (prisma as any).financialTransaction.findMany({
        where:  txWhere(prevStart, prevEnd),
        select: { grossAmount: true, netAmount: true },
      }),
    ])

    const toN = (v: any) => Number(v ?? 0)

    const totalGross     = txs.reduce((s: number, t: any) => s + toN(t.grossAmount),    0)
    const totalNet       = txs.reduce((s: number, t: any) => s + toN(t.netAmount),       0)
    const totalDiscounts = txs.reduce((s: number, t: any) => s + toN(t.retentionAmount), 0)
    const totalInterest  = txs.reduce((s: number, t: any) => s + toN(t.interestAmount),  0)
    const count          = txs.length

    const prevGross = prevTxs.reduce((s: number, t: any) => s + toN(t.grossAmount), 0)
    const prevNet   = prevTxs.reduce((s: number, t: any) => s + toN(t.netAmount),   0)
    const prevCount = prevTxs.length

    const largest = txs.reduce((mx: any, t: any) => {
      return (!mx || toN(t.netAmount) > toN(mx.netAmount)) ? t : mx
    }, null)

    // Evolução mensal — últimos 12 meses por padrão
    const monthStart = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1)
    const allTxs = await (prisma as any).financialTransaction.findMany({
      where: { companyId, supplierId: id, isActive: true, type: 'EXPENSE',
               referenceDate: { gte: monthStart } },
      select: { referenceDate: true, grossAmount: true, netAmount: true, retentionAmount: true },
    })

    const monthMap: Record<string, { gross: number; net: number; disc: number; count: number }> = {}
    for (const t of allTxs) {
      const dt  = new Date(t.referenceDate)
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      if (!monthMap[key]) monthMap[key] = { gross: 0, net: 0, disc: 0, count: 0 }
      monthMap[key].gross += toN(t.grossAmount)
      monthMap[key].net   += toN(t.netAmount)
      monthMap[key].disc  += toN(t.retentionAmount)
      monthMap[key].count++
    }

    const monthlyEvolution = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, grossAmount: v.gross, netAmount: v.net, discounts: v.disc, transactionCount: v.count }))

    const variation = (curr: number, prev: number) =>
      prev === 0 ? 0 : Math.round(((curr - prev) / prev) * 100 * 10) / 10

    return reply.send({
      period:             { start: start.toISOString(), end: end.toISOString() },
      supplierName:       supplier.name,
      totalGross:         Math.round(totalGross     * 100) / 100,
      totalNet:           Math.round(totalNet       * 100) / 100,
      totalDiscounts:     Math.round(totalDiscounts * 100) / 100,
      totalInterest:      Math.round(totalInterest  * 100) / 100,
      transactionCount:   count,
      averageTicket:      count > 0 ? Math.round((totalNet / count) * 100) / 100 : 0,
      discountPercentage: totalGross > 0 ? Math.round((totalDiscounts / totalGross) * 10000) / 100 : 0,
      largestTransaction: largest
        ? { amount: toN(largest.netAmount), date: largest.referenceDate, description: largest.description }
        : null,
      monthlyEvolution,
      previousPeriod: { totalGross: prevGross, totalNet: prevNet, transactionCount: prevCount },
      variations: {
        grossVariation: variation(totalGross, prevGross),
        netVariation:   variation(totalNet,   prevNet),
        countVariation: variation(count,      prevCount),
      },
      transactions: txs.map((t: any) => ({
        id:              t.id,
        description:     t.description,
        referenceDate:   t.referenceDate,
        isPaid:          t.isPaid,
        grossAmount:     toN(t.grossAmount),
        netAmount:       toN(t.netAmount),
        retentionAmount: toN(t.retentionAmount),
        interestAmount:  toN(t.interestAmount),
        category:        t.category,
      })),
    })
  })
}
