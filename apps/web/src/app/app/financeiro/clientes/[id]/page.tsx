'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Building2, User, Mail, Phone, MapPin,
  TrendingUp, FileText, Briefcase, CheckCircle, XCircle,
  Plus, Pencil, ChevronRight,
} from 'lucide-react'
import { formatCurrency } from '@/lib/format'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const fmt = formatCurrency

interface ClientDetail {
  id:               string
  type:             'PERSON' | 'COMPANY'
  name:             string
  tradeName:        string | null
  email:            string | null
  phone:            string | null
  phone2:           string | null
  whatsapp:         string | null
  cpfCnpj:          string | null
  address:          string | null
  city:             string | null
  state:            string | null
  zipCode:          string | null
  contactName:      string | null
  contactRole:      string | null
  contactEmail:     string | null
  contactPhone:     string | null
  notes:            string | null
  isActive:         boolean
  createdAt:        string
  projectCount:     number
  transactionCount: number
  totalReceivable:  number
  totalReceived:    number
  projects: {
    id: string; name: string; code: string | null; status: string
    progressPercent: number; budgetAlert: boolean; delayAlert: boolean
    globalBudget: number | null; expectedEndDate: string | null
  }[]
  financialTransactions: {
    id: string; description: string; type: string; isPaid: boolean
    netAmount: number; dueDate: string | null; referenceDate: string | null
    category: { name: string; color: string | null; icon: string | null } | null
  }[]
}

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

const PROJECT_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  ACTIVE:      { label: 'Ativo',      cls: 'bg-green-100 text-green-700'  },
  IN_PROGRESS: { label: 'Em obra',    cls: 'bg-blue-100 text-blue-700'    },
  PAUSED:      { label: 'Pausado',    cls: 'bg-amber-100 text-amber-700'  },
  COMPLETED:   { label: 'Concluído',  cls: 'bg-gray-100 text-gray-600'    },
  CANCELLED:   { label: 'Cancelado',  cls: 'bg-red-100 text-red-700'      },
}

export default function ClienteDetailPage() {
  const router = useRouter()
  const { id } = useParams() as { id: string }
  const [client,  setClient]  = useState<ClientDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [tab,     setTab]     = useState<'obras' | 'financeiro'>('obras')

  function token() { return localStorage.getItem('token') || '' }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`${API}/api/v1/clients/${id}`, { headers: { Authorization: `Bearer ${token()}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar')
      setClient(data.client)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-8 h-8 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (error || !client) return (
    <div className="p-6 text-center">
      <p className="text-red-600 text-sm">{error || 'Cliente não encontrado.'}</p>
      <Link href="/app/financeiro/clientes" className="text-sm text-[#F5A623] hover:underline mt-2 inline-block">← Voltar</Link>
    </div>
  )

  const proj = client.projects ?? []
  const txs  = client.financialTransactions ?? []

  return (
    <div className="space-y-5">
      {/* Breadcrumb + Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/app/financeiro" className="hover:text-gray-600">Financeiro</Link>
            <ChevronRight size={14} />
            <Link href="/app/financeiro/clientes" className="hover:text-gray-600">Clientes</Link>
            <ChevronRight size={14} />
            <span className="text-gray-700 font-medium truncate max-w-[200px]">{client.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
          {client.tradeName && <p className="text-sm text-gray-500">{client.tradeName}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${client.isActive?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>
            {client.isActive ? 'Ativo' : 'Inativo'}
          </span>
          <Link href={`/app/financeiro/clientes/${id}?edit=1`}
            className="flex items-center gap-1.5 text-xs border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50">
            <Pencil size={13} /> Editar
          </Link>
          <Link href={`/app/centro-de-custo/nova?clientId=${id}`}
            className="flex items-center gap-2 bg-[#F5A623] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-[#d4891a]">
            <Plus size={16} /> Nova obra
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Coluna esquerda — dados */}
        <div className="xl:col-span-1 space-y-4">
          {/* Dados principais */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${client.type==='PERSON'?'bg-indigo-50':'bg-blue-50'}`}>
                {client.type==='PERSON' ? <User size={22} className="text-indigo-500" /> : <Building2 size={22} className="text-blue-500" />}
              </div>
              <div>
                <p className="text-xs text-gray-400">{client.type==='PERSON'?'Pessoa Física':'Pessoa Jurídica'}</p>
                <p className="text-sm font-semibold text-gray-700">{fmtDoc(client.cpfCnpj)}</p>
              </div>
            </div>
            {client.email && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail size={14} className="text-gray-400 flex-shrink-0" />
                <a href={`mailto:${client.email}`} className="hover:text-[#F5A623] truncate">{client.email}</a>
              </div>
            )}
            {client.phone && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone size={14} className="text-gray-400 flex-shrink-0" />
                <span>{client.phone}</span>
                {client.phone2 && <span className="text-gray-400 text-xs">· {client.phone2}</span>}
              </div>
            )}
            {(client.address || client.city) && (
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <MapPin size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                <span>{[client.address, client.city, client.state].filter(Boolean).join(', ')}</span>
              </div>
            )}
            {client.notes && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400 font-semibold uppercase mb-1">Observações</p>
                <p className="text-sm text-gray-600">{client.notes}</p>
              </div>
            )}
          </div>

          {/* Contato principal (PJ) */}
          {client.type === 'COMPANY' && (client.contactName || client.contactEmail) && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Contato principal</p>
              {client.contactName  && <p className="text-sm font-semibold text-gray-800">{client.contactName}</p>}
              {client.contactRole  && <p className="text-xs text-gray-500 mb-2">{client.contactRole}</p>}
              {client.contactEmail && <p className="text-xs text-gray-600">{client.contactEmail}</p>}
              {client.contactPhone && <p className="text-xs text-gray-600">{client.contactPhone}</p>}
            </div>
          )}

          {/* Métricas */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'A receber', value: fmt(client.totalReceivable), cls: 'text-green-600' },
              { label: 'Recebido',  value: fmt(client.totalReceived),   cls: 'text-gray-800' },
              { label: 'Obras',     value: String(proj.length),         cls: 'text-blue-600' },
              { label: 'Lançamentos', value: String(txs.length),        cls: 'text-gray-800' },
            ].map(m => (
              <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className={`text-lg font-bold ${m.cls}`}>{m.value}</p>
                <p className="text-[11px] font-semibold text-gray-400 uppercase">{m.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Coluna direita — abas */}
        <div className="xl:col-span-2 space-y-4">
          {/* Abas */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-100">
              {([
                { key: 'obras',      label: `Obras (${proj.length})` },
                { key: 'financeiro', label: `Financeiro (${txs.length})` },
              ] as const).map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 ${tab===t.key?'border-[#F5A623] text-[#F5A623]':'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'obras' && (
              <div className="p-4 space-y-3">
                {proj.length === 0 ? (
                  <div className="text-center py-8">
                    <Briefcase size={32} className="text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Nenhuma obra vinculada</p>
                    <Link href={`/app/centro-de-custo/nova?clientId=${id}`}
                      className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-[#F5A623] hover:underline">
                      <Plus size={12} /> Nova obra para este cliente
                    </Link>
                  </div>
                ) : proj.map(p => {
                  const st = PROJECT_STATUS_LABEL[p.status] ?? { label: p.status, cls: 'bg-gray-100 text-gray-600' }
                  return (
                    <Link key={p.id} href={`/app/centro-de-custo/${p.id}`}
                      className="flex items-center gap-4 p-3 rounded-xl border border-gray-100 hover:border-[#F5A623]/30 hover:bg-orange-50/30 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                          {p.code && <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">{p.code}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                            <div className="bg-[#F5A623] h-1.5 rounded-full" style={{ width: `${Math.min(Number(p.progressPercent),100)}%` }} />
                          </div>
                          <span className="text-xs text-gray-500 flex-shrink-0">{Number(p.progressPercent).toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${st.cls}`}>{st.label}</span>
                        {p.globalBudget && <span className="text-xs text-gray-500">{fmt(Number(p.globalBudget))}</span>}
                      </div>
                      {(p.budgetAlert || p.delayAlert) && (
                        <span title={p.budgetAlert ? 'Orçamento estourado' : 'Prazo vencido'}>
                          <CheckCircle size={14} className="text-red-400 flex-shrink-0" />
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}

            {tab === 'financeiro' && (
              <div className="overflow-x-auto">
                {txs.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText size={32} className="text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Nenhum lançamento vinculado</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase">Descrição</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase hidden md:table-cell">Data</th>
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
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-500 hidden md:table-cell">{fmtDate(tx.dueDate ?? tx.referenceDate)}</td>
                          <td className={`px-5 py-3 text-sm font-semibold ${tx.type==='INCOME'?'text-green-600':'text-red-500'}`}>
                            {tx.type==='INCOME'?'+':'-'}{fmt(tx.netAmount)}
                          </td>
                          <td className="px-5 py-3">
                            {tx.isPaid
                              ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Pago</span>
                              : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pendente</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
