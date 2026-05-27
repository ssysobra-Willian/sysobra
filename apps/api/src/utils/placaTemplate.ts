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

/** Resolve um caminho relativo de upload `/uploads/...` para absoluto no servidor */
function resolveUploadPath(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    // URL externa — não é possível carregar via fs; retornar null
    return null
  }
  const clean = relativePath.replace(/^\/uploads\//, '')
  // A API roda a partir de apps/api/  →  uploads/ está 2 níveis acima do src/
  const uploadsRoot = path.join(__dirname, '../../uploads')
  return path.join(uploadsRoot, clean)
}

// ─── Logo SYSOBRA ─────────────────────────────────────────────────────────────

/** Retorna o logo SYSOBRA como base64 data-URI (busca em src/ e na raiz do package) */
export function getSyslobraLogoBase64(): string {
  const candidates = [
    path.join(__dirname, '../logo.png'),           // apps/api/src/logo.png
    path.join(__dirname, '../../src/logo.png'),    // fallback
    path.join(__dirname, '../logo-dark.png'),
    path.join(__dirname, '../logo-icon.png'),
  ]
  for (const p of candidates) {
    const b64 = fileToBase64(p)
    if (b64) return b64
  }
  return ''
}

// ─── Imagem central (logo da empresa ou foto da obra) ─────────────────────────

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

// ─── Parâmetros da função ─────────────────────────────────────────────────────

export interface PlacaParams {
  project:            any
  company:            any
  centralImageBase64: string | null
  syslobraLogoBase64: string
  imageType:          'logo' | 'photo'
}

// ─── Template HTML ────────────────────────────────────────────────────────────

export function gerarHtmlPlaca(params: PlacaParams): string {
  const { project, company, centralImageBase64, syslobraLogoBase64, imageType } = params

  const fullAddress = [project.address, project.city, project.state].filter(Boolean).join(', ') || null
  const artDisplay  = [project.artExecution, project.artProjects].filter(Boolean).join(' / ') || null
  const now         = new Date()
  const geradoEm    = `${formatDateBR(now)} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`

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

  /* ── TOPO: Logo SYSOBRA centralizada ── */
  .topo {
    background: #F5A623;
    height: 130px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 12px 32px;
    border-bottom: 5px solid #111827;
    flex-shrink: 0;
  }
  .sysobra-logo {
    height: 54px;
    width: auto;
    object-fit: contain;
  }
  .sysobra-logo-text {
    font-size: 42px;
    font-weight: 900;
    color: #111827;
    letter-spacing: 4px;
  }

  /* ── NOME DA EMPRESA ── */
  .empresa-nome {
    background: #111827;
    height: 68px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 32px;
    border-bottom: 3px solid #F5A623;
    flex-shrink: 0;
  }
  .empresa-nome span {
    font-size: 30px;
    font-weight: 900;
    color: #FFFFFF;
    text-transform: uppercase;
    letter-spacing: 3px;
    text-align: center;
    font-family: 'Arial Black', Arial, sans-serif;
  }

  /* ── ÁREA DE IMAGEM CENTRAL ── */
  .imagem-central {
    height: 260px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px 40px;
    background: #F9FAFB;
    border-bottom: 3px solid #E5E7EB;
    flex-shrink: 0;
  }
  .imagem-central img {
    max-width: 500px;
    max-height: 220px;
    object-fit: contain;
    border-radius: 8px;
  }
  .imagem-placeholder {
    width: 220px;
    height: 220px;
    background: #E5E7EB;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-family: Arial, sans-serif;
  }
  .placeholder-icon {
    font-size: 56px;
    opacity: 0.35;
  }
  .placeholder-text {
    font-size: 13px;
    color: #9CA3AF;
    text-align: center;
    line-height: 1.4;
  }

  /* ── NOME DA OBRA ── */
  .obra-nome {
    background: #FFFFFF;
    padding: 18px 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom: 4px solid #111827;
    flex-shrink: 0;
  }
  .obra-nome span {
    font-size: 48px;
    font-weight: 900;
    color: #111827;
    text-transform: uppercase;
    text-align: center;
    line-height: 1.1;
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
    padding: 11px 22px;
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
    font-size: 18px;
    font-weight: 700;
    color: #111827;
    font-family: Arial, sans-serif;
    line-height: 1.2;
  }
  .dado-valor.sm { font-size: 14px; }
  .dado-full {
    grid-column: 1 / -1;
    padding: 10px 22px;
    border-bottom: 1px solid #E5E7EB;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .dado-full .dado-label { margin-bottom: 0; min-width: 150px; flex-shrink: 0; }
  .dado-full .dado-valor { font-size: 15px; }

  /* ── LICENÇAS ── */
  .licencas {
    background: #F9FAFB;
    padding: 10px 22px;
    border-bottom: 3px solid #111827;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    flex-shrink: 0;
  }
  .licenca-item {
    text-align: center;
    padding: 8px;
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: 6px;
  }
  .licenca-label {
    font-size: 10px;
    font-weight: 700;
    color: #6B7280;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 2px;
    font-family: Arial, sans-serif;
  }
  .licenca-valor {
    font-size: 14px;
    font-weight: 700;
    color: #111827;
    font-family: Arial, sans-serif;
  }

  /* ── RODAPÉ ── */
  .rodape {
    background: #111827;
    height: 72px;
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
    padding: 6px 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .rodape-logo-img {
    height: 30px;
    width: auto;
    object-fit: contain;
  }
  .rodape-logo-text {
    font-size: 18px;
    font-weight: 900;
    color: #111827;
    letter-spacing: 2px;
    font-family: 'Arial Black', Arial, sans-serif;
  }
</style>
</head>
<body>
<div class="placa">

  <!-- TOPO: Logo SYSOBRA centralizada -->
  <div class="topo">
    ${syslobraLogoBase64
      ? `<img src="${syslobraLogoBase64}" class="sysobra-logo" alt="SYSOBRA" />`
      : `<div class="sysobra-logo-text">SYSOBRA</div>`}
  </div>

  <!-- NOME DA EMPRESA -->
  <div class="empresa-nome">
    <span>${company?.name ?? '—'}</span>
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
    <div class="dado-item">
      <div class="dado-label">Responsável Técnico</div>
      <div class="dado-valor sm">${project.technicalName ?? '—'}</div>
    </div>
    <div class="dado-item">
      <div class="dado-label">CREA / CAU</div>
      <div class="dado-valor sm">${project.technicalCrea ?? '—'}</div>
    </div>
    <div class="dado-item">
      <div class="dado-label">Início previsto</div>
      <div class="dado-valor">${formatDateBR(project.startDate)}</div>
    </div>
    <div class="dado-item">
      <div class="dado-label">Término previsto</div>
      <div class="dado-valor">${formatDateBR(project.expectedEndDate ?? project.endDate)}</div>
    </div>
    <div class="dado-item">
      <div class="dado-label">CNO</div>
      <div class="dado-valor">${project.cno ?? '—'}</div>
    </div>
    <div class="dado-item">
      <div class="dado-label">Código da obra</div>
      <div class="dado-valor">${project.code ?? '—'}</div>
    </div>
    ${fullAddress ? `
    <div class="dado-full">
      <div class="dado-label">Endereço</div>
      <div class="dado-valor sm">${fullAddress}</div>
    </div>` : ''}
    ${artDisplay ? `
    <div class="dado-full">
      <div class="dado-label">ART / RRT</div>
      <div class="dado-valor sm">${artDisplay}</div>
    </div>` : ''}
    ${project.client?.name ? `
    <div class="dado-full">
      <div class="dado-label">Cliente / Proprietário</div>
      <div class="dado-valor sm">${project.client.name}</div>
    </div>` : ''}
  </div>

  <!-- LICENÇAS -->
  <div class="licencas">
    <div class="licenca-item">
      <div class="licenca-label">Alvará de Construção</div>
      <div class="licenca-valor">${(project as any).buildingPermit ?? project.artExecution ?? '—'}</div>
    </div>
    <div class="licenca-item">
      <div class="licenca-label">Área construída</div>
      <div class="licenca-valor">${(project as any).totalArea ? `${(project as any).totalArea} m²` : (project.globalBudget ? `R$ ${Number(project.globalBudget).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : '—')}</div>
    </div>
    <div class="licenca-item">
      <div class="licenca-label">Pavimentos / Tipo</div>
      <div class="licenca-valor">${(project as any).floors ?? project.technicalTitle ?? '—'}</div>
    </div>
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
