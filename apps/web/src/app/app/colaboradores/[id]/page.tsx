'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Pencil, UserX, UserMinus, Loader2,
  Upload, User, FileText, GraduationCap, Shield,
  CalendarDays, HardHat, Clock, Plus, Trash2, Download,
  CheckCircle, AlertTriangle, X, Save, ArrowRightLeft,
  Eye, ExternalLink, FileImage, MapPin, History, DollarSign,
  ShieldCheck, ZoomIn, PenTool, FileOutput,
} from 'lucide-react'
import { Breadcrumb }             from '@/components/ui/Breadcrumb'
import { EmployeeFormModal }      from '../components/EmployeeFormModal'
import { DismissalModal }         from '../components/DismissalModal'
import { TransferProjectModal }   from '../components/TransferProjectModal'
import { toImageUrl }             from '@/lib/imageUrl'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Employee {
  id:               string
  code:             string
  name:             string
  cpf?:             string | null
  rg?:              string | null
  ctps?:            string | null
  pis?:             string | null
  birthDate?:       string | null
  admissionDate?:   string | null
  dismissalDate?:   string | null
  email?:           string | null
  phone?:           string | null
  address?:         string | null
  city?:            string | null
  state?:           string | null
  zipCode?:         string | null
  photo?:           string | null
  type:             string
  role?:            string | null
  department?:      string | null
  salary?:          number | null
  status:           string
  projectId?:       string | null
  locationId?:      string | null
  locationName?:    string | null
  lastTransferDate?: string | null
  project?:         { id: string; name: string; code: string | null } | null
  // Vínculo com fornecedor
  supplierId?:      string | null
  supplier?:        { id: string; name: string; type: string; cpfCnpj?: string | null; cnpj?: string | null; category?: string | null } | null
  // Dados PJ
  pjCnpj?:          string | null
  pjRazaoSocial?:   string | null
  pjNomeFantasia?:  string | null
  pjEmail?:         string | null
  pjPhone?:         string | null
  // Dados bancários
  bankType?:         string | null
  bankPixKey?:       string | null
  bankPixKeyType?:   string | null
  bankName?:         string | null
  bankCode?:         string | null
  bankAgency?:       string | null
  bankAgencyDigit?:  string | null
  bankAccount?:      string | null
  bankAccountDigit?: string | null
  bankAccountType?:  string | null
  bankHolderName?:   string | null
  bankHolderDoc?:    string | null
  documents:        EmployeeDoc[]
  trainings:        EmployeeTraining[]
  vacations:        EmployeeVacation[]
  epiDeliveries:    EpiDelivery[]
}

interface EmployeeDoc {
  id:            string
  type:          string
  name:          string
  fileUrl?:      string | null
  fileType?:     string | null
  issueDate?:    string | null
  expiryDate?:   string | null
  observations?: string | null
  isActive:      boolean
}

interface EmployeeTraining {
  id:              string
  name:            string
  provider?:       string | null
  workload?:       number | null
  completedAt:     string
  expiresAt?:      string | null
  certificateUrl?:  string | null
  certificateType?: string | null
  observations?:   string | null
}

interface EmployeeVacation {
  id:            string
  startDate:     string
  endDate:       string
  days:          number
  status:        string
  observations?: string | null
}

interface EpiDelivery {
  id:                string
  epiName:           string
  epiCode?:          string | null
  quantity:          number
  size?:             string | null
  deliveredAt:       string
  returnedAt?:       string | null
  condition?:        string | null
  notes?:            string | null
  expiresAt?:        string | null
  selfieUrl?:        string | null
  selfieDate?:       string | null
  employeeSignature?: string | null
  deliveredByName?:  string | null
}

interface ProjectHistory {
  id:           string
  projectId?:   string | null
  locationId?:  string | null
  locationName?: string | null
  startDate:    string
  endDate?:     string | null
  reason?:      string | null
  project?:     { id: string; name: string; code: string | null } | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const t = localStorage.getItem('token')     ?? ''
  const c = localStorage.getItem('companyId') ?? ''
  return { Authorization: `Bearer ${t}`, 'x-company-id': c }
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function yearsMonths(start: string | null | undefined) {
  if (!start) return '—'
  const s = new Date(start)
  const n = new Date()
  let years  = n.getFullYear() - s.getFullYear()
  let months = n.getMonth()    - s.getMonth()
  if (months < 0) { years--; months += 12 }
  if (years > 0) return `${years} ano${years > 1 ? 's' : ''}${months > 0 ? ` e ${months} mês${months > 1 ? 'es' : ''}` : ''}`
  return `${months} mês${months > 1 ? 'es' : ''}`
}

function maskCpf(v: string | null | undefined) {
  if (!v) return '—'
  return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '***.***.***-$4')
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

function diffDays(start: string, end?: string | null): number {
  const a = new Date(start).getTime()
  const b = end ? new Date(end).getTime() : Date.now()
  return Math.round(Math.abs(b - a) / 86_400_000)
}

/** Data fim + 1 dia corridos = data fim calculada */
function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days - 1)
  return d.toISOString().slice(0, 10)
}

/** Diferença em dias corridos entre duas datas (inclusivo) */
function daysBetween(start: string, end: string): number {
  const a = new Date(start).getTime()
  const b = new Date(end).getTime()
  return Math.round((b - a) / 86_400_000) + 1
}

const TYPE_LABELS: Record<string, string> = {
  CLT: 'CLT', PJ: 'PJ', TEMPORARY: 'Temporário', INTERN: 'Estagiário', THIRD_PARTY: 'Terceirizado',
}
const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    'bg-green-100 text-green-700',
  AWAY:      'bg-amber-100 text-amber-700',
  DISMISSED: 'bg-red-100 text-red-600',
}
const STATUS_LABELS: Record<string, string> = { ACTIVE: 'Ativo', AWAY: 'Afastado', DISMISSED: 'Desligado' }
const DOC_TYPES = ['RG','CPF','CTPS','ASO','NR35','NR18','CNH','HABILITACAO','CERTIFICADO','CONTRATO','OTHER']
const VAC_STATUS_LABELS: Record<string, string> = { SCHEDULED: 'Agendado', ACTIVE: 'Em férias', COMPLETED: 'Concluído', CANCELLED: 'Cancelado' }

type Tab = 'Dados pessoais' | 'Documentos' | 'Treinamentos' | 'EPIs' | 'Férias' | 'Financeiro' | 'Histórico de obras'
const TABS_BASE: Tab[] = ['Dados pessoais', 'Documentos', 'Treinamentos', 'EPIs', 'Férias', 'Histórico de obras']
const PJ_TYPES = ['PJ', 'THIRD_PARTY']

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ColaboradorPerfilPage() {
  const { id }  = useParams() as { id: string }
  const router  = useRouter()

  const [employee,       setEmployee]       = useState<Employee | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [tab,            setTab]            = useState<Tab>('Dados pessoais')
  const [showEdit,       setShowEdit]       = useState(false)
  const [dismissing,     setDismissing]     = useState<'dismiss' | 'away' | null>(null)
  const [showTransfer,   setShowTransfer]   = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [projects,       setProjects]       = useState<{ id: string; name: string; code: string | null }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/v1/employees/${id}`, { headers: getHeaders() })
      if (!res.ok) { router.push('/app/colaboradores'); return }
      setEmployee(await res.json())
    } finally {
      setLoading(false)
    }
  }, [id, router])

  const loadProjects = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/api/v1/projects?status=ACTIVE&limit=100`, { headers: getHeaders() })
      const data = await res.json()
      setProjects((data.projects ?? []).map((p: any) => ({ id: p.id, name: p.name, code: p.code })))
    } catch { /**/ }
  }, [])

  useEffect(() => { load(); loadProjects() }, [load, loadProjects])

  const handlePhotoUpload = useCallback(async (file: File) => {
    setUploadingPhoto(true)
    try {
      const t = localStorage.getItem('token')     ?? ''
      const c = localStorage.getItem('companyId') ?? ''
      const fd = new FormData(); fd.append('file', file)
      const res  = await fetch(`${API}/api/v1/uploads/employee-photo`, {
        method: 'POST', headers: { Authorization: `Bearer ${t}`, 'x-company-id': c }, body: fd,
      })
      const data = await res.json()
      if (res.ok) {
        await fetch(`${API}/api/v1/employees/${id}`, {
          method: 'PUT',
          headers: { ...getHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo: data.url }),
        })
        load()
      }
    } finally {
      setUploadingPhoto(false)
    }
  }, [id, load])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 size={28} className="animate-spin text-[#F5A623]" />
      </div>
    )
  }
  if (!employee) return null

  // Local atual legível
  const localAtual = employee.locationName
    || employee.project?.name
    || (employee.locationId ? employee.locationId : null)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Breadcrumb items={[
        { label: 'Colaboradores', href: '/app/colaboradores' },
        { label: employee.name },
      ]} />

      {/* ── Header do perfil ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row items-start gap-5">
          {/* Foto */}
          <div className="relative group flex-shrink-0">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-100">
              {employee.photo ? (
                <img src={toImageUrl(employee.photo)} alt={employee.name}
                  className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <User size={32} />
                </div>
              )}
              {uploadingPhoto && (
                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
                  <Loader2 size={16} className="animate-spin text-white" />
                </div>
              )}
            </div>
            <label className="absolute bottom-0 right-0 w-7 h-7 bg-[#F5A623] rounded-full cursor-pointer flex items-center justify-center shadow-sm hover:bg-[#d4891a] transition-colors">
              <Upload size={12} className="text-white" />
              <input type="file" className="hidden" accept="image/*"
                onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f) }} />
            </label>
          </div>

          {/* Dados principais */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-gray-900">{employee.name}</h1>
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${STATUS_COLORS[employee.status]}`}>
                {STATUS_LABELS[employee.status]}
              </span>
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {TYPE_LABELS[employee.type] ?? employee.type}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-500">
              {employee.role && <span className="font-medium text-gray-700">{employee.role}</span>}
              <span className="font-mono text-xs">{employee.code}</span>
            </div>
            {localAtual && (
              <div className="mt-2 flex items-center gap-1.5">
                {employee.project ? (
                  <>
                    <HardHat size={13} className="text-[#F5A623]" />
                    <Link href={`/app/centro-de-custo/${employee.project.id}`}
                      className="text-sm text-[#F5A623] hover:underline font-medium">
                      {localAtual}
                    </Link>
                  </>
                ) : (
                  <>
                    <MapPin size={13} className="text-gray-400" />
                    <span className="text-sm text-gray-600">{localAtual}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Botões */}
          <div className="flex flex-wrap gap-2 flex-shrink-0">
            <button
              onClick={() => setShowEdit(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Pencil size={14} /> Editar
            </button>
            {employee.status !== 'DISMISSED' && (
              <>
                <button
                  onClick={() => setShowTransfer(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-[#F5A623] rounded-xl text-[#F5A623] hover:bg-orange-50 transition-colors"
                >
                  <ArrowRightLeft size={14} /> Transferir
                </button>
                <button
                  onClick={() => setDismissing('away')}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-amber-200 rounded-xl text-amber-600 hover:bg-amber-50 transition-colors"
                >
                  <UserMinus size={14} /> Afastar
                </button>
                <button
                  onClick={() => setDismissing('dismiss')}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-red-200 rounded-xl text-red-600 hover:bg-red-50 transition-colors"
                >
                  <UserX size={14} /> Desligar
                </button>
              </>
            )}
          </div>
        </div>

        {/* Cards resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-gray-100">
          {[
            { label: 'Admissão',         value: fmtDate(employee.admissionDate) },
            { label: 'Tempo de empresa', value: yearsMonths(employee.admissionDate ?? undefined) },
            { label: 'Função',           value: employee.role ?? '—' },
            { label: 'Departamento',     value: employee.department ?? '—' },
          ].map(c => (
            <div key={c.label}>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">{c.label}</p>
              <p className="text-sm font-semibold text-gray-800">{c.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Abas ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {(PJ_TYPES.includes(employee.type)
            ? ['Dados pessoais', 'Documentos', 'Treinamentos', 'EPIs', 'Férias', 'Financeiro', 'Histórico de obras'] as Tab[]
            : TABS_BASE
          ).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-3.5 text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t ? 'text-[#F5A623] border-b-2 border-[#F5A623]' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t === 'Financeiro' ? '💰 Financeiro' : t}
            </button>
          ))}
        </div>

        {/* Dados pessoais */}
        {tab === 'Dados pessoais' && (
          <div className="p-5 space-y-6">
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <User size={14} className="text-[#F5A623]" /> Dados pessoais
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: 'CPF',       value: maskCpf(employee.cpf) },
                  { label: 'RG',        value: employee.rg ?? '—' },
                  { label: 'CTPS',      value: employee.ctps ?? '—' },
                  { label: 'PIS/PASEP', value: employee.pis ?? '—' },
                  { label: 'Nascimento', value: fmtDate(employee.birthDate) },
                  { label: 'Telefone',  value: employee.phone ?? '—' },
                  { label: 'E-mail',    value: employee.email ?? '—' },
                ].map(f => (
                  <div key={f.label}>
                    <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide mb-0.5">{f.label}</p>
                    <p className="text-sm text-gray-700 break-all">{f.value}</p>
                  </div>
                ))}
              </div>
            </section>
            <div className="border-t border-gray-100" />
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Shield size={14} className="text-[#F5A623]" /> Dados profissionais
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Tipo de contrato',  value: TYPE_LABELS[employee.type] ?? employee.type },
                  { label: 'Função',             value: employee.role ?? '—' },
                  { label: 'Departamento',       value: employee.department ?? '—' },
                  { label: 'Data de admissão',   value: fmtDate(employee.admissionDate) },
                  { label: 'Data desligamento',  value: fmtDate(employee.dismissalDate) },
                  { label: 'Salário / Custo',    value: employee.salary ? '••••••' : '—' },
                  { label: 'Local atual',        value: localAtual ?? '—' },
                ].map(f => (
                  <div key={f.label}>
                    <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide mb-0.5">{f.label}</p>
                    <p className="text-sm text-gray-700">{f.value}</p>
                  </div>
                ))}
              </div>
            </section>
            {(employee.address || employee.city || employee.zipCode) && (
              <>
                <div className="border-t border-gray-100" />
                <section>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Endereço</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {[
                      { label: 'CEP',      value: employee.zipCode ?? '—' },
                      { label: 'Endereço', value: employee.address ?? '—' },
                      { label: 'Cidade',   value: employee.city    ?? '—' },
                      { label: 'UF',       value: employee.state   ?? '—' },
                    ].map(f => (
                      <div key={f.label}>
                        <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide mb-0.5">{f.label}</p>
                        <p className="text-sm text-gray-700">{f.value}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            {/* ── Dados PJ (somente tipo PJ) ──────────────────────────── */}
            {employee.type === 'PJ' && (employee.pjCnpj || employee.pjRazaoSocial || employee.pjNomeFantasia || employee.pjEmail || employee.pjPhone) && (
              <>
                <div className="border-t border-gray-100" />
                <section>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <FileText size={14} className="text-amber-500" />
                    Dados da empresa PJ
                  </h3>
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {[
                        { label: 'CNPJ',           value: employee.pjCnpj        ?? '—' },
                        { label: 'Razão social',    value: employee.pjRazaoSocial ?? '—' },
                        { label: 'Nome fantasia',   value: employee.pjNomeFantasia ?? '—' },
                        { label: 'E-mail PJ',       value: employee.pjEmail       ?? '—' },
                        { label: 'Telefone PJ',     value: employee.pjPhone       ?? '—' },
                      ].filter(f => f.value !== '—').map(f => (
                        <div key={f.label}>
                          <p className="text-[10px] text-amber-600 uppercase font-semibold tracking-wide mb-0.5">{f.label}</p>
                          <p className="text-sm text-gray-800 break-all">{f.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </>
            )}

            {/* ── Dados bancários ─────────────────────────────────────── */}
            {employee.bankType && employee.bankType !== 'NONE' && (
              <>
                <div className="border-t border-gray-100" />
                <section>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <DollarSign size={14} className="text-[#F5A623]" />
                    Dados bancários
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      employee.bankType === 'PIX' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {employee.bankType === 'PIX' ? '⚡ PIX' : '🏦 TED/DOC'}
                    </span>
                  </h3>

                  {employee.bankType === 'PIX' && (
                    <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <div>
                          <p className="text-[10px] text-green-700 uppercase font-semibold tracking-wide mb-0.5">Tipo de chave</p>
                          <p className="text-sm text-gray-800">
                            {{ CPF: 'CPF', CNPJ: 'CNPJ', EMAIL: 'E-mail', PHONE: 'Telefone', EVP: 'Chave aleatória' }[employee.bankPixKeyType ?? ''] ?? employee.bankPixKeyType ?? '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-green-700 uppercase font-semibold tracking-wide mb-0.5">Chave PIX</p>
                          <p className="text-sm text-gray-800 break-all font-mono">{employee.bankPixKey ?? '—'}</p>
                        </div>
                        {employee.bankHolderName && (
                          <div>
                            <p className="text-[10px] text-green-700 uppercase font-semibold tracking-wide mb-0.5">Titular</p>
                            <p className="text-sm text-gray-800">{employee.bankHolderName}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {employee.bankType === 'TED_DOC' && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {employee.bankName && (
                          <div>
                            <p className="text-[10px] text-blue-700 uppercase font-semibold tracking-wide mb-0.5">Banco</p>
                            <p className="text-sm text-gray-800">
                              {employee.bankCode ? `${employee.bankCode} — ` : ''}{employee.bankName}
                            </p>
                          </div>
                        )}
                        {(employee.bankAgency) && (
                          <div>
                            <p className="text-[10px] text-blue-700 uppercase font-semibold tracking-wide mb-0.5">Agência</p>
                            <p className="text-sm text-gray-800 font-mono">
                              {employee.bankAgency}{employee.bankAgencyDigit ? `-${employee.bankAgencyDigit}` : ''}
                            </p>
                          </div>
                        )}
                        {(employee.bankAccount) && (
                          <div>
                            <p className="text-[10px] text-blue-700 uppercase font-semibold tracking-wide mb-0.5">Conta</p>
                            <p className="text-sm text-gray-800 font-mono">
                              {employee.bankAccount}{employee.bankAccountDigit ? `-${employee.bankAccountDigit}` : ''}
                              {employee.bankAccountType && (
                                <span className="ml-1 text-[10px] text-gray-400 font-sans">
                                  ({employee.bankAccountType === 'CORRENTE' ? 'Corrente' : employee.bankAccountType === 'POUPANCA' ? 'Poupança' : employee.bankAccountType})
                                </span>
                              )}
                            </p>
                          </div>
                        )}
                        {employee.bankHolderName && (
                          <div>
                            <p className="text-[10px] text-blue-700 uppercase font-semibold tracking-wide mb-0.5">Titular</p>
                            <p className="text-sm text-gray-800">{employee.bankHolderName}</p>
                          </div>
                        )}
                        {employee.bankHolderDoc && (
                          <div>
                            <p className="text-[10px] text-blue-700 uppercase font-semibold tracking-wide mb-0.5">CPF/CNPJ titular</p>
                            <p className="text-sm text-gray-800 font-mono">{employee.bankHolderDoc}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}

        {tab === 'Documentos'  && <DocumentsPanel  employee={employee} onReload={load} />}
        {tab === 'Treinamentos' && <TrainingsPanel  employee={employee} onReload={load} />}
        {tab === 'Férias'       && <VacationsPanel  employee={employee} onReload={load} />}

        {/* EPIs */}
        {tab === 'EPIs' && (
          <EpiDeliveriesPanel
            deliveries={employee.epiDeliveries}
            employeeName={employee.name}
          />
        )}

        {/* Financeiro */}
        {tab === 'Financeiro' && (
          <FinancialPanel employee={employee} onOpenEdit={() => setShowEdit(true)} />
        )}

        {/* Histórico de obras */}
        {tab === 'Histórico de obras' && (
          <HistoryPanel employeeId={id} />
        )}
      </div>

      {/* Modais */}
      <EmployeeFormModal
        isOpen={showEdit}
        onClose={() => setShowEdit(false)}
        onSuccess={() => { setShowEdit(false); load() }}
        editId={id}
        projects={projects}
      />

      {dismissing && (
        <DismissalModal
          isOpen
          onClose={() => setDismissing(null)}
          onSuccess={() => { setDismissing(null); load() }}
          employeeId={id}
          employeeName={employee.name}
          mode={dismissing}
        />
      )}

      <TransferProjectModal
        isOpen={showTransfer}
        onClose={() => setShowTransfer(false)}
        onSuccess={() => { setShowTransfer(false); load() }}
        employeeId={id}
        employeeName={employee.name}
        currentProject={employee.project}
        currentLocationId={employee.locationId}
        currentLocationName={employee.locationName}
      />
    </div>
  )
}

// ─── Subcomp: Documentos ──────────────────────────────────────────────────────

function DocumentsPanel({ employee, onReload }: { employee: Employee; onReload: () => void }) {
  const [showAdd,     setShowAdd]     = useState(false)
  const [form,        setForm]        = useState({ type: 'ASO', name: '', issueDate: '', expiryDate: '', fileUrl: '', fileType: '', observations: '' })
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [uploading,   setUploading]   = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const t = localStorage.getItem('token')     ?? ''
      const c = localStorage.getItem('companyId') ?? ''
      const fd = new FormData(); fd.append('file', file)
      const res  = await fetch(`${API}/api/v1/uploads/employee-document`, {
        method: 'POST', headers: { Authorization: `Bearer ${t}`, 'x-company-id': c }, body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setForm(f => ({ ...f, fileUrl: data.url, fileType: data.type }))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }, [])

  const save = useCallback(async () => {
    if (!form.type || !form.name) { setError('Tipo e nome são obrigatórios'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API}/api/v1/employees/${employee.id}/documents`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          issueDate:  form.issueDate  || undefined,
          expiryDate: form.expiryDate || undefined,
          fileUrl:    form.fileUrl    || undefined,
          fileType:   form.fileType   || undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setShowAdd(false)
      setForm({ type: 'ASO', name: '', issueDate: '', expiryDate: '', fileUrl: '', fileType: '', observations: '' })
      onReload()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }, [form, employee.id, onReload])

  const remove = useCallback(async (docId: string) => {
    if (!confirm('Remover este documento?')) return
    await fetch(`${API}/api/v1/employees/${employee.id}/documents/${docId}`, { method: 'DELETE', headers: getHeaders() })
    onReload()
  }, [employee.id, onReload])

  return (
    <div className="p-5 space-y-4">
      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          <button className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-lg">
            <X size={22} />
          </button>
          <img src={lightboxUrl} alt="Documento" className="max-w-full max-h-full rounded-xl object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Documentos ({employee.documents.length})</p>
        <button onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 text-sm text-[#F5A623] hover:underline font-medium">
          <Plus size={14} /> Adicionar
        </button>
      </div>

      {showAdd && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo *</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">
                {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: ASO 2025" className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Emissão</label>
              <input type="date" value={form.issueDate} onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Vencimento</label>
              <input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>

            {/* FIX 5 — Upload de arquivo do documento */}
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Arquivo <span className="text-gray-400 font-normal normal-case">(JPG, PNG, PDF • Máx. 10MB)</span>
              </label>
              {form.fileUrl ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg">
                  {form.fileType === 'pdf' ? (
                    <FileText size={16} className="text-red-500 flex-shrink-0" />
                  ) : (
                    <FileImage size={16} className="text-blue-500 flex-shrink-0" />
                  )}
                  <span className="text-xs text-gray-600 flex-1 truncate">
                    {form.fileType === 'pdf' ? 'PDF anexado' : 'Imagem anexada'}
                  </span>
                  <button type="button" onClick={() => setForm(f => ({ ...f, fileUrl: '', fileType: '' }))}
                    className="text-gray-400 hover:text-red-500">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <label className={`flex items-center gap-2 px-3 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                  uploading ? 'border-orange-300 bg-orange-50' : 'border-gray-200 hover:border-[#F5A623]'
                }`}>
                  {uploading ? (
                    <><Loader2 size={14} className="animate-spin text-[#F5A623]" /><span className="text-xs text-gray-500">Enviando...</span></>
                  ) : (
                    <><Upload size={14} className="text-gray-400" /><span className="text-xs text-gray-500">Clique para anexar documento</span></>
                  )}
                  <input ref={fileInputRef} type="file" className="hidden" accept="image/*,application/pdf"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f) }} />
                </label>
              )}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100">Cancelar</button>
            <button onClick={save} disabled={saving || uploading}
              className="px-3 py-1.5 text-sm bg-[#F5A623] text-white rounded-lg hover:bg-[#d4891a] disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Salvar
            </button>
          </div>
        </div>
      )}

      {employee.documents.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">Nenhum documento cadastrado</div>
      ) : (
        <div className="space-y-2">
          {employee.documents.map(doc => {
            const days  = daysUntil(doc.expiryDate)
            const badge = days === null ? null
              : days < 0   ? { text: `Vencido há ${Math.abs(days)} dias`, cls: 'bg-red-100 text-red-700' }
              : days <= 7  ? { text: `Vence em ${days} dias`,             cls: 'bg-red-100 text-red-700' }
              : days <= 30 ? { text: `Vence em ${days} dias`,             cls: 'bg-amber-100 text-amber-700' }
              : { text: 'Válido', cls: 'bg-green-100 text-green-700' }
            const fileUrl = doc.fileUrl ? toImageUrl(doc.fileUrl) : null
            return (
              <div key={doc.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="text-sm font-medium text-gray-800">{doc.name}</p>
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{doc.type}</span>
                    {badge && <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.text}</span>}
                  </div>
                  <div className="flex gap-3 text-xs text-gray-400">
                    {doc.issueDate  && <span>Emissão: {new Date(doc.issueDate).toLocaleDateString('pt-BR')}</span>}
                    {doc.expiryDate && <span>Vence: {new Date(doc.expiryDate).toLocaleDateString('pt-BR')}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {fileUrl && doc.fileType === 'image' && (
                    <button onClick={() => setLightboxUrl(fileUrl)}
                      className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors" title="Ver imagem">
                      <Eye size={14} />
                    </button>
                  )}
                  {fileUrl && doc.fileType === 'pdf' && (
                    <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Abrir PDF">
                      <ExternalLink size={14} />
                    </a>
                  )}
                  {fileUrl && (
                    <a href={fileUrl} download
                      className="p-1.5 text-gray-400 hover:text-green-500 transition-colors" title="Baixar">
                      <Download size={14} />
                    </a>
                  )}
                  <button onClick={() => remove(doc.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Remover">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Subcomp: Treinamentos ────────────────────────────────────────────────────

function TrainingsPanel({ employee, onReload }: { employee: Employee; onReload: () => void }) {
  const [showAdd,   setShowAdd]   = useState(false)
  const [form,      setForm]      = useState({ name: '', provider: '', workload: '', completedAt: '', expiresAt: '', certificateUrl: '', certificateType: '', observations: '' })
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadCertificate = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const t = localStorage.getItem('token')     ?? ''
      const c = localStorage.getItem('companyId') ?? ''
      const fd = new FormData(); fd.append('file', file)
      const res  = await fetch(`${API}/api/v1/uploads/employee-certificate`, {
        method: 'POST', headers: { Authorization: `Bearer ${t}`, 'x-company-id': c }, body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setForm(f => ({ ...f, certificateUrl: data.url, certificateType: data.type }))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }, [])

  const save = useCallback(async () => {
    if (!form.name || !form.completedAt) { setError('Nome e data de conclusão são obrigatórios'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API}/api/v1/employees/${employee.id}/trainings`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:            form.name,
          provider:        form.provider     || undefined,
          workload:        form.workload     ? parseInt(form.workload) : undefined,
          completedAt:     form.completedAt,
          expiresAt:       form.expiresAt    || undefined,
          certificateUrl:  form.certificateUrl  || undefined,
          certificateType: form.certificateType || undefined,
          observations:    form.observations || undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setShowAdd(false)
      setForm({ name: '', provider: '', workload: '', completedAt: '', expiresAt: '', certificateUrl: '', certificateType: '', observations: '' })
      onReload()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }, [form, employee.id, onReload])

  const remove = useCallback(async (trainingId: string) => {
    if (!confirm('Remover este treinamento?')) return
    await fetch(`${API}/api/v1/employees/${employee.id}/trainings/${trainingId}`, { method: 'DELETE', headers: getHeaders() })
    onReload()
  }, [employee.id, onReload])

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Treinamentos ({employee.trainings.length})</p>
        <button onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 text-sm text-[#F5A623] hover:underline font-medium">
          <Plus size={14} /> Registrar
        </button>
      </div>

      {showAdd && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: NR-35 Trabalho em Altura" className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Instrutor/Empresa</label>
              <input type="text" value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Carga horária (h)</label>
              <input type="number" value={form.workload} onChange={e => setForm(f => ({ ...f, workload: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Conclusão *</label>
              <input type="date" value={form.completedAt} onChange={e => setForm(f => ({ ...f, completedAt: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Vencimento</label>
              <input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>

            {/* FIX 4 — Upload de certificado */}
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Certificado <span className="text-gray-400 font-normal normal-case">(JPG, PNG, PDF • Máx. 10MB)</span>
              </label>
              {form.certificateUrl ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg">
                  {form.certificateType === 'pdf' ? (
                    <FileText size={16} className="text-red-500 flex-shrink-0" />
                  ) : (
                    <FileImage size={16} className="text-blue-500 flex-shrink-0" />
                  )}
                  <span className="text-xs text-gray-600 flex-1 truncate">
                    {form.certificateType === 'pdf' ? 'PDF anexado' : 'Imagem anexada'}
                  </span>
                  <button type="button" onClick={() => setForm(f => ({ ...f, certificateUrl: '', certificateType: '' }))}
                    className="text-gray-400 hover:text-red-500">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <label className={`flex items-center gap-2 px-3 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                  uploading ? 'border-orange-300 bg-orange-50' : 'border-gray-200 hover:border-[#F5A623]'
                }`}>
                  {uploading ? (
                    <><Loader2 size={14} className="animate-spin text-[#F5A623]" /><span className="text-xs text-gray-500">Enviando...</span></>
                  ) : (
                    <><Upload size={14} className="text-gray-400" /><span className="text-xs text-gray-500">Clique para anexar certificado</span></>
                  )}
                  <input ref={fileInputRef} type="file" className="hidden" accept="image/*,application/pdf"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadCertificate(f) }} />
                </label>
              )}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100">Cancelar</button>
            <button onClick={save} disabled={saving || uploading}
              className="px-3 py-1.5 text-sm bg-[#F5A623] text-white rounded-lg hover:bg-[#d4891a] disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Salvar
            </button>
          </div>
        </div>
      )}

      {employee.trainings.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">Nenhum treinamento registrado</div>
      ) : (
        <div className="space-y-2">
          {employee.trainings.map(t => {
            const days  = daysUntil(t.expiresAt)
            const badge = days === null ? { text: 'Sem vencimento', cls: 'bg-gray-100 text-gray-500' }
              : days < 0   ? { text: `Vencido há ${Math.abs(days)} dias`, cls: 'bg-red-100 text-red-700' }
              : days <= 30 ? { text: `Vence em ${days} dias`, cls: 'bg-amber-100 text-amber-700' }
              : { text: 'Válido', cls: 'bg-green-100 text-green-700' }
            const certUrl = t.certificateUrl ? toImageUrl(t.certificateUrl) : null
            return (
              <div key={t.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="text-sm font-medium text-gray-800">{t.name}</p>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.text}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-gray-400 flex-wrap">
                    {t.provider  && <span>{t.provider}</span>}
                    {t.workload  && <span>{t.workload}h</span>}
                    <span>Concluído: {new Date(t.completedAt).toLocaleDateString('pt-BR')}</span>
                    {t.expiresAt && <span>Vence: {new Date(t.expiresAt).toLocaleDateString('pt-BR')}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {certUrl && t.certificateType === 'pdf' && (
                    <a href={certUrl} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 text-gray-400 hover:text-red-500" title="Abrir PDF">
                      <ExternalLink size={14} />
                    </a>
                  )}
                  {certUrl && (
                    <a href={certUrl} download
                      className="p-1.5 text-gray-400 hover:text-blue-500" title="Baixar certificado">
                      <Download size={14} />
                    </a>
                  )}
                  <button onClick={() => remove(t.id)} className="p-1.5 text-gray-400 hover:text-red-500" title="Remover">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Subcomp: Férias ──────────────────────────────────────────────────────────

const VACATION_ELIGIBLE = ['CLT', 'INTERN', 'TEMPORARY']
const EMPLOYEE_TYPE_LABELS: Record<string, string> = {
  CLT:          'CLT',
  PJ:           'Pessoa Jurídica',
  INTERN:       'Estagiário',
  TEMPORARY:    'Temporário',
  OUTSOURCED:   'Terceirizado',
  FREELANCER:   'Freelancer',
}

function VacationsPanel({ employee, onReload }: { employee: Employee; onReload: () => void }) {
  const isEligible = VACATION_ELIGIBLE.includes(employee.type)
  const [showAdd, setShowAdd] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate,   setEndDate]   = useState('')
  const [days,      setDays]      = useState('30')
  const [vacStatus, setVacStatus] = useState('SCHEDULED')
  const [observations, setObservations] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const resetForm = () => {
    setStartDate(''); setEndDate(''); setDays('30')
    setVacStatus('SCHEDULED'); setObservations(''); setError('')
  }

  // Handler 1: mudou DATA INÍCIO
  const handleStartChange = (val: string) => {
    setStartDate(val)
    if (!val) return
    const d = parseInt(days)
    if (d > 0) {
      // se já tem dias → calcular data fim
      setEndDate(addDaysToDate(val, d))
    } else if (endDate) {
      // se já tem data fim → calcular dias
      const diff = daysBetween(val, endDate)
      if (diff > 0) setDays(String(diff))
    }
  }

  // Handler 2: mudou DATA FIM
  const handleEndChange = (val: string) => {
    setEndDate(val)
    if (!val || !startDate) return
    const diff = daysBetween(startDate, val)
    if (diff > 0) setDays(String(diff))
    else setDays('')
  }

  // Handler 3: mudou DIAS — calcula data fim automaticamente
  const handleDaysChange = (val: string) => {
    const num = val === '' ? '' : String(Math.max(1, parseInt(val) || 1))
    setDays(num)
    if (!num || !startDate) return
    setEndDate(addDaysToDate(startDate, parseInt(num)))
  }

  // Validação
  const endBeforeStart = startDate && endDate && endDate < startDate
  const canSave = !!(startDate && endDate && days && parseInt(days) > 0 && !endBeforeStart)

  const save = useCallback(async () => {
    if (!canSave) { setError('Verifique as datas informadas'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API}/api/v1/employees/${employee.id}/vacations`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate, endDate,
          days:         parseInt(days),
          status:       vacStatus,
          observations: observations || undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setShowAdd(false); resetForm(); onReload()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }, [canSave, startDate, endDate, days, vacStatus, observations, employee.id, onReload])

  const remove = useCallback(async (vacationId: string) => {
    if (!confirm('Remover este registro de férias?')) return
    await fetch(`${API}/api/v1/employees/${employee.id}/vacations/${vacationId}`, { method: 'DELETE', headers: getHeaders() })
    onReload()
  }, [employee.id, onReload])

  // Preview formatado do período
  const numDays = parseInt(days) || 0
  const periodPreview = startDate && endDate && numDays > 0 && !endBeforeStart
    ? `${new Date(startDate + 'T00:00').toLocaleDateString('pt-BR')} até ${new Date(endDate + 'T00:00').toLocaleDateString('pt-BR')}`
    : null

  // Bloquear completamente se não elegível
  if (!isEligible) {
    return (
      <div className="p-5">
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Férias não aplicável</p>
            <p className="text-xs text-amber-700 mt-1">
              Colaboradores do tipo <strong>{EMPLOYEE_TYPE_LABELS[employee.type] ?? employee.type}</strong> não
              têm direito a férias pelo regime CLT.
            </p>
            <p className="text-xs text-amber-600 mt-1">
              Férias CLT são aplicáveis apenas para: CLT, Estagiário e Temporário.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Férias ({employee.vacations.length})</p>
        <button onClick={() => { setShowAdd(v => !v); if (showAdd) resetForm() }}
          className="flex items-center gap-1.5 text-sm text-[#F5A623] hover:underline font-medium">
          <Plus size={14} /> Agendar
        </button>
      </div>

      {showAdd && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
          {error && <p className="text-xs text-red-500">{error}</p>}

          {/* Cálculo bidirecional — 3 campos com indicadores visuais */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Período de férias <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-[1fr_auto_1fr_auto_90px] gap-2 items-end">
              {/* Data início */}
              <div>
                <p className="text-[10px] text-gray-400 mb-1">Data início</p>
                <input type="date" value={startDate} onChange={e => handleStartChange(e.target.value)}
                  className={`w-full border rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 ${endBeforeStart ? 'border-red-300 bg-red-50' : 'border-gray-200'}`} />
              </div>
              {/* Seta → */}
              <div className="text-gray-300 text-lg pb-1.5">→</div>
              {/* Data fim */}
              <div>
                <p className="text-[10px] text-gray-400 mb-1">Data fim</p>
                <input type="date" value={endDate}
                  min={startDate || undefined}
                  onChange={e => handleEndChange(e.target.value)}
                  className={`w-full border rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 ${endBeforeStart ? 'border-red-300 bg-red-50' : 'border-gray-200'}`} />
              </div>
              {/* = */}
              <div className="text-gray-300 text-lg pb-1.5">=</div>
              {/* Dias */}
              <div>
                <p className="text-[10px] text-gray-400 mb-1">Dias</p>
                <div className="relative">
                  <input type="number" min="1" max="365" value={days}
                    onChange={e => handleDaysChange(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg pl-2.5 pr-8 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">dias</span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">
              💡 Preencha qualquer dois campos — o terceiro é calculado automaticamente
            </p>
          </div>

          {/* Preview do período */}
          {periodPreview && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
              numDays >= 30 ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-100'
            }`}>
              <CalendarDays size={13} className={numDays >= 30 ? 'text-amber-500' : 'text-blue-500'} />
              <p className={`text-xs font-medium ${numDays >= 30 ? 'text-amber-700' : 'text-blue-700'}`}>
                {periodPreview} — <strong>{numDays} dias corridos</strong>
                {numDays >= 30 && <span className="ml-2 text-green-700">✓ Férias completas (CLT)</span>}
                {numDays < 30 && numDays > 0 && <span className="ml-2 text-amber-600">⚠️ Férias parciais</span>}
              </p>
            </div>
          )}

          {/* Alerta de data inválida */}
          {endBeforeStart && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-700">A data fim não pode ser anterior à data início</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</label>
              <select value={vacStatus} onChange={e => setVacStatus(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">
                <option value="SCHEDULED">Agendado</option>
                <option value="ACTIVE">Em férias</option>
                <option value="COMPLETED">Concluído</option>
                <option value="CANCELLED">Cancelado</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Observações</label>
              <input type="text" value={observations} onChange={e => setObservations(e.target.value)}
                placeholder="Opcional..." className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowAdd(false); resetForm() }}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100">
              Cancelar
            </button>
            <button onClick={save} disabled={saving || !canSave}
              className="px-3 py-1.5 text-sm bg-[#F5A623] text-white rounded-lg hover:bg-[#d4891a] disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Agendar férias
            </button>
          </div>
        </div>
      )}

      {employee.vacations.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">Nenhuma férias registrada</div>
      ) : (
        <div className="space-y-2">
          {employee.vacations.map(v => (
            <div key={v.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {new Date(v.startDate).toLocaleDateString('pt-BR')} a {new Date(v.endDate).toLocaleDateString('pt-BR')}
                  <span className="text-gray-400 text-xs ml-2">({v.days} dias)</span>
                </p>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  v.status === 'ACTIVE'    ? 'bg-green-100 text-green-700'
                  : v.status === 'COMPLETED' ? 'bg-gray-100 text-gray-500'
                  : v.status === 'CANCELLED' ? 'bg-red-100 text-red-600'
                  : 'bg-blue-100 text-blue-700'
                }`}>
                  {VAC_STATUS_LABELS[v.status] ?? v.status}
                </span>
              </div>
              <button onClick={() => remove(v.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Subcomp: EPIs ────────────────────────────────────────────────────────────

function EpiDeliveriesPanel({
  deliveries,
  employeeName,
}: {
  deliveries:   EpiDelivery[]
  employeeName: string
}) {
  const [lightbox,  setLightbox]  = useState<string | null>(null)
  const [cautela,   setCautela]   = useState<string | null>(null)

  const openCautela = (deliveryId: string) => {
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    const tok = localStorage.getItem('token') ?? ''
    const cid = localStorage.getItem('companyId') ?? ''
    const url = `${API}/api/v1/deposit/epi-deliveries/${deliveryId}/cautela?token=${encodeURIComponent(tok)}&companyId=${encodeURIComponent(cid)}`
    window.open(url, '_blank')
  }

  if (deliveries.length === 0) {
    return (
      <div className="p-5">
        <div className="text-center py-12 space-y-2">
          <ShieldCheck size={32} className="text-gray-200 mx-auto" />
          <p className="text-sm text-gray-500">Nenhum EPI entregue a este colaborador</p>
          <p className="text-xs text-gray-400">Acesse o módulo Depósito → EPIs para registrar entregas</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          EPIs entregues — {deliveries.length} registro{deliveries.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="space-y-3">
        {deliveries.map(d => (
          <div key={d.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-start gap-3 p-4">
              {/* Selfie thumbnail */}
              {d.selfieUrl ? (
                <button
                  onClick={() => setLightbox(d.selfieUrl!)}
                  className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 border border-gray-100 hover:ring-2 hover:ring-[#F5A623]/40 transition group"
                >
                  <img
                    src={d.selfieUrl.startsWith('http') ? d.selfieUrl : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/${d.selfieUrl}`}
                    alt="Selfie"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition">
                    <ZoomIn size={14} className="text-white opacity-0 group-hover:opacity-100 transition" />
                  </div>
                </button>
              ) : (
                <div className="w-14 h-14 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck size={20} className="text-green-400" />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-800">{d.epiName}</p>
                  {d.epiCode && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md font-mono">{d.epiCode}</span>}
                  {d.returnedAt
                    ? <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Devolvido</span>
                    : <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium">Em uso</span>
                  }
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-gray-400">
                  <span>Qtd: <strong className="text-gray-600">{d.quantity}</strong></span>
                  {d.size && <span>Tamanho: <strong className="text-gray-600">{d.size}</strong></span>}
                  <span>Entregue: <strong className="text-gray-600">{fmtDate(d.deliveredAt)}</strong></span>
                  {d.expiresAt && <span className={`${new Date(d.expiresAt) < new Date() ? 'text-red-500' : ''}`}>Validade: <strong>{fmtDate(d.expiresAt)}</strong></span>}
                  {d.returnedAt && <span>Devolvido: <strong className="text-gray-600">{fmtDate(d.returnedAt)}</strong></span>}
                </div>

                {d.notes && <p className="mt-1.5 text-xs text-gray-500 italic">{d.notes}</p>}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                {d.employeeSignature && (
                  <button
                    onClick={() => setLightbox(d.employeeSignature!)}
                    className="text-[10px] text-gray-400 hover:text-[#F5A623] flex items-center gap-1 transition"
                    title="Ver assinatura"
                  >
                    <PenTool size={11} /> Assinatura
                  </button>
                )}
                <button
                  onClick={() => openCautela(d.id)}
                  className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-1 transition"
                  title="Ver cautela"
                >
                  <FileOutput size={11} /> Cautela
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.9)' }}
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white transition"
            onClick={() => setLightbox(null)}
          >
            <X size={24} />
          </button>
          <img
            src={lightbox.startsWith('http') ? lightbox : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/${lightbox}`}
            alt="Imagem em tamanho completo"
            className="max-w-full max-h-[90dvh] rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

// ─── Subcomp: Histórico de obras ──────────────────────────────────────────────

function HistoryPanel({ employeeId }: { employeeId: string }) {
  const [history,  setHistory]  = useState<ProjectHistory[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`${API}/api/v1/employees/${employeeId}/history`, { headers: getHeaders() })
      .then(r => r.json())
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [employeeId])

  if (loading) {
    return (
      <div className="p-5 flex items-center justify-center py-10">
        <Loader2 size={20} className="animate-spin text-[#F5A623]" />
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="p-5 text-center py-10 space-y-2">
        <History size={28} className="text-gray-200 mx-auto" />
        <p className="text-sm text-gray-400">Nenhuma transferência registrada</p>
        <p className="text-xs text-gray-400">O histórico é criado automaticamente ao transferir o colaborador</p>
      </div>
    )
  }

  return (
    <div className="p-5">
      <p className="text-sm font-semibold text-gray-700 mb-4">Histórico de alocações ({history.length})</p>
      <div className="relative">
        {/* Linha vertical */}
        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-200" />
        <div className="space-y-4">
          {history.map((entry, idx) => {
            const label   = entry.locationName || entry.project?.name || entry.locationId || 'Local não definido'
            const durDays = diffDays(entry.startDate, entry.endDate ?? undefined)
            const current = !entry.endDate
            return (
              <div key={entry.id} className="flex gap-4 relative">
                {/* Círculo */}
                <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 mt-0.5 z-10 ${
                  current ? 'bg-[#F5A623] border-[#F5A623]' : 'bg-white border-gray-300'
                }`} />
                <div className="flex-1 pb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-800">{label}</p>
                    {current && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-orange-100 text-[#F5A623]">
                        Atual
                      </span>
                    )}
                    {entry.project && (
                      <Link href={`/app/centro-de-custo/${entry.project.id}`}
                        className="text-[10px] text-[#F5A623] hover:underline">
                        Ver obra
                      </Link>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(entry.startDate).toLocaleDateString('pt-BR')}
                    {' → '}
                    {entry.endDate ? new Date(entry.endDate).toLocaleDateString('pt-BR') : 'hoje'}
                    {durDays > 0 && <span className="ml-1 text-gray-400">({durDays} dias)</span>}
                  </p>
                  {entry.reason && (
                    <p className="text-xs text-gray-400 mt-0.5">Motivo: {entry.reason}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Subcomp: Financeiro / NFs ────────────────────────────────────────────────

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function FinancialPanel({
  employee, onOpenEdit,
}: {
  employee: Employee
  onOpenEdit: () => void
}) {
  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    if (!employee.supplierId) return
    setLoading(true); setError('')
    fetch(`${API}/api/v1/employees/${employee.id}/financial-summary`, { headers: getHeaders() })
      .then(r => r.json())
      .then(setData)
      .catch(() => setError('Erro ao carregar dados financeiros'))
      .finally(() => setLoading(false))
  }, [employee.id, employee.supplierId])

  if (!employee.supplierId) {
    return (
      <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <DollarSign size={28} className="text-gray-300" />
        </div>
        <p className="text-sm font-semibold text-gray-700 mb-1">Nenhum fornecedor vinculado</p>
        <p className="text-xs text-gray-400 mb-4 max-w-xs">
          Vincule um fornecedor para rastrear pagamentos e NFs deste colaborador
        </p>
        <button
          onClick={onOpenEdit}
          className="px-5 py-2 bg-[#F5A623] text-white text-sm font-semibold rounded-xl hover:bg-[#d4891a] transition-colors"
        >
          Vincular fornecedor
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-14">
        <Loader2 size={22} className="animate-spin text-[#F5A623]" />
      </div>
    )
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>
  }

  if (!data?.hasSupplier) {
    return <div className="p-6 text-sm text-gray-400">Sem dados financeiros.</div>
  }

  const { supplier, summary, porObra, porMes, ultimosLancamentos } = data

  return (
    <div className="p-5 space-y-5">
      {/* Link para o fornecedor */}
      <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center font-bold text-sm text-amber-800 flex-shrink-0">
          {supplier.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-800 truncate">{supplier.name}</div>
          <div className="text-xs text-gray-500">
            {supplier.cpfCnpj || supplier.cnpj || '—'}
          </div>
        </div>
        <Link
          href={`/app/financeiro/fornecedores/${employee.supplierId}`}
          className="text-xs text-[#F5A623] font-medium flex items-center gap-1 flex-shrink-0 hover:underline"
        >
          Ver cadastro <ExternalLink size={11} />
        </Link>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total pago',       value: fmtCurrency(summary.totalPago) },
          { label: 'Total de NFs',     value: String(summary.totalNFs) },
          { label: 'Ticket médio',     value: fmtCurrency(summary.ticketMedio) },
          {
            label: 'Último pagamento',
            value: summary.ultimoLancamento
              ? new Date(summary.ultimoLancamento).toLocaleDateString('pt-BR')
              : '—',
          },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-50 border border-gray-200 rounded-xl p-3.5">
            <div className="text-xs text-gray-500 mb-1">{label}</div>
            <div className="text-lg font-bold text-gray-800">{value}</div>
          </div>
        ))}
      </div>

      {/* Gastos por obra */}
      {porObra?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Pagamentos por obra</h4>
          <div className="space-y-2">
            {porObra.map((obra: any) => (
              <div key={obra.projectId || 'sem'} className="flex items-center gap-3">
                <span className="flex-1 text-sm text-gray-700 truncate min-w-0">{obra.name}</span>
                <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                  <div
                    className="h-full bg-[#F5A623] rounded-full"
                    style={{ width: `${summary.totalPago > 0 ? (obra.total / summary.totalPago) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-800 w-28 text-right flex-shrink-0">
                  {fmtCurrency(obra.total)}
                </span>
                <span className="text-xs text-gray-400 w-10 flex-shrink-0">
                  {obra.count}NF{obra.count > 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Últimos lançamentos */}
      {ultimosLancamentos?.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-700">Últimos pagamentos</h4>
            <Link
              href={`/app/financeiro/fornecedores/${employee.supplierId}`}
              className="text-xs text-[#F5A623] hover:underline"
            >
              Ver todos →
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {ultimosLancamentos.map((t: any) => (
              <div key={t.id} className="flex items-center gap-3 py-2.5">
                <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                  <DollarSign size={14} className="text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{t.description}</div>
                  <div className="text-xs text-gray-400">
                    {t.project?.name || 'Sem obra'}
                    {t.paymentDate && ` · ${new Date(t.paymentDate).toLocaleDateString('pt-BR')}`}
                  </div>
                </div>
                <div className="text-sm font-semibold text-red-600 flex-shrink-0">
                  {fmtCurrency(t.netValue ?? t.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
