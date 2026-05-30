'use client'

import React, { useState, useRef, useCallback } from 'react'
import {
  X, Package, ShieldCheck, Shirt, Upload, Loader2, CheckCircle2,
  MapPin, ChevronDown, ChevronUp, Plus, Trash2, Camera, Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'
import BrandInput from '@/components/ui/BrandInput'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
function getToken()     { return typeof window !== 'undefined' ? (localStorage.getItem('token')     ?? '') : '' }
function getCompanyId() { return typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : '' }

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'material' | 'epi' | 'uniform'

interface LotInput {
  supplierId?:    string
  supplierName?:  string
  lotNumber?:     string
  invoiceNumber?: string
  quantity:       number
  unitCost?:      number
  brand?:         string
  expiryDate?:    string
  notes?:         string
}

interface ExistingItem {
  id:             string
  name:           string
  code?:          string | null
  description?:   string | null
  category?:      string | null
  unit:           string
  imageUrl?:      string | null
  brand?:         string | null
  model?:         string | null
  serialNumber?:  string | null
  minQuantity:    number
  maxQuantity?:   number | null
  unitCost?:      number | null
  averageCost?:   number | null
  locationShelf?:  string | null
  locationSection?: string | null
  locationDetail?:  string | null
  isConsumable:   boolean
  requiresCustody: boolean
  isEpi:          boolean
  isUniform:      boolean
}

interface StockLocation { id: string; name: string; type: string }

interface Props {
  mode:       Mode
  isOpen:     boolean
  onClose:    () => void
  onSuccess:  () => void
  item?:      ExistingItem | null   // null = criação
  locations?: StockLocation[]       // lista de locais do depósito
}

// ─── Constants ────────────────────────────────────────────────────────────────

const UNITS_MATERIAL = ['un','kg','g','t','m','m²','m³','l','ml','pc','cx','sc','rolo','par','jg','hr','bd']
const UNITS_EPI      = ['un','par','cx','pc']
const UNITS_UNIFORM  = ['un','par','cx','pc','jg']

const CATEGORIES_MATERIAL = [
  'Cimento e Argamassa','Aço e Ferragem','Madeira e Compensado',
  'Hidráulica','Elétrica','Revestimento e Acabamento',
  'Tintas e Solventes','Impermeabilização','Instalações','Outros',
]

const EPI_TYPES = [
  'Cabeça','Olhos','Auditivo','Respiratório','Tronco','Mãos','Pés','Altura','Outros',
]

const UNIFORM_TYPES = [
  'Camiseta','Calça','Bota','Colete','Jaqueta','Boné','Macacão','Luva','Outros',
]

const SHELF_OPTIONS = Array.from({ length: 20 }, (_, i) => String(i + 1))
const SECTION_OPTIONS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Section({ title, open, onToggle, children }: {
  title: string; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button type="button" onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition text-left"
      >
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  )
}

const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30 focus:border-[#F5A623] bg-white'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}{required && <span className="text-red-400 ml-0.5 normal-case">*</span>}</label>
      {children}
    </div>
  )
}

function UnitChips({ units, selected, onSelect }: { units: string[]; selected: string; onSelect: (u: string) => void }) {
  const [custom, setCustom] = useState('')
  return (
    <div className="flex flex-wrap gap-1.5">
      {units.map(u => (
        <button key={u} type="button" onClick={() => { onSelect(u); setCustom('') }}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-medium border transition',
            selected === u
              ? 'bg-[#FEF3DC] border-[#F5A623] text-amber-800 font-semibold'
              : 'border-gray-200 text-gray-500 hover:border-gray-300',
          )}
        >{u}</button>
      ))}
      <input
        type="text"
        value={custom}
        onChange={e => { setCustom(e.target.value); if (e.target.value) onSelect(e.target.value) }}
        placeholder="Outra…"
        className="w-20 px-2.5 py-1.5 rounded-full text-xs border border-gray-200 focus:outline-none focus:border-[#F5A623]"
      />
    </div>
  )
}

function LocationPreview({ shelf, section, detail }: { shelf?: string; section?: string; detail?: string }) {
  const parts = [
    shelf   ? `Prateleira ${shelf}`   : null,
    section ? `Seção ${section}` : null,
    detail  || null,
  ].filter(Boolean)
  if (!parts.length) return null
  return (
    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 font-medium">
      <MapPin size={12} className="text-amber-500 flex-shrink-0" />
      📦 {parts.join(' / ')}
    </div>
  )
}

// ─── Photo Upload ─────────────────────────────────────────────────────────────

function PhotoUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${API}/api/v1/uploads/file`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'x-company-id': getCompanyId() },
        body: fd,
      })
      if (res.ok) { const d = await res.json(); onChange(d.url) }
    } catch { /* silencioso */ }
    finally { setUploading(false) }
  }

  const src = value
    ? value.startsWith('http')
      ? value
      : `${API}${value.startsWith('/') ? '' : '/'}${value}`
    : null

  return (
    <div>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
      {src ? (
        <div className="relative w-full h-40 rounded-xl overflow-hidden border border-gray-200">
          <img src={src} alt="Foto" className="w-full h-full object-cover" />
          <button type="button" onClick={() => onChange('')}
            className="absolute top-2 right-2 w-7 h-7 bg-black/50 text-white rounded-full flex items-center justify-center text-xs">
            ✕
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} disabled={uploading}
          className="w-full h-36 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-gray-300 hover:text-gray-500 transition disabled:opacity-60">
          {uploading ? <Loader2 size={22} className="animate-spin" /> : <Camera size={22} />}
          <span className="text-xs">{uploading ? 'Enviando…' : 'Clique para adicionar foto'}</span>
        </button>
      )}
    </div>
  )
}

// ─── Lots Section ─────────────────────────────────────────────────────────────

function LotSupplierSearch({ value, supplierId, onSelect, onClear }: {
  value: string
  supplierId: string | undefined
  onSelect: (id: string, name: string) => void
  onClear: () => void
}) {
  const [query,   setQuery]   = useState(value)
  const [results, setResults] = useState<{ id: string; name: string; cpfCnpj?: string | null }[]>([])
  const [loading, setLoading] = useState(false)

  const search = useCallback(async (q: string) => {
    setQuery(q)
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/v1/suppliers?search=${encodeURIComponent(q)}&limit=6`, {
        headers: { Authorization: `Bearer ${getToken()}`, 'x-company-id': getCompanyId() },
      })
      const d = await res.json()
      setResults(d.suppliers ?? d ?? [])
    } catch { setResults([]) }
    finally { setLoading(false) }
  }, [])

  if (supplierId) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-2 bg-green-50 border border-green-200 rounded-xl">
        <span className="flex-1 text-xs font-medium text-green-800 truncate">{value}</span>
        <button type="button" onClick={onClear} className="text-gray-400 hover:text-red-500 flex-shrink-0">
          <X size={11} />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        value={query}
        onChange={e => search(e.target.value)}
        onBlur={() => setTimeout(() => setResults([]), 150)}
        placeholder="Buscar fornecedor…"
        className={cn(inputCls, 'pl-7')}
      />
      {loading && <Loader2 size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
      {results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
          {results.map(s => (
            <button key={s.id} type="button"
              onMouseDown={() => { onSelect(s.id, s.name); setQuery(s.name); setResults([]) }}
              className="w-full flex items-start gap-2 px-3 py-2 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-800 truncate">{s.name}</div>
                {s.cpfCnpj && <div className="text-[10px] text-gray-400">{s.cpfCnpj}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function LotsSection({ lots, onChange }: { lots: LotInput[]; onChange: (l: LotInput[]) => void }) {
  const addLot = () => onChange([...lots, { quantity: 1 }])
  const removeLot = (i: number) => onChange(lots.filter((_, idx) => idx !== i))
  const updateLot = (i: number, patch: Partial<LotInput>) =>
    onChange(lots.map((l, idx) => idx === i ? { ...l, ...patch } : l))

  const totalQty  = lots.reduce((s, l) => s + (l.quantity || 0), 0)
  const totalVal  = lots.reduce((s, l) => s + (l.quantity || 0) * (l.unitCost ?? 0), 0)
  const avgCost   = totalQty > 0 ? totalVal / totalQty : 0

  return (
    <div className="space-y-3">
      {lots.map((lot, i) => (
        <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-2.5 bg-gray-50/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">Lote #{i + 1}</span>
            <button type="button" onClick={() => removeLot(i)}
              className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500">
              <Trash2 size={13} />
            </button>
          </div>

          {/* Fornecedor */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Fornecedor</label>
            <LotSupplierSearch
              value={lot.supplierName ?? ''}
              supplierId={lot.supplierId}
              onSelect={(id, name) => updateLot(i, { supplierId: id, supplierName: name })}
              onClear={() => updateLot(i, { supplierId: undefined, supplierName: undefined })}
            />
          </div>

          {/* Qtd + Custo */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Qtd. *</label>
              <input type="number" min="0.001" step="0.001" value={lot.quantity || ''}
                onChange={e => updateLot(i, { quantity: Number(e.target.value) || 1 })}
                className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Custo/un (R$)</label>
              <input type="number" min="0" step="0.01" value={lot.unitCost ?? ''}
                onChange={e => updateLot(i, { unitCost: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="0,00" className={inputCls} />
            </div>
          </div>

          {/* Subtotal */}
          {lot.quantity > 0 && lot.unitCost ? (
            <div className="text-[10px] text-right text-gray-400">
              Subtotal: <strong className="text-[#F5A623]">{formatCurrency(lot.quantity * lot.unitCost)}</strong>
            </div>
          ) : null}

          {/* Marca + Lote/NF */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Marca</label>
              <BrandInput
                value={lot.brand ?? ''}
                onChange={v => updateLot(i, { brand: v })}
                placeholder="Ex: Gerdau"
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Nº Lote / NF</label>
              <input type="text" value={lot.lotNumber ?? ''}
                onChange={e => updateLot(i, { lotNumber: e.target.value })}
                placeholder="Lote ou NF" className={inputCls} />
            </div>
          </div>

          {/* Validade */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Validade</label>
            <input type="date" value={lot.expiryDate ?? ''}
              onChange={e => updateLot(i, { expiryDate: e.target.value })}
              className={inputCls} />
          </div>
        </div>
      ))}

      <button type="button" onClick={addLot}
        className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-[#F5A623] hover:text-[#F5A623] transition flex items-center justify-center gap-2">
        <Plus size={13} />Adicionar lote / fornecedor
      </button>

      {lots.length > 0 && lots.some(l => l.unitCost) && (
        <div className="flex items-center justify-between text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          <span>Custo médio ponderado</span>
          <span>
            <strong className="text-[#F5A623]">{formatCurrency(avgCost)}</strong>
            <span className="text-gray-400 ml-2">· {totalQty} {totalQty !== 1 ? 'un' : 'un'} · {formatCurrency(totalVal)} total</span>
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function ItemFormModal({ mode, isOpen, onClose, onSuccess, item, locations = [] }: Props) {
  const isEditing = !!item

  // ── State ──────────────────────────────────────────────────────────────────
  const [name,         setName]         = useState(item?.name         ?? '')
  const [code,         setCode]         = useState(item?.code         ?? '')
  const [description,  setDescription]  = useState(item?.description  ?? '')
  const [category,     setCategory]     = useState(item?.category     ?? '')
  const [unit,         setUnit]         = useState(item?.unit         ?? 'un')
  const [brand,        setBrand]        = useState(item?.brand        ?? '')
  const [model,        setModel]        = useState(item?.model        ?? '')
  const [imageUrl,     setImageUrl]     = useState(item?.imageUrl     ?? '')

  const [minQuantity,  setMinQuantity]  = useState(item ? Number(item.minQuantity) : 0)
  const [maxQuantity,  setMaxQuantity]  = useState(item?.maxQuantity  ? Number(item.maxQuantity) : undefined as number | undefined)
  const [initialQty,   setInitialQty]   = useState(0)
  const [unitCost,     setUnitCost]     = useState(item?.averageCost ? Number(item.averageCost) : (item?.unitCost ? Number(item.unitCost) : undefined as number | undefined))

  const [locationShelf,   setLocationShelf]   = useState(item?.locationShelf   ?? '')
  const [locationSection, setLocationSection] = useState(item?.locationSection ?? '')
  const [locationDetail,  setLocationDetail]  = useState(item?.locationDetail  ?? '')

  // EPI-specific
  const [caNumber,  setCaNumber]  = useState('')
  const [caExpiry,  setCaExpiry]  = useState('')
  const [epiType,   setEpiType]   = useState('')

  // Uniform-specific
  const [uniformType, setUniformType] = useState('')

  const [lots,              setLots]              = useState<LotInput[]>([])
  const [initialLocationId, setInitialLocationId] = useState('')

  // Sections open/close
  const [secIdent,   setSecIdent]   = useState(true)
  const [secLocal,   setSecLocal]   = useState(true)
  const [secEstoque, setSecEstoque] = useState(true)
  const [secEspec,   setSecEspec]   = useState(false)
  const [secLotes,   setSecLotes]   = useState(false)

  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState(false)

  const units = mode === 'epi' ? UNITS_EPI : mode === 'uniform' ? UNITS_UNIFORM : UNITS_MATERIAL

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Nome é obrigatório'); return }
    setSaving(true)
    setError('')
    try {
      const body: any = {
        name:            name.trim(),
        code:            code.trim() || undefined,
        description:     description.trim() || undefined,
        category:        category || undefined,
        unit,
        brand:           brand.trim()  || undefined,
        model:           model.trim()  || undefined,
        imageUrl:        imageUrl      || undefined,
        minQuantity:     minQuantity   || 0,
        maxQuantity:     maxQuantity   || undefined,
        initialQuantity:   isEditing ? undefined : initialQty,
        initialLocationId: isEditing ? undefined : (initialLocationId || undefined),
        unitCost:        unitCost      || undefined,
        averageCost:     unitCost      || undefined,
        locationShelf:   locationShelf   || undefined,
        locationSection: locationSection || undefined,
        locationDetail:  locationDetail  || undefined,
        isConsumable:    mode === 'material',
        requiresCustody: false,
        isEpi:           mode === 'epi',
        isUniform:       mode === 'uniform',
        lots:            lots.length > 0 ? lots : undefined,
      }

      const url    = isEditing ? `${API}/api/v1/deposit/items/${item.id}` : `${API}/api/v1/deposit/items`
      const method = isEditing ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${getToken()}`,
          'x-company-id': getCompanyId(),
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `Erro ${res.status}`)
      }

      setSuccess(true)
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 700)
    } catch (err: any) {
      setError(err.message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const ICON = mode === 'epi' ? <ShieldCheck size={16} className="text-[#F5A623]" /> :
               mode === 'uniform' ? <Shirt size={16} className="text-[#F5A623]" /> :
               <Package size={16} className="text-[#F5A623]" />

  const TITLE = mode === 'epi' ? (isEditing ? 'Editar EPI' : 'Novo EPI') :
                mode === 'uniform' ? (isEditing ? 'Editar Uniforme' : 'Novo Uniforme') :
                (isEditing ? 'Editar Material' : 'Novo Material')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="bg-white w-full max-w-xl rounded-2xl flex flex-col max-h-[96dvh] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">{ICON}</div>
            <h2 className="font-semibold text-gray-800">{TITLE}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── Seção 1: Identificação ── */}
          <Section title="📋 Identificação" open={secIdent} onToggle={() => setSecIdent(o => !o)}>
            {/* Foto */}
            <Field label="Foto">
              <PhotoUpload value={imageUrl} onChange={setImageUrl} />
            </Field>

            {/* Nome */}
            <Field label="Nome" required>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={
                  mode === 'epi'     ? 'Ex: Capacete de segurança' :
                  mode === 'uniform' ? 'Ex: Camiseta manga longa' :
                  'Ex: Cimento CP II 50kg'
                }
                className={cn(inputCls, !name && error && 'border-red-400')}
              />
            </Field>

            {/* Código + Categoria (2 colunas) */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Código">
                <input type="text" value={code} onChange={e => setCode(e.target.value)}
                  placeholder="Gerado auto." className={inputCls} />
              </Field>
              {mode === 'material' && (
                <Field label="Categoria">
                  <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
                    <option value="">Selecionar…</option>
                    {CATEGORIES_MATERIAL.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              )}
              {mode === 'epi' && (
                <Field label="Tipo de EPI">
                  <select value={epiType} onChange={e => setEpiType(e.target.value)} className={inputCls}>
                    <option value="">Selecionar…</option>
                    {EPI_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
              )}
              {mode === 'uniform' && (
                <Field label="Tipo">
                  <select value={uniformType} onChange={e => setUniformType(e.target.value)} className={inputCls}>
                    <option value="">Selecionar…</option>
                    {UNIFORM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
              )}
            </div>

            {/* Marca + Modelo (material e epi) */}
            {mode !== 'uniform' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Marca / Fabricante">
                  <BrandInput
                    value={brand}
                    onChange={setBrand}
                    placeholder="Ex: Votorantim"
                    className={inputCls}
                  />
                </Field>
                <Field label="Referência">
                  <input type="text" value={model} onChange={e => setModel(e.target.value)}
                    placeholder="Código do produto" className={inputCls} />
                </Field>
              </div>
            )}

            {/* Unidade */}
            <Field label="Unidade de medida">
              <UnitChips units={units} selected={unit} onSelect={setUnit} />
            </Field>

            {/* EPI: CA */}
            {mode === 'epi' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nº CA (MTE)">
                  <input type="text" value={caNumber} onChange={e => setCaNumber(e.target.value)}
                    placeholder="Ex: 12345" className={inputCls} />
                </Field>
                <Field label="Validade do CA">
                  <input type="date" value={caExpiry} onChange={e => setCaExpiry(e.target.value)}
                    className={inputCls} />
                </Field>
              </div>
            )}

            {/* Descrição */}
            <Field label="Descrição">
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Especificações técnicas, normas, observações…"
                rows={2} className={cn(inputCls, 'resize-none')} />
            </Field>
          </Section>

          {/* ── Seção 2: Localização ── */}
          <Section title="📍 Localização no Depósito" open={secLocal} onToggle={() => setSecLocal(o => !o)}>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Prateleira">
                <select value={locationShelf} onChange={e => setLocationShelf(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {SHELF_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Seção">
                <select value={locationSection} onChange={e => setLocationSection(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {SECTION_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Detalhe">
                <input type="text" value={locationDetail} onChange={e => setLocationDetail(e.target.value)}
                  placeholder="Ex: 2ª prateleira" className={inputCls} />
              </Field>
            </div>
            <LocationPreview shelf={locationShelf} section={locationSection} detail={locationDetail} />
          </Section>

          {/* ── Seção 3: Estoque e Custos ── */}
          <Section title="📊 Estoque e Custos" open={secEstoque} onToggle={() => setSecEstoque(o => !o)}>
            <div className="grid grid-cols-3 gap-3">
              {!isEditing && (
                <Field label="Qtd. inicial">
                  <input type="number" min="0" step="0.001" value={initialQty || ''}
                    onChange={e => setInitialQty(Number(e.target.value))}
                    placeholder="0" className={inputCls} />
                </Field>
              )}
            </div>
            {!isEditing && initialQty > 0 && locations.length > 0 && (
              <Field label="Local da quantidade inicial">
                <select
                  value={initialLocationId}
                  onChange={e => setInitialLocationId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">🏦 Depósito Central (padrão)</option>
                  {locations.filter(l => l.type !== 'CENTRAL').map(l => (
                    <option key={l.id} value={l.id}>📦 {l.name}</option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">Se não selecionado, irá para o Depósito Central.</p>
              </Field>
            )}
            <div className="grid grid-cols-3 gap-3">
              <Field label="Mínimo *">
                <input type="number" min="0" step="0.001" value={minQuantity || ''}
                  onChange={e => setMinQuantity(Number(e.target.value))}
                  placeholder="0" className={inputCls} />
              </Field>
              <Field label="Máximo">
                <input type="number" min="0" step="0.001" value={maxQuantity ?? ''}
                  onChange={e => setMaxQuantity(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="—" className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Custo unitário (R$)">
                <input type="number" min="0" step="0.01" value={unitCost ?? ''}
                  onChange={e => setUnitCost(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="0,00" className={inputCls} />
              </Field>
              {!isEditing && initialQty > 0 && unitCost && (
                <div className="flex flex-col justify-end pb-1">
                  <span className="text-xs text-gray-500">Valor em estoque:</span>
                  <span className="text-base font-bold text-[#F5A623]">
                    {formatCurrency(initialQty * unitCost)}
                  </span>
                </div>
              )}
            </div>
          </Section>

          {/* ── Seção 4: Lotes (colapsado) ── */}
          <Section title="🏷️ Lotes e Fornecedores" open={secLotes} onToggle={() => setSecLotes(o => !o)}>
            <p className="text-xs text-gray-400 -mt-1">Opcional — detalhe por fornecedor/NF. O custo médio será calculado automaticamente.</p>
            <LotsSection lots={lots} onChange={setLots} />
          </Section>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-xs text-red-700">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving || success}
            className="flex-1 py-2.5 rounded-xl bg-[#F5A623] text-white text-sm font-semibold hover:bg-[#e09610] transition disabled:opacity-60 flex items-center justify-center gap-2">
            {success ? <><CheckCircle2 size={15} />Salvo!</> :
             saving  ? <><Loader2 size={15} className="animate-spin" />Salvando…</> :
             isEditing ? `Atualizar ${mode === 'epi' ? 'EPI' : mode === 'uniform' ? 'uniforme' : 'material'}` :
                         `Cadastrar ${mode === 'epi' ? 'EPI' : mode === 'uniform' ? 'uniforme' : 'material'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
