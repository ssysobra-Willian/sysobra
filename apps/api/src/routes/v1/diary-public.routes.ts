import { FastifyInstance } from 'fastify'
import { prisma } from '@sysobra/database'
import crypto from 'crypto'
import { generatePdf } from '../../utils/pdf'
import { buildDiaryPdfHtml } from './diary.routes'
import { sendEmail, buildSignedEmailHtml } from '../../utils/mailer'

const p = prisma as any

// ── Include compartilhado para queries de PDF ─────────────────────────────────
const PDF_INCLUDE = {
  author:       { select: { name: true } },
  approvedBy:   { select: { name: true } },
  project:      { include: { company: { select: { name: true, cnpj: true, logo: true, address: true, city: true, state: true } } } },
  stageEntries: { include: { stage: { select: { name: true, code: true } } } },
  occurrences:  true,
  rainRecord:   true,
}

// ── Rotas PÚBLICAS do Diário de Obra (sem autenticação) ──────────────────────
// Registradas em server.ts com prefix '/api/v1/diary'

/** Busca entry por fiscalSignatureToken (válido ou expirado, para prévia) ou verificationHash (pós-assinatura) */
async function findEntryForPdf(lookup: string) {
  // Tenta como fiscalSignatureToken (sem verificar TTL — prévia é permitida mesmo expirado)
  let entry = await p.diaryEntry.findFirst({
    where:   { fiscalSignatureToken: lookup },
    include: PDF_INCLUDE,
  })
  if (entry) return entry

  // Tenta como verificationHash (pós assinatura)
  entry = await p.diaryEntry.findFirst({
    where:   { verificationHash: lookup },
    include: PDF_INCLUDE,
  })
  return entry ?? null
}

/** Gera PDF e retorna buffer + equipamentos */
async function buildPdfBuffer(entry: any): Promise<Buffer> {
  const proj    = entry.project
  const company = proj?.company ?? {}

  const equipments = await p.diaryEquipment.findMany({
    where:   { diaryEntryId: entry.id, usedInRdo: true },
    include: { item: { select: { name: true, brand: true, model: true, serialNumber: true, toolType: true } } },
  })

  const html = buildDiaryPdfHtml(entry, proj, company, equipments, {
    authorSignatureUrl:   entry.authorSignatureUrl,
    approverSignatureUrl: entry.approverSignatureUrl,
    fiscalSignatureUrl:   entry.fiscalSignatureUrl,
    authorName:           entry.author?.name,
    approverName:         entry.approvedBy?.name,
    fiscalName:           entry.fiscalName,
    fiscalDocument:       entry.fiscalDocument,
    authorSigned:         entry.authorSigned,
    approverSigned:       entry.approverSigned,
    fiscalSigned:         entry.fiscalSigned,
  })

  return generatePdf({ kind: 'raw', html } as any)
}

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
      id:            entry.id,
      reportNumber:  entry.reportNumber,
      date:          entry.date,
      projectName:   entry.project?.name  ?? null,
      projectCode:   entry.project?.code  ?? null,
      authorName:    entry.author?.name   ?? null,
      fiscalName:    entry.fiscalName     ?? null,
      alreadySigned: false,
    })
  })

  // ── POST /api/v1/diary/public/sign/:token ────────────────────────────────
  // Fiscal externo assina o RDO
  app.post('/public/sign/:token', async (request, reply) => {
    const { token } = request.params as { token: string }
    const body      = request.body as {
      signatureData?:  string
      fiscalName?:     string
      fiscalDocument?: string  // CPF do fiscal
      fiscalEmail?:    string  // email opcional (para notificação de conclusão)
    }

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

    const finalEmail = body.fiscalEmail || entry.fiscalEmail || null

    await p.diaryEntry.update({
      where: { id: entry.id },
      data: {
        fiscalSignatureUrl:            body.signatureData,
        fiscalSigned:                  true,
        fiscalName:                    body.fiscalName    || entry.fiscalName,
        fiscalDocument:                body.fiscalDocument || null,
        fiscalEmail:                   finalEmail,
        verificationHash,
        // Invalida o token após uso
        fiscalSignatureToken:          null,
        fiscalSignatureTokenExpiresAt: null,
      },
    })

    // Verificar se todos assinaram e enviar email ao fiscal
    const updated = await p.diaryEntry.findFirst({
      where:   { id: entry.id },
      include: {
        project: { select: { name: true } },
        author:  { select: { name: true } },
      },
    })

    if (
      updated?.authorSigned &&
      updated?.approverSigned &&
      updated?.fiscalSigned &&
      finalEmail
    ) {
      const apiUrl      = process.env.API_URL || 'http://localhost:3001'
      const downloadLink = `${apiUrl}/api/v1/diary/public/download/${verificationHash}`

      const emailHtml = buildSignedEmailHtml({
        fiscalName:   updated.fiscalName    || 'Fiscal',
        reportNumber: updated.reportNumber  || 'RDO',
        projectName:  updated.project?.name || '',
        date:         new Date(updated.date).toLocaleDateString('pt-BR'),
        downloadLink,
      })

      sendEmail({
        to:      finalEmail,
        subject: `✅ RDO assinado — ${updated.reportNumber} | ${updated.project?.name ?? ''}`,
        html:    emailHtml,
      }).catch((err: unknown) => app.log.error(err, 'Falha ao enviar email pós-assinatura'))
    }

    return reply.send({
      success:          true,
      verificationHash,
      message:          'RDO assinado com sucesso!',
    })
  })

  // ── GET /api/v1/diary/public/pdf/:lookup ─────────────────────────────────
  // Prévia do PDF — aceita fiscalSignatureToken (antes de assinar) ou verificationHash (depois)
  // Content-Disposition: inline (visualização no browser)
  app.get('/public/pdf/:lookup', async (request, reply) => {
    const { lookup } = request.params as { lookup: string }

    const entry = await findEntryForPdf(lookup)
    if (!entry) return reply.status(404).send({ error: 'RDO não encontrado ou link inválido' })

    try {
      const pdfBuffer = await buildPdfBuffer(entry)
      const filename  = `RDO-${entry.reportNumber ?? entry.id}.pdf`
      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="${filename}"`)
        .send(pdfBuffer)
    } catch (err) {
      request.log.error(err, 'Public PDF generation failed')
      return reply.status(500).send({ error: 'Falha ao gerar PDF' })
    }
  })

  // ── GET /api/v1/diary/public/download/:lookup ────────────────────────────
  // Download do PDF — mesma lógica, Content-Disposition: attachment
  app.get('/public/download/:lookup', async (request, reply) => {
    const { lookup } = request.params as { lookup: string }

    const entry = await findEntryForPdf(lookup)
    if (!entry) return reply.status(404).send({ error: 'RDO não encontrado ou link inválido' })

    try {
      const pdfBuffer = await buildPdfBuffer(entry)
      const filename  = `RDO-${entry.reportNumber ?? entry.id}-assinado.pdf`
      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(pdfBuffer)
    } catch (err) {
      request.log.error(err, 'Public PDF download failed')
      return reply.status(500).send({ error: 'Falha ao gerar PDF' })
    }
  })
}
