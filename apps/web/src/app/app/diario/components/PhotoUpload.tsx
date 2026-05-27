'use client'

import React, { useRef, useState, useEffect, useCallback } from 'react'
import {
  Camera, Eye, Trash2, Check, X,
  ChevronLeft, ChevronRight, AlertCircle,
} from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PhotoItem {
  id:               string
  url:              string
  caption?:         string
  status:           'uploading' | 'done' | 'error'
  progress?:        number
  file?:            File
  compressionInfo?: string   // ex: "−72%" — exibido por 4s após upload
  showBadge?:       boolean  // true durante os 4s do badge
}

export interface PhotoUploadProps {
  photos:      PhotoItem[]
  onChange:    React.Dispatch<React.SetStateAction<PhotoItem[]>>
  maxPhotos?:  number
  diaryId?:    string
  token:       string
}

// ─── PhotoUpload ──────────────────────────────────────────────────────────────

export function PhotoUpload({
  photos,
  onChange,
  maxPhotos = 20,
  diaryId,
  token,
}: PhotoUploadProps) {
  const inputRef               = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [lightbox,   setLightbox]   = useState<{ open: boolean; idx: number }>({ open: false, idx: 0 })

  // ── Helpers ────────────────────────────────────────────────────────────────

  const addPhoto = useCallback((photo: PhotoItem) => {
    onChange([...photos, photo])
  }, [photos, onChange])

  const updatePhoto = useCallback((id: string, patch: Partial<PhotoItem>) => {
    onChange(photos.map(p => p.id === id ? { ...p, ...patch } : p))
  }, [photos, onChange])

  const removePhoto = useCallback(async (id: string) => {
    const photo = photos.find(p => p.id === id)
    if (photo?.status === 'done' && photo.url.startsWith('/uploads/')) {
      try {
        await fetch(`${API}/api/v1/uploads/diary-photo`, {
          method:  'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ url: photo.url }),
        })
      } catch { /* silent — arquivo pode já não existir */ }
    }
    if (photo?.url?.startsWith('blob:')) URL.revokeObjectURL(photo.url)
    onChange(photos.filter(p => p.id !== id))
  }, [photos, onChange, token])

  // ── Upload ─────────────────────────────────────────────────────────────────

  const uploadFile = useCallback((file: File, existingPhotos: PhotoItem[]) => {
    // Validar tipo
    if (!file.type.startsWith('image/')) {
      console.warn(`${file.name}: apenas imagens`)
      return
    }
    // Validar tamanho
    if (file.size > 10 * 1024 * 1024) {
      console.warn(`${file.name}: máximo 10MB`)
      return
    }

    const localUrl = URL.createObjectURL(file)
    const tempId   = crypto.randomUUID()
    const newPhoto: PhotoItem = { id: tempId, url: localUrl, status: 'uploading', progress: 0, file }
    onChange([...existingPhotos, newPhoto])

    const formData = new FormData()
    formData.append('file', file)
    if (diaryId) formData.append('diaryId', diaryId)

    const xhr = new XMLHttpRequest()

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100)
        // Atualiza usando referência estável
        onChange(prev => prev.map(p => p.id === tempId ? { ...p, progress: pct } : p))
      }
    }

    xhr.onload = () => {
      if (xhr.status === 200) {
        const resp = JSON.parse(xhr.responseText) as {
          url: string
          savedPercent?: number
          wasCompressed?: boolean
        }
        URL.revokeObjectURL(localUrl)

        // Badge de compressão: exibir por 4s se economizou ≥ 5%
        const compressionInfo =
          resp.wasCompressed && (resp.savedPercent ?? 0) >= 5
            ? `−${resp.savedPercent}%`
            : undefined

        onChange(prev => prev.map(p =>
          p.id === tempId
            ? { ...p, url: resp.url, status: 'done', progress: 100, file: undefined,
                compressionInfo, showBadge: !!compressionInfo }
            : p
        ))

        // Ocultar badge após 4s
        if (compressionInfo) {
          setTimeout(() => {
            onChange(prev => prev.map(p =>
              p.id === tempId ? { ...p, showBadge: false } : p
            ))
          }, 4000)
        }
      } else {
        onChange(prev => prev.map(p => p.id === tempId ? { ...p, status: 'error' } : p))
      }
    }

    xhr.onerror = () => {
      onChange(prev => prev.map(p => p.id === tempId ? { ...p, status: 'error' } : p))
    }

    xhr.open('POST', `${API}/api/v1/uploads/diary-photo`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.send(formData)
  }, [diaryId, token, onChange])

  // ── Input / Drop handlers ─────────────────────────────────────────────────

  function handleFiles(files: FileList | File[]) {
    const arr    = Array.from(files)
    const slots  = maxPhotos - photos.length
    const toUpload = arr.slice(0, slots)
    // Captura snapshot do estado atual para cada arquivo em sequência
    let current = [...photos]
    toUpload.forEach(f => {
      const localUrl = URL.createObjectURL(f)
      const tempId   = crypto.randomUUID()
      current = [...current, { id: tempId, url: localUrl, status: 'uploading', progress: 0, file: f }]
      uploadFile(f, current.slice(0, -1)) // passa o snapshot sem este item; uploadFile vai adicionar
    })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    if (photos.length >= maxPhotos) return
    handleFiles(e.dataTransfer.files)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return
    handleFiles(e.target.files)
    e.target.value = ''
  }

  // ── Lightbox keyboard ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!lightbox.open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(l => ({ ...l, open: false }))
      const done = photos.filter(p => p.status === 'done')
      if (e.key === 'ArrowRight') setLightbox(l => ({ ...l, idx: (l.idx + 1) % done.length }))
      if (e.key === 'ArrowLeft')  setLightbox(l => ({ ...l, idx: (l.idx - 1 + done.length) % done.length }))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightbox.open, photos])

  const donePhotos = photos.filter(p => p.status === 'done')

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Drop Zone */}
      {photos.length < maxPhotos && (
        <div
          onClick={() => inputRef.current?.click()}
          onDragEnter={e => { e.preventDefault(); setIsDragging(true) }}
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`
            cursor-pointer rounded-xl p-8 text-center transition-all
            ${isDragging
              ? 'border-2 border-[#F5A623] bg-orange-50'
              : 'border-2 border-dashed border-[#F5A623]/60 hover:border-[#F5A623] hover:bg-orange-50/40'
            }
          `}
        >
          <Camera size={40} className="mx-auto mb-3 text-[#F5A623]" />
          <p className="font-semibold text-gray-700 text-sm">Arraste fotos aqui</p>
          <p className="text-gray-500 text-xs mt-1">ou clique para selecionar</p>
          <p className="text-gray-400 text-[11px] mt-2">
            JPG, PNG, WEBP até 10MB · Máximo {maxPhotos} fotos
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileInput}
          />
        </div>
      )}

      {/* Grid de preview */}
      {photos.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: '12px',
          }}
        >
          {photos.map((photo, idx) => {
            const doneIdx = donePhotos.findIndex(p => p.id === photo.id)
            return (
              <div key={photo.id} className="flex flex-col gap-1">
                {/* Thumbnail container */}
                <div
                  className="relative overflow-hidden rounded-lg group"
                  style={{ width: '100%', paddingBottom: '100%' }}
                >
                  <img
                    src={photo.url}
                    alt={photo.caption || `Foto ${idx + 1}`}
                    className="absolute inset-0 w-full h-full object-cover rounded-lg"
                    style={{
                      border: `2px solid ${
                        photo.status === 'uploading' ? '#F5A623' :
                        photo.status === 'error'     ? '#EF4444' :
                        'transparent'
                      }`,
                    }}
                  />

                  {/* Progress bar (uploading) */}
                  {photo.status === 'uploading' && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200/80">
                      <div
                        className="h-full bg-[#F5A623] transition-all duration-200"
                        style={{ width: `${photo.progress ?? 0}%` }}
                      />
                    </div>
                  )}

                  {/* Hover overlay (done) */}
                  {photo.status === 'done' && (
                    <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => setLightbox({ open: true, idx: doneIdx >= 0 ? doneIdx : 0 })}
                        className="p-2 bg-white/20 rounded-full hover:bg-white/40 text-white"
                        title="Visualizar"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        className="p-2 bg-white/20 rounded-full hover:bg-red-500/80 text-white"
                        title="Remover"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}

                  {/* Status icon */}
                  <div className="absolute top-1.5 right-1.5">
                    {photo.status === 'uploading' && (
                      <div className="w-5 h-5 border-2 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
                    )}
                    {photo.status === 'done' && (
                      <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                        <Check size={10} className="text-white" />
                      </div>
                    )}
                    {photo.status === 'error' && (
                      <button
                        type="button"
                        title="Clique para tentar novamente"
                        onClick={() => photo.file && uploadFile(photo.file, photos.filter(p => p.id !== photo.id))}
                        className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600"
                      >
                        <AlertCircle size={10} className="text-white" />
                      </button>
                    )}
                  </div>

                  {/* Badge de compressão (aparece por 4s) */}
                  {photo.showBadge && photo.compressionInfo && (
                    <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-green-600/90 text-white text-[10px] font-bold rounded-full px-2 py-0.5 shadow animate-pulse">
                      <span>⚡</span>
                      <span>{photo.compressionInfo}</span>
                    </div>
                  )}

                  {/* Error: remove button */}
                  {photo.status === 'error' && (
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      className="absolute top-1.5 left-1.5 w-5 h-5 bg-red-500/80 rounded-full flex items-center justify-center hover:bg-red-600"
                    >
                      <X size={10} className="text-white" />
                    </button>
                  )}
                </div>

                {/* Caption */}
                <input
                  type="text"
                  placeholder="Legenda (opcional)"
                  value={photo.caption ?? ''}
                  onChange={e => {
                    const cap = e.target.value
                    onChange(photos.map(p => p.id === photo.id ? { ...p, caption: cap } : p))
                  }}
                  className="w-full text-xs text-gray-600 bg-transparent border-0 border-b border-gray-200 focus:outline-none focus:border-[#F5A623] pb-0.5 px-0"
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightbox.open && donePhotos.length > 0 && (
        <div
          className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-4"
          onClick={() => setLightbox(l => ({ ...l, open: false }))}
        >
          {/* Close */}
          <button
            type="button"
            onClick={() => setLightbox(l => ({ ...l, open: false }))}
            className="absolute top-4 right-4 text-white p-2 hover:bg-white/20 rounded-full"
          >
            <X size={24} />
          </button>

          {/* Seta esquerda */}
          {donePhotos.length > 1 && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, idx: (l.idx - 1 + donePhotos.length) % donePhotos.length })) }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white p-2 hover:bg-white/20 rounded-full"
            >
              <ChevronLeft size={32} />
            </button>
          )}

          {/* Imagem */}
          <img
            src={donePhotos[lightbox.idx]?.url}
            alt={donePhotos[lightbox.idx]?.caption || ''}
            onClick={e => e.stopPropagation()}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />

          {/* Seta direita */}
          {donePhotos.length > 1 && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, idx: (l.idx + 1) % donePhotos.length })) }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white p-2 hover:bg-white/20 rounded-full"
            >
              <ChevronRight size={32} />
            </button>
          )}

          {/* Caption + counter */}
          <div className="absolute bottom-4 left-0 right-0 text-center">
            {donePhotos[lightbox.idx]?.caption && (
              <p className="text-white text-sm mb-1">{donePhotos[lightbox.idx].caption}</p>
            )}
            {donePhotos.length > 1 && (
              <p className="text-white/50 text-xs">{lightbox.idx + 1} / {donePhotos.length}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
