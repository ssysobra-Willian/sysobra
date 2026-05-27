import puppeteer from 'puppeteer'

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
  kind: 'raw'
  html: string
}

export type ReportData = SupplierReportData | ClientReportData | RawHtmlData

// ─── HTML template ────────────────────────────────────────────────────────────

type StructuredReportData = SupplierReportData | ClientReportData

function buildHtml(data: StructuredReportData): string {
  const isSupplier = data.kind === 'supplier'
  const accentColor = isSupplier ? '#2563eb' : '#16a34a'
  const accentLight = isSupplier ? '#dbeafe' : '#dcfce7'
  const accentText  = isSupplier ? '#1d4ed8' : '#15803d'
  const entityLabel = isSupplier ? 'Fornecedor' : 'Cliente'
  const txLabel     = isSupplier ? 'Compras / Serviços' : 'Recebimentos'
  const negLabel    = isSupplier ? 'Descontos' : 'Retenções'
  const negAmt      = isSupplier
    ? (data as SupplierReportData).totalDiscounts
    : (data as ClientReportData).totalRetentions
  const negPct      = isSupplier
    ? (data as SupplierReportData).discountPercentage
    : (data as ClientReportData).retentionPercentage

  const c     = data.company
  const genAt = new Date().toLocaleString('pt-BR')

  // Company header block
  const logoBlock = c.logo
    ? `<img src="${c.logo}" alt="Logo" style="height:48px;max-width:200px;object-fit:contain;" />`
    : `<div style="font-size:22px;font-weight:800;color:${accentColor};">SYSOBRA</div>`

  const addrParts = [c.address, c.city, c.state].filter(Boolean).join(', ')

  // Variation badge
  const varBadge = (v: number) => {
    const color = v > 0 ? '#16a34a' : v < 0 ? '#dc2626' : '#6b7280'
    return `<span style="color:${color};font-size:11px;">${fmtPct(v, true)}</span>`
  }

  // Metric card row
  const metricRow = (label: string, value: string, varVal?: number) => `
    <tr>
      <td style="padding:6px 8px;color:#6b7280;font-size:12px;">${label}</td>
      <td style="padding:6px 8px;text-align:right;font-weight:600;font-size:13px;">${value}</td>
      ${varVal !== undefined ? `<td style="padding:6px 8px;text-align:right;">${varBadge(varVal)}</td>` : '<td></td>'}
    </tr>`

  // Transaction rows
  const txRows = data.transactions.map((t, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb'
    const statusColor = t.isPaid ? '#16a34a' : '#d97706'
    const statusLabel = isSupplier ? (t.isPaid ? 'Pago' : 'Pendente') : (t.isPaid ? 'Recebido' : 'Pendente')
    return `
      <tr style="background:${bg};">
        <td style="padding:7px 8px;font-size:11px;color:#374151;">${fmtDate(t.referenceDate)}</td>
        <td style="padding:7px 8px;font-size:11px;color:#111827;max-width:240px;">${t.description || '—'}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:right;color:#374151;">${t.category?.name ?? '—'}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:right;">${fmt(t.grossAmount)}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:right;color:#dc2626;">${t.retentionAmount > 0 ? '−' + fmt(t.retentionAmount) : '—'}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:right;font-weight:600;">${fmt(t.netAmount)}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:center;">
          <span style="background:${t.isPaid ? '#dcfce7' : '#fef3c7'};color:${statusColor};padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;">${statusLabel}</span>
        </td>
      </tr>`
  }).join('')

  // Totals row
  const totGross = data.transactions.reduce((s, t) => s + t.grossAmount, 0)
  const totRet   = data.transactions.reduce((s, t) => s + t.retentionAmount, 0)
  const totNet   = data.transactions.reduce((s, t) => s + t.netAmount, 0)

  // Negotiation argument block (supplier only)
  const negotiationBlock = isSupplier ? `
    <div style="margin-top:28px;padding:20px 24px;border:1.5px solid ${accentColor};border-radius:10px;background:${accentLight};">
      <h3 style="margin:0 0 12px;color:${accentText};font-size:14px;">💼 Argumentos de Negociação</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;font-size:12px;line-height:1.8;">
        <li>Volume total movimentado no período: <strong>${fmt(data.totalGross)}</strong></li>
        <li>Número de transações: <strong>${data.transactionCount}</strong></li>
        <li>Ticket médio atual: <strong>${fmt(data.averageTicket)}</strong></li>
        <li>Desconto médio obtido: <strong>${fmtPct(negPct)}</strong></li>
        <li>Meta de desconto proposta: <strong>${fmtPct(negPct + 2)}</strong></li>
        ${(data as SupplierReportData).largestTransaction
          ? `<li>Maior compra registrada: <strong>${fmt((data as SupplierReportData).largestTransaction!.amount)}</strong></li>`
          : ''}
      </ul>
    </div>` : ''

  // Client relationship block
  const relationshipBlock = !isSupplier ? `
    <div style="margin-top:28px;padding:20px 24px;border:1.5px solid ${accentColor};border-radius:10px;background:${accentLight};">
      <h3 style="margin:0 0 12px;color:${accentText};font-size:14px;">🤝 Análise de Relacionamento</h3>
      <ul style="margin:0;padding-left:18px;color:#374151;font-size:12px;line-height:1.8;">
        <li>Total faturado no período: <strong>${fmt(data.totalGross)}</strong></li>
        <li>Total líquido recebido: <strong>${fmt(data.totalNet)}</strong></li>
        <li>Retenções aplicadas: <strong>${fmt((data as ClientReportData).totalRetentions)}</strong> (${fmtPct(negPct)})</li>
        <li>Número de recebimentos: <strong>${data.transactionCount}</strong></li>
        <li>Ticket médio: <strong>${fmt(data.averageTicket)}</strong></li>
        ${(data as ClientReportData).largestTransaction
          ? `<li>Maior recebimento: <strong>${fmt((data as ClientReportData).largestTransaction!.amount)}</strong></li>`
          : ''}
      </ul>
    </div>` : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Relatório de Relacionamento — ${data.entityName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; background: #fff; font-size: 13px; }
    @page { size: A4; margin: 20mm 18mm; }
    table { border-collapse: collapse; width: 100%; }
    th { background: ${accentColor}; color: #fff; padding: 8px; font-size: 11px; text-align: left; }
    th.right { text-align: right; }
    td { border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
    .section { margin-top: 28px; }
    .section h2 { font-size: 14px; color: ${accentText}; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid ${accentLight}; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 10px; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <!-- Header -->
  <table style="margin-bottom:20px;">
    <tr>
      <td style="width:60%;">${logoBlock}
        ${addrParts ? `<div style="font-size:10px;color:#6b7280;margin-top:4px;">${addrParts}</div>` : ''}
        ${c.cnpj ? `<div style="font-size:10px;color:#6b7280;">CNPJ: ${c.cnpj}</div>` : ''}
      </td>
      <td style="text-align:right;vertical-align:top;">
        <div style="font-size:18px;font-weight:700;color:${accentColor};">Relatório de ${entityLabel}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">${entityLabel}: <strong style="color:#111827;">${data.entityName}</strong></div>
        <div style="font-size:12px;color:#6b7280;">Período: <strong style="color:#111827;">${data.periodLabel}</strong></div>
      </td>
    </tr>
  </table>

  <!-- Summary metrics -->
  <div class="section">
    <h2>📊 Resumo do Período</h2>
    <table>
      <tbody>
        ${metricRow('Total Bruto', fmt(data.totalGross), data.variations.grossVariation)}
        ${metricRow(negLabel, fmt(negAmt) + (negPct > 0 ? ` (${fmtPct(negPct)})` : ''), undefined)}
        ${metricRow('Total Líquido', fmt(data.totalNet), data.variations.netVariation)}
        ${isSupplier ? metricRow('Juros / Encargos', fmt((data as SupplierReportData).totalInterest), undefined) : metricRow('Juros Recebidos', fmt((data as ClientReportData).totalInterest), undefined)}
        ${metricRow('Nº de ' + txLabel, String(data.transactionCount), data.variations.countVariation)}
        ${metricRow('Ticket Médio', fmt(data.averageTicket), undefined)}
        ${data.largestTransaction ? metricRow('Maior Transação', fmt(data.largestTransaction.amount) + ' — ' + fmtDate(data.largestTransaction.date), undefined) : ''}
      </tbody>
    </table>
  </div>

  ${negotiationBlock}
  ${relationshipBlock}

  <!-- Transaction table -->
  <div class="section">
    <h2>📋 Histórico de ${txLabel}</h2>
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Descrição</th>
          <th>Categoria</th>
          <th class="right">Bruto</th>
          <th class="right">${negLabel}</th>
          <th class="right">Líquido</th>
          <th style="text-align:center;">Status</th>
        </tr>
      </thead>
      <tbody>${txRows}</tbody>
      <tfoot>
        <tr style="background:#f9fafb;font-weight:700;">
          <td colspan="3" style="padding:8px;font-size:12px;color:#374151;">TOTAL</td>
          <td style="padding:8px;text-align:right;font-size:12px;">${fmt(totGross)}</td>
          <td style="padding:8px;text-align:right;font-size:12px;color:#dc2626;">${totRet > 0 ? '−' + fmt(totRet) : '—'}</td>
          <td style="padding:8px;text-align:right;font-size:12px;">${fmt(totNet)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>Gerado pelo <strong>SYSOBRA</strong> — ${genAt}</span>
    <span>${c.name}</span>
  </div>
</body>
</html>`
}

// ─── Gera PDF via Puppeteer ────────────────────────────────────────────────────

export async function generatePdf(data: ReportData): Promise<Buffer> {
  const html = data.kind === 'raw' ? (data as RawHtmlData).html : buildHtml(data as StructuredReportData)

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    const pdf = await page.pdf({
      format:            'A4',
      printBackground:   true,
      margin: { top: '20mm', right: '18mm', bottom: '20mm', left: '18mm' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
