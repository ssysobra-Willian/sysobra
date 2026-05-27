/**
 * Utilitários para URLs de uploads.
 *
 * Imagens são salvas com caminhos relativos (/uploads/...) tanto no
 * banco quanto nas respostas da API. Para exibição no browser, é
 * necessário prefixar com o domínio da API (porta 3001 em dev).
 */

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

/**
 * Converte um caminho de upload em URL absoluta acessível pelo browser.
 *
 * - `/uploads/...`  → `http://localhost:3001/uploads/...`
 * - `blob:...`      → retorna como está (preview local durante upload)
 * - `http://...`    → retorna como está (URL externa ou já absoluta)
 * - null / ''       → retorna ''
 */
export function resolveUploadUrl(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('/uploads/')) return `${API}${url}`
  return url
}
