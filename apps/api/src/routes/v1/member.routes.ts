import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@sysobra/database'
import { authenticate, requireCompany, requirePermission, DEFAULT_PERMISSIONS, RequestWithMember } from '../../middlewares/auth.middleware'

// ─── Schemas ─────────────────────────────────────────────────────────────────

const inviteSchema = z.object({
  email: z.string().email(),
  memberRole: z.enum(['MANAGER', 'MEMBER', 'EXTERNAL', 'CLIENT']),
  memberType: z.enum(['INTERNAL', 'EXTERNAL', 'CLIENT']).optional(),
  permissions: z.record(z.array(z.string())).optional(),
  projectIds: z.array(z.string()).optional(), // obras permitidas para MEMBER/EXTERNAL/CLIENT
  clientName: z.string().optional(),          // para tipo CLIENT
})

const updatePermissionsSchema = z.object({
  memberId: z.string(),
  permissions: z.union([
    z.record(z.array(z.string())),
    z.object({ all: z.literal(true) }),
  ]),
  projectIds: z.array(z.string()).optional(),
})

export async function memberRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // ── GET /members — lista membros da empresa ───────────────────────────────
  app.get('/members', {
    preHandler: [requireCompany, requirePermission('configuracoes', 'view')],
  }, async (request, reply) => {
    const { companyId } = request as RequestWithMember

    const members = await prisma.companyMember.findMany({
      where: { companyId, isActive: true },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        projectAccesses: { include: { project: { select: { id: true, name: true } } } },
      },
      orderBy: { joinedAt: 'asc' },
    })

    return reply.send({
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        memberRole: m.memberRole,
        memberType: m.memberType,
        permissions: m.permissions,
        joinedAt: m.joinedAt,
        projects: m.projectAccesses.map((pa) => pa.project),
      })),
    })
  })

  // ── GET /invites — lista convites pendentes ───────────────────────────────
  app.get('/invites', {
    preHandler: [requireCompany, requirePermission('configuracoes', 'view')],
  }, async (request, reply) => {
    const { companyId } = request as RequestWithMember

    const invites = await prisma.invite.findMany({
      where: { companyId, status: 'PENDING' },
      include: { sender: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send({
      invites: invites.map((i) => ({
        id: i.id,
        email: i.email,
        memberRole: i.memberRole,
        memberType: i.memberType,
        permissions: i.permissions,
        status: i.status,
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
        sentBy: i.sender.name,
      })),
    })
  })

  // ── POST /invites — envia convite ─────────────────────────────────────────
  app.post('/invites', {
    preHandler: [requireCompany, requirePermission('configuracoes', 'view')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId, permissions: actorPermissions } = req

    // Somente OWNER/ADMIN/MANAGER podem convidar
    if (!((actorPermissions as any)?.all === true) && req.memberRole === 'MEMBER') {
      return reply.status(403).send({ error: 'Sem permissão para convidar usuários' })
    }

    const body = inviteSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Dados inválidos', details: body.error.flatten() })
    }

    const { email, memberRole, memberType, permissions, projectIds, clientName } = body.data

    // Garante que EXTERNAL/CLIENT não recebam permissões indevidas
    let finalPermissions: Record<string, string[]> | { all: boolean } | undefined = permissions

    if (memberRole === 'EXTERNAL') {
      finalPermissions = {
        diario_obra: (permissions?.['diario_obra'] ?? ['view', 'create', 'edit', 'comment']).filter(
          (a) => !['approve', 'delete'].includes(a),
        ),
      }
    } else if (memberRole === 'CLIENT') {
      finalPermissions = { diario_obra: ['view', 'comment'] }
    } else if (!permissions) {
      finalPermissions = DEFAULT_PERMISSIONS[memberRole] as Record<string, string[]>
    }

    const resolvedMemberType = memberType ?? (
      memberRole === 'EXTERNAL' ? 'EXTERNAL' :
      memberRole === 'CLIENT'   ? 'CLIENT'   : 'INTERNAL'
    )

    // Verifica se já existe membro/convite ativo para este email
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      const existingMember = await prisma.companyMember.findUnique({
        where: { companyId_userId: { companyId, userId: existingUser.id } },
      })
      if (existingMember?.isActive) {
        return reply.status(409).send({ error: 'Usuário já é membro desta empresa' })
      }
    }

    const payload = request.user as { sub: string }
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 dias

    const invite = await prisma.invite.create({
      data: {
        companyId,
        senderId: payload.sub,
        email,
        role: 'VIEWER',
        memberRole,
        memberType: resolvedMemberType as any,
        permissions: finalPermissions as any,
        expiresAt,
      },
    })

    // TODO: enviar e-mail de convite (integração com serviço de email)
    // Por ora retorna o token para testes
    return reply.status(201).send({
      invite: {
        id: invite.id,
        email: invite.email,
        token: invite.token,
        memberRole: invite.memberRole,
        expiresAt: invite.expiresAt,
      },
      message: `Convite enviado para ${email}`,
    })
  })

  // ── DELETE /invites/:id — cancela convite ─────────────────────────────────
  app.delete('/invites/:id', {
    preHandler: [requireCompany, requirePermission('configuracoes', 'view')],
  }, async (request, reply) => {
    const { companyId } = request as RequestWithMember
    const { id } = request.params as { id: string }

    const invite = await prisma.invite.findFirst({
      where: { id, companyId },
    })
    if (!invite) return reply.status(404).send({ error: 'Convite não encontrado' })

    await prisma.invite.update({ where: { id }, data: { status: 'EXPIRED' } })
    return reply.send({ ok: true })
  })

  // ── PUT /members/permissions — atualiza permissões de um membro ───────────
  app.put('/members/permissions', {
    preHandler: [requireCompany, requirePermission('configuracoes', 'view')],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req

    // Somente OWNER/ADMIN podem editar permissões
    if (!((req.permissions as any)?.all === true)) {
      return reply.status(403).send({ error: 'Somente Owner/Admin podem editar permissões' })
    }

    const body = updatePermissionsSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Dados inválidos', details: body.error.flatten() })
    }

    const { memberId, permissions, projectIds } = body.data

    // Verifica que o membro pertence a esta empresa
    const member = await prisma.companyMember.findFirst({
      where: { id: memberId, companyId },
    })
    if (!member) return reply.status(404).send({ error: 'Membro não encontrado' })

    await prisma.companyMember.update({
      where: { id: memberId },
      data: { permissions: permissions as any },
    })

    // Atualiza restrições de obras se fornecidas
    if (projectIds !== undefined) {
      // Remove acessos anteriores
      await prisma.memberProjectAccess.deleteMany({ where: { memberId } })

      // Cria novos
      if (projectIds.length > 0) {
        await prisma.memberProjectAccess.createMany({
          data: projectIds.map((projectId) => ({ memberId, projectId, companyId })),
          skipDuplicates: true,
        })
      }
    }

    return reply.send({ ok: true, message: 'Permissões atualizadas' })
  })

  // ── DELETE /members/:id — remove membro ──────────────────────────────────
  app.delete('/members/:id', {
    preHandler: [requireCompany],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const { id } = request.params as { id: string }

    if (!((req.permissions as any)?.all === true)) {
      return reply.status(403).send({ error: 'Somente Owner/Admin podem remover membros' })
    }

    const member = await prisma.companyMember.findFirst({
      where: { id, companyId },
    })
    if (!member) return reply.status(404).send({ error: 'Membro não encontrado' })

    // Impede remoção do próprio Owner
    if (member.memberRole === 'OWNER') {
      return reply.status(400).send({ error: 'O proprietário não pode ser removido' })
    }

    await prisma.companyMember.update({
      where: { id },
      data: { isActive: false },
    })

    return reply.send({ ok: true })
  })

  // ── POST /invites/accept/:token — aceita convite ──────────────────────────
  // Rota pública (sem preHandler de auth) para uso no onboarding
  app.post('/invites/accept/:token', async (request, reply) => {
    const { token } = request.params as { token: string }
    const payload = request.user as { sub: string } | undefined

    const invite = await prisma.invite.findUnique({ where: { token } })

    if (!invite || invite.status !== 'PENDING') {
      return reply.status(404).send({ error: 'Convite inválido ou expirado' })
    }

    if (new Date() > invite.expiresAt) {
      await prisma.invite.update({ where: { id: invite.id }, data: { status: 'EXPIRED' } })
      return reply.status(410).send({ error: 'Convite expirado' })
    }

    // Verifica se o usuário autenticado corresponde ao email convidado
    if (payload?.sub) {
      const user = await prisma.user.findUnique({ where: { id: payload.sub } })
      if (!user || user.email !== invite.email) {
        return reply.status(403).send({ error: 'Este convite pertence a outro usuário' })
      }

      // Cria ou reativa membro
      await prisma.companyMember.upsert({
        where: { companyId_userId: { companyId: invite.companyId, userId: user.id } },
        create: {
          companyId: invite.companyId,
          userId: user.id,
          role: invite.role,
          memberRole: invite.memberRole,
          memberType: invite.memberType as any,
          permissions: invite.permissions as any,
          isActive: true,
        },
        update: {
          role: invite.role,
          memberRole: invite.memberRole,
          memberType: invite.memberType as any,
          permissions: invite.permissions as any,
          isActive: true,
        },
      })

      await prisma.invite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED', receiverId: user.id },
      })

      return reply.send({ ok: true, message: 'Convite aceito com sucesso' })
    }

    // Usuário não autenticado — retorna dados do convite para o frontend completar o fluxo
    return reply.send({
      invite: {
        id: invite.id,
        email: invite.email,
        memberRole: invite.memberRole,
        companyId: invite.companyId,
      },
    })
  })
}
