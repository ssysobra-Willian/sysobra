'use client'
import { useState, useEffect, useRef } from 'react'
import { SignaturePad } from '@/components/deposit/SignaturePad'

const API     = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const token   = () => typeof window !== 'undefined' ? (localStorage.getItem('token')     ?? '') : ''
const company = () => typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : ''

function getAssetUrl(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${API}${url.startsWith('/') ? '' : '/'}${url}`
}

function apiFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token()}`,
      'x-company-id': company(),
      ...(opts.headers ?? {}),
    },
  })
}

// ─── tipos ───────────────────────────────────────────────────────────────────

export interface WaybillDraftData {
  exitType?:             string
  destinationProjectId?: string
  destinationName?:      string
  // motorista
  driverType?:           'EMPLOYEE' | 'EXTERNAL'
  driverEmployeeId?:     string | null
  driverName?:           string | null
  driverDocument?:       string | null
  driverPhone?:          string | null
  vehiclePlate?:         string | null
  vehicleModel?:         string | null
  // recebedor
  receiverType?:         'EMPLOYEE' | 'EXTERNAL'
  receiverEmployeeId?:   string | null
  receiverName?:         string | null
  receiverDocument?:     string | null
  receiverPhone?:        string | null
  receiverRole?:         string | null
  notes?:                string | null
  items?: { itemId: string; name: string; unit: string; quantity: number; availableQty?: number }[]
}

interface WaybillModalProps {
  isOpen:       boolean
  onClose:      () => void
  category:     'MATERIAL' | 'TOOL' | 'EPI_UNIFORM'
  locationId:   string
  locationName: string
  onSuccess:    () => void
  draftData?:   WaybillDraftData
}

const CATEGORY_LABELS: Record<string, string> = {
  MATERIAL:    'Materiais',
  TOOL:        'Ferramentário',
  EPI_UNIFORM: 'EPIs e Uniformes',
}

const CATEGORY_ICONS: Record<string, string> = {
  MATERIAL:    'ti-package',
  TOOL:        'ti-tool',
  EPI_UNIFORM: 'ti-shield-check',
}

// ─── componente ──────────────────────────────────────────────────────────────

export default function WaybillModal({
  isOpen, onClose, category, locationId, locationName, onSuccess, draftData,
}: WaybillModalProps) {

  // ── etapas: 1=Saída/Pessoas 2=Itens 3=Fotos 4=Assinatura ──────────────────
  const [step, setStep]       = useState<1 | 2 | 3 | 4>(1)
  const [saving, setSaving]   = useState(false)
  const [loading, setLoading] = useState(false)

  // Tipo de saída
  const [exitType, setExitType] = useState<'DIRECT_PICKUP' | 'DRIVER_DELIVERY'>('DIRECT_PICKUP')

  // Destino
  const [destinationType,      setDestinationType]      = useState<'PROJECT' | 'LOCATION'>('PROJECT')
  const [destinationProjectId, setDestinationProjectId] = useState('')
  const [destinationName,      setDestinationName]      = useState('')
  const [destinationLocationId,setDestinationLocationId]= useState('')
  const [projects,             setProjects]             = useState<any[]>([])
  const [locations,            setLocations]            = useState<any[]>([])

  // Motorista
  const [driverType,       setDriverType]       = useState<'EMPLOYEE' | 'EXTERNAL'>('EMPLOYEE')
  const [driverEmployeeId, setDriverEmployeeId] = useState('')
  const [driverName,       setDriverName]       = useState('')
  const [driverDocument,   setDriverDocument]   = useState('')
  const [driverPhone,      setDriverPhone]      = useState('')
  const [vehiclePlate,     setVehiclePlate]     = useState('')
  const [vehicleModel,     setVehicleModel]     = useState('')
  const [employees,        setEmployees]        = useState<any[]>([])

  // Recebedor
  const [receiverType,       setReceiverType]       = useState<'EMPLOYEE' | 'EXTERNAL'>('EMPLOYEE')
  const [receiverEmployeeId, setReceiverEmployeeId] = useState('')
  const [receiverName,       setReceiverName]       = useState('')
  const [receiverDocument,   setReceiverDocument]   = useState('')
  const [receiverPhone,      setReceiverPhone]      = useState('')
  const [receiverRole,       setReceiverRole]       = useState('')

  // Itens
  const [availableItems, setAvailableItems] = useState<any[]>([])
  const [selectedItems,  setSelectedItems]  = useState<{
    itemId: string; name: string; unit: string; quantity: number
    availableQty: number; serialNumber: string; toolBrand: string
    toolModel: string; toolCondition: string; category: string
  }[]>([])
  const [itemSearch, setItemSearch] = useState('')

  // Fotos
  const [initialPhotos, setInitialPhotos] = useState<string[]>([])
  const cameraRef = useRef<HTMLInputElement>(null)

  // Assinaturas
  const [senderSignature,  setSenderSignature]  = useState<string | null>(null)
  const [secondSignature,  setSecondSignature]  = useState<string | null>(null)

  // Observações
  const [notes, setNotes] = useState('')

  // Validação etapa 1
  const [step1Error, setStep1Error] = useState('')

  // ── carregar ao abrir ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    loadProjects()
    loadLocations()
    loadEmployees()
    loadItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, category, locationId])

  // ── pré-popular com rascunho ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !draftData) return
    if (draftData.exitType)             setExitType(draftData.exitType as any)
    if (draftData.destinationProjectId) setDestinationProjectId(draftData.destinationProjectId)
    if (draftData.destinationName)      setDestinationName(draftData.destinationName)
    // motorista
    if (draftData.driverType)           setDriverType(draftData.driverType)
    if (draftData.driverEmployeeId)     setDriverEmployeeId(draftData.driverEmployeeId)
    if (draftData.driverName)           setDriverName(draftData.driverName ?? '')
    if (draftData.driverDocument)       setDriverDocument(draftData.driverDocument ?? '')
    if (draftData.driverPhone)          setDriverPhone(draftData.driverPhone ?? '')
    if (draftData.vehiclePlate)         setVehiclePlate(draftData.vehiclePlate ?? '')
    if (draftData.vehicleModel)         setVehicleModel(draftData.vehicleModel ?? '')
    // recebedor
    if (draftData.receiverType)         setReceiverType(draftData.receiverType)
    if (draftData.receiverEmployeeId)   setReceiverEmployeeId(draftData.receiverEmployeeId)
    if (draftData.receiverName)         setReceiverName(draftData.receiverName ?? '')
    if (draftData.receiverDocument)     setReceiverDocument(draftData.receiverDocument ?? '')
    if (draftData.receiverPhone)        setReceiverPhone(draftData.receiverPhone ?? '')
    if (draftData.receiverRole)         setReceiverRole(draftData.receiverRole ?? '')
    if (draftData.notes)                setNotes(draftData.notes)
    if (draftData.items?.length) {
      setSelectedItems(draftData.items.map(i => ({
        itemId:        i.itemId,
        name:          i.name,
        unit:          i.unit,
        quantity:      i.quantity,
        availableQty:  i.availableQty ?? 0,
        serialNumber:  '',
        toolBrand:     '',
        toolModel:     '',
        toolCondition: 'BOM',
        category:      category,
      })))
    }
    setStep(2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, draftData])

  async function loadProjects() {
    try {
      const r = await apiFetch('/api/v1/projects?limit=100')
      const d = await r.json()
      setProjects(d.projects ?? d ?? [])
    } catch {}
  }

  async function loadLocations() {
    try {
      const r = await apiFetch('/api/v1/deposit/locations')
      const d = await r.json()
      // excluir o próprio locationId (origem) da lista de destinos
      const all = d.locations ?? d ?? []
      setLocations(all.filter((l: any) => l.id !== locationId && l.isActive !== false))
    } catch {}
  }

  async function loadEmployees() {
    try {
      const r = await apiFetch('/api/v1/employees?limit=100&status=ACTIVE')
      const d = await r.json()
      setEmployees(d.employees ?? [])
    } catch {}
  }

  async function loadItems() {
    setLoading(true)
    try {
      // waybillCategory=MATERIAL|TOOL|EPI_UNIFORM + locationId para filtrar por saldo no local
      const r = await apiFetch(
        `/api/v1/deposit/items?locationId=${locationId}&waybillCategory=${category}&limit=200`,
      )
      const d = await r.json()
      setAvailableItems(d.items ?? d ?? [])
    } catch {} finally { setLoading(false) }
  }

  const filteredItems = availableItems.filter(i =>
    !itemSearch ||
    i.name?.toLowerCase().includes(itemSearch.toLowerCase()) ||
    i.code?.toLowerCase().includes(itemSearch.toLowerCase()),
  )

  function addItem(item: any) {
    if (selectedItems.find(s => s.itemId === item.id)) return
    setSelectedItems(prev => [...prev, {
      itemId:        item.id,
      name:          item.name,
      unit:          item.unit,
      quantity:      1,
      availableQty:  Number(item.availableQty ?? item.currentStock ?? 0),
      serialNumber:  item.serialNumber ?? '',
      toolBrand:     item.brand ?? '',
      toolModel:     item.model ?? '',
      toolCondition: 'BOM',
      category:      item.category,
    }])
  }

  function removeItem(itemId: string) {
    setSelectedItems(prev => prev.filter(i => i.itemId !== itemId))
  }

  function updateItem(itemId: string, field: string, value: any) {
    setSelectedItems(prev => prev.map(i => i.itemId === itemId ? { ...i, [field]: value } : i))
  }

  // ── foto com timestamp ─────────────────────────────────────────────────────
  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const img = new Image()
    img.src = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const maxSize = 1200
      const ratio = Math.min(maxSize / img.width, maxSize / img.height)
      canvas.width  = img.width  * ratio
      canvas.height = img.height * ratio
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const ts = new Date().toLocaleString('pt-BR')
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(0, canvas.height - 28, canvas.width, 28)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 14px Arial'
      ctx.fillText(ts, 8, canvas.height - 8)
      setInitialPhotos(prev => [...prev, canvas.toDataURL('image/jpeg', 0.85)])
      URL.revokeObjectURL(img.src)
    }
    e.target.value = ''
  }

  // ── helpers de construção do body ──────────────────────────────────────────
  function buildBody(status: 'DRAFT' | 'EMITTED') {
    return {
      category,
      locationId,
      status,
      exitType,
      destinationProjectId:  destinationType === 'PROJECT'  ? (destinationProjectId || null) : null,
      destinationLocationId: destinationType === 'LOCATION' ? (destinationLocationId || null) : null,
      destinationName:       destinationName || null,
      driverType:           exitType === 'DRIVER_DELIVERY' ? driverType : null,
      driverEmployeeId:     exitType === 'DRIVER_DELIVERY' && driverType === 'EMPLOYEE'
                              ? driverEmployeeId : null,
      driverName:     driverName     || null,
      driverDocument: driverDocument || null,
      driverPhone:    driverPhone    || null,
      vehiclePlate:   vehiclePlate   || null,
      vehicleModel:   vehicleModel   || null,
      receiverType,
      receiverEmployeeId: receiverType === 'EMPLOYEE' ? receiverEmployeeId : null,
      receiverName:       receiverName     || null,
      receiverDocument:   receiverDocument || null,
      receiverPhone:      receiverPhone    || null,
      receiverRole:       receiverRole     || null,
      notes: notes || null,
      items: selectedItems.map(i => ({
        itemId:        i.itemId,
        quantity:      i.quantity,
        serialNumber:  i.serialNumber  || null,
        toolBrand:     i.toolBrand     || null,
        toolModel:     i.toolModel     || null,
        toolCondition: i.toolCondition || null,
      })),
    }
  }

  // ── salvar rascunho ────────────────────────────────────────────────────────
  async function handleSaveDraft() {
    setSaving(true)
    try {
      const r = await apiFetch('/api/v1/waybill', {
        method: 'POST',
        body:   JSON.stringify(buildBody('DRAFT')),
      })
      if (!r.ok) throw new Error()
      alert('Rascunho salvo com sucesso!')
      onSuccess()
      handleClose()
    } catch { alert('Erro ao salvar rascunho') }
    finally { setSaving(false) }
  }

  // ── emitir ─────────────────────────────────────────────────────────────────
  async function handleEmit() {
    if (!senderSignature) { alert('A assinatura do almoxarife é obrigatória'); return }
    if (!secondSignature) {
      alert(exitType === 'DIRECT_PICKUP'
        ? 'A assinatura do recebedor é obrigatória'
        : 'A assinatura do motorista é obrigatória')
      return
    }
    setSaving(true)
    try {
      const r = await apiFetch('/api/v1/waybill', {
        method: 'POST',
        body:   JSON.stringify(buildBody('EMITTED')),
      })
      if (!r.ok) {
        const err = await r.json()
        alert(err.message || 'Erro ao emitir romaneio')
        return
      }
      const waybill = await r.json()

      // Assinar como expedidor (almoxarife)
      await apiFetch(`/api/v1/waybill/${waybill.id}/sign-sender`, {
        method: 'PATCH',
        body:   JSON.stringify({ signature: senderSignature }),
      })

      // Segunda assinatura: motorista (DRIVER_DELIVERY) ou recebedor (DIRECT_PICKUP)
      if (exitType === 'DRIVER_DELIVERY') {
        await apiFetch(`/api/v1/waybill/${waybill.id}/sign-driver`, {
          method: 'PATCH',
          body:   JSON.stringify({ signature: secondSignature }),
        })
      } else {
        // DIRECT_PICKUP: recebedor assina presencialmente
        const itemsPayload = (waybill.items ?? []).map((wi: any) => ({
          id:          wi.id,
          receivedQty: Number(wi.requestedQty),
          status:      'OK',
        }))
        await apiFetch(`/api/v1/waybill/${waybill.id}/sign-receiver`, {
          method: 'PATCH',
          body:   JSON.stringify({
            signature:        secondSignature,
            receiverName:     receiverName || employees.find(e => e.id === receiverEmployeeId)?.name || '',
            receiverDocument: receiverDocument || '',
            items:            itemsPayload,
          }),
        })
      }

      alert(`Romaneio ${waybill.docNumber} emitido com sucesso!`)
      onSuccess()
      handleClose()
    } catch { alert('Erro ao emitir romaneio') }
    finally { setSaving(false) }
  }

  // ── fechar e resetar ───────────────────────────────────────────────────────
  function handleClose() {
    setStep(1)
    setStep1Error('')
    setExitType('DIRECT_PICKUP')
    setSelectedItems([])
    setSenderSignature(null)
    setSecondSignature(null)
    setInitialPhotos([])
    setNotes('')
    setDriverName(''); setDriverDocument(''); setDriverPhone('')
    setVehiclePlate(''); setVehicleModel('')
    setReceiverName(''); setReceiverDocument('')
    setDestinationProjectId(''); setDestinationName('')
    onClose()
  }

  // ── validação etapa 1 ─────────────────────────────────────────────────────
  const canProceedStep1 = (() => {
    const hasDestination = !!destinationProjectId || destinationName.trim().length > 0
    if (!hasDestination) return false
    const hasReceiver = receiverType === 'EMPLOYEE'
      ? !!receiverEmployeeId
      : receiverName.trim().length > 0 && receiverDocument.trim().length > 0
    if (!hasReceiver) return false
    if (exitType === 'DRIVER_DELIVERY') {
      const hasDriver = driverType === 'EMPLOYEE'
        ? !!driverEmployeeId
        : driverName.trim().length > 0 && driverDocument.trim().length > 0
      if (!hasDriver) return false
    }
    return true
  })()

  if (!isOpen) return null

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16,
        width: '100%', maxWidth: 700,
        maxHeight: '90vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #E5E7EB',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: '#FEF3DC', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <i className={`ti ${CATEGORY_ICONS[category]}`}
              style={{ fontSize: 20, color: '#F5A623' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              Novo romaneio — {CATEGORY_LABELS[category]}
            </div>
            <div style={{ fontSize: 12, color: '#6B7280' }}>{locationName}</div>
          </div>
          {/* Indicador de etapas */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {([1, 2, 3, 4] as const).map(s => (
              <div key={s} style={{
                width: s === step ? 24 : 8, height: 8, borderRadius: 99,
                background: s === step ? '#F5A623' : s < step ? '#16A34A' : '#E5E7EB',
                transition: 'all 0.2s',
              }} />
            ))}
          </div>
          <button onClick={handleClose} style={{
            background: 'none', border: 'none',
            fontSize: 20, cursor: 'pointer', color: '#9CA3AF', padding: '4px 8px',
          }}>×</button>
        </div>

        {/* ── Conteúdo scrollável ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* ── ETAPA 1: TIPO DE SAÍDA + MOTORISTA + RECEBEDOR ── */}
          {step === 1 && (
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
                1. Tipo de saída e destinatários
              </h3>

              {/* Tipo de saída */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8 }}>
                  Tipo de saída *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { value: 'DIRECT_PICKUP',   icon: 'ti-user-check',      title: 'Retirada direta',
                      desc: 'Colaborador retira pessoalmente. Baixa imediata.' },
                    { value: 'DRIVER_DELIVERY', icon: 'ti-truck-delivery',  title: 'Entrega por motorista',
                      desc: 'Motorista leva até a obra. Pendente assinatura.' },
                  ].map(opt => (
                    <div
                      key={opt.value}
                      onClick={() => setExitType(opt.value as any)}
                      style={{
                        padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                        border:     `2px solid ${exitType === opt.value ? '#F5A623' : '#E5E7EB'}`,
                        background: exitType === opt.value ? '#FEF3DC' : '#F9FAFB',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <i className={`ti ${opt.icon}`}
                          style={{ fontSize: 18, color: exitType === opt.value ? '#F5A623' : '#9CA3AF' }} />
                        <span style={{ fontWeight: 600, fontSize: 14,
                          color: exitType === opt.value ? '#92400E' : 'inherit' }}>
                          {opt.title}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#6B7280' }}>{opt.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Destino */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>
                  Destino <span style={{ color: '#DC2626' }}>*</span>
                </label>
                {/* Toggle Obra / Almoxarifado */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {([
                    { v: 'PROJECT',  l: '🏗️ Obra' },
                    { v: 'LOCATION', l: '🏪 Almoxarifado' },
                  ] as const).map(opt => (
                    <button key={opt.v} onClick={() => {
                      setDestinationType(opt.v)
                      setDestinationProjectId('')
                      setDestinationLocationId('')
                      setDestinationName('')
                      setStep1Error('')
                    }} style={{
                      flex: 1, padding: '7px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                      border: `2px solid ${destinationType === opt.v ? '#F5A623' : '#E5E7EB'}`,
                      background: destinationType === opt.v ? '#FEF3DC' : 'transparent',
                      fontWeight: destinationType === opt.v ? 600 : 400,
                    }}>{opt.l}</button>
                  ))}
                </div>

                {destinationType === 'PROJECT' ? (
                  <>
                    <select
                      value={destinationProjectId}
                      onChange={e => { setDestinationProjectId(e.target.value); setStep1Error('') }}
                      style={{ width: '100%', padding: '9px 12px',
                        border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14, marginBottom: 8 }}
                    >
                      <option value="">Selecionar obra...</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                      ))}
                    </select>
                    <input
                      value={destinationName}
                      onChange={e => { setDestinationName(e.target.value); setStep1Error('') }}
                      placeholder="Ou descrever destino externo..."
                      style={{ width: '100%', padding: '9px 12px',
                        border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14 }}
                    />
                  </>
                ) : (
                  <select
                    value={destinationLocationId}
                    onChange={e => { setDestinationLocationId(e.target.value); setStep1Error('') }}
                    style={{ width: '100%', padding: '9px 12px',
                      border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14 }}
                  >
                    <option value="">Selecionar almoxarifado...</option>
                    {locations.map((l: any) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Motorista — apenas se DRIVER_DELIVERY */}
              {exitType === 'DRIVER_DELIVERY' && (
                <div style={{
                  marginBottom: 20, padding: '14px 16px',
                  background: '#F9FAFB', borderRadius: 10, border: '1px solid #E5E7EB',
                }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                    <i className="ti ti-steering-wheel" style={{ marginRight: 6, color: '#F5A623' }} />
                    Motorista <span style={{ color: '#DC2626' }}>*</span>
                  </h4>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {[
                      { v: 'EMPLOYEE', l: '👤 Colaborador interno' },
                      { v: 'EXTERNAL', l: '🚗 Motorista externo' },
                    ].map(opt => (
                      <button key={opt.v} onClick={() => setDriverType(opt.v as any)} style={{
                        flex: 1, padding: '7px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                        border: `2px solid ${driverType === opt.v ? '#F5A623' : '#E5E7EB'}`,
                        background: driverType === opt.v ? '#FEF3DC' : 'transparent',
                        fontWeight: driverType === opt.v ? 600 : 400,
                      }}>{opt.l}</button>
                    ))}
                  </div>
                  {driverType === 'EMPLOYEE' ? (
                    <select
                      value={driverEmployeeId}
                      onChange={e => {
                        setDriverEmployeeId(e.target.value)
                        setStep1Error('')
                        const emp = employees.find(x => x.id === e.target.value)
                        if (emp) setDriverName(emp.name)
                      }}
                      style={{ width: '100%', padding: '8px 12px',
                        border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14 }}
                    >
                      <option value="">Selecionar colaborador...</option>
                      {employees.map(e => (
                        <option key={e.id} value={e.id}>{e.name} — {e.role}</option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ gridColumn: '1/-1' }}>
                        <input value={driverName} onChange={e => { setDriverName(e.target.value); setStep1Error('') }}
                          placeholder="Nome do motorista *"
                          style={{ width: '100%', padding: '8px 12px',
                            border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14 }} />
                      </div>
                      <input value={driverDocument} onChange={e => { setDriverDocument(e.target.value); setStep1Error('') }}
                        placeholder="CPF *"
                        style={{ padding: '8px 12px', border: '1px solid #D1D5DB',
                          borderRadius: 8, fontSize: 14, width: '100%' }} />
                      <input value={driverPhone} onChange={e => setDriverPhone(e.target.value)}
                        placeholder="Telefone"
                        style={{ padding: '8px 12px', border: '1px solid #D1D5DB',
                          borderRadius: 8, fontSize: 14, width: '100%' }} />
                      <input value={vehiclePlate}
                        onChange={e => setVehiclePlate(e.target.value.toUpperCase())}
                        placeholder="Placa do veículo"
                        style={{ padding: '8px 12px', border: '1px solid #D1D5DB',
                          borderRadius: 8, fontSize: 14, width: '100%' }} />
                      <input value={vehicleModel} onChange={e => setVehicleModel(e.target.value)}
                        placeholder="Modelo do veículo"
                        style={{ padding: '8px 12px', border: '1px solid #D1D5DB',
                          borderRadius: 8, fontSize: 14, width: '100%' }} />
                    </div>
                  )}
                </div>
              )}

              {/* Recebedor */}
              <div style={{
                marginBottom: 20, padding: '14px 16px',
                background: '#F9FAFB', borderRadius: 10, border: '1px solid #E5E7EB',
              }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                  <i className="ti ti-user-check" style={{ marginRight: 6, color: '#F5A623' }} />
                  {exitType === 'DIRECT_PICKUP' ? 'Quem está retirando' : 'Quem irá receber na obra'}{' '}
                  <span style={{ color: '#DC2626' }}>*</span>
                </h4>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {[
                    { v: 'EMPLOYEE', l: '👤 Colaborador interno' },
                    { v: 'EXTERNAL', l: '👤 Externo' },
                  ].map(opt => (
                    <button key={opt.v} onClick={() => setReceiverType(opt.v as any)} style={{
                      flex: 1, padding: '7px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                      border: `2px solid ${receiverType === opt.v ? '#F5A623' : '#E5E7EB'}`,
                      background: receiverType === opt.v ? '#FEF3DC' : 'transparent',
                      fontWeight: receiverType === opt.v ? 600 : 400,
                    }}>{opt.l}</button>
                  ))}
                </div>
                {receiverType === 'EMPLOYEE' ? (
                  <select
                    value={receiverEmployeeId}
                    onChange={e => {
                      setReceiverEmployeeId(e.target.value)
                      setStep1Error('')
                      const emp = employees.find(x => x.id === e.target.value)
                      if (emp) { setReceiverName(emp.name); setReceiverRole(emp.role) }
                    }}
                    style={{ width: '100%', padding: '8px 12px',
                      border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14 }}
                  >
                    <option value="">Selecionar colaborador...</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.name} — {e.role}</option>
                    ))}
                  </select>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ gridColumn: '1/-1' }}>
                      <input value={receiverName} onChange={e => { setReceiverName(e.target.value); setStep1Error('') }}
                        placeholder="Nome completo *"
                        style={{ width: '100%', padding: '8px 12px',
                          border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14 }} />
                    </div>
                    <input value={receiverDocument} onChange={e => { setReceiverDocument(e.target.value); setStep1Error('') }}
                      placeholder="CPF / RG / Documento *"
                      style={{ padding: '8px 12px', border: '1px solid #D1D5DB',
                        borderRadius: 8, fontSize: 14, width: '100%' }} />
                    <input value={receiverPhone} onChange={e => setReceiverPhone(e.target.value)}
                      placeholder="Telefone"
                      style={{ padding: '8px 12px', border: '1px solid #D1D5DB',
                        borderRadius: 8, fontSize: 14, width: '100%' }} />
                    <div style={{ gridColumn: '1/-1' }}>
                      <input value={receiverRole} onChange={e => setReceiverRole(e.target.value)}
                        placeholder="Função / Cargo"
                        style={{ width: '100%', padding: '8px 12px',
                          border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14 }} />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>
                  Observações gerais
                </label>
                <textarea
                  value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Observações sobre a entrega..." rows={2}
                  style={{ width: '100%', padding: '8px 12px',
                    border: '1px solid #D1D5DB', borderRadius: 8,
                    fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
                />
              </div>

              {step1Error && (
                <div style={{
                  marginTop: 14, padding: '10px 14px',
                  background: '#FEE2E2', border: '1px solid #FECACA',
                  borderRadius: 8, fontSize: 13, color: '#DC2626',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <i className="ti ti-alert-circle" style={{ fontSize: 16, flexShrink: 0 }} />
                  {step1Error}
                </div>
              )}
            </div>
          )}

          {/* ── ETAPA 2: SELECIONAR ITENS ── */}
          {step === 2 && (
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
                2. Selecionar itens — {CATEGORY_LABELS[category]}
              </h3>

              <div style={{ position: 'relative', marginBottom: 12 }}>
                <input
                  value={itemSearch} onChange={e => setItemSearch(e.target.value)}
                  placeholder="Buscar item por nome ou código..."
                  style={{ width: '100%', padding: '9px 12px 9px 36px',
                    border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14 }}
                />
                <i className="ti ti-search" style={{
                  position: 'absolute', left: 10, top: '50%',
                  transform: 'translateY(-50%)', color: '#9CA3AF',
                }} />
              </div>

              <div style={{
                border: '1px solid #E5E7EB', borderRadius: 8,
                maxHeight: 250, overflowY: 'auto', marginBottom: 16,
              }}>
                {loading && (
                  <div style={{ padding: 20, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
                    Carregando itens...
                  </div>
                )}
                {!loading && filteredItems.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
                    Nenhum item encontrado nesta categoria
                  </div>
                )}
                {filteredItems.map(item => {
                  const isSelected = !!selectedItems.find(s => s.itemId === item.id)
                  const available  = Number(item.availableQty ?? item.currentStock ?? 0)
                  const imgSrc     = getAssetUrl(item.imageUrl)
                  return (
                    <div
                      key={item.id}
                      onClick={() => !isSelected && available > 0 && addItem(item)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', cursor: available > 0 && !isSelected ? 'pointer' : 'default',
                        borderBottom: '1px solid #F3F4F6',
                        background: isSelected ? '#F0FDF4' : available === 0 ? '#F9FAFB' : 'transparent',
                        opacity: available === 0 ? 0.5 : 1,
                      }}
                    >
                      {/* Miniatura */}
                      {imgSrc ? (
                        <img
                          src={imgSrc} alt=""
                          style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6,
                                   border: '1px solid #E5E7EB', flexShrink: 0 }}
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 6, background: '#F3F4F6',
                                      flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i className="ti ti-package" style={{ fontSize: 16, color: '#D1D5DB' }} />
                        </div>
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: '#6B7280' }}>
                          {item.code} · {item.brand || 'sem marca'}
                          {item.serialNumber && ` · Série: ${item.serialNumber}`}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 600,
                          color: available > 0 ? '#16A34A' : '#DC2626' }}>
                          {available} {item.unit}
                        </div>
                        <div style={{ fontSize: 10, color: '#9CA3AF' }}>disponível</div>
                      </div>
                      {isSelected
                        ? <i className="ti ti-circle-check" style={{ color: '#16A34A', fontSize: 18 }} />
                        : available > 0
                          ? <i className="ti ti-plus-circle" style={{ color: '#F5A623', fontSize: 18 }} />
                          : <i className="ti ti-ban" style={{ color: '#DC2626', fontSize: 18 }} />
                      }
                    </div>
                  )
                })}
              </div>

              {selectedItems.length > 0 && (
                <div>
                  <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#374151' }}>
                    Itens selecionados ({selectedItems.length})
                  </h4>
                  {selectedItems.map(item => (
                    <div key={item.itemId} style={{
                      border: '1px solid #E5E7EB', borderRadius: 8,
                      padding: '12px 14px', marginBottom: 8, background: '#F9FAFB',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between',
                        alignItems: 'flex-start', marginBottom: 10 }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                          <div style={{ fontSize: 12, color: '#6B7280' }}>
                            Disponível: {item.availableQty} {item.unit}
                          </div>
                        </div>
                        <button onClick={() => removeItem(item.itemId)} style={{
                          background: 'none', border: 'none',
                          color: '#DC2626', cursor: 'pointer', fontSize: 18,
                        }}>×</button>
                      </div>
                      <div style={{ display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                        <div>
                          <label style={{ fontSize: 11, color: '#6B7280',
                            display: 'block', marginBottom: 3 }}>
                            Quantidade *
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="number" min="1" max={item.availableQty}
                              value={item.quantity}
                              onChange={e => updateItem(item.itemId, 'quantity',
                                Math.min(Number(e.target.value), item.availableQty))}
                              style={{ flex: 1, padding: '6px 8px',
                                border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 14 }}
                            />
                            <span style={{ fontSize: 12, color: '#6B7280' }}>{item.unit}</span>
                          </div>
                        </div>
                        {item.category === 'TOOL' && (
                          <>
                            <div>
                              <label style={{ fontSize: 11, color: '#6B7280',
                                display: 'block', marginBottom: 3 }}>Número de série</label>
                              <input
                                value={item.serialNumber || ''}
                                onChange={e => updateItem(item.itemId, 'serialNumber', e.target.value)}
                                placeholder="Nº série"
                                style={{ width: '100%', padding: '6px 8px',
                                  border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13 }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, color: '#6B7280',
                                display: 'block', marginBottom: 3 }}>Condição</label>
                              <select
                                value={item.toolCondition || 'BOM'}
                                onChange={e => updateItem(item.itemId, 'toolCondition', e.target.value)}
                                style={{ width: '100%', padding: '6px 8px',
                                  border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13 }}
                              >
                                <option value="BOM">✅ Bom</option>
                                <option value="REGULAR">⚠️ Regular</option>
                                <option value="DANIFICADO">❌ Danificado</option>
                              </select>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ETAPA 3: FOTOS INICIAIS (OPCIONAL) ── */}
          {step === 3 && (
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                3. Fotos dos itens{' '}
                <span style={{ fontSize: 11, fontWeight: 400, color: '#6B7280' }}>
                  opcional
                </span>
              </h3>
              <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
                Tire fotos para documentar o estado dos itens no momento da saída.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                {initialPhotos.map((photo, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={photo} style={{
                      width: 100, height: 100, objectFit: 'cover',
                      borderRadius: 8, border: '2px solid #E5E7EB',
                    }} alt="foto" />
                    <button
                      onClick={() => setInitialPhotos(prev => prev.filter((_, idx) => idx !== i))}
                      style={{
                        position: 'absolute', top: -6, right: -6,
                        background: '#DC2626', color: '#fff',
                        border: 'none', borderRadius: '50%',
                        width: 20, height: 20, cursor: 'pointer',
                        fontSize: 12, fontWeight: 700,
                      }}
                    >×</button>
                  </div>
                ))}
                <button
                  onClick={() => cameraRef.current?.click()}
                  style={{
                    width: 100, height: 100, borderRadius: 8,
                    border: '2px dashed #D1D5DB', background: 'transparent',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 4, color: '#9CA3AF',
                  }}
                >
                  <i className="ti ti-camera" style={{ fontSize: 24 }} />
                  <span style={{ fontSize: 11 }}>Foto</span>
                </button>
              </div>
              <input
                ref={cameraRef} type="file" accept="image/*" capture="environment"
                style={{ display: 'none' }} onChange={handlePhoto}
              />
              {initialPhotos.length === 0 && (
                <div style={{
                  padding: '12px 16px', borderRadius: 8,
                  background: '#F0F9FF', border: '1px solid #BAE6FD',
                  fontSize: 13, color: '#0369A1',
                }}>
                  <i className="ti ti-info-circle" style={{ marginRight: 6 }} />
                  Sem fotos o romaneio ainda é válido. As fotos são opcionais
                  mas recomendadas para itens de alto valor.
                </div>
              )}
            </div>
          )}

          {/* ── ETAPA 4: ASSINATURAS ── */}
          {step === 4 && (
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
                4. Assinaturas
              </h3>

              {/* Info do tipo */}
              <div style={{
                padding: '10px 14px', marginBottom: 16,
                background: '#FEF3C7', border: '1px solid #F59E0B',
                borderRadius: 8, fontSize: 13, color: '#92400E',
              }}>
                <i className="ti ti-shield-check" style={{ marginRight: 6 }} />
                {exitType === 'DIRECT_PICKUP'
                  ? 'Retirada direta — almoxarife e recebedor devem assinar agora.'
                  : 'Entrega por motorista — almoxarife e motorista assinam agora. Recebedor assina na entrega.'}
              </div>

              {/* Resumo compacto */}
              <div style={{
                padding: '10px 14px', marginBottom: 20,
                background: '#F9FAFB', borderRadius: 8,
                border: '1px solid #E5E7EB', fontSize: 12,
                color: '#6B7280', lineHeight: 1.8,
              }}>
                <div><strong>Tipo:</strong> {exitType === 'DIRECT_PICKUP' ? 'Retirada direta' : 'Entrega por motorista'}</div>
                <div><strong>Itens:</strong> {selectedItems.length} tipo(s) — {selectedItems.reduce((s, i) => s + i.quantity, 0)} un</div>
                {(destinationProjectId || destinationName || destinationLocationId) && (
                  <div><strong>Destino:</strong> {
                    destinationType === 'LOCATION'
                      ? (locations.find((l: any) => l.id === destinationLocationId)?.name ?? destinationLocationId)
                      : (projects.find((p: any) => p.id === destinationProjectId)?.name ?? destinationName)
                  }</div>
                )}
              </div>

              {/* ASSINATURA 1 — Almoxarife */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
                  ✍️ Assinatura do almoxarife *
                </label>
                <SignaturePad
                  onSign={setSenderSignature}
                  height={140}
                  label="Almoxarife responsável pela expedição"
                />
              </div>

              {/* ASSINATURA 2 — Recebedor ou Motorista */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
                  ✍️ Assinatura d{exitType === 'DIRECT_PICKUP' ? 'o recebedor' : 'o motorista'} *
                </label>
                <SignaturePad
                  onSign={setSecondSignature}
                  height={140}
                  label={exitType === 'DIRECT_PICKUP'
                    ? (receiverName || employees.find(e => e.id === receiverEmployeeId)?.name || 'Recebedor')
                    : (driverName   || employees.find(e => e.id === driverEmployeeId)?.name   || 'Motorista')
                  }
                />
              </div>

              {/* Status dos requisitos */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { ok: !!senderSignature, label: 'Almoxarife' },
                  { ok: !!secondSignature, label: exitType === 'DIRECT_PICKUP' ? 'Recebedor' : 'Motorista' },
                  { ok: selectedItems.length > 0, label: 'Itens' },
                ].map(r => (
                  <div key={r.label} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 12, padding: '3px 8px', borderRadius: 99,
                    background: r.ok ? '#DCFCE7' : '#FEE2E2',
                    color:      r.ok ? '#16A34A' : '#DC2626',
                  }}>
                    <i className={`ti ${r.ok ? 'ti-circle-check' : 'ti-circle-x'}`}
                      style={{ fontSize: 13 }} />
                    {r.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '14px 20px', borderTop: '1px solid #E5E7EB',
          display: 'flex', gap: 8, justifyContent: 'space-between',
        }}>
          <div>
            {step > 1 && (
              <button onClick={() => setStep(s => (s - 1) as any)} style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 13,
                border: '1px solid #D1D5DB', background: 'transparent', cursor: 'pointer',
              }}>← Voltar</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSaveDraft} disabled={saving}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 13,
                border: '1px solid #F5A623', color: '#F5A623',
                background: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <i className="ti ti-device-floppy" style={{ fontSize: 15 }} />
              Salvar rascunho
            </button>

            {step < 4 ? (
              <button
                onClick={() => {
                  if (step === 1) {
                    const hasDestination = destinationType === 'LOCATION'
                      ? !!destinationLocationId
                      : (!!destinationProjectId || destinationName.trim().length > 0)
                    if (!hasDestination) {
                      setStep1Error(destinationType === 'LOCATION'
                        ? 'Selecione o almoxarifado de destino'
                        : 'Informe o destino — selecione uma obra ou preencha o destino externo')
                      return
                    }
                    const hasReceiver = receiverType === 'EMPLOYEE'
                      ? !!receiverEmployeeId
                      : receiverName.trim().length > 0 && receiverDocument.trim().length > 0
                    if (!hasReceiver) {
                      setStep1Error(receiverType === 'EMPLOYEE'
                        ? 'Selecione o colaborador que irá retirar / receber'
                        : 'Preencha nome e documento do recebedor externo')
                      return
                    }
                    if (exitType === 'DRIVER_DELIVERY') {
                      const hasDriver = driverType === 'EMPLOYEE'
                        ? !!driverEmployeeId
                        : driverName.trim().length > 0 && driverDocument.trim().length > 0
                      if (!hasDriver) {
                        setStep1Error(driverType === 'EMPLOYEE'
                          ? 'Selecione o motorista colaborador'
                          : 'Preencha nome e CPF do motorista externo')
                        return
                      }
                    }
                    setStep1Error('')
                  }
                  setStep(s => (s + 1) as any)
                }}
                disabled={step === 2 && selectedItems.length === 0}
                style={{
                  padding: '8px 20px', borderRadius: 8, fontSize: 13,
                  background: step === 2 && selectedItems.length === 0 ? '#D1D5DB' : '#F5A623',
                  border: 'none', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Próximo →
              </button>
            ) : (
              <button
                onClick={handleEmit}
                disabled={!senderSignature || !secondSignature || saving}
                style={{
                  padding: '8px 20px', borderRadius: 8, fontSize: 13,
                  background: senderSignature && secondSignature && !saving ? '#16A34A' : '#D1D5DB',
                  border: 'none', fontWeight: 700, color: '#fff',
                  cursor: senderSignature && secondSignature && !saving ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {saving
                  ? <i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} />
                  : <i className="ti ti-send" />
                }
                {saving ? 'Emitindo...' : 'Emitir romaneio'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
