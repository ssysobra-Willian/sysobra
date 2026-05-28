import puppeteer from 'puppeteer'
import { PDF_COLORS, PDF_BASE_STYLES, getPdfHeader, getPdfFooter } from './pdfTemplate'

// ─── Formatadores ─────────────────────────────────────────────────────────────

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(d: string | Date): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('pt-BR')
}

function fmtPct(v: number, sign = false): string {
  const s = (sign && v > 0 ? '+' : '') + v.toFixed(1) + '%'
  return s
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CompanyInfo {
  name:    string
  cnpj?:   string | null
  logo?:   string | null
  address?:string | null
  city?:   string | null
  state?:  string | null
  phone?:  string | null
  email?:  string | null
}

export interface ReportTransaction {
  id:              string
  description:     string
  referenceDate:   string | Date
  isPaid:          boolean
  grossAmount:     number
  netAmount:       number
  retentionAmount: number
  interestAmount:  number
  category?:       { name: string; color: string | null } | null
}

export interface SupplierReportData {
  kind:               'supplier'
  company:            CompanyInfo
  entityName:         string
  periodLabel:        string
  totalGross:         number
  totalNet:           number
  totalDiscounts:     number
  totalInterest:      number
  transactionCount:   number
  averageTicket:      number
  discountPercentage: number
  largestTransaction: { amount: number; date: string | Date; description: string } | null
  variations:         { grossVariation: number; netVariation: number; countVariation: number }
  transactions:       ReportTransaction[]
}

export interface ClientReportData {
  kind:                'client'
  company:             CompanyInfo
  entityName:          string
  periodLabel:         string
  totalGross:          number
  totalNet:            number
  totalRetentions:     number
  totalInterest:       number
  transactionCount:    number
  averageTicket:       number
  retentionPercentage: number
  largestTransaction:  { amount: number; date: string | Date; description: string } | null
  variations:          { grossVariation: number; netVariation: number; countVariation: number }
  transactions:        ReportTransaction[]
}

export interface RawHtmlData {
  kind:    'raw'
  html:    string
  margin?: { top?: string; right?: string; bottom?: string; left?: string }
}

export type ReportData = SupplierReportData | ClientReportData | RawHtmlData

// ─── HTML template ────────────────────────────────────────────────────────────

type StructuredReportData = SupplierReportData | ClientReportData

function buildHtml(data: StructuredReportData): string {
  const isSupplier  = data.kind === 'supplier'
  const entityLabel = isSupplier ? 'Fornecedor' : 'Cliente'
  const txLabel     = isSupplier ? 'Compras / Serviços' : 'Recebimentos'
  const negLabel    = isSupplier ? 'Descontos' : 'Retenções'
  const negAmt      = isSupplier
    ? (data as SupplierReportData).totalDiscounts
    : (data as ClientReportData).totalRetentions
  const negPct      = isSupplier
    ? (data as SupplierReportData).discountPercentage
    : (data as ClientReportData).retentionPercentage

  const c = data.company

  // Variation badge
  const varBadge = (v: number) => {
    const color = v > 0 ? PDF_COLORS.success : v < 0 ? PDF_COLORS.danger : PDF_COLORS.gray500
    return `<span style="color:${color};font-size:11px;">${fmtPct(v, true)}</span>`
  }

  // Transaction rows using shared CSS classes
  const txRows = data.transactions.map((t, i) => {
    const bg = i % 2 === 0 ? PDF_COLORS.white : PDF_COLORS.gray100
    const statusLabel = isSupplier ? (t.isPaid ? 'Pago' : 'Pendente') : (t.isPaid ? 'Recebido' : 'Pendente')
    const badgeCls    = t.isPaid ? 'badge-success' : 'badge-warning'
    return `
      <tr style="background:${bg};">
        <td style="padding:7px 8px;font-size:11px;">${fmtDate(t.referenceDate)}</td>
        <td style="padding:7px 8px;font-size:11px;max-width:240px;">${t.description || '—'}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:right;">${t.category?.name ?? '—'}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:right;">${fmt(t.grossAmount)}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:right;color:${PDF_COLORS.danger};">${t.retentionAmount > 0 ? '−' + fmt(t.retentionAmount) : '—'}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:right;font-weight:600;">${fmt(t.netAmount)}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:center;">
          <span class="badge ${badgeCls}">${statusLabel}</span>
        </td>
      </tr>`
  }).join('')

  // Totals
  const totGross = data.transactions.reduce((s, t) => s + t.grossAmount, 0)
  const totRet   = data.transactions.reduce((s, t) => s + t.retentionAmount, 0)
  const totNet   = data.transactions.reduce((s, t) => s + t.netAmount, 0)

  // Insight block (supplier = negotiation, client = relationship)
  const insightBlock = isSupplier ? `
    <div class="highlight-box" style="margin-top:20px;">
      <h3>💼 Argumentos de Negociação</h3>
      <ul>
        <li>Volume total movimentado no período: <strong>${fmt(data.totalGross)}</strong></li>
        <li>Número de transações: <strong>${data.transactionCount}</strong></li>
        <li>Ticket médio atual: <strong>${fmt(data.averageTicket)}</strong></li>
        <li>Desconto médio obtido: <strong>${fmtPct(negPct)}</strong></li>
        <li>Meta de desconto proposta: <strong>${fmtPct(negPct + 2)}</strong></li>
        ${(data as SupplierReportData).largestTransaction
          ? `<li>Maior compra registrada: <strong>${fmt((data as SupplierReportData).largestTransaction!.amount)}</strong></li>`
          : ''}
      </ul>
    </div>` : `
    <div class="highlight-box" style="margin-top:20px;">
      <h3>🤝 Análise de Relacionamento</h3>
      <ul>
        <li>Total faturado no período: <strong>${fmt(data.totalGross)}</strong></li>
        <li>Total líquido recebido: <strong>${fmt(data.totalNet)}</strong></li>
        <li>Retenções aplicadas: <strong>${fmt((data as ClientReportData).totalRetentions)}</strong> (${fmtPct(negPct)})</li>
        <li>Número de recebimentos: <strong>${data.transactionCount}</strong></li>
        <li>Ticket médio: <strong>${fmt(data.averageTicket)}</strong></li>
        ${(data as ClientReportData).largestTransaction
          ? `<li>Maior recebimento: <strong>${fmt((data as ClientReportData).largestTransaction!.amount)}</strong></li>`
          : ''}
      </ul>
    </div>`

  const header = getPdfHeader({
    title:    `RELATÓRIO DE ${entityLabel.toUpperCase()}`,
    company:  { name: c.name, document: c.cnpj ?? null, logo: c.logo ?? null },
    date:     data.periodLabel,
    statusBadge: `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:${PDF_COLORS.primaryLight};color:${PDF_COLORS.primaryDark};">${entityLabel}: ${data.entityName}</span>`,
  })
  const footer = getPdfFooter(c.name)

  const body = `
    <!-- Métricas do período -->
    <div class="section">
      <div class="section-title">Resumo do Período</div>
      <div class="info-grid" style="grid-template-columns: repeat(4, 1fr);">
        <div class="info-item">
          <span class="label">Total Bruto</span>
          <span class="value">${fmt(data.totalGross)}</span>
          ${varBadge(data.variations.grossVariation)}
        </div>
        <div class="info-item">
          <span class="label">${negLabel}</span>
          <span class="value">${fmt(negAmt)}${negPct > 0 ? ` (${fmtPct(negPct)})` : ''}</span>
        </div>
        <div class="info-item">
          <span class="label">Total Líquido</span>
          <span class="value">${fmt(data.totalNet)}</span>
          ${varBadge(data.variations.netVariation)}
        </div>
        <div class="info-item">
          <span class="label">Nº de ${txLabel}</span>
          <span class="value">${data.transactionCount}</span>
          ${varBadge(data.variations.countVariation)}
        </div>
      </div>
      <div class="info-grid" style="grid-template-columns: repeat(3, 1fr); margin-top: 8px;">
        <div class="info-item">
          <span class="label">Ticket Médio</span>
          <span class="value">${fmt(data.averageTicket)}</span>
        </div>
        <div class="info-item">
          <span class="label">${isSupplier ? 'Juros / Encargos' : 'Juros Recebidos'}</span>
          <span class="value">${fmt(isSupplier ? (data as SupplierReportData).totalInterest : (data as ClientReportData).totalInterest)}</span>
        </div>
        ${data.largestTransaction ? `
        <div class="info-item">
          <span class="label">Maior Transação</span>
          <span class="value">${fmt(data.largestTransaction.amount)} — ${fmtDate(data.largestTransaction.date)}</span>
        </div>` : ''}
      </div>
    </div>

    ${insightBlock}

    <!-- Histórico de transações -->
    <div class="section" style="margin-top:20px;">
      <div class="section-title">Histórico de ${txLabel}</div>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Descrição</th>
            <th class="right">Categoria</th>
            <th class="right">Bruto</th>
            <th class="right">${negLabel}</th>
            <th class="right">Líquido</th>
            <th class="center">Status</th>
          </tr>
        </thead>
        <tbody>${txRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="3">TOTAL</td>
            <td class="right">${fmt(totGross)}</td>
            <td class="right" style="color:${PDF_COLORS.danger};">${totRet > 0 ? '−' + fmt(totRet) : '—'}</td>
            <td class="right">${fmt(totNet)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Relatório de ${entityLabel} — ${data.entityName}</title>
  <style>${PDF_BASE_STYLES}</style>
</head>
<body>
  ${header}
  <div class="doc-body">${body}</div>
  ${footer}
</body>
</html>`
}

// ─── Gera PDF via Puppeteer ────────────────────────────────────────────────────

export async function generatePdf(data: ReportData): Promise<Buffer> {
  const rawData = data.kind === 'raw' ? (data as RawHtmlData) : null
  const html    = rawData ? rawData.html : buildHtml(data as StructuredReportData)
  const margin  = rawData?.margin ?? { top: '20mm', right: '18mm', bottom: '20mm', left: '18mm' }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    const pdf = await page.pdf({
      format:          'A4',
      printBackground: true,
      margin,
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
