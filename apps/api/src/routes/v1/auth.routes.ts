import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@sysobra/database'
import { authenticate, DEFAULT_PERMISSIONS, JwtPayload } from '../../middlewares/auth.middleware'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
})

const selectCompanySchema = z.object({
  companyId: z.string().min(1),
})

// ─── Helper: calcula o status de assinatura para o frontend ─────────────────
// Valores: TRIAL | ACTIVE | PENDING | EXPIRED | CANCELLED

function calcSubscriptionStatus(company: {
  isActive: boolean
  trialEndsAt: Date | null
  stripeSubscriptionId: string | null
  plan: string
}): 'TRIAL' | 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'CANCELLED' {
  // Trial ativo
  if (company.trialEndsAt && new Date(company.trialEndsAt) > new Date()) {
    return 'TRIAL'
  }
  // Empresa desativada
  if (!company.isActive) {
    return 'EXPIRED'
  }
  // Assinatura paga ativa
  if (company.stripeSubscriptionId) {
    return 'ACTIVE'
  }
  // FREE sem trial → sem acesso
  if (company.plan === 'FREE') {
    return 'CANCELLED'
  }
  // Plano pago sem stripe → aguardando pagamento
  return 'PENDING'
}

// ─── Helper: decide o redirectTo conforme o status ───────────────────────────

function resolveRedirect(status: ReturnType<typeof calcSubscriptionStatus>): string {
  switch (status) {
    case 'TRIAL':
    case 'ACTIVE':
      return '/app/dashboard'
    case 'PENDING':
      return '/app/assinatura-pendente'
    case 'EXPIRED':
      return '/app/assinatura-vencida'
    case 'CANCELLED':
      return '/planos'
  }
}

// ─── Helper: monta a sessão de empresa ───────────────────────────────────────

async function buildCompanySession(userId: string, companyId: string, app: FastifyInstance) {
  const membership = await prisma.companyMember.findUnique({
    where: { companyId_userId: { companyId, userId } },
    include: { company: true },
  })

  if (!membership || !membership.isActive) return null

  // Permissões: usa as do membro se existirem, senão aplica o padrão por role
  const permissions =
    (membership.permissions as Record<string, unknown>) ??
    DEFAULT_PERMISSIONS[membership.memberRole] ??
    {}

  const subStatus = calcSubscriptionStatus(membership.company)
  const redirectTo = resolveRedirect(subStatus)

  // Gera novo token com companyId embutido
  const token = app.jwt.sign({
    sub: userId,
    companyId,
    role: membership.memberRole,
  } as object)

  return {
    token,
    company: {
      id:                   membership.company.id,
      name:                 membership.company.name,
      cnpj:                 membership.company.cnpj,
      logo:                 membership.company.logo,
      plan:                 membership.company.plan,
      subscriptionStatus:   subStatus,
      stripeSubscriptionId: membership.company.stripeSubscriptionId,
    },
    member: {
      id:         membership.id,
      role:       membership.role,
      memberRole: membership.memberRole,
      memberType: membership.memberType,
    },
    permissions,
    redirectTo,
  }
}

export async function authRoutes(app: FastifyInstance) {
  // ── POST /register ─────────────────────────────────────────────────────────
  app.post('/register', async (request, reply) => {
    const body = registerSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Dados inválidos', details: body.error.flatten() })
    }

    const { name, email, password } = body.data

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return reply.status(409).send({ error: 'E-mail já cadastrado' })
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: { name, email, passwordHash: hashedPassword },
      select: { id: true, name: true, email: true, createdAt: true },
    })

    // Token inicial sem companyId — será atualizado após criar empresa + select-company
    const token = app.jwt.sign({ sub: user.id, email: user.email } as object)

    return reply.status(201).send({ user, token })
  })

  // ── POST /login ────────────────────────────────────────────────────────────
  app.post('/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Dados inválidos', details: body.error.flatten() })
    }

    const { email, password } = body.data

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.passwordHash) {
      return reply.status(401).send({ error: 'Credenciais inválidas' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return reply.status(401).send({ error: 'Credenciais inválidas' })
    }

    // Busca todas as empresas ativas do usuário
    const memberships = await prisma.companyMember.findMany({
      where: { userId: user.id, isActive: true },
      include: { company: true },
      orderBy: { joinedAt: 'asc' },
    })

    // Token base sem companyId
    const baseToken = app.jwt.sign({ sub: user.id, email: user.email } as object)

    // ── Sem empresa: redireciona para /planos ──────────────────────────────
    if (memberships.length === 0) {
      return reply.send({
        user: { id: user.id, name: user.name, email: user.email },
        token: baseToken,
        companies: [],
        requiresCompanySelection: false,
        noCompanies: true, // sinaliza ao frontend para ir para /planos
      })
    }

    // ── Empresa única: auto-seleciona ──────────────────────────────────────
    if (memberships.length === 1) {
      const session = await buildCompanySession(user.id, memberships[0].companyId, app)
      if (session) {
        return reply.send({
          user: { id: user.id, name: user.name, email: user.email },
          token: session.token,
          company: session.company,
          member: session.member,
          permissions: session.permissions,
          redirectTo: session.redirectTo,
          requiresCompanySelection: false,
        })
      }
    }

    // ── Múltiplas empresas: retorna lista para seleção ─────────────────────
    const companies = memberships.map((m) => ({
      id:                   m.company.id,
      name:                 m.company.name,
      cnpj:                 m.company.cnpj,
      logo:                 m.company.logo,
      plan:                 m.company.plan,
      subscriptionStatus:   calcSubscriptionStatus(m.company),
      stripeSubscriptionId: m.company.stripeSubscriptionId,
      memberRole:           m.memberRole,
      memberType:           m.memberType,
    }))

    return reply.send({
      user: { id: user.id, name: user.name, email: user.email },
      token: baseToken,
      companies,
      requiresCompanySelection: true,
    })
  })

  // ── POST /select-company ───────────────────────────────────────────────────
  // Recebe o token base (sem companyId) + companyId, retorna token com empresa
  app.post('/select-company', { preHandler: [authenticate] }, async (request, reply) => {
    const payload = request.user as JwtPayload
    const body = selectCompanySchema.safeParse(request.body)

    if (!body.success) {
      return reply.status(400).send({ error: 'companyId inválido' })
    }

    const { companyId } = body.data
    const session = await buildCompanySession(payload.sub, companyId, app)

    if (!session) {
      return reply.status(403).send({
        error: 'Acesso negado a esta empresa',
        redirectTo: '/planos',
      })
    }

    // Sempre retorna o token — o redirectTo orienta o frontend sobre para onde ir.
    // Empresas CANCELLED (FREE sem assinatura) recebem token mas redirectTo='/planos'.
    // Isso permite que o fluxo de cadastro + pagamento funcione corretamente.
    return reply.send(session)
  })

  // ── POST /logout-company ───────────────────────────────────────────────────
  // Troca o token com empresa por um token base (sem companyId).
  // O frontend usa isso ao clicar em "Trocar empresa".
  app.post('/logout-company', { preHandler: [authenticate] }, async (request, reply) => {
    const payload = request.user as JwtPayload

    // Gera token base sem companyId
    const baseToken = app.jwt.sign({ sub: payload.sub, email: payload.email } as object)

    return reply.send({ token: baseToken })
  })

  // ── GET /me ────────────────────────────────────────────────────────────────
  app.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
    const payload = request.user as JwtPayload

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true },
    })

    if (!user) {
      return reply.status(404).send({ error: 'Usuário não encontrado' })
    }

    return reply.send({ user })
  })

  // ── GET /companies ─────────────────────────────────────────────────────────
  // Lista empresas do usuário logado (para a tela de seleção)
  app.get('/companies', { preHandler: [authenticate] }, async (request, reply) => {
    const payload = request.user as JwtPayload

    const memberships = await prisma.companyMember.findMany({
      where: { userId: payload.sub, isActive: true },
      include: { company: true },
      orderBy: { joinedAt: 'asc' },
    })

    const companies = memberships.map((m) => ({
      id:                   m.company.id,
      name:                 m.company.name,
      cnpj:                 m.company.cnpj,
      logo:                 m.company.logo,
      plan:                 m.company.plan,
      subscriptionStatus:   calcSubscriptionStatus(m.company),
      stripeSubscriptionId: m.company.stripeSubscriptionId,
      memberRole:           m.memberRole,
      memberType:           m.memberType,
    }))

    return reply.send({ companies })
  })
}
