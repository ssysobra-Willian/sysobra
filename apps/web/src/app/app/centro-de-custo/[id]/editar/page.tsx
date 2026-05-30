'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, Loader2, Save, Building2, CheckCircle2,
} from 'lucide-react'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { ProjectCoverUpload } from '../../components/ProjectCoverUpload'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface Client   { id: string; name: string }
interface UserItem { id: string; name: string; avatarUrl?: string | null; role?: string }

// ─── Seções do formulário ──────────────────────────────────────────────────────

const SECTIONS = ['Dados gerais', 'Dados técnicos'] as const
type Section = typeof SECTIONS[number]

// ─── Componente principal ──────────────────────────────────────────────────────

export default function EditarObraPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [section,  setSection]  = useState<Section>('Dados gerais')
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)
  const [notFound, setNotFound] = useState(false)

  // ── Dados gerais
  const [projectName,      setProjectName]     = useState('')
  const [code,             setCode]            = useState('')
  const [address,          setAddress]         = useState('')
  const [city,             setCity]            = useState('')
  const [stateUF,          setStateUF]         = useState('')
  const [zipCode,          setZipCode]         = useState('')
  const [globalBudget,     setGlobalBudget]    = useState('')
  const [startDate,        setStartDate]       = useState('')
  const [expectedEndDate,  setExpectedEndDate] = useState('')
  const [actualEndDate,    setActualEndDate]   = useState('')
  const [warrantyMonths,   setWarrantyMonths]  = useState('60')
  const [status,           setStatusVal]       = useState('ACTIVE')

  // Seletores cliente + responsável
  const [clientSearch,   setClientSearch]  = useState('')
  const [clients,        setClients]       = useState<Client[]>([])
  const [selectedClient, setSelectedClient]= useState<Client | null>(null)
  const [showClientDrop, setShowClientDrop]= useState(false)

  const [respSearch,   setRespSearch]  = useState('')
  const [users,        setUsers]       = useState<UserItem[]>([])
  const [selectedResp, setSelectedResp]= useState<UserItem | null>(null)
  const [showRespDrop, setShowRespDrop]= useState(false)
  const respDropRef = useRef<HTMLDivElement>(null)

  const [coverImage, setCoverImage] = useState('')

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
  const [diaryMaxPhotos,  setDiaryMaxPhotos] = useState('10')

  // ── Busca endereço pelo CEP via ViaCEP ────────────────────────────────────────
  const handleZipBlur = async () => {
    const clean = zipCode.replace(/\D/g, '')
    if (clean.length !== 8) return
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
      const d   = await res.json()
      if (!d.erro) {
        if (d.logradouro) setAddress(d.logradouro)
        if (d.localidade) setCity(d.localidade)
        if (d.uf)         setStateUF(d.uf)
      }
    } catch { /* silencioso */ }
  }

  // ── Carrega dados da obra e listas auxiliares ─────────────────────────────────
  const loadData = useCallback(async () => {
    const token     = localStorage.getItem('token')     || ''
    const companyId = localStorage.getItem('companyId') || ''
    const hdrs      = { Authorization: `Bearer ${token}`, 'x-company-id': companyId }

    try {
      const [projRes, clientsRes, membersRes] = await Promise.all([
        fetch(`${API}/api/v1/projects/${id}`,                         { headers: hdrs }),
        fetch(`${API}/api/v1/clients?limit=200`,                      { headers: hdrs }),
        fetch(`${API}/api/v1/employees?limit=200&status=ACTIVE`,      { headers: hdrs }),
      ])

      if (!projRes.ok) {
        setNotFound(true)
        return
      }

      const projData    = await projRes.json()
      const clientsData = clientsRes.ok ? await clientsRes.json() : { clients: [] }
      const membersData = membersRes.ok ? await membersRes.json() : { employees: [] }

      const proj = projData.project

      // Preenche campos da obra
      setProjectName(proj.name                                          ?? '')
      setCode(proj.code                                                 ?? '')
      setAddress(proj.address                                           ?? '')
      setCity(proj.city                                                 ?? '')
      setStateUF(proj.state                                             ?? '')
      setZipCode(proj.zipCode                                           ?? '')
      setGlobalBudget(proj.globalBudget  ? String(proj.globalBudget)   : '')
      setStartDate(proj.startDate        ? proj.startDate.split('T')[0]: '')
      setExpectedEndDate(proj.expectedEndDate ? proj.expectedEndDate.split('T')[0] : '')
      setActualEndDate(proj.actualEndDate     ? proj.actualEndDate.split('T')[0]   : '')
      setWarrantyMonths(proj.warrantyMonths   ? String(proj.warrantyMonths)        : '60')
      setStatusVal(proj.status                                          ?? 'ACTIVE')
      setCno(proj.cno                                                   ?? '')
      setArtExecution(proj.artExecution                                 ?? '')
      setArtProjects(proj.artProjects                                   ?? '')
      setTechnicalName(proj.technicalName                               ?? '')
      setTechTitle(proj.technicalTitle                                  ?? '')
      setTechCrea(proj.technicalCrea                                    ?? '')
      setCoverImage(proj.coverImage                                      ?? '')
      setTotalArea(proj.totalArea      ? String(proj.totalArea)         : '')
      setFloors(proj.floors            ? String(proj.floors)            : '')
      setBuildingPermit(proj.buildingPermit                             ?? '')
      setSlogan(proj.slogan                                             ?? '')
      setDiaryMaxPhotos(proj.diaryMaxPhotos  ? String(proj.diaryMaxPhotos) : '10')

      // Preenche cliente e responsável selecionados
      const allClients: Client[] = clientsData.clients ?? []
      setClients(allClients)
      if (proj.client) {
        setSelectedClient({ id: proj.client.id, name: proj.client.name })
        setClientSearch(proj.client.name)
      }

      const allMembers: UserItem[] = (membersData.employees ?? [])
        .map((e: any) => ({
          id:        e.id,
          name:      e.name ?? '',
          avatarUrl: e.photo ?? e.photoUrl ?? null,
          role:      e.position ?? e.role ?? '',
        }))
        .filter((u: UserItem) => u.name)
      setUsers(allMembers)
      if (proj.responsible) {
        setSelectedResp({ id: proj.responsible.id, name: proj.responsible.name, avatarUrl: proj.responsible.avatarUrl ?? null })
        setRespSearch(proj.responsible.name)
      }
    } catch (e: any) {
      setError('Erro ao carregar dados da obra: ' + (e.message ?? ''))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  // ── Fechar dropdown responsável ao clicar fora ─────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (respDropRef.current && !respDropRef.current.contains(e.target as Node)) {
        setShowRespDrop(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Salvar ────────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!projectName.trim()) {
      setError('O nome da obra é obrigatório')
      setSection('Dados gerais')
      return
    }

    setError('')
    setSaving(true)

    try {
      const token     = localStorage.getItem('token')     || ''
      const companyId = localStorage.getItem('companyId') || ''

      const body: Record<string, unknown> = {
        name:            projectName,
        code:            code            || null,
        clientId:        selectedClient?.id  ?? null,
        responsibleId:   selectedResp?.id    ?? null,
        address:         address         || null,
        city:            city             || null,
        state:           stateUF          || null,
        zipCode:         zipCode          || null,
        globalBudget:    parseFloat(globalBudget) || null,
        startDate:       startDate        || null,
        expectedEndDate: expectedEndDate  || null,
        actualEndDate:   actualEndDate    || null,
        warrantyMonths:  parseInt(warrantyMonths) || 60,
        status,
        cno:             cno             || null,
        artExecution:    artExecution    || null,
        artProjects:     artProjects     || null,
        technicalName:   technicalName   || null,
        technicalTitle:  technicalTitle  || null,
        technicalCrea:   technicalCrea   || null,
        coverImage:      coverImage      || null,
        totalArea:       totalArea       ? parseFloat(totalArea)   : null,
        floors:          floors          ? parseInt(floors)        : null,
        buildingPermit:  buildingPermit  || null,
        slogan:          slogan          || null,
        diaryMaxPhotos:  parseInt(diaryMaxPhotos) || 10,
      }

      const res = await fetch(`${API}/api/v1/projects/${id}`, {
        method:  'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${token}`,
          'x-company-id': companyId,
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? `Erro ${res.status} ao salvar obra`)
        return
      }

      // Toast de sucesso + redirecionar
      setSuccess(true)
      setTimeout(() => {
        router.push(`/app/centro-de-custo/${id}`)
      }, 1200)
    } catch (e: any) {
      setError(e.message ?? 'Erro inesperado')
    } finally {
      setSaving(false)
    }
  }

  // ─── Estilos utilitários ──────────────────────────────────────────────────────

  const InputClass = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#F5A623] bg-white'
  const LabelClass = 'block text-xs font-medium text-gray-600 mb-1'

  // ─── Estados de carregamento / não encontrado ──────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 size={28} className="animate-spin text-[#F5A623]" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Breadcrumb items={[
          { label: 'Centro de Custo', href: '/app/centro-de-custo' },
          { label: 'Editar obra' },
        ]} />
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          Obra não encontrada ou sem permissão de acesso.
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* ── Toast de sucesso ─────────────────────────────────────────────────── */}
      {success && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 bg-green-600 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg animate-in slide-in-from-top-2">
          <CheckCircle2 size={18} />
          Obra atualizada com sucesso!
        </div>
      )}

      {/* ── Breadcrumb ───────────────────────────────────────────────────────── */}
      <Breadcrumb items={[
        { label: 'Centro de Custo', href: '/app/centro-de-custo' },
        { label: projectName || 'Obra', href: `/app/centro-de-custo/${id}` },
        { label: 'Editar' },
      ]} />

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Editar obra</h1>
        <p className="text-sm text-gray-500">Altere as informações cadastrais da obra</p>
      </div>

      {/* ── Abas ─────────────────────────────────────────────────────────────── */}
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

      {/* ── Aviso de etapas ──────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 text-blue-700 text-xs px-4 py-2.5 rounded-lg">
        <span className="mt-0.5">ℹ️</span>
        <span>As <strong>etapas</strong> são gerenciadas individualmente na tela de detalhe da obra.</span>
      </div>

      {/* ── Erros ────────────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SEÇÃO 1 — DADOS GERAIS                                               */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
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
              <input
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                placeholder="Ex: Residência Alto da Boa Vista"
                className={InputClass}
              />
            </div>

            {/* Código */}
            <div>
              <label className={LabelClass}>Código</label>
              <input value={code} onChange={e => setCode(e.target.value)} className={InputClass} />
            </div>

            {/* Status */}
            <div>
              <label className={LabelClass}>Status</label>
              <select value={status} onChange={e => setStatusVal(e.target.value)} className={InputClass}>
                <option value="ACTIVE">Ativa</option>
                <option value="PLANNING">Planejamento</option>
                <option value="IN_PROGRESS">Em andamento</option>
                <option value="PAUSED">Pausada</option>
                <option value="ON_HOLD">Suspensa</option>
                <option value="COMPLETED">Concluída</option>
                <option value="CANCELLED">Cancelada</option>
              </select>
            </div>

            {/* Cliente ────────────────────────────────────────────────────── */}
            <div className="relative">
              <label className={LabelClass}>Cliente</label>
              <div className="relative">
                <input
                  value={selectedClient ? selectedClient.name : clientSearch}
                  onChange={e => {
                    setClientSearch(e.target.value)
                    setSelectedClient(null)
                    setShowClientDrop(true)
                  }}
                  onFocus={() => setShowClientDrop(true)}
                  placeholder="Buscar cliente..."
                  className={InputClass}
                />
                {selectedClient && (
                  <button
                    onClick={() => { setSelectedClient(null); setClientSearch('') }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  >✕</button>
                )}
              </div>
              {showClientDrop && !selectedClient && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {clients
                    .filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                    .map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedClient(c); setShowClientDrop(false) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      >{c.name}</button>
                    ))}
                  {clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400">Nenhum cliente encontrado</p>
                  )}
                </div>
              )}
            </div>

            {/* Responsável ─────────────────────────────────────────────────── */}
            <div className="relative" ref={respDropRef}>
              <label className={LabelClass}>Responsável interno</label>
              <div className="relative">
                <input
                  value={selectedResp ? selectedResp.name : respSearch}
                  onChange={e => {
                    setRespSearch(e.target.value)
                    setSelectedResp(null)
                    setShowRespDrop(true)
                  }}
                  onFocus={() => setShowRespDrop(true)}
                  placeholder="Buscar colaborador..."
                  className={InputClass}
                />
                {selectedResp && (
                  <button
                    onClick={() => { setSelectedResp(null); setRespSearch('') }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  >✕</button>
                )}
              </div>
              {showRespDrop && !selectedResp && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {users
                    .filter(u => !respSearch || (u.name || '').toLowerCase().includes(respSearch.toLowerCase()))
                    .map(u => (
                      <button
                        key={u.id}
                        onClick={() => { setSelectedResp(u); setRespSearch(u.name); setShowRespDrop(false) }}
                        className="w-full flex items-center gap-2 text-left px-3 py-2 hover:bg-gray-50"
                      >
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-[#F5A623] flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                            {(u.name || '?')[0].toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{u.name}</p>
                          {u.role && <p className="text-[11px] text-gray-400 truncate">{u.role}</p>}
                        </div>
                      </button>
                    ))}
                  {users.filter(u => !respSearch || (u.name || '').toLowerCase().includes(respSearch.toLowerCase())).length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400">Nenhum colaborador encontrado</p>
                  )}
                </div>
              )}
            </div>

            {/* CEP ────────────────────────────────────────────────────────── */}
            <div>
              <label className={LabelClass}>CEP</label>
              <input
                value={zipCode}
                onChange={e => setZipCode(e.target.value)}
                onBlur={handleZipBlur}
                placeholder="00000-000"
                className={InputClass}
              />
            </div>

            {/* Logradouro ─────────────────────────────────────────────────── */}
            <div>
              <label className={LabelClass}>Logradouro</label>
              <input
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Rua, número, complemento..."
                className={InputClass}
              />
            </div>

            {/* Cidade ─────────────────────────────────────────────────────── */}
            <div>
              <label className={LabelClass}>Cidade</label>
              <input value={city} onChange={e => setCity(e.target.value)} className={InputClass} />
            </div>

            {/* UF ─────────────────────────────────────────────────────────── */}
            <div>
              <label className={LabelClass}>Estado (UF)</label>
              <input
                value={stateUF}
                onChange={e => setStateUF(e.target.value.toUpperCase())}
                maxLength={2}
                placeholder="SP"
                className={InputClass}
              />
            </div>

            {/* Data início ─────────────────────────────────────────────────── */}
            <div>
              <label className={LabelClass}>Data de início prevista</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className={InputClass}
              />
            </div>

            {/* Data entrega ─────────────────────────────────────────────────── */}
            <div>
              <label className={LabelClass}>Data de entrega prevista</label>
              <input
                type="date"
                value={expectedEndDate}
                onChange={e => setExpectedEndDate(e.target.value)}
                className={InputClass}
              />
            </div>

            {/* Data conclusão real ──────────────────────────────────────────── */}
            <div>
              <label className={LabelClass}>Data de conclusão real</label>
              <input
                type="date"
                value={actualEndDate}
                onChange={e => setActualEndDate(e.target.value)}
                className={InputClass}
              />
            </div>

            {/* Valor global ─────────────────────────────────────────────────── */}
            <div>
              <label className={LabelClass}>Valor global contratado (R$)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={globalBudget}
                onChange={e => setGlobalBudget(e.target.value)}
                placeholder="0,00"
                className={InputClass}
              />
            </div>

            {/* Garantia ────────────────────────────────────────────────────── */}
            <div>
              <label className={LabelClass}>Meses de garantia</label>
              <input
                type="number"
                min={0}
                value={warrantyMonths}
                onChange={e => setWarrantyMonths(e.target.value)}
                className={InputClass}
              />
            </div>

          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SEÇÃO 2 — DADOS TÉCNICOS                                             */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {section === 'Dados técnicos' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LabelClass}>CNO — Cadastro Nacional de Obras</label>
              <input
                value={cno}
                onChange={e => setCno(e.target.value)}
                placeholder="000.000.000/00"
                className={InputClass}
              />
            </div>
            <div>
              <label className={LabelClass}>Alvará de Construção</label>
              <input
                value={buildingPermit}
                onChange={e => setBuildingPermit(e.target.value)}
                placeholder="N° do alvará"
                className={InputClass}
              />
            </div>

            <div>
              <label className={LabelClass}>ART de Execução (número)</label>
              <input
                value={artExecution}
                onChange={e => setArtExecution(e.target.value)}
                placeholder="000000"
                className={InputClass}
              />
            </div>
            <div>
              <label className={LabelClass}>ART de Projetos (número)</label>
              <input
                value={artProjects}
                onChange={e => setArtProjects(e.target.value)}
                placeholder="000000"
                className={InputClass}
              />
            </div>

            <div>
              <label className={LabelClass}>Área total construída (m²)</label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={totalArea}
                  onChange={e => setTotalArea(e.target.value)}
                  placeholder="0,00"
                  className={InputClass + ' pr-10'}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">m²</span>
              </div>
            </div>
            <div>
              <label className={LabelClass}>Número de pavimentos</label>
              <input
                type="number"
                min={1}
                step={1}
                value={floors}
                onChange={e => setFloors(e.target.value)}
                placeholder="Ex: 3"
                className={InputClass}
              />
            </div>
          </div>

          <hr className="border-gray-100" />
          <h3 className="text-sm font-semibold text-gray-700">Responsável técnico (dados para placa de obra)</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LabelClass}>Nome completo do RT</label>
              <input
                value={technicalName}
                onChange={e => setTechnicalName(e.target.value)}
                placeholder="Ex: João Silva"
                className={InputClass}
              />
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
              <input
                value={technicalCrea}
                onChange={e => setTechCrea(e.target.value)}
                placeholder="CREA-SP 000000-D"
                className={InputClass}
              />
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
            <label className={LabelClass}>Máximo de fotos por RDO</label>
            <input
              type="number"
              min={1}
              max={20}
              value={diaryMaxPhotos}
              onChange={e => setDiaryMaxPhotos(e.target.value)}
              className={InputClass}
            />
            <p className="text-xs text-gray-400 mt-1">Quantidade máxima de fotos permitida por relatório. Padrão: 10. Máximo: 20.</p>
          </div>
        </div>
      )}

      {/* ── Botões de navegação / ação ──────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 pb-8">
        <button
          onClick={() => router.push(`/app/centro-de-custo/${id}`)}
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

          {section !== 'Dados técnicos' ? (
            <button
              onClick={() => setSection(SECTIONS[SECTIONS.indexOf(section) + 1] as Section)}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Próximo <ChevronRight size={15} />
            </button>
          ) : null}

          <button
            onClick={handleSubmit}
            disabled={saving || !projectName.trim() || success}
            className="flex items-center gap-2 bg-[#F5A623] hover:bg-[#e09610] text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving  ? <Loader2    size={15} className="animate-spin" /> :
             success ? <CheckCircle2 size={15} /> :
                       <Save       size={15} />}
            {saving ? 'Salvando...' : success ? 'Salvo!' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}
