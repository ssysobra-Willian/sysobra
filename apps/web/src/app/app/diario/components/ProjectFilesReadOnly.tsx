'use client'

import { useState, useEffect } from 'react'
import { FolderOpen, ChevronDown, ChevronUp, FileText, Download, Loader2 } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
function getToken()     { return typeof window !== 'undefined' ? localStorage.getItem('token')     ?? '' : '' }
function getCompanyId() { return typeof window !== 'undefined' ? localStorage.getItem('companyId') ?? '' : '' }
function authHeaders() {
  return { Authorization: `Bearer ${getToken()}`, 'x-company-id': getCompanyId() }
}

interface ProjectFilesReadOnlyProps {
  projectId: string
}

function formatBytes(bytes?: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function getFileIcon(type: string): { icon: string; color: string } {
  const map: Record<string, { icon: string; color: string }> = {
    PDF:   { icon: '📄', color: '#DC2626' },
    DWG:   { icon: '📐', color: '#2563EB' },
    IFC:   { icon: '🧊', color: '#7C3AED' },
    IMAGE: { icon: '🖼️', color: '#059669' },
  }
  return map[type] ?? { icon: '📎', color: '#6B7280' }
}

export default function ProjectFilesReadOnly({ projectId }: ProjectFilesReadOnlyProps) {
  const [expanded, setExpanded] = useState(false)
  const [tree,     setTree]     = useState<any>(null)
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    if (!expanded || tree !== null) return
    setLoading(true)
    fetch(`${API}/api/v1/projects/${projectId}/folders`, { headers: authHeaders() })
      .then(r => r.json())
      .then(setTree)
      .catch(() => setTree({ tree: [], rootFiles: [], stats: { totalFiles: 0 } }))
      .finally(() => setLoading(false))
  }, [expanded, projectId, tree])

  const downloadFile = async (file: any) => {
    try {
      const url = file.url?.startsWith('http') ? file.url : `${API}/${file.url}`
      const res  = await fetch(url, { headers: authHeaders() })
      const blob = await res.blob()
      const burl = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = burl; a.download = file.originalName || file.name; a.click()
      URL.revokeObjectURL(burl)
    } catch { /* silencioso */ }
  }

  const proxyPdfUrl = (file: any): string => {
    const raw = (file.url ?? '').replace(/^\/+/, '')
    if (raw.startsWith('http')) return raw
    return `/api/uploads/${raw}`
  }

  const renderFile = (file: any, depth = 0) => {
    const { icon, color } = getFileIcon(file.type)
    return (
      <div
        key={file.id}
        className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors group"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
        <span className="flex-1 text-xs text-gray-700 truncate min-w-0">{file.name}</span>
        {file.size && <span className="text-[10px] text-gray-400 flex-shrink-0">{formatBytes(file.size)}</span>}
        <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {file.type === 'PDF' && (
            <button onClick={() => window.open(proxyPdfUrl(file), '_blank')} title="Visualizar PDF"
              className="text-[10px] border border-gray-200 rounded px-1.5 py-0.5 hover:border-red-300 hover:text-red-600">
              Ver
            </button>
          )}
          {file.type === 'IFC' && (
            <button
              onClick={() => {
                const u = file.url?.startsWith('http') ? file.url : `${API}/${file.url}`
                window.open(`/app/ifc-viewer?url=${encodeURIComponent(u)}&name=${encodeURIComponent(file.name)}`, '_blank')
              }}
              title="Visualizar 3D"
              className="text-[10px] border border-purple-200 text-purple-600 rounded px-1.5 py-0.5 hover:bg-purple-50">
              3D
            </button>
          )}
          <button onClick={() => downloadFile(file)} title="Baixar"
            className="text-[10px] border border-gray-200 rounded px-1.5 py-0.5 hover:border-blue-300 hover:text-blue-600">
            <Download size={9} />
          </button>
        </div>
      </div>
    )
  }

  const renderFolder = (folder: any, depth = 0): React.ReactNode => (
    <div key={folder.id}>
      <div
        className="flex items-center gap-1.5 py-1 text-xs text-gray-600 font-medium"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        <FolderOpen size={13} style={{ color: folder.color || '#F5A623', flexShrink: 0 }} />
        <span className="truncate">{folder.name}</span>
        <span className="text-gray-400 font-normal">
          ({(folder.files?.length || 0) + (folder.children?.length || 0)})
        </span>
      </div>
      {folder.files?.map((f: any) => renderFile(f, depth + 1))}
      {folder.children?.map((c: any) => renderFolder(c, depth + 1))}
    </div>
  )

  const totalFiles = tree?.stats?.totalFiles ?? 0

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mt-4">
        {/* Cabeçalho colapsível */}
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center gap-2 px-5 py-3.5 hover:bg-gray-50 transition-colors"
        >
          <FolderOpen size={15} className="text-[#F5A623] flex-shrink-0" />
          <span className="text-sm font-semibold text-gray-700 flex-1 text-left">
            Pasta de projetos da obra
          </span>
          {tree !== null && totalFiles > 0 && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
              {totalFiles} arquivo{totalFiles > 1 ? 's' : ''}
            </span>
          )}
          {expanded
            ? <ChevronUp size={14} className="text-gray-400 flex-shrink-0" />
            : <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />}
        </button>

        {/* Conteúdo expandido */}
        {expanded && (
          <div className="border-t border-gray-100 max-h-96 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-8 text-gray-400 text-sm">
                <Loader2 size={16} className="animate-spin" />
                Carregando arquivos...
              </div>
            )}

            {!loading && tree && (
              <div className="p-2">
                {/* Arquivos na raiz */}
                {tree.rootFiles?.map((f: any) => renderFile(f, 0))}
                {/* Pastas */}
                {tree.tree?.map((folder: any) => renderFolder(folder, 0))}
                {/* Vazio */}
                {totalFiles === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                    <FileText size={28} className="mb-2 opacity-30" />
                    <p className="text-xs">Nenhum arquivo cadastrado para esta obra</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

    </>
  )
}
