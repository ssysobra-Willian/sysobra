'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, RefreshCw, AlertTriangle, CheckCircle, Loader2,
  RotateCcw, FileText, Package, Wrench, Check, ChevronRight,
  ShieldAlert, X,
} from 'lucide-react'

// ─── API ─────────────────────────────────────────────────────────────────────

const API     = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const token   = () => typeof window !== 'undefined' ? (localStorage.getItem('token')     ?? '') : ''
const company = () => typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : ''

function apiFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type':  'application/json',
      Authorization:   `Bearer ${token()}`,
      'x-company-id':  company(),
      ...(opts.headers ?? {}),
    },
  })
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const RESOLUTION_OPTIONS = [
  {
    value: 'RETURN_TO_STOCK',
    Icon:  RotateCcw,
    color: '#16A34A',
    bg:    '#DCFCE7',
    borderActive: '#16A34A',
    title: 'Devolver ao estoque',
    desc:  'O item não foi enviado. Quantidade volta para o estoque.',
  },
  {
    value: 'LOSS',
    Icon:  FileText,
    color: '#D97706',
    bg:    '#FEF3C7',
    borderActive: '#D97706',
    title: 'Declarar prejuízo',
    desc:  'Item perdido ou danificado. Registrar como prejuízo.',
  },
  {
    value: 'THEFT',
    Icon:  ShieldAlert,
    color: '#DC2626',
    bg:    '#FEE2E2',
    borderActive: '#DC2626',
    title: 'Declarar extravio',
    desc:  'Item extraviado no transporte. Registrar como extravio.',
  },
]

const CAT_LABELS: Record<string, string> = {
  MATERIAL:    'Material',
  TOOL:        'Ferramenta',
  EPI_UNIFORM: 'EPI/Uniforme',
}
const TYPE_LABELS: Record<string, string> = {
  MISSING_ITEM:        '📦 Item faltando',
  DAMAGED:             '❌ Item danificado',
  QUANTITY_DIVERGENCE: '⚠️ Qtd. divergente',
  OTHER:               'Outro',
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR')
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function PendenciasPage() {
  const router = useRouter()

  const [pendencies,    setPendencies]   = useState<any[]>([])
  const [loading,       setLoading]      = useState(true)
  const [total,         setTotal]        = useState(0)
  const [statusFilter,  setStatusFilter] = useState('OPEN')

  // Modal de resolução
  const [resolving,       setResolving]       = useState<any>(null)
  const [resolution,      setResolution]      = useState('')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [saving,          setSaving]          = useState(false)
  const [saveError,       setSaveError]       = useState('')

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiFetch(`/api/v1/waybill/pendencies?status=${statusFilter}`)
      if (r.ok) {
        const d = await r.json()
        setPendencies(d.pendencies ?? [])
        setTotal(d.total ?? 0)
      }
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  // ── Resolver ───────────────────────────────────────────────────────────────
  async function handleResolve() {
    if (!resolving || !resolution) return
    setSaving(true)
    setSaveError('')
    try {
      const r = await apiFetch(`/api/v1/waybill/pendencies/${resolving.id}/resolve`, {
        method: 'PATCH',
        body:   JSON.stringify({ resolution, notes: resolutionNotes }),
      })
      if (!r.ok) {
        const d = await r.json()
        throw new Error(d.error ?? 'Erro ao resolver')
      }
      closeModal()
      load()
    } catch (e: any) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function closeModal() {
    setResolving(null)
    setResolution('')
    setResolutionNotes('')
    setSaveError('')
  }

  const pendingQty = resolving
    ? Number(resolving.quantityExpected ?? 0) - Number(resolving.quantityReceived ?? 0)
    : 0

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB' }}>

      {/* Header */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #E5E7EB',
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12,
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <button
          onClick={() => router.push('/app/deposito')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: '1px solid #E5E7EB', borderRadius: 8,
            padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: '#374151',
          }}
        >
          <ArrowLeft size={14} />
          Depósito
        </button>

        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Pendências do Depósito</h1>
          <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
            Divergências identificadas no recebimento de romaneios
          </p>
        </div>

        {total > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 8,
            background: '#FEE2E2', border: '1px solid #FECACA',
            fontSize: 12, fontWeight: 700, color: '#DC2626',
          }}>
            <AlertTriangle size={14} />
            {total} em aberto
          </div>
        )}

        <button
          onClick={load}
          style={{ padding: '7px', border: '1px solid #E5E7EB', borderRadius: 8, background: 'none', cursor: 'pointer' }}
          title="Recarregar"
        >
          <RefreshCw size={15} style={{ color: '#6B7280' }} />
        </button>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 16px' }}>

        {/* Filtro de status */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { value: 'OPEN',     label: '⚠️ Em aberto'  },
            { value: 'RESOLVED', label: '✅ Resolvidas'  },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              style={{
                padding: '7px 16px', borderRadius: 8, fontSize: 13,
                border:     `2px solid ${statusFilter === opt.value ? '#F5A623' : '#E5E7EB'}`,
                background:  statusFilter === opt.value ? '#FEF3DC' : '#fff',
                fontWeight:  statusFilter === opt.value ? 700 : 400,
                color:       statusFilter === opt.value ? '#92400E' : '#374151',
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <Loader2 size={28} style={{ color: '#F5A623', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : pendencies.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB',
          }}>
            <CheckCircle size={48} style={{ color: '#16A34A', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
              {statusFilter === 'OPEN' ? 'Nenhuma pendência em aberto!' : 'Nenhuma pendência resolvida'}
            </p>
            <p style={{ fontSize: 13, color: '#9CA3AF' }}>
              {statusFilter === 'OPEN' ? 'Todos os romaneios foram recebidos corretamente.' : ''}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendencies.map(pd => {
              const qty  = Number(pd.quantityExpected ?? 0) - Number(pd.quantityReceived ?? 0)
              const open = pd.status === 'OPEN'
              return (
                <div key={pd.id} style={{
                  background: '#fff',
                  border:     `1px solid ${open ? '#FECACA' : '#E5E7EB'}`,
                  borderLeft: `4px solid ${open ? '#DC2626' : '#16A34A'}`,
                  borderRadius: 10, padding: '14px 16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>

                      {/* Romaneio + local */}
                      <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>
                        Romaneio: <strong>{pd.waybill?.docNumber}</strong>
                        {' · '}
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                          background: '#F3F4F6', color: '#374151',
                        }}>
                          {CAT_LABELS[pd.waybill?.category] ?? pd.waybill?.category}
                        </span>
                        {' · '}
                        {pd.waybill?.location?.name}
                        {pd.waybill?.destinationProject?.name && (
                          <> → <strong>{pd.waybill.destinationProject.name}</strong></>
                        )}
                      </div>

                      {/* Item */}
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 6 }}>
                        {pd.waybillItem?.item?.name ?? pd.itemName}
                      </div>

                      {/* Divergência */}
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: '#374151' }}>
                          Enviado: <strong>{pd.quantityExpected} {pd.waybillItem?.item?.unit}</strong>
                        </span>
                        <span style={{ fontSize: 12, color: '#DC2626' }}>
                          Recebido: <strong>{pd.quantityReceived} {pd.waybillItem?.item?.unit}</strong>
                        </span>
                        {qty > 0 && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 99,
                            background: '#FEE2E2', color: '#DC2626',
                          }}>
                            ⚠️ Diferença: {qty} {pd.waybillItem?.item?.unit}
                          </span>
                        )}
                      </div>

                      {/* Tipo + data */}
                      <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                        {TYPE_LABELS[pd.type] ?? pd.type}
                        {' · '}
                        {fmtDate(pd.createdAt)}
                      </div>

                      {/* Notas de resolução (se resolvida) */}
                      {pd.resolutionNotes && (
                        <div style={{
                          marginTop: 6, padding: '6px 10px',
                          background: '#F0FDF4', borderRadius: 6,
                          fontSize: 11, color: '#166534',
                          border: '1px solid #BBF7D0',
                        }}>
                          {pd.resolutionNotes}
                        </div>
                      )}
                    </div>

                    {/* Ação */}
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      {open ? (
                        <button
                          onClick={() => setResolving(pd)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 14px', borderRadius: 8,
                            background: '#F5A623', border: 'none',
                            fontWeight: 600, fontSize: 12, cursor: 'pointer',
                            color: '#fff',
                          }}
                        >
                          <Wrench size={13} />
                          Tratar
                        </button>
                      ) : (
                        <span style={{
                          fontSize: 11, padding: '3px 10px', borderRadius: 99,
                          background: '#DCFCE7', color: '#16A34A', fontWeight: 700,
                        }}>
                          ✅ Resolvida
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal de resolução */}
      {resolving && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 24,
            maxWidth: 520, width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            {/* Header do modal */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Tratar pendência</h3>
                <p style={{ fontSize: 12, color: '#6B7280' }}>
                  {resolving.waybill?.docNumber}
                  {' · '}
                  <strong>{resolving.waybillItem?.item?.name ?? resolving.itemName}</strong>
                  {pendingQty > 0 && (
                    <> · Diferença: <strong style={{ color: '#DC2626' }}>
                      {pendingQty} {resolving.waybillItem?.item?.unit}
                    </strong></>
                  )}
                </p>
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* Opções de resolução */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {RESOLUTION_OPTIONS.map(opt => {
                const selected = resolution === opt.value
                const { Icon } = opt
                return (
                  <div
                    key={opt.value}
                    onClick={() => setResolution(opt.value)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                      border: `2px solid ${selected ? opt.borderActive : '#E5E7EB'}`,
                      background: selected ? opt.bg : '#F9FAFB',
                      transition: 'all 0.1s',
                    }}
                  >
                    <div style={{
                      width: 38, height: 38, borderRadius: 9,
                      background: opt.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Icon size={18} style={{ color: opt.color }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: selected ? opt.color : '#111827' }}>
                        {opt.title}
                      </div>
                      <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>
                        {opt.desc}
                      </div>
                    </div>
                    {selected && <Check size={16} style={{ color: opt.color, flexShrink: 0 }} />}
                  </div>
                )
              })}
            </div>

            {/* Observações */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5, color: '#374151' }}>
                Observações
              </label>
              <textarea
                value={resolutionNotes}
                onChange={e => setResolutionNotes(e.target.value)}
                placeholder="Detalhe o motivo da resolução..."
                rows={3}
                style={{
                  width: '100%', padding: '8px 12px',
                  border: '1px solid #D1D5DB', borderRadius: 8,
                  fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {saveError && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#FEF2F2', borderRadius: 6, fontSize: 12, color: '#DC2626' }}>
                ❌ {saveError}
              </div>
            )}

            {/* Botões */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={closeModal}
                style={{
                  flex: 1, padding: '10px', borderRadius: 8,
                  border: '1px solid #D1D5DB', background: 'transparent',
                  cursor: 'pointer', fontSize: 13,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleResolve}
                disabled={!resolution || saving}
                style={{
                  flex: 2, padding: '10px', borderRadius: 8,
                  background: !resolution || saving ? '#D1D5DB' : '#F5A623',
                  border: 'none', fontWeight: 700, fontSize: 14, color: '#fff',
                  cursor: !resolution || saving ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {saving
                  ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Salvando...</>
                  : <><Check size={15} /> Confirmar resolução</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
