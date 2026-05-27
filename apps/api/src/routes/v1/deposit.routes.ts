import path from 'path'
import fs   from 'fs'
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@sysobra/database'
import {
  authenticate,
  requireCompany,
  RequestWithMember,
  JwtPayload,
} from '../../middlewares/auth.middleware'

// ─── helpers ─────────────────────────────────────────────────────────────────

function p() { return prisma as any }

function companyId(req: RequestWithMember) { return req.companyId }
function userId(request: any): string | null {
  try { return (request.user as JwtPayload).sub } catch { return null }
}

// Recalcula custo médio ponderado após uma entrada
function calcAverageCost(
  currentQty: number,
  currentAvg: number,
  inQty: number,
  inCost: number,
): number {
  const totalQty = currentQty + inQty
  if (totalQty <= 0) return inCost
  return (currentQty * currentAvg + inQty * inCost) / totalQty
}

// Gera docNumber sequencial: OS-YYYY-NNNN
async function nextDocNumber(cid: string, year: number): Promise<string> {
  const prefix = `OS-${year}-`
  const last = await p().stockBasket.findFirst({
    where: {
      companyId: cid,
      docNumber: { startsWith: prefix },
    },
    orderBy: { docNumber: 'desc' },
    select: { docNumber: true },
  })
  let seq = 1
  if (last?.docNumber) {
    const parts = last.docNumber.split('-')
    seq = parseInt(parts[parts.length - 1] ?? '0') + 1
  }
  return `${prefix}${String(seq).padStart(4, '0')}`
}

// Resolve caminho de upload para disco
function resolveUploadPath(url: string): string {
  // /uploads/... → uploads/... (relativo ao process.cwd das apps/api)
  const rel = url.replace(/^\//, '')
  return path.resolve(process.cwd(), rel)
}

// Salva base64 de assinatura em disco → retorna URL pública
function saveSignaturePng(base64: string, cid: string, basketId: string, role: 'sender' | 'receiver'): string {
  const dir = path.resolve(process.cwd(), 'uploads', 'signatures', cid, basketId)
  fs.mkdirSync(dir, { recursive: true })
  const fileName = `${role}.png`
  const filePath = path.join(dir, fileName)
  const data = base64.replace(/^data:image\/png;base64,/, '')
  fs.writeFileSync(filePath, Buffer.from(data, 'base64'))
  return `/uploads/signatures/${cid}/${basketId}/${fileName}`
}

// ─── schemas ─────────────────────────────────────────────────────────────────

const itemCreateSchema = z.object({
  name:            z.string().min(1),
  description:     z.string().optional(),
  category:        z.string().optional(),
  unit:            z.string().default('un'),
  code:            z.string().optional(),
  brand:           z.string().optional(),
  model:           z.string().optional(),
  serialNumber:    z.string().optional(),
  location:        z.string().optional(),
  minQuantity:     z.number().default(0),
  maxQuantity:     z.number().optional(),
  isConsumable:    z.boolean().default(true),
  requiresCustody: z.boolean().default(false),
  isEpi:           z.boolean().default(false),
  isUniform:       z.boolean().default(false),
  imageUrl:        z.string().optional(),
  // Localização no depósito
  locationShelf:   z.string().optional(),
  locationSection: z.string().optional(),
  locationDetail:  z.string().optional(),
  // Especificações técnicas
  toolType:        z.string().optional(),
  voltage:         z.string().optional(),
  power:           z.string().optional(),
  // Garantia
  purchaseDate:       z.string().optional(),
  warrantyMonthsTool: z.number().int().optional(),
  warrantyExpiry:     z.string().optional(),
  // Assistência
  authorizedName:    z.string().optional(),
  authorizedPhone:   z.string().optional(),
  authorizedAddress: z.string().optional(),
  authorizedCity:    z.string().optional(),
  // Manutenção
  lastMaintenance: z.string().optional(),
  nextMaintenance: z.string().optional(),
})

const itemUpdateSchema = itemCreateSchema.partial()

const movementCreateSchema = z.object({
  stockItemId:   z.string(),
  type:          z.enum(['IN', 'OUT', 'ADJUSTMENT', 'TRANSFER', 'RETURN', 'LOSS', 'EPI_DELIVERY']),
  quantity:      z.number().positive(),
  unitCost:      z.number().optional(),
  projectId:     z.string().optional(),
  employeeId:    z.string().optional(),
  basketId:      z.string().optional(),
  docNumber:     z.string().optional(),
  reason:        z.string().optional(),
  notes:         z.string().optional(),
  // Para reclassificação contábil (OUT → obra)
  registerCostEntry: z.boolean().default(false),
})

const custodyCreateSchema = z.object({
  stockItemId:   z.string(),
  employeeId:    z.string(),
  projectId:     z.string().optional(),
  quantity:      z.number().positive().default(1),
  dueDate:       z.string().optional(),
  condition:     z.string().optional(),
  notes:         z.string().optional(),
})

const custodyReturnSchema = z.object({
  conditionOnReturn: z.string().optional(),
  notes:             z.string().optional(),
})

const epiDeliverySchema = z.object({
  stockItemId:   z.string(),
  employeeId:    z.string(),
  projectId:     z.string().optional(),
  quantity:      z.number().positive().default(1),
  condition:     z.string().optional(),
  notes:         z.string().optional(),
  caNumber:      z.string().optional(),
  signatureUrl:  z.string().optional(),
})

const supplierLotSchema = z.object({
  stockItemId:   z.string(),
  supplierId:    z.string().optional(),
  lotNumber:     z.string().optional(),
  invoiceNumber: z.string().optional(),
  purchaseDate:  z.string().optional(),
  quantity:      z.number().positive(),
  unitCost:      z.number().optional(),
  expiryDate:    z.string().optional(),
  notes:         z.string().optional(),
})

const basketCreateSchema = z.object({
  type:        z.enum(['OUT', 'EPI', 'RETURN']).default('OUT'),
  projectId:   z.string().optional(),
  employeeId:  z.string().optional(),
  destinatary: z.string().optional(),
  notes:       z.string().optional(),
  items: z.array(z.object({
    stockItemId: z.string(),
    name:        z.string(),
    unit:        z.string().default('un'),
    quantity:    z.number().positive(),
    unitCost:    z.number().optional(),
    reason:      z.string().optional(),
  })),
})

const basketSignSchema = z.object({
  senderSignature:   z.string().optional(),   // base64 PNG
  receiverSignature: z.string().optional(),   // base64 PNG
})

// ─── routes ──────────────────────────────────────────────────────────────────

export async function depositRoutes(app: FastifyInstance) {
  const preHandler = [authenticate, requireCompany]

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  // GET /api/v1/deposit/summary
  app.get('/summary', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)

    const [
      totalItems,
      totalMovementsToday,
      openCustodies,
      openBaskets,
    ] = await Promise.all([
      p().stockItem.count({ where: { companyId: cid, isActive: true } }),
      p().stockMovement.count({
        where: {
          companyId: cid,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      p().toolCustody.count({
        where: { companyId: cid, returnedAt: null },
      }),
      p().stockBasket.count({
        where: { companyId: cid, status: 'DRAFT' },
      }),
    ])

    // Low stock: quantity <= minQuantity
    const lowStock = await p().stockItem.findMany({
      where: {
        companyId: cid,
        isActive: true,
        minQuantity: { gt: 0 },
      },
      select: { id: true, name: true, quantity: true, minQuantity: true, unit: true },
    }).then((items: any[]) =>
      items.filter((i: any) => Number(i.quantity) <= Number(i.minQuantity))
    )

    // Approximate total value: sum(quantity * averageCost)
    const allItems = await p().stockItem.findMany({
      where: { companyId: cid, isActive: true },
      select: { quantity: true, averageCost: true, unitCost: true },
    })
    const estTotalValue = allItems.reduce((acc: number, i: any) => {
      const cost = Number(i.averageCost ?? i.unitCost ?? 0)
      return acc + Number(i.quantity) * cost
    }, 0)

    return reply.send({
      totalItems,
      lowStockCount: lowStock.length,
      lowStockItems: lowStock,
      totalMovementsToday,
      openCustodies,
      openBaskets,
      estimatedTotalValue: estTotalValue,
    })
  })

  // ── ITEMS CRUD ────────────────────────────────────────────────────────────
  // GET /api/v1/deposit/items
  app.get('/items', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { q, category, type, lowStock, page = '1', limit = '50' } = request.query as any

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const take = parseInt(limit)

    const where: any = { companyId: cid, isActive: true }
    if (q)        where.name = { contains: q, mode: 'insensitive' }
    if (category) where.category = category
    if (type === 'epi')        where.isEpi = true
    if (type === 'uniform')    where.isUniform = true
    if (type === 'tool')       where.requiresCustody = true
    if (type === 'consumable') where.isConsumable = true

    const [items, total] = await Promise.all([
      p().stockItem.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
        include: {
          currentProject: { select: { id: true, name: true } },
          supplierLots: {
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: { supplier: { select: { id: true, name: true } } },
          },
          _count: {
            select: { custodies: true, epiDeliveries: true, movements: true },
          },
        },
      }),
      p().stockItem.count({ where }),
    ])

    let result = items
    if (lowStock === 'true') {
      result = items.filter((i: any) =>
        Number(i.minQuantity) > 0 && Number(i.quantity) <= Number(i.minQuantity)
      )
    }

    return reply.send({ items: result, total, page: parseInt(page), limit: take })
  })

  // POST /api/v1/deposit/items
  app.post('/items', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const body = itemCreateSchema.parse(request.body)

    const data = buildItemData(body)
    const item = await p().stockItem.create({ data: { ...data, companyId: cid } })

    return reply.status(201).send(item)
  })

  // GET /api/v1/deposit/items/:id
  app.get('/items/:id', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const item = await p().stockItem.findFirst({
      where: { id, companyId: cid },
      include: {
        currentProject: { select: { id: true, name: true, address: true } },
        movements: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            project:     { select: { id: true, name: true } },
            employee:    { select: { id: true, name: true } },
            responsible: { select: { id: true, name: true } },
            basket:      { select: { id: true, docNumber: true, status: true } },
          },
        },
        custodies: {
          where: { returnedAt: null },
          include: {
            employee: { select: { id: true, name: true, position: true } },
            project:  { select: { id: true, name: true } },
          },
        },
        epiDeliveries: {
          orderBy: { deliveredAt: 'desc' },
          take: 20,
          include: { employee: { select: { id: true, name: true } } },
        },
        supplierLots: {
          orderBy: { createdAt: 'desc' },
          include: { supplier: { select: { id: true, name: true } } },
        },
        _count: {
          select: { movements: true, custodies: true, epiDeliveries: true, supplierLots: true },
        },
      },
    })

    if (!item) return reply.status(404).send({ error: 'Item não encontrado' })
    return reply.send(item)
  })

  // PUT /api/v1/deposit/items/:id
  app.put('/items/:id', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }
    const body = itemUpdateSchema.parse(request.body)

    const exists = await p().stockItem.findFirst({ where: { id, companyId: cid } })
    if (!exists) return reply.status(404).send({ error: 'Item não encontrado' })

    const data = buildItemData(body)
    const item = await p().stockItem.update({ where: { id }, data })
    return reply.send(item)
  })

  // DELETE /api/v1/deposit/items/:id (soft delete)
  app.delete('/items/:id', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const exists = await p().stockItem.findFirst({ where: { id, companyId: cid } })
    if (!exists) return reply.status(404).send({ error: 'Item não encontrado' })

    await p().stockItem.update({ where: { id }, data: { isActive: false } })
    return reply.send({ success: true })
  })

  // ── MOVEMENTS ─────────────────────────────────────────────────────────────
  // GET /api/v1/deposit/movements
  app.get('/movements', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { stockItemId, projectId, type, basketId, page = '1', limit = '50' } = request.query as any

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const take = parseInt(limit)
    const where: any = { companyId: cid }
    if (stockItemId) where.stockItemId = stockItemId
    if (projectId)   where.projectId = projectId
    if (type)        where.type = type
    if (basketId)    where.basketId = basketId

    const [movements, total] = await Promise.all([
      p().stockMovement.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          stockItem:   { select: { id: true, name: true, unit: true } },
          project:     { select: { id: true, name: true } },
          employee:    { select: { id: true, name: true } },
          responsible: { select: { id: true, name: true } },
          basket:      { select: { id: true, docNumber: true, status: true } },
        },
      }),
      p().stockMovement.count({ where }),
    ])

    return reply.send({ movements, total, page: parseInt(page), limit: take })
  })

  // POST /api/v1/deposit/movements
  app.post('/movements', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const body = movementCreateSchema.parse(request.body)

    const item = await p().stockItem.findFirst({
      where: { id: body.stockItemId, companyId: cid },
    })
    if (!item) return reply.status(404).send({ error: 'Item não encontrado' })

    const currentQty = Number(item.quantity)
    const currentAvg = Number(item.averageCost ?? item.unitCost ?? 0)

    let newQty = currentQty
    let newAvgCost = currentAvg
    const unitCost = body.unitCost ?? 0

    if (body.type === 'IN' || body.type === 'RETURN') {
      newQty = currentQty + body.quantity
      if (unitCost > 0) {
        newAvgCost = calcAverageCost(currentQty, currentAvg, body.quantity, unitCost)
      }
    } else if (body.type === 'OUT' || body.type === 'LOSS' || body.type === 'EPI_DELIVERY') {
      if (currentQty < body.quantity) {
        return reply.status(400).send({ error: 'Quantidade insuficiente em estoque' })
      }
      newQty = currentQty - body.quantity
    } else if (body.type === 'ADJUSTMENT') {
      newQty = body.quantity
    }

    const totalCost = body.quantity * (unitCost > 0 ? unitCost : currentAvg)

    const [movement] = await p().$transaction([
      p().stockMovement.create({
        data: {
          companyId:       cid,
          stockItemId:     body.stockItemId,
          projectId:       body.projectId ?? null,
          employeeId:      body.employeeId ?? null,
          responsibleId:   userId(request) ?? null,
          basketId:        body.basketId ?? null,
          docNumber:       body.docNumber ?? null,
          type:            body.type,
          quantity:        body.quantity,
          unitCost:        unitCost > 0 ? unitCost : null,
          averageCostAfter: newAvgCost > 0 ? newAvgCost : null,
          totalCost:       totalCost > 0 ? totalCost : null,
          reason:          body.reason ?? null,
          notes:           body.notes ?? null,
        },
      }),
      p().stockItem.update({
        where: { id: body.stockItemId },
        data: {
          quantity:    newQty,
          averageCost: newAvgCost > 0 ? newAvgCost : undefined,
          currentProjectId: body.type === 'TRANSFER' && body.projectId
            ? body.projectId
            : undefined,
        },
      }),
    ])

    if (body.registerCostEntry && body.type === 'OUT' && body.projectId && totalCost > 0) {
      await p().projectCostEntry.create({
        data: {
          companyId:       cid,
          projectId:       body.projectId,
          stockMovementId: movement.id,
          description:     `Saída: ${item.name}`,
          category:        item.category ?? 'Material',
          quantity:        body.quantity,
          unitCost:        unitCost > 0 ? unitCost : currentAvg,
          totalCost,
        },
      })
    }

    return reply.status(201).send(movement)
  })

  // ── CUSTODIES (Ferramentas) ───────────────────────────────────────────────
  // GET /api/v1/deposit/custodies
  app.get('/custodies', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { open, employeeId, projectId, location, page = '1', limit = '50' } = request.query as any

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const take = parseInt(limit)
    const where: any = { companyId: cid }
    if (open === 'true')  where.returnedAt = null
    if (open === 'false') where.returnedAt = { not: null }
    if (employeeId) where.employeeId = employeeId
    if (projectId)  where.projectId = projectId
    // location: DEPOSIT | PROJECT | MAINTENANCE | LOST (filtro por currentLocation do item)
    if (location) where.stockItem = { currentLocation: location }

    const [custodies, total] = await Promise.all([
      p().toolCustody.findMany({
        where,
        skip,
        take,
        orderBy: { checkedOutAt: 'desc' },
        include: {
          stockItem: { select: { id: true, name: true, unit: true, brand: true, serialNumber: true, currentLocation: true } },
          employee:  { select: { id: true, name: true, position: true } },
          project:   { select: { id: true, name: true } },
        },
      }),
      p().toolCustody.count({ where }),
    ])

    return reply.send({ custodies, total, page: parseInt(page), limit: take })
  })

  // POST /api/v1/deposit/custodies
  app.post('/custodies', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const body = custodyCreateSchema.parse(request.body)

    const item = await p().stockItem.findFirst({
      where: { id: body.stockItemId, companyId: cid },
    })
    if (!item) return reply.status(404).send({ error: 'Item não encontrado' })
    if (Number(item.quantity) < body.quantity) {
      return reply.status(400).send({ error: 'Quantidade insuficiente em estoque' })
    }

    const [custody] = await p().$transaction([
      p().toolCustody.create({
        data: {
          companyId:     cid,
          stockItemId:   body.stockItemId,
          employeeId:    body.employeeId,
          projectId:     body.projectId ?? null,
          responsibleId: userId(request) ?? null,
          quantity:      body.quantity,
          dueDate:       body.dueDate ? new Date(body.dueDate) : null,
          condition:     body.condition ?? null,
          notes:         body.notes ?? null,
        },
      }),
      p().stockItem.update({
        where: { id: body.stockItemId },
        data: {
          quantity:        Number(item.quantity) - body.quantity,
          currentLocation: 'PROJECT',
        },
      }),
      p().stockMovement.create({
        data: {
          companyId:     cid,
          stockItemId:   body.stockItemId,
          projectId:     body.projectId ?? null,
          employeeId:    body.employeeId,
          responsibleId: userId(request) ?? null,
          type:          'OUT',
          quantity:      body.quantity,
          reason:        'Custódia de ferramenta',
          notes:         body.notes ?? null,
        },
      }),
    ])

    return reply.status(201).send(custody)
  })

  // PUT /api/v1/deposit/custodies/:id/return
  app.put('/custodies/:id/return', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }
    const body = custodyReturnSchema.parse(request.body)

    const custody = await p().toolCustody.findFirst({
      where: { id, companyId: cid },
    })
    if (!custody) return reply.status(404).send({ error: 'Custódia não encontrada' })
    if (custody.returnedAt) return reply.status(400).send({ error: 'Item já foi devolvido' })

    const now = new Date()
    await p().$transaction([
      p().toolCustody.update({
        where: { id },
        data: {
          returnedAt:        now,
          conditionOnReturn: body.conditionOnReturn ?? null,
          notes:             custody.notes
            ? `${custody.notes}\nDevolução: ${body.notes ?? ''}`
            : (body.notes ?? null),
        },
      }),
      p().stockItem.update({
        where: { id: custody.stockItemId },
        data: {
          quantity:        { increment: Number(custody.quantity) },
          currentLocation: 'DEPOSIT',
        },
      }),
      p().stockMovement.create({
        data: {
          companyId:     cid,
          stockItemId:   custody.stockItemId,
          projectId:     custody.projectId ?? null,
          employeeId:    custody.employeeId,
          responsibleId: userId(request) ?? null,
          type:          'RETURN',
          quantity:      Number(custody.quantity),
          reason:        'Devolução de custódia',
          notes:         body.notes ?? null,
        },
      }),
    ])

    return reply.send({ success: true })
  })

  // ── EPI DELIVERIES ────────────────────────────────────────────────────────
  // GET /api/v1/deposit/epi-deliveries
  app.get('/epi-deliveries', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { employeeId, stockItemId, page = '1', limit = '50' } = request.query as any

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const take = parseInt(limit)
    const where: any = { companyId: cid }
    if (employeeId)  where.employeeId = employeeId
    if (stockItemId) where.stockItemId = stockItemId

    const [deliveries, total] = await Promise.all([
      p().stockEpiDelivery.findMany({
        where,
        skip,
        take,
        orderBy: { deliveredAt: 'desc' },
        include: {
          stockItem: { select: { id: true, name: true, code: true, unit: true } },
          employee:  { select: { id: true, name: true } },
          project:   { select: { id: true, name: true } },
        },
      }),
      p().stockEpiDelivery.count({ where }),
    ])

    return reply.send({ deliveries, total, page: parseInt(page), limit: take })
  })

  // POST /api/v1/deposit/epi-deliveries
  app.post('/epi-deliveries', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const body = epiDeliverySchema.parse(request.body)

    const item = await p().stockItem.findFirst({
      where: { id: body.stockItemId, companyId: cid },
    })
    if (!item) return reply.status(404).send({ error: 'Item não encontrado' })
    if (Number(item.quantity) < body.quantity) {
      return reply.status(400).send({ error: 'Quantidade insuficiente em estoque' })
    }

    const [delivery] = await p().$transaction([
      p().stockEpiDelivery.create({
        data: {
          companyId:     cid,
          stockItemId:   body.stockItemId,
          employeeId:    body.employeeId,
          projectId:     body.projectId ?? null,
          responsibleId: userId(request) ?? null,
          quantity:      body.quantity,
          condition:     body.condition ?? null,
          notes:         body.notes ?? null,
          caNumber:      body.caNumber ?? null,
          signatureUrl:  body.signatureUrl ?? null,
        },
      }),
      p().stockItem.update({
        where: { id: body.stockItemId },
        data: { quantity: Number(item.quantity) - body.quantity },
      }),
      p().stockMovement.create({
        data: {
          companyId:     cid,
          stockItemId:   body.stockItemId,
          projectId:     body.projectId ?? null,
          employeeId:    body.employeeId,
          responsibleId: userId(request) ?? null,
          type:          'EPI_DELIVERY',
          quantity:      body.quantity,
          reason:        'Entrega de EPI/Uniforme',
          notes:         body.notes ?? null,
        },
      }),
    ])

    return reply.status(201).send(delivery)
  })

  // ── CATEGORIES ────────────────────────────────────────────────────────────
  // GET /api/v1/deposit/categories
  app.get('/categories', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)

    const cats = await p().stockItem.groupBy({
      by: ['category'],
      where: { companyId: cid, isActive: true, category: { not: null } },
      _count: { _all: true },
      orderBy: { category: 'asc' },
    })

    return reply.send(cats.map((c: any) => ({ name: c.category, count: c._count._all })))
  })

  // ── RECEIVE PURCHASE ──────────────────────────────────────────────────────
  // POST /api/v1/deposit/receive-purchase
  app.post('/receive-purchase', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)

    const body = z.object({
      purchaseMapId: z.string(),
      items: z.array(z.object({
        stockItemId: z.string(),
        quantity:    z.number().positive(),
        unitCost:    z.number().optional(),
        notes:       z.string().optional(),
      })),
    }).parse(request.body)

    const purchaseMap = await p().purchaseMap.findFirst({
      where: { id: body.purchaseMapId, companyId: cid },
    })
    if (!purchaseMap) return reply.status(404).send({ error: 'Pedido não encontrado' })

    const results = []

    for (const entry of body.items) {
      const item = await p().stockItem.findFirst({
        where: { id: entry.stockItemId, companyId: cid },
      })
      if (!item) continue

      const currentQty = Number(item.quantity)
      const currentAvg = Number(item.averageCost ?? item.unitCost ?? 0)
      const unitCost   = entry.unitCost ?? 0
      const newQty     = currentQty + entry.quantity
      const newAvgCost = unitCost > 0
        ? calcAverageCost(currentQty, currentAvg, entry.quantity, unitCost)
        : currentAvg

      const [movement] = await p().$transaction([
        p().stockMovement.create({
          data: {
            companyId:       cid,
            stockItemId:     entry.stockItemId,
            responsibleId:   userId(request) ?? null,
            type:            'IN',
            quantity:        entry.quantity,
            unitCost:        unitCost > 0 ? unitCost : null,
            averageCostAfter: newAvgCost > 0 ? newAvgCost : null,
            totalCost:       entry.quantity * (unitCost > 0 ? unitCost : currentAvg),
            reason:          `Recebimento pedido #${purchaseMap.code ?? body.purchaseMapId}`,
            notes:           entry.notes ?? null,
          },
        }),
        p().stockItem.update({
          where: { id: entry.stockItemId },
          data: {
            quantity:    newQty,
            averageCost: newAvgCost > 0 ? newAvgCost : undefined,
          },
        }),
      ])

      results.push(movement)
    }

    return reply.send({ received: results.length, movements: results })
  })

  // ── SUPPLIER LOTS ─────────────────────────────────────────────────────────
  // GET /api/v1/deposit/supplier-lots?stockItemId=xxx
  app.get('/supplier-lots', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { stockItemId, supplierId, page = '1', limit = '50' } = request.query as any

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const take = parseInt(limit)
    const where: any = { companyId: cid }
    if (stockItemId) where.stockItemId = stockItemId
    if (supplierId)  where.supplierId = supplierId

    const [lots, total] = await Promise.all([
      p().supplierLot.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          stockItem: { select: { id: true, name: true, unit: true } },
          supplier:  { select: { id: true, name: true } },
        },
      }),
      p().supplierLot.count({ where }),
    ])

    return reply.send({ lots, total, page: parseInt(page), limit: take })
  })

  // POST /api/v1/deposit/supplier-lots
  app.post('/supplier-lots', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const body = supplierLotSchema.parse(request.body)

    const item = await p().stockItem.findFirst({
      where: { id: body.stockItemId, companyId: cid },
    })
    if (!item) return reply.status(404).send({ error: 'Item não encontrado' })

    const lot = await p().supplierLot.create({
      data: {
        companyId:    cid,
        stockItemId:  body.stockItemId,
        supplierId:   body.supplierId ?? null,
        lotNumber:    body.lotNumber ?? null,
        invoiceNumber: body.invoiceNumber ?? null,
        purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : null,
        quantity:     body.quantity,
        unitCost:     body.unitCost ?? null,
        expiryDate:   body.expiryDate ? new Date(body.expiryDate) : null,
        notes:        body.notes ?? null,
      },
      include: {
        stockItem: { select: { id: true, name: true } },
        supplier:  { select: { id: true, name: true } },
      },
    })

    return reply.status(201).send(lot)
  })

  // DELETE /api/v1/deposit/supplier-lots/:id
  app.delete('/supplier-lots/:id', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const exists = await p().supplierLot.findFirst({ where: { id, companyId: cid } })
    if (!exists) return reply.status(404).send({ error: 'Lote não encontrado' })

    await p().supplierLot.delete({ where: { id } })
    return reply.send({ success: true })
  })

  // ── BASKETS (Romaneios) ───────────────────────────────────────────────────
  // GET /api/v1/deposit/baskets
  app.get('/baskets', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { status, projectId, page = '1', limit = '20' } = request.query as any

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const take = parseInt(limit)
    const where: any = { companyId: cid }
    if (status)    where.status = status
    if (projectId) where.projectId = projectId

    const [baskets, total] = await Promise.all([
      p().stockBasket.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          project:     { select: { id: true, name: true } },
          employee:    { select: { id: true, name: true } },
          responsible: { select: { id: true, name: true } },
          _count: { select: { movements: true } },
        },
      }),
      p().stockBasket.count({ where }),
    ])

    return reply.send({ baskets, total, page: parseInt(page), limit: take })
  })

  // POST /api/v1/deposit/baskets  — cria romaneio + baixa estoque atomicamente
  app.post('/baskets', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const body = basketCreateSchema.parse(request.body)

    const year = new Date().getFullYear()
    const docNumber = await nextDocNumber(cid, year)

    // Verificar estoque de todos os itens
    for (const entry of body.items) {
      const item = await p().stockItem.findFirst({
        where: { id: entry.stockItemId, companyId: cid },
      })
      if (!item) return reply.status(404).send({ error: `Item ${entry.name} não encontrado` })
      if (body.type !== 'RETURN' && Number(item.quantity) < entry.quantity) {
        return reply.status(400).send({
          error: `Estoque insuficiente para "${entry.name}": disponível ${Number(item.quantity)} ${item.unit}`,
        })
      }
    }

    // Criar basket
    const basket = await p().stockBasket.create({
      data: {
        companyId:    cid,
        docNumber,
        type:         body.type,
        status:       'DRAFT',
        projectId:    body.projectId ?? null,
        employeeId:   body.employeeId ?? null,
        destinatary:  body.destinatary ?? null,
        notes:        body.notes ?? null,
        items:        body.items,
        responsibleId: userId(request) ?? null,
      },
    })

    // Processar cada item: movimento + atualização de estoque
    const movementType = body.type === 'RETURN' ? 'RETURN' :
                         body.type === 'EPI'    ? 'EPI_DELIVERY' : 'OUT'

    const operations: any[] = []
    for (const entry of body.items) {
      const item = await p().stockItem.findFirst({
        where: { id: entry.stockItemId, companyId: cid },
      })
      if (!item) continue

      const currentQty = Number(item.quantity)
      const currentAvg = Number(item.averageCost ?? item.unitCost ?? 0)
      const unitCost   = entry.unitCost ?? currentAvg
      const newQty     = movementType === 'RETURN'
        ? currentQty + entry.quantity
        : currentQty - entry.quantity
      const totalCost  = entry.quantity * (unitCost > 0 ? unitCost : currentAvg)

      operations.push(
        p().stockMovement.create({
          data: {
            companyId:     cid,
            stockItemId:   entry.stockItemId,
            projectId:     body.projectId ?? null,
            employeeId:    body.employeeId ?? null,
            responsibleId: userId(request) ?? null,
            basketId:      basket.id,
            docNumber,
            type:          movementType,
            quantity:      entry.quantity,
            unitCost:      unitCost > 0 ? unitCost : null,
            totalCost:     totalCost > 0 ? totalCost : null,
            reason:        entry.reason ?? `Romaneio ${docNumber}`,
            notes:         body.notes ?? null,
          },
        }),
        p().stockItem.update({
          where: { id: entry.stockItemId },
          data:  { quantity: Math.max(0, newQty) },
        }),
      )
    }

    if (operations.length > 0) {
      await p().$transaction(operations)
    }

    const result = await p().stockBasket.findFirst({
      where: { id: basket.id },
      include: {
        project:  { select: { id: true, name: true } },
        employee: { select: { id: true, name: true } },
        movements: {
          include: { stockItem: { select: { id: true, name: true, unit: true } } },
        },
      },
    })

    return reply.status(201).send(result)
  })

  // GET /api/v1/deposit/baskets/:id
  app.get('/baskets/:id', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const basket = await p().stockBasket.findFirst({
      where: { id, companyId: cid },
      include: {
        project:     { select: { id: true, name: true, address: true } },
        employee:    { select: { id: true, name: true, position: true, cpf: true } },
        responsible: { select: { id: true, name: true } },
        movements: {
          include: {
            stockItem: { select: { id: true, name: true, unit: true, code: true } },
          },
        },
      },
    })

    if (!basket) return reply.status(404).send({ error: 'Romaneio não encontrado' })
    return reply.send(basket)
  })

  // PATCH /api/v1/deposit/baskets/:id/sign — salva assinaturas em PNG
  app.patch('/baskets/:id/sign', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }
    const body = basketSignSchema.parse(request.body)

    const basket = await p().stockBasket.findFirst({ where: { id, companyId: cid } })
    if (!basket) return reply.status(404).send({ error: 'Romaneio não encontrado' })
    if (basket.status === 'CANCELLED') return reply.status(400).send({ error: 'Romaneio cancelado' })

    const data: any = {}

    if (body.senderSignature) {
      try {
        data.senderSignatureUrl = saveSignaturePng(body.senderSignature, cid, id, 'sender')
      } catch (err: any) {
        return reply.status(500).send({ error: 'Erro ao salvar assinatura do remetente' })
      }
    }

    if (body.receiverSignature) {
      try {
        data.receiverSignatureUrl = saveSignaturePng(body.receiverSignature, cid, id, 'receiver')
      } catch (err: any) {
        return reply.status(500).send({ error: 'Erro ao salvar assinatura do recebedor' })
      }
    }

    // Se ambas assinadas → marcar como SIGNED
    const updated = await p().stockBasket.update({ where: { id }, data })
    const senderUrl   = data.senderSignatureUrl   ?? basket.senderSignatureUrl
    const receiverUrl = data.receiverSignatureUrl ?? basket.receiverSignatureUrl

    if (senderUrl && receiverUrl && updated.status !== 'SIGNED') {
      await p().stockBasket.update({
        where: { id },
        data: { status: 'SIGNED', signedAt: new Date() },
      })
    }

    return reply.send({ success: true, ...data })
  })

  // PATCH /api/v1/deposit/baskets/:id/cancel
  app.patch('/baskets/:id/cancel', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const basket = await p().stockBasket.findFirst({
      where: { id, companyId: cid },
      include: { movements: { include: { stockItem: true } } },
    })
    if (!basket) return reply.status(404).send({ error: 'Romaneio não encontrado' })
    if (basket.status === 'SIGNED') return reply.status(400).send({ error: 'Romaneio já assinado não pode ser cancelado' })

    // Estornar movimentos
    const ops: any[] = []
    for (const mov of basket.movements) {
      const isOut = ['OUT', 'EPI_DELIVERY', 'LOSS'].includes(mov.type)
      ops.push(
        p().stockItem.update({
          where: { id: mov.stockItemId },
          data: {
            quantity: isOut
              ? { increment: Number(mov.quantity) }
              : { decrement: Number(mov.quantity) },
          },
        }),
        p().stockMovement.update({
          where: { id: mov.id },
          data: { notes: `${mov.notes ?? ''} [CANCELADO]` },
        }),
      )
    }

    ops.push(p().stockBasket.update({
      where: { id },
      data: { status: 'CANCELLED' },
    }))

    await p().$transaction(ops)
    return reply.send({ success: true })
  })
}

// ─── Helper: construir data de StockItem a partir do body ─────────────────────

function buildItemData(body: any): any {
  const data: any = { ...body }

  // Converter datas string → Date
  if (body.purchaseDate)    data.purchaseDate    = new Date(body.purchaseDate)
  if (body.warrantyExpiry)  data.warrantyExpiry  = new Date(body.warrantyExpiry)
  if (body.lastMaintenance) data.lastMaintenance = new Date(body.lastMaintenance)
  if (body.nextMaintenance) data.nextMaintenance = new Date(body.nextMaintenance)

  // Auto-calc locationFull
  if (body.locationShelf !== undefined || body.locationSection !== undefined) {
    const shelf   = data.locationShelf   ?? null
    const section = data.locationSection ?? null
    const detail  = data.locationDetail  ?? null
    const parts   = [
      shelf   ? `Prateleira ${shelf}`  : null,
      section ? `Seção ${section}`     : null,
      detail  ?? null,
    ].filter(Boolean)
    data.locationFull = parts.length > 0 ? parts.join(' / ') : null
  }

  // Auto-calc isUnderWarranty
  if (body.warrantyExpiry) {
    data.isUnderWarranty = new Date(body.warrantyExpiry) > new Date()
  } else if (body.purchaseDate && body.warrantyMonthsTool) {
    const expiry = new Date(body.purchaseDate)
    expiry.setMonth(expiry.getMonth() + body.warrantyMonthsTool)
    data.warrantyExpiry  = expiry
    data.isUnderWarranty = expiry > new Date()
  }

  return data
}
