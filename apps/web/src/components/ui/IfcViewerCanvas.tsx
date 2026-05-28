'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader2, AlertCircle, Download, RefreshCw } from 'lucide-react'

interface IfcViewerCanvasProps {
  fileUrl:  string
  fileName: string
}

/**
 * Visualizador 3D IFC usando web-ifc@0.0.39 + three@0.149.0 diretamente.
 * Substitui web-ifc-viewer (que tem erros de modelID null).
 *
 * API web-ifc:
 *   LoadAllGeometry(modelID) → Vector<FlatMesh>
 *   FlatMesh.geometries      → Vector<PlacedGeometry>
 *   PlacedGeometry:          { color:{x,y,z,w}, geometryExpressID, flatTransformation }
 *   GetGeometry(mid, expId)  → IfcGeometry
 *   GetVertexArray(ptr, sz)  → Float32Array (interleaved: x,y,z,nx,ny,nz per vértice)
 *   GetIndexArray(ptr, sz)   → Uint32Array
 */
export default function IfcViewerCanvas({ fileUrl, fileName }: IfcViewerCanvasProps) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const animFrameRef  = useRef<number>(0)
  const rendererRef   = useRef<any>(null)
  const cancelRef     = useRef(false)

  const [progress, setProgress] = useState(0)
  const [phase,    setPhase]    = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [attempt,  setAttempt]  = useState(0) // incrementar para forçar retry

  const handleRetry = useCallback(() => {
    cancelRef.current = true
    cancelAnimationFrame(animFrameRef.current)
    if (rendererRef.current) {
      try { rendererRef.current.dispose() } catch { /* noop */ }
      rendererRef.current = null
    }
    if (containerRef.current) containerRef.current.innerHTML = ''
    setPhase('loading')
    setProgress(0)
    setErrorMsg('')
    // Dar um tick para o React processar os resets antes de re-montar
    setTimeout(() => {
      cancelRef.current = false
      setAttempt(n => n + 1)
    }, 50)
  }, [])

  useEffect(() => {
    if (!containerRef.current || !fileUrl) return
    cancelRef.current = false

    const load = async () => {
      try {
        // ── 1. Importar Three.js ────────────────────────────────────────────
        setProgress(8)
        // @ts-ignore — three@0.149 instalado sem index.d.ts nesta versão do monorepo
        const THREE = await import('three') as any
        // @ts-ignore
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js') as any
        setProgress(22)

        if (cancelRef.current) return

        // ── 2. Inicializar web-ifc ──────────────────────────────────────────
        const WebIFC = await import('web-ifc')
        // @ts-ignore
        const ifcApi = new WebIFC.IfcAPI()
        ifcApi.SetWasmPath('/wasm/')
        await ifcApi.Init()
        setProgress(38)

        if (cancelRef.current) return

        // ── 3. Baixar arquivo IFC ───────────────────────────────────────────
        setProgress(42)
        const res = await fetch(fileUrl, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
            'x-company-id':  localStorage.getItem('companyId') ?? '',
          },
        })
        if (!res.ok) throw new Error(`Falha ao baixar arquivo (HTTP ${res.status})`)
        const buffer = await res.arrayBuffer()
        setProgress(62)

        if (cancelRef.current) return

        // ── 4. Abrir modelo IFC ─────────────────────────────────────────────
        const data    = new Uint8Array(buffer)
        const modelID = ifcApi.OpenModel(data, {
          COORDINATE_TO_ORIGIN: true,
          USE_FAST_BOOLS:       false,
        })

        if (modelID === null || modelID === undefined || modelID < 0) {
          throw new Error(
            'Arquivo IFC inválido ou formato não suportado. ' +
            'Exporte novamente como IFC2x3 ou IFC4 no software de origem.'
          )
        }
        setProgress(70)

        if (cancelRef.current) return

        // ── 5. Configurar cena Three.js ─────────────────────────────────────
        const container = containerRef.current!
        container.innerHTML = '' // limpar canvas anterior

        const w = container.clientWidth  || 800
        const h = container.clientHeight || 600

        const scene    = new THREE.Scene()
        scene.background = new THREE.Color(0x1a1a2e)

        const camera = new THREE.PerspectiveCamera(60, w / h, 0.01, 100000)
        camera.position.set(10, 10, 10)

        const renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setSize(w, h)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.shadowMap.enabled = true
        container.appendChild(renderer.domElement)
        rendererRef.current = renderer

        // Iluminação
        scene.add(new THREE.AmbientLight(0xffffff, 0.8))
        const dir1 = new THREE.DirectionalLight(0xffffff, 1.0)
        dir1.position.set(50, 80, 50); scene.add(dir1)
        const dir2 = new THREE.DirectionalLight(0xffffff, 0.3)
        dir2.position.set(-50, -30, -50); scene.add(dir2)

        // Grid + eixos
        scene.add(new THREE.GridHelper(100, 100, 0x444466, 0x333344))
        scene.add(new THREE.AxesHelper(5))

        // Controles de órbita
        const controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping  = true
        controls.dampingFactor  = 0.05
        controls.minDistance    = 0.1
        controls.maxDistance    = 50000

        // ── 6. Processar geometria IFC ──────────────────────────────────────
        setProgress(75)
        const meshGroup  = new THREE.Group()
        const allMeshes  = ifcApi.LoadAllGeometry(modelID)

        for (let i = 0; i < allMeshes.size(); i++) {
          const flatMesh = allMeshes.get(i)
          const geoms    = flatMesh.geometries

          for (let j = 0; j < geoms.size(); j++) {
            const placed  = geoms.get(j)
            const geomData = ifcApi.GetGeometry(modelID, placed.geometryExpressID)

            const verts = ifcApi.GetVertexArray(
              geomData.GetVertexData(),
              geomData.GetVertexDataSize()
            )
            const idxs = ifcApi.GetIndexArray(
              geomData.GetIndexData(),
              geomData.GetIndexDataSize()
            )

            if (verts && verts.length > 0 && idxs && idxs.length > 0) {
              // Dados interleaved: x,y,z,nx,ny,nz por vértice
              const nVerts    = verts.length / 6
              const positions = new Float32Array(nVerts * 3)
              const normals   = new Float32Array(nVerts * 3)

              for (let k = 0; k < verts.length; k += 6) {
                const vi        = (k / 6) * 3
                positions[vi]   = verts[k];     positions[vi + 1] = verts[k + 1]; positions[vi + 2] = verts[k + 2]
                normals[vi]     = verts[k + 3]; normals[vi + 1]   = verts[k + 4]; normals[vi + 2]   = verts[k + 5]
              }

              const bufGeo = new THREE.BufferGeometry()
              bufGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
              bufGeo.setAttribute('normal',   new THREE.BufferAttribute(normals,   3))
              bufGeo.setIndex(new THREE.BufferAttribute(new Uint32Array(idxs), 1))

              const c   = placed.color
              const mat = new THREE.MeshPhongMaterial({
                color:       new THREE.Color(c.x, c.y, c.z),
                opacity:     c.w,
                transparent: c.w < 1,
                side:        THREE.DoubleSide,
              })

              const mesh   = new THREE.Mesh(bufGeo, mat)
              const matrix = new THREE.Matrix4().fromArray(placed.flatTransformation)
              mesh.applyMatrix4(matrix)
              meshGroup.add(mesh)
            }

            // delete libera memória WASM (existe em runtime mas não nos tipos)
            ;(geomData as any).delete?.()
          }
        }

        ;(allMeshes as any).delete?.() // liberar vetor WASM
        ifcApi.CloseModel(modelID)
        scene.add(meshGroup)

        // ── 7. Posicionar câmera no centro do modelo ────────────────────────
        const box = new THREE.Box3().setFromObject(meshGroup)
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3())
          const size   = box.getSize(new THREE.Vector3())
          const maxDim = Math.max(size.x, size.y, size.z)
          const dist   = Math.max(maxDim * 1.5, 5)

          camera.position.set(
            center.x + dist,
            center.y + dist * 0.6,
            center.z + dist
          )
          controls.target.copy(center)
          controls.update()
        }

        if (cancelRef.current) {
          renderer.dispose()
          rendererRef.current = null
          return
        }

        setProgress(100)
        setPhase('ready')

        // ── 8. Loop de animação ─────────────────────────────────────────────
        const animate = () => {
          if (cancelRef.current) return
          animFrameRef.current = requestAnimationFrame(animate)
          controls.update()
          renderer.render(scene, camera)
        }
        animate()

        // Redimensionamento responsivo
        const onResize = () => {
          if (!container) return
          const rw = container.clientWidth
          const rh = container.clientHeight
          camera.aspect = rw / rh
          camera.updateProjectionMatrix()
          renderer.setSize(rw, rh)
        }
        window.addEventListener('resize', onResize)

        // Retornar cleanup da sessão (resize + renderer)
        return () => {
          window.removeEventListener('resize', onResize)
          cancelAnimationFrame(animFrameRef.current)
          renderer.dispose()
          rendererRef.current = null
        }

      } catch (err: any) {
        if (!cancelRef.current) {
          console.error('[IfcViewerCanvas]', err)
          let msg = err?.message ?? 'Erro desconhecido ao carregar o modelo.'
          if (msg.includes('modelID') || msg.includes('null') || msg.includes('undefined')) {
            msg = 'Formato IFC não reconhecido ou arquivo corrompido. Exporte novamente como IFC2x3 ou IFC4.'
          } else if (msg.includes('wasm') || msg.includes('WASM') || msg.includes('Init')) {
            msg = 'Erro ao inicializar o processador 3D. Recarregue a página e tente novamente.'
          }
          setErrorMsg(msg)
          setPhase('error')
        }
      }
    }

    let sessionCleanup: (() => void) | undefined
    load().then(fn => { if (fn) sessionCleanup = fn })

    return () => {
      cancelRef.current = true
      cancelAnimationFrame(animFrameRef.current)
      sessionCleanup?.()
      if (rendererRef.current) {
        try { rendererRef.current.dispose() } catch { /* noop */ }
        rendererRef.current = null
      }
      // Não limpar innerHTML aqui para não piscar no StrictMode
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl, fileName, attempt])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Canvas do Three.js */}
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
      />

      {/* Overlay de loading */}
      {phase === 'loading' && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4"
          style={{ background: '#1a1a2e' }}
        >
          <Loader2 size={40} className="animate-spin text-purple-400" />
          <div className="w-64 space-y-2 text-center">
            <p className="text-gray-300 text-sm">
              {progress < 40 ? 'Inicializando motor 3D…'
               : progress < 65 ? 'Baixando modelo…'
               : 'Processando geometria…'}
            </p>
            <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-gray-500 text-xs">{progress}%</p>
          </div>
        </div>
      )}

      {/* Overlay de erro */}
      {phase === 'error' && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 p-8 text-center"
          style={{ background: '#0f0f1a' }}
        >
          <AlertCircle size={48} className="text-red-400 flex-shrink-0" />
          <div className="space-y-2 max-w-md">
            <p className="text-white text-base font-semibold">Não foi possível carregar o modelo</p>
            <p className="text-gray-400 text-sm leading-relaxed">{errorMsg}</p>
          </div>
          <div
            className="w-full max-w-sm rounded-xl p-4 text-left space-y-1"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <p className="text-gray-400 text-xs font-medium mb-2">Possíveis soluções:</p>
            {[
              'Verifique se o arquivo é IFC2x3 ou IFC4',
              'Exporte novamente do Revit / ArchiCAD / AutoCAD',
              'Arquivos muito grandes podem levar mais tempo',
              'Baixe o arquivo e abra em um visualizador local',
            ].map(tip => (
              <p key={tip} className="text-gray-500 text-xs">• {tip}</p>
            ))}
          </div>
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
