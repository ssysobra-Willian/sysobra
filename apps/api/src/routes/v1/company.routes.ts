import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import path from 'path'
import fs from 'fs'
import { authenticate, requireCompany, RequestWithMember, DEFAULT_PERMISSIONS, JwtPayload } from '../../middlewares/auth.middleware'
import { prisma } from '@sysobra/database'
import { env } from '../../utils/env'

const createCompanySchema = z.object({
  name: z.string().min(2),
  cnpj: z.string().optional(),
  phone: z.string().optional(),
  companyType: z.enum(['PF', 'PJ']).optional(),
})

// ─── Helper: calcula status de assinatura para o frontend ───────────────────

function calcSubscriptionStatus(company: {
  isActive: boolean
  trialEndsAt: Date | null
  stripeSubscriptionId: string | null
  plan: string
}): 'TRIAL' | 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'CANCELLED' {
  if (company.trialEndsAt && new Date(company.trialEndsAt) > new Date()) return 'TRIAL'
  if (!company.isActive) return 'EXPIRED'
  if (company.stripeSubscriptionId) return 'ACTIVE'
  if (company.plan === 'FREE') return 'CANCELLED'
  return 'PENDING'
}

export async function companyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /api/v1/companies/my-companies — empresas com status calculado (usado na tela de seleção)
  app.get('/my-companies', async (request, reply) => {
    const payload = request.user as JwtPayload
    const memberships = await prisma.companyMember.findMany({
      where: { userId: payload.sub, isActive: true },
      include: { company: true },
      orderBy: { joinedAt: 'asc' },
    })

    return reply.send({
      companies: memberships.map((m) => ({
        id:                   m.company.id,
        name:                 m.company.name,
        cnpj:                 m.company.cnpj,
        logo:                 m.company.logo,
        plan:                 m.company.plan,
        subscriptionStatus:   calcSubscriptionStatus(m.company),
        stripeSubscriptionId: m.company.stripeSubscriptionId,
        memberRole:           m.memberRole,
        memberType:           m.memberType,
      })),
    })
  })

  // GET /api/v1/companies — lista empresas do usuário autenticado
  app.get('/', async (request, reply) => {
    const payload = request.user as JwtPayload
    const memberships = await prisma.companyMember.findMany({
      where: { userId: payload.sub, isActive: true },
      include: { company: true },
      orderBy: { joinedAt: 'asc' },
    })

    return reply.send({
      companies: memberships.map((m) => ({
        id: m.company.id,
        name: m.company.name,
        cnpj: m.company.cnpj,
        logo: m.company.logo,
        plan: m.company.plan,
        subscriptionStatus: m.company.subscriptionStatus,
        memberRole: m.memberRole,
        memberType: m.memberType,
      })),
    })
  })

  // POST /api/v1/companies — cria empresa e adiciona o usuário como OWNER
  app.post('/', async (request, reply) => {
    const payload = request.user as JwtPayload
    const body = createCompanySchema.safeParse(request.body)

    if (!body.success) {
      return reply.status(400).send({ error: 'Dados inválidos', details: body.error.flatten() })
    }

    const { name, cnpj, phone } = body.data

    if (cnpj) {
      const existing = await prisma.company.findUnique({ where: { cnpj } })
      if (existing) {
        return reply.status(409).send({ error: 'CNPJ já cadastrado' })
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name, cnpj: cnpj || null, phone: phone || null, plan: 'FREE' },
      })

      await tx.companyMember.create({
        data: {
          userId: payload.sub,
          companyId: company.id,
          role: 'ADMIN',
          memberRole: 'OWNER',
          memberType: 'INTERNAL',
          permissions: { all: true },
        },
      })

      return company
    })

    return reply.status(201).send({ company: result })
  })

  // GET /api/v1/companies/current — empresa ativa do usuário (usa companyId do JWT)
  app.get('/current', async (request, reply) => {
    const payload = request.user as JwtPayload

    let companyId = payload.companyId
    if (!companyId) {
      // Fallback: primeira empresa do usuário (compatibilidade tokens antigos)
      const membership = await prisma.companyMember.findFirst({
        where: { userId: payload.sub, isActive: true },
        orderBy: { joinedAt: 'asc' },
      })
      if (!membership) return reply.status(404).send({ error: 'Empresa não encontrada' })
      companyId = membership.companyId
    }

    const membership = await prisma.companyMember.findUnique({
      where: { companyId_userId: { companyId, userId: payload.sub } },
      include: { company: true },
    })

    if (!membership) return reply.status(404).send({ error: 'Empresa não encontrada' })

    const permissions =
      (membership.permissions as Record<string, unknown>) ??
      DEFAULT_PERMISSIONS[membership.memberRole] ??
      {}

    return reply.send({
      company: {
        ...membership.company,
        memberRole: membership.memberRole,
        memberType: membership.memberType,
        permissions,
      },
    })
  })

  // PUT /api/v1/companies/current/logo — upload de logo da empresa (para documentos)
  app.put('/current/logo', { preHandler: [requireCompany] }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req

    const data = await request.file()
    if (!data) {
      return reply.status(400).send({ error: 'Arquivo não enviado' })
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.status(400).send({ error: 'Formato inválido. Use PNG, JPG ou WEBP.' })
    }

    const buffer = await data.toBuffer()
    if (buffer.byteLength > 2 * 1024 * 1024) {
      return reply.status(400).send({ error: 'Arquivo muito grande. Máximo 2MB.' })
    }

    // UUID como nome de arquivo (nunca usar nome original)
    const ext = ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(data.filename).toLowerCase())
      ? path.extname(data.filename).toLowerCase()
      : '.png'
    const { randomUUID } = await import('node:crypto')
    const filename = `${companyId}-${randomUUID()}${ext}`
    const uploadsDir = path.join(process.cwd(), 'uploads', 'logos')

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true })
    }

    const filePath = path.join(uploadsDir, filename)
    fs.writeFileSync(filePath, buffer)

    const logoUrl = `${env.API_URL}/uploads/logos/${filename}`

    await prisma.company.update({
      where: { id: companyId },
      data: { logo: logoUrl },
    })

    return reply.send({ logoUrl })
  })
}
