'use client'

import { useRef, useState } from 'react'
import { Camera, Trash2, Building2 } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export interface ProjectCoverUploadProps {
  currentUrl?: string | null
  onChange:    (url: string) => void
  onRemove?:   () => void
  token:       string
}

export function ProjectCoverUpload({
  currentUrl,
  onChange,
  onRemove,
  token,
}: ProjectCoverUploadProps) {
  const inputRef            = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError]   = useState('')

  async function upload(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Apenas imagens JPG, PNG e WEBP são aceitas.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Máximo 5MB para a foto da obra.')
      return
    }

    setError('')
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`${API}/api/v1/uploads/project-cover`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
        body:    formData,
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Erro ao fazer upload')
      }

      const { url } = await res.json()
      onChange(url)
    } catch (e: any) {
      setError(e.message || 'Erro ao fazer upload')
    } finally {
      setUploading(false)
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) upload(file)
    e.target.value = ''
  }

  // ── Sem foto ───────────────────────────────────────────────────────────────
  if (!currentUrl) {
    return (
      <div className="space-y-1">
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          className={`
            relative w-full rounded-xl overflow-hidden cursor-pointer transition-all
            border-2 border-dashed border-[#F5A623]/60 hover:border-[#F5A623] hover:bg-orange-50/40
            flex flex-col items-center justify-center gap-2 py-10
            ${uploading ? 'opacity-60 pointer-events-none' : ''}
          `}
          style={{ minHeight: 200 }}
        >
          {uploading ? (
            <div className="w-8 h-8 border-3 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Building2 size={48} className="text-[#F5A623]" />
              <p className="font-semibold text-gray-700 text-sm">Adicionar foto da obra</p>
              <p className="text-gray-400 text-xs text-center px-4">
                Renderização, fachada ou foto atual · JPG, PNG até 5MB
              </p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    )
  }

  // ── Com foto ───────────────────────────────────────────────────────────────
  const imgSrc = currentUrl.startsWith('/uploads/')
    ? `${API}${currentUrl}`
    : currentUrl

  return (
    <div className="space-y-1">
      <div
        className="relative w-full rounded-xl overflow-hidden group"
        style={{ height: 200 }}
      >
        <img
          src={imgSrc}
          alt="Foto da obra"
          className="w-full h-full object-cover"
        />

        {/* Badge */}
        <div className="absolute bottom-2 left-2 bg-black/50 text-white text-[11px] font-medium px-2 py-1 rounded-lg">
          Foto da obra
        </div>

        {/* Overlay hover */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/40 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <Camera size={14} />
            {uploading ? 'Enviando...' : 'Trocar foto'}
          </button>

          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="flex items-center gap-1.5 bg-red-500/70 hover:bg-red-600/90 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
            >
              <Trash2 size={14} />
              Remover
            </button>
          )}
        </div>

        {/* Loading overlay */}
        {uploading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl">
            <div className="w-8 h-8 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileInput}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
