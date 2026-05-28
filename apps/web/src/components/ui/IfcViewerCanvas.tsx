'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'

interface IfcViewerCanvasProps {
  fileUrl:  string
  fileName: string
}

/**
 * Visualizador 3D IFC — default export para uso na página dedicada /app/ifc-viewer.
 * Padrão: fetch URL → Blob → File → loadIfc (evita CORS em streams parciais).
 * Barra de progresso de download + estado de erro.
 */
export default function IfcViewerCanvas({ fileUrl, fileName }: IfcViewerCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef    = useRef<any>(null)

  const [progress,   setProgress]   = useState(0)          // 0‒100
  const [phase,      setPhase]      = useState<'downloading' | 'parsing' | 'done' | 'error'>('downloading')
  const [errorMsg,   setErrorMsg]   = useState('')

  useEffect(() => {
    if (!containerRef.current || !fileUrl) return
    let viewer: any = null
    let cancelled   = false

    const load = async () => {
      try {
        // ── 1. Download com rastreamento de progresso ──────────────────────
        setPhase('downloading')
        setProgress(0)

        const res = await fetch(fileUrl, {
          headers: {
            Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
            'x-company-id': typeof window !== 'undefined' ? localStorage.getItem('companyId') ?? '' : '',
          },
        })

        if (!res.ok) throw new Error(`Falha ao baixar arquivo (${res.status})`)

        const contentLength = Number(res.headers.get('Content-Length') ?? 0)
        const reader  = res.body!.getReader()
        const chunks: Uint8Array[] = []
        let received = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done || cancelled) break
          chunks.push(value)
          received += value.length
          if (contentLength > 0) {
            setProgress(Math.min(99, Math.round((received / contentLength) * 90)))
          }
        }

        if (cancelled) return

        // ── 2. Montar Blob/File ──────────────────────────────────────────────
        const blob = new Blob(chunks as BlobPart[], { type: 'application/octet-stream' })
        const file = new File([blob], fileName || 'model.ifc', { type: 'application/octet-stream' })

        // ── 3. Inicializar viewer ────────────────────────────────────────────
        setPhase('parsing')
        setProgress(95)

        // @ts-ignore — web-ifc-viewer não tem tipos completos no TS
        const { IfcViewerAPI } = await import('web-ifc-viewer')
        // @ts-ignore
        const THREE = await import('three')

        if (cancelled || !containerRef.current) return

        const container = containerRef.current!
        viewer = new IfcViewerAPI({
          container,
          backgroundColor: new THREE.Color(0x1a1a2e),
        })
        viewerRef.current = viewer

        viewer.IFC.setWasmPath('/wasm/')
        viewer.axes.setAxes()
        viewer.grid.setGrid()

        // ── 4. Carregar modelo a partir do File ──────────────────────────────
        const objectUrl = URL.createObjectURL(file)
        try {
          const model = await viewer.IFC.loadIfcUrl(objectUrl)
          await viewer.shadowDropper.renderShadow(model.modelID)
        } finally {
          URL.revokeObjectURL(objectUrl)
        }

        if (!cancelled) {
          setProgress(100)
          setPhase('done')
        }
      } catch (err: any) {
        if (!cancelled) {
          setPhase('error')
          setErrorMsg(err?.message ?? 'Erro desconhecido ao carregar o modelo IFC')
          console.error('[IfcViewerCanvas]', err)
        }
      }
    }

    load()

    return () => {
      cancelled = true
      if (viewerRef.current) {
        try { viewerRef.current.dispose?.() } catch { /* silencioso */ }
        viewerRef.current = null
      }
    }
  }, [fileUrl, fileName])

  return (
    <div className="relative w-full h-full">
      {/* Canvas do viewer — ocupa 100% */}
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
      />

      {/* Overlay de progresso (downloading / parsing) */}
      {(phase === 'downloading' || phase === 'parsing') && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900/90 gap-4">
          <Loader2 size={36} className="animate-spin text-purple-400" />
          <div className="w-64 space-y-2">
            <p className="text-gray-300 text-sm text-center">
              {phase === 'downloading' ? 'Baixando modelo…' : 'Processando geometria…'}
            </p>
            <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-purple-500 h-2 rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-gray-500 text-xs text-center">{progress}%</p>
          </div>
        </div>
      )}

      {/* Overlay de erro */}
      {phase === 'error' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900/95 gap-3 p-6">
          <AlertCircle size={40} className="text-red-400" />
          <p className="text-red-300 text-sm font-medium text-center">Falha ao carregar o modelo</p>
          <p className="text-gray-500 text-xs text-center max-w-xs">{errorMsg}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-2 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  )
}
