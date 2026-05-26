import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'

import { FastifyRequest, FastifyReply } from 'fastify'
import { authRoutes } from './routes/v1/auth.routes'
import { userRoutes } from './routes/v1/user.routes'
import { companyRoutes } from './routes/v1/company.routes'
import { projectRoutes } from './routes/v1/project.routes'
import { env } from './utils/env'

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
})

async function bootstrap() {
  // Plugins de segurança
  await app.register(helmet, { global: true })

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  // CORS
  await app.register(cors, {
    origin: env.ALLOWED_ORIGINS.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  // JWT
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: '7d' },
  })

  // Decorator de autenticação
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'Não autorizado', message: 'Token inválido ou expirado' })
    }
  })

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString(), env: env.NODE_ENV }
  })

  // Rotas v1
  await app.register(authRoutes, { prefix: '/api/v1/auth' })
  await app.register(userRoutes, { prefix: '/api/v1/users' })
  await app.register(companyRoutes, { prefix: '/api/v1/companies' })
  await app.register(projectRoutes, { prefix: '/api/v1/projects' })

  // Inicia o servidor
  const port = parseInt(env.PORT, 10)
  const host = env.HOST

  await app.listen({ port, host })
  console.log(`🚀 API SYSOBRA rodando em http://${host}:${port}`)
}

bootstrap().catch((err) => {
  console.error('Erro ao iniciar o servidor:', err)
  process.exit(1)
})
