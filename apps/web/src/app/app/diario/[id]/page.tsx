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
  id:           string
  date:         string
  weather:      string | null
  temperature:  string | null
  workers:      number | null
  activities:   string | null
  observations: string | null
  imageUrls:    string[]
  status:       'PENDING' | 'APPROVED' | 'REJECTED'
  rejectionNote:string | null
  approvedAt:   string | null
  author:       { id: string; name: string; avatarUrl: string | null }
  approvedBy:   { id: string; name: string } | null
  project:      { id: string; name: string }
  comments:     DiaryComment[]
  createdAt:    string
  updatedAt:    string
}

// ─── Labels ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  PENDING:  { label: 'Aguardando aprovação', variant: 'yellow' },
  APPROVED: { label: 'Aprovado',             variant: 'green'  },
  REJECTED: { label: 'Devolvido',            variant: 'red'    },
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function DiarioDetailPage() {
  const router  = useRouter()
  const params  = useParams()
  const entryId = params.id as string
  const userId  = typeof window !== 'undefined' ? localStorage.getItem('userId') : null

  const { canAccessModule, can, isExternal, isClient } = usePermissions()

  const [entry,         setEntry]         = useState<DiaryEntry | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState('')
  const [actionMsg,     setActionMsg]     = useState('')

  // Modais
  const [rejectOpen,      setRejectOpen]      = useState(false)
  const [rejectionNote,   setRejectionNote]   = useState('')
  const [rejectLoading,   setRejectLoading]   = useState(false)
  const [rejectError,     setRejectError]     = useState('')

  const [deleteOpen,      setDeleteOpen]      = useState(false)
  const [deleteLoading,   setDeleteLoading]   = useState(false)

  // Comentários
  const [comment,         setComment]         = useState('')
  const [isInternal,      setIsInternal]      = useState(false)
  const [commentLoading,  setCommentLoading]  = useState(false)
  const [commentError,    setCommentError]    = useState('')
  const commentsEndRef = useRef<HTMLDivElement>(null)

  // Verifica acesso
  if (!canAccessModule('diario_obra')) {
    return <SemAcesso modulo="Diário de Obra" />
  }

  // ── Permissões ─────────────────────────────────────────────────────────────

  const canEdit    = can('diario_obra', 'edit')
  const canDelete  = can('diario_obra', 'delete')
  const canApprove = can('diario_obra', 'approve')
  const canComment = can('diario_obra', 'comment')

  // ── Carrega entrada ────────────────────────────────────────────────────────

  const loadEntry = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) { router.replace('/login'); return }

    setLoading(true)
    setError('')
    try {
      const res  = await fetch(`${API}/api/v1/diary/entries/${entryId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar registro')
      setEntry(data.entry)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [entryId, router])

  useEffect(() => { loadEntry() }, [loadEntry])

  // ── Helpers ────────────────────────────────────────────────────────────────

  function flash(msg: string) {
    setActionMsg(msg)
    setTimeout(() => setActionMsg(''), 3500)
  }

  function getToken() {
    return localStorage.getItem('token') || ''
  }

  // ── Aprovar ────────────────────────────────────────────────────────────────

  async function handleApprove() {
    try {
      const res = await fetch(`${API}/api/v1/diary/entries/${entryId}/approve`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      flash('Registro aprovado com sucesso!')
      loadEntry()
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Erro ao aprovar.')
    }
  }

  // ── Rejeitar ───────────────────────────────────────────────────────────────

  async function handleReject() {
    if (!rejectionNote.trim()) { setRejectError('Informe o motivo da devolução.'); return }
    setRejectLoading(true)
    setRejectError('')
    try {
      const res = await fetch(`${API}/api/v1/diary/entries/${entryId}/reject`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body:    JSON.stringify({ rejectionNote }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRejectOpen(false)
      setRejectionNote('')
      flash('Registro devolvido para correção.')
      loadEntry()
    } catch (err: unknown) {
      setRejectError(err instanceof Error ? err.message : 'Erro ao devolver.')
    } finally {
      setRejectLoading(false)
    }
  }

  // ── Excluir ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    setDeleteLoading(true)
    try {
      const res = await fetch(`${API}/api/v1/diary/entries/${entryId}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.replace('/app/diario')
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Erro ao excluir.')
      setDeleteOpen(false)
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Comentar ───────────────────────────────────────────────────────────────

  async function handleComment(e: React.FormEvent) {
    e.preventDefault()
    if (!comment.trim()) return
    setCommentLoading(true)
    setCommentError('')
    try {
      const res = await fetch(`${API}/api/v1/diary/entries/${entryId}/comments`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body:    JSON.stringify({ content: comment.trim(), isInternal }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setComment('')
      setIsInternal(false)
      loadEntry()
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 300)
    } catch (err: unknown) {
      setCommentError(err instanceof Error ? err.message : 'Erro ao comentar.')
    } finally {
      setCommentLoading(false)
    }
  }

  // ── Excluir comentário ─────────────────────────────────────────────────────

  async function handleDeleteComment(commentId: string) {
    if (!confirm('Excluir este comentário?')) return
    try {
      await fetch(`${API}/api/v1/diary/comments/${commentId}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      loadEntry()
    } catch {
      flash('Erro ao excluir comentário.')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

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
        <p className="text-red-600 text-sm">{error || 'Registro não encontrado.'}</p>
        <Link href="/app/diario" className="text-sm text-[#F5A623] hover:underline mt-2 inline-block">
          ← Voltar ao diário
        </Link>
      </div>
    )
  }

  const status       = STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.PENDING
  const isOwnEntry   = entry.author.id === userId
  const isPending    = entry.status === 'PENDING'
  const isApproved   = entry.status === 'APPROVED'

  return (
    <div>
      <PageHeader
        title={`Registro — ${fmtDate(entry.date)}`}
        subtitle={entry.project.name}
        breadcrumb={['Diário de Obra', entry.project.name]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Editar — autor ou com permissão edit, se PENDING */}
            {canEdit && (isOwnEntry || !isApproved) && isPending && (
              <Link href={`/app/diario/${entry.id}/editar`}>
                <Button variant="secondary" size="sm">Editar</Button>
              </Link>
            )}
            {/* Aprovar / Devolver — quem tem permissão approve, se PENDING */}
            {canApprove && isPending && (
              <>
                <Button size="sm" onClick={handleApprove}>
                  ✓ Aprovar
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => { setRejectionNote(''); setRejectError(''); setRejectOpen(true) }}
                >
                  ↩ Devolver
                </Button>
              </>
            )}
            {/* Excluir */}
            {canDelete && (isOwnEntry || can('diario_obra', 'delete')) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteOpen(true)}
                className="text-red-500 hover:text-red-600"
              >
                Excluir
              </Button>
            )}
          </div>
        }
      />

      {/* Feedback global */}
      {actionMsg && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          {actionMsg}
        </div>
      )}

      {/* Banner de status */}
      <div
        className={`mb-5 p-4 rounded-xl border flex items-start gap-3 ${
          entry.status === 'APPROVED'
            ? 'bg-green-50 border-green-200'
            : entry.status === 'REJECTED'
            ? 'bg-red-50 border-red-200'
            : 'bg-amber-50 border-amber-200'
        }`}
      >
        <Badge variant={status.variant} size="md">{status.label}</Badge>
        <div className="flex-1 min-w-0">
          {entry.status === 'APPROVED' && entry.approvedBy && (
            <p className="text-sm text-green-700">
              Aprovado por <strong>{entry.approvedBy.name}</strong>
              {entry.approvedAt && ` em ${fmtDateTime(entry.approvedAt)}`}
            </p>
          )}
          {entry.status === 'REJECTED' && entry.rejectionNote && (
            <div>
              <p className="text-sm font-semibold text-red-700 mb-1">Motivo da devolução:</p>
              <p className="text-sm text-red-600">{entry.rejectionNote}</p>
              {canEdit && (
                <Link href={`/app/diario/${entry.id}/editar`}>
                  <span className="text-xs text-red-700 font-semibold hover:underline cursor-pointer mt-1 inline-block">
                    → Corrigir e reenviar
                  </span>
                </Link>
              )}
            </div>
          )}
          {entry.status === 'PENDING' && (
            <p className="text-sm text-amber-700">
              Aguardando revisão de um gestor.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Dados do registro ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Informações gerais */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Informações gerais</h3>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <dt className="text-xs text-gray-400 uppercase tracking-wider mb-1">Autor</dt>
                <dd className="text-sm font-medium text-gray-800">{entry.author.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400 uppercase tracking-wider mb-1">Registrado em</dt>
                <dd className="text-sm text-gray-700">{fmtDateTime(entry.createdAt)}</dd>
              </div>
              {!isExternal && !isClient && (
                <>
                  {entry.weather && (
                    <div>
                      <dt className="text-xs text-gray-400 uppercase tracking-wider mb-1">Clima</dt>
                      <dd className="text-sm text-gray-700">{entry.weather}</dd>
                    </div>
                  )}
                  {entry.temperature !== null && (
                    <div>
                      <dt className="text-xs text-gray-400 uppercase tracking-wider mb-1">Temperatura</dt>
                      <dd className="text-sm text-gray-700">{Number(entry.temperature).toFixed(1)}°C</dd>
                    </div>
                  )}
                  {entry.workers !== null && (
                    <div>
                      <dt className="text-xs text-gray-400 uppercase tracking-wider mb-1">Trabalhadores</dt>
                      <dd className="text-sm text-gray-700">{entry.workers}</dd>
                    </div>
                  )}
                </>
              )}
            </dl>
          </div>

          {/* Atividades */}
          {entry.activities && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Atividades realizadas</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {entry.activities}
              </p>
            </div>
          )}

          {/* Observações */}
          {entry.observations && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Observações</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {entry.observations}
              </p>
            </div>
          )}

          {/* Fotos */}
          {entry.imageUrls && entry.imageUrls.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Fotos ({entry.imageUrls.length})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {entry.imageUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img
                      src={url}
                      alt={`Foto ${i + 1}`}
                      className="w-full h-32 object-cover rounded-xl border border-gray-200 hover:opacity-90 transition-opacity"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Comentários ── */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col h-full">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">
                Comentários ({entry.comments.length})
              </h3>
              {!isExternal && !isClient && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Comentários internos são visíveis apenas pela equipe.
                </p>
              )}
            </div>

            {/* Lista de comentários */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[400px]">
              {entry.comments.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">
                  Sem comentários ainda.
                </p>
              ) : (
                entry.comments.map((c) => {
                  const isOwn  = c.author.id === userId
                  const isCInt = c.isInternal

                  return (
                    <div
                      key={c.id}
                      className={`rounded-xl p-3 text-sm ${
                        isCInt
                          ? 'bg-amber-50 border border-amber-200'
                          : 'bg-gray-50 border border-gray-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-gray-800 text-xs">
                            {c.authorName}
                          </span>
                          {isCInt && (
                            <Badge variant="yellow" size="sm">Interno</Badge>
                          )}
                          {c.authorType === 'EXTERNAL' && (
                            <Badge variant="teal" size="sm">Externo</Badge>
                          )}
                          {c.authorType === 'CLIENT' && (
                            <Badge variant="green" size="sm">Cliente</Badge>
                          )}
                        </div>
                        {isOwn && (
                          <button
                            onClick={() => handleDeleteComment(c.id)}
                            className="text-[10px] text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <p className="text-gray-700 leading-relaxed">{c.content}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{fmtDateTime(c.createdAt)}</p>
                    </div>
                  )
                })
              )}
              <div ref={commentsEndRef} />
            </div>

            {/* Formulário de comentário */}
            {canComment && (
              <form onSubmit={handleComment} className="border-t border-gray-100 p-4 space-y-2">
                {commentError && (
                  <p className="text-xs text-red-600">{commentError}</p>
                )}
                <Textarea
                  placeholder="Escreva um comentário..."
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={commentLoading}
                />
                <div className="flex items-center justify-between gap-2">
                  {/* Toggle interno — só para INTERNAL */}
                  {!isExternal && !isClient && (
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-500">
                      <input
                        type="checkbox"
                        checked={isInternal}
                        onChange={(e) => setIsInternal(e.target.checked)}
                        className="w-3 h-3 accent-amber-500"
                      />
                      Interno (oculto para externos/clientes)
                    </label>
                  )}
                  <div className="ml-auto">
                    <Button
                      type="submit"
                      size="sm"
                      loading={commentLoading}
                      disabled={!comment.trim()}
                    >
                      Comentar
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal: Devolver ──────────────────────────────────────────────── */}
      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Devolver registro para correção"
        subtitle="O autor receberá o motivo e poderá corrigir e reenviar."
        size="md"
        actions={[
          { label: 'Cancelar', variant: 'secondary', onClick: () => setRejectOpen(false) },
          { label: 'Devolver', variant: 'danger', onClick: handleReject, loading: rejectLoading },
        ]}
      >
        <div className="space-y-3">
          {rejectError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {rejectError}
            </div>
          )}
          <Textarea
            label="Motivo da devolução"
            required
            rows={4}
            placeholder="Explique o que precisa ser corrigido..."
            value={rejectionNote}
            onChange={(e) => setRejectionNote(e.target.value)}
          />
        </div>
      </Modal>

      {/* ── Modal: Excluir ───────────────────────────────────────────────── */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Excluir registro"
        subtitle="Esta ação não pode ser desfeita."
        size="sm"
        actions={[
          { label: 'Cancelar', variant: 'secondary', onClick: () => setDeleteOpen(false) },
          { label: 'Excluir', variant: 'danger', onClick: handleDelete, loading: deleteLoading },
        ]}
      >
        <p className="text-sm text-gray-600">
          Tem certeza que deseja excluir o registro de <strong>{fmtDate(entry.date)}</strong>?
          Todos os comentários associados também serão removidos.
        </p>
      </Modal>
    </div>
  )
}
