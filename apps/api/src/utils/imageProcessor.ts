import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

/** Converte caminho absoluto do arquivo salvo em /uploads/... relativo. */
function toRelativePath(savedPath: string): string {
  const uploadsRoot = path.join(process.cwd(), 'uploads')
  const rel = path.relative(uploadsRoot, savedPath)
    .split(path.sep)   // garante que \ vira / no Windows
    .join('/')
  return `/uploads/${rel}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessImageOptions {
  inputBuffer: Buffer
  outputDir:   string
  filename:    string   // nome base sem extensão
  type:        'diary' | 'cover' | 'avatar'
}

export interface ProcessImageResult {
  savedPath:       string   // caminho absoluto do arquivo salvo
  relativePath:    string   // /uploads/... para retornar ao frontend
  originalSize:    number   // bytes
  compressedSize:  number   // bytes
  savedPercent:    number   // 0-100 (ex: 72 = economizou 72%)
  wasCompressed:   boolean  // false se fallback para original
}

// ─── Preset por tipo ──────────────────────────────────────────────────────────

const PRESETS = {
  diary:  { maxWidth: 1920, maxHeight: 1440, quality: 82 },
  cover:  { maxWidth: 1200, maxHeight:  800, quality: 85 },
  avatar: { maxWidth:  400, maxHeight:  400, quality: 85 },
}

// ─── processAndSaveImage ──────────────────────────────────────────────────────

/**
 * Comprime a imagem com sharp (WebP) e salva em outputDir.
 * Se a compressão falhar por qualquer motivo, salva o buffer original
 * no formato original — nunca lança erro para o caller.
 */
export async function processAndSaveImage(
  opts: ProcessImageOptions,
): Promise<ProcessImageResult> {
  const { inputBuffer, outputDir, filename, type } = opts
  const preset = PRESETS[type]
  const originalSize = inputBuffer.byteLength

  fs.mkdirSync(outputDir, { recursive: true })

  // ── Tenta comprimir para WebP ─────────────────────────────────────────────
  try {
    const webpBuffer = await sharp(inputBuffer)
      .resize({
        width:  preset.maxWidth,
        height: preset.maxHeight,
        fit:    'inside',             // mantém proporção, nunca amplia
        withoutEnlargement: true,
      })
      .webp({ quality: preset.quality })
      .toBuffer()

    const compressedSize = webpBuffer.byteLength
    const savedPercent   = Math.round((1 - compressedSize / originalSize) * 100)

    // Se a compressão "aumentou" o arquivo mais de 20 % (PNG pequeno p.ex.),
    // salva o original mesmo assim para não inflar o armazenamento.
    const finalBuffer   = compressedSize < originalSize * 1.2 ? webpBuffer : inputBuffer
    const finalExt      = compressedSize < originalSize * 1.2 ? 'webp'     : path.extname(filename).slice(1) || 'jpg'
    const finalSize     = finalBuffer.byteLength
    const finalFilename = `${filename}.${finalExt}`
    const savedPath     = path.join(outputDir, finalFilename)

    fs.writeFileSync(savedPath, finalBuffer)

    return {
      savedPath,
      relativePath:   toRelativePath(savedPath),
      originalSize,
      compressedSize: finalSize,
      savedPercent:   Math.max(0, savedPercent),
      wasCompressed:  true,
    }
  } catch (err) {
    // ── Fallback: salva original ──────────────────────────────────────────────
    console.warn('[imageProcessor] sharp failed, saving original:', err)

    const ext          = path.extname(filename) || '.jpg'
    const fallbackName = `${filename}${ext}`
    const savedPath    = path.join(outputDir, fallbackName)

    fs.writeFileSync(savedPath, inputBuffer)

    return {
      savedPath,
      relativePath:   toRelativePath(savedPath),
      originalSize,
      compressedSize: originalSize,
      savedPercent:   0,
      wasCompressed:  false,
    }
  }
}
