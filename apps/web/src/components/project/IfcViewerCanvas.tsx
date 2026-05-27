'use client'

import { useEffect, useRef } from 'react'

interface IfcViewerCanvasProps {
  fileUrl: string   // URL absoluta do arquivo IFC para carregar
  className?: string
}

/**
 * Visualizador 3D IFC — usa web-ifc-viewer (IfcViewerAPI) com três.js
 * Carregado dinamicamente para evitar SSR (import dinâmico via useEffect).
 */
export function IfcViewerCanvas({ fileUrl, className }: IfcViewerCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef    = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current) return
    let viewer: any = null

    const init = async () => {
      // Import dinâmico — evita SSR e erros de WebGL no servidor
      // @ts-ignore — web-ifc-viewer é carregado em runtime, não precisa de tipos estáticos
      const { IfcViewerAPI } = await import('web-ifc-viewer')
      // @ts-ignore
      const THREE = await import('three')

      const container = containerRef.current!
      viewer = new IfcViewerAPI({ container, backgroundColor: new THREE.Color(0xf1f5f9) })
      viewerRef.current = viewer

      // Configurações básicas
      viewer.IFC.setWasmPath('/wasm/')
      viewer.axes.setAxes()
      viewer.grid.setGrid()

      try {
        const model = await viewer.IFC.loadIfcUrl(fileUrl)
        await viewer.shadowDropper.renderShadow(model.modelID)
      } catch (err) {
        console.error('Erro ao carregar IFC:', err)
      }
    }

    init()

    return () => {
      // Cleanup
      if (viewerRef.current) {
        try { viewerRef.current.dispose?.() } catch { /* silencioso */ }
        viewerRef.current = null
      }
    }
  }, [fileUrl])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    />
  )
}
