'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Loader2, Box } from 'lucide-react'

// Import dinâmico do canvas IFC — evita SSR/WebGL no servidor
const IfcViewerCanvas = dynamic(
  () => import('@/components/ui/IfcViewerCanvas'),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
        <Loader2 size={32} className="animate-spin text-purple-400" />
        <p className="text-sm">Inicializando visualizador 3D…</p>
      </div>
    ),
  },
)

function IfcViewerContent() {
  const params = useSearchParams()
  const fileUrl  = params.get('url')  ?? ''
  const fileName = params.get('name') ?? 'Modelo IFC'

  if (!fileUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
        <Box size={40} className="opacity-30" />
        <p className="text-sm">Nenhum arquivo especificado</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Barra superior */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-black/60 border-b border-white/10 flex-shrink-0">
        <Box size={16} className="text-purple-400" />
        <span className="text-white text-sm font-medium truncate flex-1">{fileName}</span>
        <span className="text-gray-500 text-xs hidden sm:block">
          🖱 Rotacionar · Scroll: zoom · Shift+arrastar: pan
        </span>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden">
        <IfcViewerCanvas fileUrl={fileUrl} fileName={fileName} />
      </div>
    </div>
  )
}

export default function IfcViewerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center h-screen bg-gray-900 gap-3 text-gray-400">
          <Loader2 size={32} className="animate-spin text-purple-400" />
          <p className="text-sm">Carregando…</p>
        </div>
      }
    >
      <IfcViewerContent />
    </Suspense>
  )
}
