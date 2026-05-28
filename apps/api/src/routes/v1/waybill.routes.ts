import path from 'path'
import fs   from 'fs'
import * as crypto from 'crypto'
import { FastifyInstance } from 'fastify'
import { prisma } from '@sysobra/database'
import {
  authenticate,
  requireCompany,
  RequestWithMember,
  JwtPayload,
} from '../../middlewares/auth.middleware'
import { createAuditLog } from '../../utils/audit'
import { generatePdf }    from '../../utils/pdf'

// ─── helpers ─────────────────────────────────────────────────────────────────

function p() { return prisma as any }

function cid(req: RequestWithMember) { return req.companyId }
function uid(request: any): string | null {
  try { return (request.user as JwtPayload).sub } catch { return null }
}

// Busca nome do usuário no banco (JWT não carrega name)
async function getUserName(userId: string | null): Promise<string | null> {
  if (!userId) return null
  try {
    const user = await p().user.findUnique({ where: { id: userId }, select: { name: true } })
    return user?.name ?? null
  } catch { return null }
}

// Gera número sequencial do romaneio: ROM-MAT-2025-0001
async function generateDocNumber(companyId: string, category: string): Promise<string> {
  const prefix = category === 'MATERIAL'   ? 'ROM-MAT'
               : category === 'TOOL'       ? 'ROM-FER'
               : category === 'EPI_UNIFORM'? 'ROM-EPI'
               : 'ROM'
  const year  = new Date().getFullYear()
  const count = await p().waybill.count({
    where: {
      companyId,
      category,
      status: { not: 'DRAFT' },
      createdAt: {
        gte: new Date(`${year}-01-01T00:00:00.000Z`),
        lte: new Date(`${year}-12-31T23:59:59.999Z`),
      },
    },
  })
  return `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`
}

// Salva imagem base64 em disco e retorna a URL relativa
function saveSignatureImage(
  base64: string,
  companyId: string,
  suffix: string,
): string {
  const uploadsRoot = process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads')
  const dir = path.join(uploadsRoot, 'waybills', companyId)
  fs.mkdirSync(dir, { recursive: true })
  const filename = `${Date.now()}-${suffix}.png`
  const buffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
  fs.writeFileSync(path.join(dir, filename), buffer)
  return `/uploads/waybills/${companyId}/${filename}`
}

// ─── HELPER: baixar estoque ───────────────────────────────────────────────────
// Decrementa StockBalance e registra StockMovement para cada item do romaneio.
// Lança erro se saldo insuficiente.

async function baixarEstoque(
  waybillId:  string,
  locationId: string,
  companyId:  string,
  docNumber:  string,
): Promise<void> {
  const items = await p().waybillItem.findMany({
    where: { waybillId, isActive: true },
  })

  for (const item of items) {
    const balance = await p().stockBalance.findFirst({
      where: { itemId: item.itemId, locationId, companyId },
    })

    const available = Math.max(0, Number(balance?.quantity ?? 0) - Number(balance?.reservedQty ?? 0))
    if (available < Number(item.requestedQty)) {
      const stockItem = await p().stockItem.findUnique({
        where: { id: item.itemId },
        select: { name: true },
      })
      throw new Error(
        `Saldo insuficiente para "${stockItem?.name ?? item.itemId}". ` +
        `Disponível: ${available}, necessário: ${Number(item.requestedQty)}`,
      )
    }

    // Decrementa saldo
    await p().stockBalance.updateMany({
      where: { itemId: item.itemId, locationId, companyId },
      data:  { quantity: { decrement: Number(item.requestedQty) } },
    })

    // Registra movimento de saída
    await p().stockMovement.create({
      data: {
        companyId,
        stockItemId: item.itemId,
        locationId,
        type:        'OUT',
        quantity:    Number(item.requestedQty),
        unitCost:    Number(item.unitCost),
        totalCost:   Number(item.totalCost),
        docNumber,
        notes:       `Saída via romaneio ${docNumber}`,
      },
    })
  }
}

// ─── ROTAS AUTENTICADAS ───────────────────────────────────────────────────────

export async function waybillRoutes(app: FastifyInstance) {
  const preHandler = [authenticate, requireCompany]

  // ── CRIAR ROMANEIO (ou rascunho) ──────────────────────────────────────────
  // POST /api/v1/waybill
  app.post('/', { preHandler }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = cid(req)
    const userId    = uid(request)
    const body      = request.body as any

    // Validar categoria
    const validCategories = ['MATERIAL', 'TOOL', 'EPI_UNIFORM']
    if (!validCategories.includes(body.category)) {
      return reply.status(400).send({
        error: 'INVALID_CATEGORY',
        message: 'Categoria deve ser MATERIAL, TOOL ou EPI_UNIFORM',
      })
    }
    if (!body.locationId) {
      return reply.status(400).send({ error: 'locationId é obrigatório' })
    }

    // Verificar local
    const location = await p().stockLocation.findFirst({
      where: { id: body.locationId, companyId, isActive: true },
    })
    if (!location) {
      return reply.status(404).send({ error: 'Local de estoque não encontrado' })
    }

    const isDraft   = !body.status || body.status === 'DRAFT'
    const exitType  = body.exitType || 'DIRECT_PICKUP'
    const senderName = await getUserName(userId)
    const docNumber  = isDraft ? `RASCUNHO-${Date.now()}` : await generateDocNumber(companyId, body.category)

    // Criar romaneio
    const waybill = await p().waybill.create({
      data: {
        companyId,
        docNumber,
        category:               body.category,
        status:                 isDraft ? 'DRAFT' : 'EMITTED',
        exitType,
        locationId:             body.locationId,
        destinationProjectId:   body.destinationProjectId  ?? null,
        destinationName:        body.destinationName        ?? null,
        driverType:             body.driverType             ?? null,
        driverEmployeeId:       body.driverEmployeeId       ?? null,
        driverName:             body.driverName             ?? null,
        driverDocument:         body.driverDocument         ?? null,
        driverPhone:            body.driverPhone            ?? null,
        vehiclePlate:           body.vehiclePlate           ?? null,
        vehicleModel:           body.vehicleModel           ?? null,
        receiverType:           body.receiverType           ?? null,
        receiverEmployeeId:     body.receiverEmployeeId     ?? null,
        receiverName:           body.receiverName           ?? null,
        receiverDocument:       body.receiverDocument       ?? null,
        receiverPhone:          body.receiverPhone          ?? null,
        receiverRole:           body.receiverRole           ?? null,
        senderUserId:           userId,
        senderName,
        notes:                  body.notes                  ?? null,
        emittedAt:              isDraft ? null : new Date(),
        isActive:               true,
      },
    })

    // Adicionar itens
    if (Array.isArray(body.items) && body.items.length > 0) {
      for (const item of body.items) {
        const stockItem = await p().stockItem.findFirst({
          where: { id: item.itemId, companyId, isActive: true },
        })
        if (!stockItem) continue

        const unitCost  = Number(stockItem.averageCost ?? 0)
        const totalCost = Number(item.quantity) * unitCost

        await p().waybillItem.create({
          data: {
            waybillId:    waybill.id,
            itemId:       item.itemId,
            requestedQty: Number(item.quantity),
            unitCost,
            totalCost,
            serialNumber:  item.serialNumber  ?? stockItem.serialNumber ?? null,
            toolBrand:     item.toolBrand     ?? stockItem.brand        ?? null,
            toolModel:     item.toolModel     ?? stockItem.model        ?? null,
            toolCondition: item.toolCondition ?? null,
            status:        'OK',
            isActive:      true,
          },
        })
      }
    }

    // Se não for rascunho: baixar estoque e atualizar status
    if (!isDraft) {
      try {
        await baixarEstoque(waybill.id, body.locationId, companyId, docNumber)
      } catch (e: any) {
        // Rollback: apagar romaneio recém-criado
        await p().waybillItem.deleteMany({ where: { waybillId: waybill.id } })
        await p().waybill.delete({ where: { id: waybill.id } })
        return reply.status(400).send({ error: 'INSUFFICIENT_STOCK', message: e.message })
      }

      const newStatus = exitType === 'DIRECT_PICKUP' ? 'COMPLETED' : 'IN_TRANSIT'
      await p().waybill.update({
        where: { id: waybill.id },
        data:  {
          status:       newStatus,
          dispatchedAt: new Date(),
          ...(newStatus === 'COMPLETED' && { receivedAt: new Date() }),
        },
      })
    }

    await createAuditLog({
      prisma: p(), companyId, userId,
      action: 'CREATE', module: 'DEPOSIT',
      entity: 'Waybill', entityId: waybill.id,
      description: isDraft
        ? `Rascunho de romaneio criado (${body.category})`
        : `Romaneio emitido: ${docNumber}`,
      request,
    })

    const full = await p().waybill.findFirst({
      where:   { id: waybill.id },
      include: {
        items:              { include: { item: true } },
        location:           { select: { id: true, name: true, type: true } },
        destinationProject: { select: { id: true, name: true } },
        driverEmployee:     { select: { id: true, name: true, code: true } },
        receiverEmployee:   { select: { id: true, name: true, code: true } },
      },
    })

    return reply.status(201).send(full)
  })

  // ── LISTAR ROMANEIOS ─────────────────────────────────────────────────────
  // GET /api/v1/waybill?category=MATERIAL&status=IN_TRANSIT&locationId=&page=1&limit=20
  app.get('/', { preHandler }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = cid(req)
    const { category, status, locationId, page = '1', limit = '20' } = request.query as any

    const where: any = {
      companyId,
      isActive: true,
      ...(category   && { category }),
      ...(status     && { status }),
      ...(locationId && { locationId }),
    }

    const [waybills, total] = await Promise.all([
      p().waybill.findMany({
        where,
        include: {
          items: {
            where:   { isActive: true },
            include: { item: { select: { id: true, name: true, unit: true, category: true } } },
          },
          location:           { select: { id: true, name: true, type: true } },
          destinationProject: { select: { id: true, name: true } },
          driverEmployee:     { select: { id: true, name: true } },
          receiverEmployee:   { select: { id: true, name: true } },
          pendencies:         { where: { status: 'OPEN', isActive: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip:    (Number(page) - 1) * Number(limit),
        take:    Number(limit),
      }),
      p().waybill.count({ where }),
    ])

    return reply.send({
      waybills,
      total,
      page:       Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    })
  })

  // ── BUSCAR ROMANEIO POR ID ───────────────────────────────────────────────
  // GET /api/v1/waybill/:id
  app.get('/:id', { preHandler }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = cid(req)
    const { id }    = request.params as any

    const waybill = await p().waybill.findFirst({
      where:   { id, companyId, isActive: true },
      include: {
        items: {
          where:   { isActive: true },
          include: { item: true },
        },
        location:           true,
        destinationProject: true,
        driverEmployee:     { select: { id: true, name: true, code: true, role: true } },
        receiverEmployee:   { select: { id: true, name: true, code: true, role: true } },
        pendencies: {
          where:   { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!waybill) return reply.status(404).send({ error: 'Romaneio não encontrado' })

    return reply.send(waybill)
  })

  // ── ATUALIZAR RASCUNHO ───────────────────────────────────────────────────
  // PUT /api/v1/waybill/:id
  app.put('/:id', { preHandler }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = cid(req)
    const { id }    = request.params as any
    const body      = request.body as any

    const waybill = await p().waybill.findFirst({ where: { id, companyId, isActive: true } })
    if (!waybill) return reply.status(404).send({ error: 'Romaneio não encontrado' })
    if (waybill.status !== 'DRAFT') {
      return reply.status(400).send({ error: 'CANNOT_EDIT', message: 'Apenas rascunhos podem ser editados' })
    }

    await p().waybill.update({
      where: { id },
      data:  {
        destinationProjectId: body.destinationProjectId ?? waybill.destinationProjectId,
        destinationName:      body.destinationName      ?? waybill.destinationName,
        exitType:             body.exitType             ?? waybill.exitType,
        driverType:           body.driverType           ?? waybill.driverType,
        driverEmployeeId:     body.driverEmployeeId     ?? waybill.driverEmployeeId,
        driverName:           body.driverName           ?? waybill.driverName,
        driverDocument:       body.driverDocument       ?? waybill.driverDocument,
        driverPhone:          body.driverPhone          ?? waybill.driverPhone,
        vehiclePlate:         body.vehiclePlate         ?? waybill.vehiclePlate,
        vehicleModel:         body.vehicleModel         ?? waybill.vehicleModel,
        receiverType:         body.receiverType         ?? waybill.receiverType,
        receiverEmployeeId:   body.receiverEmployeeId   ?? waybill.receiverEmployeeId,
        receiverName:         body.receiverName         ?? waybill.receiverName,
        receiverDocument:     body.receiverDocument     ?? waybill.receiverDocument,
        receiverPhone:        body.receiverPhone        ?? waybill.receiverPhone,
        receiverRole:         body.receiverRole         ?? waybill.receiverRole,
        notes:                body.notes                ?? waybill.notes,
      },
    })

    // Substituir itens se vieram no body
    if (Array.isArray(body.items)) {
      await p().waybillItem.deleteMany({ where: { waybillId: id } })

      for (const item of body.items) {
        const stockItem = await p().stockItem.findFirst({
          where: { id: item.itemId, companyId, isActive: true },
        })
        if (!stockItem) continue

        const unitCost  = Number(stockItem.averageCost ?? 0)
        const totalCost = Number(item.quantity) * unitCost

        await p().waybillItem.create({
          data: {
            waybillId:    id,
            itemId:       item.itemId,
            requestedQty: Number(item.quantity),
            unitCost,
            totalCost,
            serialNumber:  item.serialNumber  ?? stockItem.serialNumber ?? null,
            toolBrand:     item.toolBrand     ?? stockItem.brand        ?? null,
            toolModel:     item.toolModel     ?? stockItem.model        ?? null,
            toolCondition: item.toolCondition ?? null,
            status:        'OK',
            isActive:      true,
          },
        })
      }
    }

    const updated = await p().waybill.findFirst({
      where:   { id },
      include: { items: { include: { item: true } } },
    })
    return reply.send(updated)
  })

  // ── EMITIR RASCUNHO → EMITIDO/IN_TRANSIT/COMPLETED ──────────────────────
  // PATCH /api/v1/waybill/:id/emit
  app.patch('/:id/emit', { preHandler }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = cid(req)
    const userId    = uid(request)
    const { id }    = request.params as any

    const waybill = await p().waybill.findFirst({
      where:   { id, companyId, isActive: true },
      include: { items: { where: { isActive: true } } },
    })
    if (!waybill)              return reply.status(404).send({ error: 'Não encontrado' })
    if (waybill.status !== 'DRAFT') {
      return reply.status(400).send({ error: 'Apenas rascunhos podem ser emitidos' })
    }
    if (!waybill.items.length) {
      return reply.status(400).send({ error: 'Adicione ao menos um item antes de emitir' })
    }

    const docNumber = await generateDocNumber(companyId, waybill.category)

    try {
      await baixarEstoque(id, waybill.locationId, companyId, docNumber)
    } catch (e: any) {
      return reply.status(400).send({ error: 'INSUFFICIENT_STOCK', message: e.message })
    }

    const newStatus = waybill.exitType === 'DIRECT_PICKUP' ? 'COMPLETED' : 'IN_TRANSIT'

    await p().waybill.update({
      where: { id },
      data:  {
        docNumber,
        status:       newStatus,
        emittedAt:    new Date(),
        dispatchedAt: new Date(),
        ...(newStatus === 'COMPLETED' && { receivedAt: new Date() }),
      },
    })

    await createAuditLog({
      prisma: p(), companyId, userId,
      action: 'UPDATE', module: 'DEPOSIT',
      entity: 'Waybill', entityId: id,
      description: `Romaneio emitido: ${docNumber} — ${waybill.category}`,
      request,
    })

    return reply.send({ success: true, docNumber, status: newStatus })
  })

  // ── GERAR LINK DE ASSINATURA REMOTA ─────────────────────────────────────
  // POST /api/v1/waybill/:id/signature-link
  app.post('/:id/signature-link', { preHandler }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = cid(req)
    const { id }    = request.params as any

    const waybill = await p().waybill.findFirst({ where: { id, companyId, isActive: true } })
    if (!waybill) return reply.status(404).send({ error: 'Não encontrado' })
    if (!['IN_TRANSIT', 'EMITTED'].includes(waybill.status)) {
      return reply.status(400).send({
        error:   'INVALID_STATUS',
        message: 'Apenas romaneios emitidos ou em trânsito podem gerar link de assinatura',
      })
    }

    const token     = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 h

    await p().waybill.update({
      where: { id },
      data:  { signatureToken: token, signatureTokenExpiresAt: expiresAt },
    })

    const baseUrl = process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000'
    const link    = `${baseUrl}/assinar-romaneio/${token}`

    return reply.send({ link, token, expiresAt, message: 'Link válido por 48 horas' })
  })

  // ── ASSINAR COMO EXPEDIDOR (autenticado) ─────────────────────────────────
  // PATCH /api/v1/waybill/:id/sign-sender
  app.patch('/:id/sign-sender', { preHandler }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = cid(req)
    const userId    = uid(request)
    const { id }    = request.params as any
    const body      = request.body as any

    const waybill = await p().waybill.findFirst({ where: { id, companyId, isActive: true } })
    if (!waybill) return reply.status(404).send({ error: 'Não encontrado' })

    let signatureUrl: string | null = null
    if (body.signature) {
      signatureUrl = saveSignatureImage(body.signature, companyId, 'sender-signature')
    }

    const senderName = await getUserName(userId)

    await p().waybill.update({
      where: { id },
      data:  {
        senderSignatureUrl: signatureUrl,
        senderSignedAt:     new Date(),
        senderName:         senderName ?? undefined,
        senderUserId:       userId ?? undefined,
      },
    })

    return reply.send({ success: true })
  })

  // ── ASSINAR COMO RECEBEDOR (autenticado — via app) ───────────────────────
  // PATCH /api/v1/waybill/:id/sign-receiver
  app.patch('/:id/sign-receiver', { preHandler }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = cid(req)
    const { id }    = request.params as any
    const body      = request.body as any

    const waybill = await p().waybill.findFirst({
      where:   { id, companyId, isActive: true },
      include: { items: { where: { isActive: true } } },
    })
    if (!waybill) return reply.status(404).send({ error: 'Não encontrado' })
    if (!['IN_TRANSIT', 'EMITTED', 'COMPLETED'].includes(waybill.status)) {
      return reply.status(400).send({ error: 'Este romaneio não aguarda assinatura' })
    }

    const result = await processarAssinaturaRecebedor(waybill, body)

    await p().waybill.update({
      where: { id },
      data:  result.waybillUpdate,
    })

    if (result.pendencies.length > 0) {
      await p().waybillPendency.createMany({ data: result.pendencies })
    }

    return reply.send({
      success:          true,
      hasPendency:      result.hasPendency,
      pendenciesCount:  result.pendencies.length,
      message: result.hasPendency
        ? `Romaneio concluído com ${result.pendencies.length} pendência(s).`
        : 'Romaneio concluído com sucesso!',
    })
  })

  // ── ASSINAR COMO MOTORISTA (autenticado) ─────────────────────────────────
  // PATCH /api/v1/waybill/:id/sign-driver
  app.patch('/:id/sign-driver', { preHandler }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = cid(req)
    const { id }    = request.params as any
    const body      = request.body as any

    const waybill = await p().waybill.findFirst({ where: { id, companyId, isActive: true } })
    if (!waybill) return reply.status(404).send({ error: 'Não encontrado' })

    let signatureUrl: string | null = null
    if (body.signature) {
      signatureUrl = saveSignatureImage(body.signature, companyId, 'driver-signature')
    }

    await p().waybill.update({
      where: { id },
      data:  {
        driverSignatureUrl: signatureUrl,
        driverSignedAt:     new Date(),
      },
    })

    return reply.send({ success: true, signatureUrl })
  })

  // ── CANCELAR ROMANEIO ────────────────────────────────────────────────────
  // PATCH /api/v1/waybill/:id/cancel
  app.patch('/:id/cancel', { preHandler }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = cid(req)
    const userId    = uid(request)
    const { id }    = request.params as any
    const body      = request.body as any

    const waybill = await p().waybill.findFirst({
      where:   { id, companyId, isActive: true },
      include: { items: { where: { isActive: true } } },
    })
    if (!waybill) return reply.status(404).send({ error: 'Não encontrado' })

    if (['COMPLETED', 'CANCELLED'].includes(waybill.status)) {
      return reply.status(400).send({ error: 'Romaneio já concluído ou cancelado' })
    }

    // Se estoque foi baixado: devolver
    if (['IN_TRANSIT', 'EMITTED'].includes(waybill.status)) {
      for (const item of waybill.items) {
        await p().stockBalance.updateMany({
          where: { itemId: item.itemId, locationId: waybill.locationId, companyId },
          data:  { quantity: { increment: Number(item.requestedQty) } },
        })
      }
    }

    await p().waybill.update({
      where: { id },
      data:  { status: 'CANCELLED', notes: body.reason ?? waybill.notes },
    })

    await createAuditLog({
      prisma: p(), companyId, userId,
      action: 'UPDATE', module: 'DEPOSIT',
      entity: 'Waybill', entityId: id,
      description: `Romaneio cancelado: ${waybill.docNumber} — ${body.reason || 'sem motivo'}`,
      request,
    })

    return reply.send({ success: true })
  })

  // ── GERAR PDF DO ROMANEIO ─────────────────────────────────────────────────
  // GET /api/v1/waybill/:id/pdf
  app.get('/:id/pdf', { preHandler }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = cid(req)
    const { id }    = request.params as any

    const waybill = await p().waybill.findFirst({
      where:   { id, companyId, isActive: true },
      include: {
        items: {
          where:   { isActive: true },
          include: { item: { select: { id: true, name: true, unit: true, code: true } } },
        },
        location:           { select: { id: true, name: true, type: true } },
        destinationProject: { select: { id: true, name: true } },
        driverEmployee:     { select: { id: true, name: true } },
        receiverEmployee:   { select: { id: true, name: true } },
        pendencies:         { where: { isActive: true, status: 'OPEN' } },
      },
    })

    if (!waybill) return reply.status(404).send({ error: 'Romaneio não encontrado' })

    const company = await p().company.findUnique({
      where:  { id: companyId },
      select: { name: true, cnpj: true },
    })

    const [senderSigB64, driverSigB64, receiverSigB64] = await Promise.all([
      waybill.senderSignatureUrl   ? urlToBase64(waybill.senderSignatureUrl)   : Promise.resolve(null),
      waybill.driverSignatureUrl   ? urlToBase64(waybill.driverSignatureUrl)   : Promise.resolve(null),
      waybill.receiverSignatureUrl ? urlToBase64(waybill.receiverSignatureUrl) : Promise.resolve(null),
    ])

    const html = gerarHtmlRomaneio({ waybill, company, senderSigB64, driverSigB64, receiverSigB64 })
    const pdfBuffer = await generatePdf({ kind: 'raw', html })

    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `attachment; filename="romaneio-${waybill.docNumber}.pdf"`)
    return reply.send(pdfBuffer)
  })

  // ── LISTAR PENDÊNCIAS DE UM ROMANEIO ─────────────────────────────────────
  // GET /api/v1/waybill/:id/pendencies
  app.get('/:id/pendencies', { preHandler }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = cid(req)
    const { id }    = request.params as any

    const pendencies = await p().waybillPendency.findMany({
      where:   { waybillId: id, companyId, isActive: true },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send(pendencies)
  })

  // ── RESOLVER PENDÊNCIA ───────────────────────────────────────────────────
  // PATCH /api/v1/waybill/pendencies/:pendencyId/resolve
  app.patch('/pendencies/:pendencyId/resolve', { preHandler }, async (request, reply) => {
    const userId        = uid(request)
    const { pendencyId } = request.params as any
    const body          = request.body as any

    await p().waybillPendency.update({
      where: { id: pendencyId },
      data:  {
        status:          'RESOLVED',
        resolvedAt:      new Date(),
        resolvedBy:      userId,
        resolutionNotes: body.notes ?? null,
      },
    })

    return reply.send({ success: true })
  })
}

// ─── ROTAS PÚBLICAS (sem autenticação) ───────────────────────────────────────
// Registrar em server.ts com prefix '/api/v1/waybill' para manter consistência

export async function waybillPublicRoutes(app: FastifyInstance) {

  // ── CONSULTAR ROMANEIO PELO TOKEN DE ASSINATURA ──────────────────────────
  // GET /api/v1/waybill/public/sign/:token
  // Usado pela página /assinar-romaneio/[token] para carregar os dados
  app.get('/public/sign/:token', async (request, reply) => {
    const { token } = request.params as any

    const waybill = await p().waybill.findFirst({
      where: {
        signatureToken:          token,
        isActive:                true,
        signatureTokenExpiresAt: { gt: new Date() },
      },
      include: {
        items: {
          where:   { isActive: true },
          include: { item: { select: { id: true, name: true, unit: true } } },
        },
        location:           { select: { id: true, name: true } },
        destinationProject: { select: { id: true, name: true } },
      },
    })

    if (!waybill) {
      return reply.status(404).send({ error: 'Link inválido ou expirado' })
    }
    if (waybill.status === 'COMPLETED') {
      return reply.status(400).send({ error: 'Este romaneio já foi assinado' })
    }

    return reply.send({
      waybill: {
        id:                 waybill.id,
        docNumber:          waybill.docNumber,
        category:           waybill.category,
        status:             waybill.status,
        exitType:           waybill.exitType,
        location:           waybill.location,
        destinationProject: waybill.destinationProject,
        destinationName:    waybill.destinationName,
        driverName:         waybill.driverName,
        driverType:         waybill.driverType,
        receiverName:       waybill.receiverName,
        senderName:         waybill.senderName,
        notes:              waybill.notes,
        emittedAt:          waybill.emittedAt,
        items: waybill.items.map((i: any) => ({
          id:           i.id,
          itemName:     i.item.name,
          unit:         i.item.unit,
          requestedQty: Number(i.requestedQty),
          serialNumber: i.serialNumber,
          toolBrand:    i.toolBrand,
          toolModel:    i.toolModel,
          toolCondition: i.toolCondition,
          status:       i.status,
        })),
      },
    })
  })

  // ── ASSINAR VIA LINK PÚBLICO ─────────────────────────────────────────────
  // POST /api/v1/waybill/public/sign/:token
  // Chamado pelo recebedor na página pública
  app.post('/public/sign/:token', async (request, reply) => {
    const { token } = request.params as any
    const body      = request.body as any

    const waybill = await p().waybill.findFirst({
      where: {
        signatureToken:          token,
        isActive:                true,
        signatureTokenExpiresAt: { gt: new Date() },
      },
      include: { items: { where: { isActive: true } } },
    })

    if (!waybill) {
      return reply.status(404).send({ error: 'Link inválido ou expirado' })
    }
    if (waybill.status !== 'IN_TRANSIT') {
      return reply.status(400).send({ error: 'Este romaneio não aguarda assinatura' })
    }

    const result = await processarAssinaturaRecebedor(waybill, body)

    await p().waybill.update({
      where: { id: waybill.id },
      data:  {
        ...result.waybillUpdate,
        // Invalidar token após uso
        signatureToken:          null,
        signatureTokenExpiresAt: null,
      },
    })

    if (result.pendencies.length > 0) {
      await p().waybillPendency.createMany({ data: result.pendencies })
    }

    return reply.send({
      success:         true,
      hasPendency:     result.hasPendency,
      pendenciesCount: result.pendencies.length,
      message: result.hasPendency
        ? `Romaneio concluído com ${result.pendencies.length} pendência(s). O gestor foi notificado.`
        : 'Romaneio concluído com sucesso!',
    })
  })
}

// ─── HELPER: processar assinatura do recebedor ────────────────────────────────
// Compartilhado entre a rota autenticada e a rota pública.

async function processarAssinaturaRecebedor(waybill: any, body: any) {
  // Salvar assinatura
  let signatureUrl: string | null = null
  if (body.signature) {
    signatureUrl = saveSignatureImage(body.signature, waybill.companyId, 'receiver-signature')
  }

  // Processar itens e detectar pendências
  const pendencies: any[] = []
  let hasPendency = false

  if (Array.isArray(body.items)) {
    for (const itemData of body.items) {
      const waybillItem = waybill.items.find((i: any) => i.id === itemData.id)
      if (!waybillItem) continue

      const receivedQty  = Number(itemData.receivedQty ?? waybillItem.requestedQty)
      const requestedQty = Number(waybillItem.requestedQty)
      const pendingQty   = requestedQty - receivedQty

      await p().waybillItem.update({
        where: { id: itemData.id },
        data:  {
          receivedQty,
          pendingQty:    pendingQty > 0 ? pendingQty : 0,
          receiverNotes: itemData.notes  ?? null,
          status:        itemData.status ?? (pendingQty > 0 ? 'MISSING' : 'OK'),
        },
      })

      // Criar pendência se houver divergência
      if (pendingQty > 0 || itemData.status === 'DAMAGED') {
        hasPendency = true
        const stockItem = await p().stockItem.findUnique({
          where:  { id: waybillItem.itemId },
          select: { name: true },
        })

        pendencies.push({
          companyId:        waybill.companyId,
          waybillId:        waybill.id,
          waybillItemId:    itemData.id,
          type:             itemData.status === 'DAMAGED' ? 'DAMAGED' : 'MISSING_ITEM',
          description:      itemData.status === 'DAMAGED'
            ? `Item danificado: ${stockItem?.name ?? waybillItem.itemId}`
            : `Quantidade divergente: ${stockItem?.name ?? waybillItem.itemId} — esperado ${requestedQty}, recebido ${receivedQty}`,
          itemName:         stockItem?.name ?? null,
          quantityExpected: requestedQty,
          quantityReceived: receivedQty,
          status:           'OPEN',
          isActive:         true,
        })

        // Devolver ao estoque a quantidade faltante
        if (pendingQty > 0) {
          await p().stockBalance.updateMany({
            where: { itemId: waybillItem.itemId, locationId: waybill.locationId, companyId: waybill.companyId },
            data:  { quantity: { increment: pendingQty } },
          })
        }
      }
    }
  }

  const waybillUpdate: any = {
    status:              'COMPLETED',
    receiverSignatureUrl: signatureUrl,
    receiverSignedAt:    new Date(),
    receiverNotes:       body.notes ?? null,
    hasPendency,
    receivedAt:          new Date(),
  }
  if (body.receiverName)     waybillUpdate.receiverName     = body.receiverName
  if (body.receiverDocument) waybillUpdate.receiverDocument = body.receiverDocument

  return { waybillUpdate, pendencies, hasPendency }
}

// ─── HELPER: converter arquivo de assinatura para base64 (embed no Puppeteer) ──
async function urlToBase64(filePath: string): Promise<string | null> {
  try {
    const uploadsRoot  = process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads')
    const relativePath = filePath.replace(/^\/uploads\//, '')
    const absolutePath = path.join(uploadsRoot, relativePath)
    if (!fs.existsSync(absolutePath)) return null
    const buffer = fs.readFileSync(absolutePath)
    const ext    = path.extname(absolutePath).toLowerCase()
    const mime   = ext === '.png' ? 'image/png' : 'image/jpeg'
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch { return null }
}

// ─── HELPER: gerar HTML do romaneio para PDF ──────────────────────────────────

function gerarHtmlRomaneio({
  waybill,
  company,
  senderSigB64   = null,
  driverSigB64   = null,
  receiverSigB64 = null,
}: {
  waybill:         any
  company:         any
  senderSigB64?:   string | null
  driverSigB64?:   string | null
  receiverSigB64?: string | null
}): string {
  const fmtDate = (d: any) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
  const fmtQty  = (n: any) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })

  const CAT_LABELS: Record<string, string> = {
    MATERIAL:    'Materiais',
    TOOL:        'Ferramentário',
    EPI_UNIFORM: 'EPIs e Uniformes',
  }
  const STATUS_LABELS: Record<string, string> = {
    DRAFT:      'Rascunho',
    EMITTED:    'Emitido',
    IN_TRANSIT: 'Em Trânsito',
    COMPLETED:  'Concluído',
    CANCELLED:  'Cancelado',
  }
  const STATUS_COLORS: Record<string, string> = {
    DRAFT:      '#6B7280',
    EMITTED:    '#D97706',
    IN_TRANSIT: '#2563EB',
    COMPLETED:  '#16A34A',
    CANCELLED:  '#DC2626',
  }

  const itemRows = (waybill.items ?? []).map((wi: any, i: number) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#F9FAFB'};">
      <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #F3F4F6;">${wi.item?.code ?? '—'}</td>
      <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #F3F4F6;">${wi.item?.name ?? wi.itemId}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:center;border-bottom:1px solid #F3F4F6;">${wi.item?.unit ?? '—'}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;font-weight:600;border-bottom:1px solid #F3F4F6;">${fmtQty(wi.requestedQty)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;border-bottom:1px solid #F3F4F6;">${wi.receivedQty != null ? fmtQty(wi.receivedQty) : '—'}</td>
      <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #F3F4F6;">${wi.serialNumber ?? '—'}</td>
      <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #F3F4F6;">${wi.toolCondition ?? '—'}</td>
    </tr>
  `).join('')

  const signatureBlock = (label: string, sigB64: string | null, name: string | null, date: any, pending = false) => `
    <div style="flex:1;min-width:180px;text-align:center;padding:16px 12px;border:1px solid #E5E7EB;border-radius:8px;">
      <div style="font-size:11px;color:#6B7280;margin-bottom:8px;font-weight:600;">${label}</div>
      ${sigB64
        ? `<img src="${sigB64}" style="max-height:70px;max-width:200px;object-fit:contain;margin:0 auto 6px;display:block;" />`
        : `<div style="width:160px;height:70px;border-bottom:1px solid #374151;margin:0 auto;"></div>`
      }
      <div style="font-size:11px;color:#374151;margin-top:6px;">${name ?? '________________________'}</div>
      ${date  ? `<div style="font-size:10px;color:#9CA3AF;margin-top:2px;">${fmtDate(date)}</div>` : ''}
      ${pending && !sigB64 ? `<div style="font-size:10px;color:#D97706;margin-top:4px;">⏳ Pendente assinatura</div>` : ''}
    </div>
  `

  const pendencyRows = (waybill.pendencies ?? []).map((pd: any) => `
    <tr>
      <td style="padding:6px 10px;font-size:11px;border-bottom:1px solid #F3F4F6;color:#DC2626;">⚠ ${pd.description}</td>
      <td style="padding:6px 10px;font-size:11px;text-align:center;border-bottom:1px solid #F3F4F6;">${pd.status === 'RESOLVED' ? '✓ Resolvida' : 'Em aberto'}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Romaneio ${waybill.docNumber}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; color:#111827; font-size:13px; line-height:1.5; }
    @page { size:A4; margin:0; }
    .header { background:#111827; color:#fff; padding:20px 36px; display:flex; align-items:center; justify-content:space-between; }
    .body { padding:24px 36px; }
    .section { margin-bottom:20px; }
    .section-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#6B7280; margin-bottom:8px; padding-bottom:4px; border-bottom:1px solid #E5E7EB; }
    .info-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
    .info-item label { display:block; font-size:10px; color:#9CA3AF; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; }
    .info-item span  { display:block; font-size:12px; color:#111827; font-weight:500; margin-top:2px; }
    table { width:100%; border-collapse:collapse; }
    thead tr { background:#F3F4F6; }
    th { padding:8px 10px; text-align:left; font-size:11px; font-weight:700; color:#374151; border-bottom:2px solid #E5E7EB; }
    .right { text-align:right; }
    .center { text-align:center; }
    .badge { display:inline-block; padding:2px 8px; border-radius:99px; font-size:10px; font-weight:700; }
    .no-break { page-break-inside: avoid; }
  </style>
</head>
<body>
  <!-- ── HEADER ── -->
  <div class="header">
    <div>
      <div style="font-size:18px;font-weight:800;letter-spacing:2px;">SYS<span style="color:#F5A623;">OBRA</span></div>
      <div style="font-size:11px;color:#9CA3AF;margin-top:2px;">${company?.name ?? ''}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:14px;font-weight:700;color:#F5A623;">ROMANEIO</div>
      <div style="font-size:18px;font-weight:800;">${waybill.docNumber}</div>
      <div style="margin-top:4px;">
        <span class="badge" style="background:${STATUS_COLORS[waybill.status] ?? '#6B7280'};color:#fff;">
          ${STATUS_LABELS[waybill.status] ?? waybill.status}
        </span>
      </div>
    </div>
  </div>

  <!-- ── BODY ── -->
  <div class="body">

    <!-- Informações principais -->
    <div class="section">
      <div class="section-title">Informações do Romaneio</div>
      <div class="info-grid">
        <div class="info-item"><label>Categoria</label><span>${CAT_LABELS[waybill.category] ?? waybill.category}</span></div>
        <div class="info-item"><label>Tipo de Saída</label><span>${waybill.exitType === 'DIRECT_PICKUP' ? 'Retirada Direta' : 'Entrega por Motorista'}</span></div>
        <div class="info-item"><label>Almoxarifado</label><span>${waybill.location?.name ?? '—'}</span></div>
        <div class="info-item"><label>Destino</label><span>${waybill.destinationProject?.name ?? waybill.destinationName ?? '—'}</span></div>
        <div class="info-item"><label>Emitido em</label><span>${fmtDate(waybill.emittedAt)}</span></div>
        <div class="info-item"><label>Expedidor</label><span>${waybill.senderName ?? '—'}</span></div>
      </div>
    </div>

    <!-- Motorista / Recebedor -->
    <div class="section">
      <div class="section-title">Motorista / Recebedor</div>
      <div class="info-grid">
        ${waybill.driverName ? `<div class="info-item"><label>Motorista</label><span>${waybill.driverName}</span></div>` : ''}
        ${waybill.vehiclePlate ? `<div class="info-item"><label>Placa</label><span>${waybill.vehiclePlate}${waybill.vehicleModel ? ` — ${waybill.vehicleModel}` : ''}</span></div>` : ''}
        <div class="info-item"><label>Recebedor</label><span>${waybill.receiverName ?? waybill.receiverEmployee?.name ?? '—'}</span></div>
        ${waybill.receiverDocument ? `<div class="info-item"><label>Documento</label><span>${waybill.receiverDocument}</span></div>` : ''}
        ${waybill.receiverRole ? `<div class="info-item"><label>Função</label><span>${waybill.receiverRole}</span></div>` : ''}
        ${waybill.receivedAt ? `<div class="info-item"><label>Recebido em</label><span>${fmtDate(waybill.receivedAt)}</span></div>` : ''}
      </div>
    </div>

    <!-- Itens -->
    <div class="section">
      <div class="section-title">Itens do Romaneio</div>
      <table>
        <thead>
          <tr>
            <th style="width:70px;">Código</th>
            <th>Descrição</th>
            <th class="center" style="width:50px;">Un.</th>
            <th class="right" style="width:70px;">Qtd. Sol.</th>
            <th class="right" style="width:70px;">Qtd. Rec.</th>
            <th style="width:110px;">Nº Série</th>
            <th style="width:90px;">Condição</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>

    ${waybill.notes ? `
    <!-- Observações -->
    <div class="section">
      <div class="section-title">Observações</div>
      <p style="font-size:12px;color:#374151;padding:10px;background:#F9FAFB;border-radius:6px;border:1px solid #E5E7EB;">${waybill.notes}</p>
    </div>` : ''}

    ${waybill.receiverNotes ? `
    <!-- Notas do recebedor -->
    <div class="section">
      <div class="section-title">Notas do Recebedor</div>
      <p style="font-size:12px;color:#374151;padding:10px;background:#FEF3DC;border-radius:6px;border:1px solid #F5A623;">${waybill.receiverNotes}</p>
    </div>` : ''}

    ${pendencyRows ? `
    <!-- Pendências -->
    <div class="section">
      <div class="section-title">Pendências</div>
      <table>
        <thead><tr><th>Descrição</th><th class="center" style="width:100px;">Status</th></tr></thead>
        <tbody>${pendencyRows}</tbody>
      </table>
    </div>` : ''}

    <!-- Assinaturas -->
    <div class="section no-break" style="margin-top:32px;">
      <div class="section-title">Assinaturas</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:space-around;">
        ${signatureBlock('Expedidor', senderSigB64, waybill.senderName, waybill.senderSignedAt)}
        ${waybill.driverName ? signatureBlock('Motorista', driverSigB64, waybill.driverName, waybill.driverSignedAt) : ''}
        ${signatureBlock(
          waybill.exitType === 'DIRECT_PICKUP' ? 'Recebedor' : 'Recebedor na Obra',
          receiverSigB64,
          waybill.receiverName ?? waybill.receiverEmployee?.name,
          waybill.receiverSignedAt,
          waybill.exitType === 'DRIVER_DELIVERY',
        )}
      </div>
    </div>

  </div>

  <!-- ── FOOTER ── -->
  <div style="position:fixed;bottom:0;left:0;right:0;padding:10px 36px;background:#F9FAFB;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:10px;color:#9CA3AF;">SYSOBRA — Sistema de Gestão de Obras | ${company?.name ?? ''}</span>
    <span style="font-size:10px;color:#9CA3AF;">Gerado em ${new Date().toLocaleString('pt-BR')}</span>
  </div>

</body>
</html>`
}
