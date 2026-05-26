import { FastifyInstance } from 'fastify'
import { authenticate } from '../../middlewares/auth.middleware'
import { prisma } from '@sysobra/database'

export async function companyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /api/v1/companies
  app.get('/', async (request, reply) => {
    const payload = request.user as { sub: string }
    const memberships = await prisma.companyMember.findMany({
      where: { userId: payload.sub },
      include: { company: true },
    })
    return reply.send({ companies: memberships.map((m) => m.company) })
  })
}
