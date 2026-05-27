'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams }              from 'next/navigation'
import { Button }                            from '@/components/ui/Button'
import { Input, Textarea }                   from '@/components/ui/Input'
import { PageHeader }                        from '@/components/ui/PageHeader'
import { SemAcesso }                         from '@/components/SemAcesso'
import { usePermissions }                    from '@/hooks/usePermissions'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Stage {
  id:              string
  name:            string
  code:            string | null
  progressPercent: number
  status:          string
}

interface StageEntry {
  stageId:          string
  previousProgress: number
  currentProgress:  number
  activities:       string
  comments:         string
}

interface Occurrence {
  type:           string
  severity:       string
  description:    string
  action:         string
  responsible:    string
  visitorName:    string
  visitorCompany: string
  notifyManager:  boolean
}

interface DdsTheme {
  id:       string
  title:    string
  content:  string
  category: string
  tags:     string[]
  duration: number
}

const WEATHER_OPTIONS = [
  { value: '',         label: 'Não informado' },
  { value: 'SUNNY',    label: '☀️ Ensolarado' },
  { value: 'CLOUDY',   label: '🌤 Nublado' },
  { value: 'OVERCAST', label: '☁️ Encoberto' },
  { value: 'RAINY',    label: '🌧 Chuvoso' },
  { value: 'STORMY',   label: '⛈ Tempestade' },
]

const OCC_TYPES = [
  { value: 'ACCIDENT',       label: 'Acidente' },
  { value: 'INCIDENT',       label: 'Incidente' },
  { value: 'VISIT',          label: 'Visita' },
  { value: 'INSPECTION',     label: 'Vistoria' },
  { value: 'STOPPAGE',       label: 'Paralisação' },
  { value: 'NONCONFORMITY',  label: 'Não-conformidade' },
  { value: 'OTHER',          label: 'Outro' },
]

const SEV_OPTIONS = [
  { value: 'LOW',      label: 'Baixa' },
  { value: 'MEDIUM',   label: 'Média' },
  { value: 'HIGH',     label: 'Alta' },
  { value: 'CRITICAL', label: 'Crítica' },
]

const DDS_CAT_LABELS: Record<string, string> = {
  HEIGHT_WORK:    '🏗 Altura',
  PPE:            '🦺 EPI',
  TOOLS:          '🔧 Ferramentas',
  ELECTRICAL:     '⚡ Elétrica',
  EXCAVATION:     '⛏ Escavação',
  FIRST_AID:      '🚑 Primeiros Socorros',
  GENERAL_SAFETY: '⚠️ Seg. Geral',
  FIRE:           '🔥 Incêndio',
  CHEMICAL:       '☣️ Químicos',
  LIFTING:        '🏋 Içamento',
  CONFINED_SPACE: '🕳 Espaço Confinado',
  OTHER:          '📋 Outro',
}

function newOccurrence(): Occurrence {
  return { type: 'OTHER', severity: 'LOW', description: '', action: '', responsible: '', visitorName: '', visitorCompany: '', notifyManager: false }
}

type SavedState = { reportNumber: string; reportId: string }

// ─── Componente ───────────────────────────────────────────────────────────────

export default function NovoRdoPage() {
  const router    = useRouter()
  const params    = useParams()
  const projectId = params.id as string

  const { canAccessModule, can } = usePermissions()

  // ── TODOS os hooks ANTES de qualquer return condicional ───────────────────
  const [projectName,       setProjectName]       = useState('')
  const [stages,            setStages]            = useState<Stage[]>([])
  const [loading,           setLoading]           = useState(false)
  const [error,             setError]             = useState('')
  const [saved,             setSaved]             = useState<SavedState | null>(null)
  const [complementWarning, setComplementWarning] = useState<string | null>(null)

  // ── Step atual (1, 2, 3) ─────────────────────────────────────────────────
  const [step, setStep] = useState(1)

  // ── Seção 1: Identificação ────────────────────────────────────────────────
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))

  // ── Seção 2: Clima ────────────────────────────────────────────────────────
  const [weatherMorning,    setWeatherMorning]    = useState('')
  const [weatherAfternoon,  setWeatherAfternoon]  = useState('')
  const [weatherNight,      setWeatherNight]      = useState('')
  const [rainMorning,       setRainMorning]       = useState('0')
  const [rainAfternoon,     setRainAfternoon]     = useState('0')
  const [rainNight,         setRainNight]         = useState('0')
  const [workableMorning,   setWorkableMorning]   = useState(true)
  const [workableAfternoon, setWorkableAfternoon] = useState(true)
  const [workableNight,     setWorkableNight]     = useState(true)
  const [unworkableConfirmedBy, setUnworkableConfirmedBy] = useState('')

  // ── Seção 3: Etapas ───────────────────────────────────────────────────────
  const [stageEntries, setStageEntries] = useState<StageEntry[]>([])

  // ── Seção 4: Atividades gerais ────────────────────────────────────────────
  const [generalActivities, setGeneralActivities] = useState('')

  // ── Seção 5: Ocorrências ──────────────────────────────────────────────────
  const [occurrences, setOccurrences] = useState<Occurrence[]>([])

  // ── Seção 6: DDS ──────────────────────────────────────────────────────────
  const [ddsDone,     setDdsDone]     = useState(false)
  const [ddsThemeId,  setDdsThemeId]  = useState('')
  const [ddsTheme,    setDdsTheme]    = useState('')
  const [ddsTime,     setDdsTime]     = useState('')
  const [ddsThemes,   setDdsThemes]   = useState<DdsTheme[]>([])
  const [ddsSearch,   setDdsSearch]   = useState('')
  const [showDdsPicker, setShowDdsPicker] = useState(false)

  // ── Seção 7: Observações gerais ───────────────────────────────────────────
  const [generalNotes, setGeneralNotes] = useState('')
  const [notesPublic,  setNotesPublic]  = useState(false)

  // ── Seção 8: Fotos ────────────────────────────────────────────────────────
  const [imageUrlsRaw, setImageUrlsRaw] = useState('')

  // ── Carrega etapas do projeto e DDS ──────────────────────────────────────
  useEffect(() => {
    const token     = localStorage.getItem('token')
    const companyId = localStorage.getItem('companyId')
    if (!token) { router.replace('/login'); return }

    fetch(`${API}/api/v1/projects/${projectId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(companyId ? { 'x-company-id': companyId } : {}),
      },
    })
      .then((r) => r.json())
      .then((d) => {
        const proj = d.project ?? d
        setProjectName(proj?.name ?? '')
        const ss: Stage[] = (proj?.stages ?? []).filter((s: any) => s.status !== 'CANCELLED')
        setStages(ss)
        setStageEntries(ss.map((s) => ({
          stageId:          s.id,
          previousProgress: s.progressPercent,
          currentProgress:  s.progressPercent,
          activities:       '',
          comments:         '',
        })))
      })
      .catch(() => {})

    fetch(`${API}/api/v1/diary/dds`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(companyId ? { 'x-company-id': companyId } : {}),
      },
    })
      .then((r) => r.json())
      .then((d) => setDdsThemes(d.themes ?? []))
      .catch(() => {})
  }, [projectId, router])

  // ── Verifica duplicata de data ao mudar a data ────────────────────────────
  const checkDuplicate = useCallback(async (selectedDate: string) => {
    const token     = localStorage.getItem('token')
    const companyId = localStorage.getItem('companyId')
    if (!token) return
    try {
      const res  = await fetch(`${API}/api/v1/diary/projects/${projectId}/reports?startDate=${selectedDate}&endDate=${selectedDate}&limit=1`, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(companyId ? { 'x-company-id': companyId } : {}),
        },
      })
      const data = await res.json()
      const existing = data.entries ?? []
      const mains = existing.filter((e: any) => !e.isComplement)
      if (mains.length > 0) {
        const num = mains[0].reportNumber ?? 'RDO'
        setComplementWarning(`Já existe ${num} para ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR')}. Este será criado como complemento (ex: ${num}-A).`)
      } else {
        setComplementWarning(null)
      }
    } catch {
      setComplementWarning(null)
    }
  }, [projectId])

  useEffect(() => {
    if (date) checkDuplicate(date)
  }, [date, checkDuplicate])

  // ── Return condicional DEPOIS de todos os hooks ───────────────────────────
  if (!canAccessModule('diario_obra') || !can('diario_obra', 'create')) {
    return <SemAcesso modulo="Diário de Obra" />
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function updateStageEntry(idx: number, field: keyof StageEntry, value: string | number) {
    setStageEntries((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  function addOccurrence() {
    setOccurrences((prev) => [...prev, newOccurrence()])
  }

  function removeOccurrence(idx: number) {
    setOccurrences((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateOccurrence(idx: number, field: keyof Occurrence, value: string | boolean) {
    setOccurrences((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  function selectDds(theme: DdsTheme) {
    setDdsThemeId(theme.id)
    setDdsTheme(theme.title)
    setShowDdsPicker(false)
    setDdsDone(true)
  }

  // ── Enviar ────────────────────────────────────────────────────────────────

  async function handleSubmit(submitForApproval: boolean) {
    const token     = localStorage.getItem('token')
    const companyId = localStorage.getItem('companyId')
    if (!token) { router.replace('/login'); return }

    setLoading(true); setError('')

    try {
      const imageUrls = imageUrlsRaw
        .split('\n')
        .map((u) => u.trim())
        .filter(Boolean)

      const body: Record<string, unknown> = {
        projectId,
        date,
        status: submitForApproval ? 'PENDING' : 'DRAFT',
        weatherMorning:       weatherMorning   || null,
        weatherAfternoon:     weatherAfternoon || null,
        weatherNight:         weatherNight     || null,
        rainMorningMm:        parseFloat(rainMorning)   || 0,
        rainAfternoonMm:      parseFloat(rainAfternoon) || 0,
        rainNightMm:          parseFloat(rainNight)     || 0,
        workableMorning,
        workableAfternoon,
        workableNight,
        unworkableConfirmedBy: unworkableConfirmedBy || null,
        generalActivities: generalActivities || null,
        generalNotes:      generalNotes      || null,
        notesPublic,
        imageUrls,
        ddsDone,
        ddsTheme:  ddsTheme  || null,
        ddsThemeId: ddsThemeId || null,
        ddsTime:   ddsTime   ? `${date}T${ddsTime}:00` : null,
        stageEntries: stageEntries
          .filter((se) => se.activities.trim() || se.currentProgress !== se.previousProgress)
          .map((se) => ({
            stageId:          se.stageId,
            previousProgress: se.previousProgress,
            currentProgress:  se.currentProgress,
            activities:       se.activities,
            comments:         se.comments || null,
          })),
        occurrences: occurrences.filter((o) => o.description.trim()),
      }

      const res = await fetch(`${API}/api/v1/diary/reports`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${token}`,
          ...(companyId ? { 'x-company-id': companyId } : {}),
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao criar relatório')

      setSaved({ reportNumber: data.entry.reportNumber ?? 'RDO', reportId: data.entry.id })
      setStep(3)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  const totalRain = (parseFloat(rainMorning) || 0) + (parseFloat(rainAfternoon) || 0) + (parseFloat(rainNight) || 0)
  const suggestUnworkable = totalRain >= 10

  const filteredDds = ddsThemes.filter((t) =>
    !ddsSearch || t.title.toLowerCase().includes(ddsSearch.toLowerCase()) ||
    (DDS_CAT_LABELS[t.category] ?? '').toLowerCase().includes(ddsSearch.toLowerCase())
  )

  // ─── Step 3 — Confirmação após salvar ────────────────────────────────────
  if (step === 3 && saved) {
    return (
      <div className="max-w-lg mx-auto mt-12 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">
          {saved.reportNumber} criado com sucesso!
        </h1>
        <p className="text-sm text-gray-500 mb-8">{projectName}</p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.push(`/app/diario/${projectId}/${saved.reportId}`)}
            className="w-full py-3 px-4 bg-[#F5A623] text-white font-semibold rounded-xl hover:bg-[#d4891a] transition-colors"
          >
            Ver RDO criado
          </button>
          <button
            onClick={() => {
              setSaved(null)
              setStep(1)
              setDate(new Date().toISOString().slice(0, 10))
              setGeneralActivities('')
              setGeneralNotes('')
              setOccurrences([])
              setDdsDone(false)
              setDdsTheme('')
              setDdsThemeId('')
            }}
            className="w-full py-3 px-4 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            Criar outro RDO
          </button>
          <button
            onClick={() => router.push('/app/diario')}
            className="w-full py-3 px-4 text-gray-400 text-sm hover:text-gray-600 transition-colors"
          >
            Voltar para obras
          </button>
        </div>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Novo Relatório Diário de Obra"
        subtitle={projectName || 'Carregando...'}
        breadcrumbs={[
          { label: 'Diário de Obra',   href: '/app/diario' },
          { label: projectName || '...', href: `/app/diario/${projectId}` },
          { label: 'Novo RDO' },
        ]}
      />

      <form className="max-w-3xl space-y-8" onSubmit={(e) => e.preventDefault()}>
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
        )}

        {/* ── Seção 1: Identificação ─────────────────────────────────────── */}
        <Section number={1} title="Identificação">
          <div className="max-w-xs">
            <Input
              label="Data do relatório"
              type="date"
              required
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {complementWarning && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 flex items-start gap-2">
              <span className="text-lg">ℹ️</span>
              <span>{complementWarning}</span>
            </div>
          )}
        </Section>

        {/* ── Seção 2: Condições climáticas ──────────────────────────────── */}
        <Section number={2} title="Condições Climáticas">
          {suggestUnworkable && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
              ⚠️ Chuva acumulada <strong>{totalRain.toFixed(0)} mm</strong> — sistema sugere marcar o dia como <strong>impraticável</strong>.
            </div>
          )}

          <div className="space-y-4">
            {(
              [
                { label: 'Manhã',    weather: weatherMorning,   setWeather: setWeatherMorning,   rain: rainMorning,   setRain: setRainMorning,   workable: workableMorning,   setWorkable: setWorkableMorning   },
                { label: 'Tarde',    weather: weatherAfternoon, setWeather: setWeatherAfternoon, rain: rainAfternoon, setRain: setRainAfternoon, workable: workableAfternoon, setWorkable: setWorkableAfternoon },
                { label: 'Noite',    weather: weatherNight,     setWeather: setWeatherNight,     rain: rainNight,     setRain: setRainNight,     workable: workableNight,     setWorkable: setWorkableNight     },
              ] as const
            ).map((period) => (
              <div key={period.label} className="border border-gray-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">{period.label}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Condição climática</label>
                    <select
                      value={period.weather}
                      onChange={(e) => period.setWeather(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                    >
                      {WEATHER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Chuva (mm)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={period.rain}
                      onChange={(e) => period.setRain(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={period.workable}
                      onChange={(e) => period.setWorkable(e.target.checked)}
                      className="w-4 h-4 accent-[#F5A623] rounded"
                    />
                    <span className="text-sm text-gray-700">Praticável</span>
                  </label>
                </div>
              </div>
            ))}
          </div>

          {(!workableMorning || !workableAfternoon || !workableNight) && (
            <div className="mt-3">
              <Input
                label="Confirmado por (responsável que atestou impraticabilidade)"
                placeholder="Nome do responsável..."
                value={unworkableConfirmedBy}
                onChange={(e) => setUnworkableConfirmedBy(e.target.value)}
              />
            </div>
          )}

          <div className="mt-3 text-xs text-gray-400">
            Total do dia: <strong className="text-gray-600">{totalRain.toFixed(1)} mm</strong>
          </div>
        </Section>

        {/* ── Seção 3: Progresso por etapa ───────────────────────────────── */}
        {stages.length > 0 && (
          <Section number={3} title="Progresso por Etapa">
            <div className="space-y-4">
              {stageEntries.map((se, idx) => {
                const stage = stages.find((s) => s.id === se.stageId)
                if (!stage) return null
                return (
                  <div key={se.stageId} className="border border-gray-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-gray-700 mb-3">{stage.name}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Anterior: <span className="text-gray-400">{se.previousProgress.toFixed(0)}%</span>
                          {' → '}
                          <span className="text-gray-700 font-semibold">{se.currentProgress.toFixed(0)}%</span>
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={se.currentProgress}
                            onChange={(e) => updateStageEntry(idx, 'currentProgress', parseFloat(e.target.value))}
                            className="flex-1 accent-[#F5A623]"
                          />
                          <span className="text-sm font-bold text-gray-800 w-12 text-right">
                            {se.currentProgress.toFixed(0)}%
                          </span>
                        </div>
                        {se.currentProgress !== se.previousProgress && (
                          <p className={`text-xs mt-1 font-medium ${se.currentProgress > se.previousProgress ? 'text-green-600' : 'text-red-500'}`}>
                            {se.currentProgress > se.previousProgress ? '+' : ''}
                            {(se.currentProgress - se.previousProgress).toFixed(1)}% neste RDO
                          </p>
                        )}
                      </div>
                      <Textarea
                        label="Atividades realizadas nesta etapa"
                        rows={2}
                        placeholder="Descreva o que foi feito..."
                        value={se.activities}
                        onChange={(e) => updateStageEntry(idx, 'activities', e.target.value)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* ── Seção 4: Atividades gerais ─────────────────────────────────── */}
        <Section number={stages.length > 0 ? 4 : 3} title="Atividades Gerais">
          <Textarea
            label="Atividades executadas no dia"
            rows={4}
            placeholder="Descreva as atividades realizadas durante o dia (equipes, serviços, áreas)..."
            value={generalActivities}
            onChange={(e) => setGeneralActivities(e.target.value)}
          />
        </Section>

        {/* ── Seção 5: Ocorrências ───────────────────────────────────────── */}
        <Section number={stages.length > 0 ? 5 : 4} title="Ocorrências">
          {occurrences.length === 0 ? (
            <p className="text-sm text-gray-400 mb-3">Nenhuma ocorrência adicionada.</p>
          ) : (
            <div className="space-y-4 mb-4">
              {occurrences.map((occ, idx) => (
                <div key={idx} className="border border-gray-200 rounded-xl p-4 relative">
                  <button
                    type="button"
                    onClick={() => removeOccurrence(idx)}
                    className="absolute top-3 right-3 text-gray-400 hover:text-red-500 text-xs"
                  >
                    ✕ Remover
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                      <select
                        value={occ.type}
                        onChange={(e) => updateOccurrence(idx, 'type', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                      >
                        {OCC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Severidade</label>
                      <select
                        value={occ.severity}
                        onChange={(e) => updateOccurrence(idx, 'severity', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                      >
                        {SEV_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <Textarea
                        label="Descrição *"
                        rows={2}
                        required
                        placeholder="Descreva a ocorrência..."
                        value={occ.description}
                        onChange={(e) => updateOccurrence(idx, 'description', e.target.value)}
                      />
                    </div>
                    <Input
                      label="Providência tomada"
                      placeholder="O que foi feito?"
                      value={occ.action}
                      onChange={(e) => updateOccurrence(idx, 'action', e.target.value)}
                    />
                    <Input
                      label="Responsável"
                      placeholder="Nome do responsável"
                      value={occ.responsible}
                      onChange={(e) => updateOccurrence(idx, 'responsible', e.target.value)}
                    />
                    {occ.type === 'VISIT' && (
                      <>
                        <Input
                          label="Nome do visitante"
                          value={occ.visitorName}
                          onChange={(e) => updateOccurrence(idx, 'visitorName', e.target.value)}
                        />
                        <Input
                          label="Empresa do visitante"
                          value={occ.visitorCompany}
                          onChange={(e) => updateOccurrence(idx, 'visitorCompany', e.target.value)}
                        />
                      </>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={occ.notifyManager}
                        onChange={(e) => updateOccurrence(idx, 'notifyManager', e.target.checked)}
                        className="w-4 h-4 accent-[#F5A623]"
                      />
                      <span className="text-sm text-gray-700">Notificar gestor</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={addOccurrence}>
            + Adicionar ocorrência
          </Button>
        </Section>

        {/* ── Seção 6: DDS ──────────────────────────────────────────────── */}
        <Section number={stages.length > 0 ? 6 : 5} title="DDS — Diálogo Diário de Segurança">
          <div className="flex flex-wrap items-center gap-4 mb-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ddsDone}
                onChange={(e) => setDdsDone(e.target.checked)}
                className="w-5 h-5 accent-[#F5A623] rounded"
              />
              <span className="text-sm font-medium text-gray-700">DDS realizado hoje</span>
            </label>
            {ddsDone && (
              <input
                type="time"
                value={ddsTime}
                onChange={(e) => setDdsTime(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white max-w-[140px]"
                placeholder="Horário"
              />
            )}
          </div>

          {ddsDone && (
            <div className="space-y-3">
              {/* Campo de tema + botão picker */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    label="Tema do DDS"
                    placeholder="Digite ou selecione um tema..."
                    value={ddsTheme}
                    onChange={(e) => { setDdsTheme(e.target.value); setDdsThemeId('') }}
                  />
                </div>
                {ddsThemes.length > 0 && (
                  <div className="flex items-end pb-0">
                    <button
                      type="button"
                      onClick={() => setShowDdsPicker(!showDdsPicker)}
                      className="py-2 px-3 border border-[#F5A623] text-[#F5A623] text-xs font-semibold rounded-lg hover:bg-orange-50 transition-colors whitespace-nowrap"
                    >
                      📋 Escolher tema
                    </button>
                  </div>
                )}
              </div>

              {/* Picker de temas DDS */}
              {showDdsPicker && (
                <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
                  <div className="p-3 border-b border-gray-100">
                    <input
                      type="text"
                      placeholder="Buscar tema..."
                      value={ddsSearch}
                      onChange={(e) => setDdsSearch(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                    {filteredDds.length === 0 ? (
                      <p className="p-4 text-sm text-gray-400 text-center">Nenhum tema encontrado</p>
                    ) : (
                      filteredDds.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => selectDds(t)}
                          className={`w-full text-left px-4 py-3 hover:bg-orange-50 transition-colors ${ddsThemeId === t.id ? 'bg-orange-50 border-l-2 border-[#F5A623]' : ''}`}
                        >
                          <p className="text-sm font-medium text-gray-800">{t.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-gray-400">{DDS_CAT_LABELS[t.category] ?? t.category}</span>
                            <span className="text-[10px] text-gray-400">{t.duration} min</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Preview do tema selecionado */}
              {ddsThemeId && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
                  ✓ Tema selecionado da biblioteca DDS
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ── Seção 7: Observações gerais ────────────────────────────────── */}
        <Section number={stages.length > 0 ? 7 : 6} title="Observações Gerais">
          <Textarea
            label="Observações e anotações gerais"
            rows={3}
            placeholder="Ocorrências gerais, decisões tomadas, pendências, informações importantes..."
            value={generalNotes}
            onChange={(e) => setGeneralNotes(e.target.value)}
          />
          <label className="flex items-center gap-2 cursor-pointer mt-2">
            <input
              type="checkbox"
              checked={notesPublic}
              onChange={(e) => setNotesPublic(e.target.checked)}
              className="w-4 h-4 accent-[#F5A623]"
            />
            <span className="text-xs text-gray-600">Visível para clientes e externos</span>
          </label>
        </Section>

        {/* ── Seção 8: Fotos ─────────────────────────────────────────────── */}
        <Section number={stages.length > 0 ? 8 : 7} title="Fotos">
          <Textarea
            label="URLs das fotos (uma por linha)"
            rows={3}
            placeholder="https://storage.example.com/foto1.jpg"
            value={imageUrlsRaw}
            onChange={(e) => setImageUrlsRaw(e.target.value)}
            hint="Cole os endereços das fotos já enviadas para o armazenamento."
          />
        </Section>

        {/* ── Ações ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100">
          <Button
            type="button"
            variant="secondary"
            loading={loading}
            onClick={() => handleSubmit(false)}
          >
            💾 Salvar rascunho
          </Button>
          <Button
            type="button"
            loading={loading}
            onClick={() => handleSubmit(true)}
          >
            📤 Enviar para aprovação
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push(`/app/diario/${projectId}`)}
            disabled={loading}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  )
}

// ─── Seção helper ─────────────────────────────────────────────────────────────

function Section({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-5">
        <span className="w-7 h-7 rounded-full bg-[#F5A623] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
          {number}
        </span>
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      </div>
      {children}
    </div>
  )
}
