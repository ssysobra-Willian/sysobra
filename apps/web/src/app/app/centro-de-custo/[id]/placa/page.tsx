'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, ChevronDown, Download, Printer, Loader2,
  Building2, Camera, RefreshCw, SlidersHorizontal,
} from 'lucide-react'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { cn } from '@/lib/utils'

// ─── auth ─────────────────────────────────────────────────────────────────────

function getToken()     { return typeof window !== 'undefined' ? (localStorage.getItem('token')     ?? '') : '' }
function getCompanyId() { return typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : '' }
function authHeaders()  { return { Authorization: `Bearer ${getToken()}`, 'x-company-id': getCompanyId() } }

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Campos configuráveis ─────────────────────────────────────────────────────

const FIELD_OPTIONS: { key: string; label: string }[] = [
  { key: 'technicalManager', label: 'Responsável técnico' },
  { key: 'crea',             label: 'CREA / CAU' },
  { key: 'startDate',        label: 'Início previsto' },
  { key: 'expectedEndDate',  label: 'Término previsto' },
  { key: 'area',             label: 'Área construída (m²)' },
  { key: 'floors',           label: 'Número de pavimentos' },
  { key: 'cno',              label: 'CNO' },
  { key: 'buildingPermit',   label: 'Alvará de construção' },
  { key: 'address',          label: 'Endereço da obra' },
  { key: 'art',              label: 'ART / RRT' },
]

const ALL_FIELD_KEYS = FIELD_OPTIONS.map(f => f.key)

// ─── types ────────────────────────────────────────────────────────────────────

interface PlateData {
  projectId:       string
  projectName:     string
  projectCode:     string | null
  address:         string | null
  coverImage:      string | null
  company: {
    name: string | null
    logo: string | null
  }
}

// ─── PlacaPreview ─────────────────────────────────────────────────────────────

interface PlacaPreviewProps {
  projectId:         string
  imageType:         'logo' | 'photo'
  visibleFields:     string[]
  onChangeImageType: (t: 'logo' | 'photo') => void
  onDownloadPdf:     () => void
  onDownloadPng:     () => void
  downloadingPdf:    boolean
  downloadingPng:    boolean
  downloadError:     string
  projectName:       string
  projectCode:       string | null
  hasCompanyLogo:    boolean
  hasCoverImage:     boolean
}

function PlacaPreview({
  projectId, imageType, visibleFields,
  onChangeImageType,
  onDownloadPdf, onDownloadPng,
  downloadingPdf, downloadingPng, downloadError,
  projectName, projectCode,
  hasCompanyLogo, hasCoverImage,
}: PlacaPreviewProps) {
  const [html,    setHtml]    = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef    = useRef<HTMLIFrameElement>(null)

  const fetchPreview = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const vf  = encodeURIComponent(JSON.stringify(visibleFields))
      const res = await fetch(
        `${API}/api/v1/projects/${projectId}/plate/preview?imageType=${imageType}&visibleFields=${vf}`,
        { headers: authHeaders() },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      setHtml(text)
    } catch {
      setError('Erro ao carregar prévia. Verifique a conexão.')
    } finally {
      setLoading(false)
    }
  }, [projectId, imageType, visibleFields])

  useEffect(() => { fetchPreview() }, [fetchPreview])

  useEffect(() => {
    if (!containerRef.current || !iframeRef.current) return
    const applyScale = (width: number) => {
      if (iframeRef.current) iframeRef.current.style.transform = `scale(${width / 900})`
    }
    applyScale(containerRef.current.offsetWidth)
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) applyScale(w)
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [html])

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Seletor de imagem central */}
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex-wrap">
        <span className="text-xs font-medium text-gray-500 mr-1">Imagem central:</span>
        {([
          { value: 'logo',  label: '🏢 Logo da empresa', has: hasCompanyLogo },
          { value: 'photo', label: '📷 Foto da obra',    has: hasCoverImage  },
        ] as const).map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChangeImageType(opt.value)}
            disabled={!opt.has}
            title={!opt.has ? `${opt.value === 'logo' ? 'Logo' : 'Foto'} não cadastrada` : undefined}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
              imageType === opt.value
                ? 'border-[#F5A623] bg-[#FEF3DC] text-amber-800'
                : opt.has
                  ? 'border-gray-200 text-gray-600 hover:border-gray-300'
                  : 'border-gray-100 text-gray-300 cursor-not-allowed',
            )}
          >
            {opt.label}
            {!opt.has && <span className="ml-1 text-[10px] opacity-60">(não cadastrada)</span>}
          </button>
        ))}
        <button
          onClick={fetchPreview}
          disabled={loading}
          className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 transition ml-1"
          title="Atualizar prévia"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Container da prévia */}
      <div
        ref={containerRef}
        className="w-full max-w-[500px] relative overflow-hidden border border-gray-200 rounded-lg shadow-lg bg-gray-100"
        style={{ paddingTop: 'calc(100% * 1200 / 900)' }}
      >
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 gap-3">
            <Loader2 size={28} className="animate-spin text-[#F5A623]" />
            <p className="text-xs text-gray-400">Carregando prévia…</p>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 gap-2 px-6 text-center">
            <p className="text-sm text-red-500">{error}</p>
            <button onClick={fetchPreview} className="text-xs text-[#F5A623] underline">Tentar novamente</button>
          </div>
        )}
        {html && !loading && !error && (
          <iframe
            ref={iframeRef}
            srcDoc={html}
            title="Prévia da placa de obra"
            scrolling="no"
            style={{
              position: 'absolute', top: 0, left: 0,
              width: 900, height: 1200, border: 'none',
              transformOrigin: 'top left',
            }}
          />
        )}
      </div>

      <p className="text-[11px] text-gray-400 text-center leading-relaxed">
        📐 A prévia é idêntica ao arquivo gerado &nbsp;·&nbsp; Tamanho real: <strong>90 × 120 cm</strong>
      </p>

      {downloadError && (
        <div className="w-full flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
          ⚠️ {downloadError}
        </div>
      )}

      <div className="flex gap-3 w-full max-w-[500px]">
        <button
          onClick={onDownloadPng}
          disabled={downloadingPng}
          className="flex-1 flex items-center justify-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium py-3 rounded-lg transition disabled:opacity-60"
        >
          {downloadingPng ? <><Loader2 size={15} className="animate-spin" /> Gerando…</> : <><Download size={15} /> Baixar PNG</>}
        </button>
        <button
          onClick={onDownloadPdf}
          disabled={downloadingPdf}
          className="flex-1 flex items-center justify-center gap-2 bg-[#F5A623] hover:bg-[#e09610] text-white text-sm font-semibold py-3 rounded-lg transition disabled:opacity-60"
        >
          {downloadingPdf ? <><Loader2 size={15} className="animate-spin" /> Gerando…</> : <><Printer size={15} /> Baixar PDF</>}
        </button>
      </div>
    </div>
  )
}

// ─── Seletor de campos ────────────────────────────────────────────────────────

function FieldSelector({
  visibleFields,
  onChange,
}: {
  visibleFields: string[]
  onChange: (fields: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const visSet = new Set(visibleFields)

  const toggle = (key: string) => {
    const next = visSet.has(key)
      ? visibleFields.filter(k => k !== key)
      : [...visibleFields, key]
    onChange(next)
  }

  const toggleAll = () => {
    onChange(visibleFields.length === ALL_FIELD_KEYS.length ? [] : [...ALL_FIELD_KEYS])
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-[#F5A623]" />
          <span className="text-sm font-semibold text-gray-700">Campos visíveis</span>
          <span className="text-xs text-gray-400">({visibleFields.length}/{ALL_FIELD_KEYS.length})</span>
        </div>
        <ChevronDown size={14} className={cn('text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-gray-100">
          <button
            onClick={toggleAll}
            className="text-xs text-[#F5A623] hover:text-[#d4891a] font-medium mt-3"
          >
            {visibleFields.length === ALL_FIELD_KEYS.length ? 'Desmarcar todos' : 'Marcar todos'}
          </button>
          <div className="space-y-1.5 mt-1">
            {FIELD_OPTIONS.map(f => (
              <label key={f.key} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={visSet.has(f.key)}
                  onChange={() => toggle(f.key)}
                  className="w-3.5 h-3.5 rounded accent-[#F5A623]"
                />
                <span className="text-xs text-gray-600 group-hover:text-gray-900">{f.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function PlacaObraPage() {
  const params = useParams()
  const router = useRouter()
  const id     = params.id as string

  const [data,          setData]          = useState<PlateData | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [imageType,     setImageType]     = useState<'logo' | 'photo'>('logo')
  const [visibleFields, setVisibleFields] = useState<string[]>([...ALL_FIELD_KEYS])
  // versão debounced — 500 ms
  const [debouncedVF,   setDebouncedVF]   = useState<string[]>([...ALL_FIELD_KEYS])

  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [downloadingPng, setDownloadingPng] = useState(false)
  const [downloadError,  setDownloadError]  = useState('')

  // Debounce: só atualiza debouncedVF depois de 500ms sem mudança
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedVF(visibleFields), 500)
    return () => clearTimeout(timer)
  }, [visibleFields])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/v1/projects/${id}/plate`, { headers: authHeaders() })
      if (!res.ok) { router.push(`/app/centro-de-custo/${id}`); return }
      const json = await res.json()
      setData(json.plate)
      setImageType(json.plate?.coverImage ? 'photo' : 'logo')
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { load() }, [load])

  const downloadFile = async (format: 'pdf' | 'png') => {
    const setter = format === 'pdf' ? setDownloadingPdf : setDownloadingPng
    setter(true)
    setDownloadError('')
    try {
      const vf  = encodeURIComponent(JSON.stringify(debouncedVF))
      const res = await fetch(
        `${API}/api/v1/projects/${id}/plate/${format}?imageType=${imageType}&visibleFields=${vf}`,
        { headers: authHeaders() },
      )
      if (!res.ok) throw new Error(`Erro ao gerar ${format.toUpperCase()} (HTTP ${res.status})`)
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `placa-${data?.projectCode ?? id}.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setDownloadError(err.message || `Erro ao gerar ${format.toUpperCase()}`)
    } finally {
      setter(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 size={28} className="animate-spin text-[#F5A623]" />
      </div>
    )
  }

  if (!data) return null

  const hasCompanyLogo = Boolean(data.company?.logo)
  const hasCoverImage  = Boolean(data.coverImage)

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <Breadcrumb items={[
        { label: 'Centro de Custo', href: '/app/centro-de-custo' },
        { label: data.projectName,  href: `/app/centro-de-custo/${id}` },
        { label: 'Placa de obra' },
      ]} />

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Placa de obra</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Prévia fiel ao arquivo — o que você vê é exatamente o que será gerado
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* ── Prévia (col-span-2) ──────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <PlacaPreview
            projectId={id}
            imageType={imageType}
            visibleFields={debouncedVF}
            onChangeImageType={setImageType}
            onDownloadPdf={() => downloadFile('pdf')}
            onDownloadPng={() => downloadFile('png')}
            downloadingPdf={downloadingPdf}
            downloadingPng={downloadingPng}
            downloadError={downloadError}
            projectName={data.projectName}
            projectCode={data.projectCode}
            hasCompanyLogo={hasCompanyLogo}
            hasCoverImage={hasCoverImage}
          />
        </div>

        {/* ── Painel lateral ───────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Seletor de campos */}
          <FieldSelector
            visibleFields={visibleFields}
            onChange={setVisibleFields}
          />

          {/* Status das imagens */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Imagens disponíveis</h3>
            <div className="space-y-2">
              <div className={cn(
                'flex items-center gap-2.5 p-3 rounded-lg border text-sm',
                hasCompanyLogo ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-100 bg-gray-50 text-gray-400',
              )}>
                <Building2 size={16} />
                <div>
                  <p className="font-medium">Logo da empresa</p>
                  {!hasCompanyLogo && (
                    <p className="text-xs opacity-70">
                      Cadastre em{' '}
                      <Link href="/app/configuracoes" className="underline">Configurações</Link>
                    </p>
                  )}
                </div>
                <span className="ml-auto">{hasCompanyLogo ? '✓' : '—'}</span>
              </div>

              <div className={cn(
                'flex items-center gap-2.5 p-3 rounded-lg border text-sm',
                hasCoverImage ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-100 bg-gray-50 text-gray-400',
              )}>
                <Camera size={16} />
                <div>
                  <p className="font-medium">Foto da obra</p>
                  {!hasCoverImage && (
                    <p className="text-xs opacity-70">
                      Adicione na{' '}
                      <Link href={`/app/centro-de-custo/${id}/editar`} className="underline">edição da obra</Link>
                    </p>
                  )}
                </div>
                <span className="ml-auto">{hasCoverImage ? '✓' : '—'}</span>
              </div>
            </div>
          </div>

          {/* Dica */}
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
            <p className="text-xs text-amber-700 leading-relaxed">
              💡 <strong>Dica gráfica:</strong> Baixe o <strong>PDF</strong> para envio a gráficas —
              tamanho exato 90×120 cm em alta resolução (2×). Use o <strong>PNG</strong> para
              publicações digitais ou apresentações.
            </p>
          </div>

          {/* Voltar */}
          <Link
            href={`/app/centro-de-custo/${id}`}
            className="flex items-center justify-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 py-2 transition-colors"
          >
            <ChevronLeft size={14} /> Voltar para a obra
          </Link>
        </div>
      </div>
    </div>
  )
}
