'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  X, User, Upload, Loader2, CheckCircle, AlertTriangle,
  Briefcase, MapPin, Calendar, Building2, CreditCard,
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
  // Dados PJ
  pjCnpj:         string
  pjRazaoSocial:  string
  pjNomeFantasia: string
  pjEmail:        string
  pjPhone:        string
  // Dados bancários
  bankType:         string   // 'PIX' | 'TED_DOC' | ''
  bankPixKey:       string
  bankPixKeyType:   string   // 'CPF'|'CNPJ'|'EMAIL'|'PHONE'|'RANDOM'
  bankName:         string
  bankCode:         string
  bankAgency:       string
  bankAgencyDigit:  string
  bankAccount:      string
  bankAccountDigit: string
  bankAccountType:  string   // 'CORRENTE' | 'POUPANCA'
  bankHolderName:   string
  bankHolderDoc:    string
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

const PIX_KEY_TYPES = [
  { value: 'CPF',    label: 'CPF', placeholder: '000.000.000-00' },
  { value: 'CNPJ',   label: 'CNPJ', placeholder: '00.000.000/0000-00' },
  { value: 'EMAIL',  label: 'E-mail', placeholder: 'email@exemplo.com' },
  { value: 'PHONE',  label: 'Telefone', placeholder: '(11) 99999-9999' },
  { value: 'RANDOM', label: 'Chave aleatória', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
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

/** FIX 1 — máscara CPF corrigida: slice-based, sem cascading replaces */
function maskCpf(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9,11)}`
}

function maskCnpj(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`
}

function validateCnpj(v: string): boolean {
  const c = v.replace(/\D/g, '')
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false
  const calc = (str: string, weights: number[]) =>
    weights.reduce((s, w, i) => s + parseInt(str[i]) * w, 0)
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const d1 = 11 - (calc(c, w1) % 11); const r1 = d1 >= 10 ? 0 : d1
  if (r1 !== parseInt(c[12])) return false
  const d2 = 11 - (calc(c, w2) % 11); const r2 = d2 >= 10 ? 0 : d2
  return r2 === parseInt(c[13])
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

// ─── Estado inicial ───────────────────────────────────────────────────────────

const EMPTY: EmployeeFormData = {
  name: '', cpf: '', rg: '', ctps: '', pis: '', birthDate: '', admissionDate: '',
  email: '', phone: '', address: '', city: '', state: '', zipCode: '', photo: '',
  type: 'CLT', role: '', department: '', salary: '',
  locationType: '', locationFixed: '', projectId: '',
  // PJ
  pjCnpj: '', pjRazaoSocial: '', pjNomeFantasia: '', pjEmail: '', pjPhone: '',
  // Banco
  bankType: '', bankPixKey: '', bankPixKeyType: '',
  bankName: '', bankCode: '', bankAgency: '', bankAgencyDigit: '',
  bankAccount: '', bankAccountDigit: '', bankAccountType: 'CORRENTE',
  bankHolderName: '', bankHolderDoc: '',
}

// ─── Componente ───────────────────────────────────────────────────────────────

interface SupplierResult {
  id:        string
  name:      string
  type:      string
  document?: string | null
  cpfCnpj?:  string | null
  cnpj?:     string | null
  category?: string | null
}

export function EmployeeFormModal({ isOpen, onClose, onSuccess, editId, projects: projectsProp = [] }: Props) {
  const [form,           setForm]           = useState<EmployeeFormData>(EMPTY)
  const [loading,        setLoading]        = useState(false)
  const [loadingInit,    setLoadingInit]    = useState(false)
  const [error,          setError]          = useState('')
  const [success,        setSuccess]        = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [cepLoading,     setCepLoading]     = useState(false)
  const [projects,       setProjects]       = useState<Project[]>(projectsProp)

  // Vínculo com fornecedor
  const [supplierId,      setSupplierId]      = useState('')
  const [supplierName,    setSupplierName]    = useState('')
  const [supplierSearch,  setSupplierSearch]  = useState('')
  const [supplierResults, setSupplierResults] = useState<SupplierResult[]>([])
  const [supplierSearchT, setSupplierSearchT] = useState<ReturnType<typeof setTimeout> | null>(null)

  const isEdit = !!editId

  // Carregar obras dinamicamente
  useEffect(() => {
    if (!isOpen) return
    const token     = localStorage.getItem('token')     ?? ''
    const companyId = localStorage.getItem('companyId') ?? ''
    fetch(`${API}/api/v1/projects?limit=200&status=ALL`, {
      headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId },
    }).then(r => r.json()).then(d => {
      const list = (d.projects ?? d) as any[]
      const active = list.filter((p: any) => !['COMPLETED','CANCELLED'].includes(p.status))
      setProjects(active.map((p: any) => ({ id: p.id, name: p.name, code: p.code ?? null })))
    }).catch(() => {})
  }, [isOpen])

  // Reset supplier state ao fechar
  useEffect(() => {
    if (!isOpen) {
      setSupplierId(''); setSupplierName(''); setSupplierSearch(''); setSupplierResults([])
    }
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
        let locationType  = emp.locationType  ?? ''
        let locationFixed = emp.locationFixed ?? ''
        let projectId     = emp.projectId     ?? ''
        if (!locationType) {
          if (projectId) locationType = 'PROJECT'
          else if (emp.locationId && !emp.locationId.startsWith('PROJECT_')) {
            locationType  = 'FIXED'; locationFixed = emp.locationId
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
          locationType, locationFixed, projectId,
          // PJ
          pjCnpj:        emp.pjCnpj        ? maskCnpj(emp.pjCnpj) : '',
          pjRazaoSocial: emp.pjRazaoSocial  ?? '',
          pjNomeFantasia:emp.pjNomeFantasia ?? '',
          pjEmail:       emp.pjEmail        ?? '',
          pjPhone:       emp.pjPhone        ? maskPhone(emp.pjPhone) : '',
          // Banco
          bankType:        emp.bankType        ?? '',
          bankPixKey:      emp.bankPixKey      ?? '',
          bankPixKeyType:  emp.bankPixKeyType  ?? '',
          bankName:        emp.bankName        ?? '',
          bankCode:        emp.bankCode        ?? '',
          bankAgency:      emp.bankAgency      ?? '',
          bankAgencyDigit: emp.bankAgencyDigit ?? '',
          bankAccount:     emp.bankAccount     ?? '',
          bankAccountDigit:emp.bankAccountDigit ?? '',
          bankAccountType: emp.bankAccountType ?? 'CORRENTE',
          bankHolderName:  emp.bankHolderName  ?? '',
          bankHolderDoc:   emp.bankHolderDoc
            ? (emp.bankHolderDoc.length <= 11
                ? maskCpf(emp.bankHolderDoc)
                : maskCnpj(emp.bankHolderDoc))
            : '',
        })
        if (emp.supplierId)      setSupplierId(emp.supplierId)
        if (emp.supplier?.name)  setSupplierName(emp.supplier.name)
      }).finally(() => setLoadingInit(false))
    }
  }, [isOpen, editId])

  const set = (field: keyof EmployeeFormData, value: string) =>
    setForm(f => ({ ...f, [field]: value }))

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

  const searchSuppliers = useCallback((query: string) => {
    setSupplierSearch(query)
    if (supplierSearchT) clearTimeout(supplierSearchT)
    if (query.length < 2) { setSupplierResults([]); return }
    const t = setTimeout(async () => {
      try {
        const token     = localStorage.getItem('token')     ?? ''
        const companyId = localStorage.getItem('companyId') ?? ''
        const res  = await fetch(
          `${API}/api/v1/suppliers?search=${encodeURIComponent(query)}&limit=5`,
          { headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId } },
        )
        const data = await res.json()
        setSupplierResults(data.suppliers ?? data ?? [])
      } catch { setSupplierResults([]) }
    }, 300)
    setSupplierSearchT(t)
  }, [supplierSearchT])

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

  const handleSubmit = useCallback(async () => {
    if (!form.name.trim() || !form.admissionDate || !form.type || !form.role.trim()) {
      setError('Preencha os campos obrigatórios: Nome, Tipo, Função e Data de Admissão')
      return
    }
    setLoading(true); setError('')
    try {
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
          // PJ — só enviar se tipo for PJ
          pjCnpj:        form.type === 'PJ' ? (form.pjCnpj || null)        : null,
          pjRazaoSocial: form.type === 'PJ' ? (form.pjRazaoSocial || null)  : null,
          pjNomeFantasia:form.type === 'PJ' ? (form.pjNomeFantasia || null) : null,
          pjEmail:       form.type === 'PJ' ? (form.pjEmail || null)        : null,
          pjPhone:       form.type === 'PJ' ? (form.pjPhone.replace(/\D/g,'') || null) : null,
          // Banco — sempre enviar
          bankType:        form.bankType        || null,
          bankPixKey:      form.bankType === 'PIX'     ? (form.bankPixKey      || null) : null,
          bankPixKeyType:  form.bankType === 'PIX'     ? (form.bankPixKeyType  || null) : null,
          bankName:        form.bankType === 'TED_DOC' ? (form.bankName        || null) : null,
          bankCode:        form.bankType === 'TED_DOC' ? (form.bankCode        || null) : null,
          bankAgency:      form.bankType === 'TED_DOC' ? (form.bankAgency      || null) : null,
          bankAgencyDigit: form.bankType === 'TED_DOC' ? (form.bankAgencyDigit || null) : null,
          bankAccount:     form.bankType === 'TED_DOC' ? (form.bankAccount     || null) : null,
          bankAccountDigit:form.bankType === 'TED_DOC' ? (form.bankAccountDigit || null) : null,
          bankAccountType: form.bankType === 'TED_DOC' ? (form.bankAccountType || null) : null,
          bankHolderName:  form.bankHolderName  || null,
          bankHolderDoc:   form.bankHolderDoc   ? form.bankHolderDoc.replace(/\D/g,'') : null,
          supplierId:      supplierId || null,
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

  // Placeholder da chave PIX conforme tipo
  const pixPlaceholder = PIX_KEY_TYPES.find(t => t.value === form.bankPixKeyType)?.placeholder ?? 'Informe a chave PIX'

  // Validação CNPJ PJ
  const cnpjDigits = form.pjCnpj.replace(/\D/g, '')
  const cnpjInvalid = cnpjDigits.length === 14 && !validateCnpj(form.pjCnpj)

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

              {/* Feedback */}
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

              {/* ── SEÇÃO 1 — Foto e dados pessoais ── */}
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
                          alt="Foto" className="w-full h-full object-cover"
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
                    <input type="file" className="hidden" accept="image/*"
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
                    <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                      placeholder="Ex: João da Silva Santos"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">CPF</label>
                    <input type="text" value={form.cpf}
                      onChange={e => set('cpf', maskCpf(e.target.value))}
                      placeholder="000.000.000-00" maxLength={14} inputMode="numeric"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">RG</label>
                    <input type="text" value={form.rg} onChange={e => set('rg', e.target.value)}
                      placeholder="00.000.000-0"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">CTPS</label>
                    <input type="text" value={form.ctps} onChange={e => set('ctps', e.target.value)}
                      placeholder="Nº / Série"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">PIS/PASEP</label>
                    <input type="text" value={form.pis} onChange={e => set('pis', e.target.value)}
                      placeholder="000.00000.00-0"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      <Calendar size={11} className="inline mr-1" />Nascimento
                    </label>
                    <input type="date" value={form.birthDate} onChange={e => set('birthDate', e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Telefone</label>
                    <input type="text" value={form.phone}
                      onChange={e => set('phone', maskPhone(e.target.value))}
                      placeholder="(11) 99999-9999"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">E-mail</label>
                    <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                      placeholder="joao@exemplo.com"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                </div>
              </section>

              <div className="border-t border-gray-100" />

              {/* ── SEÇÃO 2 — Dados profissionais ── */}
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
                    <select value={form.type} onChange={e => set('type', e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white">
                      <option value="CLT">CLT</option>
                      <option value="PJ">Pessoa Jurídica (PJ)</option>
                      <option value="TEMPORARY">Temporário</option>
                      <option value="INTERN">Estagiário</option>
                      <option value="THIRD_PARTY">Terceirizado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Função / Cargo <span className="text-red-400">*</span>
                    </label>
                    <input list="funcoes-sugeridas" value={form.role}
                      onChange={e => set('role', e.target.value)}
                      placeholder="Digite ou selecione a função..."
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                    <datalist id="funcoes-sugeridas">
                      {['Pedreiro','Servente','Carpinteiro','Armador','Encarregado','Mestre de obras',
                        'Engenheiro Civil','Arquiteto','Técnico em Edificações','Eletricista','Hidráulico',
                        'Pintor','Gesseiro','Azulejista','Serralheiro','Soldador','Motorista',
                        'Operador de máquinas','Almoxarife','Administrativo','Auxiliar administrativo',
                        'Porteiro','Vigilante','Estagiário'].map(f => (
                        <option key={f} value={f} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Departamento / Setor</label>
                    <input type="text" value={form.department} onChange={e => set('department', e.target.value)}
                      placeholder="Ex: Produção, Administração"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Data de admissão <span className="text-red-400">*</span>
                    </label>
                    <input type="date" value={form.admissionDate} onChange={e => set('admissionDate', e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Salário / Custo mensal</label>
                    <input type="text" value={form.salary}
                      onChange={e => set('salary', e.target.value.replace(/[^\d.,]/g, ''))}
                      placeholder="R$ 0,00"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      <MapPin size={11} className="inline mr-1" />Local atual
                    </label>
                    <div className="flex gap-2">
                      <select value={form.locationType}
                        onChange={e => setForm(f => ({ ...f, locationType: e.target.value, locationFixed: '', projectId: '' }))}
                        className="w-40 flex-shrink-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white">
                        <option value="">Sem local</option>
                        <option value="FIXED">Local fixo</option>
                        <option value="PROJECT">Obra</option>
                      </select>
                      {form.locationType === 'FIXED' && (
                        <select value={form.locationFixed} onChange={e => set('locationFixed', e.target.value)}
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white">
                          <option value="">Selecione...</option>
                          {FIXED_LOCATIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                        </select>
                      )}
                      {form.locationType === 'PROJECT' && (
                        <select value={form.projectId} onChange={e => set('projectId', e.target.value)}
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white">
                          <option value="">Selecione a obra...</option>
                          {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Vínculo com fornecedor (PJ / Terceirizado) ── */}
                {['PJ', 'THIRD_PARTY'].includes(form.type) && (
                  <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 size={14} className="text-[#F5A623]" />
                      <h4 className="text-sm font-semibold text-gray-700">Vínculo com fornecedor</h4>
                    </div>
                    <p className="text-xs text-gray-500">
                      Colaboradores {form.type === 'PJ' ? 'PJ' : 'terceirizados'} podem ser vinculados
                      a um fornecedor para rastrear pagamentos e NFs.
                    </p>
                    {!supplierId ? (
                      <div className="relative">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                          Buscar fornecedor cadastrado
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={supplierSearch}
                            onChange={e => searchSuppliers(e.target.value)}
                            placeholder="Buscar por nome, CPF ou CNPJ..."
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                          />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
                        </div>
                        {supplierResults.length > 0 && (
                          <div className="absolute z-10 left-0 right-0 bg-white border border-gray-200 rounded-xl mt-1 shadow-lg max-h-48 overflow-y-auto">
                            {supplierResults.map(s => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  setSupplierId(s.id)
                                  setSupplierName(s.name)
                                  setSupplierSearch('')
                                  setSupplierResults([])
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left border-b border-gray-100 last:border-0"
                              >
                                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center font-bold text-xs text-amber-800 flex-shrink-0">
                                  {s.name.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-gray-800 truncate">{s.name}</div>
                                  <div className="text-xs text-gray-500">
                                    {s.cpfCnpj || s.cnpj || '—'}
                                    {s.category && ` · ${s.category}`}
                                  </div>
                                </div>
                                <span className="text-[#F5A623] text-xs">Vincular →</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-gray-400 mt-1.5">Deixe em branco para vincular depois</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                        <span className="text-green-600 text-base">✓</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-green-800 truncate">{supplierName}</div>
                          <div className="text-xs text-green-700 opacity-80">Fornecedor vinculado — pagamentos serão rastreados</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setSupplierId(''); setSupplierName('') }}
                          className="text-xs text-red-500 hover:text-red-700 flex-shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* ── FIX 2: Dados da empresa PJ (condicional) ── */}
                {form.type === 'PJ' && (
                  <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 size={14} className="text-amber-600" />
                      <h4 className="text-sm font-semibold text-amber-800">Dados da empresa (PJ)</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">CNPJ</label>
                        <input type="text" value={form.pjCnpj}
                          onChange={e => set('pjCnpj', maskCnpj(e.target.value))}
                          placeholder="00.000.000/0000-00" maxLength={18} inputMode="numeric"
                          className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 ${cnpjInvalid ? 'border-red-300 bg-red-50' : 'border-gray-200'}`} />
                        {cnpjInvalid && <p className="text-[11px] text-red-600 mt-0.5">CNPJ inválido</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Razão social</label>
                        <input type="text" value={form.pjRazaoSocial}
                          onChange={e => set('pjRazaoSocial', e.target.value)}
                          placeholder="Empresa ABC Ltda"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Nome fantasia</label>
                        <input type="text" value={form.pjNomeFantasia}
                          onChange={e => set('pjNomeFantasia', e.target.value)}
                          placeholder="Nome fantasia (opcional)"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">E-mail da empresa</label>
                        <input type="email" value={form.pjEmail}
                          onChange={e => set('pjEmail', e.target.value)}
                          placeholder="contato@empresa.com"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Telefone da empresa</label>
                        <input type="text" value={form.pjPhone}
                          onChange={e => set('pjPhone', maskPhone(e.target.value))}
                          placeholder="(11) 99999-9999"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <div className="border-t border-gray-100" />

              {/* ── SEÇÃO 3 — Endereço ── */}
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
                    <input type="text" value={form.zipCode}
                      onChange={e => set('zipCode', maskCep(e.target.value))}
                      onBlur={e => handleCepBlur(e.target.value)}
                      placeholder="00000-000" maxLength={9}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Logradouro</label>
                    <input type="text" value={form.address} onChange={e => set('address', e.target.value)}
                      placeholder="Rua, Av., número, complemento"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Cidade</label>
                    <input type="text" value={form.city} onChange={e => set('city', e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">UF</label>
                    <input type="text" value={form.state}
                      onChange={e => set('state', e.target.value.toUpperCase().slice(0, 2))}
                      maxLength={2} placeholder="SP"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                </div>
              </section>

              <div className="border-t border-gray-100" />

              {/* ── FIX 3: SEÇÃO 4 — Dados bancários ── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <CreditCard size={15} className="text-[#F5A623]" />
                  <h3 className="text-sm font-semibold text-gray-700">
                    Dados bancários para pagamento
                    <span className="text-xs font-normal text-gray-400 ml-2">(opcional)</span>
                  </h3>
                </div>

                {/* Toggle PIX / TED */}
                <div className="flex gap-2 mb-4">
                  {(['', 'PIX', 'TED_DOC'] as const).map(t => (
                    <button key={t} type="button" onClick={() => set('bankType', t)}
                      className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        form.bankType === t
                          ? 'bg-amber-50 border-amber-400 text-amber-800 font-semibold'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {t === '' ? 'Não informar' : t === 'PIX' ? '⚡ PIX' : '🏦 TED / DOC'}
                    </button>
                  ))}
                </div>

                {/* ── PIX ── */}
                {form.bankType === 'PIX' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tipo de chave PIX</label>
                      <select value={form.bankPixKeyType}
                        onChange={e => { set('bankPixKeyType', e.target.value); set('bankPixKey', '') }}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white">
                        <option value="">Selecione...</option>
                        {PIX_KEY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Chave PIX</label>
                      <input
                        type={form.bankPixKeyType === 'EMAIL' ? 'email' : 'text'}
                        value={form.bankPixKey}
                        onChange={e => {
                          let val = e.target.value
                          if (form.bankPixKeyType === 'CPF')   val = maskCpf(val)
                          else if (form.bankPixKeyType === 'CNPJ')  val = maskCnpj(val)
                          else if (form.bankPixKeyType === 'PHONE') val = maskPhone(val)
                          set('bankPixKey', val)
                        }}
                        placeholder={pixPlaceholder}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Nome do titular da conta</label>
                      <input type="text" value={form.bankHolderName}
                        onChange={e => set('bankHolderName', e.target.value)}
                        placeholder="Nome completo igual ao cadastro bancário"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                    </div>
                  </div>
                )}

                {/* ── TED / DOC ── */}
                {form.bankType === 'TED_DOC' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Banco</label>
                      <div className="flex gap-2">
                        <input type="text" value={form.bankCode}
                          onChange={e => set('bankCode', e.target.value.replace(/\D/g, '').slice(0, 4))}
                          placeholder="Cód" maxLength={4} inputMode="numeric"
                          className="w-20 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 text-center" />
                        <input type="text" value={form.bankName}
                          onChange={e => set('bankName', e.target.value)}
                          placeholder="Nome do banco (ex: Itaú, Bradesco, Nubank...)"
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                      </div>
                    </div>
                    {/* Agência */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Agência</label>
                      <div className="flex gap-2">
                        <input type="text" value={form.bankAgency}
                          onChange={e => set('bankAgency', e.target.value.replace(/\D/g,'').slice(0,6))}
                          placeholder="0000" maxLength={6} inputMode="numeric"
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                        <input type="text" value={form.bankAgencyDigit}
                          onChange={e => set('bankAgencyDigit', e.target.value.replace(/\D/g,'').slice(0,1))}
                          placeholder="X" maxLength={1}
                          className="w-12 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 text-center" />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">Agência · Dígito</p>
                    </div>
                    {/* Conta */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Conta</label>
                      <div className="flex gap-2">
                        <input type="text" value={form.bankAccount}
                          onChange={e => set('bankAccount', e.target.value.replace(/\D/g,'').slice(0,12))}
                          placeholder="00000" maxLength={12} inputMode="numeric"
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                        <input type="text" value={form.bankAccountDigit}
                          onChange={e => set('bankAccountDigit', e.target.value.slice(0,1))}
                          placeholder="X" maxLength={1}
                          className="w-12 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 text-center" />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">Conta · Dígito</p>
                    </div>
                    {/* Tipo de conta */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tipo de conta</label>
                      <select value={form.bankAccountType} onChange={e => set('bankAccountType', e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white">
                        <option value="CORRENTE">Conta Corrente</option>
                        <option value="POUPANCA">Conta Poupança</option>
                      </select>
                    </div>
                    {/* Nome do titular */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Nome do titular</label>
                      <input type="text" value={form.bankHolderName}
                        onChange={e => set('bankHolderName', e.target.value)}
                        placeholder="Nome completo"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                    </div>
                    {/* CPF/CNPJ do titular */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">CPF / CNPJ do titular</label>
                      <input type="text" value={form.bankHolderDoc}
                        onChange={e => {
                          const digits = e.target.value.replace(/\D/g,'')
                          set('bankHolderDoc', digits.length <= 11 ? maskCpf(digits) : maskCnpj(digits))
                        }}
                        placeholder="CPF ou CNPJ do titular" maxLength={18} inputMode="numeric"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                    </div>
                  </div>
                )}
              </section>

            </div>
          </div>
        )}

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex gap-3 rounded-b-2xl flex-shrink-0">
          <button type="button" onClick={onClose} disabled={loading}
            className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} disabled={loading || success}
            className="flex-1 bg-[#F5A623] hover:bg-[#d4891a] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
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
