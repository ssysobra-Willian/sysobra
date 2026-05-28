'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader2, AlertCircle, Download, RefreshCw } from 'lucide-react'

interface IfcViewerCanvasProps {
  fileUrl:  string
  fileName: string
}

/**
 * Visualizador 3D IFC — default export para uso na página dedicada /app/ifc-viewer.
 * Padrão: fetch URL → Blob → File → loadIfcUrl (evita CORS em streams parciais).
 * Barra de progresso de download + estado de erro detalhado com botão de download.
 */
export default function IfcViewerCanvas({ fileUrl, fileName }: IfcViewerCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef    = useRef<any>(null)
  const cancelRef    = useRef(false)

  const [progress, setProgress] = useState(0)
  const [phase,    setPhase]    = useState<'downloading' | 'parsing' | 'done' | 'error'>('downloading')
  const [errorMsg, setErrorMsg] = useState('')
  // incrementar para forçar re-execução do useEffect no retry
  const [attempt,  setAttempt]  = useState(0)

  const handleRetry = useCallback(() => {
    // Destruir viewer anterior se existir
    if (viewerRef.current) {
      try { viewerRef.current.dispose?.() } catch { /* silencioso */ }
      viewerRef.current = null
    }
    setPhase('downloading')
    setProgress(0)
    setErrorMsg('')
    setAttempt(n => n + 1)
  }, [])

  useEffect(() => {
    if (!containerRef.current || !fileUrl) return

    cancelRef.current = false
    let viewer: any = null

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

        if (!res.ok) throw new Error(`Falha ao baixar arquivo (HTTP ${res.status})`)

        const contentLength = Number(res.headers.get('Content-Length') ?? 0)
        const reader  = res.body!.getReader()
        const chunks: Uint8Array[] = []
        let received = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done || cancelRef.current) break
          chunks.push(value)
          received += value.length
          if (contentLength > 0) {
            setProgress(Math.min(89, Math.round((received / contentLength) * 90)))
          }
        }

        if (cancelRef.current) return

        // ── 2. Montar Blob/File ─────────────────────────────────────────────
        const blob = new Blob(chunks as BlobPart[], { type: 'application/octet-stream' })
        const file = new File([blob], fileName || 'model.ifc', { type: 'application/octet-stream' })

        // ── 3. Inicializar viewer ───────────────────────────────────────────
        setPhase('parsing')
        setProgress(92)

        // @ts-ignore — web-ifc-viewer não tem tipos completos no TS
        const { IfcViewerAPI } = await import('web-ifc-viewer')
        // @ts-ignore
        const THREE = await import('three')

        if (cancelRef.current || !containerRef.current) return

        // Limpar container antes de criar novo viewer
        const container = containerRef.current!
        container.innerHTML = ''

        viewer = new IfcViewerAPI({
          container,
          backgroundColor: new THREE.Color(0x1a1a2e),
        })
        viewerRef.current = viewer

        viewer.IFC.setWasmPath('/wasm/')
        viewer.axes.setAxes()
        viewer.grid.setGrid()

        // ── 4. Carregar modelo a partir do File ─────────────────────────────
        const objectUrl = URL.createObjectURL(file)
        try {
          const model = await viewer.IFC.loadIfcUrl(objectUrl)

          // Verificar se o modelo foi carregado com sucesso
          if (!model) {
            throw new Error(
              'O arquivo IFC não pôde ser carregado. ' +
              'Verifique se é um arquivo IFC válido (IFC2x3 ou IFC4).'
            )
          }

          // Shadow rendering é opcional — não falhar se der erro
          if (model.modelID != null) {
            try {
              await viewer.shadowDropper.renderShadow(model.modelID)
            } catch (shadowErr) {
              console.warn('[IfcViewerCanvas] shadow rendering falhou (não crítico):', shadowErr)
            }
          }
        } catch (loadErr: any) {
          // Traduzir erros específicos do web-ifc para mensagens amigáveis
          let msg = loadErr?.message ?? 'Erro ao carregar o modelo IFC'
          if (msg.includes('modelID') || msg.includes('null') || msg.includes('undefined')) {
            msg =
              'Formato IFC não reconhecido ou arquivo corrompido. ' +
              'Exporte novamente como IFC2x3 ou IFC4 no software de origem.'
          } else if (msg.includes('wasm') || msg.includes('WASM')) {
            msg = 'Erro ao carregar o processador WASM. Recarregue a página e tente novamente.'
          }
          throw new Error(msg)
        } finally {
          URL.revokeObjectURL(objectUrl)
        }

        if (!cancelRef.current) {
          setProgress(100)
          setPhase('done')
        }
      } catch (err: any) {
        if (!cancelRef.current) {
          setPhase('error')
          setErrorMsg(err?.message ?? 'Erro desconhecido ao carregar o modelo IFC')
          console.error('[IfcViewerCanvas]', err)
        }
      }
    }

    load()

    return () => {
      cancelRef.current = true
      if (viewerRef.current) {
        try { viewerRef.current.dispose?.() } catch { /* silencioso */ }
        viewerRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl, fileName, attempt])

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

      {/* Overlay de erro — com botão de download e mensagens úteis */}
      {phase === 'error' && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 p-8"
          style={{ background: '#0f0f1a' }}
        >
          <AlertCircle size={48} className="text-red-400 flex-shrink-0" />

          <div className="text-center max-w-md space-y-2">
            <p className="text-white text-base font-semibold">
              Não foi possível carregar o modelo
            </p>
            <p className="text-gray-400 text-sm leading-relaxed">{errorMsg}</p>
          </div>

          {/* Dicas de solução */}
          <div
            className="w-full max-w-sm rounded-xl p-4 text-left space-y-1"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <p className="text-gray-400 text-xs font-medium mb-2">Possíveis soluções:</p>
            {[
              'Verifique se o arquivo é IFC2x3 ou IFC4',
              'Tente exportar novamente do software de origem',
              'Arquivos muito grandes podem causar timeout',
              'Use o botão abaixo para baixar e abrir localmente',
            ].map(tip => (
              <p key={tip} className="text-gray-500 text-xs">• {tip}</p>
            ))}
          </div>

          {/* Ações */}
          <div className="flex gap-3 flex-wrap justify-center">
            <button
              onClick={handleRetry}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: '#7C3AED' }}
            >
              <RefreshCw size={14} />
              Tentar novamente
            </button>

            <a
              href={fileUrl}
              download={fileName || 'model.ifc'}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white no-underline"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              <Download size={14} />
              Baixar IFC
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
