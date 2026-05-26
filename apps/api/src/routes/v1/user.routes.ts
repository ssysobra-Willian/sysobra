import { FastifyInstance } from 'fastify'
import { authenticate } from '../../middlewares/auth.middleware'
import { prisma } from '@sysobra/database'

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /api/v1/users/profile
  app.get('/profile', async (request, reply) => {
    const payload = request.user as { sub: string }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        phone: true,
        createdAt: true,
      },
    })
    return reply.send({ user })
  })
}
