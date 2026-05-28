'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, RefreshCw, Plus, FileText, Loader2, ChevronDown, ChevronUp,
  Copy, Check, Link2, Download, X, Package, Wrench, ShieldCheck, Truck,
  User, MapPin, Calendar, AlertTriangle, ClipboardList,
} from 'lucide-react'
import { SignaturePad } from '@/components/deposit/SignaturePad'
import { useAuthenticatedPdf } from '@/hooks/useAuthenticatedPdf'
import WaybillModal from '../components/WaybillModal'

// ─── API helpers ─────────────────────────────────────────────────────────────

const API     = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const token   = () => typeof window !== 'undefined' ? (localStorage.getItem('token')     ?? '') : ''
const company = () => typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : ''

function apiFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token()}`,
      'x-company-id': company(),
      ...(opts.headers ?? {}),
    },
  })
}

// ─── constantes ──────────────────────────────────────────────────────────────

const CAT_TABS = [
  { value: '',            label: 'Todos',         icon: ClipboardList },
  { value: 'MATERIAL',    label: 'Materiais',     icon: Package       },
  { value: 'TOOL',        label: 'Ferramentário', icon: Wrench        },
  { value: 'EPI_UNIFORM', label: 'EPIs',          icon: ShieldCheck   },
]

const STATUS_PILLS = [
  { value: '',           label: 'Todos'      },
  { value: 'DRAFT',      label: 'Rascunho'   },
  { value: 'IN_TRANSIT', label: 'Em Trânsito'},
  { value: 'COMPLETED',  label: 'Concluído'  },
  { value: 'CANCELLED',  label: 'Cancelado'  },
]

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  DRAFT:      { bg: '#F3F4F6', text: '#374151',  label: 'Rascunho'    },
  EMITTED:    { bg: '#FEF3C7', text: '#92400E',  label: 'Emitido'     },
  IN_TRANSIT: { bg: '#DBEAFE', text: '#1E40AF',  label: 'Em Trânsito' },
  COMPLETED:  { bg: '#DCFCE7', text: '#166534',  label: 'Concluído'   },
  CANCELLED:  { bg: '#FEE2E2', text: '#991B1B',  label: 'Cancelado'   },
}

const CAT_COLORS: Record<string, { bg: string; text: string }> = {
  MATERIAL:    { bg: '#DBEAFE', text: '#1E40AF' },
  TOOL:        { bg: '#F3E8FF', text: '#6B21A8' },
  EPI_UNIFORM: { bg: '#FEF3C7', text: '#92400E' },
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR')
}

function fmtQty(n: any) {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
}

// ─── tipos ────────────────────────────────────────────────────────────────────

interface WaybillItem {
  id:            string
  itemId:        string
  requestedQty:  number
  receivedQty:   number | null
  unitCost:      number
  totalCost:     number
  serialNumber:  string | null
  toolBrand:     string | null
  toolModel:     string | null
  toolCondition: string | null
  status:        string
  item:          { id: string; name: string; unit: string; category: string }
}

interface Waybill {
  id:                 string
  docNumber:          string
  category:           string
  status:             string
  exitType:           string
  locationId:         string
  destinationName:    string | null
  driverName:         string | null
  driverPhone:        string | null
  vehiclePlate:       string | null
  vehicleModel:       string | null
  receiverName:       string | null
  receiverDocument:   string | null
  senderName:         string | null
  notes:              string | null
  hasPendency:        boolean
  signatureToken:     string | null
  emittedAt:          string | null
  dispatchedAt:       string | null
  receivedAt:         string | null
  createdAt:          string
  location:           { id: string; name: string; type: string }
  destinationProject: { id: string; name: string } | null
  driverEmployee:     { id: string; name: string } | null
  receiverEmployee:   { id: string; name: string } | null
  items:              WaybillItem[]
  pendencies:         any[]
}

interface Location {
  id:      string
  name:    string
  type:    string
  isActive:boolean
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { bg: '#F3F4F6', text: '#374151', label: status }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.text,
    }}>
      {s.label}
    </span>
  )
}

// ─── CopyButton ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={handleCopy}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '7px 12px', borderRadius: 8, fontSize: 12,
        border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer',
        color: copied ? '#16A34A' : '#374151',
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copiado!' : 'Copiar link'}
    </button>
  )
}

// ─── WaybillCard ─────────────────────────────────────────────────────────────

function WaybillCard({
  waybill,
  onSign,
  onGenerateLink,
  onCancel,
  onPdf,
  pdfLoading,
}: {
  waybill:          Waybill
  onSign:           (w: Waybill) => void
  onGenerateLink:   (w: Waybill) => void
  onCancel:         (w: Waybill) => void
  onPdf:            (w: Waybill) => void
  pdfLoading:       boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const cat = CAT_COLORS[waybill.category] ?? { bg: '#F3F4F6', text: '#374151' }

  const canSign        = ['IN_TRANSIT', 'EMITTED'].includes(waybill.status)
  const canLink        = waybill.status === 'IN_TRANSIT' && waybill.exitType === 'DRIVER_DELIVERY'
  const canCancel      = !['COMPLETED', 'CANCELLED'].includes(waybill.status)
  const receiverName   = waybill.receiverName ?? waybill.receiverEmployee?.name
  const driverDisplay  = waybill.driverName ?? waybill.driverEmployee?.name

  return (
    <div style={{
      background: '#fff', borderRadius: 12,
      border: `1px solid ${waybill.hasPendency ? '#FCA5A5' : '#E5E7EB'}`,
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden',
    }}>
      {/* Header do card */}
      <div style={{
        padding: '14px 18px',
        display: 'flex', flexWrap: 'wrap', gap: 10,
        alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          <span style={{
            fontFamily: 'monospace', fontSize: 15, fontWeight: 800, color: '#111827',
          }}>{waybill.docNumber}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px',
            borderRadius: 99, background: cat.bg, color: cat.text,
          }}>
            {waybill.category === 'MATERIAL' ? 'MATERIAL' : waybill.category === 'TOOL' ? 'FERRAMENTA' : 'EPI'}
          </span>
          <StatusBadge status={waybill.status} />
          {waybill.hasPendency && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px',
              borderRadius: 99, background: '#FEE2E2', color: '#991B1B',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <AlertTriangle size={9} />
              Pendência
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>
          {fmtDate(waybill.emittedAt ?? waybill.createdAt)}
        </div>
      </div>

      {/* Detalhes */}
      <div style={{ padding: '0 18px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <MapPin size={12} style={{ color: '#9CA3AF', marginTop: 3, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>ALMOXARIFADO</div>
            <div style={{ fontSize: 12, color: '#374151' }}>{waybill.location?.name ?? '—'}</div>
          </div>
        </div>
        {(waybill.destinationProject || waybill.destinationName) && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <MapPin size={12} style={{ color: '#9CA3AF', marginTop: 3, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>DESTINO</div>
              <div style={{ fontSize: 12, color: '#374151' }}>
                {waybill.destinationProject?.name ?? waybill.destinationName}
              </div>
            </div>
          </div>
        )}
        {driverDisplay && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <Truck size={12} style={{ color: '#9CA3AF', marginTop: 3, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>MOTORISTA</div>
              <div style={{ fontSize: 12, color: '#374151' }}>
                {driverDisplay}{waybill.vehiclePlate && ` — ${waybill.vehiclePlate}`}
              </div>
            </div>
          </div>
        )}
        {receiverName && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <User size={12} style={{ color: '#9CA3AF', marginTop: 3, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>RECEBEDOR</div>
              <div style={{ fontSize: 12, color: '#374151' }}>{receiverName}</div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <Package size={12} style={{ color: '#9CA3AF', marginTop: 3, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>ITENS</div>
            <div style={{ fontSize: 12, color: '#374151' }}>
              {waybill.items.length} tipo{waybill.items.length !== 1 ? 's' : ''} ·{' '}
              {waybill.items.reduce((s, i) => s + Number(i.requestedQty), 0).toLocaleString('pt-BR')} un.
            </div>
          </div>
        </div>
        {waybill.senderName && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <User size={12} style={{ color: '#9CA3AF', marginTop: 3, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>EXPEDIDOR</div>
              <div style={{ fontSize: 12, color: '#374151' }}>{waybill.senderName}</div>
            </div>
          </div>
        )}
      </div>

      {/* Itens expansíveis */}
      <div style={{ borderTop: '1px solid #F3F4F6' }}>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            width: '100%', padding: '10px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: '#6B7280', fontWeight: 500,
          }}
        >
          <span>Ver itens ({waybill.items.length})</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {expanded && (
          <div style={{ borderTop: '1px solid #F3F4F6', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: '#6B7280' }}>Item</th>
                  <th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600, color: '#6B7280', width: 80 }}>Qtd. Sol.</th>
                  <th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600, color: '#6B7280', width: 80 }}>Qtd. Rec.</th>
                  <th style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 600, color: '#6B7280', width: 90 }}>Status</th>
                  <th style={{ padding: '8px 14px', fontWeight: 600, color: '#6B7280', width: 110 }}>Nº Série</th>
                </tr>
              </thead>
              <tbody>
                {waybill.items.map((item, i) => (
                  <tr key={item.id} style={{ borderTop: '1px solid #F3F4F6', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={{ padding: '8px 14px', color: '#374151', fontWeight: 500 }}>{item.item.name}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: '#374151' }}>
                      {fmtQty(item.requestedQty)} {item.item.unit}
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: item.receivedQty !== null && Number(item.receivedQty) < Number(item.requestedQty) ? '#D97706' : '#374151' }}>
                      {item.receivedQty !== null ? `${fmtQty(item.receivedQty)} ${item.item.unit}` : '—'}
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                        background: item.status === 'OK' ? '#DCFCE7' : item.status === 'DAMAGED' ? '#FEE2E2' : '#FEF3C7',
                        color: item.status === 'OK' ? '#166534' : item.status === 'DAMAGED' ? '#991B1B' : '#92400E',
                      }}>
                        {item.status === 'OK' ? '✓ OK' : item.status === 'DAMAGED' ? 'Danif.' : 'Falt.'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 14px', color: '#9CA3AF', fontSize: 11 }}>
                      {item.serialNumber ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ações */}
      <div style={{
        padding: '10px 18px', borderTop: '1px solid #F3F4F6',
        display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
      }}>
        {canSign && (
          <button
            onClick={() => onSign(waybill)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: '#111827', color: '#fff', border: 'none', cursor: 'pointer',
            }}
          >
            ✍ Assinar recebimento
          </button>
        )}
        {canLink && (
          <button
            onClick={() => onGenerateLink(waybill)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 12px', borderRadius: 8, fontSize: 12,
              border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer', color: '#374151',
            }}
          >
            <Link2 size={13} />
            Link de assinatura
          </button>
        )}
        <button
          onClick={() => onPdf(waybill)}
          disabled={pdfLoading}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '7px 12px', borderRadius: 8, fontSize: 12,
            border: '1px solid #D1D5DB', background: '#fff',
            cursor: pdfLoading ? 'not-allowed' : 'pointer', color: '#374151',
          }}
        >
          {pdfLoading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          PDF
        </button>
        {canCancel && (
          <button
            onClick={() => onCancel(waybill)}
            style={{
              marginLeft: 'auto',
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 12px', borderRadius: 8, fontSize: 12,
              border: '1px solid #FECACA', background: '#FEF2F2', cursor: 'pointer', color: '#DC2626',
            }}
          >
            <X size={13} />
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
}

// ─── ReceiverSignModal ────────────────────────────────────────────────────────

function ReceiverSignModal({
  waybill,
  onClose,
  onSuccess,
}: {
  waybill:   Waybill
  onClose:   () => void
  onSuccess: () => void
}) {
  const [itemData, setItemData] = useState(
    waybill.items.map(i => ({
      id:          i.id,
      receivedQty: Number(i.requestedQty),
      status:      'OK' as string,
      notes:       '',
    })),
  )
  const [receiverName,     setReceiverName]     = useState(waybill.receiverName ?? waybill.receiverEmployee?.name ?? '')
  const [receiverDocument, setReceiverDocument] = useState(waybill.receiverDocument ?? '')
  const [notes,            setNotes]            = useState('')
  const [signature,        setSignature]        = useState<string | null>(null)
  const [saving,           setSaving]           = useState(false)
  const [error,            setError]            = useState('')

  function updateItem(id: string, field: string, value: any) {
    setItemData(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  async function handleSubmit() {
    if (!signature) { setError('Assinatura obrigatória'); return }
    setSaving(true)
    setError('')
    try {
      const r = await apiFetch(`/api/v1/waybill/${waybill.id}/sign-receiver`, {
        method: 'PATCH',
        body:   JSON.stringify({
          signature,
          items:            itemData,
          notes:            notes             || null,
          receiverName:     receiverName      || null,
          receiverDocument: receiverDocument  || null,
        }),
      })
      if (!r.ok) {
        const d = await r.json()
        throw new Error(d.error ?? 'Erro ao salvar assinatura')
      }
      onSuccess()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16,
        width: '100%', maxWidth: 600,
        maxHeight: '90vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        {/* header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Confirmar recebimento</div>
            <div style={{ fontSize: 12, color: '#6B7280' }}>{waybill.docNumber}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9CA3AF' }}>×</button>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* itens */}
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Confirmar itens recebidos</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {waybill.items.map(item => {
                const row = itemData.find(r => r.id === item.id)!
                return (
                  <div key={item.id} style={{
                    border: '1px solid #E5E7EB', borderRadius: 8, padding: '12px 14px',
                    background: row.status !== 'OK' ? '#FFF7ED' : '#F9FAFB',
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{item.item.name}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>
                          Qtd. solicitada
                        </label>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', padding: '6px 0' }}>
                          {fmtQty(item.requestedQty)} {item.item.unit}
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>
                          Qtd. recebida *
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="number" min="0" max={Number(item.requestedQty)} step="0.001"
                            value={row.receivedQty}
                            onChange={e => updateItem(item.id, 'receivedQty', Math.min(Number(e.target.value), Number(item.requestedQty)))}
                            style={{
                              flex: 1, padding: '6px 8px',
                              border: `1px solid ${row.receivedQty < Number(item.requestedQty) ? '#F59E0B' : '#D1D5DB'}`,
                              borderRadius: 6, fontSize: 14,
                            }}
                          />
                          <span style={{ fontSize: 12, color: '#6B7280' }}>{item.item.unit}</span>
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>Status</label>
                        <select
                          value={row.status}
                          onChange={e => updateItem(item.id, 'status', e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 12 }}
                        >
                          <option value="OK">✅ OK — conforme</option>
                          <option value="DAMAGED">❌ Danificado</option>
                          <option value="MISSING">⚠️ Faltante</option>
                        </select>
                      </div>
                      {(row.status !== 'OK' || row.receivedQty < Number(item.requestedQty)) && (
                        <div>
                          <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>Obs. da divergência</label>
                          <input
                            value={row.notes}
                            onChange={e => updateItem(item.id, 'notes', e.target.value)}
                            placeholder="Descrever..."
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #F59E0B', borderRadius: 6, fontSize: 12 }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* dados do recebedor */}
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Dados do recebedor</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 4 }}>Nome *</label>
                <input
                  value={receiverName}
                  onChange={e => setReceiverName(e.target.value)}
                  placeholder="Nome do recebedor"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 4 }}>Documento</label>
                <input
                  value={receiverDocument}
                  onChange={e => setReceiverDocument(e.target.value)}
                  placeholder="CPF / RG"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 13 }}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 4 }}>Observações gerais</label>
              <textarea
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Observações sobre o recebimento..." rows={2}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>
          </div>

          {/* assinatura */}
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Assinatura do recebedor</h4>
            <SignaturePad
              onSign={setSignature}
              height={140}
              label="Assine aqui para confirmar o recebimento"
            />
            {signature && (
              <div style={{
                marginTop: 8, padding: '8px 12px',
                background: '#F0FDF4', border: '1px solid #BBF7D0',
                borderRadius: 6, fontSize: 12, color: '#166534',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Check size={14} /> Assinatura coletada
              </div>
            )}
          </div>

          {error && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#FEF2F2', borderRadius: 6, fontSize: 12, color: '#DC2626' }}>
              ❌ {error}
            </div>
          )}
        </div>

        {/* footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, border: '1px solid #D1D5DB', background: 'transparent', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!signature || saving}
            style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: signature && !saving ? '#16A34A' : '#D1D5DB',
              border: 'none', color: '#fff',
              cursor: signature && !saving ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {saving && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            {saving ? 'Salvando...' : '✓ Confirmar recebimento'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── SignatureLinkModal ───────────────────────────────────────────────────────

function SignatureLinkModal({
  waybillId,
  docNumber,
  onClose,
}: {
  waybillId:  string
  docNumber:  string
  onClose:    () => void
}) {
  const [loading,  setLoading]  = useState(false)
  const [link,     setLink]     = useState<string | null>(null)
  const [expiresAt,setExpiresAt]= useState<string | null>(null)
  const [error,    setError]    = useState('')

  useEffect(() => {
    setLoading(true)
    apiFetch(`/api/v1/waybill/${waybillId}/signature-link`, { method: 'POST', body: JSON.stringify({}) })
      .then(r => {
        if (!r.ok) return r.json().then(d => { throw new Error(d.error ?? 'Erro') })
        return r.json()
      })
      .then(d => { setLink(d.link); setExpiresAt(d.expiresAt) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [waybillId])

  const whatsapp = link
    ? `https://wa.me/?text=${encodeURIComponent(`Romaneio ${docNumber} aguarda sua assinatura:\n${link}`)}`
    : null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Link de assinatura</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{docNumber}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9CA3AF' }}>×</button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#F5A623', margin: '0 auto' }} />
            <p style={{ fontSize: 13, color: '#6B7280', marginTop: 10 }}>Gerando link...</p>
          </div>
        )}

        {error && (
          <div style={{ padding: '12px 16px', background: '#FEF2F2', borderRadius: 8, fontSize: 13, color: '#DC2626' }}>
            ❌ {error}
          </div>
        )}

        {link && !loading && (
          <>
            <div style={{ padding: '12px 14px', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB', marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>Link para o recebedor:</div>
              <div style={{ fontSize: 12, color: '#374151', wordBreak: 'break-all', lineHeight: 1.6 }}>{link}</div>
              {expiresAt && (
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Calendar size={11} />
                  Válido até {new Date(expiresAt).toLocaleString('pt-BR')}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <CopyButton text={link} />
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: '#25D366', color: '#fff', textDecoration: 'none',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                  Enviar WhatsApp
                </a>
              )}
            </div>

            <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 14, lineHeight: 1.6 }}>
              Compartilhe este link com o recebedor. Ele poderá confirmar os itens e assinar
              diretamente do celular. O link expira em 48 horas.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ─── NewWaybillPicker ─────────────────────────────────────────────────────────

function NewWaybillPicker({
  locations,
  onSelect,
  onClose,
}: {
  locations: Location[]
  onSelect:  (category: 'MATERIAL' | 'TOOL' | 'EPI_UNIFORM', locationId: string, locationName: string) => void
  onClose:   () => void
}) {
  const [category,   setCategory]   = useState<'MATERIAL' | 'TOOL' | 'EPI_UNIFORM'>('MATERIAL')
  const [locationId, setLocationId] = useState(locations.find(l => l.type === 'CENTRAL')?.id ?? (locations[0]?.id ?? ''))

  const activeLocations = locations.filter(l => l.isActive)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Novo Romaneio</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9CA3AF' }}>×</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>Categoria</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { v: 'MATERIAL',    l: 'Materiais',   icon: '📦' },
              { v: 'TOOL',        l: 'Ferram.',      icon: '🔧' },
              { v: 'EPI_UNIFORM', l: 'EPIs',         icon: '🦺' },
            ].map(opt => (
              <button
                key={opt.v}
                onClick={() => setCategory(opt.v as any)}
                style={{
                  padding: '10px 8px', borderRadius: 10, fontSize: 12, cursor: 'pointer',
                  border: `2px solid ${category === opt.v ? '#F5A623' : '#E5E7EB'}`,
                  background: category === opt.v ? '#FEF3DC' : '#F9FAFB',
                  fontWeight: category === opt.v ? 700 : 400,
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 18, marginBottom: 4 }}>{opt.icon}</div>
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>Almoxarifado de origem</label>
          <select
            value={locationId}
            onChange={e => setLocationId(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14 }}
          >
            {activeLocations.map(l => (
              <option key={l.id} value={l.id}>
                {l.type === 'CENTRAL' ? '🏭' : '🏗️'} {l.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => {
            const loc = activeLocations.find(l => l.id === locationId)
            if (!loc || !locationId) return
            onSelect(category, locationId, loc.name)
          }}
          disabled={!locationId}
          style={{
            width: '100%', padding: '11px 16px', borderRadius: 10, fontSize: 14, fontWeight: 700,
            background: locationId ? '#F5A623' : '#D1D5DB', border: 'none',
            color: locationId ? '#fff' : '#9CA3AF', cursor: locationId ? 'pointer' : 'not-allowed',
          }}
        >
          Continuar →
        </button>
      </div>
    </div>
  )
}

// ─── página principal ─────────────────────────────────────────────────────────

export default function RomaneiosPage() {
  const router = useRouter()
  const { downloadPdf, isLoading: isPdfLoading } = useAuthenticatedPdf()

  // filtros
  const [category,   setCategory]   = useState('')
  const [status,     setStatus]     = useState('')

  // dados
  const [waybills,   setWaybills]   = useState<Waybill[]>([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [loading,    setLoading]    = useState(true)
  const [locations,  setLocations]  = useState<Location[]>([])
  const LIMIT = 15

  // modais
  const [signingWaybill,    setSigningWaybill]    = useState<Waybill | null>(null)
  const [linkWaybill,       setLinkWaybill]       = useState<Waybill | null>(null)
  const [newPickerOpen,     setNewPickerOpen]     = useState(false)
  const [waybillModalOpen,  setWaybillModalOpen]  = useState(false)
  const [waybillCategory,   setWaybillCategory]   = useState<'MATERIAL' | 'TOOL' | 'EPI_UNIFORM'>('MATERIAL')
  const [waybillLocationId, setWaybillLocationId] = useState('')
  const [waybillLocationNm, setWaybillLocationNm] = useState('')

  // ── load ─────────────────────────────────────────────────────────────────
  const loadWaybills = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
    if (category) qs.set('category', category)
    if (status)   qs.set('status', status)
    try {
      const [r, locR] = await Promise.all([
        apiFetch(`/api/v1/waybill?${qs}`),
        apiFetch('/api/v1/deposit/locations'),
      ])
      if (r.ok) {
        const d = await r.json()
        setWaybills(d.waybills ?? [])
        setTotal(d.total ?? 0)
      }
      if (locR.ok) {
        const d = await locR.json()
        setLocations(d.locations ?? d.data ?? [])
      }
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [page, category, status])

  useEffect(() => { loadWaybills() }, [loadWaybills])
  useEffect(() => { setPage(1) }, [category, status])

  // ── handlers ─────────────────────────────────────────────────────────────

  async function handleCancel(w: Waybill) {
    const reason = window.prompt(`Motivo do cancelamento de ${w.docNumber}:`)
    if (reason === null) return
    try {
      await apiFetch(`/api/v1/waybill/${w.id}/cancel`, {
        method: 'PATCH',
        body:   JSON.stringify({ reason }),
      })
      loadWaybills()
    } catch { alert('Erro ao cancelar romaneio') }
  }

  function handlePdf(w: Waybill) {
    downloadPdf(
      `/api/v1/waybill/${w.id}/pdf`,
      `romaneio-${w.docNumber}.pdf`,
      true,
    )
  }

  function handlePickerSelect(
    cat: 'MATERIAL' | 'TOOL' | 'EPI_UNIFORM',
    locId: string,
    locName: string,
  ) {
    setNewPickerOpen(false)
    setWaybillCategory(cat)
    setWaybillLocationId(locId)
    setWaybillLocationNm(locName)
    setWaybillModalOpen(true)
  }

  const totalPages = Math.ceil(total / LIMIT)

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB' }}>

      {/* ── Header ── */}
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
          <h1 style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Romaneios</h1>
          <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
            Controle de saídas por romaneio — {total} registro{total !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={loadWaybills}
          style={{ padding: '7px', border: '1px solid #E5E7EB', borderRadius: 8, background: 'none', cursor: 'pointer' }}
          title="Recarregar"
        >
          <RefreshCw size={15} style={{ color: '#6B7280' }} />
        </button>
        <button
          onClick={() => setNewPickerOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: '#F5A623', color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >
          <Plus size={15} />
          <span className="hidden sm:inline">Novo Romaneio</span>
        </button>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>

        {/* ── Filtros ── */}
        <div style={{ marginBottom: 16 }}>
          {/* Category tabs */}
          <div style={{
            display: 'flex', gap: 2, background: '#F3F4F6',
            borderRadius: 10, padding: 4, marginBottom: 12,
          }}>
            {CAT_TABS.map(t => {
              const Icon = t.icon
              return (
                <button
                  key={t.value}
                  onClick={() => setCategory(t.value)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    padding: '7px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                    background: category === t.value ? '#fff' : 'transparent',
                    color: category === t.value ? '#F5A623' : '#6B7280',
                    boxShadow: category === t.value ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <Icon size={13} />
                  <span>{t.label}</span>
                </button>
              )
            })}
          </div>

          {/* Status pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUS_PILLS.map(s => (
              <button
                key={s.value}
                onClick={() => setStatus(s.value)}
                style={{
                  padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                  border: `1px solid ${status === s.value ? '#F5A623' : '#E5E7EB'}`,
                  background: status === s.value ? '#FEF3DC' : '#fff',
                  color: status === s.value ? '#92400E' : '#6B7280',
                  cursor: 'pointer',
                }}
              >{s.label}</button>
            ))}
          </div>
        </div>

        {/* ── Lista ── */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <Loader2 size={28} style={{ color: '#F5A623', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : waybills.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB',
          }}>
            <FileText size={40} style={{ color: '#D1D5DB', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
              Nenhum romaneio encontrado
            </p>
            <p style={{ fontSize: 13, color: '#9CA3AF' }}>
              {category || status
                ? 'Tente ajustar os filtros'
                : 'Crie seu primeiro romaneio com o botão "Novo Romaneio"'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {waybills.map(w => (
              <WaybillCard
                key={w.id}
                waybill={w}
                onSign={setSigningWaybill}
                onGenerateLink={setLinkWaybill}
                onCancel={handleCancel}
                onPdf={handlePdf}
                pdfLoading={isPdfLoading(`/api/v1/waybill/${w.id}/pdf`)}
              />
            ))}
          </div>
        )}

        {/* ── Paginação ── */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => p - 1)}
              style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 13,
                border: '1px solid #E5E7EB', background: '#fff', cursor: page > 1 && !loading ? 'pointer' : 'not-allowed',
                color: page <= 1 || loading ? '#D1D5DB' : '#374151',
              }}
            >← Anterior</button>
            <span style={{ padding: '7px 12px', fontSize: 13, color: '#6B7280' }}>
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages || loading}
              onClick={() => setPage(p => p + 1)}
              style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 13,
                border: '1px solid #E5E7EB', background: '#fff', cursor: page < totalPages && !loading ? 'pointer' : 'not-allowed',
                color: page >= totalPages || loading ? '#D1D5DB' : '#374151',
              }}
            >Próxima →</button>
          </div>
        )}
      </div>

      {/* ── Modais ── */}

      {signingWaybill && (
        <ReceiverSignModal
          waybill={signingWaybill}
          onClose={() => setSigningWaybill(null)}
          onSuccess={() => { setSigningWaybill(null); loadWaybills() }}
        />
      )}

      {linkWaybill && (
        <SignatureLinkModal
          waybillId={linkWaybill.id}
          docNumber={linkWaybill.docNumber}
          onClose={() => setLinkWaybill(null)}
        />
      )}

      {newPickerOpen && (
        <NewWaybillPicker
          locations={locations}
          onSelect={handlePickerSelect}
          onClose={() => setNewPickerOpen(false)}
        />
      )}

      {waybillModalOpen && (
        <WaybillModal
          isOpen={waybillModalOpen}
          onClose={() => setWaybillModalOpen(false)}
          category={waybillCategory}
          locationId={waybillLocationId}
          locationName={waybillLocationNm}
          onSuccess={() => { setWaybillModalOpen(false); loadWaybills() }}
        />
      )}
    </div>
  )
}
