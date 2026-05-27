'use client'

import { useState, useCallback } from 'react'
import {
  X, Plus, Trash2, Check, Loader2, ChevronLeft, ChevronRight,
  Package, Users, PenLine, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'
import { SignaturePad } from './SignaturePad'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BasketItem {
  stockItemId: string
  name:        string
  unit:        string
  quantity:    number
  unitCost?:   number
  reason?:     string
  available:   number   // estoque disponível
}

interface StockItemOption {
  id:          string
  name:        string
  unit:        string
  quantity:    number
  averageCost?: number | null
  unitCost?:   number | null
  brand?:      string | null
  code?:       string | null
}

interface Employee { id: string; name: string; position?: string | null }
interface Project  { id: string; name: string }

interface BasketModalProps {
  isOpen:      boolean
  onClose:     () => void
  onConfirm:   (data: BasketPayload) => Promise<void>
  stockItems:  StockItemOption[]
  employees:   Employee[]
  projects:    Project[]
}

export interface BasketPayload {
  type:        'OUT' | 'EPI' | 'RETURN'
  projectId?:  string
  employeeId?: string
  destinatary?: string
  notes?:      string
  items:       Omit<BasketItem, 'available'>[]
  senderSignature?:   string
  receiverSignature?: string
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Itens',      icon: Package },
  { id: 2, label: 'Destino',    icon: Users },
  { id: 3, label: 'Assinatura', icon: PenLine },
]

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((step, idx) => {
        const done    = current > step.id
        const active  = current === step.id
        const Icon    = step.icon
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className={cn(
              'flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all flex-shrink-0',
              done   ? 'bg-green-500 border-green-500 text-white' :
              active ? 'bg-[#F5A623] border-[#F5A623] text-white' :
                       'bg-white border-gray-200 text-gray-400'
            )}>
              {done ? <Check size={14} /> : <Icon size={14} />}
            </div>
            <div className="ml-2 flex-shrink-0">
              <p className={cn('text-xs font-medium', active ? 'text-gray-900' : 'text-gray-400')}>
                {step.label}
              </p>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={cn(
                'flex-1 h-0.5 mx-3 transition-colors',
                current > step.id ? 'bg-green-400' : 'bg-gray-200'
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Step 1 — Itens ───────────────────────────────────────────────────────────

function Step1Items({
  type, setType, items, setItems, stockItems,
}: {
  type: 'OUT' | 'EPI' | 'RETURN'
  setType: (t: 'OUT' | 'EPI' | 'RETURN') => void
  items: BasketItem[]
  setItems: (items: BasketItem[]) => void
  stockItems: StockItemOption[]
}) {
  const [selectedId, setSelectedId] = useState('')
  const [qty, setQty] = useState('1')

  function addItem() {
    const stock = stockItems.find(s => s.id === selectedId)
    if (!stock || !qty) return
    const quantity = Number(qty)
    if (quantity <= 0) return

    // Se já existe, incrementa
    const exists = items.find(i => i.stockItemId === selectedId)
    if (exists) {
      setItems(items.map(i => i.stockItemId === selectedId
        ? { ...i, quantity: i.quantity + quantity }
        : i
      ))
    } else {
      setItems([...items, {
        stockItemId: stock.id,
        name:        stock.name,
        unit:        stock.unit,
        quantity,
        unitCost:    Number(stock.averageCost ?? stock.unitCost ?? 0) || undefined,
        available:   Number(stock.quantity),
      }])
    }
    setSelectedId('')
    setQty('1')
  }

  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx))
  }

  function updateQty(idx: number, q: number) {
    setItems(items.map((item, i) => i === idx ? { ...item, quantity: q } : item))
  }

  const totalCost = items.reduce((acc, i) => acc + i.quantity * (i.unitCost ?? 0), 0)

  return (
    <div className="space-y-4">
      {/* Tipo de romaneio */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tipo de saída</label>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: 'OUT',    label: '📦 Saída geral' },
            { value: 'EPI',    label: '🦺 Entrega EPI' },
            { value: 'RETURN', label: '↩️ Devolução' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setType(opt.value)}
              className={cn(
                'py-2 px-3 text-xs font-medium rounded-xl border transition-all',
                type === opt.value
                  ? 'border-[#F5A623] bg-amber-50 text-amber-800'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Adicionar item */}
      <div className="flex gap-2">
        <div className="flex-1">
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
          >
            <option value="">Selecionar item…</option>
            {stockItems.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{s.code ? ` (${s.code})` : ''} — estoque: {Number(s.quantity)} {s.unit}
              </option>
            ))}
          </select>
        </div>
        <input
          type="number"
          min={0.001}
          step="0.001"
          value={qty}
          onChange={e => setQty(e.target.value)}
          className="w-20 rounded-xl border border-gray-200 px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
        />
        <button
          type="button"
          onClick={addItem}
          disabled={!selectedId || !qty}
          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-[#F5A623] text-white text-sm font-medium disabled:opacity-40 hover:bg-[#d4891a] transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Lista de itens */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
          <Package size={32} className="mb-2 opacity-30" />
          <p className="text-sm">Nenhum item adicionado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => {
            const overStock = type !== 'RETURN' && item.quantity > item.available
            return (
              <div key={idx} className={cn(
                'flex items-center gap-3 p-3 rounded-xl border',
                overStock ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'
              )}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                  {item.unitCost ? (
                    <p className="text-xs text-gray-500">
                      {formatCurrency(item.unitCost)} / {item.unit}
                      {' · '}subtotal: {formatCurrency(item.quantity * item.unitCost)}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">Sem custo registrado</p>
                  )}
                  {overStock && (
                    <p className="text-xs text-red-600 font-medium">
                      ⚠ Qtd. maior que estoque ({item.available} {item.unit} disponível)
                    </p>
                  )}
                </div>
                <input
                  type="number"
                  min={0.001}
                  step="0.001"
                  value={item.quantity}
                  onChange={e => updateQty(idx, Number(e.target.value))}
                  className={cn(
                    'w-20 text-center rounded-lg border px-2 py-1 text-sm',
                    overStock ? 'border-red-300' : 'border-gray-200'
                  )}
                />
                <span className="text-xs text-gray-500 w-8 flex-shrink-0">{item.unit}</span>
                <button type="button" onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}

          {/* Total */}
          {totalCost > 0 && (
            <div className="flex justify-end pt-1">
              <span className="text-sm font-semibold text-gray-700">
                Total: {formatCurrency(totalCost)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Step 2 — Destino ─────────────────────────────────────────────────────────

function Step2Destination({
  form, setForm, employees, projects,
}: {
  form: { projectId: string; employeeId: string; destinatary: string; notes: string }
  setForm: (f: any) => void
  employees: Employee[]
  projects:  Project[]
}) {
  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }))

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Obra / Projeto</label>
        <select value={form.projectId} onChange={e => set('projectId', e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]">
          <option value="">Nenhuma obra vinculada</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Colaborador</label>
        <select value={form.employeeId} onChange={e => set('employeeId', e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]">
          <option value="">Sem colaborador vinculado</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.position ? ` — ${e.position}` : ''}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Recebedor (nome livre)
        </label>
        <input
          value={form.destinatary}
          onChange={e => set('destinatary', e.target.value)}
          placeholder="Nome de quem recebe os materiais…"
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Observações</label>
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Finalidade, instruções de uso…"
          rows={3}
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] resize-none"
        />
      </div>
    </div>
  )
}

// ─── Step 3 — Assinaturas ─────────────────────────────────────────────────────

function Step3Signatures({
  onSenderSign, onReceiverSign, senderSigned, receiverSigned,
}: {
  onSenderSign:   (url: string) => void
  onReceiverSign: (url: string) => void
  senderSigned:   boolean
  receiverSigned: boolean
}) {
  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
        📋 As assinaturas confirmam a entrega dos materiais. Caso não seja possível assinar agora, você pode assinar depois abrindo o romaneio.
      </div>

      <SignaturePad
        label="✍️ Assinatura do responsável pela entrega"
        onSign={onSenderSign}
        height={130}
      />

      <SignaturePad
        label="✍️ Assinatura do recebedor"
        onSign={onReceiverSign}
        height={130}
      />

      {senderSigned && receiverSigned && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          <Check size={16} className="text-green-500" />
          <span>Ambas as assinaturas confirmadas</span>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function BasketModal({ isOpen, onClose, onConfirm, stockItems, employees, projects }: BasketModalProps) {
  const [step, setStep] = useState(1)
  const [type, setType] = useState<'OUT' | 'EPI' | 'RETURN'>('OUT')
  const [items, setItems] = useState<BasketItem[]>([])
  const [dest, setDest] = useState({ projectId: '', employeeId: '', destinatary: '', notes: '' })
  const [senderSig,   setSenderSig]   = useState<string | undefined>()
  const [receiverSig, setReceiverSig] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function resetAll() {
    setStep(1)
    setType('OUT')
    setItems([])
    setDest({ projectId: '', employeeId: '', destinatary: '', notes: '' })
    setSenderSig(undefined)
    setReceiverSig(undefined)
    setError('')
  }

  function handleClose() {
    resetAll()
    onClose()
  }

  const canNext = useCallback(() => {
    if (step === 1) return items.length > 0
    if (step === 2) return true
    return true
  }, [step, items])

  function goNext() {
    if (!canNext()) return
    setStep(s => Math.min(s + 1, 3))
  }

  function goBack() {
    setStep(s => Math.max(s - 1, 1))
  }

  async function handleConfirm() {
    if (items.length === 0) { setError('Adicione pelo menos um item'); return }
    setSaving(true)
    setError('')
    try {
      await onConfirm({
        type,
        projectId:   dest.projectId  || undefined,
        employeeId:  dest.employeeId || undefined,
        destinatary: dest.destinatary || undefined,
        notes:       dest.notes || undefined,
        items: items.map(({ stockItemId, name, unit, quantity, unitCost, reason }) => ({
          stockItemId, name, unit, quantity, unitCost, reason,
        })),
        senderSignature:   senderSig,
        receiverSignature: receiverSig,
      })
      resetAll()
    } catch (err: any) {
      setError(err.message ?? 'Erro ao criar romaneio')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
              <FileText size={16} className="text-amber-700" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Novo Romaneio</p>
              <p className="text-xs text-gray-500">Saída de materiais com assinatura</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          <StepBar current={step} />

          {step === 1 && (
            <Step1Items
              type={type} setType={setType}
              items={items} setItems={setItems}
              stockItems={stockItems}
            />
          )}

          {step === 2 && (
            <Step2Destination
              form={dest} setForm={setDest}
              employees={employees} projects={projects}
            />
          )}

          {step === 3 && (
            <Step3Signatures
              onSenderSign={setSenderSig}
              onReceiverSign={setReceiverSig}
              senderSigned={!!senderSig}
              receiverSigned={!!receiverSig}
            />
          )}

          {error && (
            <div className="mt-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-2 px-5 pb-5 border-t pt-4">
          {step > 1 ? (
            <button
              type="button"
              onClick={goBack}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <ChevronLeft size={14} /> Voltar
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!canNext()}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold bg-[#F5A623] hover:bg-[#d4891a] text-white rounded-xl disabled:opacity-50 transition-colors"
            >
              Próximo <ChevronRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving || items.length === 0}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white rounded-xl disabled:opacity-50 transition-colors"
            >
              {saving
                ? <><Loader2 size={14} className="animate-spin" /> Gerando…</>
                : <><Check size={14} /> Emitir Romaneio</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
