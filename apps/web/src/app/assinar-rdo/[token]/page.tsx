'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

/** Formata CPF: 000.000.000-00 */
function formatCPF(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3)  return digits
  if (digits.length <= 6)  return `${digits.slice(0,3)}.${digits.slice(3)}`
  if (digits.length <= 9)  return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6)}`
  return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`
}

export default function AssinarRdoPage() {
  const params = useParams()
  const token  = params?.token as string

  const [loading,       setLoading]       = useState(true)
  const [entry,         setEntry]         = useState<any>(null)
  const [error,         setError]         = useState('')
  const [alreadySigned, setAlreadySigned] = useState(false)
  const [signing,       setSigning]       = useState(false)
  const [signed,        setSigned]        = useState(false)
  const [fiscalName,    setFiscalName]    = useState('')
  const [fiscalDocument,setFiscalDocument]= useState('')   // CPF
  const [verificationHash, setVerificationHash] = useState('')

  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const [isDrawing,   setIsDrawing]   = useState(false)
  const [hasSignature,setHasSignature]= useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`${API}/api/v1/diary/public/sign/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error)        { setError(d.error); return }
        if (d.alreadySigned){ setAlreadySigned(true); setEntry(d); return }
        setEntry(d)
        setFiscalName(d.fiscalName || '')
      })
      .catch(() => setError('Erro ao carregar RDO'))
      .finally(() => setLoading(false))
  }, [token])

  /* ── Canvas drawing ── */
  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect   = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    const src    = 'touches' in e ? e.touches[0] : e
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY,
    }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const canvas = canvasRef.current; if (!canvas) return
    setIsDrawing(true)
    const ctx = canvas.getContext('2d')!
    const { x, y } = getPos(e, canvas)
    ctx.beginPath(); ctx.moveTo(x, y)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!isDrawing) return
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const { x, y } = getPos(e, canvas)
    ctx.lineTo(x, y)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.stroke()
    setHasSignature(true)
  }

  function stopDraw() { setIsDrawing(false) }

  function clearCanvas() {
    const canvas = canvasRef.current; if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  async function handleSign() {
    if (!hasSignature || !fiscalName.trim() || !fiscalDocument.trim()) return
    setSigning(true)
    const canvas = canvasRef.current!
    const signatureData = canvas.toDataURL('image/png')
    try {
      const res  = await fetch(`${API}/api/v1/diary/public/sign/${token}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ signatureData, fiscalName, fiscalDocument }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Erro ao assinar'); return }
      setVerificationHash(data.verificationHash || '')
      setSigned(true)
    } catch { alert('Erro de conexão. Tente novamente.') }
    finally { setSigning(false) }
  }

  /* ── Telas de estado ── */
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', background: '#F9FAFB' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, border: '4px solid #F5A623', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <span style={{ fontSize: 14, color: '#6B7280' }}>Carregando RDO...</span>
      </div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', flexDirection: 'column', gap: 12, background: '#FEF2F2' }}>
      <div style={{ fontSize: 56 }}>❌</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#DC2626' }}>{error}</div>
      <div style={{ fontSize: 13, color: '#6B7280' }}>Solicite um novo link ao responsável pela obra.</div>
    </div>
  )

  if (alreadySigned) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', flexDirection: 'column', gap: 12, background: '#F0FDF4' }}>
      <div style={{ fontSize: 64 }}>✅</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#16A34A' }}>RDO já foi assinado!</div>
      {entry?.reportNumber && (
        <div style={{ fontSize: 14, color: '#6B7280' }}>
          {entry.reportNumber}{entry.projectName ? ` — ${entry.projectName}` : ''}
        </div>
      )}
      <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>Este link não pode mais ser utilizado.</div>
    </div>
  )

  if (signed) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', flexDirection: 'column', gap: 16, background: '#F0FDF4', padding: '24px 16px' }}>
      <div style={{ fontSize: 64 }}>✅</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#16A34A', textAlign: 'center' }}>RDO assinado com sucesso!</div>
      {entry?.reportNumber && (
        <div style={{ fontSize: 14, color: '#6B7280', textAlign: 'center' }}>
          {entry.reportNumber}{entry.projectName ? ` — ${entry.projectName}` : ''}
        </div>
      )}

      {/* Botão de download do PDF assinado */}
      {verificationHash && (
        <a
          href={`${API}/api/v1/diary/public/download/${verificationHash}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            marginTop: 8,
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '12px 24px', borderRadius: 10,
            background: '#F5A623', color: '#fff', fontWeight: 700, fontSize: 15,
            textDecoration: 'none', boxShadow: '0 2px 8px rgba(245,166,35,0.3)',
          }}
        >
          📄 Baixar PDF assinado
        </a>
      )}

      <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4, textAlign: 'center' }}>
        Este link não pode mais ser utilizado.
      </div>
    </div>
  )

  const canSubmit = hasSignature && fiscalName.trim().length > 0 && fiscalDocument.replace(/\D/g,'').length === 11 && !signing

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', fontFamily: 'sans-serif', padding: '24px 16px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 13, color: '#F5A623', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
            SYSOBRA
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>Assinatura de RDO</h1>
          {entry?.reportNumber && (
            <div style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{entry.reportNumber}</div>
          )}
          {entry?.projectName && (
            <div style={{ fontSize: 13, color: '#6B7280' }}>{entry.projectName}</div>
          )}
          {entry?.date && (
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>
              Data: {new Date(entry.date).toLocaleDateString('pt-BR')}
              {entry.authorName ? ` · Elaborado por: ${entry.authorName}` : ''}
            </div>
          )}
        </div>

        {/* Prévia do PDF */}
        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <a
            href={`${API}/api/v1/diary/public/pdf/${token}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8,
              border: '1px solid #D1D5DB', background: '#fff',
              fontSize: 13, color: '#374151', textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            👁️ Visualizar RDO completo (PDF)
          </a>
        </div>

        {/* Aviso legal */}
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 14px', marginBottom: 20, fontSize: 12, color: '#92400E' }}>
          <strong>⚠ Importante:</strong> Ao assinar este documento você confirma que tomou conhecimento e está de acordo com o conteúdo do Relatório Diário de Obra. Esta assinatura tem validade legal.
        </div>

        {/* Nome do fiscal */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
            Seu nome completo *
          </label>
          <input
            value={fiscalName}
            onChange={e => setFiscalName(e.target.value)}
            placeholder="Nome do fiscal / engenheiro responsável"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const }}
          />
        </div>

        {/* CPF do fiscal */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
            CPF *
          </label>
          <input
            value={fiscalDocument}
            onChange={e => setFiscalDocument(formatCPF(e.target.value))}
            placeholder="000.000.000-00"
            inputMode="numeric"
            maxLength={14}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const }}
          />
          {fiscalDocument && fiscalDocument.replace(/\D/g,'').length < 11 && (
            <div style={{ fontSize: 11, color: '#DC2626', marginTop: 3 }}>CPF incompleto</div>
          )}
        </div>

        {/* Canvas de assinatura */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Assinatura *</label>
            <button onClick={clearCanvas} style={{ fontSize: 12, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', borderRadius: 4 }}>
              Limpar
            </button>
          </div>
          <canvas
            ref={canvasRef}
            width={448}
            height={160}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
            style={{ width: '100%', height: 160, border: `2px dashed ${hasSignature ? '#F5A623' : '#D1D5DB'}`, borderRadius: 10, background: '#fff', cursor: 'crosshair', touchAction: 'none', display: 'block' }}
          />
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4, textAlign: 'center' }}>
            {hasSignature ? '✏️ Assinatura registrada' : 'Desenhe sua assinatura acima com o mouse ou dedo'}
          </div>
        </div>

        {/* Botão assinar */}
        <button
          onClick={handleSign}
          disabled={!canSubmit}
          style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', background: canSubmit ? '#F5A623' : '#D1D5DB', color: '#fff', fontWeight: 700, fontSize: 16, cursor: canSubmit ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }}
        >
          {signing ? 'Assinando...' : '✍️ Assinar RDO'}
        </button>

        <div style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 14 }}>
          Este link é válido por 48 horas · Uso único · Powered by Sysobra
        </div>
      </div>
    </div>
  )
}
