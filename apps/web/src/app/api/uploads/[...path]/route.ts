/**
 * Proxy de imagens — /api/uploads/[...path]
 *
 * O browser chama /api/uploads/diary/xxx.webp (porta 3000).
 * Este handler busca http://localhost:3001/uploads/diary/xxx.webp no servidor
 * e repassa a resposta — eliminando qualquer problema de CORS ou
 * Cross-Origin-Resource-Policy entre portas diferentes.
 *
 * Cache de 1 ano (imagens são imutáveis pelo timestamp no nome do arquivo).
 */

import { NextRequest, NextResponse } from 'next/server'

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_URL ||
  'http://localhost:3001'

// Next.js 14: params é síncrono (não é Promise)
export async function GET(
  _request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const filePath = (params?.path ?? []).join('/')

  if (!filePath) {
    return new NextResponse(null, { status: 404 })
  }

  try {
    const upstream = await fetch(`${API_URL}/uploads/${filePath}`, {
      cache: 'no-store',
    })

    if (!upstream.ok) {
      return new NextResponse(null, { status: upstream.status })
    }

    const buffer      = await upstream.arrayBuffer()
    const contentType = upstream.headers.get('content-type') || 'image/webp'

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':  contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
