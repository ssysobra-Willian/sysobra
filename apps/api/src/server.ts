import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import staticFiles from '@fastify/static'
import { FastifyRequest, FastifyReply } from 'fastify'
import path from 'path'

import { authRoutes }     from './routes/v1/auth.routes'
import { userRoutes }     from './routes/v1/user.routes'
import { companyRoutes }  from './routes/v1/company.routes'
import { projectRoutes }  from './routes/v1/project.routes'
import { memberRoutes }   from './routes/v1/member.routes'
import { diaryRoutes }    from './routes/v1/diary.routes'
import { financialRoutes } from './routes/v1/financial.routes'
import { clientRoutes }   from './routes/v1/client.routes'
import { supplierRoutes } from './routes/v1/supplier.routes'
import { uploadRoutes }   from './routes/v1/upload.routes'
import { stripeRoutes }   from './routes/stripe'
import { env } from './utils/env'
import { prisma } from '@sysobra/database'

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
  // ── Segurança ────────────────────────────────────────────────────────────
  await app.register(helmet, {
    global: true,
    // Permite que /uploads/* sejam carregados por origens diferentes (browser cross-origin).
    // O padrão "same-origin" bloquearia as imagens servidas pelo @fastify/static quando o
    // frontend roda numa porta diferente do backend.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  // ── CORS ─────────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: env.ALLOWED_ORIGINS.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  // ── JWT ──────────────────────────────────────────────────────────────────
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: '7d' },
  })

  // ── Authenticate decorator ───────────────────────────────────────────────
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'Não autorizado', message: 'Token inválido ou expirado' })
    }
  })

  // ── Multipart (upload de arquivos) ───────────────────────────────────────
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB (fotos diário até 10MB, capa até 5MB validado na rota)
  })

  // ── Arquivos estáticos (uploads) ─────────────────────────────────────────
  const uploadsDir = path.join(process.cwd(), 'uploads')
  await app.register(staticFiles, {
    root:           uploadsDir,
    prefix:         '/uploads/',
    decorateReply:  false,
    // Cabeçalhos CORS e cache em cada arquivo servido
    setHeaders(res) {
      res.setHeader('Access-Control-Allow-Origin',   '*')
      res.setHeader('Cross-Origin-Resource-Policy',  'cross-origin')
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    },
  })

  // ── Health check ─────────────────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
  }))

  // ── Rota pública: verificação de lançamento por hash ─────────────────────
  // Sem autenticação — usada pelo QR code / link público de recibo
  app.get('/api/financial/verify/:hash', async (request, reply) => {
    const { hash } = request.params as { hash: string }

    const tx = await (prisma as any).financialTransaction.findFirst({
      where: { transactionHash: hash },
      select: {
        id: true,
        description: true,
        type: true,
        status: true,
        isPaid: true,
        netAmount: true,
        grossAmount: true,
        dueDate: true,
        paidAt: true,
        referenceDate: true,
        transactionNumber: true,
        transactionHash: true,
        createdAt: true,
        company: { select: { name: true, cnpj: true } },
        category: { select: { name: true, color: true } },
        client:   { select: { name: true } },
        supplier: { select: { name: true } },
      },
    })

    if (!tx) return reply.status(404).send({ valid: false, error: 'Lançamento não encontrado ou hash inválido' })

    return reply.send({
      valid: true,
      transactionNumber: tx.transactionNumber,
      transactionHash:   tx.transactionHash,
      description:       tx.description,
      type:              tx.type,
      status:            tx.status,
      isPaid:            tx.isPaid,
      netAmount:         Number(tx.netAmount),
      grossAmount:       Number(tx.grossAmount),
      dueDate:           tx.dueDate,
      paidAt:            tx.paidAt,
      referenceDate:     tx.referenceDate,
      createdAt:         tx.createdAt,
      company:           tx.company,
      category:          tx.category,
      client:            tx.client,
      supplier:          tx.supplier,
    })
  })

  // ── Rotas v1 ─────────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/api/v1/auth' })
  await app.register(userRoutes, { prefix: '/api/v1/users' })
  await app.register(companyRoutes, { prefix: '/api/v1/companies' })
  await app.register(projectRoutes, { prefix: '/api/v1/projects' })
  await app.register(memberRoutes, { prefix: '/api/v1/company' })
  await app.register(diaryRoutes,     { prefix: '/api/v1/diary' })
  await app.register(financialRoutes, { prefix: '/api/financial' })
  await app.register(clientRoutes,   { prefix: '/api/v1/clients' })
  await app.register(supplierRoutes, { prefix: '/api/v1/suppliers' })
  await app.register(uploadRoutes,   { prefix: '/api/v1/uploads' })

  // ── Rotas Stripe ─────────────────────────────────────────────────────────
  await app.register(stripeRoutes, { prefix: '/api/stripe' })

  // ── Start ─────────────────────────────────────────────────────────────────
  const port = parseInt(env.PORT, 10)
  const host = env.HOST

  await app.listen({ port, host })
  console.log(`🚀 API SYSOBRA rodando em http://${host}:${port}`)
}

bootstrap().catch((err) => {
  console.error('Erro ao iniciar o servidor:', err)
  process.exit(1)
})
