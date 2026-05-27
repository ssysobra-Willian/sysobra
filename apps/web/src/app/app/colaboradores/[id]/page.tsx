'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Pencil, UserX, UserMinus, Loader2,
  Upload, User, FileText, GraduationCap, Shield,
  CalendarDays, HardHat, Clock, Plus, Trash2, Download,
  CheckCircle, AlertTriangle, X, Save,
} from 'lucide-react'
import { Breadcrumb }        from '@/components/ui/Breadcrumb'
import { EmployeeFormModal } from '../components/EmployeeFormModal'
import { DismissalModal }    from '../components/DismissalModal'
import { toImageUrl }        from '@/lib/imageUrl'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Employee {
  id:             string
  code:           string
  name:           string
  cpf?:           string | null
  rg?:            string | null
  ctps?:          string | null
  pis?:           string | null
  birthDate?:     string | null
  admissionDate?: string | null
  dismissalDate?: string | null
  email?:         string | null
  phone?:         string | null
  address?:       string | null
  city?:          string | null
  state?:         string | null
  zipCode?:       string | null
  photo?:         string | null
  type:           string
  role?:          string | null
  department?:    string | null
  salary?:        number | null
  status:         string
  projectId?:     string | null
  project?:       { id: string; name: string; code: string | null } | null
  documents:      EmployeeDoc[]
  trainings:      EmployeeTraining[]
  vacations:      EmployeeVacation[]
  epiDeliveries:  EpiDelivery[]
}

interface EmployeeDoc {
  id:           string
  type:         string
  name:         string
  fileUrl?:     string | null
  issueDate?:   string | null
  expiryDate?:  string | null
  observations?: string | null
  isActive:     boolean
}

interface EmployeeTraining {
  id:             string
  name:           string
  provider?:      string | null
  workload?:      number | null
  completedAt:    string
  expiresAt?:     string | null
  certificateUrl?: string | null
  observations?:  string | null
}

interface EmployeeVacation {
  id:           string
  startDate:    string
  endDate:      string
  days:         number
  status:       string
  observations?: string | null
}

interface EpiDelivery {
  id:          string
  epiName:     string
  epiCode?:    string | null
  quantity:    number
  deliveredAt: string
  returnedAt?: string | null
  condition?:  string | null
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

const TYPE_LABELS: Record<string, string> = {
  CLT: 'CLT', PJ: 'PJ', TEMPORARY: 'Temporário', INTERN: 'Estagiário', THIRD_PARTY: 'Terceirizado',
}
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700', AWAY: 'bg-amber-100 text-amber-700', DISMISSED: 'bg-red-100 text-red-600',
}
const STATUS_LABELS: Record<string, string> = { ACTIVE: 'Ativo', AWAY: 'Afastado', DISMISSED: 'Desligado' }
const DOC_TYPES = ['RG','CPF','CTPS','ASO','NR35','NR18','CNH','HABILITACAO','CERTIFICADO','CONTRATO','OTHER']
const VAC_STATUS_LABELS: Record<string, string> = { SCHEDULED: 'Agendado', ACTIVE: 'Em férias', COMPLETED: 'Concluído', CANCELLED: 'Cancelado' }

type Tab = 'Dados pessoais' | 'Documentos' | 'Treinamentos' | 'EPIs' | 'Férias'
const TABS: Tab[] = ['Dados pessoais', 'Documentos', 'Treinamentos', 'EPIs', 'Férias']

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ColaboradorPerfilPage() {
  const { id }  = useParams() as { id: string }
  const router  = useRouter()

  const [employee,    setEmployee]    = useState<Employee | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [tab,         setTab]         = useState<Tab>('Dados pessoais')
  const [showEdit,    setShowEdit]    = useState(false)
  const [dismissing,  setDismissing]  = useState<'dismiss' | 'away' | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [projects,    setProjects]    = useState<{ id: string; name: string; code: string | null }[]>([])

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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Breadcrumb items={[
        { label: 'Dashboard',       href: '/app/dashboard' },
        { label: 'Colaboradores',   href: '/app/colaboradores' },
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
            {employee.project && (
              <div className="mt-2 flex items-center gap-1.5">
                <HardHat size={13} className="text-[#F5A623]" />
                <Link href={`/app/centro-de-custo/${employee.project.id}`}
                  className="text-sm text-[#F5A623] hover:underline font-medium">
                  {employee.project.name}
                </Link>
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
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-3.5 text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t ? 'text-[#F5A623] border-b-2 border-[#F5A623]' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* Dados pessoais */}
        {tab === 'Dados pessoais' && (
          <div className="p-5 space-y-6">
            {/* Dados pessoais */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <User size={14} className="text-[#F5A623]" /> Dados pessoais
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: 'CPF',             value: maskCpf(employee.cpf) },
                  { label: 'RG',              value: employee.rg ?? '—' },
                  { label: 'CTPS',            value: employee.ctps ?? '—' },
                  { label: 'PIS/PASEP',       value: employee.pis ?? '—' },
                  { label: 'Nascimento',      value: fmtDate(employee.birthDate) },
                  { label: 'Telefone',        value: employee.phone ?? '—' },
                  { label: 'E-mail',          value: employee.email ?? '—' },
                ].map(f => (
                  <div key={f.label}>
                    <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide mb-0.5">{f.label}</p>
                    <p className="text-sm text-gray-700 break-all">{f.value}</p>
                  </div>
                ))}
              </div>
            </section>
            <div className="border-t border-gray-100" />
            {/* Dados profissionais */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Shield size={14} className="text-[#F5A623]" /> Dados profissionais
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Tipo de contrato', value: TYPE_LABELS[employee.type] ?? employee.type },
                  { label: 'Função',            value: employee.role ?? '—' },
                  { label: 'Departamento',      value: employee.department ?? '—' },
                  { label: 'Data de admissão',  value: fmtDate(employee.admissionDate) },
                  { label: 'Data desligamento', value: fmtDate(employee.dismissalDate) },
                  { label: 'Salário / Custo',   value: employee.salary ? '••••••' : '—' },
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
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    Endereço
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {[
                      { label: 'CEP',     value: employee.zipCode ?? '—' },
                      { label: 'Endereço', value: employee.address ?? '—' },
                      { label: 'Cidade',  value: employee.city    ?? '—' },
                      { label: 'UF',      value: employee.state   ?? '—' },
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
          </div>
        )}

        {/* Documentos */}
        {tab === 'Documentos' && (
          <DocumentsPanel employee={employee} onReload={load} />
        )}

        {/* Treinamentos */}
        {tab === 'Treinamentos' && (
          <TrainingsPanel employee={employee} onReload={load} />
        )}

        {/* EPIs */}
        {tab === 'EPIs' && (
          <div className="p-5">
            {employee.epiDeliveries.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <Shield size={28} className="text-gray-200 mx-auto" />
                <p className="text-sm text-gray-500">Nenhum EPI registrado para este colaborador</p>
                <p className="text-xs text-gray-400">Gestão de EPIs disponível no módulo Depósito</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">EPIs entregues</p>
                {employee.epiDeliveries.map(e => (
                  <div key={e.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{e.epiName} {e.epiCode ? `(${e.epiCode})` : ''}</p>
                      <p className="text-xs text-gray-400">Qtd: {e.quantity} · Entregue em: {fmtDate(e.deliveredAt)}</p>
                    </div>
                    {e.returnedAt && <span className="text-xs text-green-600 font-medium">Devolvido</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Férias */}
        {tab === 'Férias' && (
          <VacationsPanel employee={employee} onReload={load} />
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
    </div>
  )
}

// ─── Subcomp: Documentos ──────────────────────────────────────────────────────

function DocumentsPanel({ employee, onReload }: { employee: Employee; onReload: () => void }) {
  const [showAdd, setShowAdd] = useState(false)
  const [form,    setForm]    = useState({ type: 'ASO', name: '', issueDate: '', expiryDate: '', fileUrl: '', observations: '' })
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const save = useCallback(async () => {
    if (!form.type || !form.name) { setError('Tipo e nome são obrigatórios'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API}/api/v1/employees/${employee.id}/documents`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, issueDate: form.issueDate || undefined, expiryDate: form.expiryDate || undefined }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setShowAdd(false); setForm({ type: 'ASO', name: '', issueDate: '', expiryDate: '', fileUrl: '', observations: '' })
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
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100">Cancelar</button>
            <button onClick={save} disabled={saving}
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
              : days <= 7  ? { text: `Vence em ${days} dias`, cls: 'bg-red-100 text-red-700' }
              : days <= 30 ? { text: `Vence em ${days} dias`, cls: 'bg-amber-100 text-amber-700' }
              : { text: 'Válido', cls: 'bg-green-100 text-green-700' }
            return (
              <div key={doc.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="text-sm font-medium text-gray-800">{doc.name}</p>
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{doc.type}</span>
                    {badge && <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.text}</span>}
                  </div>
                  <div className="flex gap-3 text-xs text-gray-400">
                    {doc.issueDate && <span>Emissão: {new Date(doc.issueDate).toLocaleDateString('pt-BR')}</span>}
                    {doc.expiryDate && <span>Vence: {new Date(doc.expiryDate).toLocaleDateString('pt-BR')}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {doc.fileUrl && (
                    <a href={toImageUrl(doc.fileUrl)} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors" title="Baixar">
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
  const [showAdd, setShowAdd] = useState(false)
  const [form,    setForm]    = useState({ name: '', provider: '', workload: '', completedAt: '', expiresAt: '', observations: '' })
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const save = useCallback(async () => {
    if (!form.name || !form.completedAt) { setError('Nome e data de conclusão são obrigatórios'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API}/api/v1/employees/${employee.id}/trainings`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, provider: form.provider || undefined,
          workload: form.workload ? parseInt(form.workload) : undefined,
          completedAt: form.completedAt, expiresAt: form.expiresAt || undefined,
          observations: form.observations || undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setShowAdd(false); setForm({ name: '', provider: '', workload: '', completedAt: '', expiresAt: '', observations: '' })
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
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100">Cancelar</button>
            <button onClick={save} disabled={saving}
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
            return (
              <div key={t.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="text-sm font-medium text-gray-800">{t.name}</p>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.text}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-gray-400 flex-wrap">
                    {t.provider && <span>{t.provider}</span>}
                    {t.workload  && <span>{t.workload}h</span>}
                    <span>Concluído: {new Date(t.completedAt).toLocaleDateString('pt-BR')}</span>
                    {t.expiresAt && <span>Vence: {new Date(t.expiresAt).toLocaleDateString('pt-BR')}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {t.certificateUrl && (
                    <a href={toImageUrl(t.certificateUrl)} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 text-gray-400 hover:text-blue-500" title="Certificado">
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

function VacationsPanel({ employee, onReload }: { employee: Employee; onReload: () => void }) {
  const [showAdd, setShowAdd] = useState(false)
  const [form,    setForm]    = useState({ startDate: '', endDate: '', days: '', observations: '' })
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const save = useCallback(async () => {
    if (!form.startDate || !form.endDate || !form.days) { setError('Datas e dias são obrigatórios'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API}/api/v1/employees/${employee.id}/vacations`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: form.startDate, endDate: form.endDate, days: parseInt(form.days), observations: form.observations || undefined }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setShowAdd(false); setForm({ startDate: '', endDate: '', days: '', observations: '' })
      onReload()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }, [form, employee.id, onReload])

  const remove = useCallback(async (vacationId: string) => {
    if (!confirm('Remover este registro de férias?')) return
    await fetch(`${API}/api/v1/employees/${employee.id}/vacations/${vacationId}`, { method: 'DELETE', headers: getHeaders() })
    onReload()
  }, [employee.id, onReload])

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Férias ({employee.vacations.length})</p>
        <button onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 text-sm text-[#F5A623] hover:underline font-medium">
          <Plus size={14} /> Agendar
        </button>
      </div>

      {showAdd && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Início *</label>
              <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Fim *</label>
              <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Dias *</label>
              <input type="number" value={form.days} onChange={e => setForm(f => ({ ...f, days: e.target.value }))}
                placeholder="30" className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100">Cancelar</button>
            <button onClick={save} disabled={saving}
              className="px-3 py-1.5 text-sm bg-[#F5A623] text-white rounded-lg hover:bg-[#d4891a] disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Salvar
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
                  v.status === 'ACTIVE' ? 'bg-green-100 text-green-700'
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
