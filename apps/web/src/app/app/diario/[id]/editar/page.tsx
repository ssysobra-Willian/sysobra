'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams }              from 'next/navigation'
import { Button }                            from '@/components/ui/Button'
import { Input, Textarea }                   from '@/components/ui/Input'
import { PageHeader }                        from '@/components/ui/PageHeader'
import { SemAcesso }                         from '@/components/SemAcesso'
import { usePermissions }                    from '@/hooks/usePermissions'
import DDSThemeSelector, { getSuggestedDdsTheme, type DdsStaticTheme } from '../../components/DDSThemeSelector'
import { PhotoUpload, type PhotoItem } from '../../components/PhotoUpload'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Stage {
  id:              string
  name:            string
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

// ─── Constantes ───────────────────────────────────────────────────────────────

const WEATHER_OPTIONS = [
  { value: '',         label: 'Não informado' },
  { value: 'SUNNY',    label: '☀️ Ensolarado' },
  { value: 'CLOUDY',   label: '🌤 Nublado' },
  { value: 'OVERCAST', label: '☁️ Encoberto' },
  { value: 'RAINY',    label: '🌧 Chuvoso' },
  { value: 'STORMY',   label: '⛈ Tempestade' },
]

const OCC_TYPES = [
  { value: 'ACCIDENT',      label: 'Acidente' },
  { value: 'INCIDENT',      label: 'Incidente' },
  { value: 'VISIT',         label: 'Visita' },
  { value: 'INSPECTION',    label: 'Vistoria' },
  { value: 'STOPPAGE',      label: 'Paralisação' },
  { value: 'NONCONFORMITY', label: 'Não-conformidade' },
  { value: 'OTHER',         label: 'Outro' },
]

const SEV_OPTIONS = [
  { value: 'LOW',      label: 'Baixa' },
  { value: 'MEDIUM',   label: 'Média' },
  { value: 'HIGH',     label: 'Alta' },
  { value: 'CRITICAL', label: 'Crítica' },
]

function newOccurrence(): Occurrence {
  return { type: 'OTHER', severity: 'LOW', description: '', action: '', responsible: '', visitorName: '', visitorCompany: '', notifyManager: false }
}

/** Converte ISO date para string yyyy-MM-dd para o input type="date" */
function toDateInput(iso: string | Date | null | undefined): string {
  if (!iso) return new Date().toISOString().slice(0, 10)
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toTimeInput(iso: string | Date | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function EditarRdoPage() {
  const router  = useRouter()
  const params  = useParams()
  const entryId = params.id as string

  const { canAccessModule, can, isExternal, isClient } = usePermissions()

  // ── Estados de controle ────────────────────────────────────────────────────
  const [dataLoading, setDataLoading] = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [authorId,    setAuthorId]    = useState('')
  const [status,      setStatus]      = useState<string>('')
  const [projectId,   setProjectId]   = useState('')
  const [projectName, setProjectName] = useState('')
  const [reportNumber,setReportNumber]= useState('')
  const [stages,      setStages]      = useState<Stage[]>([])

  // ── Seção 1: Data ──────────────────────────────────────────────────────────
  const [date, setDate] = useState('')

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

  // ── Seção 4: Atividades ───────────────────────────────────────────────────
  const [generalActivities, setGeneralActivities] = useState('')

  // ── Seção 5: Ocorrências ──────────────────────────────────────────────────
  const [occurrences, setOccurrences] = useState<Occurrence[]>([])

  // ── Seção 6: DDS ──────────────────────────────────────────────────────────
  const [ddsDone,           setDdsDone]           = useState(false)
  const [ddsThemeId,        setDdsThemeId]        = useState('')
  const [ddsTheme,          setDdsTheme]          = useState('')
  const [ddsThemeCategory,  setDdsThemeCategory]  = useState('')
  const [ddsTime,           setDdsTime]           = useState('')
  const [showDdsModal,      setShowDdsModal]      = useState(false)
  const [showDdsReader,     setShowDdsReader]     = useState(false)
  const [selectedStaticDds, setSelectedStaticDds] = useState<DdsStaticTheme | null>(null)

  // ── Seção 7: Notas ────────────────────────────────────────────────────────
  const [generalNotes, setGeneralNotes] = useState('')
  const [notesPublic,  setNotesPublic]  = useState(false)

  // ── Seção 8: Fotos ────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<PhotoItem[]>([])

  // ── Carrega dados do RDO ──────────────────────────────────────────────────

  useEffect(() => {
    const token     = localStorage.getItem('token')
    const companyId = localStorage.getItem('companyId')
    if (!token) { router.replace('/login'); return }

    fetch(`${API}/api/v1/diary/entries/${entryId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(companyId ? { 'x-company-id': companyId } : {}),
      },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.entry) throw new Error('Registro não encontrado')
        const e = data.entry

        // Controle
        setAuthorId(e.author?.id ?? '')
        setStatus(e.status ?? 'DRAFT')
        setProjectId(e.project?.id ?? '')
        setProjectName(e.project?.name ?? '')
        setReportNumber(e.reportNumber ?? '')

        // Etapas do projeto
        const projectStages: Stage[] = (e.project?.stages ?? [])
          .filter((s: any) => s.status !== 'CANCELLED')
        setStages(projectStages)

        // Seção 1: Data
        setDate(toDateInput(e.date))

        // Seção 2: Clima
        setWeatherMorning(e.weatherMorning   ?? '')
        setWeatherAfternoon(e.weatherAfternoon ?? '')
        setWeatherNight(e.weatherNight     ?? '')
        setRainMorning(String(e.rainMorningMm   ?? 0))
        setRainAfternoon(String(e.rainAfternoonMm ?? 0))
        setRainNight(String(e.rainNightMm     ?? 0))
        setWorkableMorning(e.workableMorning   ?? true)
        setWorkableAfternoon(e.workableAfternoon ?? true)
        setWorkableNight(e.workableNight     ?? true)
        setUnworkableConfirmedBy(e.unworkableConfirmedBy ?? '')

        // Seção 3: StageEntries — usar progresso atual como "anterior" (ponto de partida)
        const existingStageEntries: StageEntry[] = projectStages.map((stage) => {
          const saved = (e.stageEntries ?? []).find((se: any) => se.stageId === stage.id)
          return {
            stageId:          stage.id,
            previousProgress: saved ? saved.previousProgress : stage.progressPercent,
            currentProgress:  saved ? saved.currentProgress  : stage.progressPercent,
            activities:       saved?.activities ?? '',
            comments:         saved?.comments   ?? '',
          }
        })
        setStageEntries(existingStageEntries)

        // Seção 4: Atividades gerais (legado + novo campo)
        setGeneralActivities(e.generalActivities ?? e.activities ?? '')

        // Seção 5: Ocorrências
        const savedOccs: Occurrence[] = (e.occurrences ?? []).map((o: any) => ({
          type:           o.type           ?? 'OTHER',
          severity:       o.severity       ?? 'LOW',
          description:    o.description    ?? '',
          action:         o.action         ?? '',
          responsible:    o.responsible    ?? '',
          visitorName:    o.visitorName    ?? '',
          visitorCompany: o.visitorCompany ?? '',
          notifyManager:  o.notifyManager  ?? false,
        }))
        setOccurrences(savedOccs)

        // Seção 6: DDS
        setDdsDone(e.ddsDone ?? false)
        setDdsTheme(e.ddsTheme ?? '')
        setDdsTime(toTimeInput(e.ddsTime))
        if (e.ddsTheme) {
          // Reconstrói objeto DdsStaticTheme mínimo para mostrar o tema salvo
          setSelectedStaticDds({
            id:            '',       // ID vazio = não abre modal de leitura
            title:         e.ddsTheme,
            category:      '',
            categoryLabel: '',
            icon:          '📋',
            summary:       '',
          })
        }

        // Seção 7: Notas
        setGeneralNotes(e.generalNotes ?? e.observations ?? '')
        setNotesPublic(e.notesPublic ?? false)

        // Seção 8: Fotos — mapeia imageUrls para PhotoItem[]
        const existingPhotos: PhotoItem[] = (e.imageUrls ?? []).map((url: string, i: number) => ({
          id:       `existing-${i}-${url.split('/').pop()}`,
          url,
          status:   'done' as const,
          progress: 100,
        }))
        setPhotos(existingPhotos)
      })
      .catch((err) => setError(err.message ?? 'Erro ao carregar RDO'))
      .finally(() => setDataLoading(false))
  }, [entryId, router])

  // ── Return condicional após TODOS os hooks ────────────────────────────────

  if (!canAccessModule('diario_obra') || !can('diario_obra', 'edit')) {
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

  function addOccurrence() { setOccurrences((prev) => [...prev, newOccurrence()]) }
  function removeOccurrence(idx: number) { setOccurrences((prev) => prev.filter((_, i) => i !== idx)) }
  function updateOccurrence(idx: number, field: keyof Occurrence, value: string | boolean) {
    setOccurrences((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(submitForApproval: boolean) {
    const token     = localStorage.getItem('token')
    const companyId = localStorage.getItem('companyId')
    if (!token) { router.replace('/login'); return }

    const hasPending = photos.some(p => p.status === 'uploading')
    if (hasPending) {
      setError('Aguarde o upload das fotos concluir antes de salvar.')
      return
    }

    setSaving(true); setError('')

    try {
      const imageUrls = photos.filter(p => p.status === 'done').map(p => p.url)

      const body: Record<string, unknown> = {
        date,
        status:               submitForApproval ? 'PENDING' : 'DRAFT',
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
        ddsTheme:         ddsTheme         || null,
        ddsThemeId:       ddsThemeId       || null,
        ddsThemeCategory: ddsThemeCategory || null,
        ddsTime:          ddsTime ? `${date}T${ddsTime}:00` : null,
        stageEntries: stageEntries
          .filter(se => se.activities.trim() || se.currentProgress !== se.previousProgress)
          .map(se => ({
            stageId:          se.stageId,
            previousProgress: se.previousProgress,
            currentProgress:  se.currentProgress,
            activities:       se.activities,
            comments:         se.comments || null,
          })),
        occurrences: occurrences.filter(o => o.description.trim()),
      }

      const res = await fetch(`${API}/api/v1/diary/entries/${entryId}`, {
        method:  'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${token}`,
          ...(companyId ? { 'x-company-id': companyId } : {}),
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar')

      router.replace(`/app/diario/${projectId}/${entryId}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setSaving(false)
    }
  }

  // ── Loading / Erros ───────────────────────────────────────────────────────

  if (dataLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error && !date) {
    return <div className="p-6 text-center text-red-600 text-sm">{error}</div>
  }

  if (status === 'APPROVED') {
    return (
      <SemAcesso mensagem="Este registro já foi aprovado e não pode ser editado. Entre em contato com um gestor." />
    )
  }

  const totalRain = (parseFloat(rainMorning) || 0) + (parseFloat(rainAfternoon) || 0) + (parseFloat(rainNight) || 0)
  const suggestUnworkable = totalRain >= 10
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title={`Editar ${reportNumber || 'RDO'}`}
        subtitle={projectName || 'Carregando...'}
        breadcrumbs={[
          { label: 'Diário de Obra',   href: '/app/diario' },
          { label: projectName || '...', href: `/app/diario/${projectId}` },
          { label: reportNumber || 'Editar RDO' },
        ]}
      />

      <form className="max-w-3xl space-y-8" onSubmit={(e) => e.preventDefault()}>
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
        )}

        {status === 'REJECTED' && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
            <p className="font-semibold mb-1">Registro devolvido para correção</p>
            <p>Faça as correções necessárias e salve para reenviar para aprovação.</p>
          </div>
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
                { label: 'Manhã',  weather: weatherMorning,   setWeather: setWeatherMorning,   rain: rainMorning,   setRain: setRainMorning,   workable: workableMorning,   setWorkable: setWorkableMorning   },
                { label: 'Tarde',  weather: weatherAfternoon, setWeather: setWeatherAfternoon, rain: rainAfternoon, setRain: setRainAfternoon, workable: workableAfternoon, setWorkable: setWorkableAfternoon },
                { label: 'Noite',  weather: weatherNight,     setWeather: setWeatherNight,     rain: rainNight,     setRain: setRainNight,     workable: workableNight,     setWorkable: setWorkableNight     },
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
            placeholder="Descreva as atividades realizadas durante o dia..."
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
                  <button type="button" onClick={() => removeOccurrence(idx)} className="absolute top-3 right-3 text-gray-400 hover:text-red-500 text-xs">✕ Remover</button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                      <select value={occ.type} onChange={(e) => updateOccurrence(idx, 'type', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">
                        {OCC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Severidade</label>
                      <select value={occ.severity} onChange={(e) => updateOccurrence(idx, 'severity', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">
                        {SEV_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <Textarea label="Descrição *" rows={2} required placeholder="Descreva a ocorrência..." value={occ.description} onChange={(e) => updateOccurrence(idx, 'description', e.target.value)} />
                    </div>
                    <Input label="Providência tomada" placeholder="O que foi feito?" value={occ.action} onChange={(e) => updateOccurrence(idx, 'action', e.target.value)} />
                    <Input label="Responsável" placeholder="Nome do responsável" value={occ.responsible} onChange={(e) => updateOccurrence(idx, 'responsible', e.target.value)} />
                    {occ.type === 'VISIT' && (
                      <>
                        <Input label="Nome do visitante" value={occ.visitorName} onChange={(e) => updateOccurrence(idx, 'visitorName', e.target.value)} />
                        <Input label="Empresa do visitante" value={occ.visitorCompany} onChange={(e) => updateOccurrence(idx, 'visitorCompany', e.target.value)} />
                      </>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={occ.notifyManager} onChange={(e) => updateOccurrence(idx, 'notifyManager', e.target.checked)} className="w-4 h-4 accent-[#F5A623]" />
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
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={ddsDone} onChange={(e) => setDdsDone(e.target.checked)} className="w-5 h-5 accent-[#F5A623] rounded" />
              <span className="text-sm font-medium text-gray-700">DDS realizado hoje</span>
            </label>
            {ddsDone && (
              <input type="time" value={ddsTime} onChange={(e) => setDdsTime(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white max-w-[140px]" />
            )}
          </div>

          {selectedStaticDds ? (
            <div className="border border-orange-200 rounded-xl overflow-hidden">
              <div className="flex items-start gap-3 p-4 bg-orange-50">
                <span className="text-2xl flex-shrink-0">{selectedStaticDds.icon ?? '📋'}</span>
                <div className="flex-1 min-w-0">
                  {selectedStaticDds.categoryLabel && (
                    <p className="text-[10px] font-semibold text-orange-500 uppercase tracking-wider">{selectedStaticDds.categoryLabel}</p>
                  )}
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{selectedStaticDds.title}</p>
                  {ddsDone && <p className="text-xs text-green-600 font-medium mt-0.5">✓ DDS realizado{ddsTime ? ` às ${ddsTime}` : ''}</p>}
                </div>
              </div>
              <div className="flex border-t border-orange-100 divide-x divide-orange-100">
                {selectedStaticDds.id && (
                  <button type="button" onClick={() => setShowDdsReader(true)} className="flex-1 py-2 text-xs font-medium text-orange-600 hover:bg-orange-50 transition-colors">
                    📖 Ver conteúdo
                  </button>
                )}
                <button type="button" onClick={() => setShowDdsModal(true)} className="flex-1 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                  🔄 Trocar tema
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowDdsModal(true)} className="w-full py-3 px-4 border-2 border-dashed border-orange-200 text-orange-500 rounded-xl hover:bg-orange-50 transition-colors text-sm font-medium flex items-center justify-center gap-2">
              <span>📋</span>
              <span>Selecionar tema do DDS</span>
            </button>
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
            <input type="checkbox" checked={notesPublic} onChange={(e) => setNotesPublic(e.target.checked)} className="w-4 h-4 accent-[#F5A623]" />
            <span className="text-xs text-gray-600">Visível para clientes e externos</span>
          </label>
        </Section>

        {/* ── Seção 8: Fotos ─────────────────────────────────────────────── */}
        <Section number={stages.length > 0 ? 8 : 7} title="Fotos">
          <PhotoUpload
            photos={photos}
            onChange={setPhotos}
            maxPhotos={20}
            diaryId={entryId}
            token={token}
          />
        </Section>

        {/* ── Ações ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100">
          <Button type="button" variant="secondary" loading={saving} onClick={() => handleSubmit(false)}>
            💾 Salvar rascunho
          </Button>
          <Button type="button" loading={saving} onClick={() => handleSubmit(true)}>
            📤 Enviar para aprovação
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={saving}>
            Cancelar
          </Button>
        </div>
      </form>

      {/* ── Modal seletor de tema DDS ─────────────────────────────────── */}
      {showDdsModal && (
        <DDSThemeSelector
          suggestedId={getSuggestedDdsTheme().id}
          onSelect={(theme) => {
            setSelectedStaticDds(theme)
            setDdsTheme(theme.title)
            setDdsThemeId(theme.id)
            setDdsThemeCategory(theme.category)
            setDdsDone(true)
            setShowDdsModal(false)
          }}
          onClose={() => setShowDdsModal(false)}
        />
      )}

      {showDdsReader && selectedStaticDds?.id && (
        <DDSThemeSelector
          suggestedId={null}
          initialThemeId={selectedStaticDds.id}
          readOnly
          onSelect={() => setShowDdsReader(false)}
          onClose={() => setShowDdsReader(false)}
        />
      )}
    </div>
  )
}

// ─── Section helper ───────────────────────────────────────────────────────────

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
