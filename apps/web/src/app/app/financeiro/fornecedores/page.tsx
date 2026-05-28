'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Plus, Pencil, Search, RefreshCw, X,
  Truck, TrendingDown, DollarSign, Star,
  User, Building2, Phone, ChevronLeft, ChevronRight,
  CheckCircle, XCircle, Trophy, Calendar, ChevronDown,
} from 'lucide-react'
import { TableActionMenu }  from '@/components/ui/TableActionMenu'
import { MaskedInput }      from '@/components/ui/MaskedInput'
import { AddressForm, type AddressData, EMPTY_ADDRESS } from '@/components/ui/AddressForm'
import { BankSearchInput }  from '@/components/ui/BankSearchInput'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { maskCpfCnpj, formatPhone } from '@/lib/validators'
import { formatCurrency } from '@/lib/format'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const fmt = formatCurrency

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface Supplier {
  id:               string
  type:             'PERSON' | 'COMPANY'
  name:             string
  tradeName:        string | null
  email:            string | null
  phone:            string | null
  cpfCnpj:          string | null
  cnpj:             string | null
  category:         string | null
  categoryLabel:    string
  city:             string | null
  state:            string | null
  rating:           number | null
  isActive:         boolean
  transactionCount: number
  paidThisMonth:    number
  totalPayable:     number
  createdAt:        string
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fmtDoc(cpfCnpj: string | null, cnpj: string | null) {
  const v = cpfCnpj || cnpj
  if (!v) return 'â€”'
  const d = v.replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return v
}

const CATEGORY_OPTIONS = [
  { value: 'MATERIAL',   label: 'Material' },
  { value: 'LABOR',      label: 'MÃ£o de obra' },
  { value: 'SERVICE',    label: 'ServiÃ§o' },
  { value: 'EQUIPMENT',  label: 'Equipamento' },
  { value: 'TRANSPORT',  label: 'Transporte' },
  { value: 'OTHER',      label: 'Outro' },
]

const CAT_COLORS: Record<string, string> = {
  MATERIAL:  'bg-orange-100 text-orange-700',
  LABOR:     'bg-blue-100 text-blue-700',
  SERVICE:   'bg-violet-100 text-violet-700',
  EQUIPMENT: 'bg-amber-100 text-amber-700',
  TRANSPORT: 'bg-cyan-100 text-cyan-700',
  OTHER:     'bg-gray-100 text-gray-600',
}

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-xs text-gray-300">â€”</span>
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={10} className={i<=rating?'text-[#F5A623] fill-[#F5A623]':'text-gray-200'} />
      ))}
    </div>
  )
}

// â”€â”€â”€ Ranking Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface RankingItem {
  position:          number
  supplierId:        string
  name:              string
  tradeName:         string | null
  type:              'PERSON' | 'COMPANY'
  category:          string | null
  rating:            number | null
  totalComprado:     number
  percentualDoTotal: number
  ticketMedio:       number
  transactionCount:  number
}

interface RankingMeta {
  period:            string
  startDate:         string
  endDate:           string
  totalGeral:        number
  totalFornecedores: number
}

type RankingPeriod = 'month' | 'quarter' | 'semester' | 'year' | 'custom'

const PERIOD_LABELS: Record<RankingPeriod, string> = {
  month:    'Este mÃªs',
  quarter:  'Trimestre',
  semester: 'Semestre',
  year:     'Este ano',
  custom:   'Personalizado',
}

const DONUT_COLORS = ['#F5A623', '#F59E0B', '#FBBF24', '#FCD34D', '#FDE68A', '#D1D5DB']

const CAT_LABELS: Record<string, string> = {
  MATERIAL:  'Material',
  LABOR:     'MÃ£o de obra',
  SERVICE:   'ServiÃ§o',
  EQUIPMENT: 'Equipamento',
  TRANSPORT: 'Transporte',
  OTHER:     'Outro',
}

// â”€â”€â”€ useSupplierRanking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function useSupplierRanking(
  period: RankingPeriod,
  startDate: string,
  endDate:   string,
  limit = 10,
) {
  const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '')
  return useQuery({
    queryKey: ['supplier-ranking', period, startDate, endDate, limit],
    queryFn: async () => {
      const params = new URLSearchParams({ period, limit: String(limit) })
      if (period === 'custom' && startDate && endDate) {
        params.set('startDate', startDate)
        params.set('endDate',   endDate)
      }
      const res = await fetch(`${API}/api/v1/suppliers/ranking?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) throw new Error('Erro ao carregar ranking')
      return res.json() as Promise<{ ranking: RankingItem[]; meta: RankingMeta }>
    },
    staleTime: 5 * 60_000,
  })
}

// â”€â”€â”€ SupplierRanking Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SupplierRanking() {
  const router = useRouter()
  const [period,     setPeriod]     = useState<RankingPeriod>('month')
  const [custStart,  setCustStart]  = useState('')
  const [custEnd,    setCustEnd]    = useState('')
  const [applied,    setApplied]    = useState({ start: '', end: '' })
  const [showAll,    setShowAll]    = useState(false)

  const { data, isLoading, isError } = useSupplierRanking(
    period, applied.start, applied.end, showAll ? 50 : 10,
  )

  const ranking = data?.ranking ?? []
  const meta    = data?.meta
  const preview = showAll ? ranking : ranking.slice(0, 5)

  // donut data: top5 + outros
  const top5  = ranking.slice(0, 5)
  const outros = ranking.slice(5).reduce((acc, r) => acc + r.totalComprado, 0)
  const donutData = [
    ...top5.map(r => ({ name: r.tradeName || r.name, value: r.totalComprado })),
    ...(outros > 0 ? [{ name: 'Outros', value: outros }] : []),
  ]

  function applyCustom() {
    if (!custStart || !custEnd) return
    setApplied({ start: custStart, end: custEnd })
  }

  function positionBadge(pos: number) {
    if (pos === 1) return 'bg-yellow-100 text-yellow-700 border-yellow-300'
    if (pos === 2) return 'bg-gray-100 text-gray-600 border-gray-300'
    if (pos === 3) return 'bg-orange-100 text-orange-700 border-orange-300'
    return 'bg-white text-gray-400 border-gray-200'
  }

  function initials(name: string) {
    return name.trim().split(/\s+/).slice(0,2).map(w => w[0]).join('').toUpperCase()
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const { name, value } = payload[0].payload
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2 text-sm">
        <p className="font-semibold text-gray-800 mb-0.5">{name}</p>
        <p className="text-[#F5A623] font-bold">{fmt(value)}</p>
        {meta && meta.totalGeral > 0 && (
          <p className="text-xs text-gray-400">{((value / meta.totalGeral) * 100).toFixed(1)}% do total</p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
            <Trophy size={18} className="text-[#F5A623]" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 leading-none">Ranking de Fornecedores</h2>
            <p className="text-xs text-gray-400 mt-0.5">Por volume de compras pagas</p>
          </div>
        </div>

        {/* PerÃ­odo pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(PERIOD_LABELS) as RankingPeriod[]).map(p => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setShowAll(false) }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                period === p
                  ? 'bg-[#F5A623] text-white border-[#F5A623] shadow-sm'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-[#F5A623] hover:text-[#F5A623]'
              }`}
            >
              {p === 'custom' && <Calendar size={11} />}
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range */}
      {period === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 bg-orange-50 border-b border-orange-100">
          <Calendar size={14} className="text-[#F5A623]" />
          <span className="text-xs font-medium text-gray-600">PerÃ­odo:</span>
          <input
            type="date" value={custStart} onChange={e => setCustStart(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#F5A623]"
          />
          <span className="text-xs text-gray-400">atÃ©</span>
          <input
            type="date" value={custEnd} onChange={e => setCustEnd(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#F5A623]"
          />
          <button
            onClick={applyCustom}
            disabled={!custStart || !custEnd}
            className="px-3 py-1.5 bg-[#F5A623] text-white text-xs font-semibold rounded-lg disabled:opacity-40"
          >
            Aplicar
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="p-5 space-y-3 animate-pulse">
          <div className="grid grid-cols-4 gap-3">
            {[0,1,2,3].map(i => (
              <div key={i} className="h-16 bg-gray-100 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mt-4">
            <div className="lg:col-span-3 space-y-2">
              {[0,1,2,3,4].map(i => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg" />
              ))}
            </div>
            <div className="lg:col-span-2 h-48 bg-gray-100 rounded-xl" />
          </div>
        </div>
      )}

      {/* Error */}
      {isError && !isLoading && (
        <div className="p-8 text-center text-sm text-gray-400">
          Erro ao carregar ranking. Verifique a conexÃ£o com a API.
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && ranking.length === 0 && (
        <div className="p-10 text-center">
          <Trophy size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm font-medium text-gray-500">Nenhuma compra paga no perÃ­odo</p>
          <p className="text-xs text-gray-400 mt-1">Altere o perÃ­odo ou registre pagamentos a fornecedores</p>
        </div>
      )}

      {/* Content */}
      {!isLoading && !isError && ranking.length > 0 && (
        <div className="p-5 space-y-4">
          {/* Metric cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="bg-orange-50 rounded-xl p-3.5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Total comprado</p>
              <p className="text-xl font-bold text-gray-900">{fmt(meta?.totalGeral ?? 0)}</p>
            </div>
            <div className="bg-yellow-50 rounded-xl p-3.5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">1Âº lugar</p>
              <p className="text-base font-bold text-gray-900 truncate">{ranking[0]?.tradeName || ranking[0]?.name || 'â€”'}</p>
              <p className="text-xs text-[#F5A623] font-semibold">{fmt(ranking[0]?.totalComprado ?? 0)}</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3.5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Ticket mÃ©dio</p>
              <p className="text-xl font-bold text-gray-900">
                {fmt(ranking.length > 0 ? (meta?.totalGeral ?? 0) / ranking.reduce((a, r) => a + r.transactionCount, 0) : 0)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3.5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Fornecedores ativos</p>
              <p className="text-xl font-bold text-gray-900">{meta?.totalFornecedores ?? 0}</p>
            </div>
          </div>

          {/* Lista + Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Lista rankeada */}
            <div className="lg:col-span-3 space-y-1.5">
              {preview.map(r => (
                <div
                  key={r.supplierId}
                  onClick={() => router.push(`/app/financeiro/fornecedores/${r.supplierId}`)}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors group"
                >
                  {/* Position badge */}
                  <div className={`w-7 h-7 flex-shrink-0 rounded-full border flex items-center justify-center text-xs font-bold ${positionBadge(r.position)}`}>
                    {r.position <= 3 ? ['ðŸ¥‡','ðŸ¥ˆ','ðŸ¥‰'][r.position-1] : r.position}
                  </div>

                  {/* Avatar */}
                  <div className="w-8 h-8 flex-shrink-0 rounded-lg bg-orange-100 flex items-center justify-center text-xs font-bold text-orange-700">
                    {initials(r.name)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 truncate group-hover:text-[#F5A623]">
                        {r.tradeName || r.name}
                      </span>
                      {r.category && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${CAT_COLORS[r.category] ?? 'bg-gray-100 text-gray-600'}`}>
                          {CAT_LABELS[r.category] ?? r.category}
                        </span>
                      )}
                    </div>
                    {/* Progress bar */}
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#F5A623] to-[#f59e0b] rounded-full transition-all"
                          style={{ width: `${Math.min(100, r.percentualDoTotal)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 w-10 text-right flex-shrink-0">
                        {r.percentualDoTotal.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Valores */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">{fmt(r.totalComprado)}</p>
                    <p className="text-[10px] text-gray-400">{r.transactionCount} pag.</p>
                  </div>
                </div>
              ))}

              {ranking.length > 5 && (
                <button
                  onClick={() => setShowAll(v => !v)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-gray-500 hover:text-[#F5A623] transition-colors"
                >
                  <ChevronDown size={14} className={`transition-transform ${showAll ? 'rotate-180' : ''}`} />
                  {showAll ? 'Ver menos' : `Ver mais ${ranking.length - 5} fornecedores`}
                </button>
              )}
            </div>

            {/* Donut chart */}
            <div className="lg:col-span-2 flex flex-col items-center justify-center min-h-[240px]">
              {donutData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {donutData.map((_, i) => (
                        <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      formatter={(value) => (
                        <span className="text-[11px] text-gray-600">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-xs text-gray-300">Sem dados</div>
              )}
              {meta && meta.totalGeral > 0 && (
                <p className="text-center mt-1">
                  <span className="text-xs text-gray-400">Total: </span>
                  <span className="text-sm font-bold text-gray-800">{fmt(meta.totalGeral)}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// â”€â”€â”€ Modal Novo/Editar Fornecedor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface SupplierForm {
  type:                  'PERSON' | 'COMPANY'
  name:                  string
  tradeName:             string
  email:                 string
  phone:                 string
  phone2:                string
  whatsapp:              string
  cpfCnpj:               string
  category:              string
  addr:                  AddressData
  contactName:           string
  contactRole:           string
  contactEmail:          string
  contactPhone:          string
  profession:            string
  crea:                  string
  stateRegistration:     string
  municipalRegistration: string
  bankName:              string
  bankId:                string
  bankCode:              string
  bankAgency:            string
  bankAccount:           string
  bankAccountType:       string
  pixKey:                string
  pixKeyType:            string
  rating:                string
  notes:                 string
}

const DEFAULT_FORM: SupplierForm = {
  type: 'COMPANY', name: '', tradeName: '', email: '', phone: '', phone2: '',
  whatsapp: '', cpfCnpj: '', category: '', addr: EMPTY_ADDRESS,
  contactName: '', contactRole: '', contactEmail: '', contactPhone: '',
  profession: '', crea: '', stateRegistration: '', municipalRegistration: '',
  bankName: '', bankId: '', bankCode: '', bankAgency: '', bankAccount: '', bankAccountType: '',
  pixKey: '', pixKeyType: '', rating: '', notes: '',
}

function SupplierModal({
  open, onClose, onSaved, editId, token,
}: {
  open: boolean; onClose: () => void; onSaved: () => void
  editId?: string | null; token: string
}) {
  const [form, setForm]       = useState<SupplierForm>(DEFAULT_FORM)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [bankOpen, setBankOpen] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  const lCls = "block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide"
  const iCls = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]"

  useEffect(() => {
    if (!open) { setForm(DEFAULT_FORM); setError(''); setBankOpen(false); return }
    if (!editId) { setForm(DEFAULT_FORM); setError(''); setBankOpen(false); return }
    const h = { Authorization: `Bearer ${token}` }
    fetch(`${API}/api/v1/suppliers/${editId}`, { headers: h })
      .then(r => r.json())
      .then(d => {
        const s = d.supplier; if (!s) return
        setForm({
          type:                  s.type                  ?? 'COMPANY',
          name:                  s.name                  ?? '',
          tradeName:             s.tradeName             ?? '',
          email:                 s.email                 ?? '',
          phone:                 s.phone    ? formatPhone(s.phone)    : '',
          phone2:                s.phone2   ? formatPhone(s.phone2)   : '',
          whatsapp:              s.whatsapp ? formatPhone(s.whatsapp) : '',
          cpfCnpj:               s.cpfCnpj ?? s.cnpj ? maskCpfCnpj(s.cpfCnpj ?? s.cnpj) : '',
          category:              s.category              ?? '',
          addr: {
            zipCode:    s.zipCode    ?? '',
            address:    s.address    ?? '',
            number:     s.addressNumber ?? '',
            complement: s.complement ?? '',
            district:   s.district   ?? '',
            city:       s.city       ?? '',
            state:      s.state      ?? '',
          },
          contactName:           s.contactName           ?? '',
          contactRole:           s.contactRole           ?? '',
          contactEmail:          s.contactEmail          ?? '',
          contactPhone:          s.contactPhone ? formatPhone(s.contactPhone) : '',
          profession:            s.profession            ?? '',
          crea:                  s.crea                  ?? '',
          stateRegistration:     s.stateRegistration     ?? '',
          municipalRegistration: s.municipalRegistration ?? '',
          bankName:              s.bankName              ?? '',
          bankId:                '',
          bankCode:              s.bankCode              ?? '',
          bankAgency:            s.bankAgency            ?? '',
          bankAccount:           s.bankAccount           ?? '',
          bankAccountType:       s.bankAccountType       ?? '',
          pixKey:                s.pixKey                ?? '',
          pixKeyType:            s.pixKeyType            ?? '',
          rating:                s.rating != null ? String(s.rating) : '',
          notes:                 s.notes                 ?? '',
        })
        if (s.bankName || s.bankAccount || s.pixKey) setBankOpen(true)
      })
      .catch(() => setError('Erro ao carregar dados'))
  }, [open, editId, token])

  function setF(k: keyof SupplierForm, v: string) { setForm(p => ({...p, [k]: v})); setError('') }

  async function handleSubmit() {
    if (!form.name.trim()) { setError('Nome obrigatÃ³rio'); return }
    setLoading(true); setError('')
    try {
      const body: any = {
        type:                  form.type,
        name:                  form.name.trim(),
        tradeName:             form.tradeName.trim()             || null,
        email:                 form.email.trim()                 || null,
        phone:                 form.phone.trim()                 || null,
        phone2:                form.phone2.trim()                || null,
        whatsapp:              form.whatsapp.trim()              || null,
        cpfCnpj:               form.cpfCnpj.trim()               || null,
        category:              form.category                      || null,
        address:               form.addr.address.trim()          || null,
        city:                  form.addr.city.trim()             || null,
        state:                 form.addr.state.trim()            || null,
        zipCode:               form.addr.zipCode.trim()          || null,
        contactName:           form.contactName.trim()           || null,
        contactRole:           form.contactRole.trim()           || null,
        contactEmail:          form.contactEmail.trim()          || null,
        contactPhone:          form.contactPhone.trim()          || null,
        profession:            form.profession.trim()            || null,
        crea:                  form.crea.trim()                  || null,
        stateRegistration:     form.stateRegistration.trim()     || null,
        municipalRegistration: form.municipalRegistration.trim() || null,
        bankName:              form.bankName.trim()              || null,
        bankCode:              form.bankCode.trim()              || null,
        bankAgency:            form.bankAgency.trim()            || null,
        bankAccount:           form.bankAccount.trim()           || null,
        bankAccountType:       form.bankAccountType              || null,
        pixKey:                form.pixKey.trim()                || null,
        pixKeyType:            form.pixKeyType                   || null,
        rating:                form.rating ? parseInt(form.rating) : null,
        notes:                 form.notes.trim()                 || null,
      }
      const url = editId ? `${API}/api/v1/suppliers/${editId}` : `${API}/api/v1/suppliers`
      const res = await fetch(url, {
        method:  editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar')
      onSaved(); onClose()
    } catch (e: any) { setError(e.message || 'Erro ao salvar') }
    finally { setLoading(false) }
  }

  if (!open) return null

  return (
    <div ref={overlayRef} onClick={e => { if (e.target === overlayRef.current) onClose() }}
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{editId ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Tipo */}
          <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
            {(['COMPANY','PERSON'] as const).map(t => (
              <button key={t} onClick={() => setF('type', t)}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${form.type===t?'bg-[#F5A623] text-white shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
                {t==='COMPANY' ? 'ðŸ¢ Pessoa JurÃ­dica' : 'ðŸ‘¤ Pessoa FÃ­sica (autÃ´nomo)'}
              </button>
            ))}
          </div>

          {/* Nome */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={lCls}>{form.type==='PERSON'?'Nome completo *':'RazÃ£o social *'}</label>
              <input value={form.name} onChange={e => setF('name', e.target.value)} className={iCls} />
            </div>
            {form.type==='COMPANY' && (
              <div>
                <label className={lCls}>Nome fantasia</label>
                <input value={form.tradeName} onChange={e => setF('tradeName', e.target.value)} className={iCls} />
              </div>
            )}
          </div>

          {/* CPF/CNPJ + Categoria */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <MaskedInput
              mask="cpfCnpj"
              value={form.cpfCnpj}
              onChange={v => setF('cpfCnpj', v)}
              label={form.type==='PERSON' ? 'CPF' : 'CNPJ'}
              placeholder={form.type==='PERSON' ? '000.000.000-00' : '00.000.000/0001-00'}
              showValid
              inputMode="numeric"
            />
            <div>
              <label className={lCls}>Categoria</label>
              <select value={form.category} onChange={e => setF('category', e.target.value)} className={iCls + ' bg-white'}>
                <option value="">Selecionar...</option>
                {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {/* PF: profissÃ£o + CREA */}
          {form.type==='PERSON' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={lCls}>ProfissÃ£o / Especialidade</label><input value={form.profession} onChange={e => setF('profession', e.target.value)} className={iCls} /></div>
              <div><label className={lCls}>Registro profissional (CREA, CRQ...)</label><input value={form.crea} onChange={e => setF('crea', e.target.value)} className={iCls} /></div>
            </div>
          )}

          {/* PJ: IE + IM */}
          {form.type==='COMPANY' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={lCls}>InscriÃ§Ã£o estadual</label><input value={form.stateRegistration} onChange={e => setF('stateRegistration', e.target.value)} className={iCls} /></div>
              <div><label className={lCls}>InscriÃ§Ã£o municipal</label><input value={form.municipalRegistration} onChange={e => setF('municipalRegistration', e.target.value)} className={iCls} /></div>
            </div>
          )}

          {/* Contatos */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MaskedInput mask="phone" value={form.phone}    onChange={v => setF('phone',    v)} label="Telefone"   placeholder="(11) 99999-9999" inputMode="numeric" />
            <MaskedInput mask="phone" value={form.phone2}   onChange={v => setF('phone2',   v)} label="Telefone 2" inputMode="numeric" />
            <MaskedInput mask="phone" value={form.whatsapp} onChange={v => setF('whatsapp', v)} label="WhatsApp"   inputMode="numeric" />
          </div>

          <div>
            <label className={lCls}>E-mail</label>
            <input type="email" value={form.email} onChange={e => setF('email', e.target.value)} className={iCls} />
          </div>

          {/* EndereÃ§o */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">EndereÃ§o</p>
            <AddressForm data={form.addr} onChange={addr => setForm(p => ({...p, addr}))} />
          </div>

          {/* Contato principal â€” PJ */}
          {form.type==='COMPANY' && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Contato principal</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={lCls}>Nome</label><input value={form.contactName} onChange={e => setF('contactName', e.target.value)} className={iCls} /></div>
                <div><label className={lCls}>Cargo</label><input value={form.contactRole} onChange={e => setF('contactRole', e.target.value)} className={iCls} /></div>
                <div><label className={lCls}>E-mail</label><input type="email" value={form.contactEmail} onChange={e => setF('contactEmail', e.target.value)} className={iCls} /></div>
                <MaskedInput mask="phone" value={form.contactPhone} onChange={v => setF('contactPhone', v)} label="Telefone" inputMode="numeric" />
              </div>
            </div>
          )}

          {/* AvaliaÃ§Ã£o */}
          <div>
            <label className={lCls}>AvaliaÃ§Ã£o</label>
            <div className="flex gap-1 mt-1">
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button" onClick={() => setF('rating', form.rating===String(n)?'':String(n))}
                  className="p-1 rounded hover:bg-gray-100 transition-colors">
                  <Star size={20} className={parseInt(form.rating)>=n?'text-[#F5A623] fill-[#F5A623]':'text-gray-300'} />
                </button>
              ))}
            </div>
          </div>

          {/* Dados bancÃ¡rios â€” expansÃ­vel */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button type="button" onClick={() => setBankOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-semibold text-gray-700 transition-colors">
              ðŸ¦ Dados para conciliaÃ§Ã£o bancÃ¡ria
              <span className="text-xs text-gray-400">{bankOpen ? 'â–²' : 'â–¼'}</span>
            </button>
            {bankOpen && (
              <div className="p-4 space-y-3">
                <p className="text-xs text-gray-400">â„¹ï¸ Dados usados apenas para conciliaÃ§Ã£o â€” nÃ£o para pagamentos pelo sistema.</p>
                <BankSearchInput
                  token={token}
                  value={form.bankName ? (form.bankCode ? `${form.bankCode} â€” ${form.bankName}` : form.bankName) : ''}
                  bankCode={form.bankCode}
                  onChange={opt => { setF('bankName', opt.value); setF('bankCode', opt.code); setF('bankId', opt.id) }}
                  label="Banco"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <MaskedInput mask="bankAgency" value={form.bankAgency} onChange={v => setF('bankAgency', v)} label="AgÃªncia" placeholder="0000-0" inputMode="numeric" />
                  <MaskedInput mask="bankAccount" value={form.bankAccount} onChange={v => setF('bankAccount', v)} label="Conta" placeholder="00000-0" inputMode="numeric" />
                  <div>
                    <label className={lCls}>Tipo de conta</label>
                    <select value={form.bankAccountType} onChange={e => setF('bankAccountType', e.target.value)} className={iCls + ' bg-white'}>
                      <option value="">Selecionar...</option>
                      <option value="corrente">Conta Corrente</option>
                      <option value="poupanca">PoupanÃ§a</option>
                      <option value="pagamento">Conta Pagamento</option>
                    </select>
                  </div>
                  <div><label className={lCls}>Chave PIX</label><input value={form.pixKey} onChange={e => setF('pixKey', e.target.value)} className={iCls} /></div>
                  <div>
                    <label className={lCls}>Tipo da chave PIX</label>
                    <select value={form.pixKeyType} onChange={e => setF('pixKeyType', e.target.value)} className={iCls + ' bg-white'}>
                      <option value="">Selecionar...</option>
                      <option value="cpf">CPF</option>
                      <option value="cnpj">CNPJ</option>
                      <option value="email">E-mail</option>
                      <option value="telefone">Telefone</option>
                      <option value="aleatoria">Chave aleatÃ³ria</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ObservaÃ§Ãµes */}
          <div>
            <label className={lCls}>ObservaÃ§Ãµes</label>
            <textarea value={form.notes} onChange={e => setF('notes', e.target.value)} rows={2}
              className={`${iCls} resize-none`} />
          </div>

          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSubmit} disabled={loading}
            className="px-6 py-2.5 bg-[#F5A623] text-white rounded-xl text-sm font-semibold hover:bg-[#d4891a] disabled:opacity-60">
            {loading ? 'Salvando...' : (editId ? 'Atualizar' : 'Salvar fornecedor')}
          </button>
        </div>
      </div>
    </div>
  )
}

// â”€â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function FornecedoresPage() {
  const router = useRouter()
  const [suppliers,  setSuppliers]  = useState<Supplier[]>([])
  const [loading,    setLoading]    = useState(true)
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [search,     setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [catFilter,  setCatFilter]  = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal,  setShowModal]  = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)

  const LIMIT = 20
  const pages = Math.max(1, Math.ceil(total / LIMIT))

  function token() { return localStorage.getItem('token') || '' }
  function headers() { return { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' } }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page), limit: String(LIMIT),
        isActive: String(!showInactive),
        ...(search     && { search }),
        ...(typeFilter && { type: typeFilter }),
        ...(catFilter  && { category: catFilter }),
      })
      const res  = await fetch(`${API}/api/v1/suppliers?${params}`, { headers: headers() })
      const data = await res.json()
      setSuppliers(data.suppliers ?? [])
      setTotal(data.total        ?? 0)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [page, search, typeFilter, catFilter, showInactive])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, typeFilter, catFilter, showInactive])

  async function handleToggle(s: Supplier) {
    try {
      await fetch(`${API}/api/v1/suppliers/${s.id}/toggle`, { method: 'PATCH', headers: headers() })
      load()
    } catch { alert('Erro ao alterar status') }
  }

  const totalAtivos   = suppliers.filter(s => s.isActive).length
  const totalPagoMes  = suppliers.reduce((acc, s) => acc + s.paidThisMonth, 0)
  const totalAPagar   = suppliers.reduce((acc, s) => acc + s.totalPayable, 0)
  const comAvaliacao  = suppliers.filter(s => s.rating && s.rating >= 4).length

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: 'Financeiro', href: '/app/financeiro' },
        { label: 'Fornecedores' },
      ]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fornecedores</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie os fornecedores e prestadores</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50">
            <RefreshCw size={13} /> Atualizar
          </button>
          <button onClick={() => { setEditingId(null); setShowModal(true) }}
            className="flex items-center gap-2 bg-[#F5A623] hover:bg-[#d4891a] text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm">
            <Plus size={16} /> Novo Fornecedor
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { title: 'Fornecedores ativos', value: `${totalAtivos}`, icon: Truck,         cls: 'text-orange-600 bg-orange-100' },
          { title: 'Pago no mÃªs',         value: fmt(totalPagoMes), icon: DollarSign,    cls: 'text-green-600 bg-green-100'  },
          { title: 'A pagar',             value: fmt(totalAPagar),  icon: TrendingDown,  cls: 'text-red-600 bg-red-100'      },
          { title: 'Bem avaliados (4+â˜…)', value: `${comAvaliacao}`, icon: Star,          cls: 'text-amber-600 bg-amber-100'  },
        ].map(m => (
          <div key={m.title} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${m.cls}`}>
              <m.icon size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-900 leading-none mb-1">{m.value}</p>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{m.title}</p>
          </div>
        ))}
      </div>

      {/* Ranking de Fornecedores */}
      <SupplierRanking />

      {/* Tabela */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-gray-100">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, CPF/CNPJ..."
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-[#F5A623]">
            <option value="">Todos os tipos</option>
            <option value="COMPANY">Pessoa JurÃ­dica</option>
            <option value="PERSON">Pessoa FÃ­sica</option>
          </select>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-[#F5A623]">
            <option value="">Todas as categorias</option>
            {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
            Inativos
          </label>
          <span className="text-xs text-gray-400 ml-auto">{total} fornecedor{total !== 1 ? 'es' : ''}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Fornecedor</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell">Tipo</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell">Categoria</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden lg:table-cell">CPF/CNPJ</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden lg:table-cell">Telefone</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Pago no mÃªs</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell">A pagar</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden xl:table-cell">AvaliaÃ§Ã£o</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({length: 5}).map((_,i) => (
                  <tr key={i} className="animate-pulse">
                    {[...Array(10)].map((_,j) => <td key={j} className="px-5 py-4"><div className="h-3 bg-gray-200 rounded w-full" /></td>)}
                  </tr>
                ))
              ) : suppliers.length === 0 ? (
                <tr><td colSpan={10} className="px-5 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center"><Truck size={22} className="text-gray-400" /></div>
                    <p className="text-sm text-gray-500">Nenhum fornecedor encontrado</p>
                    <button onClick={() => { setEditingId(null); setShowModal(true) }}
                      className="flex items-center gap-2 bg-[#F5A623] text-white text-xs font-semibold px-4 py-2 rounded-xl"><Plus size={14} /> Novo fornecedor</button>
                  </div>
                </td></tr>
              ) : suppliers.map(s => (
                <tr key={s.id} className={`hover:bg-gray-50 transition-colors ${!s.isActive?'opacity-60':''}`}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${s.type==='PERSON'?'bg-orange-50':'bg-amber-50'}`}>
                        {s.type==='PERSON' ? <User size={14} className="text-orange-500" /> : <Building2 size={14} className="text-amber-600" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                        {s.tradeName && <p className="text-xs text-gray-400">{s.tradeName}</p>}
                        {s.city && <p className="text-xs text-gray-400 hidden sm:block">{s.city}{s.state ? ` â€” ${s.state}` : ''}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.type==='PERSON'?'bg-orange-100 text-orange-700':'bg-amber-100 text-amber-700'}`}>
                      {s.type==='PERSON'?'PF':'PJ'}
                    </span>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell">
                    {s.category ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLORS[s.category]??'bg-gray-100 text-gray-600'}`}>{s.categoryLabel}</span>
                    ) : <span className="text-xs text-gray-300">â€”</span>}
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-500 font-mono hidden lg:table-cell">{fmtDoc(s.cpfCnpj, s.cnpj)}</td>
                  <td className="px-5 py-4 text-xs text-gray-500 hidden lg:table-cell">{s.phone || 'â€”'}</td>
                  <td className="px-5 py-4 text-sm font-bold text-gray-800 tabular-nums">{fmt(s.paidThisMonth)}</td>
                  <td className={`px-5 py-4 text-sm font-semibold tabular-nums hidden md:table-cell ${s.totalPayable>0?'text-red-500':'text-gray-400'}`}>{fmt(s.totalPayable)}</td>
                  <td className="px-5 py-4 hidden xl:table-cell"><StarRating rating={s.rating} /></td>
                  <td className="px-5 py-4">
                    {s.isActive
                      ? <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full"><CheckCircle size={10} />Ativo</span>
                      : <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full"><XCircle size={10} />Inativo</span>
                    }
                  </td>
                  <td className="px-5 py-4">
                    <TableActionMenu actions={[
                      { label: 'Ver detalhes', icon: <Truck size={13} />, onClick: () => router.push(`/app/financeiro/fornecedores/${s.id}`) },
                      { label: 'Editar', icon: <Pencil size={13} />, onClick: () => { setEditingId(s.id); setShowModal(true) } },
                      { label: s.isActive ? 'Inativar' : 'Reativar', icon: s.isActive ? <XCircle size={13} /> : <CheckCircle size={13} />, onClick: () => handleToggle(s), variant: s.isActive ? 'warning' as const : 'success' as const, separator: true },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">{(page-1)*LIMIT+1}â€“{Math.min(page*LIMIT, total)} de {total}</p>
            <div className="flex items-center gap-1">
              <button disabled={page<=1} onClick={() => setPage(p=>p-1)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={14} /></button>
              {Array.from({length: Math.min(pages,5)},(_,i)=>i+1).map(n=>(
                <button key={n} onClick={()=>setPage(n)} className={`w-7 h-7 rounded-lg text-xs font-medium ${n===page?'bg-[#F5A623] text-white':'text-gray-500 hover:bg-gray-100'}`}>{n}</button>
              ))}
              <button disabled={page>=pages} onClick={() => setPage(p=>p+1)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>

      <SupplierModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditingId(null) }}
        onSaved={() => { setShowModal(false); setEditingId(null); load() }}
        editId={editingId}
        token={token()}
      />
    </div>
  )
}
