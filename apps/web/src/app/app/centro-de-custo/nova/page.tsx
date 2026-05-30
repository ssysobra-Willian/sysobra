'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, Plus, Trash2, GripVertical,
  Search, Loader2, Save, Building2,
} from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { ProjectCoverUpload } from '../components/ProjectCoverUpload'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface StageRow {
  tempId: string
  code: string
  name: string
  budgetMaterial: string
  budgetLabor: string
  startDate: string
  endDate: string
}

interface Client   { id: string; name: string }
interface UserItem { id: string; name: string; avatarUrl?: string | null; role?: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function newStage(): StageRow {
  return { tempId: crypto.randomUUID(), code: '', name: '', budgetMaterial: '', budgetLabor: '', startDate: '', endDate: '' }
}

function stageTotal(s: StageRow) {
  return (parseFloat(s.budgetMaterial) || 0) + (parseFloat(s.budgetLabor) || 0)
}

// Busca endereço pelo CEP via ViaCEP
async function fetchViaCEP(cep: string): Promise<{ logradouro: string; localidade: string; uf: string } | null> {
  try {
    const clean = cep.replace(/\D/g, '')
    if (clean.length !== 8) return null
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
    const d   = await res.json()
    if (d.erro) return null
    return d
  } catch { return null }
}

// ─── SEÇÃO: Abas de navegação ────────────────────────────────────────────────

const SECTIONS = ['Dados gerais', 'Dados técnicos', 'Etapas'] as const
type Section = typeof SECTIONS[number]

// ─── Componente principal ─────────────────────────────────────────────────────

export default function NovaObraPage() {
  const router = useRouter()

  const [section, setSection] = useState<Section>('Dados gerais')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  // ── Dados gerais
  const [name,            setName]           = useState('')
  const [code,            setCode]           = useState('')
  const [address,         setAddress]        = useState('')
  const [city,            setCity]           = useState('')
  const [stateUF,         setStateUF]        = useState('')
  const [zipCode,         setZipCode]        = useState('')
  const [zipLoading,      setZipLoading]     = useState(false)
  const [globalBudget,    setGlobalBudget]   = useState('')
  const [startDate,       setStartDate]      = useState('')
  const [expectedEndDate, setExpectedEndDate]= useState('')
  const [warrantyMonths,  setWarrantyMonths] = useState('60')
  const [status,          setStatusVal]      = useState('ACTIVE')

  // Seletores cliente + responsável
  const [clientSearch,     setClientSearch]    = useState('')
  const [clients,          setClients]         = useState<Client[]>([])
  const [selectedClient,   setSelectedClient]  = useState<Client | null>(null)
  const [showClientDrop,   setShowClientDrop]  = useState(false)

  const [respSearch,       setRespSearch]      = useState('')
  const [users,            setUsers]           = useState<UserItem[]>([])
  const [selectedResp,     setSelectedResp]    = useState<UserItem | null>(null)
  const [showRespDrop,     setShowRespDrop]    = useState(false)
  const respDropRef = useRef<HTMLDivElement>(null)

  // ── Dados técnicos
  const [cno,            setCno]           = useState('')
  const [artExecution,   setArtExecution]  = useState('')
  const [artProjects,    setArtProjects]   = useState('')
  const [technicalName,  setTechnicalName] = useState('')
  const [technicalTitle, setTechTitle]     = useState('')
  const [technicalCrea,  setTechCrea]      = useState('')
  // ── Dados adicionais da obra
  const [totalArea,       setTotalArea]      = useState('')
  const [floors,          setFloors]         = useState('')
  const [buildingPermit,  setBuildingPermit] = useState('')
  const [slogan,          setSlogan]         = useState('')
  const [diaryMaxPhotos,  setDiaryMaxPhotos] = useState(10)

  // ── Etapas
  const [stages,      setStages]      = useState<StageRow[]>([newStage()])
  const [coverImage,  setCoverImage]  = useState('')

  // ── Carregar código automático e listas
  useEffect(() => {
    const token     = localStorage.getItem('token') || ''
    const companyId = localStorage.getItem('companyId') || ''

    // Gera código preview (ex.: CC-2026-001)
    const year = new Date().getFullYear()
    setCode(`CC-${year}-001`)

    // Busca clientes
    fetch(`${API}/api/v1/clients?companyId=${companyId}&limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(d => setClients(d.clients ?? []))

    // Busca colaboradores ativos (responsável = Employee.id vinculado ao project.responsibleId)
    fetch(`${API}/api/v1/employees?limit=200&status=ACTIVE`, {
      headers: {
        Authorization:  `Bearer ${token}`,
        'x-company-id': companyId,
      },
    }).then(r => r.json()).then(d => {
      const list = d.employees ?? []
      const members: UserItem[] = list
        .map((e: any) => ({
          id:        e.id,
          name:      e.name ?? '',
          avatarUrl: e.photo ?? e.photoUrl ?? null,
          role:      e.position ?? e.role ?? '',
        }))
        .filter((u: UserItem) => u.name)
      setUsers(members)
    }).catch(() => {})
  }, [])

  // ── Fechar dropdown responsável ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (respDropRef.current && !respDropRef.current.contains(e.target as Node)) {
        setShowRespDrop(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── CEP auto-preenchimento
  const handleZipBlur = async () => {
    if (zipCode.replace(/\D/g, '').length === 8) {
      setZipLoading(true)
      const d = await fetchViaCEP(zipCode)
      setZipLoading(false)
      if (d) {
        setAddress(d.logradouro || address)
        setCity(d.localidade   || city)
        setStateUF(d.uf        || stateUF)
      }
    }
  }

  // ── Etapas helpers
  const addStage = () => setStages(s => [...s, newStage()])
  const removeStage = (tid: string) => setStages(s => s.filter(x => x.tempId !== tid))
  const updateStage = (tid: string, field: keyof StageRow, val: string) =>
    setStages(s => s.map(x => x.tempId === tid ? { ...x, [field]: val } : x))

  const totalMaterial = stages.reduce((a, s) => a + (parseFloat(s.budgetMaterial) || 0), 0)
  const totalLabor    = stages.reduce((a, s) => a + (parseFloat(s.budgetLabor)    || 0), 0)
  const totalGeral    = totalMaterial + totalLabor

  // ── Salvar
  const handleSubmit = async (draft = false) => {
    if (!name.trim()) { setError('O nome da obra é obrigatório'); setSection('Dados gerais'); return }
    setError('')
    setSaving(true)

    try {
      const token     = localStorage.getItem('token') || ''
      const companyId = localStorage.getItem('companyId') || ''

      const validStages = stages.filter(s => s.name.trim())

      const body = {
        name,
        code:            code || undefined,
        clientId:        selectedClient?.id ?? null,
        responsibleId:   selectedResp?.id ?? null,
        address:         address || null,
        city:            city || null,
        state:           stateUF || null,
        zipCode:         zipCode || null,
        globalBudget:    parseFloat(globalBudget) || null,
        startDate:       startDate || null,
        expectedEndDate: expectedEndDate || null,
        warrantyMonths:  parseInt(warrantyMonths) || 60,
        status:          draft ? 'PLANNING' : status,
        cno:             cno || null,
        artExecution:    artExecution || null,
        artProjects:     artProjects || null,
        technicalName:   technicalName || null,
        technicalTitle:  technicalTitle || null,
        technicalCrea:   technicalCrea || null,
        coverImage:      coverImage || null,
        totalArea:       totalArea ? parseFloat(totalArea) : null,
        floors:          floors    ? parseInt(floors)      : null,
        buildingPermit:  buildingPermit || null,
        slogan:          slogan         || null,
        diaryMaxPhotos,
        stages: validStages.map((s, i) => ({
          code:           s.code || null,
          name:           s.name,
          order:          i,
          budgetMaterial: parseFloat(s.budgetMaterial) || 0,
          budgetLabor:    parseFloat(s.budgetLabor)    || 0,
          startDate:      s.startDate || null,
          endDate:        s.endDate   || null,
        })),
      }

      const res = await fetch(`${API}/api/v1/projects`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${token}`,
          'x-company-id': companyId,
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Erro ao criar obra')
        return
      }

      const data = await res.json()
      router.push(`/app/centro-de-custo/${data.project.id}`)
    } catch (e: any) {
      setError(e.message ?? 'Erro inesperado')
    } finally {
      setSaving(false)
    }
  }

  const InputClass = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#F5A623] bg-white'
  const LabelClass = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ── Breadcrumb ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/app/centro-de-custo" className="hover:text-gray-900 flex items-center gap-1">
          <ChevronLeft size={14} /> Centro de Custo
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">Nova obra</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nova obra</h1>
        <p className="text-sm text-gray-500">Preencha as informações para cadastrar uma nova obra</p>
      </div>

      {/* ── Abas ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {SECTIONS.map((s, i) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              section === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
              section === s ? 'bg-[#F5A623] text-white' : 'bg-gray-200 text-gray-500'
            }`}>{i + 1}</span>
            {s}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SEÇÃO 1 — DADOS GERAIS                                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {section === 'Dados gerais' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          {/* Foto da obra */}
          <div>
            <label className={LabelClass}>Foto da obra (opcional)</label>
            <ProjectCoverUpload
              currentUrl={coverImage || null}
              onChange={setCoverImage}
              onRemove={() => setCoverImage('')}
              token={typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nome */}
            <div className="md:col-span-2">
              <label className={LabelClass}>Nome da obra <span className="text-red-500">*</span></label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Residência Alto da Boa Vista" className={InputClass} />
            </div>

            {/* Código */}
            <div>
              <label className={LabelClass}>Código (gerado automaticamente)</label>
              <input value={code} onChange={e => setCode(e.target.value)} className={InputClass} />
            </div>

            {/* Status */}
            <div>
              <label className={LabelClass}>Status inicial</label>
              <select value={status} onChange={e => setStatusVal(e.target.value)} className={InputClass}>
                <option value="ACTIVE">Ativa</option>
                <option value="PLANNING">Planejamento</option>
                <option value="IN_PROGRESS">Em andamento</option>
                <option value="PAUSED">Pausada</option>
              </select>
            </div>

            {/* Cliente */}
            <div className="relative">
              <label className={LabelClass}>Cliente</label>
              <div className="relative">
                <input
                  value={selectedClient ? selectedClient.name : clientSearch}
                  onChange={e => { setClientSearch(e.target.value); setSelectedClient(null); setShowClientDrop(true) }}
                  onFocus={() => setShowClientDrop(true)}
                  placeholder="Buscar cliente..."
                  className={InputClass}
                />
                {selectedClient && (
                  <button onClick={() => { setSelectedClient(null); setClientSearch('') }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
                )}
              </div>
              {showClientDrop && !selectedClient && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).map(c => (
                    <button key={c.id} onClick={() => { setSelectedClient(c); setShowClientDrop(false) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">{c.name}</button>
                  ))}
                  {clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400">Nenhum cliente encontrado</p>
                  )}
                </div>
              )}
            </div>

            {/* Responsável */}
            <div className="relative" ref={respDropRef}>
              <label className={LabelClass}>Responsável interno</label>
              <div className="relative">
                <input
                  value={selectedResp ? selectedResp.name : respSearch}
                  onChange={e => { setRespSearch(e.target.value); setSelectedResp(null); setShowRespDrop(true) }}
                  onFocus={() => setShowRespDrop(true)}
                  placeholder="Buscar usuário..."
                  className={InputClass}
                />
                {selectedResp && (
                  <button onClick={() => { setSelectedResp(null); setRespSearch('') }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
                )}
              </div>
              {showRespDrop && !selectedResp && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {users.filter(u => !respSearch || (u.name || '').toLowerCase().includes(respSearch.toLowerCase())).map(u => (
                    <button
                      key={u.id}
                      onClick={() => { setSelectedResp(u); setRespSearch(u.name); setShowRespDrop(false) }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5 border-b border-gray-50 last:border-0"
                    >
                      {/* Avatar */}
                      {u.avatarUrl ? (
                        <img
                          src={u.avatarUrl.startsWith('http') ? u.avatarUrl : `${API}${u.avatarUrl.startsWith('/') ? '' : '/'}${u.avatarUrl}`}
                          alt={u.name}
                          className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-[#F5A623] flex-shrink-0 flex items-center justify-center text-white text-xs font-bold">
                          {(u.name || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{u.name}</p>
                        {u.role && <p className="text-[11px] text-gray-400 truncate">{u.role}</p>}
                      </div>
                    </button>
                  ))}
                  {users.filter(u => !respSearch || (u.name || '').toLowerCase().includes(respSearch.toLowerCase())).length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400">
                      {users.length === 0 ? 'Carregando usuários...' : 'Nenhum usuário encontrado'}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* CEP */}
            <div>
              <label className={LabelClass}>CEP</label>
              <div className="relative">
                <input
                  value={zipCode}
                  onChange={e => setZipCode(e.target.value)}
                  onBlur={handleZipBlur}
                  placeholder="00000-000"
                  className={InputClass}
                />
                {zipLoading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
              </div>
            </div>

            {/* Endereço */}
            <div>
              <label className={LabelClass}>Logradouro</label>
              <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Rua, número, complemento..." className={InputClass} />
            </div>

            {/* Cidade */}
            <div>
              <label className={LabelClass}>Cidade</label>
              <input value={city} onChange={e => setCity(e.target.value)} className={InputClass} />
            </div>

            {/* UF */}
            <div>
              <label className={LabelClass}>Estado (UF)</label>
              <input value={stateUF} onChange={e => setStateUF(e.target.value)} maxLength={2} placeholder="SP" className={InputClass} />
            </div>

            {/* Data início */}
            <div>
              <label className={LabelClass}>Data de início prevista <span className="text-red-500">*</span></label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={InputClass} />
            </div>

            {/* Data entrega */}
            <div>
              <label className={LabelClass}>Data de entrega prevista <span className="text-red-500">*</span></label>
              <input type="date" value={expectedEndDate} onChange={e => setExpectedEndDate(e.target.value)} className={InputClass} />
            </div>

            {/* Valor global */}
            <div>
              <label className={LabelClass}>Valor global contratado (R$)</label>
              <input
                type="number"
                value={globalBudget}
                onChange={e => setGlobalBudget(e.target.value)}
                placeholder="0,00"
                className={InputClass}
              />
            </div>

            {/* Garantia */}
            <div>
              <label className={LabelClass}>Meses de garantia</label>
              <input type="number" value={warrantyMonths} onChange={e => setWarrantyMonths(e.target.value)} min={0} className={InputClass} />
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SEÇÃO 2 — DADOS TÉCNICOS                                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {section === 'Dados técnicos' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LabelClass}>CNO — Cadastro Nacional de Obras</label>
              <input value={cno} onChange={e => setCno(e.target.value)} placeholder="000.000.000/00" className={InputClass} />
            </div>
            <div>
              <label className={LabelClass}>Alvará de Construção</label>
              <input value={buildingPermit} onChange={e => setBuildingPermit(e.target.value)} placeholder="N° do alvará" className={InputClass} />
            </div>

            <div>
              <label className={LabelClass}>ART de Execução (número)</label>
              <input value={artExecution} onChange={e => setArtExecution(e.target.value)} placeholder="000000" className={InputClass} />
            </div>
            <div>
              <label className={LabelClass}>ART de Projetos (número)</label>
              <input value={artProjects} onChange={e => setArtProjects(e.target.value)} placeholder="000000" className={InputClass} />
            </div>

            <div>
              <label className={LabelClass}>Área total construída (m²)</label>
              <div className="relative">
                <input
                  type="number" min={0} step={0.01}
                  value={totalArea} onChange={e => setTotalArea(e.target.value)}
                  placeholder="0,00" className={InputClass + ' pr-10'}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">m²</span>
              </div>
            </div>
            <div>
              <label className={LabelClass}>Número de pavimentos</label>
              <input type="number" min={1} step={1} value={floors} onChange={e => setFloors(e.target.value)} placeholder="Ex: 3" className={InputClass} />
            </div>
          </div>

          <hr className="border-gray-100" />
          <h3 className="text-sm font-semibold text-gray-700">Responsável técnico (dados para placa de obra)</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LabelClass}>Nome completo do RT</label>
              <input value={technicalName} onChange={e => setTechnicalName(e.target.value)} placeholder="Ex: João Silva" className={InputClass} />
            </div>
            <div>
              <label className={LabelClass}>Título</label>
              <select value={technicalTitle} onChange={e => setTechTitle(e.target.value)} className={InputClass}>
                <option value="">Selecione...</option>
                <option value="Eng. Civil">Eng. Civil</option>
                <option value="Arquiteto(a)">Arquiteto(a)</option>
                <option value="Eng. Elétrico">Eng. Elétrico</option>
                <option value="Eng. Mecânico">Eng. Mecânico</option>
                <option value="Eng. Estrutural">Eng. Estrutural</option>
                <option value="Técnico em Edificações">Técnico em Edificações</option>
              </select>
            </div>
            <div>
              <label className={LabelClass}>CREA / CAU</label>
              <input value={technicalCrea} onChange={e => setTechCrea(e.target.value)} placeholder="CREA-SP 000000-D" className={InputClass} />
            </div>
          </div>

          <hr className="border-gray-100" />
          <h3 className="text-sm font-semibold text-gray-700">Slogan da obra (exibido na placa)</h3>

          <div>
            <label className={LabelClass}>
              Slogan
              <span className="ml-2 text-gray-400">({slogan.length}/80)</span>
            </label>
            <input
              value={slogan}
              onChange={e => setSlogan(e.target.value.slice(0, 80))}
              placeholder="Ex: Construindo sonhos com qualidade e confiança"
              className={InputClass}
              maxLength={80}
            />
            <p className="text-xs text-gray-400 mt-1">Exibido na faixa azul da placa de obra quando preenchido.</p>
          </div>

          <hr className="border-gray-100" />
          <h3 className="text-sm font-semibold text-gray-700">Diário de Obra (RDO)</h3>

          <div>
            <label className={LabelClass}>Limite de fotos por RDO</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={20}
                value={diaryMaxPhotos}
                onChange={e => setDiaryMaxPhotos(Math.min(20, Math.max(1, Number(e.target.value))))}
                className="w-20 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#F5A623] bg-white text-center"
              />
              <span className="text-sm text-gray-500">fotos por RDO (máximo 20)</span>
            </div>
            <p className={`text-xs mt-1 ${diaryMaxPhotos > 15 ? 'text-amber-600' : 'text-gray-400'}`}>
              {diaryMaxPhotos > 15
                ? '⚠️ Limite alto de fotos consome mais armazenamento do seu plano.'
                : 'Cada foto consome armazenamento do seu plano. Recomendamos até 10.'}
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SEÇÃO 3 — ETAPAS                                                 */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {section === 'Etapas' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Etapas da obra</h3>
            <button onClick={addStage} className="flex items-center gap-1.5 text-xs font-medium text-[#F5A623] hover:text-[#e09610]">
              <Plus size={14} /> Adicionar etapa
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-6" />
                  <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-20">Código</th>
                  <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Nome da etapa</th>
                  <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-32">Orç. Material (R$)</th>
                  <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-32">Orç. M.O. (R$)</th>
                  <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-28">Total</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stages.map((s, _i) => (
                  <tr key={s.tempId}>
                    <td className="px-2 py-2 text-gray-300"><GripVertical size={14} /></td>
                    <td className="px-2 py-2">
                      <input value={s.code} onChange={e => updateStage(s.tempId, 'code', e.target.value)} placeholder="E01" className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#F5A623]" />
                    </td>
                    <td className="px-2 py-2">
                      <input value={s.name} onChange={e => updateStage(s.tempId, 'name', e.target.value)} placeholder="Ex: Fundação" className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#F5A623]" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" value={s.budgetMaterial} onChange={e => updateStage(s.tempId, 'budgetMaterial', e.target.value)} placeholder="0,00" className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#F5A623]" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" value={s.budgetLabor} onChange={e => updateStage(s.tempId, 'budgetLabor', e.target.value)} placeholder="0,00" className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#F5A623]" />
                    </td>
                    <td className="px-2 py-2 text-xs font-medium text-gray-700">{formatCurrency(stageTotal(s))}</td>
                    <td className="px-2 py-2">
                      <button onClick={() => removeStage(s.tempId)} disabled={stages.length === 1} className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-30">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td colSpan={3} className="px-2 py-2 text-xs font-semibold text-gray-600">TOTAL</td>
                  <td className="px-2 py-2 text-xs font-semibold text-gray-800">{formatCurrency(totalMaterial)}</td>
                  <td className="px-2 py-2 text-xs font-semibold text-gray-800">{formatCurrency(totalLabor)}</td>
                  <td className="px-2 py-2 text-xs font-bold text-gray-900">{formatCurrency(totalGeral)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Botões de navegação / ação ────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 pb-6">
        <button
          onClick={() => router.push('/app/centro-de-custo')}
          className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>

        <div className="flex items-center gap-2">
          {section !== 'Dados gerais' && (
            <button
              onClick={() => setSection(SECTIONS[SECTIONS.indexOf(section) - 1] as Section)}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft size={15} /> Anterior
            </button>
          )}

          {section !== 'Etapas' ? (
            <button
              onClick={() => setSection(SECTIONS[SECTIONS.indexOf(section) + 1] as Section)}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Próximo <ChevronRight size={15} />
            </button>
          ) : null}

          <button
            onClick={() => handleSubmit(true)}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Save size={15} /> Salvar rascunho
          </button>

          <button
            onClick={() => handleSubmit(false)}
            disabled={saving || !name.trim()}
            className="flex items-center gap-2 bg-[#F5A623] hover:bg-[#e09610] text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Building2 size={15} />}
            Criar obra
          </button>
        </div>
      </div>
    </div>
  )
}
