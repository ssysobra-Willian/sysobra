import { FastifyInstance } from 'fastify'
import * as fs from 'fs'
import * as path from 'path'
import {
  authenticate,
  requireCompany,
  RequestWithMember,
} from '../../middlewares/auth.middleware'

const UPLOADS_ROOT = path.join(process.cwd(), 'uploads')
const MAX_DIARY_SIZE    = 10 * 1024 * 1024  // 10 MB
const MAX_COVER_SIZE    =  5 * 1024 * 1024  //  5 MB
const ALLOWED_TYPES     = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

function safeFilename(original: string): string {
  return original
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 100)
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
  }
  return Buffer.concat(chunks)
}

export async function uploadRoutes(app: FastifyInstance) {
  // ── POST /api/v1/uploads/diary-photo ────────────────────────────────────────
  app.post('/diary-photo', {
    preHandler: [authenticate, requireCompany],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req

    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado' })

    // ── Validar tipo ──────────────────────────────────────────────────────────
    if (!ALLOWED_TYPES.includes(data.mimetype)) {
      return reply.status(400).send({ error: 'Tipo inválido. Apenas JPEG, PNG, WEBP e HEIC são aceitos.' })
    }

    // ── Ler stream completo ───────────────────────────────────────────────────
    let buffer: Buffer
    try {
      buffer = await streamToBuffer(data.file)
    } catch {
      return reply.status(500).send({ error: 'Erro ao ler arquivo' })
    }

    // ── Validar tamanho ───────────────────────────────────────────────────────
    if (buffer.length > MAX_DIARY_SIZE) {
      return reply.status(400).send({ error: 'Arquivo muito grande. Máximo 10MB.' })
    }

    // ── Obter diaryId dos campos do form ──────────────────────────────────────
    const diaryId = (data.fields as any)?.diaryId?.value ?? 'temp'

    // ── Criar diretório e salvar ──────────────────────────────────────────────
    const dir = path.join(UPLOADS_ROOT, 'diary', companyId, String(diaryId))
    fs.mkdirSync(dir, { recursive: true })

    const timestamp = Date.now()
    const filename  = `${timestamp}-${safeFilename(data.filename)}`
    const fullPath  = path.join(dir, filename)
    fs.writeFileSync(fullPath, buffer)

    const url = `/uploads/diary/${companyId}/${diaryId}/${filename}`
    return reply.send({ url, filename, size: buffer.length })
  })

  // ── DELETE /api/v1/uploads/diary-photo ──────────────────────────────────────
  app.delete('/diary-photo', {
    preHandler: [authenticate, requireCompany],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req
    const body = request.body as { url?: string }

    if (!body?.url) return reply.status(400).send({ error: 'URL obrigatória' })

    // Validar que o path pertence a esta empresa
    const urlPath = body.url.replace(/^\/uploads\//, '')
    if (!urlPath.startsWith(`diary/${companyId}/`) && !urlPath.startsWith(`projects/${companyId}/`)) {
      return reply.status(403).send({ error: 'Acesso negado' })
    }

    const fullPath = path.join(UPLOADS_ROOT, urlPath)

    try {
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
      return reply.send({ success: true })
    } catch {
      return reply.status(500).send({ error: 'Erro ao remover arquivo' })
    }
  })

  // ── POST /api/v1/uploads/project-cover ──────────────────────────────────────
  app.post('/project-cover', {
    preHandler: [authenticate, requireCompany],
  }, async (request, reply) => {
    const req = request as RequestWithMember
    const { companyId } = req

    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado' })

    if (!ALLOWED_TYPES.includes(data.mimetype)) {
      return reply.status(400).send({ error: 'Tipo inválido. Apenas imagens JPEG, PNG e WEBP são aceitas.' })
    }

    let buffer: Buffer
    try {
      buffer = await streamToBuffer(data.file)
    } catch {
      return reply.status(500).send({ error: 'Erro ao ler arquivo' })
    }

    if (buffer.length > MAX_COVER_SIZE) {
      return reply.status(400).send({ error: 'Arquivo muito grande. Máximo 5MB.' })
    }

    const dir = path.join(UPLOADS_ROOT, 'projects', companyId)
    fs.mkdirSync(dir, { recursive: true })

    const timestamp = Date.now()
    const ext       = data.mimetype === 'image/png' ? 'png' : 'jpg'
    const filename  = `${timestamp}-cover.${ext}`
    const fullPath  = path.join(dir, filename)
    fs.writeFileSync(fullPath, buffer)

    const url = `/uploads/projects/${companyId}/${filename}`
    return reply.send({ url })
  })
}
