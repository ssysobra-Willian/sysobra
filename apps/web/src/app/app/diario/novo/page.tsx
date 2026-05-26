'use client'

import { useEffect, useState }    from 'react'
import { useRouter }               from 'next/navigation'
import { Button }                  from '@/components/ui/Button'
import { Input, Textarea }         from '@/components/ui/Input'
import { PageHeader }              from '@/components/ui/PageHeader'
import { SemAcesso }               from '@/components/SemAcesso'
import { usePermissions }          from '@/hooks/usePermissions'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Project { id: string; name: string }

// Clima mais comuns em obra
const WEATHER_OPTIONS = [
  'Ensolarado', 'Parcialmente nublado', 'Nublado',
  'Chuvoso', 'Garoa', 'Tempestade', 'Frio', 'Quente',
]

export default function NovoDiarioPage() {
  const router = useRouter()
  const { canAccessModule, can, isExternal, isClient } = usePermissions()

  const [projects, setProjects] = useState<Project[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  // Campos do formulário
  const [projectId,    setProjectId]    = useState('')
  const [date,         setDate]         = useState(() => new Date().toISOString().slice(0, 10))
  const [weather,      setWeather]      = useState('')
  const [temperature,  setTemperature]  = useState('')
  const [workers,      setWorkers]      = useState('')
  const [activities,   setActivities]   = useState('')
  const [observations, setObservations] = useState('')

  if (!canAccessModule('diario_obra') || !can('diario_obra', 'create')) {
    return <SemAcesso modulo="Diário de Obra" />
  }

  // Carrega projetos disponíveis
  useEffect(() => {
    const token     = localStorage.getItem('token')
    const companyId = localStorage.getItem('companyId')
    if (!token || !companyId) { router.replace('/login'); return }

    fetch(`${API}/api/v1/projects?companyId=${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        const ps: Project[] = d.projects ?? []
        setProjects(ps)
        if (ps.length === 1) setProjectId(ps[0].id) // auto-seleciona se só 1
      })
      .catch(() => setError('Erro ao carregar obras.'))
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!projectId) { setError('Selecione uma obra.'); return }
    if (!activities.trim() && !observations.trim()) {
      setError('Informe ao menos as atividades ou observações do dia.')
      return
    }

    const token = localStorage.getItem('token')
    if (!token) { router.replace('/login'); return }

    setLoading(true)
    setError('')

    try {
      const body: Record<string, unknown> = {
        projectId,
        date,
        activities:   activities.trim()   || null,
        observations: observations.trim() || null,
      }

      // Campos extras apenas para usuários internos
      if (!isExternal && !isClient) {
        if (weather)     body.weather     = weather
        if (temperature) body.temperature = parseFloat(temperature)
        if (workers)     body.workers     = parseInt(workers)
      }

      const res = await fetch(`${API}/api/v1/diary/entries`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao criar registro')

      router.replace(`/app/diario/${data.entry.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Novo registro"
        subtitle="Registre as atividades do dia na obra."
        breadcrumb={['Diário de Obra', 'Novo registro']}
      />

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Obra */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Obra <span className="text-red-500">*</span>
          </label>
          <select
            required
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          >
            <option value="">Selecione a obra...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Data */}
        <Input
          label="Data do registro"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
        />

        {/* Clima + temperatura + trabalhadores — apenas para internos */}
        {!isExternal && !isClient && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Clima</label>
              <select
                value={weather}
                onChange={(e) => setWeather(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                <option value="">Selecionar...</option>
                {WEATHER_OPTIONS.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>

            <Input
              label="Temperatura (°C)"
              type="number"
              step="0.1"
              min="-10"
              max="50"
              placeholder="Ex: 28.5"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
            />

            <Input
              label="Trabalhadores no local"
              type="number"
              min="0"
              placeholder="Ex: 12"
              value={workers}
              onChange={(e) => setWorkers(e.target.value)}
            />
          </div>
        )}

        {/* Atividades */}
        <Textarea
          label="Atividades realizadas"
          rows={4}
          placeholder="Descreva as atividades executadas no dia..."
          value={activities}
          onChange={(e) => setActivities(e.target.value)}
          hint="Seja específico: etapa, local e equipe envolvida."
        />

        {/* Observações */}
        <Textarea
          label="Observações"
          rows={3}
          placeholder="Ocorrências, impedimentos, decisões tomadas..."
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
        />

        {/* Ações */}
        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" loading={loading}>
            Salvar registro
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
            disabled={loading}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  )
}
