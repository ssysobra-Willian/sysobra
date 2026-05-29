import { FastifyInstance } from 'fastify'
import { prisma } from '@sysobra/database'
import crypto from 'crypto'

const p = prisma as any

// ── Rotas PÚBLICAS do Diário de Obra (sem autenticação) ──────────────────────
// Registradas em server.ts com prefix '/api/v1/diary'

export async function diaryPublicRoutes(app: FastifyInstance) {

  // ── GET /api/v1/diary/public/sign/:token ─────────────────────────────────
  // Retorna dados do RDO para assinatura do fiscal externo (sem auth)
  app.get('/public/sign/:token', async (request, reply) => {
    const { token } = request.params as { token: string }

    const entry = await p.diaryEntry.findFirst({
      where: {
        fiscalSignatureToken:          token,
        fiscalSignatureTokenExpiresAt: { gt: new Date() },
      },
      include: {
        project: { select: { name: true, code: true } },
        author:  { select: { name: true } },
      },
    })

    if (!entry) {
      return reply.status(404).send({ error: 'Link inválido ou expirado' })
    }

    if (entry.fiscalSigned) {
      return reply.send({
        alreadySigned: true,
        reportNumber:  entry.reportNumber,
        projectName:   entry.project?.name ?? null,
      })
    }

    return reply.send({
      id:           entry.id,
      reportNumber: entry.reportNumber,
      date:         entry.date,
      projectName:  entry.project?.name  ?? null,
      projectCode:  entry.project?.code  ?? null,
      authorName:   entry.author?.name   ?? null,
      fiscalName:   entry.fiscalName     ?? null,
      alreadySigned: false,
    })
  })

  // ── POST /api/v1/diary/public/sign/:token ────────────────────────────────
  // Fiscal externo assina o RDO
  app.post('/public/sign/:token', async (request, reply) => {
    const { token } = request.params as { token: string }
    const body      = request.body as { signatureData?: string; fiscalName?: string }

    if (!body.signatureData) {
      return reply.status(400).send({ error: 'signatureData é obrigatório' })
    }

    const entry = await p.diaryEntry.findFirst({
      where: {
        fiscalSignatureToken:          token,
        fiscalSignatureTokenExpiresAt: { gt: new Date() },
        fiscalSigned:                  false,
      },
    })

    if (!entry) {
      return reply.status(404).send({ error: 'Link inválido, expirado ou já assinado' })
    }

    // Hash de verificação único
    const verificationHash = crypto
      .createHash('sha256')
      .update(`${entry.id}-fiscal-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`)
      .digest('hex')

    await p.diaryEntry.update({
      where: { id: entry.id },
      data: {
        fiscalSignatureUrl: body.signatureData,
        fiscalSigned:       true,
        fiscalName:         body.fiscalName || entry.fiscalName,
        verificationHash,
        // Invalida o token após uso
        fiscalSignatureToken:          null,
        fiscalSignatureTokenExpiresAt: null,
      },
    })

    return reply.send({
      success:          true,
      verificationHash,
      message:          'RDO assinado com sucesso!',
    })
  })
}
