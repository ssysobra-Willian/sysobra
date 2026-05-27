/**
 * Utilitários para URLs de uploads.
 *
 * Imagens são salvas com caminhos relativos (/uploads/...) no banco.
 * Para exibição, o Next.js faz proxy em /api/uploads/... → elimina
 * problemas de CORS e Cross-Origin-Resource-Policy.
 */

export { toImageUrl } from './imageUrl'

/**
 * Alias mantido para retrocompatibilidade.
 * Prefira `toImageUrl` de '@/lib/imageUrl' em código novo.
 */
export { toImageUrl as resolveUploadUrl } from './imageUrl'
