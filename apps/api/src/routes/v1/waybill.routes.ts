import path from 'path'
import fs   from 'fs'
import * as crypto from 'crypto'
import * as QRCode from 'qrcode'
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
import { getPdfFooter, PDF_BASE_STYLES, getSysobraLogoBase64, fileToBase64 } from '../../utils/pdfTemplate'

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

// ─── HELPER: hash de verificação pública ────────────────────────────────────
function generateVerificationHash(waybillId: string, docNumber: string): string {
  return crypto
    .createHash('sha256')
    .update(`${waybillId}:${docNumber}:${Date.now()}`)
    .digest('hex')
    .substring(0, 32)
}

// ─── HELPER: baixar estoque ───────────────────────────────────────────────────
// Decrementa StockBalance + StockItem.quantity e registra StockMovement.
// Usa transação para atomicidade. Atualiza currentLocation em ferramentas.

async function baixarEstoque(
  waybillId:  string,
  locationId: string,
  companyId:  string,
  docNumber:  string,
): Promise<void> {
  if (!locationId) {
    throw new Error('locationId é obrigatório para baixar estoque')
  }

  await p().$transaction(async (tx: any) => {
    // Buscar romaneio para saber categoria e destino
    const waybill = await tx.waybill.findFirst({
      where: { id: waybillId },
      include: { destinationProject: { select: { id: true, name: true } } },
    })

    const destLabel = waybill?.destinationProject
      ? `OBRA: ${waybill.destinationProject.name}`
      : waybill?.destinationName
        ? `EXTERNO: ${waybill.destinationName}`
        : 'EM USO'

    const items = await tx.waybillItem.findMany({
      where:   { waybillId, isActive: true },
      include: { item: { select: { id: true, name: true } } },
    })

    if (items.length === 0) {
      throw new Error('Nenhum item encontrado no romaneio')
    }

    for (const waybillItem of items) {
      const qty    = Number(waybillItem.requestedQty)
      const itemId = waybillItem.itemId

      // Busca balance apenas por itemId + locationId (a unique constraint não inclui companyId)
      const balance = await tx.stockBalance.findFirst({
        where: { itemId, locationId },
      })

      if (!balance) {
        throw new Error(
          `Saldo não encontrado para "${waybillItem.item?.name ?? itemId}" ` +
          `no almoxarifado selecionado. Verifique se o item está cadastrado neste local.`,
        )
      }

      const novoSaldo = Number(balance.quantity) - qty
      if (novoSaldo < 0) {
        throw new Error(
          `Saldo insuficiente para "${waybillItem.item?.name ?? itemId}". ` +
          `Disponível: ${Number(balance.quantity)}, necessário: ${qty}`,
        )
      }

      const novoTotal = novoSaldo * Number(balance.averageCost ?? 0)

      // Atualizar saldo pelo ID direto (mais robusto que updateMany com filtro composto)
      await tx.stockBalance.update({
        where: { id: balance.id },
        data:  { quantity: novoSaldo, totalValue: novoTotal },
      })

      // Atualizar StockItem.quantity (campo global — exibido na UI de estoque)
      // + currentLocation para ferramentas
      const stockItemData: any = { quantity: { decrement: qty } }
      if (waybill?.category === 'TOOL') {
        stockItemData.currentLocation = destLabel
      }
      await tx.stockItem.update({
        where: { id: itemId },
        data:  stockItemData,
      })

      console.log(`✅ Estoque baixado: ${waybillItem.item?.name} ${Number(balance.quantity)} → ${novoSaldo}`)

      // Registrar movimento de saída
      await tx.stockMovement.create({
        data: {
          companyId,
          stockItemId: itemId,
          locationId,
          type:      'OUT',
          quantity:  qty,
          unitCost:  Number(waybillItem.unitCost),
          totalCost: Number(waybillItem.totalCost),
          docNumber,
          notes: `Saída via romaneio ${docNumber}`,
        },
      })
    }
  })
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
          ...(newStatus === 'COMPLETED' && {
            receivedAt:       new Date(),
            verificationHash: generateVerificationHash(waybill.id, docNumber),
          }),
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
        ...(newStatus === 'COMPLETED' && {
          receivedAt:       new Date(),
          verificationHash: generateVerificationHash(id, docNumber),
        }),
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

    // Criar registros na ficha do colaborador (EPI/Ferramentas)
    await criarRegistrosColaborador(waybill, result.waybillUpdate.receiverSignatureUrl ?? null)

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
      select: { name: true, cnpj: true, logo: true, address: true },
    })

    const [senderSigB64, driverSigB64, receiverSigB64] = await Promise.all([
      waybill.senderSignatureUrl   ? urlToBase64(waybill.senderSignatureUrl)   : Promise.resolve(null),
      waybill.driverSignatureUrl   ? urlToBase64(waybill.driverSignatureUrl)   : Promise.resolve(null),
      waybill.receiverSignatureUrl ? urlToBase64(waybill.receiverSignatureUrl) : Promise.resolve(null),
    ])

    // Gerar QR Code apenas para romaneios concluídos com hash
    let qrCodeBase64: string | null = null
    if (waybill.status === 'COMPLETED' && waybill.verificationHash) {
      try {
        const webUrl  = process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000'
        const verifyUrl = `${webUrl}/verificar/${waybill.verificationHash}`
        qrCodeBase64 = await QRCode.toDataURL(verifyUrl, {
          width:  120,
          margin: 1,
          color: { dark: '#111827', light: '#FFFFFF' },
        })
      } catch { /* QR opcional — não quebra o PDF */ }
    }

    const html = gerarHtmlRomaneio({ waybill, company, senderSigB64, driverSigB64, receiverSigB64, qrCodeBase64 })
    const pdfBuffer = await generatePdf({
      kind: 'raw',
      html,
      margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
    })

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

  // ── LISTAR TODAS AS PENDÊNCIAS DA EMPRESA ────────────────────────────────
  // GET /api/v1/waybill/pendencies?status=OPEN
  app.get('/pendencies', { preHandler }, async (request, reply) => {
    const req       = request as RequestWithMember
    const companyId = cid(req)
    const { status = 'OPEN' } = request.query as any

    const [pendencies, total] = await Promise.all([
      p().waybillPendency.findMany({
        where:   { companyId, isActive: true, status },
        include: {
          waybill: {
            select: {
              id:                 true,
              docNumber:          true,
              category:           true,
              location:           { select: { name: true } },
              destinationProject: { select: { name: true } },
            },
          },
          waybillItem: {
            include: {
              item: { select: { name: true, unit: true, category: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      p().waybillPendency.count({
        where: { companyId, isActive: true, status: 'OPEN' },
      }),
    ])

    return reply.send({ pendencies, total })
  })

  // ── RESOLVER PENDÊNCIA ───────────────────────────────────────────────────
  // PATCH /api/v1/waybill/pendencies/:pendencyId/resolve
  // body: { resolution: 'RETURN_TO_STOCK' | 'LOSS' | 'THEFT', notes?: string }
  app.patch('/pendencies/:pendencyId/resolve', { preHandler }, async (request, reply) => {
    const req            = request as RequestWithMember
    const companyId      = cid(req)
    const userId         = uid(request)
    const { pendencyId } = request.params as any
    const body           = request.body as any

    const pendency = await p().waybillPendency.findFirst({
      where:   { id: pendencyId, companyId, isActive: true },
      include: {
        waybill:     { select: { id: true, docNumber: true, locationId: true } },
        waybillItem: { select: { id: true, itemId: true, requestedQty: true, receivedQty: true } },
      },
    })

    if (!pendency) {
      return reply.status(404).send({ error: 'Pendência não encontrada' })
    }
    if (pendency.status !== 'OPEN') {
      return reply.status(400).send({ error: 'Pendência já resolvida' })
    }

    const pendingQty = Number(pendency.quantityExpected ?? 0) - Number(pendency.quantityReceived ?? 0)

    // RETURN_TO_STOCK: devolver ao estoque a quantidade pendente
    if (body.resolution === 'RETURN_TO_STOCK' && pendingQty > 0 && pendency.waybillItem) {
      const balance = await p().stockBalance.findFirst({
        where: { itemId: pendency.waybillItem.itemId, locationId: pendency.waybill.locationId },
      })

      if (balance) {
        await p().stockBalance.update({
          where: { id: balance.id },
          data:  { quantity: { increment: pendingQty } },
        })
        // Atualizar também StockItem.quantity (campo global)
        await p().stockItem.update({
          where: { id: pendency.waybillItem.itemId },
          data:  { quantity: { increment: pendingQty } },
        })
      }

      await p().stockMovement.create({
        data: {
          companyId,
          stockItemId: pendency.waybillItem.itemId,
          locationId:  pendency.waybill.locationId,
          type:        'RETURN',
          quantity:    pendingQty,
          unitCost:    0,
          totalCost:   0,
          notes:       `Devolução de pendência — Romaneio ${pendency.waybill.docNumber}`,
        },
      })
    }

    // LOSS: registrar como perda (sem ajuste de estoque — já foi baixado)
    if (body.resolution === 'LOSS' && pendingQty > 0 && pendency.waybillItem) {
      await p().stockMovement.create({
        data: {
          companyId,
          stockItemId: pendency.waybillItem.itemId,
          locationId:  pendency.waybill.locationId,
          type:        'LOSS',
          quantity:    pendingQty,
          unitCost:    0,
          totalCost:   0,
          notes:       `Prejuízo declarado — Romaneio ${pendency.waybill.docNumber}`,
        },
      })
    }

    const resolutionLabel =
      body.resolution === 'RETURN_TO_STOCK' ? `✅ Devolvido ao estoque: ${pendingQty} unidade(s)`
      : body.resolution === 'LOSS'          ? `📋 Declarado como prejuízo: ${pendingQty} unidade(s)`
      : `🚨 Declarado como extravio: ${pendingQty} unidade(s)`

    await p().waybillPendency.update({
      where: { id: pendencyId },
      data:  {
        status:          'RESOLVED',
        resolvedAt:      new Date(),
        resolvedBy:      userId,
        resolutionNotes: [resolutionLabel, body.notes ? `Obs: ${body.notes}` : ''].filter(Boolean).join(' | '),
      },
    })

    await createAuditLog({
      prisma: p(), companyId, userId,
      action: 'UPDATE', module: 'DEPOSIT',
      entity: 'WaybillPendency', entityId: pendencyId,
      description: `Pendência resolvida: ${
        body.resolution === 'RETURN_TO_STOCK' ? 'Devolvido ao estoque'
        : body.resolution === 'LOSS'          ? 'Declarado prejuízo'
        : 'Declarado extravio'
      } — Romaneio ${pendency.waybill.docNumber}`,
      request,
    })

    return reply.send({ success: true, resolution: body.resolution })
  })
}

// ─── ROTAS PÚBLICAS (sem autenticação) ───────────────────────────────────────
// Registrar em server.ts com prefix '/api/v1/waybill' para manter consistência

// Rate limiter em memória para /public/verify
const _verifyRateLimit = new Map<string, { count: number; resetAt: number }>()
function checkVerifyRateLimit(ip: string): boolean {
  const now  = Date.now()
  const slot = _verifyRateLimit.get(ip)
  if (slot && now < slot.resetAt) {
    if (slot.count >= 10) return false
    slot.count++
  } else {
    _verifyRateLimit.set(ip, { count: 1, resetAt: now + 60_000 })
  }
  return true
}

function maskDocument(doc: string | null | undefined): string | null {
  if (!doc) return null
  const d = doc.replace(/\D/g, '')
  if (d.length === 11) return `***.${d.substring(3, 6)}.${d.substring(6, 9)}-**`
  return `****${d.slice(-4)}`
}

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
        receiverType:       waybill.receiverType,
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

    // Criar registros na ficha do colaborador (EPI/Ferramentas)
    await criarRegistrosColaborador(waybill, result.waybillUpdate.receiverSignatureUrl ?? null)

    return reply.send({
      success:         true,
      hasPendency:     result.hasPendency,
      pendenciesCount: result.pendencies.length,
      message: result.hasPendency
        ? `Romaneio concluído com ${result.pendencies.length} pendência(s). O gestor foi notificado.`
        : 'Romaneio concluído com sucesso!',
    })
  })

  // ── VERIFICAR AUTENTICIDADE DO ROMANEIO (somente leitura) ────────────────
  // GET /api/v1/waybill/public/verify/:hash
  app.get('/public/verify/:hash', async (request, reply) => {
    const ip   = request.ip ?? 'unknown'
    if (!checkVerifyRateLimit(ip)) {
      return reply.status(429).send({ error: 'RATE_LIMIT', message: 'Muitas tentativas. Tente novamente em 1 minuto.' })
    }

    const { hash } = request.params as any
    if (!hash || hash.length < 20 || !/^[0-9a-f]+$/i.test(hash)) {
      return reply.status(400).send({ error: 'INVALID_HASH', message: 'Hash de verificação inválido' })
    }

    const waybill = await p().waybill.findFirst({
      where: { verificationHash: hash, isActive: true },
      include: {
        items: {
          where:   { isActive: true },
          include: { item: { select: { id: true, name: true, unit: true, code: true } } },
        },
        location:           { select: { name: true } },
        destinationProject: { select: { name: true } },
        company:            { select: { name: true, cnpj: true } },
      },
    })

    if (!waybill) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Romaneio não encontrado ou hash inválido' })
    }

    const CAT_LABELS: Record<string, string> = {
      MATERIAL:    'Materiais',
      TOOL:        'Ferramentário',
      EPI_UNIFORM: 'EPIs e Uniformes',
    }

    return reply.send({
      valid: true,
      waybill: {
        docNumber:   waybill.docNumber,
        category:    CAT_LABELS[waybill.category] ?? waybill.category,
        status:      waybill.status,
        emittedAt:   waybill.emittedAt,
        completedAt: waybill.receivedAt,
        origin:      waybill.location?.name      ?? null,
        destination: waybill.destinationProject?.name ?? waybill.destinationName ?? null,
        company: {
          name: waybill.company.name,
          cnpj: waybill.company.cnpj ?? null,
        },
        driver: (waybill.driverName || waybill.driverDocument) ? {
          name:     waybill.driverName     ?? null,
          document: maskDocument(waybill.driverDocument),
        } : null,
        receiver: {
          name:     waybill.receiverName     ?? null,
          document: maskDocument(waybill.receiverDocument),
        },
        items: (waybill.items ?? []).map((i: any) => ({
          name:         i.item?.name   ?? i.itemId,
          unit:         i.item?.unit   ?? null,
          code:         i.item?.code   ?? null,
          requestedQty: Number(i.requestedQty),
          receivedQty:  i.receivedQty != null ? Number(i.receivedQty) : null,
          status:       i.status,
          serialNumber: i.serialNumber ?? null,
        })),
        signatures: {
          sender:   { name: waybill.senderName   ?? null, signedAt: waybill.senderSignedAt   ?? null },
          driver:   waybill.driverSignedAt   ? { name: waybill.driverName   ?? null, signedAt: waybill.driverSignedAt   } : null,
          receiver: waybill.receiverSignedAt ? { name: waybill.receiverName ?? null, signedAt: waybill.receiverSignedAt } : null,
        },
      },
    })
  })
}

// ─── HELPER: criar registros de entrega para o colaborador ───────────────────
// Chamado quando um romaneio EPI_UNIFORM ou TOOL é concluído com receiverEmployeeId.
// Cria StockEpiDelivery (EPI) ou ToolCustody (ferramentas) para a ficha do colaborador.

async function criarRegistrosColaborador(
  waybill:      any,
  signatureUrl: string | null,
): Promise<void> {
  const employeeId = waybill.receiverEmployeeId
  if (!employeeId) return

  if (waybill.category === 'EPI_UNIFORM') {
    for (const item of waybill.items) {
      try {
        await p().stockEpiDelivery.create({
          data: {
            companyId:   waybill.companyId,
            stockItemId: item.itemId,
            employeeId,
            locationId:  waybill.locationId ?? null,
            quantity:    Number(item.requestedQty),
            deliveredAt: new Date(),
            signatureUrl,
            notes: `Entregue via romaneio ${waybill.docNumber}`,
          },
        })
      } catch (err) {
        // log mas não aborta — entrega já foi registrada no romaneio
        console.error('[criarRegistrosColaborador] EpiDelivery error:', err)
      }
    }
  } else if (waybill.category === 'TOOL') {
    for (const item of waybill.items) {
      try {
        await p().toolCustody.create({
          data: {
            companyId:    waybill.companyId,
            stockItemId:  item.itemId,
            employeeId,
            quantity:     Number(item.requestedQty),
            checkedOutAt: new Date(),
            notes: `Retirado via romaneio ${waybill.docNumber}`,
          },
        })
      } catch (err) {
        console.error('[criarRegistrosColaborador] ToolCustody error:', err)
      }
    }
  }
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
    verificationHash:    generateVerificationHash(waybill.id, waybill.docNumber),
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
  qrCodeBase64   = null,
}: {
  waybill:         any
  company:         any
  senderSigB64?:   string | null
  driverSigB64?:   string | null
  receiverSigB64?: string | null
  qrCodeBase64?:   string | null
}): string {
  const fmtDate = (d: any) => d
    ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'
  const fmtQty = (n: any) =>
    Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })

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
  const STATUS_BG: Record<string, string> = {
    DRAFT:      '#F3F4F6',
    EMITTED:    '#FEF3C7',
    IN_TRANSIT: '#DBEAFE',
    COMPLETED:  '#DCFCE7',
    CANCELLED:  '#FEE2E2',
  }
  const STATUS_FG: Record<string, string> = {
    DRAFT:      '#374151',
    EMITTED:    '#92400E',
    IN_TRANSIT: '#1D4ED8',
    COMPLETED:  '#166534',
    CANCELLED:  '#991B1B',
  }

  // ── Logos ──────────────────────────────────────────────────────────────────
  const companyLogoB64 = company?.logo ? fileToBase64(company.logo) : null

  const hasDriver      = waybill.exitType === 'DRIVER_DELIVERY' &&
    (waybill.driverEmployee?.name ?? waybill.driverName)
  const isToolWaybill  = waybill.category === 'TOOL'
  const fmtCurrency    = (n: any) =>
    Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const totalValue     = (waybill.items ?? []).reduce(
    (sum: number, wi: any) => sum + Number(wi.totalCost ?? 0), 0,
  )

  // ── Linhas da tabela de itens ───────────────────────────────────────────────
  const itemRows = (waybill.items ?? []).map((wi: any, i: number) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#F9FAFB'};">
      <td class="center" style="color:#9CA3AF;font-size:10px;">${i + 1}</td>
      <td style="word-break:break-word;">${wi.item?.name ?? wi.itemId}</td>
      <td class="center">${wi.item?.unit ?? '—'}</td>
      <td class="right" style="font-weight:600;">${fmtQty(wi.requestedQty)}</td>
      <td class="right">${wi.receivedQty != null ? fmtQty(wi.receivedQty) : '—'}</td>
      ${isToolWaybill ? `
      <td style="word-break:break-word;">${wi.serialNumber ?? '—'}</td>
      <td style="word-break:break-word;">${[wi.toolBrand, wi.toolModel].filter(Boolean).join(' / ') || '—'}</td>
      <td class="center">${wi.toolCondition ?? '—'}</td>
      ` : ''}
      <td class="right">${fmtCurrency(wi.unitCost)}</td>
      <td class="right" style="font-weight:600;">${fmtCurrency(wi.totalCost)}</td>
      <td class="center">
        ${wi.status === 'OK'
          ? '<span style="color:#16A34A;font-weight:700;">OK</span>'
          : wi.status === 'MISSING'
            ? '<span style="color:#DC2626;">Falta</span>'
            : wi.status === 'DAMAGED'
              ? '<span style="color:#D97706;">Dano</span>'
              : (wi.status ?? '—')}
      </td>
    </tr>
  `).join('')

  // ── Bloco de assinatura ─────────────────────────────────────────────────────
  const sigBlock = (label: string, sig: string | null, name: string | null, date: any, pending = false) => `
    <div style="flex:1;min-width:180px;text-align:center;padding:16px 12px;border:1px solid #E5E7EB;border-radius:8px;">
      <div style="font-size:11px;color:#6B7280;margin-bottom:8px;font-weight:600;">${label}</div>
      ${sig
        ? `<img src="${sig}" style="max-height:70px;max-width:200px;object-fit:contain;margin:0 auto 6px;display:block;" />`
        : `<div style="width:160px;height:70px;border-bottom:1px solid #374151;margin:0 auto;"></div>`
      }
      <div style="font-size:11px;color:#374151;margin-top:6px;">${name ?? '________________________'}</div>
      ${date ? `<div style="font-size:10px;color:#9CA3AF;margin-top:2px;">${fmtDate(date)}</div>` : ''}
      ${pending && !sig ? `<div style="font-size:10px;color:#D97706;margin-top:4px;">⏳ Pendente assinatura</div>` : ''}
    </div>
  `

  // ── Pendências ──────────────────────────────────────────────────────────────
  const pendencyRows = (waybill.pendencies ?? []).map((pd: any) => `
    <tr>
      <td style="color:#DC2626;">⚠ ${pd.description}</td>
      <td class="center">${pd.status === 'RESOLVED' ? '✓ Resolvida' : 'Em aberto'}</td>
    </tr>
  `).join('')

  const docFooter = getPdfFooter(company?.name ?? '')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Romaneio ${waybill.docNumber}</title>
  <style>
    ${PDF_BASE_STYLES}

    /* ── CABEÇALHO 3 COLUNAS ── */
    .pdf-header {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      background: #111827;
      color: #fff;
      padding: 16px 28px;
    }
    .pdf-header-left  { display: flex; align-items: center; gap: 10px; }
    .sysobra-logo-hdr { height: 32px; object-fit: contain; filter: brightness(0) invert(1); }
    .sysobra-txt-hdr  { font-size: 18px; font-weight: 900; color: #fff; letter-spacing: 0.05em; }
    .sysobra-tag-hdr  { font-size: 9px; color: rgba(255,255,255,.6); display: block; margin-top: 2px; }
    .pdf-header-center { text-align: center; min-width: 80px; }
    .co-logo-hdr      { height: 50px; max-width: 120px; object-fit: contain; }
    .pdf-header-right  { text-align: right; }
    .hdr-co-name { font-size: 14px; font-weight: 700; color: #fff; }
    .hdr-co-info { font-size: 10px; color: rgba(255,255,255,.7); line-height: 1.6; margin-top: 2px; }
    .hdr-doc-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #F5A623; margin-top: 8px; }
    .hdr-doc-num   { font-size: 18px; font-weight: 900; color: #fff; }
    .hdr-doc-date  { font-size: 10px; color: rgba(255,255,255,.6); }
    .hdr-doc-status {
      display: inline-block; padding: 2px 8px; border-radius: 99px;
      font-size: 10px; font-weight: 700; margin-top: 3px;
      background: ${STATUS_BG[waybill.status] ?? '#F3F4F6'};
      color: ${STATUS_FG[waybill.status] ?? '#374151'};
    }
    .header-stripe { height: 4px; background: linear-gradient(90deg, #F5A623 0%, #D4860F 100%); }

    /* ── BLOCOS DE INFO ── */
    .info-block { background: #F9FAFB; border-radius: 8px; padding: 14px 16px; }
    .grid-3     { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    .info-row   { margin-bottom: 7px; }
    .info-label { font-size: 10px; font-weight: 600; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.04em; display: block; }
    .info-value { font-size: 12px; color: #111827; font-weight: 500; margin-top: 1px; display: block; }

    /* ── CARDS COMPACTOS (motorista/recebedor) ── */
    .person-cards { display: grid; gap: 12px; margin-bottom: 20px; }
    .person-cards.two-col { grid-template-columns: 1fr 1fr; }
    .person-card {
      border-radius: 8px; padding: 12px 14px;
      background: #F9FAFB; border: 1px solid #E5E7EB;
      display: grid; grid-template-columns: 1fr auto; gap: 8px;
    }
    .person-card.driver   { border-left: 3px solid #F5A623; }
    .person-card.receiver { border-left: 3px solid #3B82F6; }
    .person-card-body  { min-width: 0; }
    .person-card-sig   { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 80px; }
    .pc-role  { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
    .pc-role.driver   { color: #D97706; }
    .pc-role.receiver { color: #2563EB; }
    .pc-name  { font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 4px; }
    .pc-detail { font-size: 10px; color: #6B7280; line-height: 1.6; }
    .pc-sig-label { font-size: 9px; color: #9CA3AF; margin-bottom: 3px; }
    .pc-pending { font-size: 9px; color: #D97706; }
    .pc-plate { font-size: 15px; font-weight: 900; color: #111827; letter-spacing: 0.05em; }

    /* ── QR CODE ── */
    .qr-block {
      display: flex; align-items: center; gap: 16px;
      background: #F9FAFB; border: 1px solid #E5E7EB;
      border-radius: 8px; padding: 12px 16px; margin-top: 20px;
    }
    .qr-block img { width: 90px; height: 90px; flex-shrink: 0; }
    .qr-text h4 { font-size: 11px; font-weight: 700; color: #111827; margin-bottom: 3px; }
    .qr-text p  { font-size: 10px; color: #6B7280; line-height: 1.5; }
    .qr-hash    { font-size: 9px; font-family: monospace; color: #9CA3AF; margin-top: 4px; word-break: break-all; }

    /* ── TABELA ── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      table-layout: auto;
    }
    thead tr { background: #111827; color: #fff; }
    thead th {
      padding: 7px 6px;
      text-align: left;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      white-space: nowrap;
    }
    thead th.right  { text-align: right; }
    thead th.center { text-align: center; }
    tbody tr:nth-child(even) { background: #F9FAFB; }
    tbody tr:nth-child(odd)  { background: #fff; }
    tbody tr { page-break-inside: avoid; }
    tbody td {
      padding: 6px 6px;
      border-bottom: 1px solid #E5E7EB;
      vertical-align: middle;
      word-break: break-word;
    }
    tbody td.right  { text-align: right; }
    tbody td.center { text-align: center; }
    thead { display: table-header-group; }
    tfoot { display: table-row-group; }
    tfoot td {
      padding: 8px 6px;
      background: #FEF3DC;
      font-weight: 700;
      border-top: 2px solid #F5A623;
    }

    .no-break { page-break-inside: avoid; }
  </style>
</head>
<body>

  <!-- ── CABEÇALHO ── -->
  <div class="pdf-header">

    <!-- ESQUERDA: SYSOBRA -->
    <div class="pdf-header-left">
      <div>
        <div style="font-size:20px;font-weight:900;letter-spacing:0.05em;color:#fff;line-height:1;">
          SYS<span style="color:#F5A623;">O</span>BRA
        </div>
        <div style="font-size:9px;color:rgba(255,255,255,0.6);margin-top:3px;letter-spacing:0.03em;">
          Sistema de Gestão de Obras
        </div>
      </div>
    </div>

    <!-- CENTRO: Logo do cliente -->
    <div class="pdf-header-center">
      ${companyLogoB64
        ? `<img src="${companyLogoB64}" class="co-logo-hdr" alt="${company?.name ?? ''}" />`
        : ''
      }
    </div>

    <!-- DIREITA: Empresa + documento -->
    <div class="pdf-header-right">
      <div class="hdr-co-name">${company?.name ?? 'EMPRESA'}</div>
      <div class="hdr-co-info">
        ${company?.cnpj ? `CNPJ: ${company.cnpj}` : ''}
        ${company?.address ? `<br>${company.address}` : ''}
      </div>
      <div class="hdr-doc-title">ROMANEIO DE ${CAT_LABELS[waybill.category] ?? 'SAÍDA'}</div>
      <div class="hdr-doc-num">${waybill.docNumber}</div>
      <div class="hdr-doc-date">${fmtDate(waybill.emittedAt ?? waybill.createdAt)}</div>
      <div class="hdr-doc-status">${STATUS_LABELS[waybill.status] ?? waybill.status}</div>
    </div>

  </div>
  <div class="header-stripe"></div>

  <!-- ── BODY ── -->
  <div class="doc-body">

    <!-- Informações gerais -->
    <div class="section">
      <div class="section-title">Informações do Romaneio</div>
      <div class="info-block">
        <div class="grid-3">
          <div>
            <div class="info-row">
              <span class="info-label">Categoria</span>
              <span class="info-value">${CAT_LABELS[waybill.category] ?? waybill.category}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Tipo de Saída</span>
              <span class="info-value">${waybill.exitType === 'DIRECT_PICKUP' ? 'Retirada Direta' : 'Entrega por Motorista'}</span>
            </div>
          </div>
          <div>
            <div class="info-row">
              <span class="info-label">Almoxarifado</span>
              <span class="info-value">${waybill.location?.name ?? '—'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Destino</span>
              <span class="info-value">${waybill.destinationProject?.name ?? waybill.destinationName ?? '—'}</span>
            </div>
          </div>
          <div>
            <div class="info-row">
              <span class="info-label">Emitido em</span>
              <span class="info-value">${fmtDate(waybill.emittedAt)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Expedidor</span>
              <span class="info-value">${waybill.senderName ?? '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Cards compactos: Motorista + Recebedor -->
    <div class="section">
      <div class="section-title">${hasDriver ? 'Motorista e Recebedor' : (waybill.exitType === 'DIRECT_PICKUP' ? 'Retirada' : 'Recebedor')}</div>
      <div class="person-cards ${hasDriver ? 'two-col' : ''}">

        ${hasDriver ? `
        <!-- Card Motorista -->
        <div class="person-card driver">
          <div class="person-card-body">
            <div class="pc-role driver">🚚 Motorista${waybill.driverType === 'EMPLOYEE' ? ' · Colaborador' : ''}</div>
            <div class="pc-name">${waybill.driverEmployee?.name ?? waybill.driverName ?? '—'}</div>
            <div class="pc-detail">
              ${waybill.driverDocument ? `CPF: ${waybill.driverDocument}<br>` : ''}
              ${waybill.driverPhone    ? `Tel: ${waybill.driverPhone}<br>`    : ''}
              ${waybill.vehiclePlate   ? `<span class="pc-plate">${waybill.vehiclePlate}</span>${waybill.vehicleModel ? ` · ${waybill.vehicleModel}` : ''}<br>` : ''}
              Saída: ${fmtDate(waybill.dispatchedAt)}
            </div>
          </div>
          <div class="person-card-sig">
            <div class="pc-sig-label">Assinatura</div>
            ${driverSigB64
              ? `<img src="${driverSigB64}" style="height:40px;max-width:75px;object-fit:contain;border-bottom:1px solid #374151;" />`
              : `<div style="width:70px;height:40px;border-bottom:1px solid #D1D5DB;"></div><div class="pc-pending">⏳ Pendente</div>`
            }
            ${waybill.driverSignedAt ? `<div style="font-size:9px;color:#9CA3AF;margin-top:2px;">${fmtDate(waybill.driverSignedAt)}</div>` : ''}
          </div>
        </div>` : ''}

        <!-- Card Recebedor -->
        <div class="person-card receiver">
          <div class="person-card-body">
            <div class="pc-role receiver">${waybill.exitType === 'DIRECT_PICKUP' ? '📦 Recebedor · Retirada direta' : '🏗️ Recebedor na Obra'}${waybill.receiverType === 'EMPLOYEE' ? ' · Colaborador' : ''}</div>
            <div class="pc-name">${waybill.receiverEmployee?.name ?? waybill.receiverName ?? '—'}</div>
            <div class="pc-detail">
              ${waybill.receiverDocument ? `Doc: ${waybill.receiverDocument}<br>` : ''}
              ${waybill.receiverPhone    ? `Tel: ${waybill.receiverPhone}<br>`    : ''}
              ${waybill.receiverRole     ? `Função: ${waybill.receiverRole}<br>`  : ''}
              Recebido: ${fmtDate(waybill.receivedAt)}
              ${waybill.receiverNotes    ? `<br><span style="color:#374151;font-style:italic;">Obs: ${waybill.receiverNotes}</span>` : ''}
            </div>
          </div>
          <div class="person-card-sig">
            <div class="pc-sig-label">Assinatura</div>
            ${receiverSigB64
              ? `<img src="${receiverSigB64}" style="height:40px;max-width:75px;object-fit:contain;border-bottom:1px solid #374151;" />`
              : `<div style="width:70px;height:40px;border-bottom:1px solid #D1D5DB;"></div><div class="pc-pending">⏳ Pendente</div>`
            }
            ${waybill.receiverSignedAt ? `<div style="font-size:9px;color:#9CA3AF;margin-top:2px;">${fmtDate(waybill.receiverSignedAt)}</div>` : ''}
          </div>
        </div>

      </div>
    </div>

    <!-- Itens -->
    <div class="section">
      <div class="section-title">Itens do Romaneio</div>
      <table>
        ${isToolWaybill ? `
        <colgroup>
          <col style="width:25px">
          <col>
          <col style="width:35px">
          <col style="width:55px">
          <col style="width:55px">
          <col style="width:85px">
          <col style="width:85px">
          <col style="width:60px">
          <col style="width:65px">
          <col style="width:70px">
          <col style="width:50px">
        </colgroup>
        ` : `
        <colgroup>
          <col style="width:28px">
          <col>
          <col style="width:40px">
          <col style="width:70px">
          <col style="width:70px">
          <col style="width:75px">
          <col style="width:80px">
          <col style="width:55px">
        </colgroup>
        `}
        <thead>
          <tr>
            <th class="center">Nº</th>
            <th>Descrição do item</th>
            <th class="center">Und.</th>
            <th class="right">Qtd enviada</th>
            <th class="right">Qtd recebida</th>
            ${isToolWaybill ? `
            <th>Nº de série</th>
            <th>Marca/Modelo</th>
            <th class="center">Condição</th>
            ` : ''}
            <th class="right">Valor unit.</th>
            <th class="right">Total</th>
            <th class="center">Status</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <!-- Total fora da tabela — aparece só uma vez no final -->
      <div style="page-break-inside:avoid;display:flex;justify-content:flex-end;margin-top:0;border-top:2px solid #F5A623;background:#FEF3DC;padding:8px 10px;">
        <div style="display:flex;align-items:center;gap:20px;font-size:11px;">
          <span style="color:#6B7280;">
            ${(waybill.items?.length ?? 0)} tipo(s) &middot;
            ${(waybill.items ?? []).reduce((s: number, i: any) => s + Number(i.requestedQty), 0)} unidade(s)
          </span>
          <span style="font-weight:700;font-size:13px;">
            TOTAL GERAL:
            <span style="color:#D4860F;margin-left:6px;">${fmtCurrency(totalValue)}</span>
          </span>
        </div>
      </div>
    </div>

    ${waybill.notes ? `
    <!-- Observações -->
    <div class="section">
      <div class="section-title">Observações</div>
      <p style="font-size:12px;color:#374151;padding:10px;background:#F9FAFB;border-radius:6px;border:1px solid #E5E7EB;">${waybill.notes}</p>
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
        ${sigBlock('Expedidor', senderSigB64, waybill.senderName, waybill.senderSignedAt)}
        ${hasDriver ? sigBlock('Motorista', driverSigB64, waybill.driverEmployee?.name ?? waybill.driverName, waybill.driverSignedAt) : ''}
        ${sigBlock(
          waybill.exitType === 'DIRECT_PICKUP' ? 'Recebedor' : 'Recebedor na Obra',
          receiverSigB64,
          waybill.receiverEmployee?.name ?? waybill.receiverName,
          waybill.receiverSignedAt,
          waybill.exitType === 'DRIVER_DELIVERY',
        )}
      </div>
    </div>

    ${qrCodeBase64 ? `
    <!-- QR Code de verificação -->
    <div class="qr-block no-break">
      <img src="${qrCodeBase64}" alt="QR Code de verificação" />
      <div class="qr-text">
        <h4>✅ Documento verificável</h4>
        <p>Escaneie o QR Code para verificar a autenticidade deste romaneio no portal SYSOBRA.</p>
        <p>O código garante que este documento é original e não foi adulterado.</p>
        <div class="qr-hash">Hash: ${waybill.verificationHash}</div>
      </div>
    </div>` : ''}

  </div>

  ${docFooter}

</body>
</html>`
}
