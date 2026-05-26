'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Search, RefreshCw, X,
  Users, TrendingUp, AlertTriangle, Building2,
  User, Phone, Mail, ChevronLeft, ChevronRight,
  CheckCircle, XCircle, MoreVertical,
} from 'lucide-react'
import { TableActionMenu } from '@/components/ui/TableActionMenu'
import { formatCurrency } from '@/lib/format'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const fmt = formatCurrency

// ─── Types ────────────────────────────────────────────────────────────────────

interface Client {
  id:               string
  type:             'PERSON' | 'COMPANY'
  name:             string
  tradeName:        string | null
  email:            string | null
  phone:            string | null
  cpfCnpj:          string | null
  city:             string | null
  state:            string | null
  isActive:         boolean
  projectCount:     number
  transactionCount: number
  totalReceivable:  number
  createdAt:        string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDoc(v: string | null) {
  if (!v) return '—'
  const d = v.replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return v
}
function fmtPhone(v: string | null) {
  if (!v) return '—'
  const d = v.replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return v
}

// ─── Modal Novo/Editar Cliente ────────────────────────────────────────────────

interface ClientForm {
  type:         'PERSON' | 'COMPANY'
  name:         string
  tradeName:    string
  email:        string
  phone:        string
  phone2:       string
  whatsapp:     string
  cpfCnpj:      string
  address:      string
  city:         string
  state:        string
  zipCode:      string
  contactName:  string
  contactRole:  string
  contactEmail: string
  contactPhone: string
  notes:        string
}

const DEFAULT_FORM: ClientForm = {
  type: 'COMPANY', name: '', tradeName: '', email: '', phone: '', phone2: '',
  whatsapp: '', cpfCnpj: '', address: '', city: '', state: '', zipCode: '',
  contactName: '', contactRole: '', contactEmail: '', contactPhone: '', notes: '',
}

async function fetchCep(cep: string) {
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep.replace(/\D/g,'')}/json/`)
    if (!r.ok) return null
    const d = await r.json()
    if (d.erro) return null
    return { address: d.logradouro, city: d.localidade, state: d.uf }
  } catch { return null }
}

function ClientModal({
  open, onClose, onSaved, editId, token,
}: {
  open: boolean; onClose: () => void; onSaved: () => void
  editId?: string | null; token: string
}) {
  const [form, setForm]   = useState<ClientForm>(DEFAULT_FORM)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) { setForm(DEFAULT_FORM); setError(''); return }
    if (!editId) { setForm(DEFAULT_FORM); setError(''); return }
    const h = { Authorization: `Bearer ${token}` }
    fetch(`${API}/api/v1/clients/${editId}`, { headers: h })
      .then(r => r.json())
      .then(d => {
        const c = d.client
        if (!c) return
        setForm({
          type:         c.type         ?? 'COMPANY',
          name:         c.name         ?? '',
          tradeName:    c.tradeName    ?? '',
          email:        c.email        ?? '',
          phone:        c.phone        ?? '',
          phone2:       c.phone2       ?? '',
          whatsapp:     c.whatsapp     ?? '',
          cpfCnpj:      c.cpfCnpj      ?? '',
          address:      c.address      ?? '',
          city:         c.city         ?? '',
          state:        c.state        ?? '',
          zipCode:      c.zipCode      ?? '',
          contactName:  c.contactName  ?? '',
          contactRole:  c.contactRole  ?? '',
          contactEmail: c.contactEmail ?? '',
          contactPhone: c.contactPhone ?? '',
          notes:        c.notes        ?? '',
        })
      })
      .catch(() => setError('Erro ao carregar dados'))
  }, [open, editId, token])

  function setF(k: keyof ClientForm, v: string) { setForm(p => ({...p, [k]: v})); setError('') }

  async function handleCep(cep: string) {
    if (cep.replace(/\D/g,'').length !== 8) return
    const d = await fetchCep(cep)
    if (d) setForm(p => ({...p, address: d.address || p.address, city: d.city, state: d.state}))
  }

  async function handleSubmit() {
    if (!form.name.trim()) { setError('Nome obrigatório'); return }
    setLoading(true); setError('')
    try {
      const body = {
        type:         form.type,
        name:         form.name.trim()         || undefined,
        tradeName:    form.tradeName.trim()    || null,
        email:        form.email.trim()        || null,
        phone:        form.phone.trim()        || null,
        phone2:       form.phone2.trim()       || null,
        whatsapp:     form.whatsapp.trim()     || null,
        cpfCnpj:      form.cpfCnpj.trim()      || null,
        address:      form.address.trim()      || null,
        city:         form.city.trim()         || null,
        state:        form.state.trim()        || null,
        zipCode:      form.zipCode.trim()      || null,
        contactName:  form.contactName.trim()  || null,
        contactRole:  form.contactRole.trim()  || null,
        contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        notes:        form.notes.trim()        || null,
      }
      const url = editId ? `${API}/api/v1/clients/${editId}` : `${API}/api/v1/clients`
      const res = await fetch(url, {
        method:  editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar')
      onSaved()
      onClose()
    } catch (e: any) { setError(e.message || 'Erro ao salvar') }
    finally { setLoading(false) }
  }

  if (!open) return null
  return (
    <div ref={overlayRef} onClick={e => { if (e.target === overlayRef.current) onClose() }}
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{editId ? 'Editar cliente' : 'Novo cliente'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Tipo */}
          <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
            {(['COMPANY','PERSON'] as const).map(t => (
              <button key={t} onClick={() => setF('type', t)}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${form.type===t?'bg-[#F5A623] text-white shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
                {t==='COMPANY' ? '🏢 Pessoa Jurídica' : '👤 Pessoa Física'}
              </button>
            ))}
          </div>

          {/* Nome e nome fantasia */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                {form.type==='PERSON' ? 'Nome completo *' : 'Razão social *'}
              </label>
              <input value={form.name} onChange={e => setF('name', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
            </div>
            {form.type==='COMPANY' && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Nome fantasia</label>
                <input value={form.tradeName} onChange={e => setF('tradeName', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
              </div>
            )}
          </div>

          {/* CPF/CNPJ + Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                {form.type==='PERSON' ? 'CPF' : 'CNPJ'}
              </label>
              <input value={form.cpfCnpj} onChange={e => setF('cpfCnpj', e.target.value)}
                placeholder={form.type==='PERSON' ? '000.000.000-00' : '00.000.000/0001-00'}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">E-mail</label>
              <input type="email" value={form.email} onChange={e => setF('email', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
            </div>
          </div>

          {/* Telefones */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Telefone</label>
              <input value={form.phone} onChange={e => setF('phone', e.target.value)}
                placeholder="(11) 99999-9999"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Telefone 2</label>
              <input value={form.phone2} onChange={e => setF('phone2', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">WhatsApp</label>
              <input value={form.whatsapp} onChange={e => setF('whatsapp', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
            </div>
          </div>

          {/* Endereço */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Endereço</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">CEP</label>
                <input value={form.zipCode} onChange={e => setF('zipCode', e.target.value)}
                  onBlur={e => handleCep(e.target.value)} placeholder="00000-000"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Logradouro</label>
                <input value={form.address} onChange={e => setF('address', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Cidade</label>
                <input value={form.city} onChange={e => setF('city', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">UF</label>
                <input value={form.state} onChange={e => setF('state', e.target.value.toUpperCase().slice(0,2))}
                  maxLength={2} placeholder="SP"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
              </div>
            </div>
          </div>

          {/* Contato principal — só PJ */}
          {form.type === 'COMPANY' && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Contato principal</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Nome</label>
                  <input value={form.contactName} onChange={e => setF('contactName', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Cargo</label>
                  <input value={form.contactRole} onChange={e => setF('contactRole', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">E-mail contato</label>
                  <input type="email" value={form.contactEmail} onChange={e => setF('contactEmail', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Telefone contato</label>
                  <input value={form.contactPhone} onChange={e => setF('contactPhone', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
                </div>
              </div>
            </div>
          )}

          {/* Observações */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Observações</label>
            <textarea value={form.notes} onChange={e => setF('notes', e.target.value)}
              rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] resize-none" />
          </div>

          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSubmit} disabled={loading}
            className="px-6 py-2.5 bg-[#F5A623] text-white rounded-xl text-sm font-semibold hover:bg-[#d4891a] disabled:opacity-60">
            {loading ? 'Salvando...' : (editId ? 'Atualizar' : 'Salvar cliente')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClientesPage() {
  const router = useRouter()
  const [clients,    setClients]    = useState<Client[]>([])
  const [loading,    setLoading]    = useState(true)
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [search,     setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState('')
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
      })
      const res  = await fetch(`${API}/api/v1/clients?${params}`, { headers: headers() })
      const data = await res.json()
      setClients(data.clients ?? [])
      setTotal(data.total   ?? 0)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [page, search, typeFilter, showInactive])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, typeFilter, showInactive])

  async function handleToggle(client: Client) {
    try {
      await fetch(`${API}/api/v1/clients/${client.id}/toggle`, { method: 'PATCH', headers: headers() })
      load()
    } catch { alert('Erro ao alterar status') }
  }

  // Métricas
  const totalAtivos    = clients.filter(c => c.isActive).length
  const comObras       = clients.filter(c => c.projectCount > 0).length
  const totalReceber   = clients.reduce((s, c) => s + c.totalReceivable, 0)
  const inadimplentes  = clients.filter(c => c.totalReceivable > 0 && !c.isActive).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie os clientes da empresa</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50">
            <RefreshCw size={13} /> Atualizar
          </button>
          <button onClick={() => { setEditingId(null); setShowModal(true) }}
            className="flex items-center gap-2 bg-[#F5A623] hover:bg-[#d4891a] text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm">
            <Plus size={16} /> Novo Cliente
          </button>
        </div>
      </div>

      {/* Cards métricas */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { title: 'Clientes ativos',  value: `${totalAtivos}`,              icon: Users,         cls: 'text-blue-600 bg-blue-100' },
          { title: 'Com obras ativas', value: `${comObras}`,                 icon: Building2,     cls: 'text-indigo-600 bg-indigo-100' },
          { title: 'Total a receber',  value: fmt(totalReceber),             icon: TrendingUp,    cls: 'text-green-600 bg-green-100' },
          { title: 'Inadimplentes',    value: `${inadimplentes}`,            icon: AlertTriangle, cls: 'text-red-600 bg-red-100' },
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

      {/* Tabela */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-gray-100">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, CPF/CNPJ, e-mail..."
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-[#F5A623]">
            <option value="">Todos os tipos</option>
            <option value="COMPANY">Pessoa Jurídica</option>
            <option value="PERSON">Pessoa Física</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
            Inativos
          </label>
          <span className="text-xs text-gray-400 ml-auto">{total} cliente{total !== 1 ? 's' : ''}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Cliente</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell">Tipo</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden lg:table-cell">CPF/CNPJ</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell">Telefone</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden lg:table-cell">Obras ativas</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">A receber</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({length: 5}).map((_,i) => (
                  <tr key={i} className="animate-pulse">
                    {[...Array(8)].map((_,j) => (
                      <td key={j} className="px-5 py-4"><div className="h-3 bg-gray-200 rounded w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : clients.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center"><Users size={22} className="text-gray-400" /></div>
                    <p className="text-sm text-gray-500">Nenhum cliente encontrado</p>
                    <button onClick={() => { setEditingId(null); setShowModal(true) }}
                      className="flex items-center gap-2 bg-[#F5A623] text-white text-xs font-semibold px-4 py-2 rounded-xl">
                      <Plus size={14} /> Novo cliente
                    </button>
                  </div>
                </td></tr>
              ) : clients.map(c => (
                <tr key={c.id} className={`hover:bg-gray-50 transition-colors ${!c.isActive ? 'opacity-60' : ''}`}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${c.type==='PERSON'?'bg-indigo-50':'bg-blue-50'}`}>
                        {c.type==='PERSON' ? <User size={14} className="text-indigo-500" /> : <Building2 size={14} className="text-blue-500" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                        {c.tradeName && <p className="text-xs text-gray-400">{c.tradeName}</p>}
                        {c.email && <p className="text-xs text-gray-400 hidden sm:block">{c.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.type==='PERSON'?'bg-indigo-100 text-indigo-700':'bg-blue-100 text-blue-700'}`}>
                      {c.type==='PERSON'?'PF':'PJ'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-500 font-mono hidden lg:table-cell">{fmtDoc(c.cpfCnpj)}</td>
                  <td className="px-5 py-4 text-xs text-gray-500 hidden md:table-cell">{fmtPhone(c.phone)}</td>
                  <td className="px-5 py-4 hidden lg:table-cell">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.projectCount>0?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>
                      {c.projectCount}
                    </span>
                  </td>
                  <td className={`px-5 py-4 text-sm font-bold tabular-nums ${c.totalReceivable>0?'text-green-600':'text-gray-400'}`}>
                    {fmt(c.totalReceivable)}
                  </td>
                  <td className="px-5 py-4">
                    {c.isActive
                      ? <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full"><CheckCircle size={10} />Ativo</span>
                      : <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full"><XCircle size={10} />Inativo</span>
                    }
                  </td>
                  <td className="px-5 py-4">
                    <TableActionMenu actions={[
                      { label: 'Ver detalhes', icon: <User size={13} />, onClick: () => router.push(`/app/financeiro/clientes/${c.id}`) },
                      { label: 'Editar', icon: <Pencil size={13} />, onClick: () => { setEditingId(c.id); setShowModal(true) } },
                      { label: c.isActive ? 'Inativar' : 'Reativar', icon: c.isActive ? <XCircle size={13} /> : <CheckCircle size={13} />, onClick: () => handleToggle(c), variant: c.isActive ? 'warning' as const : 'success' as const, separator: true },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">{(page-1)*LIMIT+1}–{Math.min(page*LIMIT, total)} de {total}</p>
            <div className="flex items-center gap-1">
              <button disabled={page<=1} onClick={() => setPage(p=>p-1)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={14} /></button>
              {Array.from({length: Math.min(pages, 5)}, (_,i) => i+1).map(n => (
                <button key={n} onClick={() => setPage(n)}
                  className={`w-7 h-7 rounded-lg text-xs font-medium ${n===page?'bg-[#F5A623] text-white':'text-gray-500 hover:bg-gray-100'}`}>{n}</button>
              ))}
              <button disabled={page>=pages} onClick={() => setPage(p=>p+1)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>

      <ClientModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditingId(null) }}
        onSaved={() => { setShowModal(false); setEditingId(null); load() }}
        editId={editingId}
        token={token()}
      />
    </div>
  )
}
