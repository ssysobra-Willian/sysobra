'use client'

import { useState, useRef, useEffect } from 'react'

interface Props {
  isOpen:         boolean
  onClose:        () => void
  onSign:         (signatureData: string, save: boolean) => void
  savedSignature?: string | null
  title?:          string
  subtitle?:       string
  loading?:        boolean
}

export default function SignatureModal({
  isOpen, onClose, onSign,
  savedSignature, title, subtitle, loading = false,
}: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const [isDrawing,     setIsDrawing]     = useState(false)
  const [hasDrawn,      setHasDrawn]      = useState(false)
  const [useSaved,      setUseSaved]      = useState(!!savedSignature)
  const [saveSignature, setSaveSignature] = useState(true)

  useEffect(() => {
    if (isOpen) {
      setUseSaved(!!savedSignature)
      setHasDrawn(false)
    }
  }, [isOpen, savedSignature])

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect   = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    const src    = 'touches' in e ? e.touches[0] : e
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY,
    }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    if (useSaved) return
    e.preventDefault()
    const canvas = canvasRef.current; if (!canvas) return
    setIsDrawing(true)
    const { x, y } = getPos(e, canvas)
    const ctx = canvas.getContext('2d')!
    ctx.beginPath(); ctx.moveTo(x, y)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing || useSaved) return
    e.preventDefault()
    const canvas = canvasRef.current; if (!canvas) return
    const { x, y } = getPos(e, canvas)
    const ctx = canvas.getContext('2d')!
    ctx.lineTo(x, y)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.stroke()
    setHasDrawn(true)
  }

  function stopDraw() { setIsDrawing(false) }

  function clearCanvas() {
    const canvas = canvasRef.current; if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
    setUseSaved(false)
  }

  function handleConfirm() {
    if (useSaved && savedSignature) {
      onSign(savedSignature, false)
      return
    }
    if (!hasDrawn) return
    const canvas = canvasRef.current!
    onSign(canvas.toDataURL('image/png'), saveSignature)
  }

  if (!isOpen) return null

  const canConfirm = (useSaved && !!savedSignature) || hasDrawn

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 460, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>
          {title || 'Assinar documento'}
        </h3>
        {subtitle && (
          <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 16px' }}>{subtitle}</p>
        )}

        {/* Toggle usar salva / desenhar nova */}
        {savedSignature && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              onClick={() => setUseSaved(true)}
              style={{ flex: 1, padding: 8, borderRadius: 8, border: `2px solid ${useSaved ? '#F5A623' : '#E5E7EB'}`, background: useSaved ? '#FEF3DC' : 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: useSaved ? 700 : 400 }}
            >
              ♻️ Usar salva
            </button>
            <button
              onClick={() => { setUseSaved(false); clearCanvas() }}
              style={{ flex: 1, padding: 8, borderRadius: 8, border: `2px solid ${!useSaved ? '#F5A623' : '#E5E7EB'}`, background: !useSaved ? '#FEF3DC' : 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: !useSaved ? 700 : 400 }}
            >
              ✏️ Nova assinatura
            </button>
          </div>
        )}

        {/* Assinatura salva */}
        {useSaved && savedSignature ? (
          <div style={{ border: '2px solid #BBF7D0', borderRadius: 10, background: '#F0FDF4', padding: 12, textAlign: 'center', marginBottom: 16 }}>
            <img src={savedSignature} alt="Assinatura salva" style={{ maxHeight: 110, maxWidth: '100%', objectFit: 'contain' }} />
            <div style={{ fontSize: 11, color: '#16A34A', marginTop: 6 }}>✅ Assinatura salva no perfil</div>
          </div>
        ) : (
          /* Canvas nova assinatura */
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: '#6B7280' }}>Desenhe sua assinatura:</span>
              <button onClick={clearCanvas} style={{ fontSize: 12, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}>Limpar</button>
            </div>
            <canvas
              ref={canvasRef}
              width={412}
              height={140}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={stopDraw}
              style={{ width: '100%', height: 140, border: `2px dashed ${hasDrawn ? '#F5A623' : '#D1D5DB'}`, borderRadius: 8, background: '#FAFAFA', cursor: 'crosshair', touchAction: 'none', display: 'block' }}
            />
            <div style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 4 }}>
              {hasDrawn ? '✏️ Assinatura registrada' : 'Desenhe acima com o mouse ou dedo'}
            </div>
          </div>
        )}

        {/* Opção salvar no perfil */}
        {!useSaved && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 16, cursor: 'pointer' }}>
            <input type="checkbox" checked={saveSignature} onChange={e => setSaveSignature(e.target.checked)} style={{ accentColor: '#F5A623' }} />
            Salvar esta assinatura no meu perfil para uso futuro
          </label>
        )}

        {/* Ações */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #D1D5DB', background: 'transparent', cursor: 'pointer', fontSize: 14 }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
            style={{ flex: 2, padding: 10, borderRadius: 8, background: canConfirm && !loading ? '#F5A623' : '#D1D5DB', border: 'none', color: '#fff', fontWeight: 700, cursor: canConfirm && !loading ? 'pointer' : 'not-allowed', fontSize: 14 }}
          >
            {loading ? 'Assinando...' : '✍️ Confirmar assinatura'}
          </button>
        </div>
      </div>
    </div>
  )
}
