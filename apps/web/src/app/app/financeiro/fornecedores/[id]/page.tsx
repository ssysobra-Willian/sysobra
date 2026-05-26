'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Building2, User, Mail, Phone, MapPin,
  TrendingDown, FileText, ShoppingCart, Star, Truck,
  Plus, Pencil, ChevronRight, CreditCard, Landmark,
  CheckCircle, XCircle, Hash, KeyRound, AlertCircle,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { formatCurrency } from '@/lib/format'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const fmt = formatCurrency

// ─── Types ────────────────────────────────────────────────────────────────────

interface SupplierDetail {
  id:                    string
  type:                  'PERSON' | 'COMPANY'
  name:                  string
  tradeName:             string | null
  email:                 string | null
  phone:                 string | null
  phone2:                string | null
  whatsapp:              string | null
  cpfCnpj:               string | null
  cnpj:                  string | null
  category:              string | null
  categoryLabel:         string
  address:               string | null
  city:                  string | null
  state:                 string | null
  zipCode:               string | null
  contactName:           string | null
  contactRole:           string | null
  contactEmail:          string | null
  contactPhone:          string | null
  profession:            string | null
  crea:                  string | null
  stateRegistration:     string | null
  municipalRegistration: string | null
  bankName:              string | null
  bankCode:              string | null
  bankAgency:            string | null
  bankAccount:           string | null
  bankAccountType:       string | null
  pixKey:                string | null
  pixKeyType:            string | null
  rating:                number | null
  notes:                 string | null
  isActive:              boolean
  createdAt:             string
  totalPaid:             number
  totalPayable:          number
  transactionCount:      number
  financialTransactions: {
    id: string; description: string; type: string; isPaid: boolean
    netAmount: number; dueDate: string | null; paidAt: string | null; referenceDate: string | null
    category: { name: string; color: string | null; icon: string | null } | null
  }[]
  purchaseOrders: {
    id: string; code: string | null; status: string; totalAmount: number; createdAt: string
  }[]
  _count: { financialTransactions: number; purchaseOrders: number }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDoc(v: string | null) {
  if (!v) return '—'
  const d = v.replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return v
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}
function token() { return localStorage.getItem('token') || '' }

const CAT_COLORS: Record<string, string> = {
  MATERIAL:  'bg-orange-100 text-orange-700',
  LABOR:     'bg-blue-100 text-blue-700',
  SERVICE:   'bg-violet-100 text-violet-700',
  EQUIPMENT: 'bg-amber-100 text-amber-700',
  TRANSPORT: 'bg-cyan-100 text-cyan-700',
  OTHER:     'bg-gray-100 text-gray-600',
}

const PO_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT:     { label: 'Rascunho',  cls: 'bg-gray-100 text-gray-600'   },
  SENT:      { label: 'Enviado',   cls: 'bg-blue-100 text-blue-700'   },
  APPROVED:  { label: 'Aprovado',  cls: 'bg-green-100 text-green-700' },
  RECEIVED:  { label: 'Recebido',  cls: 'bg-teal-100 text-teal-700'  },
  CANCELLED: { label: 'Cancelado', cls: 'bg-red-100 text-red-700'    },
}

const PIX_KEY_LABELS: Record<string, string> = {
  CPF:    'CPF',
  CNPJ:   'CNPJ',
  EMAIL:  'E-mail',
  PHONE:  'Telefone',
  RANDOM: 'Chave aleatória',
}

// ─── StarDisplay ──────────────────────────────────────────────────────────────

function StarDisplay({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-sm text-gray-400 italic">Sem avaliação</span>
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1,2,3,4,5].map(i => (
          <Star key={i} size={16} className={i <= rating ? 'text-[#F5A623] fill-[#F5A623]' : 'text-gray-200'} />
        ))}
      </div>
      <span className="text-sm text-gray-600 font-medium">{rating}/5</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FornecedorDetailPage() {
  const { id } = useParams() as { id: string }
  const [supplier,   setSupplier]   = useState<SupplierDetail | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [tab,        setTab]        = useState<'financeiro' | 'compras'>('financeiro')
  const [bankOpen,   setBankOpen]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`${API}/api/v1/suppliers/${id}`, { headers: { Authorization: `Bearer ${token()}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar')
      setSupplier(data.supplier)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-8 h-8 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (error || !supplier) return (
    <div className="p-6 text-center">
      <p className="text-red-600 text-sm">{error || 'Fornecedor não encontrado.'}</p>
      <Link href="/app/financeiro/fornecedores" className="text-sm text-[#F5A623] hover:underline mt-2 inline-block">← Voltar</Link>
    </div>
  )

  const txs = supplier.financialTransactions ?? []
  const pos = supplier.purchaseOrders ?? []
  const hasBankData = supplier.bankName || supplier.bankAgency || supplier.bankAccount || supplier.pixKey

  return (
    <div className="space-y-5">

      {/* Breadcrumb + Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/app/financeiro" className="hover:text-gray-600">Financeiro</Link>
            <ChevronRight size={14} />
            <Link href="/app/financeiro/fornecedores" className="hover:text-gray-600">Fornecedores</Link>
            <ChevronRight size={14} />
            <span className="text-gray-700 font-medium truncate max-w-[200px]">{supplier.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{supplier.name}</h1>
          {supplier.tradeName && <p className="text-sm text-gray-500">{supplier.tradeName}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${supplier.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {supplier.isActive ? 'Ativo' : 'Inativo'}
          </span>
          {supplier.category && (
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${CAT_COLORS[supplier.category] ?? 'bg-gray-100 text-gray-600'}`}>
              {supplier.categoryLabel}
            </span>
          )}
          <Link href={`/app/financeiro/fornecedores?edit=${id}`}
            className="flex items-center gap-1.5 text-xs border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50">
            <Pencil size={13} /> Editar
          </Link>
          <Link
            href={`/app/financeiro?novo=1&supplierId=${id}`}
            className="flex items-center gap-2 bg-[#F5A623] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-[#d4891a]">
            <Plus size={16} /> Novo lançamento
          </Link>
        </div>
      </div>

      {/* Layout principal */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* ─── Coluna esquerda ─── */}
        <div className="xl:col-span-1 space-y-4">

          {/* Dados principais */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${supplier.type === 'PERSON' ? 'bg-indigo-50' : 'bg-blue-50'}`}>
                {supplier.type === 'PERSON'
                  ? <User size={22} className="text-indigo-500" />
                  : <Truck size={22} className="text-blue-500" />}
              </div>
              <div>
                <p className="text-xs text-gray-400">{supplier.type === 'PERSON' ? 'Pessoa Física' : 'Pessoa Jurídica'}</p>
                <p className="text-sm font-semibold text-gray-700">{fmtDoc(supplier.cpfCnpj || supplier.cnpj)}</p>
              </div>
            </div>

            {/* Avaliação */}
            <div className="flex items-center gap-2">
              <StarDisplay rating={supplier.rating} />
            </div>

            {supplier.email && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail size={14} className="text-gray-400 flex-shrink-0" />
                <a href={`mailto:${supplier.email}`} className="hover:text-[#F5A623] truncate">{supplier.email}</a>
              </div>
            )}
            {supplier.phone && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone size={14} className="text-gray-400 flex-shrink-0" />
                <span>{supplier.phone}</span>
                {supplier.phone2 && <span className="text-gray-400 text-xs">· {supplier.phone2}</span>}
              </div>
            )}
            {(supplier.address || supplier.city) && (
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <MapPin size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                <span>{[supplier.address, supplier.city, supplier.state].filter(Boolean).join(', ')}</span>
              </div>
            )}

            {/* PF: profissão / CREA */}
            {supplier.type === 'PERSON' && (supplier.profession || supplier.crea) && (
              <div className="pt-2 border-t border-gray-100 space-y-1">
                {supplier.profession && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Hash size={13} className="text-gray-400" />
                    <span>{supplier.profession}</span>
                  </div>
                )}
                {supplier.crea && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Hash size={13} className="text-gray-400" />
                    <span className="text-xs text-gray-500">CREA:</span>
                    <span>{supplier.crea}</span>
                  </div>
                )}
              </div>
            )}

            {/* PJ: IE / IM */}
            {supplier.type === 'COMPANY' && (supplier.stateRegistration || supplier.municipalRegistration) && (
              <div className="pt-2 border-t border-gray-100 space-y-1">
                {supplier.stateRegistration && (
                  <p className="text-xs text-gray-500">IE: <span className="text-gray-700">{supplier.stateRegistration}</span></p>
                )}
                {supplier.municipalRegistration && (
                  <p className="text-xs text-gray-500">IM: <span className="text-gray-700">{supplier.municipalRegistration}</span></p>
                )}
              </div>
            )}

            {supplier.notes && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400 font-semibold uppercase mb-1">Observações</p>
                <p className="text-sm text-gray-600">{supplier.notes}</p>
              </div>
            )}
          </div>

          {/* Contato principal (PJ) */}
          {supplier.type === 'COMPANY' && (supplier.contactName || supplier.contactEmail) && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Contato principal</p>
              {supplier.contactName  && <p className="text-sm font-semibold text-gray-800">{supplier.contactName}</p>}
              {supplier.contactRole  && <p className="text-xs text-gray-500 mb-2">{supplier.contactRole}</p>}
              {supplier.contactEmail && <p className="text-xs text-gray-600">{supplier.contactEmail}</p>}
              {supplier.contactPhone && <p className="text-xs text-gray-600">{supplier.contactPhone}</p>}
            </div>
          )}

          {/* Métricas */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total pago',    value: fmt(supplier.totalPaid),    cls: 'text-gray-800' },
              { label: 'A pagar',       value: fmt(supplier.totalPayable), cls: 'text-red-600'  },
              { label: 'Lançamentos',   value: String(supplier._count?.financialTransactions ?? supplier.transactionCount), cls: 'text-blue-600' },
              { label: 'Pedidos',       value: String(supplier._count?.purchaseOrders ?? pos.length), cls: 'text-gray-800' },
            ].map(m => (
              <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className={`text-lg font-bold ${m.cls}`}>{m.value}</p>
                <p className="text-[11px] font-semibold text-gray-400 uppercase">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Dados bancários — colapsável */}
          {hasBankData && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setBankOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2">
                  <Landmark size={15} className="text-gray-400" />
                  Dados bancários
                </div>
                {bankOpen ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
              </button>
              {bankOpen && (
                <div className="px-5 pb-5 space-y-3 border-t border-gray-100">
                  {supplier.bankName && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Banco</span>
                      <span className="text-gray-800 font-medium">
                        {supplier.bankName}{supplier.bankCode ? ` (${supplier.bankCode})` : ''}
                      </span>
                    </div>
                  )}
                  {supplier.bankAgency && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Agência</span>
                      <span className="text-gray-800 font-medium">{supplier.bankAgency}</span>
                    </div>
                  )}
                  {supplier.bankAccount && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Conta</span>
                      <span className="text-gray-800 font-medium">
                        {supplier.bankAccount}
                        {supplier.bankAccountType && (
                          <span className="ml-1 text-xs text-gray-400">({supplier.bankAccountType === 'CHECKING' ? 'Corrente' : supplier.bankAccountType === 'SAVINGS' ? 'Poupança' : supplier.bankAccountType})</span>
                        )}
                      </span>
                    </div>
                  )}
                  {supplier.pixKey && (
                    <div className="pt-2 border-t border-gray-100">
                      <div className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold uppercase mb-1">
                        <KeyRound size={11} /> Pix
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{PIX_KEY_LABELS[supplier.pixKeyType ?? ''] || supplier.pixKeyType || 'Chave'}</span>
                        <span className="text-gray-800 font-medium font-mono text-xs">{supplier.pixKey}</span>
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-gray-400 pt-2 border-t border-gray-100 italic">
                    Dados para conciliação interna. Não use como autorização de pagamento.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Coluna direita — abas ─── */}
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-100">
              {([
                { key: 'financeiro', label: `Financeiro (${supplier._count?.financialTransactions ?? txs.length})` },
                { key: 'compras',    label: `Pedidos de compra (${supplier._count?.purchaseOrders ?? pos.length})` },
              ] as const).map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 ${tab === t.key ? 'border-[#F5A623] text-[#F5A623]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Aba Financeiro */}
            {tab === 'financeiro' && (
              <div className="overflow-x-auto">
                {txs.length === 0 ? (
                  <div className="text-center py-10">
                    <FileText size={32} className="text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 mb-3">Nenhum lançamento vinculado</p>
                    <Link href={`/app/financeiro?novo=1&supplierId=${id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F5A623] hover:underline">
                      <Plus size={12} /> Novo lançamento para este fornecedor
                    </Link>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase">Descrição</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase hidden md:table-cell">Vencimento</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase hidden md:table-cell">Pagamento</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase">Valor</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {txs.map(tx => (
                        <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              {tx.category?.icon && <span>{tx.category.icon}</span>}
                              <span className="text-sm text-gray-700">{tx.description}</span>
                            </div>
                            {tx.category && (
                              <p className="text-xs text-gray-400 mt-0.5">{tx.category.name}</p>
                            )}
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-500 hidden md:table-cell">
                            {fmtDate(tx.dueDate)}
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-500 hidden md:table-cell">
                            {tx.isPaid ? fmtDate(tx.paidAt) : '—'}
                          </td>
                          <td className={`px-5 py-3 text-sm font-semibold ${tx.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}`}>
                            {tx.type === 'INCOME' ? '+' : '-'}{fmt(tx.netAmount)}
                          </td>
                          <td className="px-5 py-3">
                            {tx.isPaid
                              ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Pago</span>
                              : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pendente</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Aba Pedidos de Compra */}
            {tab === 'compras' && (
              <div className="overflow-x-auto">
                {pos.length === 0 ? (
                  <div className="text-center py-10">
                    <ShoppingCart size={32} className="text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Nenhum pedido de compra vinculado</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase">Pedido</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase hidden md:table-cell">Data</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase">Valor</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pos.map(po => {
                        const st = PO_STATUS[po.status] ?? { label: po.status, cls: 'bg-gray-100 text-gray-600' }
                        return (
                          <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-5 py-3">
                              <span className="text-sm font-medium text-gray-800">
                                {po.code ?? `#${po.id.slice(-6).toUpperCase()}`}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-xs text-gray-500 hidden md:table-cell">
                              {fmtDate(po.createdAt)}
                            </td>
                            <td className="px-5 py-3 text-sm font-semibold text-gray-800">
                              {fmt(Number(po.totalAmount))}
                            </td>
                            <td className="px-5 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${st.cls}`}>{st.label}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* Info de segurança quando sem dados bancários */}
          {!hasBankData && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Nenhum dado bancário cadastrado para este fornecedor.{' '}
                <Link href={`/app/financeiro/fornecedores?edit=${id}`} className="font-semibold underline hover:no-underline">
                  Adicionar dados bancários
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
