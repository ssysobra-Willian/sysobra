'use client'

import React, { useState, useCallback, useEffect } from 'react'
import {
  X, Search, Package, Plus, Loader2, CheckCircle2, AlertCircle,
  MapPin, DollarSign, Tag, Calendar, FileText, ChevronRight, ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
function getToken()     { return typeof window !== 'undefined' ? localStorage.getItem('token')     ?? '' : '' }
function getCompanyId() { return typeof window !== 'undefined' ? localStorage.getItem('companyId') ?? '' : '' }
async function apiFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, 'x-company-id': getCompanyId(), ...(opts.headers ?? {}) },
  })
}

interface Location { id: string; name: string; type: string; project?: { name: string } | null }
interface ItemResult {
  id: string; name: string; code?: string | null; unit: string
  brand?: string | null; imageUrl?: string | null
  balances?: { locationId: string; quantity: number }[]
}

interface Props {
  isOpen:     boolean
  onClose:    () => void
  onSuccess?: () => void
  locations:  Location[]
  defaultLocationId?: string
}

// ─── Field ────────────────────────────────────────────────────────────────────
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
const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#F5A623] focus:ring-1 focus:ring-[#F5A623]/20 placeholder:text-gray-300 bg-white'

// ─── Component ────────────────────────────────────────────────────────────────
export function QuickEntryModal({ isOpen, onClose, onSuccess, locations, defaultLocationId }: Props) {
  const [step,          setStep]          = useState<1 | 2>(1)
  const [locationId,    setLocationId]    = useState(defaultLocationId ?? locations[0]?.id ?? '')
  const [search,        setSearch]        = useState('')
  const [results,       setResults]       = useState<ItemResult[]>([])
  const [searching,     setSearching]     = useState(false)
  const [selectedItem,  setSelectedItem]  = useState<ItemResult | null>(null)
  const [creatingNew,   setCreatingNew]   = useState(false)
  const [newItemName,   setNewItemName]   = useState('')
  const [newItemUnit,   setNewItemUnit]   = useState('un')
  const [newItemCat,    setNewItemCat]    = useState('')

  const [quantity,     setQuantity]     = useState('')
  const [unitCost,     setUnitCost]     = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [brand,        setBrand]        = useState('')
  const [lot,          setLot]          = useState('')
  const [invoiceNo,    setInvoiceNo]    = useState('')
  const [expiryDate,   setExpiryDate]   = useState('')
  const [notes,        setNotes]        = useState('')

  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState(false)

  // Reset quando fechar
  useEffect(() => {
    if (!isOpen) {
      setStep(1); setSearch(''); setResults([]); setSelectedItem(null)
      setCreatingNew(false); setNewItemName(''); setNewItemUnit('un'); setNewItemCat('')
      setQuantity(''); setUnitCost(''); setSupplierName(''); setBrand('')
      setLot(''); setInvoiceNo(''); setExpiryDate(''); setNotes('')
      setError(''); setSuccess(false)
    }
  }, [isOpen])

  // Buscar itens
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await apiFetch(`/api/v1/deposit/items?search=${encodeURIComponent(q)}&limit=10`)
      if (res.ok) {
        const d = await res.json()
        setResults(d.items ?? [])
      }
    } finally { setSearching(false) }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => doSearch(search), 300)
    return () => clearTimeout(t)
  }, [search, doSearch])

  const selectItem = (item: ItemResult) => {
    setSelectedItem(item)
    setSearch(item.name)
    setResults([])
    setCreatingNew(false)
    setStep(2)
  }

  const currentLoc = locations.find(l => l.id === locationId)
  const currentBalance = selectedItem?.balances?.find(b => b.locationId === locationId)?.quantity ?? 0
  const totalCost = (parseFloat(quantity) || 0) * (parseFloat(unitCost) || 0)

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!locationId)       { setError('Selecione o local de destino'); return }
    if (!selectedItem && !creatingNew) { setError('Selecione ou crie um item'); return }
    if (!quantity || parseFloat(quantity) <= 0) { setError('Quantidade inválida'); return }

    setSaving(true)
    try {
      const payload: any = {
        locationId,
        quantity:     parseFloat(quantity),
        unitCost:     parseFloat(unitCost) || 0,
        supplierName: supplierName || undefined,
        brand:        brand        || undefined,
        lot:          lot          || undefined,
        invoiceNumber: invoiceNo   || undefined,
        expiryDate:   expiryDate   || undefined,
        notes:        notes        || undefined,
      }

      if (selectedItem) {
        payload.itemId = selectedItem.id
      } else {
        payload.newItem = { name: newItemName.trim(), unit: newItemUnit, category: newItemCat || undefined }
      }

      const res = await apiFetch('/api/v1/deposit/quick-entry', { method: 'POST', body: JSON.stringify(payload) })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `Erro ${res.status}`)
      }
      setSuccess(true)
      setTimeout(() => { onSuccess?.(); onClose() }, 800)
    } catch (err: any) {
      setError(err.message ?? 'Erro ao registrar entrada')
    } finally { setSaving(false) }
  }, [locationId, selectedItem, creatingNew, newItemName, newItemUnit, newItemCat, quantity, unitCost, supplierName, brand, lot, invoiceNo, expiryDate, notes, onClose, onSuccess])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 bg-white w-full sm:max-w-xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] rounded-t-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            {step === 2 && (
              <button type="button" onClick={() => setStep(1)} className="p-1 rounded-lg hover:bg-gray-100">
                <ArrowLeft size={16} className="text-gray-500" />
              </button>
            )}
            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
              <Package size={18} className="text-green-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Entrada rápida</h2>
              <p className="text-xs text-gray-400">
                {step === 1 ? 'Selecione local e material' : `${selectedItem?.name ?? newItemName}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto overscroll-contain">
          <div className="p-5 space-y-4">

            {/* Etapa 1: seletor de local + busca */}
            {step === 1 && (
              <>
                {/* Local de destino */}
                <Field label="Local de destino" required>
                  <select value={locationId} onChange={e => setLocationId(e.target.value)} className={inp}>
                    {locations.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.type === 'CENTRAL' ? '🏭' : '🏗️'} {l.name}
                        {l.project ? ` — ${l.project.name}` : ''}
                      </option>
                    ))}
                  </select>
                </Field>

                {/* Busca de material */}
                <Field label="Material" required>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Digite nome ou código do material..."
                      className={cn(inp, 'pl-9')}
                    />
                    {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
                  </div>
                  {/* Resultados */}
                  {results.length > 0 && (
                    <div className="border border-gray-100 rounded-xl mt-1 max-h-60 overflow-y-auto shadow-lg bg-white">
                      {results.map(item => {
                        const bal = item.balances?.find(b => b.locationId === locationId)?.quantity ?? 0
                        const img = item.imageUrl ? (item.imageUrl.startsWith('http') ? item.imageUrl : `${API}/${item.imageUrl}`) : null
                        return (
                          <div key={item.id} onClick={() => selectItem(item)} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 border-b border-gray-50">
                            <div className="w-9 h-9 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                              {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <Package size={14} className="text-gray-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                              <p className="text-xs text-gray-400">{item.code ?? ''} · {item.unit} · {item.brand ?? 'sem marca'}</p>
                              {locationId && <p className="text-xs text-[#F5A623] font-medium">Estoque atual: {bal} {item.unit}</p>}
                            </div>
                            <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                          </div>
                        )
                      })}
                      <div
                        onClick={() => { setCreatingNew(true); setNewItemName(search); setStep(2) }}
                        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer bg-orange-50 text-orange-800 rounded-b-xl"
                      >
                        <Plus size={14} className="text-[#F5A623]" />
                        <span className="text-sm font-medium">Criar novo item: "{search}"</span>
                      </div>
                    </div>
                  )}
                  {search.length >= 2 && results.length === 0 && !searching && (
                    <div className="mt-2 text-center">
                      <p className="text-xs text-gray-400 mb-1">Nenhum material encontrado</p>
                      <button type="button" onClick={() => { setCreatingNew(true); setNewItemName(search); setStep(2) }} className="text-xs text-[#F5A623] font-medium">
                        + Cadastrar "{search}" como novo item
                      </button>
                    </div>
                  )}
                </Field>
              </>
            )}

            {/* Etapa 2: formulário de entrada */}
            {step === 2 && (
              <>
                {/* Banner do item */}
                {selectedItem && (
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl">
                    <div className="w-10 h-10 rounded-lg bg-gray-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {selectedItem.imageUrl
                        ? <img src={selectedItem.imageUrl.startsWith('http') ? selectedItem.imageUrl : `${API}/${selectedItem.imageUrl}`} alt="" className="w-full h-full object-cover" />
                        : <Package size={16} className="text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{selectedItem.name}</p>
                      <p className="text-xs text-gray-400">{selectedItem.code ?? ''} · {selectedItem.unit}</p>
                    </div>
                    <button type="button" onClick={() => { setSelectedItem(null); setSearch(''); setStep(1) }} className="text-xs text-gray-400 hover:text-gray-600">Trocar</button>
                  </div>
                )}

                {/* Novo item */}
                {creatingNew && (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-semibold text-orange-800">Novo item — será cadastrado automaticamente</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Nome do item" required>
                        <input value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="Nome" className={inp} required />
                      </Field>
                      <Field label="Unidade">
                        <input value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)} placeholder="un" className={inp} />
                      </Field>
                    </div>
                    <Field label="Categoria">
                      <input value={newItemCat} onChange={e => setNewItemCat(e.target.value)} placeholder="Ex: Cimento e Argamassa" className={inp} />
                    </Field>
                  </div>
                )}

                {/* Local de destino (só display) */}
                {currentLoc && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-xl">
                    <MapPin size={12} className="text-[#F5A623]" />
                    <span>Destino: <strong>{currentLoc.type === 'CENTRAL' ? '🏭' : '🏗️'} {currentLoc.name}</strong></span>
                    {selectedItem && <span className="ml-auto">Estoque atual: {currentBalance} {selectedItem.unit}</span>}
                  </div>
                )}

                {/* Qty + custo */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Quantidade" required>
                    <div className="flex items-center gap-2">
                      <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} min="0.001" step="any" placeholder="0" className={cn(inp, 'flex-1')} required />
                      <span className="text-xs text-gray-400 flex-shrink-0">{selectedItem?.unit ?? newItemUnit}</span>
                    </div>
                  </Field>
                  <Field label="Custo unitário (R$)">
                    <input type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} min="0" step="0.01" placeholder="0,00" className={inp} />
                  </Field>
                </div>

                {/* Fornecedor + marca */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Fornecedor">
                    <input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="Nome do fornecedor" className={inp} />
                  </Field>
                  <Field label="Marca">
                    <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Ex: Gerdau" className={inp} />
                  </Field>
                </div>

                {/* Lote + NF + validade */}
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Lote">
                    <input value={lot} onChange={e => setLot(e.target.value)} placeholder="Lote" className={inp} />
                  </Field>
                  <Field label="Nota fiscal">
                    <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="NF-e" className={inp} />
                  </Field>
                  <Field label="Validade">
                    <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className={inp} />
                  </Field>
                </div>

                <Field label="Observações">
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Observações opcionais..." className={cn(inp, 'resize-none')} />
                </Field>

                {/* Preview custo total */}
                {quantity && parseFloat(quantity) > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs text-green-800">
                    ✓ Total da entrada: <strong>{formatCurrency(totalCost)}</strong>
                    {selectedItem && <span> · Novo estoque: <strong>{(currentBalance + parseFloat(quantity)).toFixed(3)} {selectedItem.unit}</strong></span>}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          {step === 2 && (
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex items-center gap-3 flex-shrink-0">
              {error   && <p className="flex items-center gap-1 text-xs text-red-600 flex-1"><AlertCircle size={12} />{error}</p>}
              {success && <p className="flex items-center gap-1 text-xs text-green-600 flex-1"><CheckCircle2 size={12} />Entrada registrada!</p>}
              {!error && !success && <span className="flex-1" />}
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-[#F5A623] text-white text-sm font-medium rounded-xl hover:bg-[#e09610] disabled:opacity-60">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : 'Confirmar entrada'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
