import { FastifyInstance } from 'fastify'
import { prisma } from '@sysobra/database'
import {
  authenticate,
  requireCompany,
  RequestWithMember,
  JwtPayload,
} from '../../middlewares/auth.middleware'

const p = () => prisma as any

const preHandler = [authenticate, requireCompany]

function companyId(req: RequestWithMember): string {
  return req.companyId
}

function userId(req: any): string {
  try { return (req.user as JwtPayload).sub } catch { return '' }
}

export async function notificationsRoutes(app: FastifyInstance) {
  // GET /api/v1/notifications — listar notificações do usuário atual
  app.get('/', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const uid = userId(req)

    const notifications = await p().notification.findMany({
      where: { companyId: cid, userId: uid },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const unreadCount = await p().notification.count({
      where: { companyId: cid, userId: uid, isRead: false },
    })

    return reply.send({ notifications, unreadCount })
  })

  // PATCH /api/v1/notifications/:id/read — marcar uma como lida
  app.patch('/:id/read', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const { id } = request.params as { id: string }
    const uid = userId(req)

    const notif = await p().notification.findFirst({
      where: { id, userId: uid },
    })
    if (!notif) return reply.status(404).send({ error: 'Notificação não encontrada' })

    await p().notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    })

    return reply.send({ ok: true })
  })

  // PATCH /api/v1/notifications/read-all — marcar todas como lidas
  app.patch('/read-all', { preHandler }, async (request, reply) => {
    const req = request as RequestWithMember
    const cid = companyId(req)
    const uid = userId(req)

    await p().notification.updateMany({
      where: { companyId: cid, userId: uid, isRead: false },
      data: { isRead: true, readAt: new Date() },
    })

    return reply.send({ ok: true })
  })
}
