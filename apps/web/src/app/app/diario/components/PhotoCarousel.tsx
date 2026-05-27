'use client'

import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { resolveUploadUrl } from '@/lib/upload'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CarouselPhoto {
  url:      string
  caption?: string
}

export interface PhotoCarouselProps {
  photos:        CarouselPhoto[]
  initialIndex?: number
  isOpen:        boolean
  onClose:       () => void
}

// ─── PhotoCarousel ────────────────────────────────────────────────────────────

export function PhotoCarousel({
  photos,
  initialIndex = 0,
  isOpen,
  onClose,
}: PhotoCarouselProps) {
  const [current, setCurrent] = useState(initialIndex)

  // Sincronizar índice ao abrir
  useEffect(() => {
    if (isOpen) setCurrent(Math.min(initialIndex, Math.max(0, photos.length - 1)))
  }, [isOpen, initialIndex, photos.length])

  // Navegação por teclado
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      onClose()
      if (e.key === 'ArrowLeft')   setCurrent(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight')  setCurrent(i => Math.min(photos.length - 1, i + 1))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, photos.length, onClose])

  // Bloquear scroll do body enquanto aberto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen || photos.length === 0) return null

  const photo = photos[current]

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.96)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-4 z-10"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)' }}
      >
        {/* Contador */}
        <span className="text-white/70 text-sm font-medium select-none">
          {current + 1} / {photos.length}
        </span>

        {/* Caption centralizada */}
        {photo?.caption && (
          <p className="text-white/90 text-sm text-center flex-1 px-6 truncate select-none">
            {photo.caption}
          </p>
        )}

        {/* Fechar */}
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full text-white hover:bg-white/20 transition-colors"
          title="Fechar (Esc)"
        >
          <X size={22} />
        </button>
      </div>

      {/* ── Imagem principal ─────────────────────────────────────────────── */}
      <div
        className="flex-1 flex items-center justify-center"
        style={{ padding: '72px 80px 96px' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={current}
          src={resolveUploadUrl(photo?.url)}
          alt={photo?.caption || `Foto ${current + 1}`}
          draggable={false}
          className="max-w-full max-h-full object-contain rounded select-none"
          style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.6)', userSelect: 'none' }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* ── Seta esquerda ────────────────────────────────────────────────── */}
      {current > 0 && (
        <button
          type="button"
          onClick={() => setCurrent(i => i - 1)}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center text-white transition-colors hover:bg-white/20"
          style={{ background: 'rgba(255,255,255,0.12)' }}
          title="Anterior (←)"
        >
          <ChevronLeft size={28} />
        </button>
      )}

      {/* ── Seta direita ─────────────────────────────────────────────────── */}
      {current < photos.length - 1 && (
        <button
          type="button"
          onClick={() => setCurrent(i => i + 1)}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center text-white transition-colors hover:bg-white/20"
          style={{ background: 'rgba(255,255,255,0.12)' }}
          title="Próxima (→)"
        >
          <ChevronRight size={28} />
        </button>
      )}

      {/* ── Strip de miniaturas ───────────────────────────────────────────── */}
      {photos.length > 1 && (
        <div
          className="absolute bottom-0 left-0 right-0 flex justify-center gap-2 px-4 py-3 overflow-x-auto"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)' }}
        >
          {photos.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrent(i)}
              className="flex-shrink-0 rounded-md overflow-hidden transition-all"
              style={{
                width:   54,
                height:  54,
                border:  i === current ? '2px solid #F5A623' : '2px solid transparent',
                opacity: i === current ? 1 : 0.55,
              }}
              title={p.caption || `Foto ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveUploadUrl(p.url)}
                alt=""
                draggable={false}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
