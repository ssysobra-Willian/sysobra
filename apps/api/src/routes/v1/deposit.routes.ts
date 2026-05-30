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
import { getPdfHeader, getPdfFooter, PDF_BASE_STYLES } from '../../utils/pdfTemplate'
import { notifyManagers } from '../../utils/notifications'

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

// ─── helper: busca Depósito Central ativo da empresa ────────────────────────
async function getCentral(cid: string) {
  return p().stockLocation.findFirst({
    where: { companyId: cid, type: 'CENTRAL', isActive: true },
    select: { id: true, name: true },
  })
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
  // Custo e estoque inicial
  unitCost:        z.number().optional(),
  averageCost:     z.number().optional(),
  initialQuantity: z.number().default(0),       // cria movimento IN se > 0
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
  // Status operacional (ferramentas)
  toolStatus:      z.string().optional(),
  // Lotes de fornecedor (criados junto com o item)
  lots: z.array(z.object({
    supplierId:    z.string().optional(),
    lotNumber:     z.string().optional(),
    invoiceNumber: z.string().optional(),
    purchaseDate:  z.string().optional(),
    quantity:      z.number().positive(),
    unitCost:      z.number().optional(),
    expiryDate:    z.string().optional(),
    notes:         z.string().optional(),
  })).optional(),
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
  photoUrl:      z.string().optional(),   // foto do estado na saída
})

const custodyReturnSchema = z.object({
  conditionOnReturn: z.string().optional(),
  notes:             z.string().optional(),
})

const epiDeliverySchema = z.object({
  stockItemId:   z.string(),
  employeeId:    z.string(),
  projectId:     z.string().optional(),
  locationId:    z.string().optional(),
  quantity:      z.number().positive().default(1),
  size:          z.string().optional(),
  expiresAt:     z.string().optional(),
  condition:     z.string().optional(),
  notes:         z.string().optional(),
  caNumber:      z.string().optional(),
  signatureUrl:  z.string().optional(),
  signature:     z.string().optional(),   // base64 — assinatura a ser salva como PNG
  selfie:        z.string().optional(),   // base64 — selfie do colaborador com EPI
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
  // Suporta: q, category, type, lowStock, page, limit
  // Novo:    locationId (filtra por saldo no local e retorna availableQty)
  //          waybillCategory=MATERIAL|TOOL|EPI_UNIFORM (para romaneios)
  app.get('/items', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { q, category, type, lowStock, page = '1', limit = '50', locationId, waybillCategory } = request.query as any

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const take = parseInt(limit)

    const where: any = { companyId: cid, isActive: true }
    if (q)        where.name = { contains: q, mode: 'insensitive' }
    if (category) where.category = category
    if (type === 'epi')        where.isEpi = true
    if (type === 'uniform')    where.isUniform = true
    if (type === 'tool')       where.requiresCustody = true
    if (type === 'consumable') where.isConsumable = true

    // Filtros por categoria de romaneio (waybillCategory)
    if (waybillCategory === 'MATERIAL') {
      where.isEpi           = false
      where.isUniform       = false
      where.requiresCustody = false
    }
    if (waybillCategory === 'TOOL') {
      where.requiresCustody = true
      // Só mostrar ferramentas disponíveis no seletor de romaneio
      where.OR = [{ toolStatus: null }, { toolStatus: 'AVAILABLE' }]
    }
    if (waybillCategory === 'EPI_UNIFORM') where.OR = [{ isEpi: true }, { isUniform: true }]

    // ── Quando locationId é fornecido: mostrar itens com saldo no local ──────
    if (locationId) {
      // 1. Buscar TODOS os saldos do local (sem filtro de quantity)
      //    → inclui qty=0 para que itens com saldo zero apareçam como "indisponíveis"
      //    → inclui locais sem StockBalance (novo almoxarifado) para que a lista não fique vazia
      const balances = await p().stockBalance.findMany({
        where: { locationId, companyId: cid },
        select: { itemId: true, quantity: true, reservedQty: true },
      })

      // 2. Buscar itens da categoria (sem restrição de ID — usa filtros de where acima)
      const [items, total] = await Promise.all([
        p().stockItem.findMany({
          where,
          skip,
          take,
          orderBy: { name: 'asc' },
          select: {
            id: true, name: true, code: true, unit: true, category: true,
            brand: true, model: true, serialNumber: true,
            isEpi: true, isUniform: true, requiresCustody: true, isConsumable: true,
            averageCost: true, unitCost: true, minQuantity: true, imageUrl: true,
          },
        }),
        p().stockItem.count({ where }),
      ])

      // 3. Combinar: itens sem saldo recebem availableQty=0 (UI desabilita adição)
      const withBalance = items.map((item: any) => {
        const bal       = balances.find((b: any) => b.itemId === item.id)
        const qty       = Number(bal?.quantity    ?? 0)
        const reserved  = Number(bal?.reservedQty ?? 0)
        return {
          ...item,
          quantity:     qty,
          availableQty: Math.max(0, qty - reserved),
          currentStock: qty,
        }
      })

      return reply.send({ items: withBalance, total, page: parseInt(page), limit: take })
    }

    // ── Sem locationId: retorno padrão (inclui relações) ─────────────────────
    const isTool = type === 'tool' || where.requiresCustody === true

    const [items, total] = await Promise.all([
      p().stockItem.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
        include: {
          currentProject: { select: { id: true, name: true } },
          stockBalances: { select: { locationId: true, quantity: true } },
          supplierLots: {
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: { supplier: { select: { id: true, name: true } } },
          },
          _count: {
            select: { custodies: true, epiDeliveries: true, movements: true },
          },
          // FIX 5: include active custodies so we can compute toolStatus=IN_USE
          ...(isTool ? {
            custodies: {
              where: { returnedAt: null },
              take: 1,
              select: { id: true },
            },
          } : {}),
        },
      }),
      p().stockItem.count({ where }),
    ])

    // FIX 5: compute toolStatus dynamically; strip internal custodies from output
    let result: any[] = (items as any[]).map(item => {
      if (!isTool) return item
      const hasActiveCustody = (item.custodies?.length ?? 0) > 0
      let toolStatus = item.toolStatus ?? 'AVAILABLE'
      // If there's an active custody but toolStatus is still AVAILABLE, show IN_USE
      if (hasActiveCustody && toolStatus === 'AVAILABLE') toolStatus = 'IN_USE'
      const { custodies: _c, ...rest } = item
      return { ...rest, toolStatus, currentLocation: rest.currentLocation ?? 'Depósito' }
    })

    if (lowStock === 'true') {
      result = result.filter((i: any) =>
        Number(i.minQuantity) > 0 && Number(i.quantity) <= Number(i.minQuantity)
      )
    }

    return reply.send({ items: result, total, page: parseInt(page), limit: take })
  })

  // POST /api/v1/deposit/items
  app.post('/items', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)

    // Exige Depósito Central antes de cadastrar itens
    const central = await getCentral(cid)
    if (!central) {
      return reply.status(400).send({
        error:   'CENTRAL_REQUIRED',
        message: 'Crie o Depósito Central antes de cadastrar itens.',
      })
    }

    const body = itemCreateSchema.parse(request.body)

    // Extrair campos que não vão direto para StockItem
    const { initialQuantity = 0, lots, ...itemBody } = body

    // Calcular custo médio a partir dos lotes, se informados
    let avgCost = itemBody.averageCost ?? itemBody.unitCost ?? 0
    if (lots && lots.length > 0) {
      const totalQty = lots.reduce((s, l) => s + l.quantity, 0)
      const totalVal = lots.reduce((s, l) => s + l.quantity * (l.unitCost ?? 0), 0)
      if (totalQty > 0) avgCost = totalVal / totalQty
    }

    const data = buildItemData({ ...itemBody, averageCost: avgCost || undefined })
    const item = await p().stockItem.create({ data: { ...data, companyId: cid } })

    // Criar lotes de fornecedor, se informados
    if (lots && lots.length > 0) {
      await p().supplierLot.createMany({
        data: lots.map((l: any) => ({
          companyId:     cid,
          stockItemId:   item.id,
          supplierId:    l.supplierId   ?? null,
          lotNumber:     l.lotNumber    ?? null,
          invoiceNumber: l.invoiceNumber ?? null,
          purchaseDate:  l.purchaseDate ? new Date(l.purchaseDate) : null,
          quantity:      l.quantity,
          unitCost:      l.unitCost     ?? null,
          expiryDate:    l.expiryDate   ? new Date(l.expiryDate) : null,
          notes:         l.notes        ?? null,
        })),
      })
    }

    // FIX 4: ferramentas não-manuais têm quantidade 1 (identificação única por S/N)
    const isTool      = body.requiresCustody === true
    const isManual    = body.toolType === 'MANUAL'
    const effectiveQty = isTool && body.toolType && !isManual
      ? 1
      : Math.max(0, initialQuantity)

    // Criar movimento de entrada inicial, se estoque > 0
    if (effectiveQty > 0) {
      await p().stockMovement.create({
        data: {
          companyId:   cid,
          stockItemId: item.id,
          type:        'IN',
          quantity:    effectiveQty,
          unitCost:    avgCost > 0 ? avgCost : null,
          totalCost:   avgCost > 0 ? effectiveQty * avgCost : null,
          reason:      'Estoque inicial de cadastro',
        },
      })
      // Atualizar quantidade do item
      await p().stockItem.update({
        where: { id: item.id },
        data: {
          quantity:    effectiveQty,
          averageCost: avgCost > 0 ? avgCost : undefined,
        },
      })
      // FIX 6: criar StockBalance no Depósito Central
      await p().stockBalance.upsert({
        where:  { itemId_locationId: { itemId: item.id, locationId: central.id } },
        update: { quantity: effectiveQty, totalValue: effectiveQty * (avgCost > 0 ? avgCost : 0) },
        create: {
          companyId:   cid,
          itemId:      item.id,
          locationId:  central.id,
          quantity:    effectiveQty,
          averageCost: avgCost > 0 ? avgCost : 0,
          totalValue:  effectiveQty * (avgCost > 0 ? avgCost : 0),
        },
      })
    }

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

    // FIX 5: se toolType mudou para não-manual, forçar quantity=1
    const isTool   = exists.requiresCustody === true
    const newType  = body.toolType
    if (isTool && newType && newType !== 'MANUAL') {
      data.quantity = 1
      // Zerar saldos acima de 1
      await p().stockBalance.updateMany({
        where:  { itemId: id, companyId: cid, quantity: { gt: 1 } },
        data:   { quantity: 1 },
      })
    }

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

    // Exige Depósito Central
    const central = await getCentral(cid)
    if (!central) {
      return reply.status(400).send({
        error:   'CENTRAL_REQUIRED',
        message: 'Crie o Depósito Central antes de registrar movimentações.',
      })
    }

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

    // ── Custo automático: saída de material/EPI vinculada a obra ────────────
    if (body.projectId && ['OUT', 'EPI_DELIVERY'].includes(body.type) && totalCost > 0) {
      const costCategory = item.isEpi || item.isUniform ? 'EPI'
        : item.requiresCustody ? 'EQUIPMENT'
        : 'MATERIAL'
      await p().projectCostEntry.create({
        data: {
          companyId:         cid,
          projectId:         body.projectId,
          stockMovementId:   movement.id,
          description:       `Saída: ${item.name}`,
          category:          costCategory,
          quantity:          body.quantity,
          unitCost:          unitCost > 0 ? unitCost : currentAvg,
          totalCost,
          needsAppropriation: true,
          origin:            'DEPOSIT',
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
          photoUrl:      body.photoUrl ?? null,
        },
      }),
      p().stockItem.update({
        where: { id: body.stockItemId },
        data: {
          quantity:        Number(item.quantity) - body.quantity,
          currentLocation: 'PROJECT',
          toolStatus:      'IN_USE',
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

    // Validar que o item está marcado como EPI
    if (!(item as any).isEpi) {
      return reply.status(400).send({
        error:   'ITEM_NOT_EPI',
        message: `"${item.name}" não está cadastrado como EPI. Use a saída normal para materiais e ferramentas.`,
      })
    }

    // Validar colaborador
    const employee = await p().employee.findFirst({
      where: { id: body.employeeId, companyId: cid, isActive: true },
      select: { id: true, name: true, code: true, role: true },
    })
    if (!employee) {
      return reply.status(404).send({ error: 'Colaborador não encontrado ou inativo' })
    }

    // Validar saldo — por localização quando informada, senão global
    if (body.locationId) {
      const balance = await p().stockBalance.findUnique({
        where: { itemId_locationId: { itemId: body.stockItemId, locationId: body.locationId } },
      })
      const available = Math.max(0, Number(balance?.quantity ?? 0) - Number(balance?.reservedQty ?? 0))
      if (available < body.quantity) {
        return reply.status(400).send({
          error:   'INSUFFICIENT_STOCK',
          message: `Saldo insuficiente no almoxarifado. Disponível: ${available} ${item.unit}`,
        })
      }
    } else {
      if (Number(item.quantity) < body.quantity) {
        return reply.status(400).send({ error: 'Quantidade insuficiente em estoque' })
      }
    }

    // Salvar selfie com marca d'água de data/hora
    let selfieUrl: string | null = null
    if (body.selfie) {
      try {
        const sharp = require('sharp')
        const now = new Date()
        const ts  = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const raw = Buffer.from(
          body.selfie.replace(/^data:image\/\w+;base64,/, ''),
          'base64',
        )
        const dir = path.resolve(process.cwd(), 'uploads', 'epis', cid, body.employeeId)
        fs.mkdirSync(dir, { recursive: true })
        const fileName = `${ts}-selfie.jpg`
        const filePath = path.join(dir, fileName)
        await sharp(raw)
          .resize({ width: 800, withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toFile(filePath)
        selfieUrl = `/uploads/epis/${cid}/${body.employeeId}/${fileName}`
      } catch { /* selfie falhou mas não bloqueia entrega */ }
    }

    // Salvar assinatura como PNG no disco
    let resolvedSignatureUrl: string | null = body.signatureUrl ?? null
    if (body.signature) {
      try {
        const now = new Date()
        const ts  = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const raw = Buffer.from(
          body.signature.replace(/^data:image\/\w+;base64,/, ''),
          'base64',
        )
        const dir = path.resolve(process.cwd(), 'uploads', 'epis', cid, body.employeeId)
        fs.mkdirSync(dir, { recursive: true })
        const fileName = `${ts}-assinatura.png`
        const filePath = path.join(dir, fileName)
        fs.writeFileSync(filePath, raw)
        resolvedSignatureUrl = `/uploads/epis/${cid}/${body.employeeId}/${fileName}`
      } catch { /* assinatura falhou mas não bloqueia entrega */ }
    }

    // Operações da transação — sempre cria delivery + movimento + decrementa saldo
    const txOps: any[] = [
      // 1. Registro de entrega
      p().stockEpiDelivery.create({
        data: {
          companyId:     cid,
          stockItemId:   body.stockItemId,
          employeeId:    body.employeeId,
          projectId:     body.projectId     ?? null,
          locationId:    body.locationId    ?? null,
          responsibleId: userId(request)    ?? null,
          quantity:      body.quantity,
          size:          body.size          ?? null,
          expiresAt:     body.expiresAt     ? new Date(body.expiresAt) : null,
          condition:     body.condition     ?? null,
          notes:         body.notes         ?? null,
          caNumber:      body.caNumber      ?? null,
          signatureUrl:  resolvedSignatureUrl,
          selfieUrl,
          selfieDate:    body.selfie ? new Date() : null,
        },
        include: {
          stockItem: { select: { id: true, name: true, unit: true } },
          employee:  { select: { id: true, name: true, code: true } },
          location:  { select: { id: true, name: true } },
        },
      }),
      // 2. Decremento global no item
      p().stockItem.update({
        where: { id: body.stockItemId },
        data: { quantity: { decrement: body.quantity } },
      }),
      // 3. Movimento de saída
      p().stockMovement.create({
        data: {
          companyId:     cid,
          stockItemId:   body.stockItemId,
          projectId:     body.projectId  ?? null,
          locationId:    body.locationId ?? null,
          employeeId:    body.employeeId,
          responsibleId: userId(request) ?? null,
          type:          'EPI_DELIVERY',
          quantity:      body.quantity,
          reason:        `EPI entregue para ${employee.name} (${employee.code})`,
          notes:         body.notes ?? null,
        },
      }),
    ]

    // 4. Decremento no saldo do almoxarifado específico (quando locationId informado)
    if (body.locationId) {
      txOps.push(
        p().stockBalance.updateMany({
          where: { itemId: body.stockItemId, locationId: body.locationId, companyId: cid },
          data:  { quantity: { decrement: body.quantity } },
        }),
      )
    }

    const [delivery] = await p().$transaction(txOps)

    return reply.status(201).send({
      success:          true,
      delivery,
      employeeId:       employee.id,
      employeeName:     employee.name,
      itemName:         item.name,
      addedToEmployee:  true,
      message:          `EPI "${item.name}" registrado para ${employee.name}`,
      cautelaUrl:       `/api/v1/deposit/employees/${employee.id}/epi-cautela`,
    })
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
          // Incluir movimentos para rascunhos (para "Continuar rascunho")
          movements: status === 'DRAFT' ? {
            include: { stockItem: { select: { id: true, name: true, unit: true } } },
          } : false,
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

    // Exige Depósito Central
    const central = await getCentral(cid)
    if (!central) {
      return reply.status(400).send({
        error:   'CENTRAL_REQUIRED',
        message: 'Crie o Depósito Central antes de registrar saídas de material.',
      })
    }

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

    // ── Custo automático: itens OUT do romaneio vinculados a obra ─────────────
    if (body.projectId && movementType === 'OUT') {
      for (const entry of body.items) {
        const itemData = await p().stockItem.findFirst({
          where:  { id: entry.stockItemId, companyId: cid },
          select: { name: true, isEpi: true, isUniform: true, requiresCustody: true, averageCost: true, unitCost: true },
        })
        if (!itemData) continue
        const currentAvg = Number(itemData.averageCost ?? itemData.unitCost ?? 0)
        const unit       = entry.unitCost ?? currentAvg
        const total      = entry.quantity * (unit > 0 ? unit : currentAvg)
        if (total <= 0) continue
        const costCategory = itemData.isEpi || itemData.isUniform ? 'EPI'
          : itemData.requiresCustody ? 'EQUIPMENT'
          : 'MATERIAL'
        await p().projectCostEntry.create({
          data: {
            companyId:         cid,
            projectId:         body.projectId,
            description:       `Romaneio: ${itemData.name}`,
            category:          costCategory,
            quantity:          entry.quantity,
            unitCost:          unit > 0 ? unit : currentAvg,
            totalCost:         total,
            needsAppropriation: true,
            origin:            'DEPOSIT',
          },
        })
      }
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

  // PATCH /api/v1/deposit/baskets/:id/logistics — salvar dados de transporte
  app.patch('/baskets/:id/logistics', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const basket = await p().stockBasket.findFirst({ where: { id, companyId: cid } })
    if (!basket) return reply.status(404).send({ error: 'Romaneio não encontrado' })

    const body = z.object({
      driverName:       z.string().optional().nullable(),
      driverDocument:   z.string().optional().nullable(),
      driverPhone:      z.string().optional().nullable(),
      vehiclePlate:     z.string().optional().nullable(),
      vehicleModel:     z.string().optional().nullable(),
      carrierName:      z.string().optional().nullable(),
      carrierDocument:  z.string().optional().nullable(),
      carrierPhone:     z.string().optional().nullable(),
      trackingCode:     z.string().optional().nullable(),
      deliveryType:     z.enum(['PICKUP','DELIVERY','TRANSFER','RETURN']).optional().nullable(),
      estimatedArrival: z.string().optional().nullable(),
      confirmedArrival: z.string().optional().nullable(),
    }).parse(request.body)

    const data: any = {}
    Object.entries(body).forEach(([k, v]) => {
      if (v !== undefined) {
        if ((k === 'estimatedArrival' || k === 'confirmedArrival') && v) data[k] = new Date(v as string)
        else data[k] = v
      }
    })

    const updated = await p().stockBasket.update({ where: { id }, data })
    return reply.send({ basket: updated })
  })

  // GET /api/v1/deposit/baskets/:id/pdf — gera PDF profissional do romaneio
  app.get('/baskets/:id/pdf', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const basket = await p().stockBasket.findFirst({
      where: { id, companyId: cid },
      include: {
        company:     { select: { name: true, cnpj: true, logo: true, address: true, city: true, state: true } },
        project:     { select: { id: true, name: true, address: true, city: true, state: true } },
        employee:    { select: { id: true, name: true, role: true, cpf: true } },
        responsible: { select: { id: true, name: true } },
        movements: {
          include: {
            stockItem: { select: { id: true, code: true, name: true, unit: true } },
          },
        },
      },
    })

    if (!basket) return reply.status(404).send({ error: 'Romaneio não encontrado' })

    const fmtDate = (d: Date | string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
    const fmtDateTime = (d: Date | string | null) => d ? new Date(d).toLocaleString('pt-BR') : '—'
    const fmtCur = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const masked = (s: string | null | undefined) => s ? s.replace(/(\d{3})\d{3}(\d{3})/, '$1.***.$3') : '—'

    const typeLabel: Record<string, string> = {
      OUT: 'SAÍDA', EPI: 'EPI/UNIFORME', RETURN: 'DEVOLUÇÃO',
      PICKUP: 'RETIRADA', DELIVERY: 'ENTREGA', TRANSFER: 'TRANSFERÊNCIA',
    }
    const docTitle = typeLabel[basket.type] ?? 'ROMANEIO'
    const delivTypeLabel = basket.deliveryType ? (typeLabel[basket.deliveryType] ?? basket.deliveryType) : null

    const items = (basket.movements ?? []).map((m: any, i: number) => {
      const qty       = Number(m.quantity ?? 0)
      const unitCost  = Number(m.unitCost ?? 0)
      const totalCost = Number(m.totalCost ?? qty * unitCost)
      return { ...m, num: i + 1, qty, unitCost, totalCost }
    })

    const grandTotal = items.reduce((a: number, m: any) => a + m.totalCost, 0)

    const logisticsBlock = (basket.driverName || basket.vehiclePlate || basket.carrierName || basket.trackingCode)
      ? `<div class="section" style="margin-bottom:12px">
          <div class="section-title">INFORMAÇÕES DE TRANSPORTE</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            ${basket.deliveryType ? `<div><span class="lbl">Tipo:</span> ${delivTypeLabel}</div>` : ''}
            ${basket.driverName ? `<div><span class="lbl">Motorista:</span> ${basket.driverName}</div>` : ''}
            ${basket.driverDocument ? `<div><span class="lbl">CPF Motorista:</span> ${masked(basket.driverDocument)}</div>` : ''}
            ${basket.driverPhone ? `<div><span class="lbl">Telefone:</span> ${basket.driverPhone}</div>` : ''}
            ${basket.vehiclePlate ? `<div><span class="lbl">Placa:</span> ${basket.vehiclePlate}${basket.vehicleModel ? ` — ${basket.vehicleModel}` : ''}</div>` : ''}
            ${basket.carrierName ? `<div><span class="lbl">Transportadora:</span> ${basket.carrierName}</div>` : ''}
            ${basket.carrierDocument ? `<div><span class="lbl">CNPJ Transp.:</span> ${basket.carrierDocument}</div>` : ''}
            ${basket.trackingCode ? `<div><span class="lbl">Rastreamento:</span> ${basket.trackingCode}</div>` : ''}
            ${basket.estimatedArrival ? `<div><span class="lbl">Prev. chegada:</span> ${fmtDateTime(basket.estimatedArrival)}</div>` : ''}
            ${basket.confirmedArrival ? `<div><span class="lbl">Chegada confirma:</span> ${fmtDateTime(basket.confirmedArrival)}</div>` : ''}
          </div>
        </div>`
      : ''

    const signatureBlock = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:20px">
      ${[
        { label: 'EXPEDIDOR', name: basket.responsible?.name ?? '—', role: 'Almoxarife', sig: basket.senderSignatureUrl, date: basket.signedAt },
        { label: 'MOTORISTA', name: basket.driverName ?? '—', role: basket.driverDocument ? `CPF: ${masked(basket.driverDocument)}` : '', sig: null, date: null },
        { label: 'RECEBEDOR', name: basket.employee?.name ?? basket.destinatary ?? '—', role: basket.employee?.role ?? '', sig: basket.receiverSignatureUrl, date: basket.signedAt },
      ].map(s => `
        <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:9px;font-weight:700;color:#6b7280;letter-spacing:.08em;margin-bottom:8px">${s.label}</div>
          ${s.sig ? `<img src="${process.cwd()}/uploads/${s.sig.replace('/uploads/','')}" style="height:50px;margin:0 auto 8px;display:block" onerror="this.style.display='none'" />` : '<div style="height:50px;border-bottom:1px solid #374151;margin-bottom:8px"></div>'}
          <div style="font-size:10px;font-weight:600">${s.name}</div>
          ${s.role ? `<div style="font-size:9px;color:#6b7280">${s.role}</div>` : ''}
          ${s.date ? `<div style="font-size:8px;color:#9ca3af;margin-top:2px">${fmtDateTime(s.date)}</div>` : ''}
        </div>
      `).join('')}
    </div>`

    const _basketHeader = getPdfHeader({
      title:     `ROMANEIO DE ${docTitle}`,
      docNumber: basket.docNumber,
      company:   { name: basket.company?.name ?? '', document: basket.company?.cnpj ?? null, logo: basket.company?.logo ?? null },
      date:      fmtDateTime(basket.createdAt),
    })
    const _basketFooter = getPdfFooter(basket.company?.name ?? '')

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
${PDF_BASE_STYLES}
/* ── Overrides romaneio de depósito ── */
.grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.origin-box { border:1px solid #e5e7eb; border-radius:8px; padding:12px; }
.origin-label { font-size:8px; font-weight:700; color:#6b7280; letter-spacing:.1em; text-transform:uppercase; margin-bottom:6px; }
.origin-name { font-size:13px; font-weight:700; color:#111827; }
.origin-detail { font-size:10px; color:#6b7280; margin-top:2px; }
.lbl { font-weight:600; color:#374151; }
.total-row td { font-weight:700; background:#fff3dc !important; border-top:2px solid #F5A623; }
.notes-box { background:#f9fafb; border:1px dashed #d1d5db; border-radius:6px; padding:10px 12px; min-height:40px; margin-top:4px; font-size:10px; color:#374151; }
</style>
</head>
<body>
${_basketHeader}

<div class="doc-body">
  <!-- Origem e Destino -->
  <div class="section">
    <div class="section-title">Origem e Destino</div>
    <div class="grid-2">
      <div class="origin-box">
        <div class="origin-label">Depósito / Origem</div>
        <div class="origin-name">${basket.company?.name ?? 'Empresa'}</div>
        ${basket.company?.address ? `<div class="origin-detail">${basket.company.address}${basket.company?.city ? `, ${basket.company.city}/${basket.company.state}` : ''}</div>` : ''}
        ${basket.responsible?.name ? `<div class="origin-detail">Resp.: ${basket.responsible.name}</div>` : ''}
      </div>
      <div class="origin-box">
        <div class="origin-label">Destino</div>
        <div class="origin-name">${basket.project?.name ?? basket.destinatary ?? '—'}</div>
        ${basket.project?.address ? `<div class="origin-detail">${basket.project.address}${basket.project?.city ? `, ${basket.project.city}` : ''}</div>` : ''}
        ${basket.employee?.name ? `<div class="origin-detail">Recebedor: ${basket.employee.name}</div>` : ''}
      </div>
    </div>
  </div>

  <!-- Transporte (se preenchido) -->
  ${logisticsBlock}

  <!-- Tabela de itens -->
  <div class="section">
    <div class="section-title">Itens do Romaneio</div>
    <table>
      <thead>
        <tr>
          <th style="width:30px">Nº</th>
          <th style="width:80px">Código</th>
          <th>Descrição</th>
          <th style="width:40px;text-align:center">Unid.</th>
          <th style="width:60px;text-align:right">Qtd</th>
          <th style="width:80px;text-align:right">Vl. Unit.</th>
          <th style="width:80px;text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((m: any) => `
          <tr>
            <td>${m.num}</td>
            <td>${m.stockItem?.code ?? '—'}</td>
            <td>${m.stockItem?.name ?? m.reason ?? '—'}</td>
            <td style="text-align:center">${m.stockItem?.unit ?? 'un'}</td>
            <td style="text-align:right">${m.qty}</td>
            <td style="text-align:right">${m.unitCost > 0 ? fmtCur(m.unitCost) : '—'}</td>
            <td style="text-align:right">${m.totalCost > 0 ? fmtCur(m.totalCost) : '—'}</td>
          </tr>
        `).join('')}
        ${grandTotal > 0 ? `
          <tr class="total-row">
            <td colspan="6" style="text-align:right">TOTAL</td>
            <td style="text-align:right">${fmtCur(grandTotal)}</td>
          </tr>
        ` : ''}
      </tbody>
    </table>
  </div>

  <!-- Observações -->
  ${basket.notes ? `
  <div class="section">
    <div class="section-title">Observações</div>
    <div class="notes-box">${basket.notes}</div>
  </div>` : ''}

  <!-- Assinaturas -->
  <div class="section">
    <div class="section-title">Assinaturas</div>
    ${signatureBlock}
  </div>
</div>

${_basketFooter}
</body></html>`

    try {
      const puppeteer = require('puppeteer')
      const browser   = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
      try {
        const page = await browser.newPage()
        await page.setContent(html, { waitUntil: 'load' })
        const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
        reply.header('Content-Type', 'application/pdf')
        reply.header('Content-Disposition', `inline; filename="romaneio-${basket.docNumber}.pdf"`)
        return reply.send(Buffer.from(pdf))
      } finally { await browser.close() }
    } catch {
      reply.header('Content-Type', 'text/html; charset=utf-8')
      return reply.send(html)
    }
  })

  // ── SUMMARY DETALHADO ────────────────────────────────────────────────────
  // GET /api/v1/deposit/summary/full — métricas completas para o header
  app.get('/summary/full', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    const next30Days = new Date(now)
    next30Days.setDate(next30Days.getDate() + 30)

    const [items, movements, custodies, maintenances, upcomingMaintenances, balanceAgg] = await Promise.all([
      p().stockItem.findMany({
        where: { companyId: cid, isActive: true },
        select: { quantity: true, minQuantity: true, averageCost: true, unitCost: true, requiresCustody: true, nextMaintenance: true, isUnderWarranty: true, isEpi: true, isUniform: true, isConsumable: true, toolStatus: true },
      }),
      p().stockMovement.findMany({
        where: { companyId: cid, createdAt: { gte: startOfMonth, lte: endOfMonth } },
        select: { type: true, quantity: true, totalCost: true },
      }),
      p().toolCustody.count({ where: { companyId: cid, returnedAt: null, dueDate: { lt: now } } }),
      p().toolMaintenanceRecord.count({
        where: {
          companyId: cid,
          nextDate: { lt: now },
          tool: { isActive: true, toolStatus: { notIn: ['DISCARDED', 'LOST', 'PENDING_DELETE'] } },
        },
      }),
      p().toolMaintenanceRecord.count({
        where: {
          companyId: cid,
          nextDate: { gte: now, lte: next30Days },
          tool: { isActive: true, toolStatus: { notIn: ['DISCARDED', 'LOST', 'PENDING_DELETE'] } },
        },
      }),
      // FIX 8: aggregate total value from StockBalance (per-location pre-calculated)
      p().stockBalance.aggregate({
        where: { companyId: cid },
        _sum: { totalValue: true },
      }),
    ])

    const totalItems       = items.length
    // FIX 6+8: use StockBalance aggregate; exclude DISCARDED tools from value
    const activeItems = (items as any[]).filter(i => i.toolStatus !== 'DISCARDED')
    const totalValue  = Number(balanceAgg._sum?.totalValue ?? 0) ||
      activeItems.reduce((a: number, i: any) => a + Number(i.quantity) * Number(i.averageCost ?? i.unitCost ?? 0), 0)
    const lowStockCount      = items.filter((i: any) => Number(i.minQuantity) > 0 && Number(i.quantity) <= Number(i.minQuantity)).length
    // FIX 5: count tools actually in MAINTENANCE status (not hardcoded 0)
    const inMaintenanceCount = items.filter((i: any) => i.toolStatus === 'MAINTENANCE').length
    const exitsThisMonth   = movements.filter((m: any) => ['OUT','EPI_DELIVERY','LOSS'].includes(m.type)).length
    const entriesThisMonth = movements.filter((m: any) => m.type === 'IN').length
    const overdueReturns      = custodies
    const overdueMaint        = maintenances
    const upcomingMaint       = upcomingMaintenances

    // Valor por categoria — usa || para não travar em averageCost=0
    const itemValue = (i: any) => Number(i.quantity) * Number(i.unitCost || i.averageCost || 0)
    const categorize = (i: any): 'epis' | 'uniformes' | 'ferramentas' | 'materiais' | 'outros' => {
      if (i.isEpi)    return 'epis'
      if (i.isUniform) return 'uniformes'
      if (i.requiresCustody && !i.isConsumable) return 'ferramentas'
      if (i.isConsumable) return 'materiais'
      return 'outros'
    }
    // FIX 6: exclude DISCARDED from category breakdown
    const porCategoria = activeItems.reduce(
      (acc: Record<string, number>, i: any) => { const cat = categorize(i); acc[cat] = (acc[cat] ?? 0) + itemValue(i); return acc },
      { materiais: 0, ferramentas: 0, epis: 0, uniformes: 0, outros: 0 },
    )

    return reply.send({
      totalItems,
      totalValue,
      lowStockCount,
      inMaintenanceCount,
      exitsThisMonth,
      entriesThisMonth,
      overdueReturns,
      overdueMaintenance:  overdueMaint,
      upcomingMaintenance: upcomingMaint,
      estoque: {
        totalGeral: totalValue,
        porCategoria,
      },
    })
  })

  // ── ITEM MOVEMENTS (paginado) ────────────────────────────────────────────
  // GET /api/v1/deposit/items/:id/movements
  app.get('/items/:id/movements', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }
    const { type, startDate, endDate, page = '1', limit = '20' } = request.query as any

    const item = await p().stockItem.findFirst({ where: { id, companyId: cid } })
    if (!item) return reply.status(404).send({ error: 'Item não encontrado' })

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const where: any = { stockItemId: id, companyId: cid }
    if (type === 'ENTRY') where.type = 'IN'
    if (type === 'EXIT')  where.type = { in: ['OUT', 'EPI_DELIVERY', 'LOSS'] }
    if (startDate) where.createdAt = { ...where.createdAt, gte: new Date(startDate) }
    if (endDate)   where.createdAt = { ...where.createdAt, lte: new Date(endDate + 'T23:59:59') }

    const [movements, total] = await Promise.all([
      p().stockMovement.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          project:  { select: { id: true, name: true } },
          employee: { select: { id: true, name: true } },
          responsible: { select: { id: true, name: true } },
          basket: { select: { id: true, docNumber: true, status: true, senderSignatureUrl: true, receiverSignatureUrl: true } },
        },
      }),
      p().stockMovement.count({ where }),
    ])

    const totalQtyIn  = movements.filter((m: any) => m.type === 'IN').reduce((a: number, m: any) => a + Number(m.quantity), 0)
    const totalQtyOut = movements.filter((m: any) => ['OUT','EPI_DELIVERY','LOSS'].includes(m.type)).reduce((a: number, m: any) => a + Number(m.quantity), 0)

    return reply.send({
      movements: movements.map((m: any) => ({ ...m, quantity: Number(m.quantity), totalCost: Number(m.totalCost ?? 0), unitCost: Number(m.unitCost ?? 0) })),
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totals: { in: totalQtyIn, out: totalQtyOut },
    })
  })

  // ── ITEM BASKETS ─────────────────────────────────────────────────────────
  // GET /api/v1/deposit/items/:id/baskets
  app.get('/items/:id/baskets', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const item = await p().stockItem.findFirst({ where: { id, companyId: cid } })
    if (!item) return reply.status(404).send({ error: 'Item não encontrado' })

    // Buscar movimentos vinculados a baskets
    const movements = await p().stockMovement.findMany({
      where: { stockItemId: id, companyId: cid, basketId: { not: null } },
      orderBy: { createdAt: 'desc' },
      include: {
        basket: {
          include: {
            project:  { select: { id: true, name: true } },
            employee: { select: { id: true, name: true } },
          },
        },
      },
    })

    // Agrupar por basket
    const basketMap = new Map<string, any>()
    for (const m of movements) {
      if (!m.basket) continue
      const bk = basketMap.get(m.basket.id) ?? { ...m.basket, itemMovements: [] }
      bk.itemMovements.push({ type: m.type, quantity: Number(m.quantity), unitCost: Number(m.unitCost ?? 0) })
      basketMap.set(m.basket.id, bk)
    }

    return reply.send({ baskets: Array.from(basketMap.values()) })
  })

  // ── TOOL CUSTODIES ────────────────────────────────────────────────────────
  // GET /api/v1/deposit/tools/:id/custodies
  app.get('/tools/:id/custodies', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const item = await p().stockItem.findFirst({ where: { id, companyId: cid } })
    if (!item) return reply.status(404).send({ error: 'Ferramenta não encontrada' })

    // FIX 7: query custodies + waybill exits in parallel
    const [custodies, waybillItems] = await Promise.all([
      p().toolCustody.findMany({
        where: { stockItemId: id, companyId: cid },
        orderBy: { checkedOutAt: 'desc' },
        include: {
          employee:    { select: { id: true, name: true, role: true, photo: true } },
          project:     { select: { id: true, name: true } },
          responsible: { select: { id: true, name: true } },
        },
      }),
      p().waybillItem.findMany({
        where: { itemId: id },
        orderBy: { createdAt: 'desc' },
        include: {
          waybill: {
            select: {
              id: true,
              docNumber: true,
              destinationName: true,
              receiverName: true,
              destinationProject: { select: { id: true, name: true } },
              receiverEmployee:   { select: { id: true, name: true } },
              createdAt: true,
            },
          },
        },
      }),
    ])

    const waybillExits = waybillItems.map((wi: any) => ({
      id:              wi.id,
      waybillId:       wi.waybill.id,
      waybillDoc:      wi.waybill.docNumber,
      requestedQty:    Number(wi.requestedQty),
      serialNumber:    wi.serialNumber    ?? null,
      toolCondition:   wi.toolCondition   ?? null,
      destinationName: wi.waybill.destinationProject?.name ?? wi.waybill.destinationName ?? null,
      receiverName:    wi.waybill.receiverEmployee?.name   ?? wi.waybill.receiverName     ?? null,
      createdAt:       wi.waybill.createdAt,
    }))

    return reply.send({ custodies, waybillExits })
  })

  // ── TOOL MAINTENANCES ─────────────────────────────────────────────────────
  // GET /api/v1/deposit/tools/:id/maintenances
  app.get('/tools/:id/maintenances', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const item = await p().stockItem.findFirst({ where: { id, companyId: cid } })
    if (!item) return reply.status(404).send({ error: 'Ferramenta não encontrada' })

    const records = await p().toolMaintenanceRecord.findMany({
      where: { stockItemId: id, companyId: cid },
      orderBy: { date: 'desc' },
    })

    return reply.send({ maintenances: records.map((r: any) => ({ ...r, cost: Number(r.cost ?? 0) })) })
  })

  // POST /api/v1/deposit/tools/:id/maintenances
  app.post('/tools/:id/maintenances', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const item = await p().stockItem.findFirst({ where: { id, companyId: cid } })
    if (!item) return reply.status(404).send({ error: 'Ferramenta não encontrada' })

    const body = z.object({
      type:        z.enum(['PREVENTIVE','CORRECTIVE','INSPECTION']).default('PREVENTIVE'),
      date:        z.string(),
      performedBy: z.string().optional(),
      description: z.string().min(1),
      cost:        z.number().optional(),
      nextDate:    z.string().optional(),
      result:      z.enum(['OK','NEEDS_PARTS','WAITING_QUOTE']).optional(),
      fileUrl:     z.string().optional(),
      notes:       z.string().optional(),
    }).parse(request.body)

    const record = await p().toolMaintenanceRecord.create({
      data: {
        companyId:   cid,
        stockItemId: id,
        type:        body.type,
        date:        new Date(body.date),
        performedBy: body.performedBy ?? null,
        description: body.description,
        cost:        body.cost ?? null,
        nextDate:    body.nextDate ? new Date(body.nextDate) : null,
        result:      body.result ?? null,
        fileUrl:     body.fileUrl ?? null,
        notes:       body.notes ?? null,
      },
    })

    // Atualizar nextMaintenance no item
    if (body.nextDate) {
      await p().stockItem.update({
        where: { id },
        data: {
          lastMaintenance: new Date(body.date),
          nextMaintenance: new Date(body.nextDate),
        },
      })
    }

    return reply.status(201).send({ maintenance: record })
  })

  // PATCH /api/v1/deposit/tools/:id/maintenances/:maintenanceId
  app.patch('/tools/:id/maintenances/:maintenanceId', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id, maintenanceId } = request.params as { id: string; maintenanceId: string }

    const record = await p().toolMaintenanceRecord.findFirst({
      where: { id: maintenanceId, stockItemId: id, companyId: cid },
    })
    if (!record) return reply.status(404).send({ error: 'Registro não encontrado' })

    const body = z.object({
      type:        z.enum(['PREVENTIVE','CORRECTIVE','INSPECTION']).optional(),
      date:        z.string().optional(),
      performedBy: z.string().optional().nullable(),
      description: z.string().optional(),
      cost:        z.number().optional().nullable(),
      nextDate:    z.string().optional().nullable(),
      result:      z.enum(['OK','NEEDS_PARTS','WAITING_QUOTE']).optional().nullable(),
      fileUrl:     z.string().optional().nullable(),
      notes:       z.string().optional().nullable(),
    }).parse(request.body)

    const data: any = { ...body }
    if (body.date)     data.date     = new Date(body.date)
    if (body.nextDate) data.nextDate = new Date(body.nextDate)
    else if (body.nextDate === null) data.nextDate = null

    const updated = await p().toolMaintenanceRecord.update({ where: { id: maintenanceId }, data })
    return reply.send({ maintenance: updated })
  })

  // ── TOOL RETURN (rich) ───────────────────────────────────────────────────
  // PATCH /api/v1/deposit/tools/:id/return
  app.patch('/tools/:id/return', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const body = z.object({
      custodyId:          z.string().optional(),
      condition:          z.enum(['BOM', 'DANIFICADO', 'PERDIDO']).default('BOM'),
      returnedBy:         z.string().optional(),
      returnNotes:        z.string().optional(),
      photoOnReturnUrl:   z.string().optional(),
      returnSignatureUrl: z.string().optional(),
      returnQuantity:     z.number().optional(),
    }).parse(request.body)

    const item = await p().stockItem.findFirst({
      where: { id, companyId: cid, isActive: true, requiresCustody: true },
    })
    if (!item) return reply.status(404).send({ error: 'Ferramenta não encontrada' })

    // Salvar arquivos base64 em disco
    const uploadsRoot = process.env.UPLOADS_PATH ?? path.join(process.cwd(), 'uploads')
    let photoUrl = body.photoOnReturnUrl
    let sigUrl   = body.returnSignatureUrl

    if (photoUrl?.startsWith('data:image')) {
      const buf  = Buffer.from(photoUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64')
      const dir  = path.join(uploadsRoot, 'tools', cid)
      fs.mkdirSync(dir, { recursive: true })
      const file = `${Date.now()}-return-photo.jpg`
      fs.writeFileSync(path.join(dir, file), buf)
      photoUrl = `/uploads/tools/${cid}/${file}`
    }

    if (sigUrl?.startsWith('data:image')) {
      const buf  = Buffer.from(sigUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64')
      const dir  = path.join(uploadsRoot, 'tools', cid)
      fs.mkdirSync(dir, { recursive: true })
      const file = `${Date.now()}-return-sig.png`
      fs.writeFileSync(path.join(dir, file), buf)
      sigUrl = `/uploads/tools/${cid}/${file}`
    }

    const now = new Date()

    // Buscar custódia ativa
    const custWhere: any = { stockItemId: id, companyId: cid, returnedAt: null }
    if (body.custodyId) custWhere.id = body.custodyId
    const custody = await p().toolCustody.findFirst({ where: custWhere })

    // FIX 3: DANIFICADO → DAMAGED (volta ao depósito mas danificada)
    // MAINTENANCE só é definido quando o almoxarife envia manualmente via send-maintenance
    const newToolStatus = body.condition === 'DANIFICADO' ? 'DAMAGED'
                        : body.condition === 'PERDIDO'    ? 'LOST'
                        : 'AVAILABLE'
    const newLocation   = newToolStatus === 'AVAILABLE'   ? 'Depósito'
                        : newToolStatus === 'DAMAGED'      ? 'Depósito'   // voltou mas está danificada
                        : 'Extraviada'

    // FIX 2: determinar qty devolvida e restaurar StockBalance no Depósito Central
    const returnQty   = custody ? Number(custody.quantity) : (body.returnQuantity ?? 1)
    const isReturning = newToolStatus !== 'LOST'  // LOST não retorna fisicamente

    let stockBalanceOp: any = null
    if (isReturning) {
      const central = await p().stockLocation.findFirst({
        where: { companyId: cid, type: 'CENTRAL', isActive: true },
      })
      if (central) {
        const bal = await p().stockBalance.findFirst({
          where: { itemId: id, locationId: central.id },
        })
        if (bal) {
          stockBalanceOp = p().stockBalance.update({
            where: { id: bal.id },
            data: {
              quantity:   { increment: returnQty },
              totalValue: { increment: returnQty * Number(bal.averageCost ?? 0) },
            },
          })
        } else {
          stockBalanceOp = p().stockBalance.create({
            data: {
              companyId:   cid,
              itemId:      id,
              locationId:  central.id,
              quantity:    returnQty,
              averageCost: Number(item.averageCost ?? item.unitCost ?? 0),
              totalValue:  returnQty * Number(item.averageCost ?? item.unitCost ?? 0),
            },
          })
        }
      }
    }

    const ops: any[] = []

    if (custody) {
      ops.push(p().toolCustody.update({
        where: { id: custody.id },
        data: {
          returnedAt:         now,
          conditionOnReturn:  body.condition,
          photoOnReturnUrl:   photoUrl  ?? null,
          returnSignatureUrl: sigUrl    ?? null,
          returnedBy:         body.returnedBy  ?? null,
          returnNotes:        body.returnNotes ?? null,
        },
      }))
    }

    ops.push(p().stockItem.update({
      where: { id },
      data: {
        currentLocation:  newLocation,
        currentProjectId: null,
        toolStatus:       newToolStatus,
        // FIX 2: restaurar quantity sempre que a ferramenta volta fisicamente
        ...(isReturning ? { quantity: { increment: returnQty } } : {}),
      },
    }))

    // FIX 2: restaurar StockBalance no Depósito Central
    if (stockBalanceOp) ops.push(stockBalanceOp)

    if (custody) {
      ops.push(p().stockMovement.create({
        data: {
          companyId:     cid,
          stockItemId:   id,
          projectId:     custody.projectId ?? null,
          employeeId:    custody.employeeId,
          responsibleId: userId(request) ?? null,
          type:          'RETURN',
          quantity:      returnQty,
          reason:        `Devolução: ${body.condition}`,
          notes:         body.returnNotes ?? null,
        },
      }))
    }

    await p().$transaction(ops)

    // Alerta de manutenção se danificada
    let maintenanceAlert = false
    if (body.condition === 'DANIFICADO') {
      await p().toolMaintenanceRecord.create({
        data: {
          companyId:   cid,
          stockItemId: id,
          type:        'CORRECTIVE',
          date:        now,
          description: `Devolvida com dano. ${body.returnNotes ?? ''}`.trim(),
          result:      'NEEDS_PARTS',
          performedBy: body.returnedBy ?? 'Não informado',
          cost:        null,
          notes:       body.returnNotes ?? null,
        },
      })
      maintenanceAlert = true
    }

    return reply.send({ success: true, toolStatus: newToolStatus, maintenanceAlert })
  })

  // ── TOOL SEND TO MAINTENANCE ──────────────────────────────────────────────
  // PATCH /api/v1/deposit/tools/:id/send-maintenance
  app.patch('/tools/:id/send-maintenance', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const body = z.object({
      maintenanceId: z.string().optional(),
      performedBy:   z.string().optional(),
      description:   z.string().optional(),
    }).parse(request.body ?? {})

    const item = await p().stockItem.findFirst({
      where: { id, companyId: cid, isActive: true },
    })
    if (!item) return reply.status(404).send({ error: 'Ferramenta não encontrada' })

    await p().stockItem.update({
      where: { id },
      data: { currentLocation: 'Em manutenção', toolStatus: 'MAINTENANCE' },
    })

    if (body.maintenanceId) {
      await p().toolMaintenanceRecord.update({
        where: { id: body.maintenanceId },
        data: {
          ...(body.performedBy ? { performedBy: body.performedBy } : {}),
          ...(body.description ? { description: body.description } : {}),
        },
      })
    }

    return reply.send({ success: true })
  })

  // ── TOOL RETURN FROM MAINTENANCE ─────────────────────────────────────────
  // PATCH /api/v1/deposit/tools/:id/return-from-maintenance
  app.patch('/tools/:id/return-from-maintenance', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const body = z.object({
      notes:               z.string().optional(),
      nextMaintenanceDate: z.string().optional(),
    }).parse(request.body ?? {})

    const item = await p().stockItem.findFirst({ where: { id, companyId: cid, isActive: true } })
    if (!item) return reply.status(404).send({ error: 'Ferramenta não encontrada' })

    const now      = new Date()
    const nextDate = body.nextMaintenanceDate ? new Date(body.nextMaintenanceDate) : null

    // Update most recent maintenance record to OK
    const lastMaint = await p().toolMaintenanceRecord.findFirst({
      where: { stockItemId: id, companyId: cid },
      orderBy: { createdAt: 'desc' },
    })

    // FIX 3: restaurar StockBalance e quantity ao retornar da manutenção
    const central = await p().stockLocation.findFirst({
      where: { companyId: cid, type: 'CENTRAL', isActive: true },
    })
    let maintBalanceOp: any = null
    if (central) {
      const bal = await p().stockBalance.findFirst({
        where: { itemId: id, locationId: central.id },
      })
      if (bal) {
        maintBalanceOp = p().stockBalance.update({
          where: { id: bal.id },
          data: {
            quantity:   { increment: 1 },
            totalValue: { increment: Number(bal.averageCost ?? 0) },
          },
        })
      } else {
        maintBalanceOp = p().stockBalance.create({
          data: {
            companyId:   cid,
            itemId:      id,
            locationId:  central.id,
            quantity:    1,
            averageCost: Number(item.averageCost ?? item.unitCost ?? 0),
            totalValue:  Number(item.averageCost ?? item.unitCost ?? 0),
          },
        })
      }
    }

    const ops: any[] = []
    if (lastMaint) {
      ops.push(p().toolMaintenanceRecord.update({
        where: { id: lastMaint.id },
        data: {
          result:  'OK',
          ...(nextDate ? { nextDate } : {}),
          notes: lastMaint.notes
            ? `${lastMaint.notes} | Retornou consertada`
            : `Retornou consertada${body.notes ? `. ${body.notes}` : ''}`,
        },
      }))
    }

    ops.push(p().stockItem.update({
      where: { id },
      data: {
        toolStatus:      'AVAILABLE',
        currentLocation: 'Depósito',
        lastMaintenance: now,
        quantity:        { increment: 1 },   // FIX 3: restaurar quantidade
        ...(nextDate ? { nextMaintenance: nextDate } : {}),
      },
    }))

    // FIX 3: restaurar StockBalance no Depósito Central
    if (maintBalanceOp) ops.push(maintBalanceOp)

    await p().$transaction(ops)
    return reply.send({ success: true, toolStatus: 'AVAILABLE' })
  })

  // ── TOOL DISCARD ──────────────────────────────────────────────────────────
  // PATCH /api/v1/deposit/tools/:id/discard
  app.patch('/tools/:id/discard', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const body = z.object({
      reason:      z.string().optional(),
      performedBy: z.string().optional(),
    }).parse(request.body)

    const item = await p().stockItem.findFirst({ where: { id, companyId: cid, isActive: true } })
    if (!item) return reply.status(404).send({ error: 'Ferramenta não encontrada' })

    await p().$transaction([
      // Zero out all stock balances
      p().stockBalance.updateMany({
        where: { itemId: id, companyId: cid },
        data: { quantity: 0, totalValue: 0 },
      }),
      // Mark item as discarded
      p().stockItem.update({
        where: { id },
        data: {
          toolStatus:      'DISCARDED',
          currentLocation: 'Descartada',
          quantity:        0,
        },
      }),
      // Log in maintenance history
      p().toolMaintenanceRecord.create({
        data: {
          companyId:   cid,
          stockItemId: id,
          type:        'CORRECTIVE',
          date:        new Date(),
          result:      'NEEDS_PARTS',
          description: `Ferramenta descartada — sem conserto. ${body.reason ?? ''}`.trim(),
          performedBy: body.performedBy ?? 'Almoxarife',
        },
      }),
    ])

    return reply.send({ success: true, toolStatus: 'DISCARDED' })
  })

  // ── EXCLUIR FERRAMENTA (exclusão lógica) ─────────────────────────────────
  // DELETE /api/v1/deposit/tools/:id
  app.delete('/tools/:id', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    // Verificar permissão: apenas ADMIN, OWNER ou MANAGER podem excluir
    const role: string = (req as any).memberRole ?? ''
    if (!['ADMIN', 'OWNER', 'MANAGER'].includes(role)) {
      return reply.status(403).send({
        error:   'FORBIDDEN',
        message: 'Apenas administradores e gestores podem excluir ferramentas.',
      })
    }

    const item = await p().stockItem.findFirst({
      where: { id, companyId: cid, isActive: true, requiresCustody: true },
    })
    if (!item) return reply.status(404).send({ error: 'Ferramenta não encontrada' })

    // Bloquear se houver custódia ativa
    const activeCustody = await p().toolCustody.findFirst({
      where: { stockItemId: id, returnedAt: null },
    })
    if (activeCustody) {
      return reply.status(400).send({
        error:   'TOOL_IN_USE',
        message: 'Não é possível excluir uma ferramenta em uso. Solicite a devolução primeiro.',
      })
    }

    await p().$transaction([
      // Zerar saldos
      p().stockBalance.updateMany({
        where: { itemId: id, companyId: cid },
        data:  { quantity: 0, totalValue: 0 },
      }),
      // Exclusão lógica
      p().stockItem.update({
        where: { id },
        data:  { isActive: false, quantity: 0 },
      }),
    ])

    return reply.send({ success: true })
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

  // ══════════════════════════════════════════════════════════════════════════
  // ── LOCAIS DE ESTOQUE (MULTI-LOCAL) ──────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  // POST /api/v1/deposit/locations
  app.post('/locations', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const uid = userId(request)!

    const body = z.object({
      name:        z.string().min(1),
      type:        z.enum(['CENTRAL', 'WAREHOUSE']),
      projectId:   z.string().optional(),
      address:     z.string().optional(),
      description: z.string().optional(),
      managerId:   z.string().optional(),
      managerName: z.string().optional(),
    }).parse(request.body)

    // Regras de criação de locais
    const existingLocations = await p().stockLocation.findMany({
      where: { companyId: cid, isActive: true },
      select: { id: true, name: true, type: true },
    })
    const existingCentral = existingLocations.find((l: any) => l.type === 'CENTRAL')

    if (body.type === 'CENTRAL' && existingCentral) {
      return reply.status(400).send({
        error:           'CENTRAL_ALREADY_EXISTS',
        message:         'Já existe um Depósito Central cadastrado. Cada empresa pode ter apenas um.',
        existingCentral: { id: existingCentral.id, name: existingCentral.name },
      })
    }
    if (body.type === 'WAREHOUSE' && !existingCentral) {
      return reply.status(400).send({
        error:   'CENTRAL_REQUIRED',
        message: 'É necessário criar o Depósito Central antes de criar almoxarifados de obra.',
      })
    }

    // Verificar unicidade
    const exists = existingLocations.find((l: any) => l.name === body.name)
    if (exists) return reply.status(409).send({ error: 'Já existe um local com este nome' })

    // Resolver responsável: usar uid atual se managerId não informado
    const mgrId   = body.managerId ?? uid
    const mgrUser = await p().user.findUnique({ where: { id: mgrId }, select: { name: true } })
    const mgrName = body.managerName ?? mgrUser?.name ?? 'Responsável'

    const location = await p().stockLocation.create({
      data: {
        companyId:   cid,
        name:        body.name,
        type:        body.type,
        projectId:   body.projectId   ?? null,
        address:     body.address     ?? null,
        description: body.description ?? null,
        managerId:   mgrId,
        managerName: mgrName,
      },
    })

    // Criar permissão automática de MANAGER para o responsável
    await p().stockLocationPermission.create({
      data: { companyId: cid, userId: mgrId, locationId: location.id, role: 'MANAGER' },
    })

    // Se for CENTRAL: criar saldos zerados para todos os itens ativos
    if (body.type === 'CENTRAL') {
      const items = await p().stockItem.findMany({
        where: { companyId: cid, isActive: true },
        select: { id: true },
      })
      if (items.length > 0) {
        await p().stockBalance.createMany({
          data: items.map((i: any) => ({
            companyId:   cid,
            itemId:      i.id,
            locationId:  location.id,
            quantity:    0,
            reservedQty: 0,
            averageCost: 0,
            totalValue:  0,
          })),
          skipDuplicates: true,
        })
      }
    }

    return reply.status(201).send(location)
  })

  // GET /api/v1/deposit/locations
  app.get('/locations', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)

    const locations = await p().stockLocation.findMany({
      where: { companyId: cid, isActive: true },
      include: {
        project: { select: { id: true, name: true, code: true } },
        manager: { select: { id: true, name: true } },
        _count:  { select: { stockBalances: true, movements: true } },
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    })

    // Agregar valor total de estoque por local
    const result = await Promise.all(
      locations.map(async (loc: any) => {
        const agg = await p().stockBalance.aggregate({
          where: { locationId: loc.id, companyId: cid },
          _sum:   { quantity: true, totalValue: true },
          _count: { id: true },
        })
        return {
          ...loc,
          totalItems:    agg._count.id         ?? 0,
          totalQuantity: Number(agg._sum.quantity   ?? 0),
          totalValue:    Number(agg._sum.totalValue  ?? 0),
        }
      }),
    )

    return reply.send({ locations: result })
  })

  // GET /api/v1/deposit/locations/:id
  app.get('/locations/:id', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const loc = await p().stockLocation.findFirst({
      where: { id, companyId: cid },
      include: {
        project:     { select: { id: true, name: true } },
        manager:     { select: { id: true, name: true } },
        permissions: { include: { user: { select: { id: true, name: true, email: true } } } },
        _count:      { select: { stockBalances: true } },
      },
    })
    if (!loc) return reply.status(404).send({ error: 'Local não encontrado' })
    return reply.send(loc)
  })

  // PATCH /api/v1/deposit/locations/:id
  app.patch('/locations/:id', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const body = z.object({
      name:        z.string().optional(),
      address:     z.string().optional(),
      description: z.string().optional(),
      managerId:   z.string().optional(),
      isActive:    z.boolean().optional(),
    }).parse(request.body)

    const data: any = { ...body }
    if (body.managerId) {
      const u = await p().user.findUnique({ where: { id: body.managerId }, select: { name: true } })
      data.managerName = u?.name ?? data.managerName
    }

    const loc = await p().stockLocation.update({ where: { id }, data })
    return reply.send(loc)
  })

  // ── SALDOS POR LOCAL ──────────────────────────────────────────────────────

  // GET /api/v1/deposit/items/:id/balances
  app.get('/items/:id/balances', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const item = await p().stockItem.findFirst({ where: { id, companyId: cid } })
    if (!item) return reply.status(404).send({ error: 'Item não encontrado' })

    const balances = await p().stockBalance.findMany({
      where: { itemId: id, companyId: cid },
      include: {
        location: {
          select: { id: true, name: true, type: true, project: { select: { id: true, name: true } } },
        },
      },
      orderBy: { location: { type: 'asc' } },
    })

    const totals = balances.reduce(
      (acc: any, b: any) => ({
        totalQuantity: acc.totalQuantity + Number(b.quantity),
        totalValue:    acc.totalValue    + Number(b.totalValue),
        totalLocations: acc.totalLocations + 1,
      }),
      { totalQuantity: 0, totalValue: 0, totalLocations: 0 },
    )

    return reply.send({
      item,
      balances: balances.map((b: any) => ({
        location:     b.location,
        quantity:     Number(b.quantity),
        reservedQty:  Number(b.reservedQty),
        availableQty: Math.max(0, Number(b.quantity) - Number(b.reservedQty)),
        averageCost:  Number(b.averageCost),
        totalValue:   Number(b.totalValue),
      })),
      totals,
    })
  })

  // ── ENTRADA RÁPIDA ────────────────────────────────────────────────────────

  // POST /api/v1/deposit/quick-entry
  app.post('/quick-entry', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const uid = userId(request)!

    const body = z.object({
      locationId:    z.string().optional(),   // opcional — se omitido usa Depósito Central
      itemId:        z.string().optional(),
      newItem:       z.object({
        name:        z.string(),
        category:    z.string().optional(),
        unit:        z.string().default('un'),
        brand:       z.string().optional(),
        description: z.string().optional(),
        isEpi:       z.boolean().optional(),
        isUniform:   z.boolean().optional(),
      }).optional(),
      quantity:      z.number().positive(),
      unitCost:      z.number().min(0).default(0),
      supplierId:    z.string().optional(),
      supplierName:  z.string().optional(),
      brand:         z.string().optional(),
      lot:           z.string().optional(),
      invoiceNumber: z.string().optional(),
      expiryDate:    z.string().optional(),
      notes:         z.string().optional(),
    }).parse(request.body)

    if (!body.itemId && !body.newItem) {
      return reply.status(400).send({ error: 'Informe itemId ou newItem' })
    }

    // Resolver locationId — se não fornecido, usa o Depósito Central
    let effectiveLocationId = body.locationId
    if (!effectiveLocationId) {
      const central = await p().stockLocation.findFirst({
        where: { companyId: cid, type: 'CENTRAL', isActive: true },
      })
      if (!central) return reply.status(400).send({ error: 'CENTRAL_REQUIRED', message: 'Nenhum Depósito Central encontrado. Crie um local do tipo Central primeiro.' })
      effectiveLocationId = central.id
    }

    // Verificar se o local existe
    const location = await p().stockLocation.findFirst({
      where: { id: effectiveLocationId, companyId: cid, isActive: true },
    })
    if (!location) return reply.status(404).send({ error: 'Local não encontrado' })

    // Resolver item
    let item: any
    if (body.itemId) {
      item = await p().stockItem.findFirst({ where: { id: body.itemId, companyId: cid } })
      if (!item) return reply.status(404).send({ error: 'Item não encontrado' })
    } else {
      item = await p().stockItem.create({
        data: {
          companyId:   cid,
          name:        body.newItem!.name,
          category:    body.newItem!.category  ?? null,
          unit:        body.newItem!.unit,
          brand:       body.newItem!.brand     ?? null,
          description: body.newItem!.description ?? null,
          isEpi:       body.newItem!.isEpi     ?? false,
          isUniform:   body.newItem!.isUniform ?? false,
          isConsumable: true,
        },
      })
    }

    // Garantir saldo existente
    await p().stockBalance.upsert({
      where:  { itemId_locationId: { itemId: item.id, locationId: effectiveLocationId } },
      create: {
        companyId:   cid,
        itemId:      item.id,
        locationId:  effectiveLocationId,
        quantity:    0,
        reservedQty: 0,
        averageCost: 0,
        totalValue:  0,
      },
      update: {},
    })

    // Ler saldo atual
    const bal = await p().stockBalance.findFirst({
      where: { itemId: item.id, locationId: effectiveLocationId },
    })
    const curQty  = Number(bal?.quantity  ?? 0)
    const curAvg  = Number(bal?.averageCost ?? 0)
    const newQty  = curQty + body.quantity
    const newAvg  = newQty > 0
      ? (curQty * curAvg + body.quantity * body.unitCost) / newQty
      : body.unitCost

    // Criar lote de fornecedor — sempre que houver qualquer dado de lote/fornecedor
    const hasLotData = !!(body.supplierId || body.supplierName || body.lot || body.invoiceNumber || body.expiryDate)
    const lotData = hasLotData ? {
      companyId:     cid,
      stockItemId:   item.id,
      supplierId:    body.supplierId    ?? null,
      supplierName:  body.supplierName  ?? null,
      lotNumber:     body.lot           ?? null,
      invoiceNumber: body.invoiceNumber ?? null,
      purchaseDate:  new Date(),
      quantity:      body.quantity,
      unitCost:      body.unitCost,
      expiryDate:    body.expiryDate ? new Date(body.expiryDate) : null,
      notes:         body.notes ?? null,
    } : null

    await p().$transaction([
      // Atualizar saldo do local
      p().stockBalance.update({
        where: { itemId_locationId: { itemId: item.id, locationId: effectiveLocationId } },
        data: {
          quantity:    newQty,
          averageCost: newAvg,
          totalValue:  newQty * newAvg,
        },
      }),
      // Atualizar quantity global do item (soma de todos os locais)
      p().stockItem.update({
        where: { id: item.id },
        data:  { quantity: { increment: body.quantity }, averageCost: newAvg },
      }),
      // Criar movimento
      p().stockMovement.create({
        data: {
          companyId:     cid,
          stockItemId:   item.id,
          locationId:    effectiveLocationId,
          responsibleId: uid,
          type:          'IN',
          quantity:      body.quantity,
          unitCost:      body.unitCost,
          totalCost:     body.quantity * body.unitCost,
          supplierName:  body.supplierName  ?? null,
          brand:         body.brand         ?? null,
          lot:           body.lot           ?? null,
          notes:         body.notes         ?? null,
        },
      }),
      // Lote de fornecedor (se informado)
      ...(lotData ? [p().supplierLot.create({ data: lotData })] : []),
    ])

    return reply.status(201).send({ item, locationId: effectiveLocationId, addedQty: body.quantity, newBalance: newQty })
  })

  // ── TRANSFERÊNCIAS ────────────────────────────────────────────────────────

  // POST /api/v1/deposit/transfers
  app.post('/transfers', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const uid = userId(request)!

    const body = z.object({
      fromLocationId: z.string(),
      toLocationId:   z.string(),
      notes:          z.string().optional(),
      items: z.array(z.object({
        itemId:   z.string(),
        quantity: z.number().positive(),
        notes:    z.string().optional(),
      })).min(1),
    }).parse(request.body)

    if (body.fromLocationId === body.toLocationId) {
      return reply.status(400).send({ error: 'Origem e destino não podem ser iguais' })
    }

    // Verificar locais
    const [from, to] = await Promise.all([
      p().stockLocation.findFirst({ where: { id: body.fromLocationId, companyId: cid } }),
      p().stockLocation.findFirst({ where: { id: body.toLocationId,   companyId: cid } }),
    ])
    if (!from) return reply.status(404).send({ error: 'Local de origem não encontrado' })
    if (!to)   return reply.status(404).send({ error: 'Local de destino não encontrado' })

    // Verificar saldo disponível e reservar
    for (const it of body.items) {
      const bal = await p().stockBalance.findFirst({
        where: { itemId: it.itemId, locationId: body.fromLocationId },
      })
      const available = Number(bal?.quantity ?? 0) - Number(bal?.reservedQty ?? 0)
      if (available < it.quantity) {
        const item = await p().stockItem.findUnique({ where: { id: it.itemId } })
        return reply.status(400).send({
          error: `Saldo insuficiente: ${item?.name ?? it.itemId} tem apenas ${available} disponível`,
        })
      }
    }

    // Gerar docNumber TRF-YYYY-NNNN
    const year = new Date().getFullYear()
    const prefix = `TRF-${year}-`
    const last = await p().stockTransfer.findFirst({
      where: { companyId: cid, docNumber: { startsWith: prefix } },
      orderBy: { docNumber: 'desc' },
      select: { docNumber: true },
    })
    const seq = last?.docNumber
      ? parseInt(last.docNumber.split('-').pop() ?? '0') + 1
      : 1
    const docNumber = `${prefix}${String(seq).padStart(4, '0')}`

    // Buscar custos médios dos saldos
    const itemsWithCost = await Promise.all(
      body.items.map(async (it) => {
        const bal = await p().stockBalance.findFirst({
          where: { itemId: it.itemId, locationId: body.fromLocationId },
        })
        return { ...it, unitCost: Number(bal?.averageCost ?? 0) }
      }),
    )

    const transfer = await p().$transaction(async (tx: any) => {
      const t = await tx.stockTransfer.create({
        data: {
          companyId:     cid,
          docNumber,
          fromLocationId: body.fromLocationId,
          toLocationId:   body.toLocationId,
          requestedBy:    uid,
          notes:          body.notes ?? null,
          status:         'PENDING',
        },
      })

      // Criar itens e reservar saldo
      for (const it of itemsWithCost) {
        await tx.stockTransferItem.create({
          data: {
            transferId:   t.id,
            itemId:       it.itemId,
            requestedQty: it.quantity,
            unitCost:     it.unitCost,
            notes:        it.notes ?? null,
          },
        })
        await tx.stockBalance.updateMany({
          where: { itemId: it.itemId, locationId: body.fromLocationId },
          data:  { reservedQty: { increment: it.quantity } },
        })
      }

      return t
    })

    return reply.status(201).send(transfer)
  })

  // GET /api/v1/deposit/transfers
  app.get('/transfers', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { status, locationId, page = '1', limit = '20' } = request.query as any
    const skip = (parseInt(page) - 1) * parseInt(limit)

    const where: any = { companyId: cid, isActive: true }
    if (status)     where.status          = status
    if (locationId) where.OR = [{ fromLocationId: locationId }, { toLocationId: locationId }]

    const [transfers, total] = await Promise.all([
      p().stockTransfer.findMany({
        where,
        include: {
          fromLocation: { select: { id: true, name: true, type: true } },
          toLocation:   { select: { id: true, name: true, type: true } },
          requester:    { select: { id: true, name: true } },
          responder:    { select: { id: true, name: true } },
          items: {
            include: { item: { select: { id: true, name: true, unit: true, code: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      p().stockTransfer.count({ where }),
    ])

    return reply.send({ transfers, total, page: parseInt(page) })
  })

  // PATCH /api/v1/deposit/transfers/:id/accept
  app.patch('/transfers/:id/accept', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const uid = userId(request)!
    const { id } = request.params as { id: string }

    const body = z.object({
      items: z.array(z.object({
        transferItemId: z.string(),
        acceptedQty:    z.number().min(0),
      })).min(1),
      notes:             z.string().optional(),
      receiverSignature: z.string().optional(),
    }).parse(request.body)

    const transfer = await p().stockTransfer.findFirst({
      where: { id, companyId: cid, status: 'PENDING' },
      include: { items: true },
    })
    if (!transfer) return reply.status(404).send({ error: 'Transferência não encontrada ou já processada' })

    await p().$transaction(async (tx: any) => {
      let allFull = true

      for (const accept of body.items) {
        const ti = transfer.items.find((i: any) => i.id === accept.transferItemId)
        if (!ti) continue

        const accepted = Math.min(accept.acceptedQty, Number(ti.requestedQty))
        if (accepted < Number(ti.requestedQty)) allFull = false

        if (accepted > 0) {
          // Debitar do local de origem
          await tx.stockBalance.updateMany({
            where: { itemId: ti.itemId, locationId: transfer.fromLocationId },
            data: {
              quantity:    { decrement: accepted },
              reservedQty: { decrement: Number(ti.requestedQty) },
            },
          })

          // Garantir saldo no destino
          await tx.stockBalance.upsert({
            where:  { itemId_locationId: { itemId: ti.itemId, locationId: transfer.toLocationId } },
            create: {
              companyId:   cid,
              itemId:      ti.itemId,
              locationId:  transfer.toLocationId,
              quantity:    accepted,
              averageCost: Number(ti.unitCost),
              totalValue:  accepted * Number(ti.unitCost),
              reservedQty: 0,
            },
            update: { quantity: { increment: accepted } },
          })

          // Movimentos
          await tx.stockMovement.createMany({
            data: [
              {
                companyId:   cid,
                stockItemId: ti.itemId,
                locationId:  transfer.fromLocationId,
                transferId:  transfer.id,
                type:        'TRANSFER_OUT',
                quantity:    accepted,
                unitCost:    Number(ti.unitCost),
                totalCost:   accepted * Number(ti.unitCost),
                responsibleId: uid,
              },
              {
                companyId:   cid,
                stockItemId: ti.itemId,
                locationId:  transfer.toLocationId,
                transferId:  transfer.id,
                type:        'TRANSFER_IN',
                quantity:    accepted,
                unitCost:    Number(ti.unitCost),
                totalCost:   accepted * Number(ti.unitCost),
                responsibleId: uid,
              },
            ],
          })
        } else {
          // Liberar reserva sem mover
          await tx.stockBalance.updateMany({
            where: { itemId: ti.itemId, locationId: transfer.fromLocationId },
            data:  { reservedQty: { decrement: Number(ti.requestedQty) } },
          })
          allFull = false
        }

        await tx.stockTransferItem.update({
          where: { id: ti.id },
          data:  { acceptedQty: accepted },
        })
      }

      await tx.stockTransfer.update({
        where: { id },
        data: {
          status:           allFull ? 'ACCEPTED' : 'PARTIAL',
          respondedBy:      uid,
          respondedAt:      new Date(),
          receiverSignature: body.receiverSignature ?? null,
          notes:            body.notes ?? null,
        },
      })
    })

    return reply.send({ success: true })
  })

  // PATCH /api/v1/deposit/transfers/:id/reject
  app.patch('/transfers/:id/reject', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const uid = userId(request)!
    const { id } = request.params as { id: string }

    const { reason } = z.object({ reason: z.string().min(1) }).parse(request.body)

    const transfer = await p().stockTransfer.findFirst({
      where: { id, companyId: cid, status: 'PENDING' },
      include: { items: true },
    })
    if (!transfer) return reply.status(404).send({ error: 'Transferência não encontrada' })

    await p().$transaction(async (tx: any) => {
      // Liberar todas as reservas
      for (const ti of transfer.items) {
        await tx.stockBalance.updateMany({
          where: { itemId: ti.itemId, locationId: transfer.fromLocationId },
          data:  { reservedQty: { decrement: Number(ti.requestedQty) } },
        })
      }
      await tx.stockTransfer.update({
        where: { id },
        data: {
          status:         'REJECTED',
          respondedBy:    uid,
          respondedAt:    new Date(),
          rejectionReason: reason,
        },
      })
    })

    return reply.send({ success: true })
  })

  // PATCH /api/v1/deposit/transfers/:id/cancel
  app.patch('/transfers/:id/cancel', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const transfer = await p().stockTransfer.findFirst({
      where: { id, companyId: cid, status: 'PENDING' },
      include: { items: true },
    })
    if (!transfer) return reply.status(404).send({ error: 'Transferência não encontrada ou não pode ser cancelada' })

    await p().$transaction(async (tx: any) => {
      for (const ti of transfer.items) {
        await tx.stockBalance.updateMany({
          where: { itemId: ti.itemId, locationId: transfer.fromLocationId },
          data:  { reservedQty: { decrement: Number(ti.requestedQty) } },
        })
      }
      await tx.stockTransfer.update({ where: { id }, data: { status: 'CANCELLED', isActive: false } })
    })

    return reply.send({ success: true })
  })

  // ── CAUTELA PDF DO EPI ────────────────────────────────────────────────────

  // GET /api/v1/deposit/epi-deliveries/:id/cautela
  app.get('/epi-deliveries/:id/cautela', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { id } = request.params as { id: string }

    const delivery = await p().stockEpiDelivery.findFirst({
      where: { id, companyId: cid },
      include: {
        stockItem: true,
        employee:  true,
        responsible: { select: { id: true, name: true } },
        location:  { select: { id: true, name: true } },
        company:   { select: { id: true, name: true, logo: true, cnpj: true } },
      },
    })
    if (!delivery) return reply.status(404).send({ error: 'Entrega não encontrada' })

    // Buscar histórico completo do mesmo item para o mesmo colaborador
    const history = await p().stockEpiDelivery.findMany({
      where: {
        companyId:   cid,
        stockItemId: delivery.stockItemId,
        employeeId:  delivery.employeeId,
      },
      include: {
        responsible: { select: { name: true } },
        location:    { select: { name: true } },
      },
      orderBy: { deliveredAt: 'asc' },
    })

    // Gerar HTML para o PDF
    const apiBase = `${process.env.APP_URL ?? 'http://localhost:3001'}`
    const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
    const fmtDateTime = (d: any) =>
      d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

    const histRows = history.map((h: any) => `
      <tr>
        <td>${fmtDateTime(h.deliveredAt)}</td>
        <td>${h.quantity} ${delivery.stockItem.unit}</td>
        <td>${h.size ?? '—'}</td>
        <td>${h.responsible?.name ?? '—'}</td>
        <td>${h.location?.name ?? '—'}</td>
        <td>${h.expiresAt ? fmtDate(h.expiresAt) : '—'}</td>
        <td>${h.selfieUrl ? `<img src="${apiBase}${h.selfieUrl}" style="width:50px;height:50px;object-fit:cover;border-radius:4px">` : '—'}</td>
        <td>${h.signatureUrl ? `<img src="${apiBase}${h.signatureUrl}" style="height:35px;max-width:100px">` : '—'}</td>
      </tr>
    `).join('')

    const html = `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8">
<style>
${PDF_BASE_STYLES}
/* ── Overrides cautela EPI ── */
body { padding: 0; }
.doc-body { padding: 20px 28px 70px; }
.stitle { font-size:8px; font-weight:700; text-transform:uppercase; color:#6B7280; letter-spacing:.1em; border-bottom:1px solid #e5e7eb; padding-bottom:3px; margin-bottom:8px; }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
.grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; }
.lbl { font-size:9px; color:#9ca3af; margin-bottom:1px; }
.val { font-size:11px; font-weight:500; color:#111827; }
td { padding:5px 7px; font-size:10px; border-bottom:1px solid #f3f4f6; vertical-align:middle; }
tr:nth-child(even) td { background:#fafafa; }
.termo { background:#fffbeb; border:1px solid #fcd34d; border-radius:6px; padding:10px 12px; font-size:9.5px; line-height:1.6; margin:12px 0; }
.sig-grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:16px; }
.sig-box { text-align:center; border:1px solid #e5e7eb; border-radius:6px; padding:10px; }
.sig-label { font-size:8px; font-weight:700; text-transform:uppercase; color:#6b7280; letter-spacing:.08em; margin-bottom:6px; }
.sig-img { height:60px; margin:0 auto 6px; display:flex; align-items:center; justify-content:center; }
.sig-line { width:160px; border-top:1px solid #374151; margin:0 auto 4px; }
.sig-name { font-size:10px; font-weight:600; }
.sig-meta { font-size:9px; color:#9ca3af; margin-top:1px; }
.selfie-row { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
.selfie-item { text-align:center; }
.selfie-item img { width:70px; height:70px; object-fit:cover; border-radius:6px; border:1px solid #e5e7eb; }
.selfie-item p { font-size:8px; color:#9ca3af; margin-top:2px; }
</style>
</head><body>
${getPdfHeader({
    title:    'CAUTELA DE EPI',
    company:  { name: delivery.company.name, document: delivery.company.cnpj ?? null, logo: delivery.company.logo ?? null },
    date:     `Portaria MTE 485/2005 — NR-6 · Emitido: ${fmtDateTime(new Date())}`,
  })}

<div class="doc-body">
  <!-- Dados do colaborador -->
  <div class="section">
    <div class="stitle">Dados do Colaborador</div>
    <div class="grid3">
      <div><div class="lbl">Nome</div><div class="val">${delivery.employee.name}</div></div>
      <div><div class="lbl">Matrícula</div><div class="val">${(delivery.employee as any).code ?? '—'}</div></div>
      <div><div class="lbl">CPF</div><div class="val">${(delivery.employee as any).cpf ?? '—'}</div></div>
      <div><div class="lbl">Função/Cargo</div><div class="val">${(delivery.employee as any).role ?? (delivery.employee as any).position ?? '—'}</div></div>
      <div><div class="lbl">Departamento</div><div class="val">${(delivery.employee as any).department ?? '—'}</div></div>
      <div><div class="lbl">Local</div><div class="val">${delivery.location?.name ?? '—'}</div></div>
    </div>
  </div>

  <!-- EPIs entregues -->
  <div class="section">
    <div class="stitle">EPIs Entregues</div>
    <table>
      <thead>
        <tr>
          <th>Nº</th>
          <th>Descrição do EPI</th>
          <th style="width:60px">CA</th>
          <th style="width:40px">Qtd</th>
          <th style="width:50px">Tamanho</th>
          <th style="width:75px">Validade</th>
          <th style="width:65px">Vida útil</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>01</td>
          <td><b>${delivery.stockItem.name}</b>${delivery.stockItem.brand ? ` — ${delivery.stockItem.brand}` : ''}</td>
          <td>${delivery.caNumber ?? '—'}</td>
          <td>${Number(delivery.quantity)}</td>
          <td>${delivery.size ?? '—'}</td>
          <td>${delivery.expiresAt ? fmtDate(delivery.expiresAt) : '—'}</td>
          <td>—</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Histórico -->
  <div class="section">
    <div class="stitle">Histórico de Entregas — ${delivery.stockItem.name} (${history.length} entrega${history.length !== 1 ? 's' : ''})</div>
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Qtd.</th>
          <th>Tam.</th>
          <th>Almoxarife</th>
          <th>Validade</th>
          <th>Selfie</th>
          <th>Assinatura</th>
        </tr>
      </thead>
      <tbody>${histRows}</tbody>
    </table>
  </div>

  <!-- Termo de responsabilidade -->
  <div class="termo">
    <b>TERMO DE RESPONSABILIDADE</b><br><br>
    Declaro ter recebido os EPIs acima relacionados, comprometendo-me a:
    <ul style="margin:4px 0 0 16px">
      <li>Utilizá-los apenas para a finalidade a que se destinam;</li>
      <li>Responsabilizar-me por sua guarda e conservação;</li>
      <li>Comunicar ao empregador qualquer alteração que o torne impróprio para uso;</li>
      <li>Cumprir as determinações do empregador sobre o uso adequado.</li>
    </ul>
    <br>
    <i>Base legal: Portaria MTE 485/2005 — NR-6, item 6.3. O descumprimento poderá acarretar medidas disciplinares.</i>
  </div>

  <!-- Assinaturas -->
  <div class="sig-grid">
    <div class="sig-box">
      <div class="sig-label">Colaborador</div>
      ${delivery.signatureUrl
        ? `<div class="sig-img"><img src="${process.env.APP_URL ?? 'http://localhost:3001'}${delivery.signatureUrl}" style="height:55px;max-width:140px" onerror="this.style.display='none'" /></div>`
        : '<div style="height:55px"></div>'
      }
      <div class="sig-line"></div>
      <div class="sig-name">${delivery.employee.name}</div>
      <div class="sig-meta">${fmtDateTime(delivery.deliveredAt)}</div>
    </div>
    <div class="sig-box">
      <div class="sig-label">Almoxarife / Responsável</div>
      <div style="height:55px"></div>
      <div class="sig-line"></div>
      <div class="sig-name">${delivery.responsible?.name ?? '—'}</div>
      <div class="sig-meta">Almoxarife</div>
    </div>
  </div>

  <!-- Selfies -->
  ${history.some((h: any) => h.selfieUrl) ? `
  <div class="section" style="margin-top:14px">
    <div class="stitle">Selfies de entrega</div>
    <div class="selfie-row">
      ${history.filter((h: any) => h.selfieUrl).map((h: any) => `
        <div class="selfie-item">
          <img src="${process.env.APP_URL ?? 'http://localhost:3001'}${h.selfieUrl}" onerror="this.style.display='none'" />
          <p>${fmtDate(h.deliveredAt)}</p>
        </div>
      `).join('')}
    </div>
  </div>` : ''}

</div>
${getPdfFooter(delivery.company.name)}
</body></html>`

    // Tentar usar puppeteer se disponível, senão retornar HTML
    try {
      const puppeteer = require('puppeteer')
      const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
      const page    = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle0' })
      const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
      await browser.close()
      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `inline; filename="cautela-epi-${id}.pdf"`)
      return reply.send(pdf)
    } catch {
      // Fallback: retornar HTML
      reply.header('Content-Type', 'text/html; charset=utf-8')
      return reply.send(html)
    }
  })

  // ── CAUTELA COMPLETA POR COLABORADOR ─────────────────────────────────────
  // GET /api/v1/deposit/employees/:employeeId/epi-cautela
  app.get('/employees/:employeeId/epi-cautela', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const { employeeId } = request.params as { employeeId: string }

    const [employee, company, allDeliveries] = await Promise.all([
      p().employee.findFirst({ where: { id: employeeId, companyId: cid } }),
      p().company.findFirst({ where: { id: cid }, select: { name: true, cnpj: true, logo: true } }),
      p().stockEpiDelivery.findMany({
        where: { companyId: cid, employeeId },
        include: {
          stockItem: { select: { id: true, name: true, unit: true, brand: true, model: true } },
          responsible: { select: { name: true } },
          location:   { select: { name: true } },
        },
        orderBy: { deliveredAt: 'asc' },
      }),
    ])

    if (!employee) return reply.status(404).send({ error: 'Colaborador não encontrado' })

    const apiBase  = process.env.APP_URL ?? 'http://localhost:3001'
    const fmtDate  = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
    const fmtDT    = (d: any) => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

    // Agrupar entregas por item para tabela de EPIs ativos
    const grouped = new Map<string, typeof allDeliveries>()
    for (const d of allDeliveries) {
      const key = d.stockItemId
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(d)
    }

    let rowNum = 0
    const epiRows = [...grouped.entries()].map(([, dels]) => {
      rowNum++
      const last = dels[dels.length - 1]
      return `
        <tr>
          <td style="text-align:center">${String(rowNum).padStart(2,'0')}</td>
          <td><b>${last.stockItem.name}</b>${last.stockItem.brand ? ` — ${last.stockItem.brand}` : ''}</td>
          <td style="text-align:center">${(last as any).caNumber ?? '—'}</td>
          <td style="text-align:center">${dels.reduce((a: number, d: any) => a + Number(d.quantity), 0)} ${last.stockItem.unit}</td>
          <td style="text-align:center">${(last as any).size ?? '—'}</td>
          <td style="text-align:center">${last.expiresAt ? fmtDate(last.expiresAt) : '—'}</td>
          <td style="text-align:center">—</td>
        </tr>`
    }).join('')

    const histRows = allDeliveries.map((h: any) => `
      <tr>
        <td>${fmtDT(h.deliveredAt)}</td>
        <td>${h.stockItem.name}</td>
        <td style="text-align:center">${h.quantity} ${h.stockItem.unit}</td>
        <td style="text-align:center">${h.size ?? '—'}</td>
        <td>${h.responsible?.name ?? '—'}</td>
        <td>${h.location?.name ?? '—'}</td>
        <td style="text-align:center">${h.expiresAt ? fmtDate(h.expiresAt) : '—'}</td>
        <td style="text-align:center">${h.selfieUrl ? `<img src="${apiBase}${h.selfieUrl}" style="width:45px;height:45px;object-fit:cover;border-radius:4px">` : '—'}</td>
        <td style="text-align:center">${h.signatureUrl ? `<img src="${apiBase}${h.signatureUrl}" style="height:30px;max-width:90px">` : '—'}</td>
      </tr>`).join('')

    // Última assinatura do colaborador
    const lastWithSig = [...allDeliveries].reverse().find((d: any) => d.signatureUrl)

    const html = `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8">
<style>
${PDF_BASE_STYLES}
/* ── Overrides cautela EPI ficha completa ── */
body { padding: 0; }
.doc-body { padding: 20px 28px 70px; }
.stitle { font-size:8px; font-weight:700; text-transform:uppercase; color:#6B7280; letter-spacing:.1em; border-bottom:1px solid #e5e7eb; padding-bottom:3px; margin-bottom:7px; }
.grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; }
.lbl { font-size:8px; color:#9ca3af; margin-bottom:1px; }
.val { font-size:10px; font-weight:500; color:#111827; }
table { font-size:9px; }
td { padding:4px 6px; border-bottom:1px solid #f3f4f6; vertical-align:middle; }
tr:nth-child(even) td { background:#fafafa; }
.termo { background:#fffbeb; border:1px solid #fcd34d; border-radius:6px; padding:9px 11px; font-size:9px; line-height:1.65; margin:10px 0; }
.sig-grid { display:grid; grid-template-columns:1fr 1fr; gap:22px; margin-top:14px; }
.sig-box { text-align:center; border:1px solid #e5e7eb; border-radius:6px; padding:10px; }
.sig-label { font-size:8px; font-weight:700; text-transform:uppercase; color:#6b7280; letter-spacing:.08em; margin-bottom:5px; }
.sig-img { height:55px; margin:0 auto 5px; display:flex; align-items:center; justify-content:center; }
.sig-line { width:150px; border-top:1px solid #374151; margin:0 auto 3px; }
.sig-name { font-size:10px; font-weight:600; }
.sig-meta { font-size:8px; color:#9ca3af; margin-top:1px; }
.selfie-row { display:flex; gap:7px; flex-wrap:wrap; margin-top:7px; }
.selfie-item { text-align:center; }
.selfie-item img { width:65px; height:65px; object-fit:cover; border-radius:5px; border:1px solid #e5e7eb; }
.selfie-item p { font-size:7px; color:#9ca3af; margin-top:2px; }
</style>
</head><body>
${getPdfHeader({
    title:   'CAUTELA DE EPI — FICHA COMPLETA',
    company: { name: company?.name ?? '', document: company?.cnpj ?? null, logo: company?.logo ?? null },
    date:    `Portaria MTE 485/2005 — NR-6 · Emitido: ${fmtDT(new Date())}`,
  })}
<div class="doc-body">
  <div class="section">
    <div class="stitle">Dados do Colaborador</div>
    <div class="grid3">
      <div><div class="lbl">Nome</div><div class="val">${(employee as any).name}</div></div>
      <div><div class="lbl">Matrícula</div><div class="val">${(employee as any).code ?? '—'}</div></div>
      <div><div class="lbl">CPF</div><div class="val">${(employee as any).cpf ?? '—'}</div></div>
      <div><div class="lbl">Função/Cargo</div><div class="val">${(employee as any).role ?? (employee as any).position ?? '—'}</div></div>
      <div><div class="lbl">Departamento</div><div class="val">${(employee as any).department ?? '—'}</div></div>
      <div><div class="lbl">Total de EPIs entregues</div><div class="val">${allDeliveries.length} entrega${allDeliveries.length !== 1 ? 's' : ''}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="stitle">EPIs Entregues</div>
    <table>
      <thead><tr>
        <th style="width:28px">Nº</th>
        <th>Descrição do EPI</th>
        <th style="width:55px">CA</th>
        <th style="width:45px">Qtd total</th>
        <th style="width:50px">Tamanho</th>
        <th style="width:68px">Validade</th>
        <th style="width:55px">Vida útil</th>
      </tr></thead>
      <tbody>${epiRows}</tbody>
    </table>
  </div>

  <div class="section">
    <div class="stitle">Histórico completo de entregas — ${allDeliveries.length} registro${allDeliveries.length !== 1 ? 's' : ''}</div>
    <table>
      <thead><tr>
        <th>Data/Hora</th>
        <th>EPI</th>
        <th style="width:40px">Qtd</th>
        <th style="width:45px">Tam.</th>
        <th>Almoxarife</th>
        <th>Local</th>
        <th style="width:65px">Validade</th>
        <th style="width:50px">Selfie</th>
        <th style="width:80px">Assinatura</th>
      </tr></thead>
      <tbody>${histRows}</tbody>
    </table>
  </div>

  <div class="termo">
    <b>TERMO DE RESPONSABILIDADE</b><br><br>
    Declaro ter recebido os EPIs acima relacionados, comprometendo-me a:
    <ul style="margin:4px 0 0 16px">
      <li>Utilizá-los apenas para a finalidade a que se destinam;</li>
      <li>Responsabilizar-me por sua guarda e conservação;</li>
      <li>Comunicar ao empregador qualquer alteração que o torne impróprio para uso;</li>
      <li>Cumprir as determinações do empregador sobre o uso adequado.</li>
    </ul>
    <br>
    <i>Base legal: Portaria MTE 485/2005 — NR-6, item 6.3. O descumprimento poderá acarretar medidas disciplinares.</i>
  </div>

  <div class="sig-grid">
    <div class="sig-box">
      <div class="sig-label">Colaborador</div>
      ${lastWithSig
        ? `<div class="sig-img"><img src="${apiBase}${(lastWithSig as any).signatureUrl}" style="height:50px;max-width:130px" onerror="this.style.display='none'"></div>`
        : '<div style="height:50px"></div>'
      }
      <div class="sig-line"></div>
      <div class="sig-name">${(employee as any).name}</div>
      <div class="sig-meta">${lastWithSig ? fmtDate((lastWithSig as any).deliveredAt) : 'Data: ________'}</div>
    </div>
    <div class="sig-box">
      <div class="sig-label">Almoxarife / Responsável</div>
      <div style="height:50px"></div>
      <div class="sig-line"></div>
      <div class="sig-name">___________________________</div>
      <div class="sig-meta">Data: ________</div>
    </div>
  </div>

  ${allDeliveries.some((h: any) => h.selfieUrl) ? `
  <div class="section" style="margin-top:12px">
    <div class="stitle">Selfies de entrega</div>
    <div class="selfie-row">
      ${allDeliveries.filter((h: any) => h.selfieUrl).map((h: any) => `
        <div class="selfie-item">
          <img src="${apiBase}${h.selfieUrl}" onerror="this.style.display='none'" />
          <p>${h.stockItem.name}<br>${fmtDate(h.deliveredAt)}</p>
        </div>`).join('')}
    </div>
  </div>` : ''}

</div>
${getPdfFooter(company?.name ?? '')}
</body></html>`

    try {
      const puppeteer = require('puppeteer')
      const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
      const page    = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle0' })
      const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
      await browser.close()
      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `inline; filename="cautela-completa-epi-${employeeId.slice(-8)}.pdf"`)
      return reply.send(pdf)
    } catch {
      reply.header('Content-Type', 'text/html; charset=utf-8')
      return reply.send(html)
    }
  })

  // ── AUTOCOMPLETE DE MARCAS ────────────────────────────────────────────────
  // GET /api/v1/deposit/brands
  app.get('/brands', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)

    // Buscar todas as marcas distintas de itens ativos + movimentos + lotes
    const [itemBrands, movBrands, lotBrands] = await Promise.all([
      p().stockItem.findMany({
        where: { companyId: cid, isActive: true, brand: { not: null } },
        select: { brand: true },
        distinct: ['brand'],
        orderBy: { brand: 'asc' },
      }),
      p().stockMovement.findMany({
        where: { companyId: cid, brand: { not: null } },
        select: { brand: true },
        distinct: ['brand'],
        orderBy: { brand: 'asc' },
      }),
      p().supplierLot.findMany({
        where: { companyId: cid },
        select: { notes: true },  // brand não é campo do SupplierLot, usar notas como fallback
        take: 0,  // placeholder, veja abaixo
      }),
    ])

    const brandSet = new Set<string>()
    for (const r of itemBrands) if (r.brand) brandSet.add(r.brand.trim())
    for (const r of movBrands)  if (r.brand) brandSet.add(r.brand.trim())

    const brands = Array.from(brandSet).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return reply.send({ brands })
  })

  // ── SETUP STATUS ─────────────────────────────────────────────────────────
  // GET /api/v1/deposit/setup-status
  app.get('/setup-status', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)

    const central = await p().stockLocation.findFirst({
      where:   { companyId: cid, type: 'CENTRAL', isActive: true },
      include: {
        manager: { select: { id: true, name: true, email: true } },
        _count:  { select: { stockBalances: true } },
      },
    })

    const [warehouseCount, itemCount] = await Promise.all([
      p().stockLocation.count({ where: { companyId: cid, type: 'WAREHOUSE', isActive: true } }),
      p().stockItem.count({ where: { companyId: cid, isActive: true } }),
    ])

    return reply.send({
      hasCentral:     !!central,
      central:        central ?? null,
      warehouseCount,
      itemCount,
      isReady:        !!central,
    })
  })

  // ─── Solicitação de exclusão de ferramenta ────────────────────────────────

  // POST /api/v1/deposit/tools/:id/request-delete
  app.post('/tools/:id/request-delete', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const uid = userId(req)
    const { id } = request.params as { id: string }
    const body = request.body as { reason?: string }

    if (!body?.reason?.trim()) {
      return reply.status(400).send({ error: 'Motivo obrigatório para solicitar exclusão.' })
    }

    const item = await p().stockItem.findFirst({
      where: { id, companyId: cid, isActive: true, requiresCustody: true },
    })
    if (!item) return reply.status(404).send({ error: 'Ferramenta não encontrada' })

    // Verifica se já existe uma solicitação pendente
    const existing = await p().toolDeleteRequest.findFirst({
      where: { itemId: id, companyId: cid, status: 'PENDING' },
    })
    if (existing) {
      return reply.status(400).send({ error: 'Já existe uma solicitação pendente para esta ferramenta.' })
    }

    const deleteReq = await p().toolDeleteRequest.create({
      data: {
        companyId:   cid,
        itemId:      id,
        requestedBy: uid!,
        reason:      body.reason.trim(),
        status:      'PENDING',
      },
    })

    // Mudar status para PENDING_DELETE
    await p().stockItem.update({
      where: { id },
      data:  { toolStatus: 'PENDING_DELETE' },
    })

    // Notificar gestores
    await notifyManagers({
      companyId: cid,
      title:     'Solicitação de exclusão de ferramenta',
      message:   `"${item.name}" foi marcada para exclusão. Motivo: ${body.reason.trim()}`,
      type:      'ACTION_REQUIRED',
      link:      '/app/deposito/pendencias',
      excludeUserId: uid ?? undefined,
    })

    return reply.status(201).send({ deleteRequest: deleteReq })
  })

  // GET /api/v1/deposit/tools/delete-requests
  app.get('/tools/delete-requests', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const query = request.query as { status?: string }
    const statusFilter = query.status ?? 'PENDING'

    const requests = await p().toolDeleteRequest.findMany({
      where: { companyId: cid, status: statusFilter },
      include: {
        item:      { select: { id: true, name: true, toolStatus: true, imageUrl: true, serialNumber: true } },
        requestor: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send({ requests })
  })

  // PATCH /api/v1/deposit/tools/delete-requests/:id/approve
  app.patch('/tools/delete-requests/:id/approve', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const uid = userId(req)
    const { id } = request.params as { id: string }
    const body = request.body as { notes?: string }

    const role: string = (req as any).memberRole ?? ''
    if (!['ADMIN', 'OWNER', 'MANAGER'].includes(role)) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Apenas gestores podem aprovar exclusões.' })
    }

    const deleteReq = await p().toolDeleteRequest.findFirst({
      where: { id, companyId: cid, status: 'PENDING' },
      include: { item: true },
    })
    if (!deleteReq) return reply.status(404).send({ error: 'Solicitação não encontrada' })

    const itemId = deleteReq.itemId

    // Verificar se há custódia ativa
    const activeCustody = await p().toolCustody.findFirst({
      where: { stockItemId: itemId, returnedAt: null },
    })
    if (activeCustody) {
      return reply.status(400).send({
        error: 'TOOL_IN_USE',
        message: 'Não é possível excluir uma ferramenta em uso. Solicite a devolução primeiro.',
      })
    }

    await p().$transaction([
      p().toolDeleteRequest.update({
        where: { id },
        data:  { status: 'APPROVED', reviewedBy: uid, reviewNotes: body?.notes ?? null, reviewedAt: new Date() },
      }),
      p().stockBalance.updateMany({
        where: { itemId, companyId: cid },
        data:  { quantity: 0, totalValue: 0 },
      }),
      p().stockItem.update({
        where: { id: itemId },
        data:  { isActive: false, quantity: 0 },
      }),
    ])

    return reply.send({ success: true })
  })

  // PATCH /api/v1/deposit/tools/delete-requests/:id/reject
  app.patch('/tools/delete-requests/:id/reject', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const uid = userId(req)
    const { id } = request.params as { id: string }
    const body = request.body as { notes?: string }

    const role: string = (req as any).memberRole ?? ''
    if (!['ADMIN', 'OWNER', 'MANAGER'].includes(role)) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Apenas gestores podem rejeitar exclusões.' })
    }

    const deleteReq = await p().toolDeleteRequest.findFirst({
      where: { id, companyId: cid, status: 'PENDING' },
      include: { item: true },
    })
    if (!deleteReq) return reply.status(404).send({ error: 'Solicitação não encontrada' })

    await p().$transaction([
      p().toolDeleteRequest.update({
        where: { id },
        data:  { status: 'REJECTED', reviewedBy: uid, reviewNotes: body?.notes ?? null, reviewedAt: new Date() },
      }),
      // Restaurar status da ferramenta
      p().stockItem.update({
        where: { id: deleteReq.itemId },
        data:  { toolStatus: 'AVAILABLE' },
      }),
    ])

    return reply.send({ success: true })
  })

  // POST /api/v1/deposit/items/:id/request-delete  (generalizado: material, EPI, uniforme, ferramenta)
  app.post('/items/:id/request-delete', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const uid = userId(req)
    const { id } = request.params as { id: string }
    const body = request.body as { reason?: string }

    if (!body?.reason?.trim()) {
      return reply.status(400).send({ error: 'Motivo obrigatório para solicitar exclusão.' })
    }

    const item = await p().stockItem.findFirst({
      where: { id, companyId: cid, isActive: true },
    })
    if (!item) return reply.status(404).send({ error: 'Item não encontrado.' })

    const existing = await p().toolDeleteRequest.findFirst({
      where: { itemId: id, companyId: cid, status: 'PENDING' },
    })
    if (existing) {
      return reply.status(400).send({ error: 'Já existe uma solicitação de exclusão pendente para este item.' })
    }

    const deleteReq = await p().toolDeleteRequest.create({
      data: {
        companyId:   cid,
        itemId:      id,
        requestedBy: uid!,
        reason:      body.reason.trim(),
        status:      'PENDING',
      },
    })

    if (item.requiresCustody) {
      await p().stockItem.update({ where: { id }, data: { toolStatus: 'PENDING_DELETE' } })
    }

    const categoryLabel = item.isEpi ? 'EPI'
      : item.isUniform ? 'Uniforme'
      : item.requiresCustody ? 'Ferramenta'
      : 'Material'

    await notifyManagers({
      companyId: cid,
      title:     `Solicitação de exclusão — ${categoryLabel}`,
      message:   `"${item.name}" aguarda aprovação para exclusão. Motivo: ${body.reason.trim()}`,
      type:      'ACTION_REQUIRED',
      link:      '/app/deposito/pendencias',
      excludeUserId: uid ?? undefined,
    })

    return reply.status(201).send({ deleteRequest: deleteReq })
  })

  // ── GET /api/v1/deposit/tools/by-project/:projectId ─────────────────────────
  app.get('/tools/by-project/:projectId', { preHandler }, async (request, reply) => {
    const cid           = companyId(request as RequestWithMember)
    const { projectId } = request.params as any

    // 1. Fonte de verdade: ferramentas atualmente na obra (toolStatus IN_USE + currentProjectId)
    const activeItems = await p().stockItem.findMany({
      where: {
        companyId:        cid,
        isActive:         true,
        requiresCustody:  true,
        currentProjectId: projectId,
        toolStatus:       'IN_USE',
      },
      select: {
        id: true, name: true, code: true,
        serialNumber: true, brand: true, model: true,
        toolType: true, toolStatus: true,
        imageUrl: true, unitCost: true,
        currentLocation: true,
      },
    })

    // 2. Para cada ferramenta ativa, buscar o último romaneio (dados históricos)
    const activeTools = await Promise.all(
      activeItems.map(async (tool: any) => {
        const lastWI = await p().waybillItem.findFirst({
          where: {
            itemId:   tool.id,
            isActive: true,
            waybill: {
              companyId:            cid,
              destinationProjectId: projectId,
              category:             'TOOL',
              status:               { in: ['IN_TRANSIT', 'COMPLETED'] },
            },
          },
          include: {
            waybill: {
              select: {
                id: true, docNumber: true,
                emittedAt: true, status: true,
                receiverEmployee: { select: { name: true } },
                receiverName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        })

        return {
          ...tool,
          allocatedAt: lastWI?.waybill.emittedAt  ?? null,
          returnedAt:  null,                        // IN_USE = ainda na obra
          responsavel: lastWI?.waybill.receiverEmployee?.name
                       ?? lastWI?.waybill.receiverName ?? '—',
          docNumber:   lastWI?.waybill.docNumber   ?? null,
          waybillId:   lastWI?.waybill.id          ?? null,
          source:      'ACTIVE',
        }
      })
    )

    // 3. Ferramentas devolvidas: tiveram romaneio para esta obra mas saíram (AVAILABLE/DAMAGED/MAINTENANCE)
    const returnedItems = await p().stockItem.findMany({
      where: {
        companyId:       cid,
        isActive:        true,
        requiresCustody: true,
        toolStatus:      { in: ['AVAILABLE', 'DAMAGED', 'MAINTENANCE'] },
        waybillItems: {
          some: {
            isActive: true,
            waybill: {
              companyId:            cid,
              destinationProjectId: projectId,
              category:             'TOOL',
              status:               'COMPLETED',
            },
          },
        },
      },
      select: {
        id: true, name: true, code: true,
        serialNumber: true, brand: true, model: true,
        toolType: true, toolStatus: true,
        imageUrl: true, unitCost: true,
      },
    })

    const returnedTools = await Promise.all(
      returnedItems.map(async (tool: any) => {
        const lastWI = await p().waybillItem.findFirst({
          where: {
            itemId: tool.id,
            waybill: {
              companyId:            cid,
              destinationProjectId: projectId,
              category:             'TOOL',
            },
          },
          include: {
            waybill: {
              select: { docNumber: true, emittedAt: true, receivedAt: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        })

        return {
          ...tool,
          allocatedAt: lastWI?.waybill.emittedAt  ?? null,
          returnedAt:  lastWI?.waybill.receivedAt ?? new Date(),
          responsavel: '—',
          docNumber:   lastWI?.waybill.docNumber  ?? null,
          source:      'RETURNED',
        }
      })
    )

    const allTools = [...activeTools, ...returnedTools]

    return reply.send({
      tools:         allTools,
      activeCount:   activeTools.length,
      returnedCount: returnedTools.length,
      totalValue:    activeTools.reduce((s: number, t: any) => s + Number(t.unitCost || 0), 0),
    })
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
