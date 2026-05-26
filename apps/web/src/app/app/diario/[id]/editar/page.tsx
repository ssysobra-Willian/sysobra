'use client'

import { useEffect, useState }    from 'react'
import { useRouter, useParams }   from 'next/navigation'
import { Button }                 from '@/components/ui/Button'
import { Input, Textarea }        from '@/components/ui/Input'
import { PageHeader }             from '@/components/ui/PageHeader'
import { SemAcesso }              from '@/components/SemAcesso'
import { usePermissions }         from '@/hooks/usePermissions'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const WEATHER_OPTIONS = [
  'Ensolarado', 'Parcialmente nublado', 'Nublado',
  'Chuvoso', 'Garoa', 'Tempestade', 'Frio', 'Quente',
]

export default function EditarDiarioPage() {
  const router  = useRouter()
  const params  = useParams()
  const entryId = params.id as string
  const userId  = typeof window !== 'undefined' ? localStorage.getItem('userId') : null

  const { canAccessModule, can, isExternal, isClient } = usePermissions()

  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [authorId, setAuthorId] = useState('')
  const [status,   setStatus]   = useState<string>('')

  // Campos
  const [date,         setDate]         = useState('')
  const [weather,      setWeather]      = useState('')
  const [temperature,  setTemperature]  = useState('')
  const [workers,      setWorkers]      = useState('')
  const [activities,   setActivities]   = useState('')
  const [observations, setObservations] = useState('')
  const [projectName,  setProjectName]  = useState('')

  if (!canAccessModule('diario_obra') || !can('diario_obra', 'edit')) {
    return <SemAcesso modulo="Diário de Obra" />
  }

  // ── Carrega dados da entrada ───────────────────────────────────────────────

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.replace('/login'); return }

    fetch(`${API}/api/v1/diary/entries/${entryId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.entry) throw new Error('Registro não encontrado')
        const e = data.entry
        setAuthorId(e.author.id)
        setStatus(e.status)
        setDate(e.date.slice(0, 10))
        setWeather(e.weather     ?? '')
        setTemperature(e.temperature !== null ? String(e.temperature) : '')
        setWorkers(e.workers     !== null ? String(e.workers) : '')
        setActivities(e.activities   ?? '')
        setObservations(e.observations ?? '')
        setProjectName(e.project.name)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [entryId, router])

  // Bloqueia edição se aprovado e não é admin
  const isOwnEntry  = authorId === userId
  const isApproved  = status === 'APPROVED'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activities.trim() && !observations.trim()) {
      setError('Informe ao menos as atividades ou observações do dia.')
      return
    }

    const token = localStorage.getItem('token')
    if (!token) { router.replace('/login'); return }

    setSaving(true)
    setError('')

    try {
      const body: Record<string, unknown> = {
        date,
        activities:   activities.trim()   || null,
        observations: observations.trim() || null,
      }

      if (!isExternal && !isClient) {
        body.weather     = weather     || null
        body.temperature = temperature ? parseFloat(temperature) : null
        body.workers     = workers     ? parseInt(workers)        : null
      }

      const res = await fetch(`${API}/api/v1/diary/entries/${entryId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar')

      router.replace(`/app/diario/${entryId}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error && !activities) {
    return (
      <div className="p-6 text-center text-red-600 text-sm">{error}</div>
    )
  }

  if (isApproved) {
    return (
      <SemAcesso
        mensagem="Este registro já foi aprovado e não pode ser editado. Entre em contato com um gestor."
      />
    )
  }

  return (
    <div>
      <PageHeader
        title="Editar registro"
        subtitle={projectName}
        breadcrumbs={[
          { label: 'Diário de Obra', href: '/app/diario' },
          ...(projectName ? [{ label: projectName, href: '/app/diario' }] : []),
          { label: 'Editar registro' },
        ]}
      />

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}

        {status === 'REJECTED' && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
            <p className="font-semibold mb-1">Registro devolvido para correção</p>
            <p>Faça as correções necessárias e salve para reenviar para aprovação.</p>
          </div>
        )}

        <Input
          label="Data do registro"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
        />

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
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
            />

            <Input
              label="Trabalhadores no local"
              type="number"
              min="0"
              value={workers}
              onChange={(e) => setWorkers(e.target.value)}
            />
          </div>
        )}

        <Textarea
          label="Atividades realizadas"
          rows={4}
          value={activities}
          onChange={(e) => setActivities(e.target.value)}
        />

        <Textarea
          label="Observações"
          rows={3}
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
        />

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" loading={saving}>
            Salvar alterações
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
            disabled={saving}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  )
}
