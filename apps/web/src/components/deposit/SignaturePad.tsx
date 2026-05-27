'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { RotateCcw, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Point { x: number; y: number }

interface SignaturePadProps {
  label?: string
  onSign?: (dataUrl: string) => void
  className?: string
  height?: number
  disabled?: boolean
}

export function SignaturePad({ label, onSign, className, height = 140, disabled }: SignaturePadProps) {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const drawing     = useRef(false)
  const lastPoint   = useRef<Point | null>(null)
  const [signed, setSigned] = useState(false)
  const [empty,  setEmpty]  = useState(true)

  // Setup canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#111827'
    ctx.lineWidth   = 2
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    // Fill white background
    ctx.fillStyle   = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [])

  // Helper: get point from mouse or touch
  function getPoint(e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement): Point {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    let clientX: number
    let clientY: number
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else if ('changedTouches' in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX
      clientY = e.changedTouches[0].clientY
    } else {
      clientX = (e as MouseEvent).clientX
      clientY = (e as MouseEvent).clientY
    }
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top)  * scaleY,
    }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    if (disabled || signed) return
    e.preventDefault()
    drawing.current = true
    const canvas = canvasRef.current!
    lastPoint.current = getPoint(e as any, canvas)
    setEmpty(false)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current || disabled || signed) return
    e.preventDefault()
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const point = getPoint(e as any, canvas)
    ctx.beginPath()
    ctx.moveTo(lastPoint.current!.x, lastPoint.current!.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    lastPoint.current = point
  }

  function endDraw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return
    e.preventDefault()
    drawing.current  = false
    lastPoint.current = null
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setSigned(false)
    setEmpty(true)
  }

  const confirmSign = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || empty) return
    const dataUrl = canvas.toDataURL('image/png')
    setSigned(true)
    onSign?.(dataUrl)
  }, [empty, onSign])

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && (
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</p>
      )}

      <div className={cn(
        'relative rounded-xl border-2 transition-colors overflow-hidden',
        signed   ? 'border-green-400 bg-green-50' :
        disabled ? 'border-gray-100 bg-gray-50' :
                   'border-dashed border-gray-300 bg-white',
      )}>
        <canvas
          ref={canvasRef}
          width={600}
          height={height * 2}   // 2× resolution for retina
          style={{ width: '100%', height, display: 'block', touchAction: 'none' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          className={cn(disabled || signed ? 'cursor-default' : 'cursor-crosshair')}
        />

        {/* Linha-guia */}
        {!signed && !disabled && (
          <div className="absolute bottom-7 left-4 right-4 border-b border-dashed border-gray-300 pointer-events-none" />
        )}

        {/* Placeholder */}
        {empty && !signed && !disabled && (
          <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-gray-400 pointer-events-none">
            Assine aqui
          </p>
        )}

        {/* Signed overlay */}
        {signed && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-green-500 rounded-full p-1">
              <Check size={16} className="text-white" />
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {!disabled && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={clearCanvas}
            disabled={empty && !signed}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <RotateCcw size={12} /> Limpar
          </button>
          <button
            type="button"
            onClick={confirmSign}
            disabled={empty || signed}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
          >
            <Check size={12} /> Confirmar
          </button>
        </div>
      )}
    </div>
  )
}
