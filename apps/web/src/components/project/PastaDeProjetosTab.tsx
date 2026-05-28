'use client'

import React, { useRef, useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import {
  Upload, FileText, Download, Eye, Trash2, Box, Loader2,
  File, HardDrive, AlertCircle, Folder, FolderOpen, FolderPlus,
  MoreVertical, Pencil, ChevronRight, ChevronDown, X, Plus,
  ArrowRight, Home, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

function getToken()     { return typeof window !== 'undefined' ? (localStorage.getItem('token')     ?? '') : '' }
function getCompanyId() { return typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : '' }
async function apiFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${getToken()}`, 'x-company-id': getCompanyId(), ...(opts.headers ?? {}) },
  })
}

// Dynamic import do visualizador IFC (evita SSR / WebGL no servidor)
const IfcViewerCanvas = dynamic(
  () => import('./IfcViewerCanvas').then(m => m.IfcViewerCanvas),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-[#F5A623]" size={28} /></div> },
)

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProjectFolder {
  id:        string
  name:      string
  parentId:  string | null
  path:      string
  color:     string | null
  order:     number
  children?: ProjectFolder[]
}

interface ProjectFile {
  id:           string
  name:         string
  originalName: string
  type:         string
  size:         number
  url:          string
  category:     string
  folderId:     string | null
  description:  string | null
  version:      string | null
  uploadedBy:   string | null
  createdAt:    string
}

interface Props {
  projectId:   string
  readOnly?:   boolean   // para uso no Diário de Obra
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
function formatDateBR(iso: string) { return new Date(iso).toLocaleDateString('pt-BR') }

const FOLDER_COLORS = ['#F5A623','#4A90E2','#7B68EE','#E74C3C','#2ECC71','#1ABC9C','#E67E22','#95A5A6']
const CAT_ICONS: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  pdf:   { icon: <FileText size={15} />,  label: 'PDF',    color: 'text-red-500'    },
  dwg:   { icon: <File size={15} />,      label: 'DWG',    color: 'text-blue-500'   },
  ifc:   { icon: <Box size={15} />,       label: 'IFC 3D', color: 'text-purple-500' },
  other: { icon: <HardDrive size={15} />, label: 'Arquivo', color: 'text-gray-500'  },
}

// ─── Folder Tree Node ─────────────────────────────────────────────────────────

function FolderNode({
  folder, depth, selected, expandedIds, readOnly,
  onSelect, onToggle, onRename, onDelete, onNewSub,
}: {
  folder:      ProjectFolder
  depth:       number
  selected:    string | null
  expandedIds: Set<string>
  readOnly?:   boolean
  onSelect:    (id: string | null) => void
  onToggle:    (id: string) => void
  onRename:    (folder: ProjectFolder) => void
  onDelete:    (folder: ProjectFolder) => void
  onNewSub:    (parentId: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isExpanded = expandedIds.has(folder.id)
  const isSelected = selected === folder.id
  const hasChildren = (folder.children?.length ?? 0) > 0

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 py-1.5 px-2 rounded-lg cursor-pointer group transition-colors select-none',
          isSelected ? 'bg-[#F5A623]/15 text-[#F5A623]' : 'hover:bg-gray-100 text-gray-700',
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onSelect(isSelected ? null : folder.id)}
      >
        {/* Expand toggle */}
        <button
          className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-gray-400"
          onClick={e => { e.stopPropagation(); if (hasChildren) onToggle(folder.id) }}
        >
          {hasChildren
            ? isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
            : <span className="w-3" />}
        </button>

        {/* Folder icon */}
        {folder.color
          ? <span style={{ color: folder.color }}>
              {isExpanded ? <FolderOpen size={15} /> : <Folder size={15} />}
            </span>
          : isExpanded ? <FolderOpen size={15} className="text-[#F5A623]" /> : <Folder size={15} className="text-[#F5A623]" />
        }

        <span className="flex-1 text-xs font-medium truncate">{folder.name}</span>

        {/* Context menu */}
        {!readOnly && (
          <div className="relative opacity-0 group-hover:opacity-100">
            <button
              className="p-0.5 rounded hover:bg-gray-200 text-gray-500"
              onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
            >
              <MoreVertical size={13} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-6 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[160px]">
                  <button
                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => { setMenuOpen(false); onNewSub(folder.id) }}
                  >
                    <FolderPlus size={13} className="text-[#F5A623]" />
                    Nova subpasta
                  </button>
                  <button
                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => { setMenuOpen(false); onRename(folder) }}
                  >
                    <Pencil size={13} className="text-blue-500" />
                    Renomear
                  </button>
                  <button
                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-50 flex items-center gap-2 text-red-500"
                    onClick={() => { setMenuOpen(false); onDelete(folder) }}
                  >
                    <Trash2 size={13} />
                    Excluir pasta
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {folder.children!.map(child => (
            <FolderNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              selected={selected}
              expandedIds={expandedIds}
              readOnly={readOnly}
              onSelect={onSelect}
              onToggle={onToggle}
              onRename={onRename}
              onDelete={onDelete}
              onNewSub={onNewSub}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── File Row ─────────────────────────────────────────────────────────────────

function FileRow({
  file, projectId, readOnly, folders, onDelete, onViewPdf, onViewIfc, onMove,
}: {
  file:       ProjectFile
  projectId:  string
  readOnly?:  boolean
  folders:    ProjectFolder[]
  onDelete:   (id: string) => void
  onViewPdf?: (url: string, name: string) => void
  onViewIfc?: (url: string, name: string) => void
  onMove?:    (fileId: string, folderId: string | null) => void
}) {
  const [deleting,  setDeleting]  = useState(false)
  const [moveOpen,  setMoveOpen]  = useState(false)
  const cat = CAT_ICONS[file.category] ?? CAT_ICONS.other
  // Usar proxy Next.js para PDF (evita CORS)
  const proxyUrl  = `/api/uploads/${file.url}`
  const directUrl = `${API}/${file.url}`

  const handleDelete = async () => {
    if (!confirm(`Remover "${file.name}"?`)) return
    setDeleting(true)
    try {
      const res = await apiFetch(`/api/v1/projects/${projectId}/files/${file.id}`, { method: 'DELETE' })
      if (res.ok) onDelete(file.id)
    } catch { /* silencioso */ }
    finally { setDeleting(false) }
  }

  const handleDownload = async () => {
    try {
      const res = await apiFetch(`/${file.url}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = file.originalName; a.click()
      URL.revokeObjectURL(url)
    } catch { window.open(directUrl, '_blank') }
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition-colors group">
      <div className={cn('flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-gray-50', cat.color)}>
        {cat.icon}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
        <p className="text-xs text-gray-400">
          {cat.label} · {formatBytes(file.size)}
          {file.version && ` · Rev. ${file.version}`}
          {' · '}{formatDateBR(file.createdAt)}
        </p>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Visualizar PDF */}
        {file.category === 'pdf' && onViewPdf && (
          <button
            onClick={() => onViewPdf(proxyUrl, file.name)}
            className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600"
            title="Visualizar PDF"
          >
            <Eye size={14} />
          </button>
        )}

        {/* Visualizar IFC 3D */}
        {file.category === 'ifc' && onViewIfc && (
          <button
            onClick={() => onViewIfc(directUrl, file.name)}
            className="p-1.5 rounded-lg hover:bg-purple-50 text-gray-400 hover:text-purple-600"
            title="Visualizar 3D"
          >
            <Box size={14} />
          </button>
        )}

        {/* Download */}
        <button
          onClick={handleDownload}
          className="p-1.5 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600"
          title="Baixar"
        >
          <Download size={14} />
        </button>

        {/* Mover */}
        {!readOnly && onMove && (
          <div className="relative">
            <button
              onClick={() => setMoveOpen(v => !v)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              title="Mover para pasta"
            >
              <ArrowRight size={14} />
            </button>
            {moveOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMoveOpen(false)} />
                <div className="absolute right-0 top-8 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[180px] max-h-52 overflow-y-auto">
                  <button
                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-50 flex items-center gap-2 font-medium"
                    onClick={() => { setMoveOpen(false); onMove(file.id, null) }}
                  >
                    <Home size={12} className="text-gray-400" />
                    Raiz (sem pasta)
                  </button>
                  {folders.map(f => (
                    <button
                      key={f.id}
                      className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-50 flex items-center gap-2"
                      onClick={() => { setMoveOpen(false); onMove(file.id, f.id) }}
                    >
                      <Folder size={12} className="text-[#F5A623]" />
                      {f.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Excluir */}
        {!readOnly && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
            title="Excluir"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── PDF Viewer Modal ─────────────────────────────────────────────────────────

function PdfViewerModal({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
        <p className="text-white text-sm font-medium truncate">{name}</p>
        <div className="flex items-center gap-3">
          <a href={url} download className="text-gray-400 hover:text-white text-xs flex items-center gap-1">
            <Download size={13} /> Baixar
          </a>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
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
          <span className="text-purple-400 mr-2">🧊</span>{name}
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

// ─── New/Rename Folder Modal ──────────────────────────────────────────────────

function FolderModal({
  title, initial, onConfirm, onClose,
}: {
  title:     string
  initial?:  { name: string; color: string | null }
  onConfirm: (name: string, color: string | null) => Promise<void>
  onClose:   () => void
}) {
  const [name,    setName]    = useState(initial?.name ?? '')
  const [color,   setColor]   = useState<string | null>(initial?.color ?? null)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Informe o nome da pasta'); return }
    setSaving(true)
    setError('')
    try {
      await onConfirm(name.trim(), color)
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#F5A623]"
              placeholder="Nome da pasta"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Cor</label>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className={cn('w-6 h-6 rounded-full border-2 flex items-center justify-center', !color ? 'border-gray-400' : 'border-transparent bg-gray-200')}
                onClick={() => setColor(null)}
                title="Sem cor"
              >
                {!color && <X size={10} className="text-gray-500" />}
              </button>
              {FOLDER_COLORS.map(c => (
                <button
                  key={c}
                  className={cn('w-6 h-6 rounded-full border-2', color === c ? 'border-gray-700 scale-110' : 'border-transparent')}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2 text-sm bg-[#F5A623] hover:bg-[#e09610] text-white rounded-xl font-medium disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Salvando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PastaDeProjetosTab({ projectId, readOnly }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  const [folderTree,    setFolderTree]    = useState<ProjectFolder[]>([])
  const [allFolders,    setAllFolders]    = useState<ProjectFolder[]>([])
  const [files,         setFiles]         = useState<ProjectFile[]>([])
  const [loading,       setLoading]       = useState(true)
  const [filesLoading,  setFilesLoading]  = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [expandedIds,   setExpandedIds]   = useState<Set<string>>(new Set())

  const [pdfViewer,     setPdfViewer]     = useState<{ url: string; name: string } | null>(null)
  const [ifcViewer,     setIfcViewer]     = useState<{ url: string; name: string } | null>(null)
  const [uploading,     setUploading]     = useState(false)
  const [uploadError,   setUploadError]   = useState('')

  const [folderModal,   setFolderModal]   = useState<
    { mode: 'create'; parentId: string | null } |
    { mode: 'rename'; folder: ProjectFolder } | null
  >(null)

  // Breadcrumb: calcular caminho até pasta selecionada
  const buildBreadcrumb = useCallback((folderId: string | null): ProjectFolder[] => {
    if (!folderId) return []
    const map = new Map(allFolders.map(f => [f.id, f]))
    const crumbs: ProjectFolder[] = []
    let cur = map.get(folderId)
    while (cur) {
      crumbs.unshift(cur)
      cur = cur.parentId ? map.get(cur.parentId) : undefined
    }
    return crumbs
  }, [allFolders])

  // ── Carregar árvore de pastas ─────────────────────────────────────────────
  const loadFolders = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/v1/projects/${projectId}/folders`)
      if (!res.ok) return
      const data = await res.json()
      setFolderTree(data.tree ?? [])
      setAllFolders(data.folders ?? [])
    } catch { /* silencioso */ }
  }, [projectId])

  // ── Carregar arquivos da pasta selecionada ────────────────────────────────
  const loadFiles = useCallback(async (folderId: string | null) => {
    setFilesLoading(true)
    try {
      const q = folderId === null ? 'folderId=root' : `folderId=${folderId}`
      const res = await apiFetch(`/api/v1/projects/${projectId}/files?${q}`)
      if (!res.ok) return
      const data = await res.json()
      setFiles(data.files ?? [])
    } catch { /* silencioso */ }
    finally { setFilesLoading(false) }
  }, [projectId])

  // ── Carregar todos os arquivos (sem pasta selecionada = todos) ─────────────
  const loadAllFiles = useCallback(async () => {
    setFilesLoading(true)
    try {
      const res = await apiFetch(`/api/v1/projects/${projectId}/files`)
      if (!res.ok) return
      const data = await res.json()
      setFiles(data.all ?? [])
    } catch { /* silencioso */ }
    finally { setFilesLoading(false) }
  }, [projectId])

  // Init
  useEffect(() => {
    setLoading(true)
    Promise.all([loadFolders(), loadAllFiles()]).finally(() => setLoading(false))
  }, [loadFolders, loadAllFiles])

  // Quando muda pasta selecionada
  useEffect(() => {
    if (selectedFolderId === null) {
      loadAllFiles()
    } else {
      loadFiles(selectedFolderId)
    }
  }, [selectedFolderId, loadFiles, loadAllFiles])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleToggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSelect = (id: string | null) => {
    setSelectedFolderId(id)
  }

  const handleCreateFolder = async (name: string, color: string | null) => {
    const parentId = folderModal?.mode === 'create' ? folderModal.parentId : null
    const res = await apiFetch(`/api/v1/projects/${projectId}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color, parentId }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error ?? 'Erro ao criar pasta')
    }
    if (parentId) setExpandedIds(prev => new Set([...prev, parentId]))
    await loadFolders()
  }

  const handleRenameFolder = async (name: string, color: string | null) => {
    if (folderModal?.mode !== 'rename') return
    const { folder } = folderModal
    const res = await apiFetch(`/api/v1/projects/${projectId}/folders/${folder.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error ?? 'Erro ao renomear pasta')
    }
    await loadFolders()
  }

  const handleDeleteFolder = async (folder: ProjectFolder) => {
    if (!confirm(`Excluir a pasta "${folder.name}"? (Só é possível se estiver vazia)`)) return
    const res = await apiFetch(`/api/v1/projects/${projectId}/folders/${folder.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? 'Erro ao excluir pasta')
      return
    }
    if (selectedFolderId === folder.id) setSelectedFolderId(null)
    await loadFolders()
  }

  const handleDeleteFile = useCallback((fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }, [])

  const handleMoveFile = async (fileId: string, folderId: string | null) => {
    const res = await apiFetch(`/api/v1/projects/${projectId}/files/${fileId}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
    })
    if (res.ok) {
      // Recarregar lista
      if (selectedFolderId === null) loadAllFiles()
      else loadFiles(selectedFolderId)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('name', file.name.replace(/\.[^.]+$/, ''))
      if (selectedFolderId) fd.append('folderId', selectedFolderId)
      const res = await apiFetch(`/api/v1/projects/${projectId}/files`, { method: 'POST', body: fd })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `Erro ${res.status}`)
      }
      if (selectedFolderId === null) await loadAllFiles()
      else await loadFiles(selectedFolderId)
    } catch (err: any) {
      setUploadError(err.message ?? 'Erro ao enviar')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const breadcrumb = buildBreadcrumb(selectedFolderId)

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
      {pdfViewer && <PdfViewerModal url={pdfViewer.url} name={pdfViewer.name} onClose={() => setPdfViewer(null)} />}
      {ifcViewer && <IfcViewerModal url={ifcViewer.url} name={ifcViewer.name} onClose={() => setIfcViewer(null)} />}

      {folderModal && (
        <FolderModal
          title={folderModal.mode === 'create' ? 'Nova pasta' : 'Renomear pasta'}
          initial={folderModal.mode === 'rename' ? { name: folderModal.folder.name, color: folderModal.folder.color } : undefined}
          onConfirm={folderModal.mode === 'create' ? handleCreateFolder : handleRenameFolder}
          onClose={() => setFolderModal(null)}
        />
      )}

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.dwg,.dxf,.ifc,.doc,.docx,.xlsx,.xls,.jpg,.jpeg,.png,.zip,.rar"
        className="hidden"
        onChange={handleUpload}
      />

      <div className="flex gap-4 h-full min-h-[480px]">
        {/* ── Coluna Esquerda: Árvore de Pastas ──────────────────────────── */}
        <div className="w-56 flex-shrink-0 flex flex-col gap-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pastas</span>
            {!readOnly && (
              <button
                onClick={() => setFolderModal({ mode: 'create', parentId: null })}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#F5A623]"
                title="Nova pasta raiz"
              >
                <FolderPlus size={14} />
              </button>
            )}
          </div>

          {/* Raiz */}
          <button
            className={cn(
              'flex items-center gap-2 w-full py-1.5 px-2 rounded-lg text-xs font-medium transition-colors',
              selectedFolderId === null ? 'bg-gray-100 text-gray-800' : 'hover:bg-gray-50 text-gray-600',
            )}
            onClick={() => handleSelect(null)}
          >
            <Home size={14} className="text-gray-400 flex-shrink-0" />
            <span className="truncate">Todos os arquivos</span>
          </button>

          {/* Árvore */}
          {folderTree.length === 0 ? (
            !readOnly && (
              <div className="py-4 text-center">
                <p className="text-xs text-gray-400">Nenhuma pasta criada</p>
                <button
                  onClick={() => setFolderModal({ mode: 'create', parentId: null })}
                  className="mt-2 text-xs text-[#F5A623] hover:underline"
                >
                  + Criar primeira pasta
                </button>
              </div>
            )
          ) : (
            <div className="space-y-0.5">
              {folderTree.map(folder => (
                <FolderNode
                  key={folder.id}
                  folder={folder}
                  depth={0}
                  selected={selectedFolderId}
                  expandedIds={expandedIds}
                  readOnly={readOnly}
                  onSelect={handleSelect}
                  onToggle={handleToggle}
                  onRename={f => setFolderModal({ mode: 'rename', folder: f })}
                  onDelete={handleDeleteFolder}
                  onNewSub={parentId => setFolderModal({ mode: 'create', parentId })}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Coluna Direita: Conteúdo da Pasta ────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-xs text-gray-500 flex-wrap">
              <button
                className={cn('hover:text-gray-800 flex items-center gap-1', !selectedFolderId && 'text-gray-800 font-medium')}
                onClick={() => handleSelect(null)}
              >
                <Home size={12} />
                Raiz
              </button>
              {breadcrumb.map((f, i) => (
                <React.Fragment key={f.id}>
                  <ChevronRight size={11} className="text-gray-300" />
                  <button
                    className={cn('hover:text-gray-800', i === breadcrumb.length - 1 && 'text-gray-800 font-medium')}
                    onClick={() => handleSelect(f.id)}
                  >
                    {f.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {/* Ações */}
            {!readOnly && (
              <div className="flex items-center gap-2">
                {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 bg-[#F5A623] hover:bg-[#e09610] text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-60"
                >
                  {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  {uploading ? 'Enviando…' : 'Enviar arquivo'}
                </button>
                {selectedFolderId && (
                  <button
                    onClick={() => setFolderModal({ mode: 'create', parentId: selectedFolderId })}
                    className="flex items-center gap-1.5 border border-gray-200 hover:border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded-lg"
                    title="Nova subpasta"
                  >
                    <FolderPlus size={12} />
                    Subpasta
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Subpastas da pasta selecionada */}
          {selectedFolderId && (() => {
            const subs = allFolders.filter(f => f.parentId === selectedFolderId)
            if (subs.length === 0) return null
            return (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">Subpastas</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {subs.map(sub => (
                    <button
                      key={sub.id}
                      className="flex items-center gap-2 p-2.5 bg-white border border-gray-100 rounded-xl hover:border-[#F5A623]/40 hover:bg-orange-50/30 transition-colors text-left"
                      onClick={() => { handleSelect(sub.id); setExpandedIds(prev => new Set([...prev, sub.id])) }}
                    >
                      <Folder size={16} style={{ color: sub.color ?? '#F5A623' }} className="flex-shrink-0" />
                      <span className="text-xs font-medium text-gray-700 truncate">{sub.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Arquivos */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium text-gray-500">Arquivos</p>
              {!filesLoading && (
                <span className="text-xs text-gray-400">
                  {files.length === 0 ? 'Nenhum arquivo' : `${files.length} arquivo${files.length > 1 ? 's' : ''}`}
                </span>
              )}
            </div>

            {filesLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={20} className="animate-spin text-[#F5A623]" />
              </div>
            ) : files.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-3 text-center bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                <HardDrive size={24} className="text-gray-300" />
                <div>
                  <p className="text-sm text-gray-500">Nenhum arquivo aqui</p>
                  {!readOnly && (
                    <p className="text-xs text-gray-400 mt-1">
                      Clique em "Enviar arquivo" para adicionar
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {files.map(file => (
                  <FileRow
                    key={file.id}
                    file={file}
                    projectId={projectId}
                    readOnly={readOnly}
                    folders={allFolders}
                    onDelete={handleDeleteFile}
                    onViewPdf={(url, name) => setPdfViewer({ url, name })}
                    onViewIfc={(url, name) => setIfcViewer({ url, name })}
                    onMove={handleMoveFile}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Aviso IFC */}
      {files.some(f => f.category === 'ifc') && (
        <div className="flex items-start gap-2 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 mt-3">
          <AlertCircle size={13} className="text-purple-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-purple-700">
            O visualizador 3D IFC requer WebGL. Em dispositivos sem GPU dedicada, o carregamento pode ser lento.
          </p>
        </div>
      )}
    </>
  )
}
