'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  CheckCircle, XCircle, Clock, Shield, Package,
  Truck, User, MapPin, AlertTriangle, Hash,
  Building2, Calendar,
} from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WaybillVerify {
  docNumber:   string
  category:    string
  status:      string
  emittedAt:   string | null
  completedAt: string | null
  origin:      string | null
  destination: string | null
  company: {
    name: string
    cnpj: string | null
  }
  driver: {
    name:     string | null
    document: string | null
  } | null
  receiver: {
    name:     string | null
    document: string | null
  }
  items: Array<{
    name:         string
    unit:         string | null
    code:         string | null
    requestedQty: number
    receivedQty:  number | null
    status:       string
    serialNumber: string | null
  }>
  signatures: {
    sender:   { name: string | null; signedAt: string | null }
    driver:   { name: string | null; signedAt: string | null } | null
    receiver: { name: string | null; signedAt: string | null } | null
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtQty(n: number | null | undefined) {
  if (n == null) return '—'
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
}

const STATUS_MAP: Record<string, { label: string; bg: string; text: string; border: string }> = {
  COMPLETED:  { label: 'Concluído',   bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  IN_TRANSIT: { label: 'Em Trânsito', bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200'  },
  EMITTED:    { label: 'Emitido',     bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  DRAFT:      { label: 'Rascunho',    bg: 'bg-gray-50',   text: 'text-gray-700',   border: 'border-gray-200'  },
  CANCELLED:  { label: 'Cancelado',   bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200'   },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VerificarRomaneioPagg() {
  const params = useParams()
  const hash   = params?.hash as string | undefined

  const [result,  setResult]  = useState<WaybillVerify | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    if (!hash) { setError('Hash inválido'); setLoading(false); return }

    fetch(`${API}/api/v1/waybill/public/verify/${hash}`)
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok || !data.valid) {
          setError(data.message ?? data.error ?? 'Romaneio não encontrado')
          return
        }
        setResult(data.waybill)
      })
      .catch(() => setError('Erro ao verificar. Tente novamente em instantes.'))
      .finally(() => setLoading(false))
  }, [hash])

  const statusInfo = result ? (STATUS_MAP[result.status] ?? STATUS_MAP.DRAFT) : null

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">

        {/* ── Brand ── */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-1">
            <div className="w-9 h-9 rounded-xl bg-[#F5A623] flex items-center justify-center">
              <Shield size={18} className="text-white" />
            </div>
            <span className="text-lg font-bold text-gray-800">SYSOBRA</span>
          </div>
          <p className="text-sm text-gray-500">Verificação de autenticidade de romaneio</p>
        </div>

        {/* ── Card ── */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">

          {!loading && (
            <div className={`h-1.5 w-full ${result ? 'bg-green-400' : 'bg-red-400'}`} />
          )}

          <div className="p-6">

            {/* ── Loading ── */}
            {loading && (
              <div className="flex flex-col items-center py-12 gap-3">
                <div className="w-10 h-10 border-[3px] border-[#F5A623] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500">Verificando autenticidade...</p>
                <p className="text-xs text-gray-400 font-mono break-all text-center max-w-sm">{hash}</p>
              </div>
            )}

            {/* ── Erro ── */}
            {!loading && (error || !result) && (
              <div className="flex flex-col items-center py-12 gap-4">
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                  <XCircle size={32} className="text-red-500" />
                </div>
                <div className="text-center">
                  <h2 className="text-lg font-bold text-gray-800 mb-1">Não autenticado</h2>
                  <p className="text-sm text-red-600">{error}</p>
                  <p className="text-xs text-gray-400 mt-3">
                    Este código não corresponde a nenhum romaneio válido no sistema.
                  </p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 w-full">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">
                      Se você recebeu este link e acredita que é legítimo, entre em contato com o emissor do documento.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Resultado ── */}
            {!loading && result && (
              <div className="space-y-5">

                {/* Cabeçalho autenticado */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle size={22} className="text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">Romaneio autenticado</p>
                      <p className="text-xs text-gray-500">{result.company.name}</p>
                      {result.company.cnpj && (
                        <p className="text-xs text-gray-400">CNPJ: {result.company.cnpj}</p>
                      )}
                    </div>
                  </div>
                  {statusInfo && (
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border flex-shrink-0 ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
                      {result.status === 'COMPLETED' ? <CheckCircle size={10} /> : <Clock size={10} />}
                      {statusInfo.label}
                    </span>
                  )}
                </div>

                {/* Número + categoria */}
                <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Número do romaneio</p>
                    <p className="text-base font-bold text-gray-800 font-mono">{result.docNumber}</p>
                  </div>
                  <div className="flex items-center gap-1.5 bg-[#FEF3DC] border border-[#F5A623]/30 rounded-lg px-3 py-1.5">
                    <Package size={12} className="text-[#D4860F]" />
                    <span className="text-xs font-semibold text-[#D4860F]">{result.category}</span>
                  </div>
                </div>

                <hr className="border-gray-100" />

                {/* Grid de infos */}
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem icon={MapPin}    label="Origem"      value={result.origin      ?? '—'} />
                  <InfoItem icon={MapPin}    label="Destino"     value={result.destination ?? '—'} />
                  <InfoItem icon={Calendar}  label="Emitido em"  value={fmt(result.emittedAt)} />
                  <InfoItem icon={Calendar}  label="Concluído em" value={fmt(result.completedAt)} />
                </div>

                <hr className="border-gray-100" />

                {/* Motorista */}
                {result.driver && (
                  <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Truck size={13} className="text-amber-600" />
                      <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Motorista</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-800">{result.driver.name ?? '—'}</p>
                    {result.driver.document && (
                      <p className="text-xs text-gray-500 mt-0.5">Doc: {result.driver.document}</p>
                    )}
                  </div>
                )}

                {/* Recebedor */}
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <User size={13} className="text-blue-600" />
                    <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">Recebedor</p>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{result.receiver.name ?? '—'}</p>
                  {result.receiver.document && (
                    <p className="text-xs text-gray-500 mt-0.5">Doc: {result.receiver.document}</p>
                  )}
                </div>

                <hr className="border-gray-100" />

                {/* Itens */}
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                    Itens ({result.items.length})
                  </p>
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-800 text-white">
                          <th className="text-left px-3 py-2 font-semibold">Descrição</th>
                          <th className="text-center px-3 py-2 font-semibold w-10">Un.</th>
                          <th className="text-right px-3 py-2 font-semibold w-14">Sol.</th>
                          <th className="text-right px-3 py-2 font-semibold w-14">Rec.</th>
                          <th className="text-center px-3 py-2 font-semibold w-16">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.items.map((item, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-3 py-2 text-gray-800 font-medium">
                              {item.name}
                              {item.serialNumber && (
                                <span className="text-gray-400 ml-1 font-normal">#{item.serialNumber}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center text-gray-500">{item.unit ?? '—'}</td>
                            <td className="px-3 py-2 text-right text-gray-700 font-semibold">{fmtQty(item.requestedQty)}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{fmtQty(item.receivedQty)}</td>
                            <td className="px-3 py-2 text-center">
                              {item.status === 'OK'
                                ? <span className="text-green-600 font-semibold">✓ OK</span>
                                : item.status === 'MISSING'
                                  ? <span className="text-red-500">↓ Falta</span>
                                  : item.status === 'DAMAGED'
                                    ? <span className="text-amber-600">⚠ Dano</span>
                                    : <span className="text-gray-500">{item.status}</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Signatários */}
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Signatários</p>
                  <div className="space-y-1.5">
                    {result.signatures.sender && (
                      <SignatureRow role="Expedidor" name={result.signatures.sender.name} date={result.signatures.sender.signedAt} />
                    )}
                    {result.signatures.driver && (
                      <SignatureRow role="Motorista" name={result.signatures.driver.name} date={result.signatures.driver.signedAt} />
                    )}
                    {result.signatures.receiver && (
                      <SignatureRow role="Recebedor" name={result.signatures.receiver.name} date={result.signatures.receiver.signedAt} />
                    )}
                  </div>
                </div>

                {/* Hash */}
                <div className="border border-dashed border-gray-200 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Hash size={12} className="text-gray-400" />
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Hash de autenticidade</p>
                  </div>
                  <p className="text-[11px] font-mono text-gray-500 break-all leading-relaxed">{hash}</p>
                </div>

                {/* Nota de autenticidade */}
                <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                  <div className="flex items-start gap-2">
                    <Shield size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-green-700">
                      Este romaneio foi verificado e é autêntico. O hash acima garante que os dados não foram alterados desde a conclusão.
                    </p>
                  </div>
                </div>

              </div>
            )}

          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Powered by <span className="font-semibold">SYSOBRA</span> · Sistema de Gestão de Obras
        </p>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoItem({ icon: Icon, label, value }: {
  icon: React.ElementType; label: string; value: string
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={11} className="text-gray-400" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
        <p className="text-xs text-gray-700 font-medium mt-0.5 truncate">{value}</p>
      </div>
    </div>
  )
}

function SignatureRow({ role, name, date }: { role: string; name: string | null; date: string | null }) {
  const fmt = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
      <div className="flex items-center gap-2">
        <CheckCircle size={13} className="text-green-500 flex-shrink-0" />
        <div>
          <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mr-2">{role}</span>
          <span className="text-xs text-gray-700 font-medium">{name ?? '—'}</span>
        </div>
      </div>
      <span className="text-[10px] text-gray-400 flex-shrink-0">{fmt(date)}</span>
    </div>
  )
}
