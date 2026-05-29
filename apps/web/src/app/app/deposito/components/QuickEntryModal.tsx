'use client'

import React, { useState, useCallback, useEffect } from 'react'
import {
  X, Search, Package, Plus, Loader2, CheckCircle2, AlertCircle,
  MapPin, ArrowLeft, ChevronRight, Trash2,
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
function getAssetUrl(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${API}${url.startsWith('/') ? '' : '/'}${url}`
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Location { id: string; name: string; type: string; project?: { name: string } | null }
interface ItemResult {
  id: string; name: string; code?: string | null; unit: string
  brand?: string | null; imageUrl?: string | null
  itemCategory?: string | null
  toolType?: string | null
  balances?: { locationId: string; quantity: number }[]
}
interface SelectedEntry {
  itemId:     string
  name:       string
  unit:       string
  imageUrl?:  string | null
  quantity:   number
  unitCost:   number
  lot:        string
  invoiceNo:  string
  expiryDate: string
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
  // ─ Navegação ─
  const [step, setStep] = useState<1 | 2>(1)

  // ─ Local ─
  const [locationId, setLocationId] = useState(defaultLocationId ?? '')

  // ─ Step 1: Fornecedor ─
  const [supplierInputMode, setSupplierInputMode] = useState<'select' | 'manual'>('select')
  const [supplierId,        setSupplierId]        = useState('')
  const [supplierName,      setSupplierName]      = useState('')
  const [supplierSearch,    setSupplierSearch]    = useState('')
  const [supplierResults,   setSupplierResults]   = useState<{ id: string; name: string; cpfCnpj?: string | null }[]>([])
  const [supplierFocused,   setSupplierFocused]   = useState(false)
  const [allSuppliers,      setAllSuppliers]      = useState<{ id: string; name: string; cpfCnpj?: string | null }[]>([])

  // ─ Step 2: Itens ─
  const [itemSearch,   setItemSearch]   = useState('')
  const [itemResults,  setItemResults]  = useState<ItemResult[]>([])
  const [searching,    setSearching]    = useState(false)
  const [entries,      setEntries]      = useState<SelectedEntry[]>([])

  // ─ Salvar ─
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState(false)

  // ─── Auto-selecionar CENTRAL quando locationId vazio ─────────────────────
  useEffect(() => {
    if (!isOpen) return
    if (locationId) return
    const central = locations.find(l => l.type === 'CENTRAL')
    if (central) setLocationId(central.id)
    else if (locations[0]) setLocationId(locations[0].id)
  }, [isOpen, locations, locationId])

  // ─── Pré-carregar fornecedores ao abrir o modal ───────────────────────────
  useEffect(() => {
    if (!isOpen) return
    apiFetch('/api/v1/suppliers?limit=200')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setAllSuppliers(d.suppliers ?? []) } })
      .catch(() => {})
  }, [isOpen])

  // ─── Reset ao fechar ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setStep(1)
      setSupplierInputMode('select')
      setSupplierId(''); setSupplierName(''); setSupplierSearch(''); setSupplierResults([]); setSupplierFocused(false)
      setItemSearch(''); setItemResults([]); setEntries([])
      setError(''); setSuccess(false)
    }
  }, [isOpen])

  // ─── Busca fornecedores — filtra cache local ou API ──────────────────────
  const searchSuppliers = useCallback(async (q: string) => {
    setSupplierSearch(q)
    if (!q.trim()) {
      // Mostrar todos do cache local
      setSupplierResults(allSuppliers.slice(0, 10))
      return
    }
    const lower = q.toLowerCase()
    // Primeiro filtra local instantaneamente
    const local = allSuppliers.filter(s => s.name.toLowerCase().includes(lower))
    setSupplierResults(local.slice(0, 10))
    // Se não houver cache ou query longa, busca na API
    if (allSuppliers.length === 0 || q.length >= 3) {
      try {
        const res  = await apiFetch(`/api/v1/suppliers?search=${encodeURIComponent(q)}&limit=10`)
        const data = await res.json()
        setSupplierResults(data.suppliers ?? [])
      } catch { /* usa resultado local */ }
    }
  }, [allSuppliers])

  // ─── Busca itens ──────────────────────────────────────────────────────────
  const doSearchItems = useCallback(async (q: string) => {
    if (q.length < 2) { setItemResults([]); return }
    setSearching(true)
    try {
      const res = await apiFetch(`/api/v1/deposit/items?search=${encodeURIComponent(q)}&limit=12`)
      if (res.ok) {
        const d = await res.json()
        setItemResults(d.items ?? [])
      }
    } finally { setSearching(false) }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => doSearchItems(itemSearch), 300)
    return () => clearTimeout(t)
  }, [itemSearch, doSearchItems])

  // ─── Adicionar item à lista ───────────────────────────────────────────────
  const addEntry = (item: ItemResult) => {
    if (entries.find(e => e.itemId === item.id)) return
    setEntries(prev => [...prev, {
      itemId:    item.id,
      name:      item.name,
      unit:      item.unit,
      imageUrl:  item.imageUrl,
      quantity:  1,
      unitCost:  0,
      lot:       '',
      invoiceNo: '',
      expiryDate:'',
    }])
    setItemSearch('')
    setItemResults([])
  }

  const removeEntry = (itemId: string) => setEntries(prev => prev.filter(e => e.itemId !== itemId))
  const updateEntry = (itemId: string, patch: Partial<SelectedEntry>) =>
    setEntries(prev => prev.map(e => e.itemId === itemId ? { ...e, ...patch } : e))

  // ─── Submeter ─────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!locationId)          { setError('Selecione o local de destino'); return }
    if (entries.length === 0) { setError('Adicione pelo menos um item'); return }
    if (entries.some(e => !e.quantity || e.quantity <= 0)) { setError('Verifique as quantidades'); return }

    setSaving(true)
    try {
      for (const entry of entries) {
        const payload: any = {
          locationId,
          itemId:       entry.itemId,
          quantity:     entry.quantity,
          unitCost:     entry.unitCost || 0,
          supplierId:   supplierId   || undefined,
          supplierName: supplierName || undefined,
          lot:          entry.lot        || undefined,
          invoiceNumber: entry.invoiceNo || undefined,
          expiryDate:   entry.expiryDate || undefined,
        }
        const res = await apiFetch('/api/v1/deposit/quick-entry', { method: 'POST', body: JSON.stringify(payload) })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(`${entry.name}: ${d.error ?? `Erro ${res.status}`}`)
        }
      }
      setSuccess(true)
      setTimeout(() => { onSuccess?.(); onClose() }, 800)
    } catch (err: any) {
      setError(err.message ?? 'Erro ao registrar entrada')
    } finally { setSaving(false) }
  }, [locationId, entries, supplierId, supplierName, onClose, onSuccess])

  const currentLoc = locations.find(l => l.id === locationId)
  const totalValue = entries.reduce((acc, e) => acc + e.quantity * e.unitCost, 0)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] rounded-t-2xl">

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
                {step === 1 ? 'Local e fornecedor' : `${entries.length} item(s) selecionado(s)`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Indicadores de step */}
            <div className="flex items-center gap-1.5">
              {[1, 2].map(s => (
                <div key={s} className={cn('h-1.5 rounded-full transition-all', s === step ? 'w-6 bg-[#F5A623]' : s < step ? 'w-3 bg-green-500' : 'w-3 bg-gray-200')} />
              ))}
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 ml-1">
              <X size={16} className="text-gray-500" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto overscroll-contain">
          <div className="p-5 space-y-4">

            {/* ── STEP 1: Local + Fornecedor ── */}
            {step === 1 && (
              <>
                {/* Local */}
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

                {/* Fornecedor */}
                <Field label="Fornecedor">
                  {/* Toggle modo */}
                  <div className="flex gap-1 mb-2">
                    <button
                      type="button"
                      onClick={() => { setSupplierInputMode('select'); setSupplierId(''); setSupplierName(''); setSupplierSearch(''); setSupplierResults(allSuppliers.slice(0, 10)) }}
                      className={cn(
                        'flex-1 text-xs font-medium py-1.5 px-2 rounded-lg border transition-colors',
                        supplierInputMode === 'select' ? 'bg-[#F5A623] text-white border-[#F5A623]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      )}
                    >📋 Cadastrado</button>
                    <button
                      type="button"
                      onClick={() => { setSupplierInputMode('manual'); setSupplierId(''); setSupplierSearch(''); setSupplierResults([]) }}
                      className={cn(
                        'flex-1 text-xs font-medium py-1.5 px-2 rounded-lg border transition-colors',
                        supplierInputMode === 'manual' ? 'bg-[#F5A623] text-white border-[#F5A623]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      )}
                    >✏️ Manual</button>
                  </div>

                  {supplierInputMode === 'select' ? (
                    <div className="relative">
                      {!supplierId ? (
                        <>
                          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
                          <input
                            value={supplierSearch}
                            onChange={e => searchSuppliers(e.target.value)}
                            onFocus={() => { setSupplierFocused(true); if (!supplierSearch) setSupplierResults(allSuppliers.slice(0, 10)) }}
                            onBlur={() => setTimeout(() => setSupplierFocused(false), 150)}
                            placeholder="Clique para ver fornecedores..."
                            className={cn(inp, 'pl-8')}
                          />
                          {supplierFocused && supplierResults.length > 0 && (
                            <div className="absolute left-0 right-0 top-full z-50 bg-white border border-gray-200 rounded-xl mt-1 shadow-lg max-h-48 overflow-y-auto">
                              {supplierResults.map(s => (
                                <button key={s.id} type="button"
                                  onClick={() => { setSupplierId(s.id); setSupplierName(s.name); setSupplierSearch(''); setSupplierResults([]); setSupplierFocused(false) }}
                                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-gray-800 truncate">{s.name}</div>
                                    <div className="text-[10px] text-gray-400">{s.cpfCnpj ?? '—'}</div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl">
                          <CheckCircle2 size={12} className="text-green-600 flex-shrink-0" />
                          <span className="flex-1 text-xs font-medium text-green-800 truncate">{supplierName}</span>
                          <button type="button" onClick={() => { setSupplierId(''); setSupplierName('') }}
                            className="text-gray-400 hover:text-red-500"><X size={12} /></button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <input
                      value={supplierName}
                      onChange={e => { setSupplierName(e.target.value); setSupplierId('') }}
                      placeholder="Nome do fornecedor (sem cadastro)..."
                      className={inp}
                    />
                  )}
                </Field>

                <p className="text-xs text-gray-400 italic">Fornecedor é opcional — pode deixar em branco.</p>
              </>
            )}

            {/* ── STEP 2: Selecionar múltiplos itens ── */}
            {step === 2 && (
              <>
                {/* Local + fornecedor summary */}
                <div className="flex items-center gap-3 text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-xl">
                  <MapPin size={12} className="text-[#F5A623]" />
                  <span>Destino: <strong>{currentLoc?.name ?? '—'}</strong></span>
                  {supplierName && <span className="ml-auto">Fornecedor: <strong>{supplierName}</strong></span>}
                </div>

                {/* Busca de item */}
                <Field label="Buscar item" required>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={itemSearch}
                      onChange={e => setItemSearch(e.target.value)}
                      placeholder="Digite nome ou código..."
                      className={cn(inp, 'pl-9')}
                    />
                    {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
                  </div>
                  {/* Dropdown resultados */}
                  {itemResults.length > 0 && (
                    <div className="border border-gray-100 rounded-xl mt-1 max-h-52 overflow-y-auto shadow-lg bg-white">
                      {itemResults.map(item => {
                        const alreadyAdded = entries.find(e => e.itemId === item.id)
                        const img = getAssetUrl(item.imageUrl)
                        return (
                          <div
                            key={item.id}
                            onClick={() => !alreadyAdded && addEntry(item)}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2.5 border-b border-gray-50 last:border-0',
                              alreadyAdded ? 'opacity-50 cursor-default bg-gray-50' : 'cursor-pointer hover:bg-gray-50'
                            )}
                          >
                            <div className="w-8 h-8 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                              {img ? <img src={img} alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /> : <Package size={13} className="text-gray-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                              <p className="text-xs text-gray-400">{item.code ?? ''} · {item.unit}</p>
                            </div>
                            {alreadyAdded
                              ? <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                              : <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                            }
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {itemSearch.length >= 2 && itemResults.length === 0 && !searching && (
                    <p className="text-xs text-gray-400 mt-1 text-center">Nenhum item encontrado</p>
                  )}
                </Field>

                {/* Lista de itens adicionados */}
                {entries.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-600">Itens a receber ({entries.length}):</p>
                    {entries.map(entry => {
                      const img = getAssetUrl(entry.imageUrl)
                      return (
                        <div key={entry.itemId} className="border border-gray-200 rounded-xl p-3 bg-gray-50 space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gray-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                              {img ? <img src={img} alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /> : <Package size={13} className="text-gray-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{entry.name}</p>
                              <p className="text-xs text-gray-400">{entry.unit}</p>
                            </div>
                            <button type="button" onClick={() => removeEntry(entry.itemId)} className="text-gray-400 hover:text-red-500 p-1">
                              <Trash2 size={14} />
                            </button>
                          </div>
                          {/* Campos do item */}
                          <div className="grid grid-cols-2 gap-2">
                            <Field label="Qtd *">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number" min="0.001" step="any"
                                  value={entry.quantity}
                                  onChange={e => updateEntry(entry.itemId, { quantity: parseFloat(e.target.value) || 0 })}
                                  className={cn(inp, 'flex-1')}
                                />
                                <span className="text-xs text-gray-400">{entry.unit}</span>
                              </div>
                            </Field>
                            <Field label="Custo unit. (R$)">
                              <input
                                type="number" min="0" step="0.01"
                                value={entry.unitCost || ''}
                                onChange={e => updateEntry(entry.itemId, { unitCost: parseFloat(e.target.value) || 0 })}
                                placeholder="0,00"
                                className={inp}
                              />
                            </Field>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <Field label="Lote">
                              <input value={entry.lot} onChange={e => updateEntry(entry.itemId, { lot: e.target.value })} placeholder="Lote" className={inp} />
                            </Field>
                            <Field label="Nota fiscal">
                              <input value={entry.invoiceNo} onChange={e => updateEntry(entry.itemId, { invoiceNo: e.target.value })} placeholder="NF-e" className={inp} />
                            </Field>
                            <Field label="Validade">
                              <input type="date" value={entry.expiryDate} onChange={e => updateEntry(entry.itemId, { expiryDate: e.target.value })} className={inp} />
                            </Field>
                          </div>
                        </div>
                      )
                    })}

                    {/* Total geral */}
                    {totalValue > 0 && (
                      <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs text-green-800">
                        ✓ Valor total da entrada: <strong>{formatCurrency(totalValue)}</strong>
                      </div>
                    )}
                  </div>
                )}

                {entries.length === 0 && (
                  <div className="text-center py-6 text-gray-400 text-sm">
                    <Package size={32} className="mx-auto mb-2 opacity-30" />
                    Nenhum item adicionado ainda.<br />
                    <span className="text-xs">Use a busca acima para adicionar itens.</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex items-center gap-3 flex-shrink-0">
            {error   && <p className="flex items-center gap-1 text-xs text-red-600 flex-1"><AlertCircle size={12} />{error}</p>}
            {success && <p className="flex items-center gap-1 text-xs text-green-600 flex-1"><CheckCircle2 size={12} />Entrada registrada!</p>}
            {!error && !success && <span className="flex-1" />}

            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">Cancelar</button>

            {step === 1 && (
              <button
                type="button"
                onClick={() => { if (locationId) { setStep(2); setError('') } else setError('Selecione o local de destino') }}
                className="flex items-center gap-2 px-5 py-2 bg-[#F5A623] text-white text-sm font-medium rounded-xl hover:bg-[#e09610]"
              >
                Próximo →
              </button>
            )}
            {step === 2 && (
              <button
                type="submit"
                disabled={saving || entries.length === 0}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 disabled:opacity-60"
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : `Confirmar (${entries.length} item${entries.length !== 1 ? 's' : ''})`}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
