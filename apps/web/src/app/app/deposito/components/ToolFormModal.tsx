'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  X, Wrench, Upload, Loader2, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, Calendar, MapPin, Phone, Building2,
  Zap, Battery, Wind, Ruler, HardHat, PenTool, Camera, Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
function getToken()     { return typeof window !== 'undefined' ? (localStorage.getItem('token')     ?? '') : '' }
function getCompanyId() { return typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : '' }

// ─── Types ────────────────────────────────────────────────────────────────────

const TOOL_TYPES = [
  { value: 'MANUAL',     label: 'Manual',     icon: PenTool   },
  { value: 'ELECTRIC',   label: 'Elétrica',   icon: Zap       },
  { value: 'PNEUMATIC',  label: 'Pneumática', icon: Wind      },
  { value: 'HYDRAULIC',  label: 'Hidráulica', icon: HardHat   },
  { value: 'MEASURING',  label: 'Medição',    icon: Ruler     },
]

const VOLTAGE_OPTIONS = [
  { value: '127V',       label: '127 V'      },
  { value: '220V',       label: '220 V'      },
  { value: 'BIVOLT',     label: 'Bivolt'     },
  { value: 'BATTERY',    label: 'Bateria'    },
  { value: 'COMPRESSED', label: 'Ar comprimido' },
]

const POWER_UNITS = ['W', 'kW', 'Ah', 'HP']

interface ExistingTool {
  id:                string
  name:              string
  code?:             string | null
  description?:      string | null
  category?:         string | null
  brand?:            string | null
  model?:            string | null
  serialNumber?:     string | null
  imageUrl?:         string | null
  toolType?:         string | null
  voltage?:          string | null
  power?:            string | null
  purchaseDate?:     string | null
  warrantyMonths?:   number | null
  warrantyExpiry?:   string | null
  lastMaintenance?:  string | null
  nextMaintenance?:  string | null
  locationShelf?:    string | null
  locationSection?:  string | null
  locationDetail?:   string | null
  requiresCustody:   boolean
  unitCost?:         number | null
  serviceCenter?:    string | null
  serviceCenterPhone?: string | null
  serviceCenterCity?:  string | null
  serviceCenterAddress?: string | null
}

interface Props {
  isOpen:     boolean
  onClose:    () => void
  onSuccess?: () => void
  tool?:      ExistingTool | null
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function inputCls(extra = '') {
  return cn(
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-xl',
    'focus:outline-none focus:border-[#F5A623] focus:ring-1 focus:ring-[#F5A623]/20',
    'placeholder:text-gray-300 bg-white',
    extra,
  )
}

function Section({
  title, icon, defaultOpen = true, children,
}: {
  title: string; icon?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          {icon}
          {title}
        </span>
        {open
          ? <ChevronUp size={14} className="text-gray-400" />
          : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
  )
}

function PhotoUpload({
  current, onChange,
}: {
  current: string | null
  onChange: (file: File | null) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const resolved = preview ?? (
    current
      ? (current.startsWith('http') ? current : `${API}/${current}`)
      : null
  )

  const handleFile = (file: File) => {
    onChange(file)
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <div className="flex items-center gap-4">
      <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
        {resolved
          ? <img src={resolved} alt="" className="w-full h-full object-cover" />
          : <Camera size={22} className="text-gray-300" />}
      </div>
      <div className="flex-1 space-y-1">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="flex items-center gap-1.5 text-xs font-medium text-[#F5A623] border border-[#F5A623] px-3 py-1.5 rounded-lg hover:bg-orange-50 transition"
        >
          <Upload size={12} />
          {resolved ? 'Trocar foto' : 'Adicionar foto'}
        </button>
        <p className="text-[10px] text-gray-400">JPG ou PNG, máx. 5 MB</p>
        <input
          ref={ref}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>
    </div>
  )
}

function ToolTypeChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TOOL_TYPES.map(t => {
        const Icon = t.icon
        const sel  = value === t.value
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(value === t.value ? '' : t.value)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition',
              sel
                ? 'bg-[#F5A623] border-[#F5A623] text-white'
                : 'border-gray-200 text-gray-600 hover:border-gray-300',
            )}
          >
            <Icon size={12} />
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

function VoltageChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {VOLTAGE_OPTIONS.map(v => {
        const sel = value === v.value
        return (
          <button
            key={v.value}
            type="button"
            onClick={() => onChange(value === v.value ? '' : v.value)}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-medium border transition',
              sel
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'border-gray-200 text-gray-600 hover:border-gray-300',
            )}
          >
            {v.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ToolFormModal({ isOpen, onClose, onSuccess, tool }: Props) {
  const isEdit = !!tool?.id

  // ── Form state ──────────────────────────────────────────────────────────────
  const [name,               setName]               = useState('')
  const [code,               setCode]               = useState('')
  const [brand,              setBrand]              = useState('')
  const [model,              setModel]              = useState('')
  const [serialNumber,       setSerialNumber]       = useState('')
  const [description,        setDescription]        = useState('')
  const [category,           setCategory]           = useState('')
  const [toolType,           setToolType]           = useState('')
  const [voltage,            setVoltage]            = useState('')
  const [powerValue,         setPowerValue]         = useState('')
  const [powerUnit,          setPowerUnit]          = useState('W')
  const [purchaseDate,       setPurchaseDate]       = useState('')
  const [warrantyMonths,     setWarrantyMonths]     = useState<number | ''>('')
  const [warrantyExpiry,     setWarrantyExpiry]     = useState('')
  const [unitCost,           setUnitCost]           = useState<number | ''>('')
  const [locationShelf,      setLocationShelf]      = useState('')
  const [locationSection,    setLocationSection]    = useState('')
  const [locationDetail,     setLocationDetail]     = useState('')
  const [lastMaintenance,    setLastMaintenance]    = useState('')
  const [nextMaintenance,    setNextMaintenance]    = useState('')
  const [serviceCenter,      setServiceCenter]      = useState('')
  const [serviceCenterPhone, setServiceCenterPhone] = useState('')
  const [serviceCenterCity,  setServiceCenterCity]  = useState('')
  const [serviceCenterAddress, setServiceCenterAddress] = useState('')
  const [requiresCustody,    setRequiresCustody]    = useState(true)
  const [initialQuantity,    setInitialQuantity]    = useState<number>(1)
  const [photoFile,          setPhotoFile]          = useState<File | null>(null)

  // ── Status ──────────────────────────────────────────────────────────────────
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)

  // ── Populate form on edit ────────────────────────────────────────────────────
  useEffect(() => {
    if (tool) {
      setName(tool.name ?? '')
      setCode(tool.code ?? '')
      setBrand(tool.brand ?? '')
      setModel(tool.model ?? '')
      setSerialNumber(tool.serialNumber ?? '')
      setDescription(tool.description ?? '')
      setCategory(tool.category ?? '')
      setToolType(tool.toolType ?? '')
      setVoltage(tool.voltage ?? '')
      if (tool.power) {
        const parts = tool.power.split(' ')
        setPowerValue(parts[0] ?? '')
        setPowerUnit(parts[1] ?? 'W')
      } else {
        setPowerValue('')
        setPowerUnit('W')
      }
      setPurchaseDate(tool.purchaseDate ? tool.purchaseDate.substring(0, 10) : '')
      setWarrantyMonths(tool.warrantyMonths ?? '')
      setWarrantyExpiry(tool.warrantyExpiry ? tool.warrantyExpiry.substring(0, 10) : '')
      setUnitCost(tool.unitCost ?? '')
      setLocationShelf(tool.locationShelf ?? '')
      setLocationSection(tool.locationSection ?? '')
      setLocationDetail(tool.locationDetail ?? '')
      setLastMaintenance(tool.lastMaintenance ? tool.lastMaintenance.substring(0, 10) : '')
      setNextMaintenance(tool.nextMaintenance ? tool.nextMaintenance.substring(0, 10) : '')
      setServiceCenter(tool.serviceCenter ?? '')
      setServiceCenterPhone(tool.serviceCenterPhone ?? '')
      setServiceCenterCity(tool.serviceCenterCity ?? '')
      setServiceCenterAddress(tool.serviceCenterAddress ?? '')
      setRequiresCustody(tool.requiresCustody ?? true)
    } else {
      resetForm()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, isOpen])

  function resetForm() {
    setName(''); setCode(''); setBrand(''); setModel(''); setSerialNumber('')
    setDescription(''); setCategory(''); setToolType(''); setVoltage('')
    setPowerValue(''); setPowerUnit('W')
    setPurchaseDate(''); setWarrantyMonths(''); setWarrantyExpiry('')
    setUnitCost(''); setLocationShelf(''); setLocationSection('')
    setLocationDetail(''); setLastMaintenance(''); setNextMaintenance('')
    setServiceCenter(''); setServiceCenterPhone(''); setServiceCenterCity('')
    setServiceCenterAddress(''); setRequiresCustody(true); setInitialQuantity(1)
    setPhotoFile(null); setError(''); setSuccess(false)
  }

  // Auto-calc warrantyExpiry from purchaseDate + warrantyMonths
  useEffect(() => {
    if (!purchaseDate || !warrantyMonths) return
    const d = new Date(purchaseDate)
    d.setMonth(d.getMonth() + Number(warrantyMonths))
    setWarrantyExpiry(d.toISOString().substring(0, 10))
  }, [purchaseDate, warrantyMonths])

  const locationFull = [locationShelf, locationSection, locationDetail].filter(Boolean).join(' > ')

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Nome da ferramenta é obrigatório.'); return }

    setSaving(true)
    try {
      let imageUrl: string | undefined
      if (photoFile) {
        const form = new FormData()
        form.append('file', photoFile)
        form.append('folder', 'deposit-items')
        const upRes = await fetch(`${API}/api/v1/uploads/image`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${getToken()}`, 'x-company-id': getCompanyId() },
          body:    form,
        })
        if (upRes.ok) { const d = await upRes.json(); imageUrl = d.url ?? d.path }
      }

      const power = powerValue ? `${powerValue} ${powerUnit}` : undefined

      const payload: Record<string, any> = {
        name:              name.trim(),
        code:              code.trim()  || undefined,
        brand:             brand.trim() || undefined,
        model:             model.trim() || undefined,
        serialNumber:      serialNumber.trim() || undefined,
        description:       description.trim()  || undefined,
        category:          category.trim()     || undefined,
        toolType:          toolType             || undefined,
        voltage:           voltage              || undefined,
        power,
        purchaseDate:      purchaseDate         || undefined,
        warrantyMonths:    warrantyMonths !== '' ? Number(warrantyMonths) : undefined,
        warrantyExpiry:    warrantyExpiry       || undefined,
        unitCost:          unitCost !== ''      ? Number(unitCost) : undefined,
        locationShelf:     locationShelf.trim()    || undefined,
        locationSection:   locationSection.trim()  || undefined,
        locationDetail:    locationDetail.trim()   || undefined,
        lastMaintenance:   lastMaintenance         || undefined,
        nextMaintenance:   nextMaintenance         || undefined,
        serviceCenter:     serviceCenter.trim()    || undefined,
        serviceCenterPhone: serviceCenterPhone.trim() || undefined,
        serviceCenterCity:  serviceCenterCity.trim()  || undefined,
        serviceCenterAddress: serviceCenterAddress.trim() || undefined,
        requiresCustody:   requiresCustody,
        isConsumable:      false,
        isEpi:             false,
        isUniform:         false,
        unit:              'un',
        // FIX 2+6: quantidade inicial — MANUAL livre, outros sempre 1
        ...(!isEdit ? {
          initialQuantity: (toolType && toolType !== 'MANUAL') ? 1 : Math.max(1, initialQuantity),
        } : {}),
      }
      if (imageUrl) payload.imageUrl = imageUrl

      const url    = isEdit ? `/api/v1/deposit/items/${tool!.id}` : '/api/v1/deposit/items'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(`${API}${url}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${getToken()}`,
          'x-company-id': getCompanyId(),
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? d.message ?? `Erro ${res.status}`)
      }

      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        onSuccess?.()
        onClose()
      }, 800)
    } catch (err: any) {
      setError(err.message ?? 'Erro ao salvar ferramenta.')
    } finally {
      setSaving(false)
    }
  }, [
    name, code, brand, model, serialNumber, description, category,
    toolType, voltage, powerValue, powerUnit,
    purchaseDate, warrantyMonths, warrantyExpiry, unitCost,
    locationShelf, locationSection, locationDetail,
    lastMaintenance, nextMaintenance,
    serviceCenter, serviceCenterPhone, serviceCenterCity, serviceCenterAddress,
    requiresCustody, initialQuantity, photoFile, isEdit, tool, onClose, onSuccess,
  ])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Sheet */}
      <div className={cn(
        'relative z-10 bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl',
        'flex flex-col max-h-[92dvh] sm:max-h-[88vh]',
        'rounded-t-2xl',
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
              <Wrench size={18} className="text-purple-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {isEdit ? 'Editar Ferramenta' : 'Nova Ferramenta'}
              </h2>
              <p className="text-xs text-gray-400">Ferramentário · Cautela obrigatória</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 transition"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Body — scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto overscroll-contain">
          <div className="p-5 space-y-4">

            {/* Foto */}
            <PhotoUpload
              current={tool?.imageUrl ?? null}
              onChange={setPhotoFile}
            />

            {/* ── Identificação ─────────────────────────────────────────── */}
            <Section title="Identificação" icon={<Wrench size={14} className="text-purple-500" />}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nome da ferramenta" required>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ex: Furadeira de impacto"
                    className={inputCls()}
                    required
                  />
                </Field>
                <Field label="Código / Patrimônio">
                  <input
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    placeholder="Ex: FERR-001"
                    className={inputCls()}
                  />
                </Field>
                <Field label="Marca">
                  <input
                    value={brand}
                    onChange={e => setBrand(e.target.value)}
                    placeholder="Ex: Bosch"
                    className={inputCls()}
                  />
                </Field>
                <Field label="Modelo">
                  <input
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    placeholder="Ex: GBH 2-28 F"
                    className={inputCls()}
                  />
                </Field>
                <Field label="Número de série">
                  <input
                    value={serialNumber}
                    onChange={e => setSerialNumber(e.target.value)}
                    placeholder="Ex: SN123456789"
                    className={inputCls()}
                  />
                </Field>
                <Field label="Categoria">
                  <input
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    placeholder="Ex: Perfuração"
                    className={inputCls()}
                  />
                </Field>
              </div>
              <Field label="Descrição / Observações">
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Detalhes, acessórios, estado..."
                  rows={2}
                  className={inputCls('resize-none')}
                />
              </Field>
              {/* FIX 2+6: quantidade inicial — regra por tipo de ferramenta */}
              {!isEdit && (
                toolType === 'MANUAL' || !toolType ? (
                  <Field label="Quantidade inicial">
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={1}
                        value={initialQuantity}
                        onChange={e => setInitialQuantity(Math.max(1, Number(e.target.value)))}
                        className={inputCls('w-24')}
                      />
                      <p className="text-xs text-gray-400">
                        Ferramentas manuais podem ter múltiplas unidades (ex: chaves, alicates).
                      </p>
                    </div>
                  </Field>
                ) : (
                  <Field label="Quantidade inicial">
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-500">
                      <Lock size={12} className="text-gray-400 flex-shrink-0" />
                      <span>1 unidade — identificação única por número de série</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Ferramentas elétricas, pneumáticas e hidráulicas são cadastradas individualmente.
                    </p>
                  </Field>
                )
              )}
            </Section>

            {/* ── Tipo e Energia ────────────────────────────────────────── */}
            <Section title="Tipo e Energia" icon={<Zap size={14} className="text-blue-500" />}>
              <Field label="Tipo de ferramenta">
                <ToolTypeChips
                  value={toolType}
                  onChange={v => {
                    setToolType(v)
                    // FIX 2: não-manual → quantidade sempre 1
                    if (v && v !== 'MANUAL') setInitialQuantity(1)
                  }}
                />
              </Field>

              {(toolType === 'ELECTRIC' || toolType === 'PNEUMATIC') && (
                <Field label="Tensão / Alimentação">
                  <VoltageChips value={voltage} onChange={setVoltage} />
                </Field>
              )}

              {toolType === 'ELECTRIC' && (
                <Field label="Potência">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={powerValue}
                      onChange={e => setPowerValue(e.target.value)}
                      placeholder="Ex: 850"
                      className={inputCls('flex-1')}
                      min={0}
                    />
                    <div className="flex gap-1">
                      {POWER_UNITS.map(u => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setPowerUnit(u)}
                          className={cn(
                            'px-2.5 py-2 text-xs font-medium rounded-xl border transition',
                            powerUnit === u
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300',
                          )}
                        >{u}</button>
                      ))}
                    </div>
                  </div>
                </Field>
              )}
            </Section>

            {/* ── Localização ───────────────────────────────────────────── */}
            <Section title="Localização no Depósito" icon={<MapPin size={14} className="text-red-500" />} defaultOpen={false}>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Prateleira">
                  <input value={locationShelf}   onChange={e => setLocationShelf(e.target.value)}   placeholder="A" className={inputCls()} />
                </Field>
                <Field label="Seção">
                  <input value={locationSection} onChange={e => setLocationSection(e.target.value)} placeholder="1" className={inputCls()} />
                </Field>
                <Field label="Detalhe">
                  <input value={locationDetail}  onChange={e => setLocationDetail(e.target.value)}  placeholder="C2" className={inputCls()} />
                </Field>
              </div>
              {locationFull && (
                <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                  <MapPin size={11} />
                  {locationFull}
                </div>
              )}
            </Section>

            {/* ── Compra e Garantia ─────────────────────────────────────── */}
            <Section title="Compra e Garantia" icon={<Calendar size={14} className="text-green-500" />} defaultOpen={false}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Data de compra">
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={e => setPurchaseDate(e.target.value)}
                    className={inputCls()}
                  />
                </Field>
                <Field label="Garantia (meses)">
                  <input
                    type="number"
                    value={warrantyMonths}
                    onChange={e => setWarrantyMonths(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Ex: 12"
                    min={0}
                    className={inputCls()}
                  />
                </Field>
                <Field label="Vencimento garantia">
                  <input
                    type="date"
                    value={warrantyExpiry}
                    onChange={e => setWarrantyExpiry(e.target.value)}
                    className={inputCls()}
                  />
                </Field>
              </div>
              {warrantyExpiry && purchaseDate && (
                <p className="text-[11px] text-gray-400">
                  {new Date(warrantyExpiry) > new Date()
                    ? `✅ Garantia válida até ${new Date(warrantyExpiry).toLocaleDateString('pt-BR')}`
                    : `❌ Garantia vencida em ${new Date(warrantyExpiry).toLocaleDateString('pt-BR')}`}
                </p>
              )}
              <Field label="Valor de compra (R$)">
                <input
                  type="number"
                  value={unitCost}
                  onChange={e => setUnitCost(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0,00"
                  min={0}
                  step={0.01}
                  className={inputCls('max-w-[160px]')}
                />
              </Field>
            </Section>

            {/* ── Manutenção ────────────────────────────────────────────── */}
            <Section title="Manutenção" icon={<Wrench size={14} className="text-orange-500" />} defaultOpen={false}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Última manutenção">
                  <input
                    type="date"
                    value={lastMaintenance}
                    onChange={e => setLastMaintenance(e.target.value)}
                    className={inputCls()}
                  />
                </Field>
                <Field label="Próxima manutenção">
                  <input
                    type="date"
                    value={nextMaintenance}
                    onChange={e => setNextMaintenance(e.target.value)}
                    className={inputCls()}
                  />
                </Field>
              </div>
            </Section>

            {/* ── Assistência técnica ───────────────────────────────────── */}
            <Section title="Assistência Técnica" icon={<Building2 size={14} className="text-blue-500" />} defaultOpen={false}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nome da assistência">
                  <input
                    value={serviceCenter}
                    onChange={e => setServiceCenter(e.target.value)}
                    placeholder="Ex: Bosch Service Center"
                    className={inputCls()}
                  />
                </Field>
                <Field label="Telefone">
                  <div className="relative">
                    <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={serviceCenterPhone}
                      onChange={e => setServiceCenterPhone(e.target.value)}
                      placeholder="(11) 9 9999-9999"
                      className={inputCls('pl-8')}
                    />
                  </div>
                </Field>
                <Field label="Cidade">
                  <input
                    value={serviceCenterCity}
                    onChange={e => setServiceCenterCity(e.target.value)}
                    placeholder="Ex: São Paulo"
                    className={inputCls()}
                  />
                </Field>
                <Field label="Endereço">
                  <input
                    value={serviceCenterAddress}
                    onChange={e => setServiceCenterAddress(e.target.value)}
                    placeholder="Rua, número, bairro"
                    className={inputCls()}
                  />
                </Field>
              </div>
            </Section>

            {/* ── Configurações ─────────────────────────────────────────── */}
            <Section title="Configurações" icon={<HardHat size={14} className="text-gray-500" />} defaultOpen={false}>
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setRequiresCustody(v => !v)}
                  className={cn(
                    'relative w-10 h-6 rounded-full transition-colors cursor-pointer',
                    requiresCustody ? 'bg-[#F5A623]' : 'bg-gray-200',
                  )}
                >
                  <div className={cn(
                    'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform',
                    requiresCustody ? 'translate-x-5' : 'translate-x-1',
                  )} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Exige cautela</p>
                  <p className="text-xs text-gray-400">Registra responsável ao sair do depósito</p>
                </div>
              </label>
            </Section>

          </div>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex items-center gap-3 flex-shrink-0">
            {error && (
              <p className="flex items-center gap-1.5 text-xs text-red-600 flex-1">
                <AlertCircle size={13} />
                {error}
              </p>
            )}
            {success && (
              <p className="flex items-center gap-1.5 text-xs text-green-600 flex-1">
                <CheckCircle2 size={13} />
                Salvo com sucesso!
              </p>
            )}
            {!error && !success && <span className="flex-1" />}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-[#F5A623] text-white text-sm font-medium rounded-xl hover:bg-[#e09610] disabled:opacity-60 transition"
            >
              {saving
                ? <><Loader2 size={14} className="animate-spin" /> Salvando...</>
                : <>{isEdit ? 'Salvar alterações' : 'Cadastrar ferramenta'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
