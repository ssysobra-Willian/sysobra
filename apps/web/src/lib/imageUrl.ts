/**
 * Converte qualquer URL de imagem para o proxy interno do Next.js (/api/uploads/...).
 *
 * Formatos aceitos:
 *   /uploads/diary/xxx.webp          → /api/uploads/diary/xxx.webp
 *   http://localhost:3001/uploads/... → /api/uploads/...
 *   /api/uploads/...                  → retorna como está (já é proxy)
 *   blob:...                          → retorna como está (preview local)
 *   https://cdn.example.com/...       → retorna como está (externo)
 *   null / ''                         → ''
 *
 * Com o proxy interno o browser nunca precisa falar com o backend diretamente,
 * eliminando problemas de CORS e Cross-Origin-Resource-Policy.
 */

const BACKEND = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export function toImageUrl(url: string | null | undefined): string {
  if (!url) return ''

  // Já é URL do proxy Next.js — usar direto
  if (url.startsWith('/api/uploads/')) return url

  // Blob URL (preview local durante upload) — usar direto
  if (url.startsWith('blob:')) return url

  // URL absoluta do backend (ex: http://localhost:3001/uploads/...) → converter para proxy
  if (url.startsWith(`${BACKEND}/uploads/`)) {
    const relativePath = url.slice(`${BACKEND}/uploads/`.length)
    return `/api/uploads/${relativePath}`
  }

  // Caminho relativo /uploads/... → converter para proxy
  if (url.startsWith('/uploads/')) {
    return `/api/uploads/${url.slice('/uploads/'.length)}`
  }

  // Caminho relativo uploads/... (sem barra inicial, como salvo no banco) → converter para proxy
  if (url.startsWith('uploads/')) {
    return `/api/uploads/${url.slice('uploads/'.length)}`
  }

  // Qualquer outro padrão que contenha /uploads/ (ex: path absoluto de sistema)
  const idx = url.indexOf('/uploads/')
  if (idx !== -1) {
    return `/api/uploads/${url.slice(idx + '/uploads/'.length)}`
  }

  // URL externa ou formato desconhecido — retornar como está
  return url
}
