'use client'

import { useRef, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import {
  Upload, FileText, Download, Eye, Trash2, Box, Loader2,
  File, HardDrive, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

function getToken()     { return typeof window !== 'undefined' ? (localStorage.getItem('token')     ?? '') : '' }
function getCompanyId() { return typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : '' }

// Dynamic import do visualizador IFC (evita SSR / WebGL no servidor)
const IfcViewerCanvas = dynamic(
  () => import('./IfcViewerCanvas').then(m => m.IfcViewerCanvas),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-[#F5A623]" size={28} /></div> },
)

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProjectFile {
  id:           string
  name:         string
  originalName: string
  type:         string
  size:         number
  url:          string
  category:     string
  description:  string | null
  version:      string | null
  uploadedBy:   string | null
  createdAt:    string
}

interface FilesGrouped {
  pdfs:   ProjectFile[]
  dwgs:   ProjectFile[]
  ifcs:   ProjectFile[]
  others: ProjectFile[]
}

interface Props {
  projectId: string
  files:     FilesGrouped
  loading:   boolean
  onReload:  () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateBR(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

const CATEGORY_ICONS: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  pdf:   { icon: <FileText size={16} />,  label: 'PDFs',    color: 'text-red-500'  },
  dwg:   { icon: <File size={16} />,      label: 'DWGs',    color: 'text-blue-500' },
  ifc:   { icon: <Box size={16} />,       label: 'IFCs 3D', color: 'text-purple-500' },
  other: { icon: <HardDrive size={16} />, label: 'Outros',  color: 'text-gray-500' },
}

// ─── Upload Section ───────────────────────────────────────────────────────────

function UploadButton({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const fileRef    = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState('')

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('name', file.name.replace(/\.[^.]+$/, ''))
      const res = await fetch(`${API}/api/v1/projects/${projectId}/files`, {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${getToken()}`,
          'x-company-id': getCompanyId(),
        },
        body: fd,
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `Erro ${res.status}`)
      }
      onDone()
    } catch (err: any) {
      setError(err.message ?? 'Erro ao enviar arquivo')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.dwg,.dxf,.ifc,.doc,.docx,.xlsx,.xls,.jpg,.jpeg,.png"
        className="hidden"
        onChange={handleChange}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 bg-[#F5A623] hover:bg-[#e09610] text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-60"
      >
        {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
        {uploading ? 'Enviando…' : 'Enviar arquivo'}
      </button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

// ─── File Card ────────────────────────────────────────────────────────────────

function FileCard({
  file, projectId, onDelete,
  onViewPdf, onViewIfc,
}: {
  file:       ProjectFile
  projectId:  string
  onDelete:   (id: string) => void
  onViewPdf?: (url: string, name: string) => void
  onViewIfc?: (url: string, name: string) => void
}) {
  const [deleting, setDeleting] = useState(false)
  const cat = CATEGORY_ICONS[file.category] ?? CATEGORY_ICONS.other
  const fileUrl = `${API}/${file.url}`

  const handleDelete = async () => {
    if (!confirm(`Remover "${file.name}"?`)) return
    setDeleting(true)
    try {
      const res = await fetch(`${API}/api/v1/projects/${projectId}/files/${file.id}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${getToken()}`, 'x-company-id': getCompanyId() },
      })
      if (res.ok) onDelete(file.id)
    } catch { /* silencioso */ }
    finally { setDeleting(false) }
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-lg hover:border-gray-200 transition-colors group">
      {/* Ícone */}
      <div className={cn('flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-gray-50', cat.color)}>
        {cat.icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
        <p className="text-xs text-gray-400">
          {formatBytes(file.size)}
          {file.version && ` · ${file.version}`}
          {' · '}
          {formatDateBR(file.createdAt)}
        </p>
        {file.description && (
          <p className="text-xs text-gray-500 truncate">{file.description}</p>
        )}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {file.category === 'pdf' && onViewPdf && (
          <button
            onClick={() => onViewPdf(fileUrl, file.name)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-blue-600"
            title="Visualizar PDF"
          >
            <Eye size={14} />
          </button>
        )}
        {file.category === 'ifc' && onViewIfc && (
          <button
            onClick={() => onViewIfc(fileUrl, file.name)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-purple-600"
            title="Visualizar 3D"
          >
            <Box size={14} />
          </button>
        )}
        <a
          href={fileUrl}
          download={file.originalName}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-green-600"
          title="Baixar"
        >
          <Download size={14} />
        </a>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
          title="Remover"
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  )
}

// ─── PDF Viewer Modal ─────────────────────────────────────────────────────────

function PdfViewerModal({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900" onClick={e => e.stopPropagation()}>
        <p className="text-white text-sm font-medium truncate">{name}</p>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
      </div>
      <div className="flex-1 overflow-hidden" onClick={e => e.stopPropagation()}>
        <iframe src={url} className="w-full h-full border-none" title={name} />
      </div>
    </div>
  )
}

// ─── IFC Viewer Modal ─────────────────────────────────────────────────────────

function IfcViewerModal({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
        <p className="text-white text-sm font-medium">
          <span className="text-purple-400 mr-2">🧊 3D IFC</span>
          {name}
        </p>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
      </div>
      <div className="flex-1">
        <IfcViewerCanvas fileUrl={url} className="w-full h-full" />
      </div>
      <p className="text-center text-xs text-gray-500 py-2">
        🖱️ Rotacionar: clique-arraste · Zoom: scroll · Pan: shift + arrastar
      </p>
    </div>
  )
}

// ─── Category Section ─────────────────────────────────────────────────────────

function CategorySection({
  category, files, projectId, onDelete, onViewPdf, onViewIfc,
}: {
  category:  string
  files:     ProjectFile[]
  projectId: string
  onDelete:  (id: string) => void
  onViewPdf?: (url: string, name: string) => void
  onViewIfc?: (url: string, name: string) => void
}) {
  if (files.length === 0) return null
  const meta = CATEGORY_ICONS[category] ?? CATEGORY_ICONS.other

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn('flex-shrink-0', meta.color)}>{meta.icon}</span>
        <h4 className="text-sm font-semibold text-gray-700">{meta.label}</h4>
        <span className="text-xs text-gray-400">({files.length})</span>
      </div>
      <div className="space-y-1.5">
        {files.map(f => (
          <FileCard
            key={f.id}
            file={f}
            projectId={projectId}
            onDelete={onDelete}
            onViewPdf={onViewPdf}
            onViewIfc={onViewIfc}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PastaDeProjetosTab({ projectId, files, loading, onReload }: Props) {
  const [pdfViewer, setPdfViewer] = useState<{ url: string; name: string } | null>(null)
  const [ifcViewer, setIfcViewer] = useState<{ url: string; name: string } | null>(null)

  const handleDelete = useCallback((fileId: string) => {
    onReload()
  }, [onReload])

  const totalFiles = files.pdfs.length + files.dwgs.length + files.ifcs.length + files.others.length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-[#F5A623]" />
      </div>
    )
  }

  return (
    <>
      {/* Modais */}
      {pdfViewer && (
        <PdfViewerModal url={pdfViewer.url} name={pdfViewer.name} onClose={() => setPdfViewer(null)} />
      )}
      {ifcViewer && (
        <IfcViewerModal url={ifcViewer.url} name={ifcViewer.name} onClose={() => setIfcViewer(null)} />
      )}

      <div className="space-y-5">
        {/* Header da aba */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Pasta de Projetos</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {totalFiles === 0 ? 'Nenhum arquivo' : `${totalFiles} arquivo${totalFiles > 1 ? 's' : ''} · PDFs visualizáveis, DWGs para download, IFCs em 3D`}
            </p>
          </div>
          <UploadButton projectId={projectId} onDone={onReload} />
        </div>

        {/* Conteúdo */}
        {totalFiles === 0 ? (
          <div className="py-12 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
              <HardDrive size={22} className="text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Nenhum arquivo enviado</p>
              <p className="text-xs text-gray-400 mt-1">
                Envie PDFs de projeto, plantas DWG ou modelos IFC 3D
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <CategorySection
              category="pdf"
              files={files.pdfs}
              projectId={projectId}
              onDelete={handleDelete}
              onViewPdf={(url, name) => setPdfViewer({ url, name })}
            />
            <CategorySection
              category="dwg"
              files={files.dwgs}
              projectId={projectId}
              onDelete={handleDelete}
            />
            <CategorySection
              category="ifc"
              files={files.ifcs}
              projectId={projectId}
              onDelete={handleDelete}
              onViewIfc={(url, name) => setIfcViewer({ url, name })}
            />
            <CategorySection
              category="other"
              files={files.others}
              projectId={projectId}
              onDelete={handleDelete}
            />
          </div>
        )}

        {/* Aviso IFC */}
        {files.ifcs.length > 0 && (
          <div className="flex items-start gap-2 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2.5">
            <AlertCircle size={14} className="text-purple-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-purple-700">
              O visualizador 3D IFC requer WebGL. Em dispositivos antigos ou sem GPU, o carregamento pode ser lento.
            </p>
          </div>
        )}
      </div>
    </>
  )
}
