'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams }                      from 'next/navigation'
import Link                                          from 'next/link'
import { Button }                                    from '@/components/ui/Button'
import { Badge }                                     from '@/components/ui/Badge'
import { Modal }                                     from '@/components/ui/Modal'
import { Textarea }                                  from '@/components/ui/Input'
import { PageHeader }                                from '@/components/ui/PageHeader'
import { SemAcesso }                                 from '@/components/SemAcesso'
import { usePermissions }                            from '@/hooks/usePermissions'
import type { BadgeVariant }                         from '@/components/ui/Badge'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface StageEntry {
  stageId:          string
  previousProgress: number
  currentProgress:  number
  progressDelta:    number
  activities:       string
  comments:         string | null
  stage:            { id: string; name: string; code: string | null }
}

interface Occurrence {
  id:          string
  type:        string
  severity:    string
  description: string
  action:      string | null
  responsible: string | null
  visitorName: string | null
  photos:      string[]
}

interface DiaryComment {
  id:         string
  authorName: string
  authorType: 'INTERNAL' | 'EXTERNAL' | 'CLIENT'
  content:    string
  isInternal: boolean
  createdAt:  string
  author:     { id: string; name: string }
}

interface DiaryEntry {
  id:             string
  date:           string
  reportNumber:   string | null
  status:         string
  // Clima
  weatherMorning:    string | null
  weatherAfternoon:  string | null
  weatherNight:      string | null
  rainMorningMm:     number
  rainAfternoonMm:   number
  rainNightMm:       number
  totalRainMm:       number
  workableMorning:   boolean
  workableAfternoon: boolean
  workableNight:     boolean
  suggestedUnworkable:    boolean
  unworkableConfirmedBy:  string | null
  // Conteúdo
  generalActivities: string | null
  generalNotes:      string | null
  notesPublic:       boolean
  activities:        string | null
  observations:      string | null
  imageUrls:         string[]
  // DDS
  ddsDone:   boolean
  ddsTheme:  string | null
  ddsTime:   string | null
  // Meta
  author:     { id: string; name: string; avatarUrl: string | null }
  approvedBy: { id: string; name: string } | null
  rejectedBy: { id: string; name: string } | null
  approvedAt: string | null
  rejectedAt: string | null
  rejectionNote: string | null
  updatedBy:  string | null
  project: {
    id: string; name: string; code: string | null
    address: string | null; city: string | null; state: string | null
    startDate: string | null; expectedEndDate: string | null
    coverImage: string | null
    client:      { id: string; name: string } | null
    responsible: { id: string; name: string } | null
    company:     { name: string; cnpj: string | null; logo: string | null }
  }
  stageEntries: StageEntry[]
  occurrences:  Occurrence[]
  comments:     DiaryComment[]
}

// ─── Labels ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; variant: BadgeVariant; bg: string; text: string }> = {
  DRAFT:    { label: 'Rascunho',           variant: 'gray',   bg: 'bg-gray-50 border-gray-200',   text: 'text-gray-600'  },
  PENDING:  { label: 'Aguard. aprovação',  variant: 'yellow', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
  APPROVED: { label: 'Aprovado',           variant: 'green',  bg: 'bg-green-50 border-green-200', text: 'text-green-700' },
  REJECTED: { label: 'Devolvido',          variant: 'red',    bg: 'bg-red-50 border-red-200',     text: 'text-red-700'   },
}

const WEATHER_LABEL: Record<string, string> = {
  SUNNY: '☀️ Ensolarado', CLOUDY: '🌤 Nublado', OVERCAST: '☁️ Encoberto',
  RAINY: '🌧 Chuvoso',    STORMY: '⛈ Tempestade',
}

const OCC_TYPE: Record<string, string> = {
  ACCIDENT: 'Acidente', INCIDENT: 'Incidente', VISIT: 'Visita',
  INSPECTION: 'Vistoria', STOPPAGE: 'Paralisação',
  NONCONFORMITY: 'Não-conformidade', OTHER: 'Outro',
}

const SEV_CFG: Record<string, { label: string; variant: BadgeVariant }> = {
  LOW:      { label: 'Baixa',   variant: 'gray'   },
  MEDIUM:   { label: 'Média',   variant: 'yellow' },
  HIGH:     { label: 'Alta',    variant: 'orange' },
  CRITICAL: { label: 'Crítica', variant: 'red'    },
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function RdoDetailPage() {
  const router    = useRouter()
  const params    = useParams()
  const projectId = params.id as string
  const reportId  = params.reportId as string
  const userId    = typeof window !== 'undefined' ? localStorage.getItem('userId') : null

  const { canAccessModule, can, isExternal, isClient } = usePermissions()

  const [entry,         setEntry]         = useState<DiaryEntry | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState('')
  const [actionMsg,     setActionMsg]     = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [pdfLoading,    setPdfLoading]    = useState(false)

  // Modal: rejeitar
  const [rejectOpen,    setRejectOpen]    = useState(false)
  const [rejectionNote, setRejectionNote] = useState('')
  const [rejectLoading, setRejectLoading] = useState(false)
  const [rejectError,   setRejectError]   = useState('')

  // Modal: excluir
  const [deleteOpen,    setDeleteOpen]    = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Comentários
  const [comment,        setComment]        = useState('')
  const [isInternal,     setIsInternal]     = useState(false)
  const [commentLoading, setCommentLoading] = useState(false)
  const [commentError,   setCommentError]   = useState('')
  const commentsEndRef = useRef<HTMLDivElement>(null)

  if (!canAccessModule('diario_obra')) return <SemAcesso modulo="Diário de Obra" />

  const canEdit    = can('diario_obra', 'edit')
  const canDelete  = can('diario_obra', 'delete')
  const canApprove = can('diario_obra', 'approve')
  const canComment = can('diario_obra', 'comment')

  // ── Carrega relatório ─────────────────────────────────────────────────────

  const loadEntry = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) { router.replace('/login'); return }
    setLoading(true); setError('')
    try {
      const res  = await fetch(`${API}/api/v1/diary/reports/${reportId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Relatório não encontrado')
      setEntry(data.entry)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [reportId, router])

  useEffect(() => { loadEntry() }, [loadEntry])

  // ── Helpers ───────────────────────────────────────────────────────────────

  function flash(type: 'ok' | 'err', msg: string) {
    setActionMsg({ type, msg })
    setTimeout(() => setActionMsg(null), 3500)
  }

  function getToken() { return localStorage.getItem('token') || '' }

  // ── Aprovar ───────────────────────────────────────────────────────────────

  async function handleApprove() {
    try {
      const res  = await fetch(`${API}/api/v1/diary/reports/${reportId}/approve`, {
        method: 'POST', headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      flash('ok', 'Relatório aprovado!')
      loadEntry()
    } catch (err: unknown) {
      flash('err', err instanceof Error ? err.message : 'Erro ao aprovar.')
    }
  }

  // ── Rejeitar ──────────────────────────────────────────────────────────────

  async function handleReject() {
    if (!rejectionNote.trim()) { setRejectError('Informe o motivo.'); return }
    setRejectLoading(true); setRejectError('')
    try {
      const res  = await fetch(`${API}/api/v1/diary/reports/${reportId}/reject`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body:    JSON.stringify({ rejectionNote }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRejectOpen(false); setRejectionNote('')
      flash('ok', 'Relatório devolvido para correção.')
      loadEntry()
    } catch (err: unknown) {
      setRejectError(err instanceof Error ? err.message : 'Erro ao devolver.')
    } finally {
      setRejectLoading(false)
    }
  }

  // ── Submeter (rascunho → pendente) ────────────────────────────────────────

  async function handleSubmit() {
    try {
      const res  = await fetch(`${API}/api/v1/diary/reports/${reportId}/submit`, {
        method: 'POST', headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      flash('ok', 'Relatório enviado para aprovação!')
      loadEntry()
    } catch (err: unknown) {
      flash('err', err instanceof Error ? err.message : 'Erro ao enviar.')
    }
  }

  // ── Excluir ───────────────────────────────────────────────────────────────

  async function handleDelete() {
    setDeleteLoading(true)
    try {
      const res  = await fetch(`${API}/api/v1/diary/entries/${reportId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.replace(`/app/diario/${projectId}`)
    } catch (err: unknown) {
      flash('err', err instanceof Error ? err.message : 'Erro ao excluir.')
      setDeleteOpen(false)
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Download PDF ──────────────────────────────────────────────────────────

  async function handlePdf() {
    setPdfLoading(true)
    try {
      const token = getToken()
      const res   = await fetch(`${API}/api/v1/diary/reports/${reportId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Falha ao gerar PDF')
      const blob     = await res.blob()
      const url      = URL.createObjectURL(blob)
      const a        = document.createElement('a')
      a.href         = url
      a.download     = `RDO-${entry?.reportNumber ?? reportId}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      flash('err', err instanceof Error ? err.message : 'Erro ao gerar PDF.')
    } finally {
      setPdfLoading(false)
    }
  }

  // ── Comentar ──────────────────────────────────────────────────────────────

  async function handleComment(e: React.FormEvent) {
    e.preventDefault()
    if (!comment.trim()) return
    setCommentLoading(true); setCommentError('')
    try {
      const res  = await fetch(`${API}/api/v1/diary/entries/${reportId}/comments`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body:    JSON.stringify({ content: comment.trim(), isInternal }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setComment(''); setIsInternal(false)
      loadEntry()
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 300)
    } catch (err: unknown) {
      setCommentError(err instanceof Error ? err.message : 'Erro ao comentar.')
    } finally {
      setCommentLoading(false)
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!confirm('Excluir este comentário?')) return
    try {
      await fetch(`${API}/api/v1/diary/comments/${commentId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` },
      })
      loadEntry()
    } catch {
      flash('err', 'Erro ao excluir comentário.')
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !entry) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 text-sm">{error || 'Relatório não encontrado.'}</p>
        <Link href={`/app/diario/${projectId}`} className="text-sm text-[#F5A623] hover:underline mt-2 inline-block">
          ← Voltar
        </Link>
      </div>
    )
  }

  const sc         = STATUS_CFG[entry.status] ?? STATUS_CFG.PENDING
  const isOwnEntry = entry.author.id === userId
  const isPending  = entry.status === 'PENDING'
  const isDraft    = entry.status === 'DRAFT'
  const isApproved = entry.status === 'APPROVED'
  const isRejected = entry.status === 'REJECTED'
  const proj       = entry.project

  const isUnworkable = !entry.workableMorning || !entry.workableAfternoon || !entry.workableNight

  return (
    <div>
      <PageHeader
        title={entry.reportNumber ? `RDO ${entry.reportNumber}` : 'Relatório Diário de Obra'}
        subtitle={proj.name}
        breadcrumbs={[
          { label: 'Diário de Obra', href: '/app/diario' },
          { label: proj.name, href: `/app/diario/${projectId}` },
          { label: entry.reportNumber ?? fmtDateShort(entry.date) },
        ]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Submeter rascunho */}
            {isDraft && isOwnEntry && (
              <Button size="sm" onClick={handleSubmit}>
                📤 Enviar para aprovação
              </Button>
            )}
            {/* Editar */}
            {canEdit && (isDraft || isRejected) && (isOwnEntry || canApprove) && (
              <Link href={`/app/diario/${projectId}/novo?edit=${reportId}`}>
                <Button variant="secondary" size="sm">Editar</Button>
              </Link>
            )}
            {/* Aprovar / Devolver */}
            {canApprove && isPending && (
              <>
                <Button size="sm" onClick={handleApprove}>✓ Aprovar</Button>
                <Button
                  variant="danger" size="sm"
                  onClick={() => { setRejectionNote(''); setRejectError(''); setRejectOpen(true) }}
                >
                  ↩ Devolver
                </Button>
              </>
            )}
            {/* PDF */}
            <Button variant="secondary" size="sm" loading={pdfLoading} onClick={handlePdf}>
              📄 PDF
            </Button>
            {/* Excluir */}
            {canDelete && (isOwnEntry || canApprove) && !isApproved && (
              <Button
                variant="ghost" size="sm"
                onClick={() => setDeleteOpen(true)}
                className="text-red-500 hover:text-red-600"
              >
                Excluir
              </Button>
            )}
          </div>
        }
      />

      {/* Feedback */}
      {actionMsg && (
        <div className={`mb-4 p-3 rounded-xl text-sm ${actionMsg.type === 'ok' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-600'}`}>
          {actionMsg.msg}
        </div>
      )}

      {/* Banner de status */}
      <div className={`mb-5 p-4 rounded-xl border ${sc.bg} flex items-start gap-3`}>
        <Badge variant={sc.variant}>{sc.label}</Badge>
        <div className="flex-1">
          {isApproved && entry.approvedBy && (
            <p className={`text-sm ${sc.text}`}>Aprovado por <strong>{entry.approvedBy.name}</strong>{entry.approvedAt && ` em ${fmtDateTime(entry.approvedAt)}`}</p>
          )}
          {isRejected && entry.rejectionNote && (
            <div>
              <p className="text-sm font-semibold text-red-700 mb-1">Motivo da devolução:</p>
              <p className="text-sm text-red-600">{entry.rejectionNote}</p>
              {(isDraft || isRejected) && canEdit && (
                <Link href={`/app/diario/${projectId}/novo`} className="text-xs text-red-700 font-semibold hover:underline mt-1 inline-block">→ Criar nova versão</Link>
              )}
            </div>
          )}
          {isPending && <p className={`text-sm ${sc.text}`}>Aguardando revisão de um gestor.</p>}
          {isDraft && <p className={`text-sm ${sc.text}`}>Rascunho — ainda não enviado para aprovação.</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Conteúdo principal ─────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Identificação */}
          <Card title="1. Identificação da Obra">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <InfoItem label="Data"        value={fmtDate(entry.date)} />
              <InfoItem label="Número RDO"  value={entry.reportNumber ?? '—'} />
              <InfoItem label="Elaborado por" value={entry.author.name} />
              <InfoItem label="Obra"        value={proj.name} />
              {proj.code && <InfoItem label="Código" value={proj.code} />}
              {proj.client && <InfoItem label="Cliente" value={proj.client.name} />}
              {proj.responsible && <InfoItem label="Responsável" value={proj.responsible.name} />}
              {(proj.city || proj.state) && <InfoItem label="Local" value={[proj.city, proj.state].filter(Boolean).join(' — ')} />}
            </dl>
          </Card>

          {/* Condições climáticas */}
          <Card title="2. Condições Climáticas">
            {isUnworkable && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                <span className="text-red-500 font-bold text-sm">⛔</span>
                <p className="text-sm text-red-700 font-semibold">
                  Dia impraticável
                  {entry.unworkableConfirmedBy && ` — Confirmado por: ${entry.unworkableConfirmedBy}`}
                </p>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Período</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Condição</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Chuva</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">Praticab.</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { period: 'Manhã',  cond: entry.weatherMorning,   rain: entry.rainMorningMm,   ok: entry.workableMorning },
                    { period: 'Tarde',  cond: entry.weatherAfternoon, rain: entry.rainAfternoonMm, ok: entry.workableAfternoon },
                    { period: 'Noite',  cond: entry.weatherNight,     rain: entry.rainNightMm,     ok: entry.workableNight },
                  ].map((row) => (
                    <tr key={row.period} className="border-b border-gray-50">
                      <td className="px-3 py-2 font-medium">{row.period}</td>
                      <td className="px-3 py-2 text-gray-600">{row.cond ? (WEATHER_LABEL[row.cond] ?? row.cond) : '—'}</td>
                      <td className="px-3 py-2 text-right">{Number(row.rain) > 0 ? `${Number(row.rain)} mm` : '—'}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${row.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {row.ok ? 'OK' : 'Imprat.'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td colSpan={2} className="px-3 py-2 text-xs">Total do dia</td>
                    <td className="px-3 py-2 text-right text-xs">{Number(entry.totalRainMm)} mm</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Progresso por etapa */}
          {entry.stageEntries.length > 0 && (
            <Card title="3. Progresso por Etapa">
              <div className="space-y-4">
                {entry.stageEntries.map((se) => (
                  <div key={se.stageId} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-800">{se.stage.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{Number(se.previousProgress).toFixed(0)}%</span>
                        <span className="text-xs">→</span>
                        <span className="text-sm font-bold text-gray-800">{Number(se.currentProgress).toFixed(0)}%</span>
                        {Number(se.progressDelta) !== 0 && (
                          <span className={`text-xs font-semibold ${Number(se.progressDelta) > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            ({Number(se.progressDelta) > 0 ? '+' : ''}{Number(se.progressDelta).toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full bg-[#F5A623] rounded-full"
                        style={{ width: `${Math.min(100, Number(se.currentProgress))}%` }}
                      />
                    </div>
                    {se.activities && (
                      <p className="text-xs text-gray-500 leading-relaxed">{se.activities}</p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Atividades gerais */}
          {(entry.generalActivities || entry.activities) && (
            <Card title="4. Atividades Gerais">
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {entry.generalActivities || entry.activities}
              </p>
            </Card>
          )}

          {/* Ocorrências */}
          {entry.occurrences.length > 0 && (
            <Card title="5. Ocorrências">
              <div className="space-y-3">
                {entry.occurrences.map((o) => {
                  const sev = SEV_CFG[o.severity] ?? SEV_CFG.LOW
                  return (
                    <div key={o.id} className="border border-gray-200 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={sev.variant} size="sm">{sev.label}</Badge>
                        <span className="text-xs font-medium text-gray-700">{OCC_TYPE[o.type] ?? o.type}</span>
                      </div>
                      <p className="text-sm text-gray-700">{o.description}</p>
                      {o.action && <p className="text-xs text-gray-500 mt-1">Providência: {o.action}</p>}
                      {o.responsible && <p className="text-xs text-gray-400 mt-0.5">Responsável: {o.responsible}</p>}
                      {o.visitorName && <p className="text-xs text-gray-400 mt-0.5">Visitante: {o.visitorName}</p>}
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* DDS */}
          {entry.ddsDone && (
            <Card title="6. DDS — Diálogo Diário de Segurança">
              <div className="flex items-center gap-3">
                <span className="text-green-500 font-bold">✓</span>
                <p className="text-sm text-gray-700">
                  DDS realizado
                  {entry.ddsTime && ` às ${new Date(entry.ddsTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
                  {entry.ddsTheme && <> — <strong>{entry.ddsTheme}</strong></>}
                </p>
              </div>
            </Card>
          )}

          {/* Observações gerais */}
          {(entry.generalNotes || entry.observations) && (
            <Card title="7. Observações Gerais">
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {entry.generalNotes || entry.observations}
              </p>
              {entry.notesPublic && (
                <p className="text-xs text-gray-400 mt-2">📢 Visível para clientes e externos</p>
              )}
            </Card>
          )}

          {/* Fotos */}
          {entry.imageUrls.length > 0 && (
            <Card title={`Fotos (${entry.imageUrls.length})`}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {entry.imageUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Foto ${i + 1}`}
                      className="w-full h-28 object-cover rounded-xl border border-gray-200 hover:opacity-90 transition-opacity"
                    />
                  </a>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* ── Coluna lateral: comentários ────────────────────────────────── */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col sticky top-4">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">
                Comentários ({entry.comments.length})
              </h3>
              {!isExternal && !isClient && (
                <p className="text-xs text-gray-400 mt-0.5">Internos: visíveis apenas pela equipe.</p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[400px]">
              {entry.comments.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">Sem comentários ainda.</p>
              ) : (
                entry.comments.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-xl p-3 text-sm ${c.isInternal ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-100'}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-gray-800 text-xs">{c.authorName}</span>
                        {c.isInternal && <Badge variant="yellow" size="sm">Interno</Badge>}
                        {c.authorType === 'CLIENT' && <Badge variant="green" size="sm">Cliente</Badge>}
                      </div>
                      {c.author.id === userId && (
                        <button onClick={() => handleDeleteComment(c.id)} className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
                      )}
                    </div>
                    <p className="text-gray-700 leading-relaxed">{c.content}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{fmtDateTime(c.createdAt)}</p>
                  </div>
                ))
              )}
              <div ref={commentsEndRef} />
            </div>

            {canComment && (
              <form onSubmit={handleComment} className="border-t border-gray-100 p-4 space-y-2">
                {commentError && <p className="text-xs text-red-600">{commentError}</p>}
                <Textarea
                  placeholder="Escreva um comentário..."
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={commentLoading}
                />
                <div className="flex items-center justify-between gap-2">
                  {!isExternal && !isClient && (
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-500">
                      <input
                        type="checkbox"
                        checked={isInternal}
                        onChange={(e) => setIsInternal(e.target.checked)}
                        className="w-3 h-3 accent-amber-500"
                      />
                      Interno
                    </label>
                  )}
                  <div className="ml-auto">
                    <Button type="submit" size="sm" loading={commentLoading} disabled={!comment.trim()}>
                      Comentar
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* ── Modais ─────────────────────────────────────────────────────────── */}
      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Devolver para correção"
        subtitle="O autor receberá o motivo e poderá corrigir."
        size="md"
        actions={[
          { label: 'Cancelar', variant: 'secondary', onClick: () => setRejectOpen(false) },
          { label: 'Devolver', variant: 'danger',    onClick: handleReject, loading: rejectLoading },
        ]}
      >
        <div className="space-y-3">
          {rejectError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{rejectError}</div>}
          <Textarea
            label="Motivo da devolução"
            required rows={4}
            placeholder="Explique o que precisa ser corrigido..."
            value={rejectionNote}
            onChange={(e) => setRejectionNote(e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Excluir relatório"
        subtitle="Esta ação não pode ser desfeita."
        size="sm"
        actions={[
          { label: 'Cancelar', variant: 'secondary', onClick: () => setDeleteOpen(false) },
          { label: 'Excluir',  variant: 'danger',    onClick: handleDelete, loading: deleteLoading },
        ]}
      >
        <p className="text-sm text-gray-600">
          Deseja excluir o <strong>{entry.reportNumber ?? 'RDO'}</strong> de <strong>{fmtDateShort(entry.date)}</strong>?
          Etapas, ocorrências e registros de chuva associados serão removidos.
        </p>
      </Modal>
    </div>
  )
}

// ─── Componentes auxiliares ───────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">{title}</h3>
      {children}
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">{label}</dt>
      <dd className="text-sm font-medium text-gray-800">{value}</dd>
    </div>
  )
}
