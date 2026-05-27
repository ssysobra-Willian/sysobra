'use client'

import React, { useRef, useState, useCallback } from 'react'
import { Camera, Eye, Trash2, Check, X, AlertCircle } from 'lucide-react'
import { resolveUploadUrl } from '@/lib/upload'
import { PhotoCarousel } from './PhotoCarousel'

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
  const inputRef  = useRef<HTMLInputElement>(null)
  const [isDragging,    setIsDragging]    = useState(false)
  const [carouselOpen,  setCarouselOpen]  = useState(false)
  const [carouselIndex, setCarouselIndex] = useState(0)

  // ── Helpers ────────────────────────────────────────────────────────────────

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
    // Revogar blob se ainda for blob (erro antes do upload completar)
    if (photo?.url?.startsWith('blob:')) URL.revokeObjectURL(photo.url)
    onChange(photos.filter(p => p.id !== id))
  }, [photos, onChange, token])

  // ── Upload ─────────────────────────────────────────────────────────────────

  /**
   * Faz o upload de um arquivo.
   * tempId e localUrl são gerados FORA (em handleFiles) para que o snapshot
   * passado como existingPhotos use os mesmos IDs — evita dessincronização
   * quando múltiplos arquivos são selecionados de uma vez.
   */
  const uploadFile = useCallback((
    file:           File,
    existingPhotos: PhotoItem[],
    tempId:         string,
    localUrl:       string,
  ) => {
    if (!file.type.startsWith('image/')) {
      console.warn(`${file.name}: apenas imagens`)
      URL.revokeObjectURL(localUrl)
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      console.warn(`${file.name}: máximo 10MB`)
      URL.revokeObjectURL(localUrl)
      return
    }

    // Adicionar ao state com blob URL como preview imediato
    onChange([...existingPhotos, {
      id: tempId, url: localUrl, status: 'uploading', progress: 0, file,
    }])

    const formData = new FormData()
    formData.append('file', file)
    if (diaryId) formData.append('diaryId', diaryId)

    const xhr = new XMLHttpRequest()

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100)
        onChange(prev => prev.map(p => p.id === tempId ? { ...p, progress: pct } : p))
      }
    }

    xhr.onload = () => {
      if (xhr.status === 200) {
        const resp = JSON.parse(xhr.responseText) as {
          url:            string
          savedPercent?:  number
          wasCompressed?: boolean
        }

        const compressionInfo =
          resp.wasCompressed && (resp.savedPercent ?? 0) >= 5
            ? `−${resp.savedPercent}%`
            : undefined

        // ⚠ ORDEM IMPORTA: primeiro atualizar estado com URL do servidor,
        //   SÓ DEPOIS revogar o blob — evita thumbnail quebrada durante re-render
        onChange(prev => prev.map(p =>
          p.id === tempId
            ? { ...p, url: resp.url, status: 'done', progress: 100,
                file: undefined, compressionInfo, showBadge: !!compressionInfo }
            : p
        ))

        // Revogar blob local somente após React ter re-renderizado com a nova URL
        setTimeout(() => URL.revokeObjectURL(localUrl), 1000)

        // Ocultar badge de compressão após 4s
        if (compressionInfo) {
          setTimeout(() => {
            onChange(prev => prev.map(p =>
              p.id === tempId ? { ...p, showBadge: false } : p
            ))
          }, 4000)
        }
      } else {
        onChange(prev => prev.map(p =>
          p.id === tempId ? { ...p, status: 'error' } : p
        ))
      }
    }

    xhr.onerror = () => {
      onChange(prev => prev.map(p =>
        p.id === tempId ? { ...p, status: 'error' } : p
      ))
    }

    xhr.open('POST', `${API}/api/v1/uploads/diary-photo`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.send(formData)
  }, [diaryId, token, onChange])

  // ── Input / Drop handlers ─────────────────────────────────────────────────

  function handleFiles(files: FileList | File[]) {
    const arr      = Array.from(files)
    const slots    = maxPhotos - photos.length
    const toUpload = arr.slice(0, slots)
    let current    = [...photos]

    toUpload.forEach(f => {
      const tempId   = crypto.randomUUID()
      const localUrl = URL.createObjectURL(f)

      // Passa tempId e localUrl EXTERNOS para que o snapshot e o XHR usem os mesmos IDs
      uploadFile(f, current, tempId, localUrl)

      // Atualizar snapshot local para o próximo arquivo usar base correta
      current = [...current, { id: tempId, url: localUrl, status: 'uploading', progress: 0, file: f }]
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

  // ── Dados para o carrossel (somente fotos concluídas) ─────────────────────

  const donePhotos = photos.filter(p => p.status === 'done')

  function openCarousel(photo: PhotoItem) {
    const idx = donePhotos.findIndex(p => p.id === photo.id)
    setCarouselIndex(idx >= 0 ? idx : 0)
    setCarouselOpen(true)
  }

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
          {photos.map((photo, idx) => (
            <div key={photo.id} className="flex flex-col gap-1">
              {/* Thumbnail */}
              <div
                className="relative overflow-hidden rounded-lg group bg-gray-100"
                style={{ width: '100%', paddingBottom: '100%' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveUploadUrl(photo.url)}
                  alt={photo.caption || `Foto ${idx + 1}`}
                  className="absolute inset-0 w-full h-full object-cover rounded-lg"
                  style={{
                    border: `2px solid ${
                      photo.status === 'uploading' ? '#F5A623' :
                      photo.status === 'error'     ? '#EF4444' :
                      'transparent'
                    }`,
                  }}
                  onError={(e) => {
                    // Tenta recarregar uma vez com cache-busting após 500ms
                    const img = e.currentTarget
                    if (!img.dataset.retried) {
                      img.dataset.retried = '1'
                      const base = photo.url.split('?')[0]
                      setTimeout(() => {
                        img.src = resolveUploadUrl(base) + '?t=' + Date.now()
                      }, 500)
                    }
                  }}
                />

                {/* Barra de progresso */}
                {photo.status === 'uploading' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200/80">
                    <div
                      className="h-full bg-[#F5A623] transition-all duration-200"
                      style={{ width: `${photo.progress ?? 0}%` }}
                    />
                  </div>
                )}

                {/* Overlay hover — apenas quando done */}
                {photo.status === 'done' && (
                  <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => openCarousel(photo)}
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

                {/* Ícone de status */}
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
                      onClick={() => {
                        if (!photo.file) return
                        const newTempId   = crypto.randomUUID()
                        const newLocalUrl = URL.createObjectURL(photo.file)
                        uploadFile(photo.file, photos.filter(p => p.id !== photo.id), newTempId, newLocalUrl)
                      }}
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

                {/* Botão remover no erro */}
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

              {/* Campo de legenda */}
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
          ))}
        </div>
      )}

      {/* Carrossel de visualização */}
      <PhotoCarousel
        photos={donePhotos.map(p => ({ url: p.url, caption: p.caption }))}
        initialIndex={carouselIndex}
        isOpen={carouselOpen}
        onClose={() => setCarouselOpen(false)}
      />
    </div>
  )
}
