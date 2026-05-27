'use client'

import { useEffect, useState } from 'react'
import { useRouter }            from 'next/navigation'
import { Button }               from '@/components/ui/Button'
import { Input }                from '@/components/ui/Input'
import { PageHeader }           from '@/components/ui/PageHeader'
import { SemAcesso }            from '@/components/SemAcesso'
import { usePermissions }       from '@/hooks/usePermissions'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface DiarySettings {
  rainThreshold:     number
  requireClimate:    boolean
  requireActivities: boolean
  notifyOnSubmit:    boolean
  notifyOnApprove:   boolean
  notifyOnReject:    boolean
}

const DEFAULT: DiarySettings = {
  rainThreshold:     10,
  requireClimate:    false,
  requireActivities: false,
  notifyOnSubmit:    true,
  notifyOnApprove:   true,
  notifyOnReject:    true,
}

export default function DiarioConfigPage() {
  const router = useRouter()
  const { canAccessModule, can } = usePermissions()

  const [settings,  setSettings]  = useState<DiarySettings>(DEFAULT)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState(false)

  const canEdit = can('diario_obra', 'edit')

  // ── useEffect ANTES do return condicional ─────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.replace('/login'); return }
    setLoading(true)
    fetch(`${API}/api/v1/diary/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) setSettings({ ...DEFAULT, ...d.settings })
      })
      .catch(() => {/* usa defaults */})
      .finally(() => setLoading(false))
  }, [router])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const token = localStorage.getItem('token')
    if (!token) { router.replace('/login'); return }
    setSaving(true); setError(''); setSuccess(false)
    try {
      const res  = await fetch(`${API}/api/v1/diary/settings`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(settings),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar')
      setSettings({ ...DEFAULT, ...data.settings })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setSaving(false)
    }
  }

  // Return condicional APÓS todos os hooks
  if (!canAccessModule('diario_obra')) {
    return <SemAcesso modulo="Diário de Obra" />
  }

  function update<K extends keyof DiarySettings>(key: K, value: DiarySettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Configurações do Diário de Obra"
        subtitle="Gerencie as regras e notificações do módulo RDO."
        breadcrumbs={[
          { label: 'Diário de Obra', href: '/app/diario' },
          { label: 'Configurações' },
        ]}
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <form onSubmit={handleSave} className="max-w-2xl space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
          )}
          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
              ✓ Configurações salvas com sucesso!
            </div>
          )}

          {/* ── Pluviométrico ─────────────────────────────────────────────── */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-1">🌧 Pluviométrico</h2>
            <p className="text-xs text-gray-400 mb-5">
              Quando o total de chuva do dia ultrapassar o limiar, o sistema sugerirá automaticamente marcar o dia como impraticável.
            </p>

            <div className="flex items-end gap-4">
              <div className="max-w-[160px]">
                <Input
                  label="Limiar de chuva (mm)"
                  type="number"
                  min="0"
                  max="200"
                  step="0.5"
                  value={String(settings.rainThreshold)}
                  onChange={(e) => update('rainThreshold', parseFloat(e.target.value) || 0)}
                  disabled={!canEdit}
                  hint="Padrão: 10 mm"
                />
              </div>
              <div className="pb-5 text-sm text-gray-500">
                mm acumulados no dia → sugestão de dia impraticável
              </div>
            </div>
          </section>

          {/* ── Campos obrigatórios ───────────────────────────────────────── */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-1">📋 Campos obrigatórios</h2>
            <p className="text-xs text-gray-400 mb-4">
              Defina quais informações são necessárias para submeter um RDO para aprovação.
            </p>

            <div className="space-y-3">
              <ToggleRow
                label="Exigir preenchimento do clima"
                description="O relatório só pode ser enviado com ao menos um período climático informado."
                checked={settings.requireClimate}
                onChange={(v) => update('requireClimate', v)}
                disabled={!canEdit}
              />
              <ToggleRow
                label="Exigir atividades gerais"
                description="O campo 'Atividades Gerais' deve ser preenchido antes de enviar."
                checked={settings.requireActivities}
                onChange={(v) => update('requireActivities', v)}
                disabled={!canEdit}
              />
            </div>
          </section>

          {/* ── Notificações ──────────────────────────────────────────────── */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-1">🔔 Notificações</h2>
            <p className="text-xs text-gray-400 mb-4">
              Controle quais eventos disparam notificações por e-mail ou no sistema.
            </p>

            <div className="space-y-3">
              <ToggleRow
                label="Notificar aprovadores ao submeter RDO"
                description="Quando um relatório for enviado para aprovação, os gestores serão notificados."
                checked={settings.notifyOnSubmit}
                onChange={(v) => update('notifyOnSubmit', v)}
                disabled={!canEdit}
              />
              <ToggleRow
                label="Notificar autor ao aprovar RDO"
                description="O autor recebe uma notificação quando o relatório for aprovado."
                checked={settings.notifyOnApprove}
                onChange={(v) => update('notifyOnApprove', v)}
                disabled={!canEdit}
              />
              <ToggleRow
                label="Notificar autor ao devolver RDO"
                description="O autor recebe uma notificação com o motivo da devolução."
                checked={settings.notifyOnReject}
                onChange={(v) => update('notifyOnReject', v)}
                disabled={!canEdit}
              />
            </div>
          </section>

          {/* Ações */}
          {canEdit && (
            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" loading={saving}>
                Salvar configurações
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push('/app/diario')}
                disabled={saving}
              >
                Cancelar
              </Button>
            </div>
          )}

          {!canEdit && (
            <p className="text-sm text-gray-400 italic">
              Você não tem permissão para editar estas configurações.
            </p>
          )}
        </form>
      )}
    </div>
  )
}

// ─── ToggleRow ────────────────────────────────────────────────────────────────

function ToggleRow({
  label, description, checked, onChange, disabled,
}: {
  label:       string
  description: string
  checked:     boolean
  onChange:    (v: boolean) => void
  disabled?:   boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
        />
        <div className={`
          w-11 h-6 rounded-full transition-colors
          ${checked ? 'bg-[#F5A623]' : 'bg-gray-200'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}>
          <div className={`
            absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform
            ${checked ? 'translate-x-5' : 'translate-x-0'}
          `} />
        </div>
      </label>
    </div>
  )
}
