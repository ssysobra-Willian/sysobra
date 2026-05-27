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

// ─── Data segura para diário de obra (sem problemas de fuso horário) ──────────
//
// Strings de data vindas do backend (ex: "2026-05-27T12:00:00.000Z") são
// armazenadas como meio-dia UTC. Se usarmos `new Date(iso)` diretamente e
// o browser estiver em UTC-3, meia-noite UTC vira 21h do dia anterior.
// A solução: sempre extrair só a parte "yyyy-MM-dd" e criar Date com meio-dia
// local, garantindo que o dia exibido é sempre o correto.

/**
 * Retorna a string de data no formato "dd/MM/yyyy" sem risco de fuso horário.
 * Ex: "2026-05-27T12:00:00.000Z" → "27/05/2026"
 */
export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = iso.slice(0, 10)        // "2026-05-27"
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}

/**
 * Retorna a data por extenso em pt-BR sem risco de fuso horário.
 * Ex: "2026-05-27T00:00:00Z" → "quarta-feira, 27 de maio de 2026"
 */
export function formatDateLongBR(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = iso.slice(0, 10)        // "2026-05-27"
  // Meio-dia local garante que toLocaleDateString não volta um dia atrás
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })
}

/**
 * Retorna a data atual no formato "yyyy-MM-dd" usando o timezone LOCAL.
 * Usar em lugar de `new Date().toISOString().slice(0, 10)` (que usa UTC).
 */
export function todayLocalDate(): string {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = String(now.getMonth() + 1).padStart(2, '0')
  const d   = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
