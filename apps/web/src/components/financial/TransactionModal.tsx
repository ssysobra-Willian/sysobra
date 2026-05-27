'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { NumericFormat } from 'react-number-format'
import { formatCurrency } from '@/lib/format'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Category { id: string; name: string; color: string | null; icon: string | null; type: string }
interface BankAccount { id: string; name: string; bank?: string | null }
interface Project { id: string; name: string; stages: { id: string; name: string }[] }
interface Client { id: string; name: string }
interface Supplier { id: string; name: string }

interface Allocation {
  projectId: string; stageId: string
  amount: number      // numérico — exibido via NumericFormat
  percentage: string  // percentual como string (campo livre)
  costType: string; notes: string
}

interface TransactionForm {
  type:           'INCOME' | 'EXPENSE'
  isPaid:         boolean
  description:    string
  grossAmount:    number   // numérico — exibido via NumericFormat
  interestAmount: number
  retentionAmount:number
  dueDate:        string
  paidAt:         string
  categoryId:     string
  bankAccountId:  string
  paymentMethod:  string
  invoiceNumber:  string
  clientId:       string
  supplierId:     string
  notes:          string
  projectId:      string   // vínculo direto com obra / centro de custo
  // parcelas
  installments:     string
  frequency:        string
  showInstallments: boolean
  // rateio
  allocations:     Allocation[]
  showAllocations: boolean
}

interface Props {
  open:          boolean
  onClose:       () => void
  onSaved:       () => void
  editId?:       string | null
  token:         string
  companyId?:    string
  defaultType?:  'INCOME' | 'EXPENSE'
}

const PAYMENT_METHODS = [
  { value: 'PIX',         label: 'PIX'         },
  { value: 'BOLETO',      label: 'Boleto'      },
  { value: 'TED',         label: 'TED'         },
  { value: 'TRANSFER',    label: 'Transferência'},
  { value: 'CREDIT_CARD', label: 'Cartão de Crédito' },
  { value: 'DEBIT_CARD',  label: 'Cartão de Débito'  },
  { value: 'CASH',        label: 'Dinheiro'    },
  { value: 'CHECK',       label: 'Cheque'      },
  { value: 'OTHER',       label: 'Outro'       },
]

const FREQUENCIES = [
  { value: 'WEEKLY',     label: 'Semanal'    },
  { value: 'BIWEEKLY',   label: 'Quinzenal'  },
  { value: 'MONTHLY',    label: 'Mensal'     },
  { value: 'BIMONTHLY',  label: 'Bimestral'  },
  { value: 'QUARTERLY',  label: 'Trimestral' },
  { value: 'SEMIANNUAL', label: 'Semestral'  },
  { value: 'ANNUAL',     label: 'Anual'      },
]

const COST_TYPES = [
  { value: 'MATERIAL',  label: 'Material'    },
  { value: 'LABOR',     label: 'Mão de obra' },
  { value: 'EQUIPMENT', label: 'Equipamento' },
  { value: 'SERVICE',   label: 'Serviço'     },
  { value: 'OTHER',     label: 'Outro'       },
]

const DEFAULT_FORM: TransactionForm = {
  type: 'EXPENSE', isPaid: false, description: '',
  grossAmount: 0, interestAmount: 0, retentionAmount: 0,
  dueDate: '', paidAt: '', categoryId: '', bankAccountId: '',
  paymentMethod: '', invoiceNumber: '', clientId: '', supplierId: '',
  notes: '', projectId: '', installments: '1', frequency: 'MONTHLY',
  showInstallments: false, allocations: [], showAllocations: false,
}

// Props comuns para todos os NumericFormat de moeda
const CURRENCY_FORMAT_PROPS = {
  thousandSeparator: '.',
  decimalSeparator:  ',',
  prefix:            'R$ ',
  decimalScale:      2,
  fixedDecimalScale: true,
} as const

export function TransactionModal({ open, onClose, onSaved, editId, token, defaultType }: Props) {
  const [form, setForm]           = useState<TransactionForm>(() => ({
    ...DEFAULT_FORM,
    type: defaultType ?? DEFAULT_FORM.type,
  }))
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts]   = useState<BankAccount[]>([])
  const [projects, setProjects]   = useState<Project[]>([])
  const [clients, setClients]     = useState<Client[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading]     = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [error, setError]         = useState('')

  const netAmount  = Math.max(0, form.grossAmount + form.interestAmount - form.retentionAmount)
  const allocTotal = form.allocations.reduce((s, a) => s + (a.amount || 0), 0)
  const allocDiff  = Math.abs(allocTotal - netAmount)

  // ── carregar dados ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const h = { Authorization: `Bearer ${token}` }
    Promise.all([
      fetch(`${API}/api/financial/categories`, { headers: h }).then((r) => r.json()),
      fetch(`${API}/api/financial/bank-accounts?activeOnly=true`, { headers: h }).then((r) => r.json()),
      fetch(`${API}/api/financial/projects`, { headers: h }).then((r) => r.json()),
      fetch(`${API}/api/financial/clients`, { headers: h }).then((r) => r.json()),
      fetch(`${API}/api/financial/suppliers`, { headers: h }).then((r) => r.json()),
    ]).then(([cats, accs, projs, cls, sups]) => {
      setCategories(cats.categories ?? [])
      setAccounts(accs.accounts ?? [])
      setProjects(projs.projects ?? [])
      setClients(cls.clients ?? [])
      setSuppliers(sups.suppliers ?? [])
    }).catch(() => {})
  }, [open, token])

  // ── carregar para edição via GET /transactions/:id ───────────────────────
  useEffect(() => {
    if (!open || !editId) {
      setForm({ ...DEFAULT_FORM, type: defaultType ?? DEFAULT_FORM.type })
      setError('')
      return
    }
    setEditLoading(true)
    setError('')
    fetch(`${API}/api/financial/transactions/${editId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((data) => {
        const tx = data.transaction
        if (!tx) { setError('Lançamento não encontrado'); return }
        setForm({
          ...DEFAULT_FORM,
          type:            tx.type,
          isPaid:          tx.isPaid,
          description:     tx.description,
          // Number() garante que Decimal do Prisma vira float primitivo
          grossAmount:     Number(tx.grossAmount),
          interestAmount:  Number(tx.interestAmount),
          retentionAmount: Number(tx.retentionAmount),
          dueDate:         tx.dueDate ? tx.dueDate.split('T')[0] : '',
          paidAt:          tx.paidAt  ? tx.paidAt.split('T')[0]  : '',
          categoryId:      tx.categoryId    ?? '',
          bankAccountId:   tx.bankAccountId ?? '',
          paymentMethod:   tx.paymentMethod ?? '',
          invoiceNumber:   tx.invoiceNumber ?? '',
          clientId:        tx.clientId   ?? '',
          supplierId:      tx.supplierId ?? '',
          notes:           tx.notes ?? '',
          projectId:       tx.projectId  ?? '',
          allocations:     (tx.costCenterAllocations ?? []).map((a: any) => ({
            projectId:  a.projectId,
            stageId:    a.stageId ?? '',
            amount:     Number(a.amount),
            percentage: String(Number(a.percentage)),
            costType:   a.costType ?? '',
            notes:      a.notes ?? '',
          })),
          showAllocations: (tx.costCenterAllocations ?? []).length > 0,
          installments: '1', frequency: 'MONTHLY', showInstallments: false,
        })
      })
      .catch((e: any) => setError(e.message?.includes('404') ? 'Lançamento não encontrado' : 'Erro ao carregar dados do lançamento'))
      .finally(() => setEditLoading(false))
  }, [open, editId, token, defaultType])

  function setF(k: keyof TransactionForm, v: any) {
    setForm((p) => ({ ...p, [k]: v }))
    setError('')
  }

  function addAllocation() {
    setF('allocations', [...form.allocations, { projectId: '', stageId: '', amount: 0, percentage: '', costType: '', notes: '' }])
  }
  function removeAllocation(i: number) {
    setF('allocations', form.allocations.filter((_, idx) => idx !== i))
  }
  // Para campos numéricos (amount) o val é number; para os demais é string
  function updateAllocation(i: number, key: keyof Allocation, val: string | number) {
    const updated = form.allocations.map((a, idx) => {
      if (idx !== i) return a
      const next = { ...a, [key]: val }
      // auto-calcular percentual quando muda o valor monetário
      if (key === 'amount' && netAmount > 0) {
        const amt = typeof val === 'number' ? val : 0
        next.percentage = ((amt / netAmount) * 100).toFixed(2)
      }
      // auto-calcular valor quando muda o percentual
      if (key === 'percentage' && netAmount > 0) {
        const pct = parseFloat(String(val)) || 0
        next.amount = Math.round((pct / 100) * netAmount * 100) / 100
      }
      return next
    })
    setF('allocations', updated)
  }

  // preview parcelas
  function previewInstallments() {
    const n    = parseInt(form.installments) || 1
    const base = new Date(form.dueDate || new Date().toISOString().split('T')[0])
    const dates: string[] = []
    for (let i = 0; i < Math.min(n, 6); i++) {
      const d = new Date(base)
      if (form.frequency === 'MONTHLY')    d.setMonth(d.getMonth() + i)
      else if (form.frequency === 'WEEKLY')    d.setDate(d.getDate() + i * 7)
      else if (form.frequency === 'BIWEEKLY')  d.setDate(d.getDate() + i * 14)
      else if (form.frequency === 'QUARTERLY') d.setMonth(d.getMonth() + i * 3)
      dates.push(d.toLocaleDateString('pt-BR'))
    }
    return dates
  }

  async function handleSubmit() {
    if (!form.description.trim())    { setError('Descrição obrigatória'); return }
    if (!form.grossAmount)            { setError('Valor obrigatório'); return }
    if (!form.dueDate && !form.isPaid){ setError('Data de vencimento obrigatória'); return }
    if (form.showAllocations && form.allocations.length > 0 && allocDiff > 0.01) {
      setError(`Rateio inconsistente: total ${formatCurrency(allocTotal)} ≠ valor líquido ${formatCurrency(netAmount)}`); return
    }

    setLoading(true)
    setError('')

    try {
      const body: any = {
        type:            form.type,
        isPaid:          form.isPaid,
        description:     form.description,
        grossAmount:     form.grossAmount,
        interestAmount:  form.interestAmount || 0,
        retentionAmount: form.retentionAmount || 0,
        dueDate:         form.dueDate   || null,
        paidAt:          form.paidAt    || null,
        categoryId:      form.categoryId     || null,
        bankAccountId:   form.bankAccountId  || null,
        paymentMethod:   form.paymentMethod  || null,
        invoiceNumber:   form.invoiceNumber  || null,
        clientId:        form.clientId       || null,
        supplierId:      form.supplierId     || null,
        notes:           form.notes          || null,
        projectId:       form.projectId      || null,
        costCenterAllocations: form.showAllocations
          ? form.allocations
              .filter((a) => a.projectId)
              .map((a) => ({
                projectId: a.projectId,
                stageId:   a.stageId   || null,
                amount:    a.amount    || 0,
                percentage:parseFloat(a.percentage) || 0,
                costType:  a.costType  || null,
                notes:     a.notes     || null,
              }))
          : [],
      }

      // se for recorrente, usar endpoint específico
      if (form.showInstallments && parseInt(form.installments) > 1) {
        const recBody = {
          description:      form.description,
          type:             form.type,
          grossAmount:      form.grossAmount,
          interestAmount:   form.interestAmount || 0,
          retentionAmount:  form.retentionAmount || 0,
          categoryId:       form.categoryId    || null,
          bankAccountId:    form.bankAccountId || null,
          supplierId:       form.supplierId    || null,
          clientId:         form.clientId      || null,
          notes:            form.notes         || null,
          frequency:        form.frequency,
          startDate:        form.dueDate || new Date().toISOString().split('T')[0],
          totalInstallments:parseInt(form.installments),
        }
        const res = await fetch(`${API}/api/financial/recurring`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(recBody),
        })
        if (!res.ok) throw new Error((await res.json()).error || 'Erro ao criar recorrência')
      } else {
        const url = editId
          ? `${API}/api/financial/transactions/${editId}`
          : `${API}/api/financial/transactions`
        const res = await fetch(url, {
          method:  editId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error((await res.json()).error || 'Erro ao salvar lançamento')
      }

      onSaved()
      onClose()
      setForm(DEFAULT_FORM)
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  const filteredCats = categories.filter((c) =>
    c.type === form.type || c.type === 'BOTH'
  )

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative min-h-screen flex items-start justify-center py-8 px-4">
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
          {/* Overlay de carregamento de edição */}
          {editLoading && (
            <div className="absolute inset-0 bg-white/80 rounded-2xl flex items-center justify-center z-10">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <svg className="animate-spin w-4 h-4 text-[#F5A623]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Carregando dados...
              </div>
            </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">
              {editId ? 'Editar lançamento' : 'Novo lançamento'}
            </h2>
            <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Tipo + Status */}
            <div className="flex gap-3">
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-1">
                {(['INCOME', 'EXPENSE'] as const).map((t) => (
                  <button key={t} onClick={() => setF('type', t)}
                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                      form.type === t ? 'bg-[#F5A623] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}>
                    {t === 'INCOME' ? '↑ Entrada' : '↓ Saída'}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                {[{ v: false, l: 'Pendente', cls: 'bg-amber-500' }, { v: true, l: 'Pago', cls: 'bg-green-500' }].map(({ v, l, cls }) => (
                  <button key={String(v)} onClick={() => setF('isPaid', v)}
                    className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                      form.isPaid === v ? `${cls} text-white shadow-sm` : 'text-gray-500 hover:text-gray-700'
                    }`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Descrição */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Descrição *</label>
              <input value={form.description} onChange={(e) => setF('description', e.target.value)}
                placeholder="Ex: Compra de cimento Portland"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
            </div>

            {/* Valores */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Valor bruto *</label>
                <NumericFormat
                  {...CURRENCY_FORMAT_PROPS}
                  value={form.grossAmount || ''}
                  onValueChange={(v) => setF('grossAmount', v.floatValue ?? 0)}
                  placeholder="R$ 0,00"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Juros/acréscimo</label>
                <NumericFormat
                  {...CURRENCY_FORMAT_PROPS}
                  value={form.interestAmount || ''}
                  onValueChange={(v) => setF('interestAmount', v.floatValue ?? 0)}
                  placeholder="R$ 0,00"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Retenção/desconto</label>
                <NumericFormat
                  {...CURRENCY_FORMAT_PROPS}
                  value={form.retentionAmount || ''}
                  onValueChange={(v) => setF('retentionAmount', v.floatValue ?? 0)}
                  placeholder="R$ 0,00"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Valor líquido</label>
                <NumericFormat
                  {...CURRENCY_FORMAT_PROPS}
                  value={netAmount}
                  readOnly
                  displayType="input"
                  className="w-full px-3 py-2.5 border border-gray-100 rounded-lg text-sm bg-gray-50 text-gray-500 cursor-default"
                />
              </div>
            </div>

            {/* Categoria + Conta */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Categoria *</label>
                <select value={form.categoryId} onChange={(e) => setF('categoryId', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] bg-white">
                  <option value="">Selecionar...</option>
                  {filteredCats.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Conta bancária</label>
                <select value={form.bankAccountId} onChange={(e) => setF('bankAccountId', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] bg-white">
                  <option value="">Nenhuma</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Datas */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Vencimento *</label>
                <input type="date" value={form.dueDate} onChange={(e) => setF('dueDate', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
              </div>
              {form.isPaid && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Data pagamento</label>
                  <input type="date" value={form.paidAt} onChange={(e) => setF('paidAt', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
                </div>
              )}
            </div>

            {/* Forma de pagamento + NF */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Forma de pagamento</label>
                <select value={form.paymentMethod} onChange={(e) => setF('paymentMethod', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] bg-white">
                  <option value="">Selecionar...</option>
                  {PAYMENT_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">NF / Documento</label>
                <input value={form.invoiceNumber} onChange={(e) => setF('invoiceNumber', e.target.value)}
                  placeholder="Nº da nota fiscal"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
              </div>
            </div>

            {/* Cliente / Fornecedor */}
            {form.type === 'INCOME' ? (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Cliente</label>
                <select value={form.clientId} onChange={(e) => setF('clientId', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] bg-white">
                  <option value="">Selecionar...</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Fornecedor / Prestador</label>
                <select value={form.supplierId} onChange={(e) => setF('supplierId', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] bg-white">
                  <option value="">Selecionar...</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            {/* Obra / Centro de Custo */}
            {projects.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">🏗️ Obra / Centro de custo</label>
                <select value={form.projectId} onChange={(e) => setF('projectId', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] bg-white">
                  <option value="">Nenhuma obra vinculada</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Observações */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Observações</label>
              <textarea value={form.notes} onChange={(e) => setF('notes', e.target.value)}
                rows={2} placeholder="Notas adicionais..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] resize-none" />
            </div>

            {/* RATEIO */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setF('showAllocations', !form.showAllocations)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="text-sm font-semibold text-gray-700">🏗️ Ratear por centro de custo</span>
                {form.showAllocations ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </button>

              {form.showAllocations && (
                <div className="p-4 space-y-3">
                  {/* indicador */}
                  <div className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${
                    allocDiff <= 0.01 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  }`}>
                    <span>Total alocado: {formatCurrency(allocTotal)}</span>
                    <span>Valor líquido: {formatCurrency(netAmount)}</span>
                    {allocDiff > 0.01 && <span>⚠️ Diferença: {formatCurrency(allocDiff)}</span>}
                  </div>

                  {form.allocations.map((alloc, i) => {
                    const proj = projects.find((p) => p.id === alloc.projectId)
                    return (
                      <div key={i} className="grid grid-cols-12 gap-2 items-start">
                        <div className="col-span-4">
                          <select value={alloc.projectId}
                            onChange={(e) => updateAllocation(i, 'projectId', e.target.value)}
                            className="w-full px-2 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#F5A623] bg-white">
                            <option value="">Obra...</option>
                            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                        <div className="col-span-3">
                          <select value={alloc.stageId}
                            onChange={(e) => updateAllocation(i, 'stageId', e.target.value)}
                            className="w-full px-2 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#F5A623] bg-white">
                            <option value="">Etapa</option>
                            {(proj?.stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <NumericFormat
                            {...CURRENCY_FORMAT_PROPS}
                            prefix=""
                            value={alloc.amount || ''}
                            onValueChange={(v) => updateAllocation(i, 'amount', v.floatValue ?? 0)}
                            placeholder="0,00"
                            className="w-full px-2 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#F5A623]"
                          />
                        </div>
                        <div className="col-span-2">
                          <input value={alloc.percentage}
                            onChange={(e) => updateAllocation(i, 'percentage', e.target.value)}
                            placeholder="%"
                            className="w-full px-2 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#F5A623]" />
                        </div>
                        <div className="col-span-1 flex justify-center pt-1">
                          <button onClick={() => removeAllocation(i)}
                            className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  <button onClick={addAllocation}
                    className="flex items-center gap-1.5 text-xs text-[#F5A623] hover:text-[#d4891a] font-medium">
                    <Plus size={14} />
                    Adicionar centro de custo
                  </button>
                </div>
              )}
            </div>

            {/* PARCELAS (só para novo) */}
            {!editId && (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setF('showInstallments', !form.showInstallments)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span className="text-sm font-semibold text-gray-700">📅 Parcelar / Recorrente</span>
                  {form.showInstallments ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </button>

                {form.showInstallments && (
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Parcelas (1-120)</label>
                        <input type="number" min="1" max="120" value={form.installments}
                          onChange={(e) => setF('installments', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Frequência</label>
                        <select value={form.frequency} onChange={(e) => setF('frequency', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] bg-white">
                          {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                      </div>
                    </div>
                    {parseInt(form.installments) > 1 && form.dueDate && (
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-blue-700 mb-1">Preview das primeiras parcelas:</p>
                        {previewInstallments().map((d, i) => (
                          <p key={i} className="text-xs text-blue-600">
                            Parcela {i + 1}: {d} — {formatCurrency(netAmount)}
                          </p>
                        ))}
                        {parseInt(form.installments) > 6 && (
                          <p className="text-xs text-blue-400 mt-1">... e mais {parseInt(form.installments) - 6} parcelas</p>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-gray-400">
                      ℹ️ Cada parcela será criada como lançamento individual pendente.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Erro */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
            <button onClick={onClose}
              className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={loading}
              className="px-6 py-2.5 bg-[#F5A623] text-white rounded-xl text-sm font-semibold hover:bg-[#d4891a] transition-colors disabled:opacity-60">
              {loading ? 'Salvando...' : (editId ? 'Atualizar' : 'Salvar lançamento')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
