import { FastifyInstance } from 'fastify'
import { authenticate } from '../../middlewares/auth.middleware'
import { prisma } from '@sysobra/database'

export async function projectRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /api/v1/projects?companyId=xxx
  app.get('/', async (request, reply) => {
    const { companyId } = request.query as { companyId?: string }

    if (!companyId) {
      return reply.status(400).send({ error: 'companyId é obrigatório' })
    }

    const projects = await prisma.project.findMany({
      where: { companyId },
      include: { stages: true, client: true },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send({ projects })
  })
}
