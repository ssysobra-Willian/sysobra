'use client'

import React, { useState, useEffect } from 'react'
import { X, FileText } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
function getToken()     { return typeof window !== 'undefined' ? (localStorage.getItem('token')     ?? '') : '' }
function getCompanyId() { return typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : '' }

// ─── Types ────────────────────────────────────────────────────────────────────

interface BasketDetail {
  id:           string
  docNumber:    string
  type:         string
  status:       string
  destinatary?: string | null
  notes?:       string | null
  signedAt?:    string | null
  createdAt:    string
  senderSignatureUrl?:   string | null
  receiverSignatureUrl?: string | null
  project?:     { id: string; name: string } | null
  employee?:    { id: string; name: string } | null
  movements?:   {
    id: string; quantity: number; unitCost?: number | null
    stockItem: { id: string; name: string; unit: string }
  }[]
}

interface Props {
  basketId: string
  onClose:  () => void
}

function formatDateBR(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function SignatureCard({ label, url }: { label: string; url?: string | null }) {
  if (!url) {
    return (
      <div className="flex-1 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 py-6 text-center">
        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
          <FileText size={16} className="text-gray-400" />
        </div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-xs text-gray-300">Não assinado</p>
      </div>
    )
  }
  const src = url.startsWith('http') ? url : `${API}/${url}`
  return (
    <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200">
        <p className="text-xs font-medium text-gray-600">{label}</p>
      </div>
      <div className="p-3 bg-white flex items-center justify-center">
        <img src={src} alt={label} className="max-h-40 object-contain" />
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReceiptViewer({ basketId, onClose }: Props) {
  const [basket,  setBasket]  = useState<BasketDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`${API}/api/v1/deposit/baskets/${basketId}`, {
      headers: { Authorization: `Bearer ${getToken()}`, 'x-company-id': getCompanyId() },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => setBasket(d ?? null))
      .catch(() => setBasket(null))
      .finally(() => setLoading(false))
  }, [basketId])

  const TYPE_LABELS: Record<string, string> = {
    OUT: 'Saída', IN: 'Entrada', TRANSFER: 'Transferência', RETURN: 'Devolução',
    EPI_DELIVERY: 'Entrega EPI',
  }
  const STATUS_COLORS: Record<string, string> = {
    DRAFT:   'bg-gray-100 text-gray-600',
    PENDING: 'bg-yellow-100 text-yellow-700',
    SIGNED:  'bg-green-100 text-green-700',
    CLOSED:  'bg-blue-100 text-blue-700',
  }
  const STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Rascunho', PENDING: 'Pendente', SIGNED: 'Assinado', CLOSED: 'Fechado',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[92dvh] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-[#F5A623]" />
            <h2 className="font-semibold text-gray-800">Recibo Assinado</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin h-6 w-6 border-2 border-[#F5A623] border-t-transparent rounded-full" />
            </div>
          ) : !basket ? (
            <div className="py-12 text-center text-sm text-gray-400">Recibo não encontrado</div>
          ) : (
            <div className="p-5 space-y-5">
              {/* Meta */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-mono text-sm font-semibold text-gray-800">{basket.docNumber}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[basket.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABELS[basket.status] ?? basket.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-500">
                  <span>Tipo: <strong className="text-gray-700">{TYPE_LABELS[basket.type] ?? basket.type}</strong></span>
                  {basket.employee && <span>Colaborador: <strong className="text-gray-700">{basket.employee.name}</strong></span>}
                  {basket.project  && <span>Obra: <strong className="text-gray-700">{basket.project.name}</strong></span>}
                  {basket.signedAt && <span>Assinado em: <strong className="text-gray-700">{formatDateBR(basket.signedAt)}</strong></span>}
                </div>
              </div>

              {/* Itens */}
              {basket.movements && basket.movements.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Itens do Romaneio</h4>
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    {basket.movements.map((mv, i) => (
                      <div key={mv.id} className={`flex items-center justify-between px-4 py-2.5 text-sm ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                        <span className="text-gray-700 flex-1 min-w-0 truncate">{mv.stockItem.name}</span>
                        <span className="text-gray-500 ml-4 flex-shrink-0">{mv.quantity} {mv.stockItem.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Assinaturas */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Assinaturas</h4>
                <div className="flex gap-3">
                  <SignatureCard label="Remetente" url={basket.senderSignatureUrl} />
                  <SignatureCard label="Destinatário" url={basket.receiverSignatureUrl} />
                </div>
              </div>

              {basket.notes && (
                <div className="bg-yellow-50 border border-yellow-100 rounded-xl px-4 py-3 text-xs text-yellow-800">
                  📝 {basket.notes}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

