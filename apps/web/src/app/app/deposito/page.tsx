'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Package, Plus, Search, Filter, X, ChevronDown, ChevronUp,
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, RefreshCw,
  Hammer, ShieldCheck, Shirt, Layers, BarChart2, Clock,
  Warehouse, Loader2, CheckCircle2, XCircle, RotateCcw,
  Edit2, ClipboardList, Users, FileText, CheckCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'
import { BasketModal, type BasketPayload } from '@/components/deposit/BasketModal'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
function token() { return typeof window !== 'undefined' ? (localStorage.getItem('token') ?? '') : '' }
function companyIdHeader() { return typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : '' }

async function apiFetch(path: string, options: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      'x-company-id': companyIdHeader(),
      ...(options.headers ?? {}),
    },
  })
}

// ─── types ───────────────────────────────────────────────────────────────────

interface SupplierLotSummary {
  id:            string
  lotNumber?:    string | null
  invoiceNumber?: string | null
  quantity:      number
  unitCost?:     number | null
  expiryDate?:   string | null
  supplier?:     { id: string; name: string } | null
}

interface StockItem {
  id: string
  name: string
  description?: string | null
  category?: string | null
  unit: string
  quantity: number
  minQuantity: number
  maxQuantity?: number | null
  unitCost?: number | null
  averageCost?: number | null
  location?: string | null
  locationFull?: string | null
  code?: string | null
  imageUrl?: string | null
  brand?: string | null
  model?: string | null
  serialNumber?: string | null
  isConsumable: boolean
  requiresCustody: boolean
  isEpi: boolean
  isUniform: boolean
  isActive: boolean
  isUnderWarranty?: boolean
  nextMaintenance?: string | null
  currentProject?: { id: string; name: string } | null
  supplierLots?: SupplierLotSummary[]
  _count?: { movements: number; custodies: number; epiDeliveries: number }
}

interface StockMovement {
  id: string
  type: string
  quantity: number
  unitCost?: number | null
  reason?: string | null
  notes?: string | null
  createdAt: string
  stockItem: { id: string; name: string; unit: string }
  project?: { id: string; name: string } | null
  employee?: { id: string; name: string } | null
  responsible?: { id: string; name: string } | null
}

interface ToolCustody {
  id: string
  quantity: number
  checkedOutAt: string
  dueDate?: string | null
  returnedAt?: string | null
  condition?: string | null
  stockItem: { id: string; name: string; unit: string; brand?: string | null; serialNumber?: string | null }
  employee: { id: string; name: string; position?: string | null }
  project?: { id: string; name: string } | null
}

interface Summary {
  totalItems: number
  lowStockCount: number
  lowStockItems: { id: string; name: string; quantity: number; minQuantity: number; unit: string }[]
  totalMovementsToday: number
  openCustodies: number
  openBaskets: number
  estimatedTotalValue: number
}

interface Employee {
  id: string
  name: string
  position?: string | null
}

interface Project {
  id: string
  name: string
}

// ─── constants ───────────────────────────────────────────────────────────────

const MOVEMENT_TYPES = [
  { value: 'IN',          label: 'Entrada',     icon: ArrowDownToLine, color: 'text-green-600' },
  { value: 'OUT',         label: 'Saída',       icon: ArrowUpFromLine, color: 'text-red-500' },
  { value: 'RETURN',      label: 'Devolução',   icon: RotateCcw,       color: 'text-blue-500' },
  { value: 'LOSS',        label: 'Perda',       icon: XCircle,         color: 'text-orange-500' },
  { value: 'ADJUSTMENT',  label: 'Ajuste',      icon: RefreshCw,       color: 'text-purple-500' },
  { value: 'TRANSFER',    label: 'Transferência', icon: Layers,        color: 'text-indigo-500' },
  { value: 'EPI_DELIVERY',label: 'Entrega EPI', icon: ShieldCheck,    color: 'text-teal-500' },
]

const TABS = [
  { id: 'items',      label: 'Itens',       icon: Package },
  { id: 'movements',  label: 'Movimentos',  icon: Clock },
  { id: 'custodies',  label: 'Custódia',    icon: Hammer },
  { id: 'epis',       label: 'EPIs',        icon: ShieldCheck },
  { id: 'baskets',    label: 'Romaneios',   icon: FileText },
]

// ─── Basket types ─────────────────────────────────────────────────────────────

interface StockBasket {
  id:          string
  docNumber:   string
  type:        string
  status:      string
  destinatary?: string | null
  notes?:      string | null
  signedAt?:   string | null
  createdAt:   string
  project?:    { id: string; name: string } | null
  employee?:   { id: string; name: string } | null
  _count?:     { movements: number }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function movTypeInfo(type: string) {
  return MOVEMENT_TYPES.find((m) => m.value === type) ?? MOVEMENT_TYPES[0]
}

function qtyColor(item: StockItem) {
  if (item.minQuantity > 0 && item.quantity <= 0) return 'text-red-600 font-bold'
  if (item.minQuantity > 0 && item.quantity <= item.minQuantity) return 'text-orange-500 font-semibold'
  return 'text-green-600 font-semibold'
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── sub-components ──────────────────────────────────────────────────────────

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', className)}>
      {children}
    </span>
  )
}

function ItemTypeBadges({ item }: { item: StockItem }) {
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {item.isEpi      && <Badge className="bg-teal-100 text-teal-700"><ShieldCheck size={10} />EPI</Badge>}
      {item.isUniform  && <Badge className="bg-blue-100 text-blue-700"><Shirt size={10} />Uniforme</Badge>}
      {item.requiresCustody && <Badge className="bg-amber-100 text-amber-700"><Hammer size={10} />Ferramenta</Badge>}
      {item.isConsumable && !item.isEpi && !item.isUniform && !item.requiresCustody
        && <Badge className="bg-gray-100 text-gray-600"><Package size={10} />Consumível</Badge>}
    </div>
  )
}

// ─── bottom sheet for new movement ───────────────────────────────────────────

interface MovementSheetProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  preselectedItem?: StockItem | null
  items: StockItem[]
  employees: Employee[]
  projects: Project[]
}

function MovementSheet({ open, onClose, onSuccess, preselectedItem, items, employees, projects }: MovementSheetProps) {
  const [form, setForm] = useState({
    stockItemId:       preselectedItem?.id ?? '',
    type:              'IN' as string,
    quantity:          '',
    unitCost:          '',
    projectId:         '',
    employeeId:        '',
    reason:            '',
    notes:             '',
    registerCostEntry: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (open) {
      setForm((f) => ({ ...f, stockItemId: preselectedItem?.id ?? '' }))
      setError('')
    }
  }, [open, preselectedItem])

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.stockItemId || !form.quantity) {
      setError('Preencha item e quantidade')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await apiFetch('/api/v1/deposit/movements', {
        method: 'POST',
        body: JSON.stringify({
          stockItemId:       form.stockItemId,
          type:              form.type,
          quantity:          Number(form.quantity),
          unitCost:          form.unitCost ? Number(form.unitCost) : undefined,
          projectId:         form.projectId || undefined,
          employeeId:        form.employeeId || undefined,
          reason:            form.reason || undefined,
          notes:             form.notes || undefined,
          registerCostEntry: form.registerCostEntry,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Erro ao registrar')
      }
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const selectedItem = items.find((i) => i.id === form.stockItemId)
  const isExit = ['OUT', 'LOSS', 'EPI_DELIVERY', 'TRANSFER'].includes(form.type)
  const isEntry = ['IN', 'RETURN'].includes(form.type)

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      )}
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full'
        )}
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b">
          <h2 className="text-base font-semibold text-gray-900">Registrar Movimento</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo de movimento</label>
            <div className="grid grid-cols-2 gap-2">
              {MOVEMENT_TYPES.map((mt) => (
                <button
                  key={mt.value}
                  type="button"
                  onClick={() => set('type', mt.value)}
                  className={cn(
                    'flex items-center gap-2 p-2.5 rounded-xl border text-sm font-medium transition-all',
                    form.type === mt.value
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  )}
                >
                  <mt.icon size={16} className={form.type === mt.value ? 'text-indigo-500' : mt.color} />
                  {mt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Item */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Item *</label>
            <select
              value={form.stockItemId}
              onChange={(e) => set('stockItemId', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">Selecione o item…</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.name} {i.code ? `(${i.code})` : ''}</option>
              ))}
            </select>
            {selectedItem && (
              <p className="text-xs text-gray-500 mt-1">
                Estoque atual: <strong className={qtyColor(selectedItem)}>{selectedItem.quantity} {selectedItem.unit}</strong>
                {selectedItem.averageCost ? ` · Custo médio: ${formatCurrency(selectedItem.averageCost)}` : ''}
              </p>
            )}
          </div>

          {/* Quantidade + Custo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Quantidade *</label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={form.quantity}
                onChange={(e) => set('quantity', e.target.value)}
                placeholder={form.type === 'ADJUSTMENT' ? 'Novo total' : 'Qtd'}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            {isEntry && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Custo unitário (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.unitCost}
                  onChange={(e) => set('unitCost', e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            )}
          </div>

          {/* Colaborador (para saídas) */}
          {(isExit || form.type === 'EPI_DELIVERY') && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Colaborador</label>
              <select
                value={form.employeeId}
                onChange={(e) => set('employeeId', e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="">Selecione…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Obra */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Obra / Projeto</label>
            <select
              value={form.projectId}
              onChange={(e) => set('projectId', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">Sem obra específica</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Reclassificação (saída para obra) */}
          {form.type === 'OUT' && form.projectId && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.registerCostEntry}
                onChange={(e) => set('registerCostEntry', e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
              />
              <span className="text-sm text-gray-700">Reclassificar custo para a obra</span>
            </label>
          )}

          {/* Motivo + Obs */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Motivo / Razão</label>
            <input
              type="text"
              value={form.reason}
              onChange={(e) => set('reason', e.target.value)}
              placeholder="Ex: Compra, obra 01, ajuste de inventário..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Observações</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">
              <AlertTriangle size={15} /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white py-3 text-sm font-semibold transition disabled:opacity-60"
          >
            {saving ? <Loader2 size={18} className="animate-spin mx-auto" /> : 'Registrar Movimento'}
          </button>
        </form>
      </div>
    </>
  )
}

// ─── bottom sheet for new item ────────────────────────────────────────────────

interface ItemSheetProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  editItem?: StockItem | null
}

function ItemSheet({ open, onClose, onSuccess, editItem }: ItemSheetProps) {
  const [form, setForm] = useState({
    name: '', description: '', category: '', unit: 'un', code: '',
    brand: '', model: '', serialNumber: '', location: '',
    minQuantity: '', maxQuantity: '',
    isConsumable: true, requiresCustody: false, isEpi: false, isUniform: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (open && editItem) {
      setForm({
        name:            editItem.name,
        description:     editItem.description ?? '',
        category:        editItem.category ?? '',
        unit:            editItem.unit,
        code:            editItem.code ?? '',
        brand:           editItem.brand ?? '',
        model:           editItem.model ?? '',
        serialNumber:    editItem.serialNumber ?? '',
        location:        editItem.location ?? '',
        minQuantity:     editItem.minQuantity > 0 ? String(editItem.minQuantity) : '',
        maxQuantity:     editItem.maxQuantity ? String(editItem.maxQuantity) : '',
        isConsumable:    editItem.isConsumable,
        requiresCustody: editItem.requiresCustody,
        isEpi:           editItem.isEpi,
        isUniform:       editItem.isUniform,
      })
    } else if (open && !editItem) {
      setForm({
        name: '', description: '', category: '', unit: 'un', code: '',
        brand: '', model: '', serialNumber: '', location: '',
        minQuantity: '', maxQuantity: '',
        isConsumable: true, requiresCustody: false, isEpi: false, isUniform: false,
      })
    }
    setError('')
  }, [open, editItem])

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Nome obrigatório'); return }
    setSaving(true)
    setError('')
    try {
      const url    = editItem ? `/api/v1/deposit/items/${editItem.id}` : '/api/v1/deposit/items'
      const method = editItem ? 'PUT' : 'POST'
      const res    = await apiFetch(url, {
        method,
        body: JSON.stringify({
          name:            form.name.trim(),
          description:     form.description || undefined,
          category:        form.category || undefined,
          unit:            form.unit,
          code:            form.code || undefined,
          brand:           form.brand || undefined,
          model:           form.model || undefined,
          serialNumber:    form.serialNumber || undefined,
          location:        form.location || undefined,
          minQuantity:     form.minQuantity ? Number(form.minQuantity) : 0,
          maxQuantity:     form.maxQuantity ? Number(form.maxQuantity) : undefined,
          isConsumable:    form.isConsumable,
          requiresCustody: form.requiresCustody,
          isEpi:           form.isEpi,
          isUniform:       form.isUniform,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Erro ao salvar')
      }
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />}
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full'
        )}
        style={{ maxHeight: '92vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b">
          <h2 className="text-base font-semibold text-gray-900">
            {editItem ? 'Editar Item' : 'Novo Item no Depósito'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Classificação */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Classificação</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'isConsumable',    label: 'Consumível',   icon: Package,     color: 'bg-gray-100 text-gray-700' },
                { key: 'requiresCustody', label: 'Ferramenta',   icon: Hammer,      color: 'bg-amber-100 text-amber-700' },
                { key: 'isEpi',           label: 'EPI',          icon: ShieldCheck, color: 'bg-teal-100 text-teal-700' },
                { key: 'isUniform',       label: 'Uniforme',     icon: Shirt,       color: 'bg-blue-100 text-blue-700' },
              ].map(({ key, label, icon: Icon, color }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set(key, !(form as any)[key])}
                  className={cn(
                    'flex items-center gap-2 p-2.5 rounded-xl border text-sm font-medium transition-all',
                    (form as any)[key]
                      ? `border-transparent ${color}`
                      : 'border-gray-200 text-gray-400 hover:border-gray-300'
                  )}
                >
                  <Icon size={15} /> {label}
                  {(form as any)[key] && <CheckCircle2 size={12} className="ml-auto" />}
                </button>
              ))}
            </div>
          </div>

          {/* Nome + Código */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Nome *</label>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Nome do item"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Código</label>
              <input
                value={form.code}
                onChange={(e) => set('code', e.target.value)}
                placeholder="MAT-001"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>

          {/* Categoria + Unidade */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Categoria</label>
              <input
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
                placeholder="Ex: Ferragem, EPI..."
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Unidade</label>
              <select
                value={form.unit}
                onChange={(e) => set('unit', e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {['un','m','m²','m³','kg','L','cx','pc','par','rolo','sc','tb','vb'].map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Marca / Modelo / N° Série (ferramentas) */}
          {form.requiresCustody && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Marca</label>
                <input value={form.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Bosch..." className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Modelo</label>
                <input value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="GBH 2-26" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">N° Série</label>
                <input value={form.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} placeholder="SN123" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>
          )}

          {/* Estoque mínimo / máximo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Estoque mínimo</label>
              <input
                type="number" step="0.001" min="0"
                value={form.minQuantity}
                onChange={(e) => set('minQuantity', e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Estoque máximo</label>
              <input
                type="number" step="0.001" min="0"
                value={form.maxQuantity}
                onChange={(e) => set('maxQuantity', e.target.value)}
                placeholder="Opcional"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>

          {/* Localização */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Localização no depósito</label>
            <input
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="Ex: Prateleira A2, Setor EPI..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Descrição</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Detalhes adicionais…"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">
              <AlertTriangle size={15} /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white py-3 text-sm font-semibold transition disabled:opacity-60"
          >
            {saving ? <Loader2 size={18} className="animate-spin mx-auto" /> : (editItem ? 'Salvar Alterações' : 'Criar Item')}
          </button>
        </form>
      </div>
    </>
  )
}

// ─── custody return sheet ─────────────────────────────────────────────────────

function CustodyReturnSheet({
  open, custody, onClose, onSuccess,
}: {
  open: boolean
  custody: ToolCustody | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [condition, setCondition] = useState('')
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    if (open) { setCondition(''); setNotes(''); setError('') }
  }, [open])

  async function handleReturn() {
    if (!custody) return
    setSaving(true)
    setError('')
    try {
      const res = await apiFetch(`/api/v1/deposit/custodies/${custody.id}/return`, {
        method: 'PUT',
        body: JSON.stringify({ conditionOnReturn: condition || undefined, notes: notes || undefined }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Erro ao devolver')
      }
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />}
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full'
        )}
        style={{ maxHeight: '80vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b">
          <h2 className="text-base font-semibold text-gray-900">Devolver Ferramenta</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100"><X size={18} /></button>
        </div>

        {custody && (
          <div className="p-4 space-y-4">
            <div className="bg-amber-50 rounded-xl p-3 text-sm">
              <p className="font-semibold text-amber-800">{custody.stockItem.name}</p>
              <p className="text-amber-600">{custody.employee.name} · {custody.quantity} {custody.stockItem.unit}</p>
              {custody.project && <p className="text-amber-600">Obra: {custody.project.name}</p>}
              <p className="text-amber-500 text-xs mt-1">Saída: {formatDate(custody.checkedOutAt)}</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Estado na devolução</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="">Selecione…</option>
                <option value="Bom">Bom</option>
                <option value="Com desgaste">Com desgaste</option>
                <option value="Danificado">Danificado</option>
                <option value="Necessita manutenção">Necessita manutenção</option>
                <option value="Perdido">Perdido</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Observações</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">
                <AlertTriangle size={15} /> {error}
              </div>
            )}

            <button
              onClick={handleReturn}
              disabled={saving}
              className="w-full rounded-xl bg-green-600 hover:bg-green-700 text-white py-3 text-sm font-semibold transition disabled:opacity-60"
            >
              {saving ? <Loader2 size={18} className="animate-spin mx-auto" /> : 'Confirmar Devolução'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function DepositoPage() {
  const router = useRouter()

  // tabs
  const [activeTab, setActiveTab] = useState<'items' | 'movements' | 'custodies' | 'epis' | 'baskets'>('items')

  // items
  const [items, setItems]               = useState<StockItem[]>([])
  const [itemsTotal, setItemsTotal]     = useState(0)
  const [itemsPage, setItemsPage]       = useState(1)
  const [itemsLoading, setItemsLoading] = useState(false)

  // movements
  const [movements, setMovements]             = useState<StockMovement[]>([])
  const [movementsTotal, setMovementsTotal]   = useState(0)
  const [movementsPage, setMovementsPage]     = useState(1)
  const [movementsLoading, setMovementsLoading] = useState(false)

  // custodies
  const [custodies, setCustodies]           = useState<ToolCustody[]>([])
  const [custodiesTotal, setCustodiesTotal] = useState(0)
  const [custodiesLoading, setCustodiesLoading] = useState(false)

  // summary
  const [summary, setSummary]   = useState<Summary | null>(null)

  // filters
  const [search, setSearch]             = useState('')
  const [filterType, setFilterType]     = useState('')
  const [filterLowStock, setFilterLowStock] = useState(false)
  const [showFilters, setShowFilters]   = useState(false)
  const [filterCustodyProject, setFilterCustodyProject] = useState('')

  // baskets
  const [baskets, setBaskets]             = useState<StockBasket[]>([])
  const [basketsTotal, setBasketsTotal]   = useState(0)
  const [basketsLoading, setBasketsLoading] = useState(false)
  const [basketModalOpen, setBasketModalOpen] = useState(false)

  // sheets
  const [movSheetOpen, setMovSheetOpen]   = useState(false)
  const [itemSheetOpen, setItemSheetOpen] = useState(false)
  const [editItem, setEditItem]           = useState<StockItem | null>(null)
  const [preselectedItem, setPreselectedItem] = useState<StockItem | null>(null)
  const [returnSheetOpen, setReturnSheetOpen] = useState(false)
  const [returnCustody, setReturnCustody]     = useState<ToolCustody | null>(null)

  // aux data
  const [employees, setEmployees] = useState<Employee[]>([])
  const [projects, setProjects]   = useState<Project[]>([])

  // fab expanded
  const [fabOpen, setFabOpen] = useState(false)

  // ── loaders ────────────────────────────────────────────────────────────────

  const loadItems = useCallback(async (page = 1) => {
    setItemsLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '30' })
      if (search)           params.set('q', search)
      if (filterType)       params.set('type', filterType)
      if (filterLowStock)   params.set('lowStock', 'true')
      const res  = await apiFetch(`/api/v1/deposit/items?${params}`)
      const data = await res.json()
      setItems(data.items ?? [])
      setItemsTotal(data.total ?? 0)
      setItemsPage(page)
    } finally {
      setItemsLoading(false)
    }
  }, [search, filterType, filterLowStock])

  const loadMovements = useCallback(async (page = 1) => {
    setMovementsLoading(true)
    try {
      const res  = await apiFetch(`/api/v1/deposit/movements?page=${page}&limit=30`)
      const data = await res.json()
      setMovements(data.movements ?? [])
      setMovementsTotal(data.total ?? 0)
      setMovementsPage(page)
    } finally {
      setMovementsLoading(false)
    }
  }, [])

  const loadCustodies = useCallback(async () => {
    setCustodiesLoading(true)
    try {
      const params = new URLSearchParams({ open: 'true', limit: '50' })
      if (filterCustodyProject) params.set('projectId', filterCustodyProject)
      const res  = await apiFetch(`/api/v1/deposit/custodies?${params}`)
      const data = await res.json()
      setCustodies(data.custodies ?? [])
      setCustodiesTotal(data.total ?? 0)
    } finally {
      setCustodiesLoading(false)
    }
  }, [filterCustodyProject])

  const loadBaskets = useCallback(async () => {
    setBasketsLoading(true)
    try {
      const res  = await apiFetch('/api/v1/deposit/baskets?limit=30')
      const data = await res.json()
      setBaskets(data.baskets ?? [])
      setBasketsTotal(data.total ?? 0)
    } finally {
      setBasketsLoading(false)
    }
  }, [])

  const loadSummary = useCallback(async () => {
    try {
      const res  = await apiFetch('/api/v1/deposit/summary')
      const data = await res.json()
      setSummary(data)
    } catch {}
  }, [])

  const loadAux = useCallback(async () => {
    try {
      const [eRes, pRes] = await Promise.all([
        apiFetch('/api/v1/employees?limit=200&status=ACTIVE'),
        apiFetch('/api/v1/projects?limit=100'),
      ])
      const eData = await eRes.json()
      const pData = await pRes.json()
      setEmployees(eData.employees ?? eData ?? [])
      setProjects(pData.projects ?? pData ?? [])
    } catch {}
  }, [])

  useEffect(() => {
    loadSummary()
    loadAux()
  }, [loadSummary, loadAux])

  useEffect(() => {
    if (activeTab === 'items')     loadItems(1)
    if (activeTab === 'movements') loadMovements(1)
    if (activeTab === 'custodies') loadCustodies()
    if (activeTab === 'baskets')   loadBaskets()
  }, [activeTab, loadItems, loadMovements, loadCustodies, loadBaskets])

  useEffect(() => {
    if (activeTab === 'custodies') loadCustodies()
  }, [filterCustodyProject])

  useEffect(() => {
    if (activeTab === 'items') loadItems(1)
  }, [search, filterType, filterLowStock])

  function openMovSheet(item?: StockItem) {
    setPreselectedItem(item ?? null)
    setMovSheetOpen(true)
    setFabOpen(false)
  }

  function openItemSheet(item?: StockItem) {
    setEditItem(item ?? null)
    setItemSheetOpen(true)
    setFabOpen(false)
  }

  function openReturnSheet(custody: ToolCustody) {
    setReturnCustody(custody)
    setReturnSheetOpen(true)
  }

  function refreshAll() {
    loadSummary()
    if (activeTab === 'items')     loadItems(1)
    if (activeTab === 'movements') loadMovements(1)
    if (activeTab === 'custodies') loadCustodies()
    if (activeTab === 'baskets')   loadBaskets()
  }

  async function handleBasketConfirm(data: BasketPayload) {
    const res = await apiFetch('/api/v1/deposit/baskets', {
      method: 'POST',
      body: JSON.stringify({
        type:       data.type,
        projectId:  data.projectId,
        employeeId: data.employeeId,
        destinatary: data.destinatary,
        notes:      data.notes,
        items:      data.items,
      }),
    })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error ?? 'Erro ao criar romaneio')
    }
    const basket = await res.json()

    // Se há assinaturas, enviá-las
    if (data.senderSignature || data.receiverSignature) {
      const signRes = await apiFetch(`/api/v1/deposit/baskets/${basket.id}/sign`, {
        method: 'PATCH',
        body: JSON.stringify({
          senderSignature:   data.senderSignature,
          receiverSignature: data.receiverSignature,
        }),
      })
      if (!signRes.ok) {
        // Não lança erro, romaneio criado mas assinatura falhou
        console.warn('Falha ao salvar assinaturas')
      }
    }

    setBasketModalOpen(false)
    refreshAll()
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b sticky top-0 z-20">
        <div className="flex items-center gap-3 px-4 pt-4 pb-2">
          <Warehouse size={22} className="text-indigo-600 shrink-0" />
          <h1 className="text-lg font-bold text-gray-900 flex-1">Depósito</h1>
          <button
            onClick={refreshAll}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
            title="Atualizar"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        {/* Summary chips */}
        {summary && (
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5 bg-indigo-50 rounded-full px-3 py-1.5 text-xs font-medium text-indigo-700 whitespace-nowrap shrink-0">
              <Package size={12} /> {summary.totalItems} itens
            </div>
            {summary.lowStockCount > 0 && (
              <div className="flex items-center gap-1.5 bg-orange-50 rounded-full px-3 py-1.5 text-xs font-medium text-orange-600 whitespace-nowrap shrink-0">
                <AlertTriangle size={12} /> {summary.lowStockCount} baixo estoque
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-amber-50 rounded-full px-3 py-1.5 text-xs font-medium text-amber-700 whitespace-nowrap shrink-0">
              <Hammer size={12} /> {summary.openCustodies} em custódia
            </div>
            <div className="flex items-center gap-1.5 bg-green-50 rounded-full px-3 py-1.5 text-xs font-medium text-green-700 whitespace-nowrap shrink-0">
              <BarChart2 size={12} /> {formatCurrency(summary.estimatedTotalValue)}
            </div>
            {(summary.openBaskets ?? 0) > 0 && (
              <button
                onClick={() => setActiveTab('baskets')}
                className="flex items-center gap-1.5 bg-amber-100 rounded-full px-3 py-1.5 text-xs font-medium text-amber-800 whitespace-nowrap shrink-0"
              >
                <FileText size={12} /> {summary.openBaskets} romaneio{summary.openBaskets !== 1 ? 's' : ''} pendente{summary.openBaskets !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-t">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500'
              )}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Search + Filter ─────────────────────────────────────────────────── */}
      {activeTab === 'items' && (
        <div className="px-4 pt-3 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar item, código…"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all',
                (filterType || filterLowStock)
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 text-gray-600 bg-white'
              )}
            >
              <Filter size={16} />
              {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {showFilters && (
            <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Tipo de item</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: '',           label: 'Todos' },
                    { value: 'consumable', label: 'Consumível' },
                    { value: 'tool',       label: 'Ferramenta' },
                    { value: 'epi',        label: 'EPI' },
                    { value: 'uniform',    label: 'Uniforme' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFilterType(opt.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                        filterType === opt.value
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-gray-200 text-gray-600'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterLowStock}
                  onChange={(e) => setFilterLowStock(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
                />
                <span className="text-sm text-gray-700 flex items-center gap-1">
                  <AlertTriangle size={13} className="text-orange-500" />
                  Somente estoque baixo
                </span>
              </label>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Items ──────────────────────────────────────────────────────── */}
      {activeTab === 'items' && (
        <div className="px-4 pt-3 space-y-3">
          {itemsLoading && items.length === 0 && (
            <div className="flex justify-center py-12">
              <Loader2 size={28} className="animate-spin text-indigo-500" />
            </div>
          )}

          {!itemsLoading && items.length === 0 && (
            <div className="text-center py-16">
              <Warehouse size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">Nenhum item encontrado</p>
              <button
                onClick={() => openItemSheet()}
                className="mt-3 text-indigo-600 text-sm font-medium"
              >
                + Adicionar primeiro item
              </button>
            </div>
          )}

          {items.map((item) => {
            const isLow = item.minQuantity > 0 && item.quantity <= item.minQuantity
            const isZero = item.quantity <= 0
            return (
              <div
                key={item.id}
                className={cn(
                  'bg-white rounded-2xl border p-4 transition-all',
                  isZero ? 'border-red-200' : isLow ? 'border-orange-200' : 'border-gray-100'
                )}
              >
                <div className="flex items-start gap-3">
                  {/* icon / image */}
                  <div className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
                    item.isEpi     ? 'bg-teal-100'   :
                    item.isUniform ? 'bg-blue-100'   :
                    item.requiresCustody ? 'bg-amber-100' :
                    'bg-gray-100'
                  )}>
                    {item.isEpi     ? <ShieldCheck size={22} className="text-teal-600" />   :
                     item.isUniform ? <Shirt size={22} className="text-blue-600" />         :
                     item.requiresCustody ? <Hammer size={22} className="text-amber-600" /> :
                     <Package size={22} className="text-gray-500" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm leading-tight">{item.name}</p>
                        {item.code && <p className="text-xs text-gray-400">#{item.code}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn('text-lg font-bold', qtyColor(item))}>
                          {item.quantity}
                        </p>
                        <p className="text-xs text-gray-400">{item.unit}</p>
                      </div>
                    </div>

                    <ItemTypeBadges item={item} />

                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      {item.category && <span>{item.category}</span>}
                      {item.location && <span>📍 {item.location}</span>}
                      {item.averageCost && <span>{formatCurrency(item.averageCost)}/{item.unit}</span>}
                    </div>

                    {isLow && !isZero && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-orange-600 bg-orange-50 rounded-lg px-2 py-1">
                        <AlertTriangle size={11} /> Abaixo do mínimo ({item.minQuantity} {item.unit})
                      </div>
                    )}
                    {isZero && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1">
                        <XCircle size={11} /> Sem estoque
                      </div>
                    )}

                    {/* Localização e indicadores extra */}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-500">
                      {(item.locationFull ?? item.location) && (
                        <span>📦 {item.locationFull ?? item.location}</span>
                      )}
                      {item.isUnderWarranty && (
                        <span className="text-green-600">✅ Em garantia</span>
                      )}
                      {item.nextMaintenance && new Date(item.nextMaintenance) <= new Date(Date.now() + 30 * 86400000) && (
                        <span className="text-amber-600">🔩 Manutenção em breve</span>
                      )}
                    </div>

                    {/* Lotes de fornecedor — expansível */}
                    {item.supplierLots && item.supplierLots.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-indigo-600 font-medium cursor-pointer select-none hover:text-indigo-800">
                          🚛 {item.supplierLots.length} lote{item.supplierLots.length !== 1 ? 's' : ''} de fornecedor
                        </summary>
                        <div className="mt-1.5 space-y-1">
                          {item.supplierLots.map((lot) => (
                            <div key={lot.id} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100 text-xs">
                              <span className="text-gray-700">
                                <strong>{lot.supplier?.name ?? 'Fornecedor não informado'}</strong>
                                {lot.lotNumber    && ` · Lote: ${lot.lotNumber}`}
                                {lot.invoiceNumber && ` · NF: ${lot.invoiceNumber}`}
                                {lot.expiryDate   && ` · Val: ${new Date(lot.expiryDate).toLocaleDateString('pt-BR')}`}
                              </span>
                              <span className="font-semibold text-gray-800 ml-2 shrink-0">
                                {Number(lot.quantity)} {item.unit}
                                {lot.unitCost ? (
                                  <span className="text-gray-500 font-normal ml-1.5">
                                    R$ {Number(lot.unitCost).toFixed(2)}/un
                                  </span>
                                ) : null}
                              </span>
                            </div>
                          ))}
                          <div className="flex justify-between px-3 py-1.5 font-semibold text-xs border-t border-gray-200 mt-1">
                            <span>Total em estoque</span>
                            <span>
                              {item.quantity} {item.unit}
                              {item.averageCost ? ` · ${formatCurrency(item.averageCost)}/un` : ''}
                            </span>
                          </div>
                        </div>
                      </details>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => openMovSheet(item)}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl py-2 text-xs font-medium transition"
                      >
                        <Plus size={14} /> Movimento
                      </button>
                      <button
                        onClick={() => router.push(`/app/deposito/${item.id}`)}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl py-2 text-xs font-medium transition"
                      >
                        <ClipboardList size={14} /> Detalhes
                      </button>
                      <button
                        onClick={() => openItemSheet(item)}
                        className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-xl transition"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Pagination */}
          {itemsTotal > 30 && (
            <div className="flex items-center justify-between py-2 text-sm text-gray-500">
              <button
                onClick={() => loadItems(itemsPage - 1)}
                disabled={itemsPage === 1 || itemsLoading}
                className="px-4 py-2 rounded-xl bg-white border disabled:opacity-40"
              >
                Anterior
              </button>
              <span>{itemsPage} de {Math.ceil(itemsTotal / 30)}</span>
              <button
                onClick={() => loadItems(itemsPage + 1)}
                disabled={itemsPage >= Math.ceil(itemsTotal / 30) || itemsLoading}
                className="px-4 py-2 rounded-xl bg-white border disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Movements ──────────────────────────────────────────────────── */}
      {activeTab === 'movements' && (
        <div className="px-4 pt-3 space-y-2">
          {movementsLoading && (
            <div className="flex justify-center py-12">
              <Loader2 size={28} className="animate-spin text-indigo-500" />
            </div>
          )}
          {!movementsLoading && movements.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Clock size={40} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum movimento registrado</p>
            </div>
          )}
          {movements.map((mov) => {
            const info = movTypeInfo(mov.type)
            return (
              <div key={mov.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-start gap-3">
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-gray-50')}>
                    <info.icon size={18} className={info.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{mov.stockItem.name}</p>
                        <p className={cn('text-xs font-medium', info.color)}>{info.label}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn(
                          'font-bold text-base',
                          ['IN','RETURN'].includes(mov.type) ? 'text-green-600' : 'text-red-500'
                        )}>
                          {['IN','RETURN'].includes(mov.type) ? '+' : '-'}{mov.quantity} {mov.stockItem.unit}
                        </p>
                        {mov.unitCost && (
                          <p className="text-xs text-gray-400">{formatCurrency(mov.unitCost)}/{mov.stockItem.unit}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-gray-500">
                      {mov.project  && <span>🏗 {mov.project.name}</span>}
                      {mov.employee && <span>👤 {mov.employee.name}</span>}
                      {mov.reason   && <span>📝 {mov.reason}</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{formatDate(mov.createdAt)}</p>
                  </div>
                </div>
              </div>
            )
          })}

          {movementsTotal > 30 && (
            <div className="flex items-center justify-between py-2 text-sm text-gray-500">
              <button
                onClick={() => loadMovements(movementsPage - 1)}
                disabled={movementsPage === 1 || movementsLoading}
                className="px-4 py-2 rounded-xl bg-white border disabled:opacity-40"
              >
                Anterior
              </button>
              <span>{movementsPage} de {Math.ceil(movementsTotal / 30)}</span>
              <button
                onClick={() => loadMovements(movementsPage + 1)}
                disabled={movementsPage >= Math.ceil(movementsTotal / 30) || movementsLoading}
                className="px-4 py-2 rounded-xl bg-white border disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Custodies ──────────────────────────────────────────────────── */}
      {activeTab === 'custodies' && (
        <div className="px-4 pt-3 space-y-3">
          {/* Filtro por obra */}
          {projects.length > 0 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              <button
                onClick={() => setFilterCustodyProject('')}
                className={cn(
                  'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                  !filterCustodyProject ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'
                )}
              >
                Todas
              </button>
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => setFilterCustodyProject(filterCustodyProject === p.id ? '' : p.id)}
                  className={cn(
                    'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                    filterCustodyProject === p.id ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {custodiesLoading && (
            <div className="flex justify-center py-12">
              <Loader2 size={28} className="animate-spin text-indigo-500" />
            </div>
          )}
          {!custodiesLoading && custodies.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Hammer size={40} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhuma ferramenta em custódia</p>
            </div>
          )}
          {custodies.map((cust) => {
            const isOverdue = cust.dueDate && !cust.returnedAt && new Date(cust.dueDate) < new Date()
            return (
              <div
                key={cust.id}
                className={cn(
                  'bg-white rounded-2xl border p-4',
                  isOverdue ? 'border-red-200' : 'border-amber-100'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                    <Hammer size={20} className="text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{cust.stockItem.name}</p>
                    {cust.stockItem.brand && (
                      <p className="text-xs text-gray-400">{cust.stockItem.brand} {cust.stockItem.serialNumber ? `· SN: ${cust.stockItem.serialNumber}` : ''}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className="bg-gray-100 text-gray-600">
                        <Users size={10} /> {cust.employee.name}
                      </Badge>
                      <Badge className="bg-indigo-50 text-indigo-600">
                        {cust.quantity} {cust.stockItem.unit}
                      </Badge>
                    </div>
                    {cust.project && (
                      <p className="text-xs text-gray-500 mt-1">🏗 {cust.project.name}</p>
                    )}
                    <div className="flex items-center justify-between mt-1 text-xs text-gray-400">
                      <span>Saída: {formatDate(cust.checkedOutAt)}</span>
                      {cust.dueDate && (
                        <span className={isOverdue ? 'text-red-500 font-medium' : ''}>
                          {isOverdue ? '⚠️ ' : ''}Prev.: {formatDate(cust.dueDate)}
                        </span>
                      )}
                    </div>
                    {cust.condition && (
                      <p className="text-xs text-gray-400 mt-0.5">Estado: {cust.condition}</p>
                    )}
                    <button
                      onClick={() => openReturnSheet(cust)}
                      className="mt-3 w-full flex items-center justify-center gap-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl py-2.5 text-sm font-medium transition"
                    >
                      <RotateCcw size={15} /> Registrar Devolução
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
          <p className="text-center text-xs text-gray-400 py-2">
            {custodiesTotal} item{custodiesTotal !== 1 ? 's' : ''} em custódia aberta
          </p>
        </div>
      )}

      {/* ── Tab: EPIs ───────────────────────────────────────────────────────── */}
      {activeTab === 'epis' && (
        <div className="px-4 pt-3">
          <div className="bg-white rounded-2xl border border-teal-100 p-8 text-center">
            <ShieldCheck size={40} className="mx-auto text-teal-400 mb-3" />
            <p className="text-gray-600 font-medium text-sm">Entregas de EPI/Uniforme</p>
            <p className="text-xs text-gray-400 mt-1">
              Registre entregas pelo botão + ao acessar o item
            </p>
            <div className="mt-4 space-y-2">
              {items.filter((i) => i.isEpi || i.isUniform).map((item) => (
                <div key={item.id} className="flex items-center justify-between bg-teal-50 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    {item.isEpi ? <ShieldCheck size={16} className="text-teal-600" /> : <Shirt size={16} className="text-blue-600" />}
                    <span className="text-sm font-medium text-gray-800">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-sm font-bold', qtyColor(item))}>
                      {item.quantity} {item.unit}
                    </span>
                    <button
                      onClick={() => openMovSheet(item)}
                      className="p-1.5 bg-teal-100 hover:bg-teal-200 text-teal-700 rounded-lg transition"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {items.filter((i) => i.isEpi || i.isUniform).length === 0 && (
                <p className="text-xs text-gray-400">Nenhum EPI ou uniforme cadastrado</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Baskets (Romaneios) ────────────────────────────────────────── */}
      {activeTab === 'baskets' && (
        <div className="px-4 pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">{basketsTotal} romaneio{basketsTotal !== 1 ? 's' : ''}</p>
            <button
              onClick={() => setBasketModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F5A623] text-white text-xs font-semibold hover:bg-[#d4891a] transition"
            >
              <Plus size={14} /> Novo Romaneio
            </button>
          </div>

          {basketsLoading && (
            <div className="flex justify-center py-12">
              <Loader2 size={28} className="animate-spin text-[#F5A623]" />
            </div>
          )}

          {!basketsLoading && baskets.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <FileText size={40} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum romaneio emitido</p>
              <button onClick={() => setBasketModalOpen(true)} className="mt-3 text-[#F5A623] text-sm font-medium">
                + Criar primeiro romaneio
              </button>
            </div>
          )}

          {baskets.map((basket) => {
            const statusBadge: Record<string, string> = {
              DRAFT:     'bg-amber-100 text-amber-700',
              SIGNED:    'bg-green-100 text-green-700',
              CANCELLED: 'bg-red-100 text-red-600',
            }
            const typeBadge: Record<string, string> = {
              OUT:    'Saída',
              EPI:    'EPI',
              RETURN: 'Devolução',
            }
            return (
              <div key={basket.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                    <FileText size={18} className="text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{basket.docNumber}</p>
                        <p className="text-xs text-gray-500">{typeBadge[basket.type] ?? basket.type}</p>
                      </div>
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', statusBadge[basket.status] ?? 'bg-gray-100 text-gray-500')}>
                        {basket.status === 'DRAFT' ? 'Rascunho' : basket.status === 'SIGNED' ? 'Assinado' : 'Cancelado'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-gray-500">
                      {basket.project   && <span>🏗 {basket.project.name}</span>}
                      {basket.employee  && <span>👤 {basket.employee.name}</span>}
                      {basket.destinatary && <span>📋 {basket.destinatary}</span>}
                      {basket._count    && <span>📦 {basket._count.movements} item{basket._count.movements !== 1 ? 'ns' : ''}</span>}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-gray-400">{formatDate(basket.createdAt)}</p>
                      {basket.status === 'SIGNED' && (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle size={11} /> Assinado
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── FAB ────────────────────────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-5 z-30">
        {fabOpen && (
          <>
            <div className="fixed inset-0" onClick={() => setFabOpen(false)} />
            <div className="absolute bottom-16 right-0 flex flex-col items-end gap-2">
              <button
                onClick={() => { openItemSheet(); setFabOpen(false) }}
                className="flex items-center gap-2 bg-white shadow-lg rounded-full pl-4 pr-5 py-3 text-sm font-medium text-gray-700 border border-gray-100 hover:bg-gray-50 transition"
              >
                <Package size={16} className="text-indigo-500" /> Novo Item
              </button>
              <button
                onClick={() => { openMovSheet(); setFabOpen(false) }}
                className="flex items-center gap-2 bg-white shadow-lg rounded-full pl-4 pr-5 py-3 text-sm font-medium text-gray-700 border border-gray-100 hover:bg-gray-50 transition"
              >
                <ArrowDownToLine size={16} className="text-green-500" /> Registrar Entrada
              </button>
              <button
                onClick={() => { setForm_OUT(); setFabOpen(false) }}
                className="flex items-center gap-2 bg-white shadow-lg rounded-full pl-4 pr-5 py-3 text-sm font-medium text-gray-700 border border-gray-100 hover:bg-gray-50 transition"
              >
                <ArrowUpFromLine size={16} className="text-red-500" /> Registrar Saída
              </button>
              <button
                onClick={() => { setBasketModalOpen(true); setFabOpen(false) }}
                className="flex items-center gap-2 bg-white shadow-lg rounded-full pl-4 pr-5 py-3 text-sm font-medium text-gray-700 border border-gray-100 hover:bg-gray-50 transition"
              >
                <FileText size={16} className="text-amber-500" /> Novo Romaneio
              </button>
            </div>
          </>
        )}
        <button
          onClick={() => setFabOpen(!fabOpen)}
          className={cn(
            'w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all',
            fabOpen ? 'bg-gray-700 rotate-45' : 'bg-indigo-600'
          )}
        >
          <Plus size={24} className="text-white" />
        </button>
      </div>

      {/* ── Sheets ──────────────────────────────────────────────────────────── */}
      <MovementSheet
        open={movSheetOpen}
        onClose={() => setMovSheetOpen(false)}
        onSuccess={refreshAll}
        preselectedItem={preselectedItem}
        items={items}
        employees={employees}
        projects={projects}
      />
      <ItemSheet
        open={itemSheetOpen}
        onClose={() => setItemSheetOpen(false)}
        onSuccess={refreshAll}
        editItem={editItem}
      />
      <CustodyReturnSheet
        open={returnSheetOpen}
        custody={returnCustody}
        onClose={() => setReturnSheetOpen(false)}
        onSuccess={refreshAll}
      />

      {/* BasketModal */}
      <BasketModal
        isOpen={basketModalOpen}
        onClose={() => setBasketModalOpen(false)}
        onConfirm={handleBasketConfirm}
        stockItems={items}
        employees={employees}
        projects={projects}
      />
    </div>
  )

  function setForm_OUT() {
    setPreselectedItem(null)
    setMovSheetOpen(true)
  }
}
