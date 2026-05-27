// ─── Paleta de cores SYSOBRA ──────────────────────────────────────────────────

export const PDF_COLORS = {
  primary:      '#F5A623',
  primaryDark:  '#D4860F',
  primaryLight: '#FEF3DC',
  dark:         '#111827',
  gray900:      '#1F2937',
  gray700:      '#374151',
  gray500:      '#6B7280',
  gray300:      '#D1D5DB',
  gray100:      '#F3F4F6',
  white:        '#FFFFFF',
  success:      '#16A34A',
  danger:       '#DC2626',
  warning:      '#D97706',
}

// ─── CSS base compartilhado ───────────────────────────────────────────────────

export const PDF_BASE_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    color: ${PDF_COLORS.dark};
    background: ${PDF_COLORS.white};
    font-size: 13px;
    line-height: 1.5;
  }

  @page { size: A4; margin: 0; }

  /* ── HEADER ── */
  .doc-header {
    background: ${PDF_COLORS.dark};
    color: ${PDF_COLORS.white};
    padding: 20px 36px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .doc-header .logo {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: 2px;
    color: ${PDF_COLORS.white};
  }
  .doc-header .logo span { color: ${PDF_COLORS.primary}; }
  .doc-header .sub {
    font-size: 10px;
    color: rgba(255,255,255,0.55);
    margin-top: 2px;
    letter-spacing: 0.04em;
  }
  .doc-header .doc-info { text-align: right; }
  .doc-header .doc-info .company {
    font-size: 13px;
    font-weight: 600;
    color: ${PDF_COLORS.white};
  }
  .doc-header .doc-info .meta {
    font-size: 10px;
    color: rgba(255,255,255,0.6);
    margin-top: 1px;
  }
  .doc-header .doc-info .doc-title {
    font-size: 12px;
    font-weight: 700;
    color: ${PDF_COLORS.primary};
    margin-top: 4px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .doc-header .doc-info .doc-num {
    font-size: 14px;
    font-weight: 800;
    color: ${PDF_COLORS.white};
    margin-top: 2px;
  }

  /* ── FAIXA LARANJA ── */
  .header-stripe {
    height: 4px;
    background: linear-gradient(90deg, ${PDF_COLORS.primary} 0%, ${PDF_COLORS.primaryDark} 100%);
  }

  /* ── CORPO ── */
  .doc-body {
    padding: 28px 36px;
    padding-bottom: 70px; /* espaço para o footer fixo */
  }

  /* ── SEÇÕES ── */
  .section { margin-bottom: 24px; }
  .section-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: ${PDF_COLORS.gray500};
    border-bottom: 2px solid ${PDF_COLORS.primary};
    padding-bottom: 5px;
    margin-bottom: 12px;
  }

  /* ── GRID INFO OBRA ── */
  .info-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    background: ${PDF_COLORS.gray100};
    border-radius: 8px;
    padding: 14px 18px;
    margin-bottom: 20px;
  }
  .info-item .label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: ${PDF_COLORS.gray500};
    display: block;
    margin-bottom: 2px;
  }
  .info-item .value {
    font-size: 12px;
    font-weight: 600;
    color: ${PDF_COLORS.dark};
  }

  /* ── CARDS DE MÉTRICAS ── */
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 20px;
  }
  .metric-card {
    background: ${PDF_COLORS.gray100};
    border-radius: 8px;
    padding: 12px 14px;
    border-left: 3px solid ${PDF_COLORS.primary};
  }
  .metric-card .m-label {
    font-size: 9px;
    color: ${PDF_COLORS.gray500};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
  }
  .metric-card .m-value {
    font-size: 18px;
    font-weight: 800;
    color: ${PDF_COLORS.dark};
  }
  .metric-card .m-unit {
    font-size: 11px;
    color: ${PDF_COLORS.gray500};
    margin-left: 2px;
  }

  /* ── TABELAS ── */
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead tr { background: ${PDF_COLORS.dark}; color: ${PDF_COLORS.white}; }
  thead th {
    padding: 9px 10px;
    text-align: left;
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  thead th.right { text-align: right; }
  thead th.center { text-align: center; }
  tbody tr:nth-child(even) { background: ${PDF_COLORS.gray100}; }
  tbody tr:nth-child(odd)  { background: ${PDF_COLORS.white}; }
  tbody td {
    padding: 8px 10px;
    border-bottom: 1px solid ${PDF_COLORS.gray300};
    color: ${PDF_COLORS.gray700};
    vertical-align: top;
  }
  tbody td.right { text-align: right; }
  tbody td.center { text-align: center; }
  tfoot tr { background: ${PDF_COLORS.primaryLight}; }
  tfoot td {
    padding: 9px 10px;
    color: ${PDF_COLORS.dark};
    font-weight: 700;
    border-top: 2px solid ${PDF_COLORS.primary};
    font-size: 12px;
  }
  tfoot td.right { text-align: right; }
  .row-impraticavel td {
    background: #FEF2F2 !important;
    color: ${PDF_COLORS.danger};
  }

  /* ── BADGES ── */
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 99px;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
  }
  .badge-success { background: #DCFCE7; color: #166534; }
  .badge-danger  { background: #FEE2E2; color: #991B1B; }
  .badge-warning { background: #FEF3C7; color: #92400E; }
  .badge-primary { background: ${PDF_COLORS.primaryLight}; color: ${PDF_COLORS.primaryDark}; }
  .badge-gray    { background: ${PDF_COLORS.gray100}; color: ${PDF_COLORS.gray700}; }
  .badge-pending { background: #FEF3C7; color: #92400E; }

  /* ── CAIXA DE DESTAQUE ── */
  .highlight-box {
    background: ${PDF_COLORS.primaryLight};
    border: 1px solid ${PDF_COLORS.primary};
    border-left: 4px solid ${PDF_COLORS.primary};
    border-radius: 8px;
    padding: 14px 18px;
    margin: 14px 0;
  }
  .highlight-box h3 {
    color: ${PDF_COLORS.primaryDark};
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .highlight-box p, .highlight-box li {
    color: ${PDF_COLORS.gray700};
    font-size: 11px;
    line-height: 1.7;
  }
  .highlight-box ul { padding-left: 16px; margin-top: 4px; }

  /* ── ASSINATURAS ── */
  .signatures {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    margin-top: 36px;
    padding-top: 16px;
    border-top: 1px solid ${PDF_COLORS.gray300};
  }
  .signature-box { text-align: center; }
  .signature-line {
    border-top: 1px solid ${PDF_COLORS.dark};
    margin-bottom: 6px;
    margin-top: 44px;
  }
  .signature-name { font-size: 11px; font-weight: 700; color: ${PDF_COLORS.dark}; }
  .signature-role { font-size: 10px; color: ${PDF_COLORS.gray500}; }

  /* ── FOOTER FIXO ── */
  .doc-footer {
    background: ${PDF_COLORS.gray100};
    border-top: 3px solid ${PDF_COLORS.primary};
    padding: 9px 36px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 9px;
    color: ${PDF_COLORS.gray500};
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
  }
  .doc-footer .logo-sm {
    font-weight: 800;
    color: ${PDF_COLORS.dark};
    letter-spacing: 1px;
    font-size: 10px;
  }
  .doc-footer .logo-sm span { color: ${PDF_COLORS.primary}; }

  /* ── CONTEÚDO DE TEXTO ── */
  .text-block {
    background: ${PDF_COLORS.gray100};
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 12px;
    line-height: 1.65;
    color: ${PDF_COLORS.gray700};
    white-space: pre-wrap;
  }
  .text-block-warn {
    background: #FFFBEB;
    border-left: 3px solid ${PDF_COLORS.warning};
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 12px;
    line-height: 1.65;
    color: ${PDF_COLORS.gray700};
    white-space: pre-wrap;
  }
`

// ─── Header HTML ──────────────────────────────────────────────────────────────

export function getPdfHeader(params: {
  title:        string
  docNumber?:   string
  company:      { name: string; document?: string | null; logo?: string | null }
  date:         string
  statusBadge?: string   // HTML de badge pré-formatado
}) {
  const logoHtml = params.company.logo
    ? `<img src="${params.company.logo}" alt="Logo" style="height:36px;max-width:160px;object-fit:contain;border-radius:4px;" />`
    : `<div class="logo">SYS<span>O</span>BRA</div>
       <div class="sub">Sistema de Gestão de Obras</div>`

  return `
    <div class="doc-header">
      <div>${logoHtml}</div>
      <div class="doc-info">
        <div class="company">${params.company.name}</div>
        ${params.company.document ? `<div class="meta">${params.company.document}</div>` : ''}
        <div class="doc-title">${params.title}</div>
        ${params.docNumber ? `<div class="doc-num">${params.docNumber}</div>` : ''}
        <div class="meta" style="margin-top:3px;">${params.date}</div>
        ${params.statusBadge ? `<div style="margin-top:5px;">${params.statusBadge}</div>` : ''}
      </div>
    </div>
    <div class="header-stripe"></div>
  `
}

// ─── Footer HTML ──────────────────────────────────────────────────────────────

export function getPdfFooter(company: string) {
  const now = new Date()
  const date = now.toLocaleDateString('pt-BR')
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `
    <div class="doc-footer">
      <div class="logo-sm">SYS<span>O</span>BRA · Sistema de Gestão de Obras</div>
      <div>${company}</div>
      <div>Gerado em ${date} às ${time}</div>
    </div>
  `
}

// ─── Montagem completa do documento ──────────────────────────────────────────

export function buildPdfDocument(params: {
  title:   string
  head?:   string   // tags extras no <head> (ex: <script src="...">)
  header:  string   // resultado de getPdfHeader()
  body:    string   // HTML do conteúdo
  footer:  string   // resultado de getPdfFooter()
}): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${params.title}</title>
  <style>${PDF_BASE_STYLES}</style>
  ${params.head ?? ''}
</head>
<body>
  ${params.header}
  <div class="doc-body">
    ${params.body}
  </div>
  ${params.footer}
</body>
</html>`
}
