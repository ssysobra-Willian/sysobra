'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  X, User, Upload, Loader2, CheckCircle, AlertTriangle,
  Briefcase, MapPin, Calendar,
} from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface EmployeeFormData {
  name:          string
  cpf:           string
  rg:            string
  ctps:          string
  pis:           string
  birthDate:     string
  admissionDate: string
  email:         string
  phone:         string
  address:       string
  city:          string
  state:         string
  zipCode:       string
  photo:         string
  type:          string
  role:          string
  department:    string
  salary:        string
  // localização em cascata
  locationType:  string  // 'FIXED' | 'PROJECT' | ''
  locationFixed: string  // ex: 'OFFICE', 'VACATION' (quando FIXED)
  projectId:     string  // id da obra (quando PROJECT)
}

interface Project {
  id:   string
  name: string
  code: string | null
}

interface Props {
  isOpen:    boolean
  onClose:   () => void
  onSuccess: (employee: any) => void
  editId?:   string | null
  projects?: Project[]
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const FIXED_LOCATIONS = [
  { value: 'OFFICE',       label: 'Escritório' },
  { value: 'DEPOSIT',      label: 'Depósito' },
  { value: 'WAREHOUSE',    label: 'Almoxarifado' },
  { value: 'TOOL_ROOM',    label: 'Ferramentário' },
  { value: 'WORKSHOP',     label: 'Oficina' },
  { value: 'YARD',         label: 'Pátio' },
  { value: 'FIELD',        label: 'Externo / Campo' },
  { value: 'MEDICAL_LEAVE',label: 'Afastado médico' },
  { value: 'VACATION',     label: 'Férias' },
  { value: 'HOME_OFFICE',  label: 'Home office' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const token     = localStorage.getItem('token')     ?? ''
  const companyId = localStorage.getItem('companyId') ?? ''
  return {
    'Content-Type': 'application/json',
    Authorization:  `Bearer ${token}`,
    'x-company-id': companyId,
  }
}

function maskCpf(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
         .replace(/(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3')
         .replace(/^(\d{3})(\d{0,3})/, '$1.$2')
}

function maskPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/\($/, '').trimEnd()
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3')
}

function maskCep(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8)
  return d.replace(/(\d{5})(\d{0,3})/, '$1-$2').replace(/-$/, '')
}


const EMPTY: EmployeeFormData = {
  name: '', cpf: '', rg: '', ctps: '', pis: '', birthDate: '', admissionDate: '',
  email: '', phone: '', address: '', city: '', state: '', zipCode: '', photo: '',
  type: 'CLT', role: '', department: '', salary: '',
  locationType: '', locationFixed: '', projectId: '',
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function EmployeeFormModal({ isOpen, onClose, onSuccess, editId, projects: projectsProp = [] }: Props) {
  const [form,           setForm]           = useState<EmployeeFormData>(EMPTY)
  const [loading,        setLoading]        = useState(false)
  const [loadingInit,    setLoadingInit]    = useState(false)
  const [error,          setError]          = useState('')
  const [success,        setSuccess]        = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [cepLoading,     setCepLoading]     = useState(false)
  const [projects,       setProjects]       = useState<Project[]>(projectsProp)

  const isEdit = !!editId

  // Carregar obras dinamicamente se não vierem como prop
  useEffect(() => {
    if (!isOpen) return
    const token     = localStorage.getItem('token')     ?? ''
    const companyId = localStorage.getItem('companyId') ?? ''
    fetch(`${API}/api/v1/projects?status=ACTIVE&limit=200`, {
      headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId },
    }).then(r => r.json()).then(d => {
      const list = (d.projects ?? d) as any[]
      setProjects(list.map(p => ({ id: p.id, name: p.name, code: p.code ?? null })))
    }).catch(() => {})
  }, [isOpen])

  // Carregar dados para edição
  useEffect(() => {
    if (!isOpen) { setForm(EMPTY); setError(''); setSuccess(false); return }
    if (editId) {
      setLoadingInit(true)
      const token     = localStorage.getItem('token')     ?? ''
      const companyId = localStorage.getItem('companyId') ?? ''
      fetch(`${API}/api/v1/employees/${editId}`, {
        headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId },
      }).then(r => r.json()).then(emp => {
        // Reconstituir locationType / locationFixed / projectId
        let locationType  = emp.locationType  ?? ''
        let locationFixed = emp.locationFixed ?? ''
        let projectId     = emp.projectId     ?? ''
        // compatibilidade: se salvo no formato antigo, inferir
        if (!locationType) {
          if (projectId) {
            locationType = 'PROJECT'
          } else if (emp.locationId && !emp.locationId.startsWith('PROJECT_')) {
            locationType  = 'FIXED'
            locationFixed = emp.locationId
          }
        }
        setForm({
          name:          emp.name          ?? '',
          cpf:           emp.cpf           ? maskCpf(emp.cpf) : '',
          rg:            emp.rg            ?? '',
          ctps:          emp.ctps          ?? '',
          pis:           emp.pis           ?? '',
          birthDate:     emp.birthDate     ? emp.birthDate.split('T')[0] : '',
          admissionDate: emp.admissionDate ? emp.admissionDate.split('T')[0] : '',
          email:         emp.email         ?? '',
          phone:         emp.phone         ? maskPhone(emp.phone) : '',
          address:       emp.address       ?? '',
          city:          emp.city          ?? '',
          state:         emp.state         ?? '',
          zipCode:       emp.zipCode       ? maskCep(emp.zipCode) : '',
          photo:         emp.photo         ?? '',
          type:          emp.type          ?? 'CLT',
          role:          emp.role          ?? '',
          department:    emp.department    ?? '',
          salary:        emp.salary        ? String(emp.salary) : '',
          locationType,
          locationFixed,
          projectId,
        })
      }).finally(() => setLoadingInit(false))
    }
  }, [isOpen, editId])

  const set = (field: keyof EmployeeFormData, value: string) =>
    setForm(f => ({ ...f, [field]: value }))

  // Busca CEP via ViaCEP
  const handleCepBlur = useCallback(async (cep: string) => {
    const clean = cep.replace(/\D/g, '')
    if (clean.length !== 8) return
    setCepLoading(true)
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setForm(f => ({
          ...f,
          address: data.logradouro ?? f.address,
          city:    data.localidade ?? f.city,
          state:   data.uf         ?? f.state,
        }))
      }
    } finally {
      setCepLoading(false)
    }
  }, [])

  // Upload de foto
  const handlePhotoUpload = useCallback(async (file: File) => {
    setUploadingPhoto(true)
    try {
      const token     = localStorage.getItem('token')     ?? ''
      const companyId = localStorage.getItem('companyId') ?? ''
      const fd = new FormData()
      fd.append('file', file)
      const res  = await fetch(`${API}/api/v1/uploads/employee-photo`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId },
        body:    fd,
      })
      const data = await res.json()
      if (res.ok) set('photo', data.url)
      else setError(data.error || 'Erro ao enviar foto')
    } finally {
      setUploadingPhoto(false)
    }
  }, [])

  // Submit
  const handleSubmit = useCallback(async () => {
    if (!form.name.trim() || !form.admissionDate || !form.type || !form.role.trim()) {
      setError('Preencha os campos obrigatórios: Nome, Tipo, Função e Data de Admissão')
      return
    }
    setLoading(true)
    setError('')
    try {
      // Derivar locationId, locationName, projectId a partir dos campos em cascata
      let derivedProjectId:    string | null | undefined = undefined
      let derivedLocationId:   string | null | undefined = undefined
      let derivedLocationName: string | undefined        = undefined

      if (form.locationType === 'PROJECT' && form.projectId) {
        derivedProjectId    = form.projectId
        derivedLocationId   = null
        derivedLocationName = projects.find(p => p.id === form.projectId)?.name
      } else if (form.locationType === 'FIXED' && form.locationFixed) {
        derivedProjectId    = null
        derivedLocationId   = form.locationFixed
        derivedLocationName = FIXED_LOCATIONS.find(l => l.value === form.locationFixed)?.label
      } else if (form.locationType === '') {
        // Sem local selecionado — limpar
        derivedProjectId  = null
        derivedLocationId = null
      }

      const url    = isEdit ? `${API}/api/v1/employees/${editId}` : `${API}/api/v1/employees`
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify({
          name:          form.name.trim(),
          cpf:           form.cpf    || undefined,
          rg:            form.rg     || undefined,
          ctps:          form.ctps   || undefined,
          pis:           form.pis    || undefined,
          birthDate:     form.birthDate     || undefined,
          admissionDate: form.admissionDate,
          email:         form.email         || undefined,
          phone:         form.phone.replace(/\D/g, '') || undefined,
          address:       form.address       || undefined,
          city:          form.city          || undefined,
          state:         form.state         || undefined,
          zipCode:       form.zipCode.replace(/\D/g, '') || undefined,
          photo:         form.photo         || undefined,
          type:          form.type,
          role:          form.role.trim(),
          department:    form.department    || undefined,
          salary:        form.salary        ? parseFloat(form.salary.replace(',', '.')) : undefined,
          projectId:     derivedProjectId,
          locationId:    derivedLocationId,
          locationName:  derivedLocationName,
          locationType:  form.locationType  || null,
          locationFixed: form.locationFixed || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar colaborador')
      setSuccess(true)
      setTimeout(() => { onSuccess(data); onClose() }, 1000)
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }, [form, isEdit, editId, onSuccess, onClose, projects])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-[640px] max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {isEdit ? 'Editar colaborador' : 'Novo colaborador'}
            </h2>
            <p className="text-xs text-gray-400">
              {isEdit ? 'Atualize os dados do colaborador' : 'Preencha os dados para cadastrar'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {loadingInit ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-[#F5A623]" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="px-5 py-5 space-y-6">

              {/* ── Feedback ── */}
              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                  <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
              {success && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                  <CheckCircle size={15} className="text-green-600 flex-shrink-0" />
                  <p className="text-sm text-green-700">Colaborador salvo com sucesso!</p>
                </div>
              )}

              {/* ──────────────────────────────────────────────────────────── */}
              {/* SEÇÃO 1 — Foto e dados pessoais                              */}
              {/* ──────────────────────────────────────────────────────────── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <User size={15} className="text-[#F5A623]" />
                  <h3 className="text-sm font-semibold text-gray-700">Dados pessoais</h3>
                </div>

                {/* Foto */}
                <div className="flex items-center gap-4 mb-4">
                  <label className="cursor-pointer group relative">
                    <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-100 border-2 border-dashed border-gray-300 group-hover:border-[#F5A623] transition-colors flex items-center justify-center">
                      {form.photo ? (
                        <img
                          src={`${API}${form.photo.startsWith('/') ? '' : '/'}${form.photo}`}
                          alt="Foto"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User size={28} className="text-gray-300" />
                      )}
                      {uploadingPhoto && (
                        <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
                          <Loader2 size={18} className="animate-spin text-white" />
                        </div>
                      )}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#F5A623] rounded-full flex items-center justify-center shadow-sm">
                      <Upload size={11} className="text-white" />
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f) }}
                    />
                  </label>
                  <div className="text-xs text-gray-500">
                    <p className="font-medium text-gray-700 mb-0.5">Foto do colaborador</p>
                    <p>JPG, PNG ou WEBP · Máx. 5MB</p>
                    <p>Será redimensionada para 400×400px</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Nome completo <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => set('name', e.target.value)}
                      placeholder="Ex: João da Silva Santos"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">CPF</label>
                    <input
                      type="text"
                      value={form.cpf}
                      onChange={e => set('cpf', maskCpf(e.target.value))}
                      placeholder="000.000.000-00"
                      maxLength={14}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">RG</label>
                    <input
                      type="text"
                      value={form.rg}
                      onChange={e => set('rg', e.target.value)}
                      placeholder="00.000.000-0"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">CTPS</label>
                    <input
                      type="text"
                      value={form.ctps}
                      onChange={e => set('ctps', e.target.value)}
                      placeholder="Nº / Série"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">PIS/PASEP</label>
                    <input
                      type="text"
                      value={form.pis}
                      onChange={e => set('pis', e.target.value)}
                      placeholder="000.00000.00-0"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      <Calendar size={11} className="inline mr-1" />
                      Nascimento
                    </label>
                    <input
                      type="date"
                      value={form.birthDate}
                      onChange={e => set('birthDate', e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Telefone</label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={e => set('phone', maskPhone(e.target.value))}
                      placeholder="(11) 99999-9999"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">E-mail</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => set('email', e.target.value)}
                      placeholder="joao@exemplo.com"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                </div>
              </section>

              <div className="border-t border-gray-100" />

              {/* ──────────────────────────────────────────────────────────── */}
              {/* SEÇÃO 2 — Dados profissionais                                */}
              {/* ──────────────────────────────────────────────────────────── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Briefcase size={15} className="text-[#F5A623]" />
                  <h3 className="text-sm font-semibold text-gray-700">Dados profissionais</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Tipo de contrato <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={form.type}
                      onChange={e => set('type', e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                    >
                      <option value="CLT">CLT</option>
                      <option value="PJ">Pessoa Jurídica (PJ)</option>
                      <option value="TEMPORARY">Temporário</option>
                      <option value="INTERN">Estagiário</option>
                      <option value="THIRD_PARTY">Terceirizado</option>
                    </select>
                  </div>

                  {/* FIX 1 — Função com datalist nativo */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Função / Cargo <span className="text-red-400">*</span>
                    </label>
                    <input
                      list="funcoes-sugeridas"
                      value={form.role}
                      onChange={e => set('role', e.target.value)}
                      placeholder="Digite ou selecione a função..."
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                    <datalist id="funcoes-sugeridas">
                      <option value="Pedreiro" />
                      <option value="Servente" />
                      <option value="Carpinteiro" />
                      <option value="Armador" />
                      <option value="Encarregado" />
                      <option value="Mestre de obras" />
                      <option value="Engenheiro Civil" />
                      <option value="Arquiteto" />
                      <option value="Técnico em Edificações" />
                      <option value="Eletricista" />
                      <option value="Hidráulico" />
                      <option value="Pintor" />
                      <option value="Gesseiro" />
                      <option value="Azulejista" />
                      <option value="Serralheiro" />
                      <option value="Soldador" />
                      <option value="Motorista" />
                      <option value="Operador de máquinas" />
                      <option value="Almoxarife" />
                      <option value="Administrativo" />
                      <option value="Auxiliar administrativo" />
                      <option value="Porteiro" />
                      <option value="Vigilante" />
                      <option value="Estagiário" />
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Departamento / Setor</label>
                    <input
                      type="text"
                      value={form.department}
                      onChange={e => set('department', e.target.value)}
                      placeholder="Ex: Produção, Administração"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Data de admissão <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="date"
                      value={form.admissionDate}
                      onChange={e => set('admissionDate', e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Salário / Custo mensal</label>
                    <input
                      type="text"
                      value={form.salary}
                      onChange={e => set('salary', e.target.value.replace(/[^\d.,]/g, ''))}
                      placeholder="R$ 0,00"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>

                  {/* FIX 1 — Local atual em cascata: tipo → detalhe */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      <MapPin size={11} className="inline mr-1" />
                      Local atual
                    </label>
                    <div className="flex gap-2">
                      {/* Passo 1: tipo */}
                      <select
                        value={form.locationType}
                        onChange={e => setForm(f => ({ ...f, locationType: e.target.value, locationFixed: '', projectId: '' }))}
                        className="w-40 flex-shrink-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                      >
                        <option value="">Sem local</option>
                        <option value="FIXED">Local fixo</option>
                        <option value="PROJECT">Obra</option>
                      </select>
                      {/* Passo 2: detalhe */}
                      {form.locationType === 'FIXED' && (
                        <select
                          value={form.locationFixed}
                          onChange={e => set('locationFixed', e.target.value)}
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                        >
                          <option value="">Selecione...</option>
                          {FIXED_LOCATIONS.map(l => (
                            <option key={l.value} value={l.value}>{l.label}</option>
                          ))}
                        </select>
                      )}
                      {form.locationType === 'PROJECT' && (
                        <select
                          value={form.projectId}
                          onChange={e => set('projectId', e.target.value)}
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                        >
                          <option value="">Selecione a obra...</option>
                          {projects.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.code ? `${p.code} — ` : ''}{p.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <div className="border-t border-gray-100" />

              {/* ──────────────────────────────────────────────────────────── */}
              {/* SEÇÃO 3 — Endereço                                           */}
              {/* ──────────────────────────────────────────────────────────── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <MapPin size={15} className="text-[#F5A623]" />
                  <h3 className="text-sm font-semibold text-gray-700">Endereço</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      CEP {cepLoading && <Loader2 size={10} className="inline animate-spin ml-1" />}
                    </label>
                    <input
                      type="text"
                      value={form.zipCode}
                      onChange={e => set('zipCode', maskCep(e.target.value))}
                      onBlur={e => handleCepBlur(e.target.value)}
                      placeholder="00000-000"
                      maxLength={9}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Logradouro</label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={e => set('address', e.target.value)}
                      placeholder="Rua, Av., número, complemento"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Cidade</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={e => set('city', e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">UF</label>
                    <input
                      type="text"
                      value={form.state}
                      onChange={e => set('state', e.target.value.toUpperCase().slice(0, 2))}
                      maxLength={2}
                      placeholder="SP"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex gap-3 rounded-b-2xl flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || success}
            className="flex-1 bg-[#F5A623] hover:bg-[#d4891a] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 size={15} className="animate-spin" /> Salvando...</>
            ) : success ? (
              <><CheckCircle size={15} /> Salvo!</>
            ) : (
              isEdit ? 'Salvar alterações' : 'Cadastrar colaborador'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
