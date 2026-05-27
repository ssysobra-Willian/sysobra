'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolFormData {
  // Identificação
  name:          string
  description?:  string
  category?:     string
  unit:          string
  code?:         string
  brand?:        string
  model:         string
  serialNumber?: string
  imageUrl?:     string
  // Classificação — sempre ferramenta
  isConsumable:    boolean
  requiresCustody: boolean
  isEpi:           boolean
  isUniform:       boolean
  // Estoque
  minQuantity: number
  maxQuantity?: number
  unitCost?:   number
  // Localização
  locationShelf?:   string
  locationSection?: string
  locationDetail?:  string
  // Especificações técnicas
  toolType?: string
  voltage?:  string
  power?:    string
  // Garantia e compra
  purchaseDate?:      string
  warrantyMonthsTool?: number
  // Assistência técnica
  authorizedName?:    string
  authorizedPhone?:   string
  authorizedAddress?: string
  authorizedCity?:    string
  // Manutenção
  lastMaintenance?: string
  nextMaintenance?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TOOL_TYPES = [
  { value: 'MANUAL',     label: '🔧 Manual',       desc: 'Chave, martelo, alicate' },
  { value: 'ELECTRIC',   label: '⚡ Elétrica',      desc: 'Furadeira, esmerilhadeira' },
  { value: 'PNEUMATIC',  label: '💨 Pneumática',    desc: 'Parafusadeira de impacto' },
  { value: 'HYDRAULIC',  label: '🔩 Hidráulica',    desc: 'Macaco, prensa' },
  { value: 'MEASURING',  label: '📏 Medição',       desc: 'Nível a laser, trena' },
]

const VOLTAGES = ['127V', '220V', 'BIVOLT', 'Bateria', 'N/A']

const WARRANTY_MONTHS_OPTIONS = [0, 3, 6, 12, 18, 24, 36, 48, 60]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcWarrantyExpiry(purchaseDate?: string, months?: number): Date | null {
  if (!purchaseDate || !months) return null
  const d = new Date(purchaseDate)
  d.setMonth(d.getMonth() + months)
  return d
}

function formatDateBR(d: Date): string {
  return d.toLocaleDateString('pt-BR')
}

// ─── Accordion ───────────────────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

interface ToolFormProps {
  initial?:     Partial<ToolFormData>
  onSubmit:     (data: ToolFormData) => Promise<void>
  onCancel?:    () => void
  submitLabel?: string
  loading?:     boolean
}

export function ToolForm({ initial, onSubmit, onCancel, submitLabel = 'Salvar', loading }: ToolFormProps) {
  const [form, setForm] = useState<ToolFormData>({
    name:            '',
    unit:            'un',
    model:           '',
    isConsumable:    false,
    requiresCustody: true,    // ferramentas sempre exigem custódia
    isEpi:           false,
    isUniform:       false,
    minQuantity:     0,
    ...initial,
  })

  const [error, setError] = useState('')

  function set(k: keyof ToolFormData, v: any) {
    setForm(f => ({ ...f, [k]: v }))
  }

  const expiryDate = calcWarrantyExpiry(form.purchaseDate, form.warrantyMonthsTool)
  const isUnderWarranty = expiryDate ? expiryDate > new Date() : false

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Nome é obrigatório'); return }
    setError('')
    try {
      await onSubmit(form)
    } catch (err: any) {
      setError(err.message ?? 'Erro ao salvar')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* ── Identificação ─────────────────────────────────────────────── */}
      <Section title="🔧 Identificação da Ferramenta" defaultOpen>
        <Field label="Nome da ferramenta" required>
          <input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            className={inputCls}
            placeholder="Ex: Furadeira de Impacto 800W"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Marca">
            <input value={form.brand ?? ''} onChange={e => set('brand', e.target.value || undefined)} className={inputCls} placeholder="Bosch, Makita…" />
          </Field>
          <Field label="Modelo">
            <input value={form.model} onChange={e => set('model', e.target.value)} className={inputCls} placeholder="GSB 13 RE" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Número de série">
            <input value={form.serialNumber ?? ''} onChange={e => set('serialNumber', e.target.value || undefined)} className={inputCls} placeholder="SN 00001" />
          </Field>
          <Field label="Código interno">
            <input value={form.code ?? ''} onChange={e => set('code', e.target.value || undefined)} className={inputCls} placeholder="TOOL-001" />
          </Field>
        </div>

        <Field label="Descrição / Observações">
          <textarea value={form.description ?? ''} onChange={e => set('description', e.target.value || undefined)} className={cn(inputCls, 'resize-none')} rows={2} placeholder="Especificações, acessórios inclusos…" />
        </Field>
      </Section>

      {/* ── Especificações técnicas ───────────────────────────────────── */}
      <Section title="⚙️ Especificações Técnicas" defaultOpen>
        {/* Tipo de ferramenta */}
        <Field label="Tipo">
          <div className="grid grid-cols-2 gap-2">
            {TOOL_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => set('toolType', t.value === form.toolType ? undefined : t.value)}
                className={cn(
                  'flex flex-col items-start p-2.5 rounded-xl border text-left transition-all',
                  form.toolType === t.value
                    ? 'border-[#F5A623] bg-amber-50 text-amber-800'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                )}
              >
                <span className="text-sm font-medium">{t.label}</span>
                <span className="text-[10px] opacity-70">{t.desc}</span>
              </button>
            ))}
          </div>
        </Field>

        {/* Voltagem (só se elétrica ou pneumática) */}
        {['ELECTRIC', 'PNEUMATIC'].includes(form.toolType ?? '') && (
          <Field label="Voltagem">
            <div className="flex flex-wrap gap-2">
              {VOLTAGES.map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set('voltage', v === form.voltage ? undefined : v)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                    form.voltage === v
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </Field>
        )}

        <Field label="Potência / Capacidade">
          <input value={form.power ?? ''} onChange={e => set('power', e.target.value || undefined)} className={inputCls} placeholder="1500W, 2CV, 100 kgf…" />
        </Field>
      </Section>

      {/* ── Compra e Garantia ────────────────────────────────────────── */}
      <Section title="🛡️ Compra e Garantia" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data de compra">
            <input type="date" value={form.purchaseDate ?? ''} onChange={e => set('purchaseDate', e.target.value || undefined)} className={inputCls} />
          </Field>
          <Field label="Custo de aquisição">
            <input type="number" min={0} step="0.01" value={form.unitCost ?? ''} onChange={e => set('unitCost', e.target.value ? Number(e.target.value) : undefined)} className={inputCls} placeholder="R$" />
          </Field>
        </div>

        <Field label="Garantia do fabricante">
          <div className="flex flex-wrap gap-2">
            {WARRANTY_MONTHS_OPTIONS.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => set('warrantyMonthsTool', m === form.warrantyMonthsTool ? undefined : m)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                  form.warrantyMonthsTool === m
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                )}
              >
                {m === 0 ? 'Sem garantia' : m >= 12 ? `${m / 12} ano${m > 12 ? 's' : ''}` : `${m} m`}
              </button>
            ))}
          </div>
        </Field>

        {/* Preview de garantia */}
        {expiryDate && (
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-xs border',
            isUnderWarranty
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          )}>
            {isUnderWarranty ? '✅' : <AlertTriangle size={12} />}
            <span>
              Garantia {isUnderWarranty ? 'em vigor' : 'VENCIDA'} — expira em{' '}
              <strong>{formatDateBR(expiryDate)}</strong>
            </span>
          </div>
        )}
      </Section>

      {/* ── Assistência Técnica ───────────────────────────────────────── */}
      <Section title="🏭 Assistência Técnica Autorizada" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome da assistência">
            <input value={form.authorizedName ?? ''} onChange={e => set('authorizedName', e.target.value || undefined)} className={inputCls} placeholder="Bosch Service…" />
          </Field>
          <Field label="Telefone">
            <input value={form.authorizedPhone ?? ''} onChange={e => set('authorizedPhone', e.target.value || undefined)} className={inputCls} placeholder="(11) 99999-0000" />
          </Field>
          <Field label="Endereço">
            <input value={form.authorizedAddress ?? ''} onChange={e => set('authorizedAddress', e.target.value || undefined)} className={inputCls} placeholder="Rua, número" />
          </Field>
          <Field label="Cidade">
            <input value={form.authorizedCity ?? ''} onChange={e => set('authorizedCity', e.target.value || undefined)} className={inputCls} placeholder="São Paulo" />
          </Field>
        </div>
      </Section>

      {/* ── Manutenção Preventiva ─────────────────────────────────────── */}
      <Section title="🔩 Manutenção Preventiva" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Última manutenção">
            <input type="date" value={form.lastMaintenance ?? ''} onChange={e => set('lastMaintenance', e.target.value || undefined)} className={inputCls} />
          </Field>
          <Field label="Próxima manutenção">
            <input type="date" value={form.nextMaintenance ?? ''} onChange={e => set('nextMaintenance', e.target.value || undefined)} className={inputCls} />
          </Field>
        </div>

        {/* Alerta de manutenção próxima */}
        {form.nextMaintenance && (() => {
          const next = new Date(form.nextMaintenance)
          const diff = Math.ceil((next.getTime() - Date.now()) / 86400000)
          if (diff <= 30 && diff >= 0) {
            return (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                <AlertTriangle size={12} />
                Manutenção programada em <strong>{diff === 0 ? 'hoje' : `${diff} dias`}</strong>
              </div>
            )
          }
          if (diff < 0) {
            return (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                <AlertTriangle size={12} />
                Manutenção atrasada há <strong>{Math.abs(diff)} dias</strong>
              </div>
            )
          }
          return null
        })()}
      </Section>

      {/* ── Localização no depósito ───────────────────────────────────── */}
      <Section title="📦 Localização no Depósito" defaultOpen={false}>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Prateleira">
            <input value={form.locationShelf ?? ''} onChange={e => set('locationShelf', e.target.value || undefined)} className={inputCls} placeholder="A, B…" />
          </Field>
          <Field label="Seção">
            <input value={form.locationSection ?? ''} onChange={e => set('locationSection', e.target.value || undefined)} className={inputCls} placeholder="1, 2…" />
          </Field>
          <Field label="Detalhe">
            <input value={form.locationDetail ?? ''} onChange={e => set('locationDetail', e.target.value || undefined)} className={inputCls} placeholder="Caixa…" />
          </Field>
        </div>
        {(form.locationShelf || form.locationSection || form.locationDetail) && (
          <div className="px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700 font-medium">
            📦 Endereço: {[
              form.locationShelf   ? `Prat. ${form.locationShelf}`   : null,
              form.locationSection ? `Seção ${form.locationSection}` : null,
              form.locationDetail  ?? null,
            ].filter(Boolean).join(' / ')}
          </div>
        )}
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
