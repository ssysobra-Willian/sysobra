import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import crypto from 'crypto'
import { prisma } from '@sysobra/database'
import {
  authenticate,
  requireCompany,
  requirePermission,
  RequestWithMember,
  JwtPayload,
} from '../../middlewares/auth.middleware'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (typeof v === 'number') return v
  const n = Number(String(v))
  return isNaN(n) ? 0 : n
}

// Converte todos os campos Decimal do Prisma para Number primitivo
// Necessário porque o Prisma retorna Decimal como objeto que serializa como string no JSON
function serialiseTx(tx: any) {
  return {
    ...tx,
    grossAmount:      Number(tx.grossAmount),
    interestAmount:   Number(tx.interestAmount),
    retentionAmount:  Number(tx.retentionAmount),
    netAmount:        Number(tx.netAmount),
    transactionNumber: tx.transactionNumber ?? null,
    transactionHash:   tx.transactionHash   ?? null,
    createdBy:        tx.createdBy ?? null,
    costCenterAllocations: (tx.costCenterAllocations ?? []).map((a: any) => ({
      ...a,
      amount:     Number(a.amount),
      percentage: Number(a.percentage),
    })),
  }
}

// Gera número sequencial por empresa no formato LF-AAAA-NNNNN
async function nextTransactionNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `LF-${year}-`
  const last = await (prisma as any).financialTransaction.findFirst({
    where: { companyId, transactionNumber: { startsWith: prefix } },
    orderBy: { transactionNumber: 'desc' },
    select: { transactionNumber: true },
  })
  const seq = last?.transactionNumber
    ? parseInt(last.transactionNumber.replace(prefix, ''), 10) + 1
    : 1
  return `${prefix}${String(seq).padStart(5, '0')}`
}

// SHA-256 sobre campos imutáveis do lançamento — identifica unicamente o lançamento
function buildTransactionHash(id: string, companyId: string, netAmount: number, createdAt: Date): string {
  return crypto
    .createHash('sha256')
    .update(`${id}::${companyId}::${netAmount}::${createdAt.toISOString()}`)
    .digest('hex')
}

function calcNet(gross: number, interest: number, retention: number): number {
  return Math.round((gross + interest - retention) * 100) / 100
}

function refDate(isPaid: boolean, paidAt?: Date | null, dueDate?: Date | null): Date {
  if (isPaid && paidAt) return new Date(paidAt)
  if (dueDate) return new Date(dueDate)
  return new Date()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateBalance(
  tx: any,
  bankAccountId: string | null | undefined,
  type: string,
  netAmount: number,
  direction: 'apply' | 'revert',
) {
  if (!bankAccountId) return
  const account = await (tx as any).bankAccount.findUnique({
    where: { id: bankAccountId },
    select: { integrationActive: true, integrationStatus: true },
  })
  if (!account || account.integrationActive) return // skip OFX/Open Finance accounts

  const factor = direction === 'apply' ? 1 : -1
  const delta  = type === 'INCOME' ? netAmount * factor : -netAmount * factor

  await (tx as any).bankAccount.update({
    where: { id: bankAccountId },
    data:  { balance: { increment: delta } },
  })
}

// ─── Schemas de validação ─────────────────────────────────────────────────────

const createTxSchema = z.object({
  description:    z.string().min(1).max(500),
  type:           z.enum(['INCOME', 'EXPENSE']),
  isPaid:         z.boolean().default(false),
  grossAmount:    z.number().positive(),
  interestAmount: z.number().min(0).default(0),
  retentionAmount:z.number().min(0).default(0),
  dueDate:        z.string().nullable().optional(),
  paidAt:         z.string().nullable().optional(),
  categoryId:     z.string().nullable().optional(),
  bankAccountId:  z.string().nullable().optional(),
  paymentMethod:  z.string().nullable().optional(),
  invoiceNumber:  z.string().nullable().optional(),
  clientId:       z.string().nullable().optional(),
  supplierId:     z.string().nullable().optional(),
  employeeId:     z.string().nullable().optional(),
  notes:          z.string().nullable().optional(),
  attachments:    z.array(z.string()).default([]),
  costCenterAllocations: z.array(z.object({
    projectId:  z.string(),
    stageId:    z.string().nullable().optional(),
    amount:     z.number().positive(),
    percentage: z.number().min(0).max(100),
    costType:   z.string().nullable().optional(),
    notes:      z.string().nullable().optional(),
  })).default([]),
  // parcelas
  installmentNumber: z.number().int().positive().nullable().optional(),
  totalInstallments: z.number().int().positive().nullable().optional(),
  recurringId:       z.string().nullable().optional(),
})

const updateTxSchema = createTxSchema.partial()

const payTxSchema = z.object({
  paidAt:       z.string().optional(),
  bankAccountId:z.string().nullable().optional(),
  paymentMethod:z.string().nullable().optional(),
})

const createBankAccountSchema = z.object({
  name:              z.string().min(1),
  bank:              z.string().nullable().optional(),
  bankId:            z.string().nullable().optional(),
  agency:            z.string().nullable().optional(),
  agencyDigit:       z.string().nullable().optional(),
  accountNumber:     z.string().nullable().optional(),
  accountDigit:      z.string().nullable().optional(),
  accountType:       z.string().default('CHECKING'),
  pixKey:            z.string().nullable().optional(),
  holderName:        z.string().nullable().optional(),
  holderDocument:    z.string().nullable().optional(),
  initialBalance:    z.number().default(0),
  integrationActive: z.boolean().default(false),
})

const createRecurringSchema = z.object({
  description:      z.string().min(1),
  type:             z.enum(['INCOME', 'EXPENSE']),
  grossAmount:      z.number().positive(),
  interestAmount:   z.number().min(0).default(0),
  retentionAmount:  z.number().min(0).default(0),
  categoryId:       z.string().nullable().optional(),
  bankAccountId:    z.string().nullable().optional(),
  supplierId:       z.string().nullable().optional(),
  clientId:         z.string().nullable().optional(),
  notes:            z.string().nullable().optional(),
  frequency:        z.enum(['WEEKLY','BIWEEKLY','MONTHLY','BIMONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL']),
  startDate:        z.string(),
  endDate:          z.string().nullable().optional(),
  totalInstallments:z.number().int().positive().nullable().optional(),
})

// ─── Cálculo de data da próxima parcela ──────────────────────────────────────

function addFrequency(date: Date, freq: string): Date {
  const d = new Date(date)
  switch (freq) {
    case 'WEEKLY':     d.setDate(d.getDate() + 7);   break
    case 'BIWEEKLY':   d.setDate(d.getDate() + 14);  break
    case 'MONTHLY':    d.setMonth(d.getMonth() + 1); break
    case 'BIMONTHLY':  d.setMonth(d.getMonth() + 2); break
    case 'QUARTERLY':  d.setMonth(d.getMonth() + 3); break
    case 'SEMIANNUAL': d.setMonth(d.getMonth() + 6); break
    case 'ANNUAL':     d.setFullYear(d.getFullYear() + 1); break
  }
  return d
}

// ─────────────────────────────────────────────────────────────────────────────

export async function financialRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireCompany)

  // ── GET /api/financial/dashboard ─────────────────────────────────────────
  app.get('/dashboard', {
    preHandler: [requirePermission('financeiro', 'view')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req

    const query = request.query as {
      startDate?: string; endDate?: string
      bankAccountId?: string; centroCusto?: string
    }

    const now   = new Date()
    const start = query.startDate ? new Date(query.startDate) : new Date(now.getFullYear(), now.getMonth(), 1)
    const end   = query.endDate   ? new Date(query.endDate)   : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    const in7Days    = new Date(todayStart); in7Days.setDate(todayStart.getDate() + 7)
    const in30Days   = new Date(todayStart); in30Days.setDate(todayStart.getDate() + 30)

    const baseWhere = { companyId, isActive: true }
    const bankFilter = query.bankAccountId ? { bankAccountId: query.bankAccountId } : {}

    // ── queries paralelas ─────────────────────────────────────────────────
    const [
      incomeSum,
      expenseSum,
      periodIncome,
      periodExpense,
      payableToday,
      receivableMonth,
      overduePayable,
      overdueReceivable,
      payableNext7,
      payableNext30,
      receivableNext7,
      receivableNext30,
      cashflowRaw,
      expensesByCat,
      topProjects,
      recentTx,
      bankAccounts,
    ] = await Promise.all([
      // saldo atual: INCOME pago - EXPENSE pago
      prisma.financialTransaction.aggregate({
        where: { ...baseWhere, ...bankFilter, type: 'INCOME', isPaid: true },
        _sum: { netAmount: true },
      }),
      prisma.financialTransaction.aggregate({
        where: { ...baseWhere, ...bankFilter, type: 'EXPENSE', isPaid: true },
        _sum: { netAmount: true },
      }),
      // entradas no período
      prisma.financialTransaction.aggregate({
        where: { ...baseWhere, ...bankFilter, type: 'INCOME', isPaid: true, paidAt: { gte: start, lte: end } },
        _sum: { netAmount: true },
      }),
      // saídas no período
      prisma.financialTransaction.aggregate({
        where: { ...baseWhere, ...bankFilter, type: 'EXPENSE', isPaid: true, paidAt: { gte: start, lte: end } },
        _sum: { netAmount: true },
      }),
      // a pagar hoje
      prisma.financialTransaction.aggregate({
        where: { ...baseWhere, type: 'EXPENSE', isPaid: false, dueDate: { gte: todayStart, lte: todayEnd } },
        _sum: { netAmount: true },
        _count: true,
      }),
      // a receber no mês
      prisma.financialTransaction.aggregate({
        where: { ...baseWhere, type: 'INCOME', isPaid: false, dueDate: { gte: now, lte: monthEnd } },
        _sum: { netAmount: true },
        _count: true,
      }),
      // contas vencidas a pagar
      prisma.financialTransaction.aggregate({
        where: { ...baseWhere, type: 'EXPENSE', isPaid: false, dueDate: { lt: todayStart } },
        _sum: { netAmount: true },
        _count: true,
      }),
      // recebimentos vencidos
      prisma.financialTransaction.aggregate({
        where: { ...baseWhere, type: 'INCOME', isPaid: false, dueDate: { lt: todayStart } },
        _sum: { netAmount: true },
        _count: true,
      }),
      // a pagar nos próximos 7 dias (a partir de hoje)
      prisma.financialTransaction.aggregate({
        where: { ...baseWhere, type: 'EXPENSE', isPaid: false, dueDate: { gte: todayStart, lte: in7Days } },
        _sum: { netAmount: true },
        _count: true,
      }),
      // a pagar nos próximos 8-30 dias
      prisma.financialTransaction.aggregate({
        where: { ...baseWhere, type: 'EXPENSE', isPaid: false, dueDate: { gt: in7Days, lte: in30Days } },
        _sum: { netAmount: true },
        _count: true,
      }),
      // a receber nos próximos 7 dias
      prisma.financialTransaction.aggregate({
        where: { ...baseWhere, type: 'INCOME', isPaid: false, dueDate: { gte: todayStart, lte: in7Days } },
        _sum: { netAmount: true },
        _count: true,
      }),
      // a receber nos próximos 8-30 dias
      prisma.financialTransaction.aggregate({
        where: { ...baseWhere, type: 'INCOME', isPaid: false, dueDate: { gt: in7Days, lte: in30Days } },
        _sum: { netAmount: true },
        _count: true,
      }),
      // fluxo últimos 12 meses: busca tudo e agrupa por mês
      prisma.financialTransaction.findMany({
        where: {
          ...baseWhere,
          isPaid: true,
          paidAt: { gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) },
        },
        select: { type: true, netAmount: true, paidAt: true },
      }),
      // despesas por categoria no período
      prisma.financialTransaction.findMany({
        where: { ...baseWhere, type: 'EXPENSE', isPaid: true, paidAt: { gte: start, lte: end } },
        select: { netAmount: true, category: { select: { id: true, name: true, color: true } } },
      }),
      // top projetos por despesa no período
      prisma.costCenterAllocation.findMany({
        where: {
          transaction: { ...baseWhere, type: 'EXPENSE', isPaid: true, paidAt: { gte: start, lte: end } },
        },
        select: { amount: true, project: { select: { id: true, name: true } } },
      }),
      // últimas 10 movimentações
      prisma.financialTransaction.findMany({
        where: { ...baseWhere },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true, description: true, type: true, isPaid: true,
          netAmount: true, referenceDate: true, paidAt: true, createdAt: true,
          category:    { select: { name: true, color: true, icon: true } },
          bankAccount: { select: { name: true } },
          createdBy:   { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      // saldos de contas bancárias
      prisma.bankAccount.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true, balance: true, accountType: true },
      }),
    ])

    // ── cashflow por mês ──────────────────────────────────────────────────
    const cashflowMap: Record<string, { month: string; income: number; expense: number }> = {}
    for (const tx of cashflowRaw) {
      if (!tx.paidAt) continue
      const key = `${tx.paidAt.getFullYear()}-${String(tx.paidAt.getMonth() + 1).padStart(2, '0')}`
      if (!cashflowMap[key]) cashflowMap[key] = { month: key, income: 0, expense: 0 }
      const amt = toNum(tx.netAmount)
      if (tx.type === 'INCOME')  cashflowMap[key].income  += amt
      if (tx.type === 'EXPENSE') cashflowMap[key].expense += amt
    }
    const cashflowByMonth = Object.values(cashflowMap).sort((a, b) => a.month.localeCompare(b.month))

    // ── despesas por categoria ────────────────────────────────────────────
    const catMap: Record<string, { id: string; name: string; color: string | null; total: number }> = {}
    const totalExpCat = expensesByCat.reduce((s, r) => s + toNum(r.netAmount), 0)
    for (const r of expensesByCat) {
      const key = r.category?.id ?? 'sem-categoria'
      if (!catMap[key]) catMap[key] = { id: key, name: r.category?.name ?? 'Sem categoria', color: r.category?.color ?? null, total: 0 }
      catMap[key].total += toNum(r.netAmount)
    }
    const expensesByCategory = Object.values(catMap)
      .map((c) => ({ ...c, value: totalExpCat > 0 ? Math.round((c.total / totalExpCat) * 100) : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)

    // ── top projetos ──────────────────────────────────────────────────────
    const projMap: Record<string, { id: string; name: string; total: number }> = {}
    for (const r of topProjects) {
      const key = r.project.id
      if (!projMap[key]) projMap[key] = { id: key, name: r.project.name, total: 0 }
      projMap[key].total += toNum(r.amount)
    }
    const topProjectsByExpense = Object.values(projMap).sort((a, b) => b.total - a.total).slice(0, 10)

    const incomeTotal    = toNum(incomeSum._sum.netAmount)
    const expenseTotal   = toNum(expenseSum._sum.netAmount)
    const currentBalance = incomeTotal - expenseTotal

    const bankTotal = bankAccounts.reduce((s, ba) => s + toNum(ba.balance), 0)

    return reply.send({
      currentBalance:    bankAccounts.length > 0 ? bankTotal : currentBalance,
      periodIncome:      toNum(periodIncome._sum.netAmount),
      periodExpense:     toNum(periodExpense._sum.netAmount),
      periodResult:      toNum(periodIncome._sum.netAmount) - toNum(periodExpense._sum.netAmount),
      payableToday:      { count: payableToday._count, amount: toNum(payableToday._sum.netAmount) },
      receivableMonth:   { count: receivableMonth._count, amount: toNum(receivableMonth._sum.netAmount) },
      overduePayable:    { count: overduePayable._count,    amount: toNum(overduePayable._sum.netAmount)    },
      overdueReceivable: { count: overdueReceivable._count, amount: toNum(overdueReceivable._sum.netAmount)  },
      payableNext7:      { count: payableNext7._count,      amount: toNum(payableNext7._sum.netAmount)      },
      payableNext30:     { count: payableNext30._count,     amount: toNum(payableNext30._sum.netAmount)     },
      receivableNext7:   { count: receivableNext7._count,   amount: toNum(receivableNext7._sum.netAmount)   },
      receivableNext30:  { count: receivableNext30._count,  amount: toNum(receivableNext30._sum.netAmount)  },
      cashflowByMonth,
      expensesByCategory,
      topProjectsByExpense,
      recentTransactions: recentTx,
    })
  })

  // ── GET /api/financial/transactions ──────────────────────────────────────
  app.get('/transactions', {
    preHandler: [requirePermission('financeiro', 'view')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const q = request.query as {
      startDate?: string; endDate?: string; type?: string
      isPaid?: string; categoryId?: string; bankAccountId?: string
      projectId?: string; supplierId?: string; clientId?: string
      page?: string; limit?: string; search?: string
    }

    const page  = Math.max(1, parseInt(q.page  ?? '1'))
    const limit = Math.min(100, parseInt(q.limit ?? '30'))
    const skip  = (page - 1) * limit

    const where: any = { companyId, isActive: true }
    if (q.startDate && q.endDate) {
      where.referenceDate = { gte: new Date(q.startDate), lte: new Date(q.endDate) }
    } else if (q.startDate) {
      where.referenceDate = { gte: new Date(q.startDate) }
    } else if (q.endDate) {
      where.referenceDate = { lte: new Date(q.endDate) }
    }
    if (q.type)          where.type          = q.type
    if (q.isPaid)        where.isPaid        = q.isPaid === 'true'
    if (q.categoryId)    where.categoryId    = q.categoryId
    if (q.bankAccountId) where.bankAccountId = q.bankAccountId
    if (q.supplierId)    where.supplierId    = q.supplierId
    if (q.clientId)      where.clientId      = q.clientId
    if (q.search)        where.description   = { contains: q.search, mode: 'insensitive' }
    if (q.projectId) {
      where.costCenterAllocations = { some: { projectId: q.projectId } }
    }

    const [total, transactions] = await Promise.all([
      prisma.financialTransaction.count({ where }),
      prisma.financialTransaction.findMany({
        where,
        orderBy: { referenceDate: 'desc' },
        skip,
        take: limit,
        include: {
          category:    { select: { id: true, name: true, color: true, icon: true } },
          bankAccount: { select: { id: true, name: true, bank: true } },
          client:      { select: { id: true, name: true } },
          supplier:    { select: { id: true, name: true } },
          createdBy:   { select: { id: true, name: true, avatarUrl: true } },
          costCenterAllocations: {
            include: {
              project: { select: { id: true, name: true } },
              stage:   { select: { id: true, name: true } },
            },
          },
        },
      }),
    ])

    return reply.send({ transactions: (transactions as any[]).map(serialiseTx), total, page, limit, pages: Math.ceil(total / limit) })
  })

  // ── POST /api/financial/transactions ─────────────────────────────────────
  app.post('/transactions', {
    preHandler: [requirePermission('financeiro', 'create')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId, memberId } = req
    const payload = request.user as JwtPayload

    const body = createTxSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Dados inválidos', details: body.error.flatten() })
    const d = body.data

    const gross     = d.grossAmount
    const interest  = d.interestAmount ?? 0
    const retention = d.retentionAmount ?? 0
    const net       = calcNet(gross, interest, retention)

    const paidAt  = d.isPaid && d.paidAt  ? new Date(d.paidAt)  : null
    const dueDate = d.dueDate ? new Date(d.dueDate) : null
    const refD    = refDate(d.isPaid, paidAt, dueDate)

    // validar rateio
    if (d.costCenterAllocations.length > 0) {
      const allocTotal = d.costCenterAllocations.reduce((s, a) => s + a.amount, 0)
      if (Math.abs(allocTotal - net) > 0.01) {
        return reply.status(400).send({ error: 'Soma do rateio difere do valor líquido', expected: net, got: allocTotal })
      }
    }

    const txNumber = await nextTransactionNumber(companyId)
    const createdNow = new Date()

    const tx = await prisma.$transaction(async (prismaT) => {
      const transaction = await (prismaT as any).financialTransaction.create({
        data: {
          companyId,
          createdById:       payload.sub,
          description:       d.description,
          type:              d.type,
          status:            d.isPaid ? 'PAID' : 'PENDING',
          isPaid:            d.isPaid,
          grossAmount:       gross,
          interestAmount:    interest,
          retentionAmount:   retention,
          netAmount:         net,
          dueDate,
          paidAt,
          referenceDate:     refD,
          categoryId:        d.categoryId   ?? null,
          bankAccountId:     d.bankAccountId ?? null,
          paymentMethod:     d.paymentMethod ?? null,
          invoiceNumber:     d.invoiceNumber ?? null,
          clientId:          d.clientId      ?? null,
          supplierId:        d.supplierId    ?? null,
          employeeId:        d.employeeId    ?? null,
          notes:             d.notes         ?? null,
          attachments:       d.attachments,
          recurringId:       d.recurringId       ?? null,
          installmentNumber: d.installmentNumber ?? null,
          totalInstallments: d.totalInstallments ?? null,
          isRecurring:       !!d.recurringId,
          transactionNumber: txNumber,
          createdAt:         createdNow,
        },
      })

      // Gera hash depois de ter o id definitivo
      const hash = buildTransactionHash(transaction.id, companyId, net, createdNow)
      await (prismaT as any).financialTransaction.update({
        where: { id: transaction.id },
        data:  { transactionHash: hash },
      })
      transaction.transactionHash   = hash
      transaction.transactionNumber = txNumber

      // rateio
      if (d.costCenterAllocations.length > 0) {
        await (prismaT as any).costCenterAllocation.createMany({
          data: d.costCenterAllocations.map((a) => ({
            transactionId: transaction.id,
            projectId:  a.projectId,
            stageId:    a.stageId   ?? null,
            amount:     a.amount,
            percentage: a.percentage,
            costType:   a.costType  ?? null,
            notes:      a.notes     ?? null,
          })),
        })
      }

      // saldo bancário
      if (d.isPaid) await updateBalance(prismaT, d.bankAccountId, d.type, net, 'apply')

      // audit log
      await (prismaT as any).financialAuditLog.create({
        data: { transactionId: transaction.id, userId: payload.sub, action: 'CREATED', newData: d },
      })

      return transaction
    })

    return reply.status(201).send({ transaction: tx })
  })

  // ── GET /api/financial/transactions/:id ─────────────────────────────────────
  app.get('/transactions/:id', {
    preHandler: [requirePermission('financeiro', 'view')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const { id } = request.params as { id: string }

    const tx = await (prisma as any).financialTransaction.findFirst({
      where: { id, companyId, isActive: true },
      include: {
        category:    { select: { id: true, name: true, color: true, icon: true } },
        bankAccount: { select: { id: true, name: true, bank: true } },
        client:      { select: { id: true, name: true } },
        supplier:    { select: { id: true, name: true } },
        createdBy:   { select: { id: true, name: true, avatarUrl: true } },
        costCenterAllocations: {
          include: {
            project: { select: { id: true, name: true } },
            stage:   { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        auditLogs: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
      },
    })

    if (!tx) return reply.status(404).send({ error: 'Lançamento não encontrado' })

    return reply.send({ transaction: serialiseTx(tx) })
  })

  // ── PUT /api/financial/transactions/:id ──────────────────────────────────
  app.put('/transactions/:id', {
    preHandler: [requirePermission('financeiro', 'edit')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const payload = request.user as JwtPayload
    const { id } = request.params as { id: string }

    const body = updateTxSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Dados inválidos', details: body.error.flatten() })
    const d = body.data

    const existing = await prisma.financialTransaction.findFirst({
      where: { id, companyId, isActive: true },
    })
    if (!existing) return reply.status(404).send({ error: 'Lançamento não encontrado' })

    const gross     = d.grossAmount     ?? toNum(existing.grossAmount)
    const interest  = d.interestAmount  ?? toNum(existing.interestAmount)
    const retention = d.retentionAmount ?? toNum(existing.retentionAmount)
    const net       = calcNet(gross, interest, retention)

    const isPaid  = d.isPaid ?? existing.isPaid
    const paidAt  = isPaid && d.paidAt ? new Date(d.paidAt) : (isPaid ? existing.paidAt : null)
    const dueDate = d.dueDate !== undefined ? (d.dueDate ? new Date(d.dueDate) : null) : existing.dueDate
    const refD    = refDate(isPaid, paidAt, dueDate)

    const updated = await prisma.$transaction(async (prismaT) => {
      const wasPaid      = existing.isPaid
      const oldAccount   = existing.bankAccountId
      const oldNet       = toNum(existing.netAmount)
      const oldType      = existing.type

      const newAccount   = d.bankAccountId !== undefined ? (d.bankAccountId ?? null) : oldAccount
      const newType      = d.type ?? oldType

      // estornar saldo antigo se estava pago e algo relevante mudou
      const balanceChanged = wasPaid && (
        oldNet !== net ||
        oldAccount !== newAccount ||
        oldType !== newType ||
        wasPaid !== isPaid
      )

      if (wasPaid && balanceChanged) {
        await updateBalance(prismaT, oldAccount, oldType, oldNet, 'revert')
      }

      const transaction = await (prismaT as any).financialTransaction.update({
        where: { id },
        data: {
          description:     d.description   ?? existing.description,
          type:            newType,
          status:          isPaid ? 'PAID' : 'PENDING',
          isPaid,
          grossAmount:     gross,
          interestAmount:  interest,
          retentionAmount: retention,
          netAmount:       net,
          dueDate,
          paidAt,
          referenceDate:   refD,
          categoryId:      d.categoryId     !== undefined ? (d.categoryId   ?? null) : existing.categoryId,
          bankAccountId:   newAccount,
          paymentMethod:   d.paymentMethod  !== undefined ? (d.paymentMethod ?? null) : existing.paymentMethod,
          invoiceNumber:   d.invoiceNumber  !== undefined ? (d.invoiceNumber ?? null) : existing.invoiceNumber,
          clientId:        d.clientId       !== undefined ? (d.clientId      ?? null) : existing.clientId,
          supplierId:      d.supplierId     !== undefined ? (d.supplierId    ?? null) : existing.supplierId,
          notes:           d.notes          !== undefined ? (d.notes         ?? null) : existing.notes,
          attachments:     d.attachments    ?? existing.attachments,
        },
      })

      // aplicar novo saldo
      if (isPaid && balanceChanged) {
        await updateBalance(prismaT, newAccount, newType, net, 'apply')
      }

      // rateio (substituição completa)
      if (d.costCenterAllocations !== undefined) {
        const allocTotal = d.costCenterAllocations!.reduce((s, a) => s + a.amount, 0)
        if (d.costCenterAllocations!.length > 0 && Math.abs(allocTotal - net) > 0.01) {
          throw new Error(`Soma do rateio (${allocTotal}) difere do valor líquido (${net})`)
        }
        await (prismaT as any).costCenterAllocation.deleteMany({ where: { transactionId: id } })
        if (d.costCenterAllocations!.length > 0) {
          await (prismaT as any).costCenterAllocation.createMany({
            data: d.costCenterAllocations!.map((a) => ({
              transactionId: id,
              projectId:  a.projectId,
              stageId:    a.stageId   ?? null,
              amount:     a.amount,
              percentage: a.percentage,
              costType:   a.costType  ?? null,
              notes:      a.notes     ?? null,
            })),
          })
        }
      }

      await (prismaT as any).financialAuditLog.create({
        data: {
          transactionId: id,
          userId:        payload.sub,
          action:        'EDITED',
          previousData:  {
            grossAmount: existing.grossAmount, isPaid: existing.isPaid,
            bankAccountId: existing.bankAccountId, type: existing.type,
          },
          newData: d,
        },
      })

      return transaction
    })

    return reply.send({ transaction: updated })
  })

  // ── PATCH /api/financial/transactions/:id/pay ─────────────────────────────
  app.patch('/transactions/:id/pay', {
    preHandler: [requirePermission('financeiro', 'edit')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const payload = request.user as JwtPayload
    const { id } = request.params as { id: string }

    const body = payTxSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Dados inválidos' })
    const d = body.data

    const existing = await prisma.financialTransaction.findFirst({
      where: { id, companyId, isActive: true },
    })
    if (!existing)       return reply.status(404).send({ error: 'Lançamento não encontrado' })
    if (existing.isPaid) return reply.status(409).send({ error: 'Lançamento já está pago' })

    const paidAt      = d.paidAt ? new Date(d.paidAt) : new Date()
    const bankAccId   = d.bankAccountId !== undefined ? (d.bankAccountId ?? existing.bankAccountId) : existing.bankAccountId
    const netAmount   = toNum(existing.netAmount)

    const updated = await prisma.$transaction(async (prismaT) => {
      await updateBalance(prismaT, bankAccId, existing.type, netAmount, 'apply')

      const tx = await (prismaT as any).financialTransaction.update({
        where: { id },
        data: {
          isPaid: true,
          status: 'PAID',
          paidAt,
          referenceDate:  paidAt,
          bankAccountId:  bankAccId,
          paymentMethod:  d.paymentMethod ?? existing.paymentMethod,
        },
      })

      await (prismaT as any).financialAuditLog.create({
        data: { transactionId: id, userId: payload.sub, action: 'PAID', newData: { paidAt } },
      })

      return tx
    })

    return reply.send({ transaction: updated })
  })

  // ── PATCH /api/financial/transactions/:id/cancel ──────────────────────────
  app.patch('/transactions/:id/cancel', {
    preHandler: [requirePermission('financeiro', 'delete')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const payload = request.user as JwtPayload
    const { id } = request.params as { id: string }

    const existing = await prisma.financialTransaction.findFirst({
      where: { id, companyId, isActive: true },
    })
    if (!existing) return reply.status(404).send({ error: 'Lançamento não encontrado' })

    await prisma.$transaction(async (prismaT) => {
      if (existing.isPaid) {
        await updateBalance(prismaT, existing.bankAccountId, existing.type, toNum(existing.netAmount), 'revert')
      }

      await (prismaT as any).financialTransaction.update({
        where: { id },
        data: {
          isActive:    false,
          status:      'CANCELLED',
          deletedAt:   new Date(),
          deletedById: payload.sub,
        },
      })

      await (prismaT as any).financialAuditLog.create({
        data: { transactionId: id, userId: payload.sub, action: existing.isPaid ? 'DELETED' : 'CANCELLED' },
      })
    })

    return reply.send({ success: true })
  })

  // ── POST /api/financial/transactions/:id/allocations ─────────────────────
  app.post('/transactions/:id/allocations', {
    preHandler: [requirePermission('financeiro', 'edit')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const { id } = request.params as { id: string }

    const body = z.object({
      allocations: z.array(z.object({
        projectId:  z.string(),
        stageId:    z.string().nullable().optional(),
        amount:     z.number().positive(),
        percentage: z.number().min(0).max(100),
        costType:   z.string().nullable().optional(),
        notes:      z.string().nullable().optional(),
      })),
    }).safeParse(request.body)

    if (!body.success) return reply.status(400).send({ error: 'Dados inválidos' })

    const existing = await prisma.financialTransaction.findFirst({ where: { id, companyId, isActive: true } })
    if (!existing) return reply.status(404).send({ error: 'Lançamento não encontrado' })

    const net   = toNum(existing.netAmount)
    const total = body.data.allocations.reduce((s, a) => s + a.amount, 0)
    if (body.data.allocations.length > 0 && Math.abs(total - net) > 0.01) {
      return reply.status(400).send({ error: 'Soma do rateio difere do valor líquido', expected: net, got: total })
    }

    await prisma.$transaction(async (prismaT) => {
      await (prismaT as any).costCenterAllocation.deleteMany({ where: { transactionId: id } })
      if (body.data.allocations.length > 0) {
        await (prismaT as any).costCenterAllocation.createMany({
          data: body.data.allocations.map((a) => ({
            transactionId: id,
            projectId:  a.projectId,
            stageId:    a.stageId   ?? null,
            amount:     a.amount,
            percentage: a.percentage,
            costType:   a.costType  ?? null,
            notes:      a.notes     ?? null,
          })),
        })
      }
    })

    return reply.send({ success: true })
  })

  // ── POST /api/financial/recurring ────────────────────────────────────────
  app.post('/recurring', {
    preHandler: [requirePermission('financeiro', 'create')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const payload = request.user as JwtPayload

    const body = createRecurringSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Dados inválidos', details: body.error.flatten() })
    const d = body.data

    const net = calcNet(d.grossAmount, d.interestAmount ?? 0, d.retentionAmount ?? 0)
    const maxInstallments = d.totalInstallments ?? 120
    const startDate = new Date(d.startDate)
    const endDate   = d.endDate ? new Date(d.endDate) : null

    const recurring = await prisma.$transaction(async (prismaT) => {
      const rec = await (prismaT as any).recurringTransaction.create({
        data: {
          companyId,
          description:       d.description,
          type:              d.type,
          amount:            net,
          categoryId:        d.categoryId   ?? null,
          bankAccountId:     d.bankAccountId ?? null,
          supplierId:        d.supplierId    ?? null,
          clientId:          d.clientId      ?? null,
          frequency:         d.frequency,
          startDate,
          endDate,
          totalInstallments: d.totalInstallments ?? null,
        },
      })

      const installments: any[] = []
      let currentDate = startDate
      let count = 0

      while (count < maxInstallments) {
        if (endDate && currentDate > endDate) break
        installments.push({
          companyId,
          createdById:       payload.sub,
          description:       `${d.description} (${count + 1}/${maxInstallments})`,
          type:              d.type,
          status:            'PENDING',
          isPaid:            false,
          grossAmount:       d.grossAmount,
          interestAmount:    d.interestAmount ?? 0,
          retentionAmount:   d.retentionAmount ?? 0,
          netAmount:         net,
          dueDate:           new Date(currentDate),
          referenceDate:     new Date(currentDate),
          categoryId:        d.categoryId   ?? null,
          bankAccountId:     d.bankAccountId ?? null,
          supplierId:        d.supplierId    ?? null,
          clientId:          d.clientId      ?? null,
          origin:            'RECURRING',
          recurringId:       rec.id,
          isRecurring:       true,
          installmentNumber: count + 1,
          totalInstallments: d.totalInstallments ?? null,
        })
        currentDate = addFrequency(currentDate, d.frequency)
        count++
      }

      await (prismaT as any).financialTransaction.createMany({ data: installments })
      await (prismaT as any).recurringTransaction.update({
        where: { id: rec.id },
        data:  { generatedCount: installments.length },
      })

      return { recurring: rec, count: installments.length }
    })

    return reply.status(201).send(recurring)
  })

  // ── GET /api/financial/bank-accounts ─────────────────────────────────────
  app.get('/bank-accounts', {
    preHandler: [requirePermission('financeiro', 'view')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const q = request.query as { status?: string; activeOnly?: string }

    // status filter: 'ACTIVE' | 'INACTIVE' | 'CLOSED' | undefined (all)
    // activeOnly=true: only ACTIVE accounts (used by transaction dropdowns)
    const statusFilter = q.activeOnly === 'true'
      ? { status: 'ACTIVE' as const }
      : q.status && q.status !== 'ALL'
        ? { status: q.status as any }
        : {}

    const accounts = await (prisma as any).bankAccount.findMany({
      where: { companyId, ...statusFilter },
      orderBy: { name: 'asc' },
      include: { bankRef: { select: { id: true, name: true, code: true } } },
    })

    // saldo calculado = initialBalance + movimentos pagos
    const withBalances = await Promise.all(accounts.map(async (acc: any) => {
      const [inc, exp] = await Promise.all([
        prisma.financialTransaction.aggregate({
          where: { bankAccountId: acc.id, type: 'INCOME', isPaid: true, isActive: true },
          _sum: { netAmount: true },
        }),
        prisma.financialTransaction.aggregate({
          where: { bankAccountId: acc.id, type: 'EXPENSE', isPaid: true, isActive: true },
          _sum: { netAmount: true },
        }),
      ])
      const computed = toNum(acc.initialBalance) + toNum(inc._sum.netAmount) - toNum(exp._sum.netAmount)
      return {
        ...acc,
        computedBalance:    computed,
        initialBalance:     toNum(acc.initialBalance),
        balance:            toNum(acc.balance),
        status:             acc.status ?? 'ACTIVE',
        inactivatedAt:      acc.inactivatedAt ?? null,
        inactivationReason: acc.inactivationReason ?? null,
      }
    }))

    const activeAccounts   = withBalances.filter((a: any) => a.status === 'ACTIVE')
    const inactiveAccounts = withBalances.filter((a: any) => a.status === 'INACTIVE')
    const closedAccounts   = withBalances.filter((a: any) => a.status === 'CLOSED')
    const totalBalance     = activeAccounts.reduce((s: number, a: any) => s + a.computedBalance, 0)
    const activeCount      = activeAccounts.length
    const inactiveCount    = inactiveAccounts.length
    const closedCount      = closedAccounts.length
    const connected        = activeAccounts.filter((a: any) => a.integrationActive).length

    return reply.send({ accounts: withBalances, totalBalance, activeCount, inactiveCount, closedCount, connected })
  })

  // ── POST /api/financial/bank-accounts ────────────────────────────────────
  app.post('/bank-accounts', {
    preHandler: [requirePermission('financeiro', 'create')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req

    const body = createBankAccountSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Dados inválidos', details: body.error.flatten() })
    const d = body.data

    const account = await prisma.bankAccount.create({
      data: {
        companyId,
        name:              d.name,
        bank:              d.bank              ?? null,
        bankId:            d.bankId            ?? null,
        agency:            d.agency            ?? null,
        agencyDigit:       d.agencyDigit       ?? null,
        accountNumber:     d.accountNumber     ?? null,
        accountDigit:      d.accountDigit      ?? null,
        accountType:       (d.accountType as any) ?? 'CHECKING',
        pixKey:            d.pixKey            ?? null,
        holderName:        d.holderName        ?? null,
        holderDocument:    d.holderDocument    ?? null,
        initialBalance:    d.initialBalance,
        balance:           d.initialBalance,
        integrationActive: d.integrationActive,
      },
    })

    return reply.status(201).send({ account })
  })

  // ── PUT /api/financial/bank-accounts/:id ─────────────────────────────────
  app.put('/bank-accounts/:id', {
    preHandler: [requirePermission('financeiro', 'edit')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const { id } = request.params as { id: string }

    const body = createBankAccountSchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Dados inválidos' })
    const d = body.data

    const existing = await prisma.bankAccount.findFirst({ where: { id, companyId } })
    if (!existing) return reply.status(404).send({ error: 'Conta não encontrada' })

    const updated = await prisma.bankAccount.update({
      where: { id },
      data: {
        name:              d.name              ?? existing.name,
        bank:              d.bank              ?? existing.bank,
        bankId:            d.bankId            ?? existing.bankId,
        agency:            d.agency            ?? existing.agency,
        agencyDigit:       d.agencyDigit       ?? existing.agencyDigit,
        accountNumber:     d.accountNumber     ?? existing.accountNumber,
        accountDigit:      d.accountDigit      ?? existing.accountDigit,
        accountType:       (d.accountType as any) ?? existing.accountType,
        pixKey:            d.pixKey            ?? existing.pixKey,
        holderName:        d.holderName        ?? existing.holderName,
        holderDocument:    d.holderDocument    ?? existing.holderDocument,
        integrationActive: d.integrationActive ?? existing.integrationActive,
      },
    })

    return reply.send({ account: updated })
  })

  // ── PATCH /api/financial/bank-accounts/:id/inactivate ───────────────────
  app.patch('/bank-accounts/:id/inactivate', {
    preHandler: [requirePermission('financeiro', 'edit')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const payload = request.user as JwtPayload
    const { id } = request.params as { id: string }
    const body = z.object({ reason: z.string().optional() }).safeParse(request.body)
    const reason = body.success ? (body.data.reason ?? null) : null

    const existing = await (prisma as any).bankAccount.findFirst({ where: { id, companyId } })
    if (!existing) return reply.status(404).send({ error: 'Conta não encontrada' })
    if (existing.status === 'CLOSED')   return reply.status(400).send({ error: 'Conta encerrada não pode ser inativada' })
    if (existing.status === 'INACTIVE') return reply.status(400).send({ error: 'Conta já está inativa' })

    await (prisma as any).bankAccount.update({
      where: { id },
      data: {
        status:             'INACTIVE',
        isActive:           false,
        inactivatedAt:      new Date(),
        inactivatedById:    payload.sub,
        inactivationReason: reason,
      },
    })
    return reply.send({ success: true })
  })

  // ── PATCH /api/financial/bank-accounts/:id/reactivate ────────────────────
  app.patch('/bank-accounts/:id/reactivate', {
    preHandler: [requirePermission('financeiro', 'edit')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const { id } = request.params as { id: string }

    const existing = await (prisma as any).bankAccount.findFirst({ where: { id, companyId } })
    if (!existing) return reply.status(404).send({ error: 'Conta não encontrada' })
    if (existing.status === 'CLOSED')  return reply.status(400).send({ error: 'Conta encerrada não pode ser reativada' })
    if (existing.status === 'ACTIVE')  return reply.status(400).send({ error: 'Conta já está ativa' })

    await (prisma as any).bankAccount.update({
      where: { id },
      data: {
        status:             'ACTIVE',
        isActive:           true,
        inactivatedAt:      null,
        inactivatedById:    null,
        inactivationReason: null,
      },
    })
    return reply.send({ success: true })
  })

  // ── PATCH /api/financial/bank-accounts/:id/close ─────────────────────────
  app.patch('/bank-accounts/:id/close', {
    preHandler: [requirePermission('financeiro', 'delete')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const payload = request.user as JwtPayload
    const { id } = request.params as { id: string }
    const body = z.object({ reason: z.string().optional() }).safeParse(request.body)
    const reason = body.success ? (body.data.reason ?? null) : null

    const existing = await (prisma as any).bankAccount.findFirst({ where: { id, companyId } })
    if (!existing) return reply.status(404).send({ error: 'Conta não encontrada' })
    if (existing.status === 'CLOSED') return reply.status(400).send({ error: 'Conta já está encerrada' })

    await (prisma as any).bankAccount.update({
      where: { id },
      data: {
        status:             'CLOSED',
        isActive:           false,
        inactivatedAt:      new Date(),
        inactivatedById:    payload.sub,
        inactivationReason: reason,
      },
    })
    return reply.send({ success: true })
  })

  // ── DELETE /api/financial/bank-accounts/:id ───────────────────────────────
  app.delete('/bank-accounts/:id', {
    preHandler: [requirePermission('financeiro', 'delete')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const { id } = request.params as { id: string }

    const existing = await (prisma as any).bankAccount.findFirst({ where: { id, companyId } })
    if (!existing) return reply.status(404).send({ error: 'Conta não encontrada' })

    const txCount = await prisma.financialTransaction.count({ where: { bankAccountId: id } })
    if (txCount > 0) return reply.status(400).send({ error: `Não é possível excluir: existem ${txCount} lançamento(s) vinculados a esta conta.` })

    await prisma.bankAccount.delete({ where: { id } })
    return reply.send({ success: true })
  })

  // ── GET /api/financial/categories ────────────────────────────────────────
  app.get('/categories', {
    preHandler: [requirePermission('financeiro', 'view')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const q = request.query as { type?: string }

    const where: any = {
      AND: [
        { isActive: true },
        {
          OR: [
            { companyId: null },
            { companyId },
          ],
        },
      ],
    }
    if (q.type) where.AND.push({ type: { in: [q.type, 'BOTH'] } })

    const categories = await prisma.financialCategory.findMany({
      where,
      orderBy: [{ type: 'asc' }, { order: 'asc' }, { name: 'asc' }],
    })

    return reply.send({ categories })
  })

  // ── POST /api/financial/categories ───────────────────────────────────────
  app.post('/categories', {
    preHandler: [requirePermission('financeiro', 'create')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req

    const body = z.object({
      name:  z.string().min(1),
      type:  z.enum(['INCOME', 'EXPENSE', 'BOTH']),
      color: z.string().nullable().optional(),
      icon:  z.string().nullable().optional(),
    }).safeParse(request.body)

    if (!body.success) return reply.status(400).send({ error: 'Dados inválidos' })
    const d = body.data

    const category = await prisma.financialCategory.create({
      data: { companyId, name: d.name, type: d.type, color: d.color ?? null, icon: d.icon ?? null },
    })

    return reply.status(201).send({ category })
  })

  // ── GET /api/financial/banks ──────────────────────────────────────────────
  // Retorna lista de bancos; se vazia, busca da BrasilAPI e popula
  app.get('/banks', async (request, reply) => {
    const q = request.query as { search?: string }

    let count = await prisma.bank.count()

    if (count === 0) {
      // popular da BrasilAPI
      try {
        const res = await fetch('https://brasilapi.com.br/api/banks/v1')
        if (res.ok) {
          const raw = (await res.json()) as any[]
          const data = raw
            .filter((b) => b.ispb)
            .map((b) => ({
              code:     b.code     ? String(b.code).padStart(3, '0') : null,
              ispb:     String(b.ispb).padStart(8, '0'),
              name:     b.name     ?? '',
              fullName: b.fullName ?? null,
            }))

          // upsert em batches de 50
          for (let i = 0; i < data.length; i += 50) {
            const batch = data.slice(i, i + 50)
            await Promise.all(batch.map((b) =>
              prisma.bank.upsert({
                where: { ispb: b.ispb },
                update: { name: b.name, fullName: b.fullName, code: b.code },
                create: b,
              })
            ))
          }
        }
      } catch (e) {
        app.log.warn('BrasilAPI indisponível: %s', e)
      }
    }

    const where: any = { isActive: true }
    if (q.search) {
      where.OR = [
        { name:     { contains: q.search, mode: 'insensitive' } },
        { fullName: { contains: q.search, mode: 'insensitive' } },
        { code:     { contains: q.search, mode: 'insensitive' } },
      ]
    }

    const banks = await prisma.bank.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 50,
      select: { id: true, code: true, ispb: true, name: true, fullName: true },
    })

    return reply.send({ banks })
  })

  // ── GET /api/financial/projects — obras disponíveis para rateio ──────────
  app.get('/projects', {
    preHandler: [requirePermission('financeiro', 'view')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req

    const projects = await prisma.project.findMany({
      where: { companyId, status: { not: 'CANCELLED' } },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, status: true,
        stages: { select: { id: true, name: true, order: true }, orderBy: { order: 'asc' } },
      },
    })

    return reply.send({ projects })
  })

  // ── GET /api/financial/clients — clientes para autocomplete ─────────────
  app.get('/clients', {
    preHandler: [requirePermission('financeiro', 'view')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const q = request.query as { search?: string }

    const where: any = { companyId, isActive: true }
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' }

    const clients = await prisma.client.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 20,
      select: { id: true, name: true, email: true, cpfCnpj: true },
    })

    return reply.send({ clients })
  })

  // ── GET /api/financial/suppliers — fornecedores para autocomplete ────────
  app.get('/suppliers', {
    preHandler: [requirePermission('financeiro', 'view')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const q = request.query as { search?: string }

    const where: any = { companyId, isActive: true }
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' }

    const suppliers = await prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 20,
      select: { id: true, name: true, email: true, cnpj: true },
    })

    return reply.send({ suppliers })
  })
}
