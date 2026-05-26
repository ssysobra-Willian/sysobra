'use client'

import { useState, useEffect, useRef } from 'react'
import {
  X, Hash, Building2, User, Tag, CreditCard,
  Calendar, CheckCircle, Clock, XCircle, ExternalLink,
  Copy, Check, Printer, ShieldCheck,
} from 'lucide-react'
import QRCode from 'qrcode'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import { UserAvatarRow } from '@/components/ui/UserAvatar'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const WEB = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditUser {
  id: string
  name: string
  avatarUrl: string | null
}

interface TransactionReceipt {
  id: string
  description: string
  type: 'INCOME' | 'EXPENSE'
  status: string
  isPaid: boolean
  grossAmount: number
  interestAmount: number
  retentionAmount: number
  netAmount: number
  dueDate: string | null
  paidAt: string | null
  referenceDate: string
  paymentMethod: string | null
  invoiceNumber: string | null
  transactionNumber: string | null
  transactionHash: string | null
  createdAt: string
  updatedAt: string
  notes: string | null
  createdBy:   AuditUser | null
  category:    { id: string; name: string; color: string | null; icon: string | null } | null
  bankAccount: { id: string; name: string; bank: string | null } | null
  client:      { id: string; name: string } | null
  supplier:    { id: string; name: string } | null
  costCenterAllocations: {
    id: string
    amount: number
    percentage: number
    costType: string | null
    notes: string | null
    project: { id: string; name: string }
    stage:   { id: string; name: string } | null
  }[]
  auditLogs: {
    id: string
    action: string
    createdAt: string
    user: AuditUser
  }[]
}

interface Props {
  open:    boolean
  txId:    string | null
  token:   string
  onClose: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TransactionReceiptModal({ open, txId, token, onClose }: Props) {
  const [tx,       setTx]       = useState<TransactionReceipt | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [qrUrl,    setQrUrl]    = useState('')
  const [copied,   setCopied]   = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  // ── Fetch transaction ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !txId) { setTx(null); setError(''); return }

    setLoading(true)
    setError('')
    fetch(`${API}/api/financial/transactions/${txId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(async (data) => {
        const t: TransactionReceipt = data.transaction
        setTx(t)

        // Gera QR code com link de verificação pública
        if (t.transactionHash) {
          const url = `${WEB}/verificar/${t.transactionHash}`
          try {
            const dataUrl = await QRCode.toDataURL(url, {
              width: 128,
              margin: 1,
              color: { dark: '#1F2937', light: '#FFFFFF' },
            })
            setQrUrl(dataUrl)
          } catch { /* sem QR */ }
        }
      })
      .catch((e: any) => setError(e.message?.includes('404') ? 'Lançamento não encontrado' : 'Erro ao carregar recibo'))
      .finally(() => setLoading(false))
  }, [open, txId, token])

  // ── Close on overlay click ─────────────────────────────────────────────────
  function handleOverlay(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  // ── Copy hash ──────────────────────────────────────────────────────────────
  async function copyHash() {
    if (!tx?.transactionHash) return
    try {
      await navigator.clipboard.writeText(tx.transactionHash)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  // ── Print ──────────────────────────────────────────────────────────────────
  function handlePrint() {
    window.print()
  }

  if (!open) return null

  const verifyUrl = tx?.transactionHash ? `${WEB}/verificar/${tx.transactionHash}` : null

  const statusMap = {
    PAID:      { label: 'Pago',      cls: 'bg-green-100 text-green-700',  icon: CheckCircle },
    PENDING:   { label: 'Pendente',  cls: 'bg-amber-100 text-amber-700',  icon: Clock },
    CANCELLED: { label: 'Cancelado', cls: 'bg-red-100 text-red-700',      icon: XCircle },
  }
  const statusInfo = statusMap[(tx?.status as keyof typeof statusMap) ?? 'PENDING'] ?? statusMap.PENDING
  const StatusIcon = statusInfo.icon

  const typeLabel = tx?.type === 'INCOME' ? 'Receita' : 'Despesa'
  const typeCls   = tx?.type === 'INCOME' ? 'text-green-600' : 'text-red-500'

  const pmLabels: Record<string, string> = {
    BANK_SLIP: 'Boleto', PIX: 'Pix', CREDIT_CARD: 'Cartão de crédito',
    DEBIT_CARD: 'Cartão de débito', CASH: 'Dinheiro', TRANSFER: 'Transferência',
    CHECK: 'Cheque', OTHER: 'Outro',
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlay}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden print:shadow-none print:rounded-none print:max-h-none">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#F5A623]/10 flex items-center justify-center">
              <Hash size={16} className="text-[#F5A623]" />
            </div>
            <h2 className="text-base font-semibold text-gray-800">Recibo de Lançamento</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrint}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Imprimir"
            >
              <Printer size={15} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64 gap-3">
              <div className="w-5 h-5 border-2 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-500">Carregando recibo...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <XCircle size={32} className="mx-auto text-red-400 mb-2" />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          ) : tx ? (
            <div className="p-6 space-y-5">

              {/* ── Identidade do lançamento ─────────────────────────── */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-gray-400 font-mono uppercase tracking-wide mb-1">
                    {tx.transactionNumber ?? 'LF-—'}
                  </p>
                  <h3 className="text-xl font-bold text-gray-900 leading-tight">{tx.description}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-sm font-semibold ${typeCls}`}>{typeLabel}</span>
                    <span className="text-gray-300">·</span>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${statusInfo.cls}`}>
                      <StatusIcon size={11} /> {statusInfo.label}
                    </span>
                  </div>
                </div>

                {/* QR Code */}
                {qrUrl && (
                  <div className="flex-shrink-0 text-center">
                    <img src={qrUrl} alt="QR Code de verificação" className="w-20 h-20 rounded-lg border border-gray-200" />
                    <p className="text-[10px] text-gray-400 mt-1">Verificar</p>
                  </div>
                )}
              </div>

              {/* ── Valor principal ──────────────────────────────────── */}
              <div className={`rounded-2xl px-5 py-4 ${tx.type === 'INCOME' ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                <p className="text-xs text-gray-500 mb-0.5">Valor líquido</p>
                <p className={`text-3xl font-bold leading-none ${typeCls}`}>{formatCurrency(tx.netAmount)}</p>
                {(tx.interestAmount > 0 || tx.retentionAmount > 0) && (
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    <span>Bruto: <strong>{formatCurrency(tx.grossAmount)}</strong></span>
                    {tx.interestAmount > 0 && <span>Juros: <strong>+{formatCurrency(tx.interestAmount)}</strong></span>}
                    {tx.retentionAmount > 0 && <span>Retenções: <strong>−{formatCurrency(tx.retentionAmount)}</strong></span>}
                  </div>
                )}
              </div>

              {/* ── Grid de detalhes ─────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-3">
                <DetailItem icon={Calendar} label="Vencimento"       value={formatDate(tx.dueDate)} />
                <DetailItem icon={Calendar} label="Pagamento"        value={formatDate(tx.paidAt)} />
                <DetailItem icon={Calendar} label="Data de referência" value={formatDate(tx.referenceDate)} />
                <DetailItem icon={Calendar} label="Criado em"        value={formatDateTime(tx.createdAt)} />
                {tx.category && (
                  <DetailItem icon={Tag} label="Categoria" value={tx.category.name}
                    dot={tx.category.color ?? undefined} />
                )}
                {tx.bankAccount && (
                  <DetailItem icon={CreditCard} label="Conta bancária" value={`${tx.bankAccount.name}${tx.bankAccount.bank ? ` · ${tx.bankAccount.bank}` : ''}`} />
                )}
                {tx.paymentMethod && (
                  <DetailItem icon={CreditCard} label="Forma de pagamento" value={pmLabels[tx.paymentMethod] ?? tx.paymentMethod} />
                )}
                {tx.invoiceNumber && (
                  <DetailItem icon={Hash} label="N° NF / Documento" value={tx.invoiceNumber} />
                )}
                {tx.client && (
                  <DetailItem icon={User} label="Cliente" value={tx.client.name} />
                )}
                {tx.supplier && (
                  <DetailItem icon={Building2} label="Fornecedor" value={tx.supplier.name} />
                )}
              </div>

              {/* ── Notas ────────────────────────────────────────────── */}
              {tx.notes && (
                <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                  <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1">Observações</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{tx.notes}</p>
                </div>
              )}

              {/* ── Rateio ───────────────────────────────────────────── */}
              {tx.costCenterAllocations.length > 0 && (
                <div>
                  <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-2">Rateio por obra</p>
                  <div className="space-y-1.5">
                    {tx.costCenterAllocations.map((a) => (
                      <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5 border border-gray-100">
                        <div>
                          <p className="text-xs font-medium text-gray-700">{a.project.name}</p>
                          {a.stage && <p className="text-[11px] text-gray-400">{a.stage.name}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-gray-800">{formatCurrency(a.amount)}</p>
                          <p className="text-[10px] text-gray-400">{Number(a.percentage).toFixed(1)}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Auditoria ────────────────────────────────────────── */}
              <div className="border border-gray-100 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <ShieldCheck size={12} className="text-gray-400" />
                  <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Informações de auditoria</p>
                </div>

                {/* Criado por */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">Criado por</span>
                  {tx.createdBy ? (
                    <UserAvatarRow name={tx.createdBy.name} avatarUrl={tx.createdBy.avatarUrl} size="xs"
                      sub={formatDateTime(tx.createdAt)} />
                  ) : (
                    <span className="text-xs text-gray-500">{formatDateTime(tx.createdAt)}</span>
                  )}
                </div>

                {/* Última edição (se o audit log tiver EDITED) */}
                {(() => {
                  const lastEdit = [...(tx.auditLogs ?? [])]
                    .reverse()
                    .find((l) => l.action === 'EDITED')
                  if (!lastEdit) return null
                  return (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-400">Última edição</span>
                      <UserAvatarRow name={lastEdit.user.name} avatarUrl={lastEdit.user.avatarUrl} size="xs"
                        sub={formatDateTime(lastEdit.createdAt)} />
                    </div>
                  )
                })()}
              </div>

              {/* ── Hash de autenticidade ─────────────────────────────── */}
              {tx.transactionHash && (
                <div className="border border-dashed border-gray-200 rounded-xl p-4">
                  <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-2">
                    Autenticidade
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-mono text-gray-500 break-all flex-1">{tx.transactionHash}</p>
                    <button
                      onClick={copyHash}
                      className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Copiar hash"
                    >
                      {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                    </button>
                  </div>
                  {verifyUrl && (
                    <a
                      href={verifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-2 text-xs text-[#F5A623] hover:underline"
                    >
                      <ExternalLink size={11} /> Verificar autenticidade online
                    </a>
                  )}
                </div>
              )}

            </div>
          ) : null}
        </div>

      </div>
    </div>
  )
}

// ─── Detail item ──────────────────────────────────────────────────────────────

function DetailItem({
  icon: Icon, label, value, dot,
}: {
  icon: React.ElementType
  label: string
  value: string
  dot?: string
}) {
  if (!value || value === '—') return null
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={12} className="text-gray-400" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {dot && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />}
          <p className="text-xs text-gray-700 font-medium truncate">{value}</p>
        </div>
      </div>
    </div>
  )
}
