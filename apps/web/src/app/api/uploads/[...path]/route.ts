/**
 * Proxy de imagens — /api/uploads/[...path]
 *
 * O browser chama /api/uploads/diary/xxx.webp (porta 3000).
 * Este handler busca http://localhost:3001/uploads/diary/xxx.webp no servidor
 * e repassa a resposta — eliminando qualquer problema de CORS ou
 * Cross-Origin-Resource-Policy entre as portas 3000 e 3001.
 *
 * Cache de 1 ano (imagens são imutáveis pelo timestamp no nome).
 */

import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL
  || process.env.API_URL
  || 'http://localhost:3001'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  // Next.js 15 exige await em params; Next.js 14 também aceita
  const { path } = await context.params
  const filePath = (path ?? []).join('/')

  if (!filePath) {
    return new NextResponse(null, { status: 404 })
  }

  try {
    const upstream = await fetch(`${API_URL}/uploads/${filePath}`, {
      // Sem cache no fetch do servidor para evitar stale em uploads recentes
      cache: 'no-store',
    })

    if (!upstream.ok) {
      console.warn(`[proxy/uploads] ${upstream.status} → /uploads/${filePath}`)
      return new NextResponse(null, { status: upstream.status })
    }

    const buffer      = await upstream.arrayBuffer()
    const contentType = upstream.headers.get('content-type') || 'image/webp'

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':  contentType,
        // Imagens são imutáveis (timestamp no nome do arquivo)
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (err) {
    console.error('[proxy/uploads] erro:', err)
    return new NextResponse(null, { status: 502 })
  }
}
