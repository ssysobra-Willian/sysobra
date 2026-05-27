'use client'

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react'
import {
  X, ShieldCheck, User, Search, Camera, Loader2, CheckCircle2,
  ChevronLeft, ChevronRight, RotateCcw, PenTool, CameraOff,
  AlertTriangle, ZoomIn,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
function tok() { return typeof window !== 'undefined' ? (localStorage.getItem('token') ?? '') : '' }
function cid() { return typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : '' }

// ─── Types ────────────────────────────────────────────────────────────────────

interface EpiItem {
  id:       string
  name:     string
  code?:    string | null
  unit:     string
  quantity: number
  brand?:   string | null
  imageUrl?: string | null
}

interface Employee {
  id:        string
  name:      string
  position?: string | null
}

interface Props {
  isOpen:    boolean
  items:     EpiItem[]
  employees: Employee[]
  onClose:   () => void
  onSaved:   () => void
  /** Pre-select EPI if opening from item context */
  preselectedItemId?: string
}

// ─── Utility: compress/watermark image via canvas ─────────────────────────────

async function addWatermarkToDataUrl(
  dataUrl: string,
  lines: string[],
): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      // Scale down max 900px wide
      const MAX = 900
      const scale = img.width > MAX ? MAX / img.width : 1
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)

      // Semi-transparent banner at bottom
      const bannerH = Math.max(32, Math.round(h * 0.08))
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(0, h - bannerH, w, bannerH)

      // Text
      const fontSize = Math.max(11, Math.round(bannerH * 0.32))
      ctx.fillStyle   = '#ffffff'
      ctx.font        = `${fontSize}px sans-serif`
      ctx.textBaseline = 'middle'
      const lineHeight = bannerH / lines.length
      lines.forEach((line, i) => {
        ctx.fillText(line, 8, h - bannerH + lineHeight * (i + 0.5))
      })

      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.src = dataUrl
  })
}

// ─── Sub-component: Searchable Select ────────────────────────────────────────

function SearchSelect<T extends { id: string; name: string; position?: string | null; code?: string | null; brand?: string | null }>({
  options, value, onChange, placeholder, label, disabled,
}: {
  options:     T[]
  value:       string
  onChange:    (id: string) => void
  placeholder: string
  label:       string
  disabled?:   boolean
}) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const filtered = options.filter(o =>
    o.name.toLowerCase().includes(query.toLowerCase()) ||
    o.code?.toLowerCase().includes(query.toLowerCase()) ||
    o.brand?.toLowerCase().includes(query.toLowerCase()),
  )
  const selected = options.find(o => o.id === value)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center justify-between border rounded-xl px-3 py-2.5 text-sm text-left transition',
          open ? 'border-[#F5A623] ring-2 ring-[#F5A623]/20' : 'border-gray-200 hover:border-gray-300',
          disabled && 'opacity-60 cursor-not-allowed',
          !selected && 'text-gray-400',
        )}
      >
        <div className="min-w-0">
          {selected ? (
            <>
              <span className="text-gray-800 font-medium">{selected.name}</span>
              {(selected as any).position && (
                <span className="text-gray-400 text-xs ml-2">{(selected as any).position}</span>
              )}
            </>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </div>
        <Search size={14} className="text-gray-400 flex-shrink-0 ml-2" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#F5A623]"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Nenhum resultado</p>
            ) : filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setQuery(''); setOpen(false) }}
                className={cn(
                  'w-full flex flex-col items-start px-3 py-2.5 text-sm hover:bg-gray-50 transition',
                  value === o.id && 'bg-orange-50',
                )}
              >
                <span className={cn('font-medium', value === o.id ? 'text-[#F5A623]' : 'text-gray-800')}>{o.name}</span>
                <div className="flex gap-2 mt-0.5">
                  {(o as any).code && <span className="text-[10px] text-gray-400">{(o as any).code}</span>}
                  {(o as any).position && <span className="text-[10px] text-gray-400">{(o as any).position}</span>}
                  {(o as any).brand && <span className="text-[10px] text-gray-400">• {(o as any).brand}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-component: Signature Pad ─────────────────────────────────────────────

function SignaturePad({
  onSign,
  label = 'Assinatura do colaborador',
}: {
  onSign: (dataUrl: string | null) => void
  label?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const [signed,  setSigned]  = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const rect = canvasRef.current!.getBoundingClientRect()
    const touch = (e as React.TouchEvent).touches?.[0]
    const client = touch ?? (e as React.MouseEvent)
    return {
      x: client.clientX - rect.left,
      y: client.clientY - rect.top,
    }
  }

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    isDrawing.current = true
    lastPoint.current = getPos(e)
  }, [])

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!isDrawing.current || !canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')!
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(lastPoint.current!.x, lastPoint.current!.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.stroke()
    lastPoint.current = pos
    setSigned(true)
  }, [])

  const stopDrawing = useCallback(() => {
    isDrawing.current = false
    if (signed && canvasRef.current) {
      const url = canvasRef.current.toDataURL('image/png')
      setPreview(url)
      onSign(url)
    }
  }, [signed, onSign])

  const clear = () => {
    if (!canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')!
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    setSigned(false)
    setPreview(null)
    onSign(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <PenTool size={10} className="inline mr-1" />{label}
        </label>
        {signed && (
          <button type="button" onClick={clear}
            className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition">
            <RotateCcw size={11} /> Limpar
          </button>
        )}
      </div>
      <div className={cn(
        'relative border-2 rounded-xl overflow-hidden bg-gray-50',
        signed ? 'border-[#F5A623]' : 'border-dashed border-gray-300',
      )}>
        <canvas
          ref={canvasRef}
          width={480}
          height={120}
          className="w-full touch-none cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {!signed && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-1 text-gray-300">
              <PenTool size={18} />
              <p className="text-xs">Assine aqui com o dedo ou mouse</p>
            </div>
          </div>
        )}
      </div>
      {signed && <p className="text-[10px] text-green-600 mt-1 flex items-center gap-1"><CheckCircle2 size={10} />Assinatura capturada</p>}
    </div>
  )
}

// ─── Sub-component: Selfie Capture ────────────────────────────────────────────

function SelfieCapturer({
  onCapture,
  watermarkLines,
}: {
  onCapture:     (dataUrl: string | null) => void
  watermarkLines: string[]
}) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [mode,      setMode]      = useState<'idle' | 'camera' | 'preview'>('idle')
  const [preview,   setPreview]   = useState<string | null>(null)
  const [camError,  setCamError]  = useState('')
  const [starting,  setStarting]  = useState(false)

  const startCamera = async () => {
    setStarting(true)
    setCamError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setMode('camera')
    } catch (err: any) {
      setCamError(err.name === 'NotAllowedError'
        ? 'Permissão de câmera negada. Libere nas configurações do navegador.'
        : 'Câmera não encontrada ou indisponível.')
    } finally {
      setStarting(false)
    }
  }

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  const capture = async () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const size  = Math.min(video.videoWidth, video.videoHeight)
    canvasRef.current.width  = size
    canvasRef.current.height = size
    const ctx = canvasRef.current.getContext('2d')!
    // Mirror & crop to square
    ctx.save()
    ctx.scale(-1, 1)
    const ox = -(video.videoWidth + size) / 2
    ctx.drawImage(video, ox, -(video.videoHeight - size) / 2, video.videoWidth, video.videoHeight)
    ctx.restore()

    stopCamera()

    const raw = canvasRef.current.toDataURL('image/jpeg', 0.9)
    const watermarked = await addWatermarkToDataUrl(raw, watermarkLines)
    setPreview(watermarked)
    setMode('preview')
    onCapture(watermarked)
  }

  const retake = () => {
    setPreview(null)
    setMode('idle')
    onCapture(null)
  }

  // Cleanup on unmount
  useEffect(() => () => stopCamera(), [stopCamera])

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        <Camera size={10} className="inline mr-1" />Selfie do colaborador (opcional)
      </label>

      {mode === 'idle' && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={startCamera}
            disabled={starting}
            className="w-full border-2 border-dashed border-gray-200 rounded-xl py-5 flex flex-col items-center gap-2 text-gray-400 hover:border-orange-300 hover:text-orange-500 transition disabled:opacity-60"
          >
            {starting ? <Loader2 size={22} className="animate-spin" /> : <Camera size={22} />}
            <span className="text-xs font-medium">{starting ? 'Iniciando câmera...' : 'Capturar selfie do colaborador'}</span>
            <span className="text-[10px] text-gray-300">Data e hora serão gravadas na imagem</span>
          </button>
          {camError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700">
              <CameraOff size={13} className="flex-shrink-0 mt-0.5" />
              <span>{camError}</span>
            </div>
          )}
        </div>
      )}

      {mode === 'camera' && (
        <div className="relative rounded-xl overflow-hidden bg-black">
          <video
            ref={videoRef}
            className="w-full aspect-square object-cover"
            style={{ transform: 'scaleX(-1)' }}
            playsInline
            muted
          />
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-4 gap-3">
            <button
              type="button"
              onClick={capture}
              className="w-14 h-14 rounded-full bg-white border-4 border-[#F5A623] shadow-lg hover:scale-105 transition-transform"
            />
            <button
              type="button"
              onClick={() => { stopCamera(); setMode('idle') }}
              className="text-white/70 text-xs hover:text-white transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {mode === 'preview' && preview && (
        <div className="relative rounded-xl overflow-hidden border border-green-200">
          <img src={preview} alt="Selfie" className="w-full aspect-square object-cover" />
          <div className="absolute top-2 right-2 flex gap-2">
            <button
              type="button"
              onClick={retake}
              className="bg-black/50 text-white text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 hover:bg-black/70 transition"
            >
              <RotateCcw size={11} /> Refazer
            </button>
          </div>
          <div className="absolute bottom-0 inset-x-0 flex items-center gap-1 bg-green-600 px-3 py-1.5">
            <CheckCircle2 size={12} className="text-white" />
            <span className="text-white text-xs font-medium">Selfie capturada</span>
          </div>
        </div>
      )}

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-all',
            i === current ? 'w-5 bg-[#F5A623]' : i < current ? 'w-3 bg-[#F5A623]/40' : 'w-3 bg-gray-200',
          )}
        />
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function EpiDeliveryModal({
  isOpen, items, employees, onClose, onSaved, preselectedItemId,
}: Props) {
  // Step
  const [step, setStep] = useState(0) // 0 = selecionar, 1 = assinar + selfie

  // Step 1
  const [itemId,     setItemId]     = useState(preselectedItemId ?? '')
  const [employeeId, setEmployeeId] = useState('')
  const [quantity,   setQuantity]   = useState(1)
  const [size,       setSize]       = useState('')
  const [expiresAt,  setExpiresAt]  = useState('')
  const [notes,      setNotes]      = useState('')

  // Step 2
  const [signature, setSignature] = useState<string | null>(null)
  const [selfie,    setSelfie]    = useState<string | null>(null)

  // Status
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState(false)

  const selectedItem     = items.find(i => i.id === itemId)
  const selectedEmployee = employees.find(e => e.id === employeeId)

  // Reset when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep(0)
      setItemId(preselectedItemId ?? '')
      setEmployeeId('')
      setQuantity(1)
      setSize('')
      setExpiresAt('')
      setNotes('')
      setSignature(null)
      setSelfie(null)
      setError('')
      setSuccess(false)
    }
  }, [isOpen, preselectedItemId])

  // ── Step 1 validation ─────────────────────────────────────────────────────
  const canGoToStep2 = itemId && employeeId && quantity >= 1

  const goToStep2 = () => {
    if (!itemId)      { setError('Selecione o EPI'); return }
    if (!employeeId)  { setError('Selecione o colaborador'); return }
    if (quantity < 1) { setError('Quantidade inválida'); return }
    setError('')
    setStep(1)
  }

  // ── Selfie watermark lines ────────────────────────────────────────────────
  const now = new Date()
  const dateStr = now.toLocaleDateString('pt-BR')
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const watermarkLines = [
    `${selectedEmployee?.name ?? 'Colaborador'} — ${selectedItem?.name ?? 'EPI'}`,
    `Entrega em ${dateStr} às ${timeStr}`,
  ]

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!itemId || !employeeId) { setError('Dados incompletos'); setStep(0); return }

    setSaving(true)
    setError('')

    try {
      const body: Record<string, any> = {
        stockItemId: itemId,
        employeeId,
        quantity,
        size:       size      || undefined,
        expiresAt:  expiresAt || undefined,
        notes:      notes     || undefined,
        employeeSignature: signature ?? undefined,
        selfieUrl:  selfie    ?? undefined,
      }

      const res = await fetch(`${API}/api/v1/deposit/epi-deliveries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${tok()}`,
          'x-company-id': cid(),
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `Erro ${res.status}`)
      }

      setSuccess(true)
      setTimeout(() => { onSaved(); onClose() }, 800)
    } catch (err: any) {
      setError(err.message ?? 'Erro ao registrar entrega de EPI')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}>

      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[96dvh] shadow-2xl overflow-hidden">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <ShieldCheck size={15} className="text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800 text-sm">Entrega de EPI</h2>
              <p className="text-xs text-gray-400">
                {step === 0 ? 'Selecione o EPI e o colaborador' : 'Assinatura e confirmação'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StepDots current={step} total={2} />
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <X size={18} className="text-gray-500" />
            </button>
          </div>
        </div>

        {/* ── Step 0: Seleção ───────────────────────────────────────────── */}
        {step === 0 && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-5 space-y-4">

              {/* EPI */}
              <SearchSelect
                options={items}
                value={itemId}
                onChange={id => { setItemId(id); setError('') }}
                placeholder="Selecione o EPI..."
                label="🦺 EPI *"
              />

              {/* Info card do EPI selecionado */}
              {selectedItem && (
                <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 flex items-center gap-3">
                  <ShieldCheck size={18} className="text-green-600 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{selectedItem.name}</p>
                    <div className="flex gap-3 mt-0.5">
                      {selectedItem.code && <span className="text-xs text-gray-400">{selectedItem.code}</span>}
                      {selectedItem.brand && <span className="text-xs text-gray-400">• {selectedItem.brand}</span>}
                      <span className="text-xs text-gray-400">• Disponível: <span className="font-semibold text-gray-600">{selectedItem.quantity} {selectedItem.unit}</span></span>
                    </div>
                  </div>
                </div>
              )}

              {/* Colaborador */}
              <SearchSelect
                options={employees}
                value={employeeId}
                onChange={id => { setEmployeeId(id); setError('') }}
                placeholder="Selecione o colaborador..."
                label="👷 Colaborador *"
              />

              {/* Quantidade */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Quantidade *
                </label>
                <div className="flex items-center gap-3">
                  <button type="button"
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="w-10 h-10 rounded-xl border border-gray-200 text-xl text-gray-600 hover:bg-gray-50 transition flex items-center justify-center font-light"
                  >−</button>
                  <input
                    type="number"
                    min="1"
                    max={selectedItem?.quantity ?? 999}
                    value={quantity}
                    onChange={e => setQuantity(Math.max(1, Number(e.target.value)))}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30 focus:border-[#F5A623]"
                  />
                  <button type="button"
                    onClick={() => setQuantity(q => Math.min(selectedItem?.quantity ?? 999, q + 1))}
                    className="w-10 h-10 rounded-xl border border-gray-200 text-xl text-gray-600 hover:bg-gray-50 transition flex items-center justify-center font-light"
                  >+</button>
                  <span className="text-xs text-gray-400">{selectedItem?.unit ?? 'un'}</span>
                </div>
              </div>

              {/* Tamanho */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Tamanho / Numeração
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {['PP', 'P', 'M', 'G', 'GG', 'XGG', '36', '38', '40', '42', '44', '46'].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSize(prev => prev === s ? '' : s)}
                      className={cn(
                        'px-3 py-1 rounded-lg text-xs border font-medium transition',
                        size === s
                          ? 'bg-[#F5A623] border-[#F5A623] text-white'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300',
                      )}
                    >{s}</button>
                  ))}
                </div>
                <input
                  type="text"
                  value={size}
                  onChange={e => setSize(e.target.value)}
                  placeholder="Ou digite o tamanho..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30 focus:border-[#F5A623]"
                />
              </div>

              {/* Validade */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Validade do EPI
                </label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={e => setExpiresAt(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30 focus:border-[#F5A623]"
                />
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Observações
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Estado do EPI, condições de uso, motivo..."
                  rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30 focus:border-[#F5A623] resize-none"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-xs text-red-700">
                  <AlertTriangle size={13} />
                  {error}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 1: Assinatura + Selfie ───────────────────────────────── */}
        {step === 1 && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-5 space-y-5">

              {/* Resumo */}
              <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Resumo da entrega</p>
                <div className="flex items-center gap-2">
                  <ShieldCheck size={14} className="text-green-600 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-800">{selectedItem?.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User size={14} className="text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{selectedEmployee?.name}</span>
                  {selectedEmployee?.position && (
                    <span className="text-xs text-gray-400">— {selectedEmployee.position}</span>
                  )}
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>Qtd: <strong className="text-gray-700">{quantity} {selectedItem?.unit}</strong></span>
                  {size && <span>Tamanho: <strong className="text-gray-700">{size}</strong></span>}
                  {expiresAt && <span>Validade: <strong className="text-gray-700">{new Date(expiresAt + 'T12:00').toLocaleDateString('pt-BR')}</strong></span>}
                </div>
              </div>

              {/* Assinatura */}
              <SignaturePad onSign={setSignature} label="✍️ Assinatura do colaborador" />

              {/* Selfie */}
              <SelfieCapturer
                onCapture={setSelfie}
                watermarkLines={watermarkLines}
              />

              {!signature && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700">
                  <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                  <span>A assinatura é obrigatória para confirmar o recebimento do EPI.</span>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-xs text-red-700">
                  <AlertTriangle size={13} />
                  {error}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0 pb-[env(safe-area-inset-bottom,16px)]">
          {step === 0 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
              >Cancelar</button>
              <button
                type="button"
                onClick={goToStep2}
                disabled={!canGoToStep2}
                className="flex-1 py-3 rounded-xl bg-[#F5A623] text-white text-sm font-semibold hover:bg-[#e09610] transition disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                Próximo <ChevronRight size={15} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setStep(0); setError('') }}
                disabled={saving}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <ChevronLeft size={15} /> Voltar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving || success || !signature}
                className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {success ? (
                  <><CheckCircle2 size={15} />Entregue!</>
                ) : saving ? (
                  <><Loader2 size={15} className="animate-spin" />Salvando...</>
                ) : (
                  <><ShieldCheck size={15} />Confirmar Entrega</>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
