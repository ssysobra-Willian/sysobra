'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MaterialFormData {
  // Identificação
  name:         string
  description?: string
  category?:    string
  unit:         string
  code?:        string
  brand?:       string
  model?:       string
  serialNumber?:string
  imageUrl?:    string
  // Classificação
  isConsumable:    boolean
  requiresCustody: boolean
  isEpi:           boolean
  isUniform:       boolean
  // Estoque
  minQuantity: number
  maxQuantity?: number
  unitCost?:   number
  // Localização no depósito
  locationShelf?:   string
  locationSection?: string
  locationDetail?:  string
}

export interface SupplierLotInput {
  supplierId?:    string
  lotNumber?:     string
  invoiceNumber?: string
  purchaseDate?:  string
  quantity:       number
  unitCost?:      number
  expiryDate?:    string
  notes?:         string
}

interface Supplier { id: string; name: string }

interface MaterialFormProps {
  initial?:        Partial<MaterialFormData>
  suppliers?:      Supplier[]
  existingLots?:   any[]   // lots já cadastrados (só exibição)
  onSubmit:        (data: MaterialFormData, lots: SupplierLotInput[]) => Promise<void>
  onCancel?:       () => void
  submitLabel?:    string
  loading?:        boolean
}

// ─── CATEGORY_OPTIONS ─────────────────────────────────────────────────────────

const CATEGORIES = [
  'Cimento e Argamassa', 'Aço e Ferragem', 'Madeira e Compensado', 'Hidráulica',
  'Elétrica', 'Revestimento e Acabamento', 'Tintas e Solventes', 'Ferramentas',
  'Equipamentos', 'EPI e Segurança', 'Uniforme e Vestuário', 'Outros',
]

const UNITS = ['un', 'kg', 'g', 't', 'm', 'm²', 'm³', 'l', 'ml', 'pc', 'cx', 'sc', 'rolo', 'par', 'jg', 'hr']

// ─── Accordion section ────────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] bg-white'

// ─── Shelf/Section location preview ──────────────────────────────────────────

function LocationPreview({ shelf, section, detail }: { shelf?: string; section?: string; detail?: string }) {
  const parts = [
    shelf   ? `Prat. ${shelf}`   : null,
    section ? `Seção ${section}` : null,
    detail  || null,
  ].filter(Boolean)
  if (!parts.length) return null
  return (
    <div className="mt-1 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700 font-medium">
      📦 Endereço: {parts.join(' / ')}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MaterialForm({
  initial, suppliers = [], existingLots = [],
  onSubmit, onCancel, submitLabel = 'Salvar', loading,
}: MaterialFormProps) {
  const [form, setForm] = useState<MaterialFormData>({
    name:         '',
    unit:         'un',
    isConsumable: true,
    requiresCustody: false,
    isEpi:        false,
    isUniform:    false,
    minQuantity:  0,
    ...initial,
  })

  const [lots, setLots]   = useState<SupplierLotInput[]>([])
  const [error, setError] = useState('')

  function set(k: keyof MaterialFormData, v: any) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function setLot(idx: number, k: keyof SupplierLotInput, v: any) {
    setLots(ls => ls.map((l, i) => i === idx ? { ...l, [k]: v } : l))
  }

  function addLot() {
    setLots(ls => [...ls, { quantity: 1 }])
  }

  function removeLot(idx: number) {
    setLots(ls => ls.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Nome é obrigatório'); return }
    setError('')
    try {
      await onSubmit(form, lots)
    } catch (err: any) {
      setError(err.message ?? 'Erro ao salvar')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* ── Identificação ─────────────────────────────────────────────── */}
      <Section title="📝 Identificação" defaultOpen>
        <Field label="Nome do material" required>
          <input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            className={inputCls}
            placeholder="Ex: Cimento CP-II 50kg"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria">
            <select value={form.category ?? ''} onChange={e => set('category', e.target.value || undefined)} className={inputCls}>
              <option value="">Selecionar…</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Unidade" required>
            <select value={form.unit} onChange={e => set('unit', e.target.value)} className={inputCls}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Código interno">
            <input value={form.code ?? ''} onChange={e => set('code', e.target.value || undefined)} className={inputCls} placeholder="SKU / código" />
          </Field>
          <Field label="Marca">
            <input value={form.brand ?? ''} onChange={e => set('brand', e.target.value || undefined)} className={inputCls} placeholder="Fabricante" />
          </Field>
        </div>

        <Field label="Descrição">
          <textarea value={form.description ?? ''} onChange={e => set('description', e.target.value || undefined)} className={cn(inputCls, 'resize-none')} rows={2} placeholder="Especificações adicionais…" />
        </Field>
      </Section>

      {/* ── Classificação ────────────────────────────────────────────── */}
      <Section title="🏷️ Classificação" defaultOpen>
        <div className="grid grid-cols-2 gap-2">
          {([
            { key: 'isConsumable',    label: '🧱 Consumível',   desc: 'Se esgota com o uso' },
            { key: 'requiresCustody', label: '🔨 Ferramenta',   desc: 'Requer custódia' },
            { key: 'isEpi',           label: '🦺 EPI',          desc: 'Equipamento de proteção' },
            { key: 'isUniform',       label: '👕 Uniforme',     desc: 'Vestuário' },
          ] as const).map(({ key, label, desc }) => (
            <button
              key={key}
              type="button"
              onClick={() => set(key, !(form as any)[key])}
              className={cn(
                'flex flex-col items-start p-3 rounded-xl border text-left transition-all',
                (form as any)[key]
                  ? 'border-[#F5A623] bg-amber-50 text-amber-800'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              )}
            >
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs opacity-70 mt-0.5">{desc}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* ── Estoque mínimo/máximo e custo ────────────────────────────── */}
      <Section title="📊 Estoque e Custo" defaultOpen={false}>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Qtd. mínima">
            <input type="number" min={0} value={form.minQuantity} onChange={e => set('minQuantity', Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Qtd. máxima">
            <input type="number" min={0} value={form.maxQuantity ?? ''} onChange={e => set('maxQuantity', e.target.value ? Number(e.target.value) : undefined)} className={inputCls} placeholder="—" />
          </Field>
          <Field label="Custo unitário">
            <input type="number" min={0} step="0.01" value={form.unitCost ?? ''} onChange={e => set('unitCost', e.target.value ? Number(e.target.value) : undefined)} className={inputCls} placeholder="R$" />
          </Field>
        </div>
      </Section>

      {/* ── Localização no depósito ───────────────────────────────────── */}
      <Section title="📦 Localização no Depósito" defaultOpen={false}>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Prateleira">
            <input value={form.locationShelf ?? ''} onChange={e => set('locationShelf', e.target.value || undefined)} className={inputCls} placeholder="A, B, C…" />
          </Field>
          <Field label="Seção">
            <input value={form.locationSection ?? ''} onChange={e => set('locationSection', e.target.value || undefined)} className={inputCls} placeholder="1, 2, 3…" />
          </Field>
          <Field label="Detalhe">
            <input value={form.locationDetail ?? ''} onChange={e => set('locationDetail', e.target.value || undefined)} className={inputCls} placeholder="Caixa 4…" />
          </Field>
        </div>
        <LocationPreview shelf={form.locationShelf} section={form.locationSection} detail={form.locationDetail} />
      </Section>

      {/* ── Lotes de fornecedor ───────────────────────────────────────── */}
      <Section title={`🚛 Lotes de Fornecedor (${existingLots.length + lots.length})`} defaultOpen={false}>
        {/* Existentes (somente leitura) */}
        {existingLots.length > 0 && (
          <div className="space-y-2 mb-3">
            <p className="text-xs text-gray-500 font-medium">Lotes registrados</p>
            {existingLots.map((lot, i) => (
              <div key={lot.id ?? i} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg border border-gray-100 text-xs">
                <div className="flex-1">
                  <p className="font-medium text-gray-800">{lot.supplier?.name ?? 'Fornecedor não informado'}</p>
                  <p className="text-gray-500">
                    Lote {lot.lotNumber ?? '—'} · NF {lot.invoiceNumber ?? '—'} · {lot.quantity} un
                    {lot.unitCost ? ` · ${formatCurrency(lot.unitCost)}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Novos lotes */}
        {lots.map((lot, idx) => (
          <div key={idx} className="p-3 border border-amber-100 bg-amber-50/30 rounded-xl space-y-2 relative">
            <button type="button" onClick={() => removeLot(idx)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500">
              <X size={14} />
            </button>
            <p className="text-xs font-medium text-gray-700">Novo lote #{idx + 1}</p>
            <div className="grid grid-cols-2 gap-2">
              {suppliers.length > 0 && (
                <Field label="Fornecedor">
                  <select value={lot.supplierId ?? ''} onChange={e => setLot(idx, 'supplierId', e.target.value || undefined)} className={inputCls}>
                    <option value="">Selecionar…</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Nº da NF">
                <input value={lot.invoiceNumber ?? ''} onChange={e => setLot(idx, 'invoiceNumber', e.target.value || undefined)} className={inputCls} placeholder="000.000" />
              </Field>
              <Field label="Nº do lote">
                <input value={lot.lotNumber ?? ''} onChange={e => setLot(idx, 'lotNumber', e.target.value || undefined)} className={inputCls} placeholder="LOT-001" />
              </Field>
              <Field label="Data compra">
                <input type="date" value={lot.purchaseDate ?? ''} onChange={e => setLot(idx, 'purchaseDate', e.target.value || undefined)} className={inputCls} />
              </Field>
              <Field label="Quantidade" required>
                <input type="number" min={0} step="0.001" value={lot.quantity} onChange={e => setLot(idx, 'quantity', Number(e.target.value))} className={inputCls} />
              </Field>
              <Field label="Custo unitário">
                <input type="number" min={0} step="0.01" value={lot.unitCost ?? ''} onChange={e => setLot(idx, 'unitCost', e.target.value ? Number(e.target.value) : undefined)} className={inputCls} placeholder="R$" />
              </Field>
              <Field label="Validade">
                <input type="date" value={lot.expiryDate ?? ''} onChange={e => setLot(idx, 'expiryDate', e.target.value || undefined)} className={inputCls} />
              </Field>
            </div>
          </div>
        ))}

        <button type="button" onClick={addLot}
          className="flex items-center gap-2 text-xs text-amber-700 hover:text-amber-900 border border-dashed border-amber-300 rounded-lg px-3 py-2 w-full justify-center hover:bg-amber-50 transition-colors"
        >
          <Plus size={13} /> Adicionar lote de fornecedor
        </button>
      </Section>

      {/* Erro */}
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Footer */}
      <div className="flex gap-2 pt-2">
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-[#F5A623] hover:bg-[#d4891a] text-white rounded-xl transition-colors disabled:opacity-60"
        >
          {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando…</> : submitLabel}
        </button>
      </div>
    </form>
  )
}
