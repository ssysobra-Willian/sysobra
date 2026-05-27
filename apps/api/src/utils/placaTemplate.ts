import * as fs   from 'fs'
import * as path from 'path'

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatDateBR(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/** Lê um arquivo local e retorna string data-URI base64 */
function fileToBase64(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const buf  = fs.readFileSync(filePath)
    const ext  = path.extname(filePath).toLowerCase().replace('.', '')
    const mime =
      ext === 'png'  ? 'image/png'  :
      ext === 'webp' ? 'image/webp' :
      ext === 'svg'  ? 'image/svg+xml' :
      'image/jpeg'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/** Resolve um caminho relativo de upload `uploads/...` para absoluto no servidor */
function resolveUploadPath(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) return null
  const clean = relativePath.replace(/^\/uploads\//, '').replace(/^uploads\//, '')
  const uploadsRoot = path.join(__dirname, '../../uploads')
  return path.join(uploadsRoot, clean)
}

// ─── Logo SYSOBRA ─────────────────────────────────────────────────────────────

export function getSyslobraLogoBase64(): string {
  const candidates = [
    path.join(__dirname, '../logo.png'),
    path.join(__dirname, '../../src/logo.png'),
    path.join(__dirname, '../logo-dark.png'),
    path.join(__dirname, '../logo-icon.png'),
  ]
  for (const p of candidates) {
    const b64 = fileToBase64(p)
    if (b64) return b64
  }
  return ''
}

// ─── Imagem central ───────────────────────────────────────────────────────────

export function getCentralImageBase64(
  project:   any,
  company:   any,
  imageType: 'logo' | 'photo',
): string | null {
  let relativePath: string | null = null
  if (imageType === 'photo' && project.coverImage) {
    relativePath = project.coverImage
  } else if (company?.logo) {
    relativePath = company.logo
  }
  if (!relativePath) return null
  const absPath = resolveUploadPath(relativePath)
  if (!absPath) return null
  return fileToBase64(absPath)
}

// ─── Parâmetros ───────────────────────────────────────────────────────────────

export interface PlacaParams {
  project:            any
  company:            any
  centralImageBase64: string | null
  syslobraLogoBase64: string
  imageType:          'logo' | 'photo'
  /** Se informado, apenas esses campos aparecem na grade de dados */
  visibleFields?:     string[]
}

// ─── Campos disponíveis na grade ──────────────────────────────────────────────

export const ALL_FIELDS = [
  'technicalManager',  // Responsável Técnico (nome + cargo)
  'crea',              // CREA / CAU
  'startDate',         // Início previsto
  'expectedEndDate',   // Término previsto
  'area',              // Área construída
  'floors',            // Pavimentos
  'cno',               // CNO
  'buildingPermit',    // Alvará
  'address',           // Endereço
  'art',               // ART / RRT
]

// ─── Template HTML ────────────────────────────────────────────────────────────

export function gerarHtmlPlaca(params: PlacaParams): string {
  const {
    project, company, centralImageBase64, syslobraLogoBase64,
    imageType, visibleFields,
  } = params

  const visible = new Set(visibleFields ?? ALL_FIELDS)
  const show = (field: string) => visible.has(field)

  const fullAddress = [project.address, project.city, project.state].filter(Boolean).join(', ') || null
  const artDisplay  = [project.artExecution, project.artProjects].filter(Boolean).join(' / ') || null
  const now         = new Date()
  const geradoEm    = `${formatDateBR(now)} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`

  const companySlogan: string | null = company?.slogan ?? project.slogan ?? null
  const totalArea: number | null     = project.totalArea ? Number(project.totalArea) : null
  const floors: number | null        = project.floors ?? null
  const buildingPermit: string | null = project.buildingPermit ?? null

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: 900px;
    height: 1200px;
    overflow: hidden;
    font-family: 'Arial Black', Arial, sans-serif;
    background: #FFFFFF;
  }

  .placa {
    width: 900px;
    height: 1200px;
    display: flex;
    flex-direction: column;
    border: 8px solid #111827;
  }

  /* ── FAIXA LARANJA: nome da empresa ── */
  .faixa-empresa {
    background: #F5A623;
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 32px;
    border-bottom: 4px solid #111827;
    flex-shrink: 0;
  }
  .faixa-empresa span {
    font-size: 42px;
    font-weight: 900;
    color: #111827;
    text-transform: uppercase;
    letter-spacing: 2px;
    text-align: center;
    font-family: 'Arial Black', Arial, sans-serif;
    line-height: 1;
  }

  /* ── FAIXA AZUL: slogan (opcional) ── */
  .faixa-slogan {
    background: #1E3A5F;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 32px;
    border-bottom: 3px solid #111827;
    flex-shrink: 0;
  }
  .faixa-slogan span {
    font-size: 18px;
    font-weight: 400;
    font-style: italic;
    color: #FFFFFF;
    text-align: center;
    font-family: Arial, sans-serif;
    opacity: 0.95;
  }

  /* ── LOGO SYSOBRA centralizado no branco ── */
  .faixa-logo {
    background: #FFFFFF;
    height: 90px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px 32px;
    border-bottom: 3px solid #E5E7EB;
    flex-shrink: 0;
  }
  .sysobra-logo {
    height: 58px;
    width: auto;
    object-fit: contain;
  }
  .sysobra-logo-text {
    font-size: 38px;
    font-weight: 900;
    color: #F5A623;
    letter-spacing: 5px;
    font-family: 'Arial Black', Arial, sans-serif;
  }

  /* ── IMAGEM CENTRAL (240px) ── */
  .imagem-central {
    height: 240px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px 40px;
    background: #F9FAFB;
    border-bottom: 3px solid #E5E7EB;
    flex-shrink: 0;
  }
  .imagem-central img {
    max-width: 460px;
    max-height: 208px;
    object-fit: contain;
    border-radius: 8px;
  }
  .imagem-placeholder {
    width: 200px;
    height: 200px;
    background: #E5E7EB;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-family: Arial, sans-serif;
  }
  .placeholder-icon  { font-size: 54px; opacity: 0.35; }
  .placeholder-text  { font-size: 13px; color: #9CA3AF; text-align: center; line-height: 1.4; }

  /* ── NOME DA OBRA ── */
  .obra-nome {
    background: #FFFFFF;
    padding: 16px 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom: 5px solid #111827;
    flex-shrink: 0;
  }
  .obra-nome span {
    font-size: 54px;
    font-weight: 900;
    color: #111827;
    text-transform: uppercase;
    text-align: center;
    line-height: 1.05;
    letter-spacing: 1px;
    font-family: 'Arial Black', Arial, sans-serif;
  }

  /* ── DADOS TÉCNICOS ── */
  .dados-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 4px solid #111827;
    flex: 1;
    min-height: 0;
  }
  .dado-item {
    padding: 10px 20px;
    border-right: 1px solid #E5E7EB;
    border-bottom: 1px solid #E5E7EB;
  }
  .dado-item:nth-child(even) { border-right: none; }
  .dado-label {
    font-size: 11px;
    font-weight: 700;
    color: #F5A623;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 3px;
    font-family: Arial, sans-serif;
  }
  .dado-valor {
    font-size: 22px;
    font-weight: 700;
    color: #111827;
    font-family: Arial, sans-serif;
    line-height: 1.2;
  }
  .dado-valor.small { font-size: 17px; }
  .dado-responsavel .dado-valor {
    font-size: 24px;
    font-weight: 900;
  }
  .dado-full {
    grid-column: 1 / -1;
    padding: 9px 20px;
    border-bottom: 1px solid #E5E7EB;
    display: flex;
    align-items: flex-start;
    gap: 14px;
  }
  .dado-full .dado-label  { margin-bottom: 0; min-width: 130px; flex-shrink: 0; margin-top: 2px; }
  .dado-full .dado-valor  { font-size: 17px; }

  /* ── RODAPÉ ── */
  .rodape {
    background: #111827;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 28px;
    flex-shrink: 0;
  }
  .rodape-info {
    color: #9CA3AF;
    font-size: 11px;
    line-height: 1.6;
    font-family: Arial, sans-serif;
  }
  .rodape-info b { color: #FFFFFF; }
  .rodape-logo-box {
    background: #F5A623;
    border-radius: 6px;
    padding: 5px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .rodape-logo-img  { height: 28px; width: auto; object-fit: contain; }
  .rodape-logo-text {
    font-size: 16px;
    font-weight: 900;
    color: #111827;
    letter-spacing: 2px;
    font-family: 'Arial Black', Arial, sans-serif;
  }
</style>
</head>
<body>
<div class="placa">

  <!-- FAIXA LARANJA: nome da empresa -->
  <div class="faixa-empresa">
    <span>${company?.name ?? '—'}</span>
  </div>

  ${companySlogan ? `
  <!-- FAIXA AZUL: slogan -->
  <div class="faixa-slogan">
    <span>${companySlogan}</span>
  </div>` : ''}

  <!-- LOGO SYSOBRA centralizado -->
  <div class="faixa-logo">
    ${syslobraLogoBase64
      ? `<img src="${syslobraLogoBase64}" class="sysobra-logo" alt="SYSOBRA" />`
      : `<div class="sysobra-logo-text">SYSOBRA</div>`}
  </div>

  <!-- IMAGEM CENTRAL -->
  <div class="imagem-central">
    ${centralImageBase64
      ? `<img src="${centralImageBase64}" alt="${imageType === 'photo' ? 'Foto da obra' : 'Logo da empresa'}" />`
      : `<div class="imagem-placeholder">
           <div class="placeholder-icon">🏗️</div>
           <div class="placeholder-text">${imageType === 'photo' ? 'Foto da obra<br>não cadastrada' : 'Logo da empresa<br>não cadastrada'}</div>
         </div>`}
  </div>

  <!-- NOME DA OBRA -->
  <div class="obra-nome">
    <span>${project.name}</span>
  </div>

  <!-- DADOS TÉCNICOS -->
  <div class="dados-grid">

    ${show('technicalManager') ? `
    <div class="dado-item dado-responsavel" style="grid-column:1/-1;border-right:none;">
      <div class="dado-label">Responsável Técnico</div>
      <div class="dado-valor">${project.technicalName ?? '—'}${project.technicalTitle ? ` <span style="font-size:16px;font-weight:400;color:#6B7280">— ${project.technicalTitle}</span>` : ''}</div>
    </div>` : ''}

    ${show('crea') ? `
    <div class="dado-item">
      <div class="dado-label">CREA / CAU</div>
      <div class="dado-valor small">${project.technicalCrea ?? '—'}</div>
    </div>` : ''}

    ${show('startDate') ? `
    <div class="dado-item">
      <div class="dado-label">Início previsto</div>
      <div class="dado-valor">${formatDateBR(project.startDate)}</div>
    </div>` : ''}

    ${show('expectedEndDate') ? `
    <div class="dado-item">
      <div class="dado-label">Término previsto</div>
      <div class="dado-valor">${formatDateBR(project.expectedEndDate ?? project.endDate)}</div>
    </div>` : ''}

    ${show('area') && totalArea ? `
    <div class="dado-item">
      <div class="dado-label">Área construída</div>
      <div class="dado-valor">${totalArea.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m²</div>
    </div>` : ''}

    ${show('floors') && floors ? `
    <div class="dado-item">
      <div class="dado-label">Pavimentos</div>
      <div class="dado-valor">${floors}</div>
    </div>` : ''}

    ${show('cno') ? `
    <div class="dado-item">
      <div class="dado-label">CNO</div>
      <div class="dado-valor small">${project.cno ?? '—'}</div>
    </div>` : ''}

    ${show('buildingPermit') && buildingPermit ? `
    <div class="dado-item">
      <div class="dado-label">Alvará de Construção</div>
      <div class="dado-valor small">${buildingPermit}</div>
    </div>` : ''}

    ${show('address') && fullAddress ? `
    <div class="dado-full">
      <div class="dado-label">Endereço</div>
      <div class="dado-valor">${fullAddress}</div>
    </div>` : ''}

    ${show('art') && artDisplay ? `
    <div class="dado-full">
      <div class="dado-label">ART / RRT</div>
      <div class="dado-valor">${artDisplay}</div>
    </div>` : ''}

  </div>

  <!-- RODAPÉ -->
  <div class="rodape">
    <div class="rodape-info">
      <div>Gerado em <b>${geradoEm}</b></div>
      <div>SYSOBRA · Sistema de Gestão de Obras</div>
    </div>
    <div class="rodape-logo-box">
      ${syslobraLogoBase64
        ? `<img src="${syslobraLogoBase64}" class="rodape-logo-img" alt="SYSOBRA" />`
        : `<div class="rodape-logo-text">SYSOBRA</div>`}
    </div>
  </div>

</div>
</body>
</html>`
}
