/**
 * Utilitários centralizados de formatação.
 * Padrão brasileiro: R$ 1.000,00 — ponto milhar, vírgula decimal, sempre 2 casas.
 */

// ─── Moeda ────────────────────────────────────────────────────────────────────

export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return 'R$ 0,00'
  const num = typeof value === 'string' ? parseFloat(value) : Number(value)
  if (isNaN(num)) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', {
    style:                 'currency',
    currency:              'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

/**
 * Versão compacta para rótulos de eixos de gráfico onde o espaço é limitado.
 * Ex.: 1500 → "R$ 1,5k" | 250 → "R$ 250"
 */
export function formatCurrencyCompact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (abs >= 1_000)     return `R$ ${(value / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1).replace('.', ',')}k`
  return formatCurrency(value)
}

/**
 * Converte string formatada em pt-BR para número.
 * "R$ 1.000,00" → 1000  |  "1.234,56" → 1234.56  |  "1234.56" → 1234.56
 */
export function parseCurrency(value: string): number {
  if (!value) return 0
  // Remove R$, espaços, pontos de milhar; troca vírgula decimal por ponto
  const clean = value
    .replace(/R\$\s?/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim()
  return parseFloat(clean) || 0
}

// ─── Número inteiro ───────────────────────────────────────────────────────────

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value)
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}
