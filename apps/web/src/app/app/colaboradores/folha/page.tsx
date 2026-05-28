'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  Loader2, Calculator, DollarSign, Users,
  AlertTriangle, CheckCircle, FileSpreadsheet,
  ArrowRight, Save, FileDown, Clock, Trash2, X, UserPlus,
} from 'lucide-react'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import {
  calcularINSS, calcularIRRF, isencaoIRRF,
  labelTabelaIRRF, labelTabelaINSS, INSS_INFO, IRRF_INFO,
} from '@/lib/payroll'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PayrollEntry {
  employeeId:          string
  name:                string
  type:                string
  role:                string | null
  projectId:           string | null
  project:             { id: string; name: string; code: string | null } | null
  supplierId?:         string | null
  supplierName?:       string | null
  salarioBase:         number
  horasExtras60:       number
  horasExtras100:      number
  valorHorasExtras60:  number
  valorHorasExtras100: number
  valorHorasExtras:    number
  salarioBruto:        number
  inss:                number
  irrfBase?:           number
  irrf:                number
  salarioLiquido:      number
  fgts:                number
  encargosPatronais:   number
  custoTotal:          number
  isClt:               boolean
}

interface ProjectSummary {
  projectId:   string | null
  projectName: string
  count:       number
  custoTotal:  number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const t = localStorage.getItem('token')     ?? ''
  const c = localStorage.getItem('companyId') ?? ''
  return { Authorization: `Bearer ${t}`, 'x-company-id': c }
}

function fmtMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Recalcula uma entrada com horas extras 60%/100% + desconto + dependentes.
 * Usa INSS 2025 (Portaria MPS 1.367/2024) e IRRF 2025/2026 (Lei 14.848/2024)
 * importados de @/lib/payroll.
 */
function calcEntry(
  base:       PayrollEntry,
  he60:       number,
  he100:      number,
  projectId:  string | null,
  desconto:   number,
  dependentes: number,
  ano:        number,
): PayrollEntry {
  const salario   = base.salarioBase
  const valorHora = salario / 220

  const valorHE60    = Math.round(he60  * valorHora * 1.60 * 100) / 100
  const valorHE100   = Math.round(he100 * valorHora * 2.00 * 100) / 100
  const valorHETotal = Math.round((valorHE60 + valorHE100) * 100) / 100
  const salarioBruto = Math.round((salario + valorHETotal) * 100) / 100

  if (base.type === 'PJ' || base.type === 'THIRD_PARTY') {
    const liquido = Math.round((salarioBruto - desconto) * 100) / 100
    return {
      ...base,
      horasExtras60: he60, horasExtras100: he100,
      valorHorasExtras60: 0, valorHorasExtras100: 0, valorHorasExtras: 0,
      salarioBruto, inss: 0, irrfBase: 0, irrf: 0,
      salarioLiquido: liquido,
      fgts: 0, encargosPatronais: 0, custoTotal: salarioBruto,
      projectId,
    }
  }

  // CLT — encargos completos
  const encTotPct     = 0.20 + 0.03 + 0.058 + 0.1111 + 0.0833
  const inss          = calcularINSS(salarioBruto)
  const irrfBase      = Math.max(0, salarioBruto - inss)
  const irrf          = calcularIRRF(irrfBase, dependentes, ano)
  const fgts          = Math.round(salarioBruto * 0.08 * 100) / 100
  const encargosPatronais = Math.round(salarioBruto * encTotPct * 100) / 100
  const custoTotal    = Math.round((salarioBruto + fgts + encargosPatronais) * 100) / 100
  const salarioLiquido = Math.round((salarioBruto - inss - irrf - desconto) * 100) / 100

  return {
    ...base,
    horasExtras60: he60, horasExtras100: he100,
    valorHorasExtras60: valorHE60, valorHorasExtras100: valorHE100,
    valorHorasExtras: valorHETotal,
    salarioBruto, inss, irrfBase, irrf, salarioLiquido,
    fgts, encargosPatronais, custoTotal,
    projectId,
  }
}

const MONTH_NAMES = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const TYPE_LABELS: Record<string, string> = {
  CLT: 'CLT', PJ: 'PJ', TEMPORARY: 'Temporário', INTERN: 'Estagiário', THIRD_PARTY: 'Terceirizado',
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function FolhaPagamentoPage() {
  const now = new Date()
  const [month,      setMonth]      = useState(now.getMonth() + 1)
  const [year,       setYear]       = useState(now.getFullYear())
  const [entries,    setEntries]    = useState<PayrollEntry[]>([])
  const [loading,    setLoading]    = useState(false)
  const [launching,  setLaunching]  = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [exporting,  setExporting]  = useState(false)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState('')
  const [projects,   setProjects]   = useState<{ id: string; name: string; code: string | null }[]>([])
  const [calculated, setCalculated] = useState(false)
  const [confirm,    setConfirm]    = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null)

  // Overrides por colaborador: horas extras, projeto, desconto, dependentes
  const [overrides, setOverrides] = useState<Record<string, {
    he60: number; he100: number; projectId: string | null; desconto: number; dependentes: number
  }>>({})

  // Toggle visual: mostra/oculta PJ na tabela
  const [includePj,   setIncludePj]   = useState(false)

  // Modal de seleção de PJ/Terceirizados
  const [showPjModal, setShowPjModal] = useState(false)
  const [pjEmployees, setPjEmployees] = useState<any[]>([])
  const [pjSelected,  setPjSelected]  = useState<Record<string, { selected: boolean; salary: number }>>({})
  const [loadingPj,   setLoadingPj]   = useState(false)
  const [discarding,  setDiscarding]  = useState(false)

  // Carregar obras ativas
  useEffect(() => {
    fetch(`${API}/api/v1/projects?status=ALL&limit=200`, { headers: getHeaders() })
      .then(r => r.json())
      .then(d => {
        const all = d.projects ?? []
        const active = all.filter((p: any) =>
          !['COMPLETED', 'CANCELLED'].includes(p.status)
        )
        setProjects(active.map((p: any) => ({ id: p.id, name: p.name, code: p.code })))
      })
      .catch(() => {})
  }, [])

  // Carregar rascunho ao mudar mês/ano
  useEffect(() => {
    if (!calculated) {
      fetch(`${API}/api/v1/employees/payroll-draft?month=${month}&year=${year}`, {
        headers: getHeaders(),
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data?.draft) return
          const draft = data.draft
          if (draft.data?.entries && draft.data?.overrides) {
            setEntries(draft.data.entries)
            setOverrides(draft.data.overrides)
            setCalculated(true)
            setDraftSavedAt(draft.updatedAt)
          }
        })
        .catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year])

  // Calcular folha (reutilizável com ou sem PJ)
  const handleCalculate = useCallback(async (withPj = includePj) => {
    setLoading(true); setError(''); setSuccess(''); setCalculated(false); setDraftSavedAt(null)
    try {
      const params = new URLSearchParams({
        month:      String(month),
        year:       String(year),
        includeAll: String(withPj),
      })
      const res = await fetch(
        `${API}/api/v1/employees/payroll-preview?${params}`,
        { headers: getHeaders() }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao calcular')
      const raw: PayrollEntry[] = (data.entries ?? []).map((e: any) => ({
        ...e,
        horasExtras60:       e.horasExtras60       ?? 0,
        horasExtras100:      e.horasExtras100      ?? 0,
        valorHorasExtras60:  e.valorHorasExtras60  ?? 0,
        valorHorasExtras100: e.valorHorasExtras100 ?? 0,
        valorHorasExtras:    e.valorHorasExtras    ?? 0,
        irrf:                e.irrf                ?? 0,
        isClt:               e.isClt               ?? true,
      }))
      setEntries(raw)
      const initOverrides: typeof overrides = {}
      for (const e of raw) {
        initOverrides[e.employeeId] = {
          he60:        e.horasExtras60  ?? 0,
          he100:       e.horasExtras100 ?? 0,
          projectId:   e.projectId,
          desconto:    0,
          dependentes: 0,
        }
      }
      setOverrides(initOverrides)
      setCalculated(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [month, year, includePj])

  // Filtra visualmente PJ da tabela quando toggle está off
  const filteredEntries = useMemo(
    () => includePj ? entries : entries.filter(e => e.isClt),
    [entries, includePj]
  )

  // Linhas com overrides aplicados
  const computedEntries = useMemo(() => {
    return filteredEntries.map(e => {
      const ov         = overrides[e.employeeId]
      const he60       = ov?.he60         ?? e.horasExtras60  ?? 0
      const he100      = ov?.he100        ?? e.horasExtras100 ?? 0
      const pid        = ov?.projectId    !== undefined ? ov.projectId : e.projectId
      const desconto   = ov?.desconto     ?? 0
      const dependentes = ov?.dependentes ?? 0
      return calcEntry(e, he60, he100, pid, desconto, dependentes, year)
    })
  }, [filteredEntries, overrides, year])

  // Totais gerais
  const totals = useMemo(() => computedEntries.reduce((acc, e) => {
    const ov = overrides[e.employeeId]
    const desconto = ov?.desconto ?? 0
    return {
      salariosBrutos:    acc.salariosBrutos    + e.salarioBruto,
      salariosLiquidos:  acc.salariosLiquidos  + e.salarioLiquido,
      inss:              acc.inss              + e.inss,
      irrf:              acc.irrf              + e.irrf,
      descontos:         acc.descontos         + desconto,
      fgts:              acc.fgts              + e.fgts,
      encargos:          acc.encargos          + e.encargosPatronais,
      custoTotal:        acc.custoTotal        + e.custoTotal,
      he60Valor:         acc.he60Valor         + e.valorHorasExtras60,
      he100Valor:        acc.he100Valor        + e.valorHorasExtras100,
    }
  }, {
    salariosBrutos: 0, salariosLiquidos: 0, inss: 0, irrf: 0, descontos: 0,
    fgts: 0, encargos: 0, custoTotal: 0, he60Valor: 0, he100Valor: 0,
  }), [computedEntries, overrides])

  // Resumo por colaborador (para confirmação)
  const byProject = useMemo((): ProjectSummary[] => {
    const map: Record<string, ProjectSummary> = {}
    for (const e of computedEntries) {
      const key  = e.projectId ?? 'null'
      const name = e.project?.name ?? (e.projectId ? e.projectId : 'Administrativo')
      if (!map[key]) map[key] = { projectId: e.projectId, projectName: name, count: 0, custoTotal: 0 }
      map[key].count++
      map[key].custoTotal += e.custoTotal
    }
    return Object.values(map).sort((a, b) => b.custoTotal - a.custoTotal)
  }, [computedEntries])

  // FIX 4: Salvar rascunho
  const handleSaveDraft = useCallback(async () => {
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API}/api/v1/employees/payroll-draft`, {
        method:  'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month, year,
          data:               { entries, overrides },
          totalBruto:         totals.salariosBrutos,
          totalLiquido:       totals.salariosLiquidos,
          totalColaboradores: computedEntries.length,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar rascunho')
      setDraftSavedAt(data.draft.updatedAt)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }, [month, year, entries, overrides, totals, computedEntries.length])

  // FIX 5: Exportar PDF
  const handleExportPdf = useCallback(async () => {
    setExporting(true); setError('')
    try {
      const res = await fetch(`${API}/api/v1/employees/payroll-pdf`, {
        method:  'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month, year,
          entries: computedEntries.map(e => {
            const ov = overrides[e.employeeId]
            const proj = projects.find(p => p.id === e.projectId)
            return {
              employeeId:          e.employeeId,
              name:                e.name,
              type:                e.type,
              role:                e.role ?? null,
              projectName:         proj ? `${proj.code ? proj.code + ' — ' : ''}${proj.name}` : (e.project?.name ?? null),
              salarioBase:         e.salarioBase,
              horasExtras60:       e.horasExtras60,
              valorHorasExtras60:  e.valorHorasExtras60,
              horasExtras100:      e.horasExtras100,
              valorHorasExtras100: e.valorHorasExtras100,
              salarioBruto:        e.salarioBruto,
              desconto:            ov?.desconto ?? 0,
              inss:                e.inss,
              irrf:                e.irrf,
              salarioLiquido:      e.salarioLiquido,
              fgts:                e.fgts,
              encargosPatronais:   e.encargosPatronais,
              custoTotal:          e.custoTotal,
            }
          }),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erro ao gerar PDF')
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a'); a.href = url
      a.download = `folha-${year}-${String(month).padStart(2,'0')}.pdf`
      a.click(); URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setExporting(false)
    }
  }, [month, year, computedEntries, overrides, projects])

  // Lançar folha
  const handleLaunch = useCallback(async () => {
    setLaunching(true); setError(''); setSuccess('')
    try {
      const res = await fetch(`${API}/api/v1/employees/payroll-launch`, {
        method:  'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month, year,
          description: `Folha de pagamento ${MONTH_NAMES[month]}/${year}`,
          entries: computedEntries.map(e => {
            const ov      = overrides[e.employeeId]
            const base    = entries.find(b => b.employeeId === e.employeeId)
            // projectId resolvido: override → base entry → null
            const pid     = ov?.projectId !== undefined ? ov.projectId : (base?.projectId ?? null)
            return {
              employeeId:          e.employeeId,
              name:                e.name,
              projectId:           pid,
              supplierId:          e.supplierId   ?? null,  // ← fornecedor PJ
              salarioBruto:        e.salarioBruto,
              salarioLiquido:      e.salarioLiquido,
              desconto:            ov?.desconto     ?? 0,
              dependentes:         ov?.dependentes  ?? 0,
              horasExtras60:       e.horasExtras60,
              horasExtras100:      e.horasExtras100,
              valorHorasExtras60:  e.valorHorasExtras60,
              valorHorasExtras100: e.valorHorasExtras100,
              valorHorasExtras:    e.valorHorasExtras,
              inss:                e.inss,
              irrf:                e.irrf,
              fgts:                e.fgts,
              encargosPatronais:   e.encargosPatronais,
              custoTotal:          e.custoTotal,
            }
          }),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao lançar')
      setSuccess(`✓ Folha lançada! ${data.transactionsCreated} lançamento(s) individual(is) criado(s) — categoria "Mão de obra".`)
      setConfirm(false)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLaunching(false)
    }
  }, [month, year, computedEntries, overrides])

  // Exportar CSV
  const handleExportCsv = useCallback(() => {
    const header = [
      'Colaborador','Tipo','Função','Obra',
      'Sal. Base','H.Extra 60%','Valor HE 60%','H.Extra 100%','Valor HE 100%',
      'Sal. Bruto','INSS','IRRF','Descontos','Sal. Líquido','FGTS','Encargos','Custo Total',
    ]
    const rows = computedEntries.map(e => {
      const ov = overrides[e.employeeId]
      const proj = projects.find(p => p.id === e.projectId)
      return [
        e.name, TYPE_LABELS[e.type] ?? e.type, e.role ?? '',
        proj ? proj.name : (e.project?.name ?? 'Administrativo'),
        e.salarioBase.toFixed(2),
        e.horasExtras60.toString(),
        e.valorHorasExtras60.toFixed(2),
        e.horasExtras100.toString(),
        e.valorHorasExtras100.toFixed(2),
        e.salarioBruto.toFixed(2),
        e.inss.toFixed(2),
        e.irrf.toFixed(2),
        (ov?.desconto ?? 0).toFixed(2),
        e.salarioLiquido.toFixed(2),
        e.fgts.toFixed(2),
        e.encargosPatronais.toFixed(2),
        e.custoTotal.toFixed(2),
      ]
    })
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = `folha-${year}-${String(month).padStart(2,'0')}.csv`
    a.click(); URL.revokeObjectURL(url)
  }, [computedEntries, overrides, projects, month, year])

  const setOv = (employeeId: string, field: 'he60' | 'he100' | 'projectId' | 'desconto' | 'dependentes', value: number | string | null) => {
    const base = entries.find(e => e.employeeId === employeeId)
    setOverrides(prev => ({
      ...prev,
      [employeeId]: {
        he60:        prev[employeeId]?.he60         ?? base?.horasExtras60  ?? 0,
        he100:       prev[employeeId]?.he100        ?? base?.horasExtras100 ?? 0,
        projectId:   prev[employeeId]?.projectId    !== undefined ? prev[employeeId].projectId : (base?.projectId ?? null),
        desconto:    prev[employeeId]?.desconto     ?? 0,
        dependentes: prev[employeeId]?.dependentes  ?? 0,
        [field]: value,
      },
    }))
  }

  // ─── Abrir modal de seleção PJ ─────────────────────────────────────────────
  const openPjModal = useCallback(async () => {
    setShowPjModal(true)
    setLoadingPj(true)
    try {
      const res = await fetch(
        `${API}/api/v1/employees?type=PJ,THIRD_PARTY&status=ACTIVE&limit=200`,
        { headers: getHeaders() }
      )
      const data = await res.json()
      const list: any[] = data.employees ?? []
      setPjEmployees(list)
      const sel: Record<string, { selected: boolean; salary: number }> = {}
      for (const emp of list) {
        const inEntries = entries.find(e => e.employeeId === emp.id)
        sel[emp.id] = {
          selected: !!inEntries,
          salary:   inEntries?.salarioBase ?? (parseFloat(emp.salary) || 0),
        }
      }
      setPjSelected(sel)
    } catch {} finally {
      setLoadingPj(false)
    }
  }, [entries])

  // ─── Confirmar seleção PJ ──────────────────────────────────────────────────
  const confirmPjSelection = useCallback(() => {
    const cltEntries  = entries.filter(e => e.isClt)
    const newPjEntries: PayrollEntry[] = pjEmployees
      .filter(emp => pjSelected[emp.id]?.selected)
      .map(emp => {
        const salary = pjSelected[emp.id]?.salary ?? 0
        return {
          employeeId:          emp.id,
          name:                emp.name,
          type:                emp.type,
          role:                emp.role    ?? null,
          projectId:           emp.projectId ?? null,
          project:             emp.project  ?? null,
          supplierId:          emp.supplierId      ?? null,
          supplierName:        emp.supplier?.name  ?? null,
          salarioBase:         salary,
          horasExtras60:       0,
          horasExtras100:      0,
          valorHorasExtras60:  0,
          valorHorasExtras100: 0,
          valorHorasExtras:    0,
          salarioBruto:        salary,
          inss:                0,
          irrfBase:            0,
          irrf:                0,
          salarioLiquido:      salary,
          fgts:                0,
          encargosPatronais:   0,
          custoTotal:          salary,
          isClt:               false,
        }
      })
    const merged = [...cltEntries, ...newPjEntries]
    setEntries(merged)
    setOverrides(prev => {
      const next: typeof prev = {}
      for (const e of cltEntries) {
        if (prev[e.employeeId]) next[e.employeeId] = prev[e.employeeId]
      }
      for (const e of newPjEntries) {
        next[e.employeeId] = prev[e.employeeId] ?? {
          he60: 0, he100: 0, projectId: e.projectId, desconto: 0, dependentes: 0,
        }
      }
      return next
    })
    const hasAnyPj = newPjEntries.length > 0
    setIncludePj(hasAnyPj)
    setShowPjModal(false)
  }, [entries, pjEmployees, pjSelected])

  // ─── Descartar rascunho ────────────────────────────────────────────────────
  const handleDiscardDraft = useCallback(async () => {
    if (!window.confirm('Descartar o rascunho? Todos os ajustes não salvos serão perdidos.')) return
    setDiscarding(true)
    try {
      await fetch(
        `${API}/api/v1/employees/payroll-draft?month=${month}&year=${year}`,
        { method: 'DELETE', headers: getHeaders() }
      )
    } catch {}
    setEntries([])
    setOverrides({})
    setCalculated(false)
    setDraftSavedAt(null)
    setIncludePj(false)
    setDiscarding(false)
  }, [month, year])

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <Breadcrumb items={[
        { label: 'Colaboradores', href: '/app/colaboradores' },
        { label: 'Folha de pagamento' },
      ]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Folha de pagamento</h1>
          <p className="text-sm text-gray-500">Calcule, salve rascunho e lance os salários individualmente no financeiro</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={month} onChange={e => { setMonth(parseInt(e.target.value)); setCalculated(false); setDraftSavedAt(null) }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white">
            {MONTH_NAMES.slice(1).map((m, i) => (
              <option key={i+1} value={i+1}>{m}</option>
            ))}
          </select>
          <select value={year} onChange={e => { setYear(parseInt(e.target.value)); setCalculated(false); setDraftSavedAt(null) }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => handleCalculate(includePj)} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-[#F5A623] hover:bg-[#d4891a] text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />}
            Calcular folha
          </button>
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center justify-between gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle size={15} className="text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-700 font-medium">{success}</p>
          </div>
          <Link href="/app/financeiro"
            className="flex items-center gap-1 text-sm text-green-700 hover:underline font-medium">
            Ver lançamentos <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {/* Banner de rascunho carregado */}
      {draftSavedAt && !success && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
          <Clock size={13} className="text-blue-500 flex-shrink-0" />
          <p className="text-xs text-blue-700 flex-1">
            Rascunho salvo em {fmtDateTime(draftSavedAt)} — edite e salve novamente se necessário
          </p>
          <button
            onClick={handleDiscardDraft}
            disabled={discarding}
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2.5 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {discarding
              ? <Loader2 size={11} className="animate-spin" />
              : <Trash2 size={11} />
            }
            Descartar rascunho
          </button>
        </div>
      )}

      {calculated && computedEntries.length > 0 && (
        <>
          {/* Cards de totais */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Salários brutos',     value: fmtMoney(totals.salariosBrutos),    color: 'text-gray-700',   bg: 'bg-gray-50',   border: 'border-gray-100' },
              { label: 'INSS + IRRF desc.',   value: fmtMoney(totals.inss + totals.irrf), color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-100' },
              { label: 'Outros descontos',    value: fmtMoney(totals.descontos),          color: 'text-rose-600',   bg: 'bg-rose-50',   border: 'border-rose-100' },
              { label: 'Salários líquidos',   value: fmtMoney(totals.salariosLiquidos),  color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-100' },
              { label: 'Custo total empresa', value: fmtMoney(totals.custoTotal),         color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-100' },
            ].map(c => (
              <div key={c.label} className={`${c.bg} border ${c.border} rounded-2xl px-4 py-3`}>
                <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide mb-1">{c.label}</p>
                <p className={`text-base font-bold ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Legenda */}
          <div className="flex items-center gap-5 text-xs text-gray-500 px-1 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              HE 60% — dias úteis (CLT Art. 59)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
              HE 100% — domingos/feriados (CLT Art. 73)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
              Descontos — vale transporte, alimentação, outros
            </span>
            <span className="text-gray-400 italic ml-auto">
              ⚡ Apenas Salário Líquido é lançado no Financeiro — FGTS/encargos são guias separadas
            </span>
          </div>

          {/* Badge tabela vigente */}
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-800">
            <span className="font-semibold">ℹ</span>
            <span>{labelTabelaIRRF(year)} · {labelTabelaINSS}</span>
          </div>

          {/* Tabela de colaboradores */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Users size={15} className="text-[#F5A623]" />
                  <p className="text-sm font-semibold text-gray-700">
                    Colaboradores ({computedEntries.length})
                  </p>
                </div>
                {/* Badges legenda de tipos */}
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">CLT</span>
                  <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Estagiário</span>
                  <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">Temporário</span>
                  {includePj && <>
                    <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">PJ</span>
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">Terceirizado</span>
                  </>}
                </div>
                {/* Botão selecionar PJ */}
                {(() => {
                  const pjCount = entries.filter(e => !e.isClt).length
                  return (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={openPjModal}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors font-medium"
                      >
                        <UserPlus size={13} />
                        {pjCount > 0 ? `PJ/Terceirizados (${pjCount})` : 'Adicionar PJ / Terceirizados'}
                      </button>
                      {pjCount > 0 && (
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                          <div
                            className={`w-8 h-4 rounded-full transition-colors ${includePj ? 'bg-purple-500' : 'bg-gray-300'} relative`}
                            onClick={() => setIncludePj(v => !v)}
                          >
                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${includePj ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </div>
                          <span className="text-[11px] text-gray-400">exibir</span>
                        </label>
                      )}
                    </div>
                  )
                })()}
              </div>
              <div className="flex items-center gap-2">
                {/* Salvar rascunho */}
                <button onClick={handleSaveDraft} disabled={saving}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  {saving ? 'Salvando...' : 'Salvar rascunho'}
                </button>
                {/* Exportar PDF */}
                <button onClick={handleExportPdf} disabled={exporting}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                  {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
                  {exporting ? 'Gerando PDF...' : 'Exportar PDF'}
                </button>
                {/* Exportar CSV */}
                <button onClick={handleExportCsv}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#F5A623] border border-gray-200 px-3 py-1.5 rounded-lg transition-colors">
                  <FileSpreadsheet size={13} /> Exportar CSV
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold sticky left-0 bg-gray-50">Colaborador</th>
                    <th className="px-3 py-3 text-left font-semibold">Tipo</th>
                    <th className="px-3 py-3 text-left font-semibold min-w-[140px]">Obra / Local</th>
                    <th className="px-3 py-3 text-right font-semibold">Sal. base</th>
                    <th className="px-3 py-3 text-center font-semibold min-w-[60px] text-amber-600">HE 60%</th>
                    <th className="px-3 py-3 text-center font-semibold min-w-[60px] text-red-500">HE 100%</th>
                    <th className="px-3 py-3 text-right font-semibold">Sal. bruto</th>
                    <th className="px-3 py-3 text-right font-semibold text-red-500">INSS</th>
                    <th className="px-3 py-3 text-center font-semibold text-purple-500 min-w-[52px]" title="Número de dependentes para dedução IRRF (R$ 189,59/dep.)">Dep.</th>
                    <th className="px-3 py-3 text-right font-semibold text-red-500" title={`Isenção: R$ ${isencaoIRRF(year).toLocaleString('pt-BR')}`}>IRRF</th>
                    <th className="px-3 py-3 text-right font-semibold text-rose-600 min-w-[80px]">Descontos</th>
                    <th className="px-3 py-3 text-right font-semibold text-green-600">Sal. líquido</th>
                    <th className="px-3 py-3 text-right font-semibold text-blue-600">FGTS *</th>
                    <th className="px-3 py-3 text-right font-semibold text-orange-700">Custo total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {computedEntries.map(e => {
                    const isPj = e.type === 'PJ' || e.type === 'THIRD_PARTY'
                    const ov   = overrides[e.employeeId]
                    return (
                      <tr key={e.employeeId} className={`hover:bg-gray-50/80 transition-colors ${isPj ? 'bg-purple-50/30' : ''}`}>
                        <td className="px-4 py-3 sticky left-0 bg-inherit">
                          <p className="font-medium text-gray-800 whitespace-nowrap">{e.name}</p>
                          {e.role && <p className="text-xs text-gray-400">{e.role}</p>}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                            isPj ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {TYPE_LABELS[e.type] ?? e.type}
                          </span>
                        </td>
                        {/* FIX 2: Obra pré-preenchida com indicador "● atual" */}
                        <td className="px-3 py-3">
                          {(() => {
                            const baseEntry      = entries.find(b => b.employeeId === e.employeeId)
                            const selectedPid    = ov?.projectId !== undefined ? (ov.projectId ?? '') : (e.projectId ?? '')
                            const isCurrentProj  = selectedPid !== '' && selectedPid === baseEntry?.projectId
                            return (
                              <div>
                                <select
                                  value={selectedPid}
                                  onChange={ev => setOv(e.employeeId, 'projectId', ev.target.value || null)}
                                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white"
                                >
                                  <option value="">Administrativo (sem obra)</option>
                                  {projects.map(p => (
                                    <option key={p.id} value={p.id}>
                                      {p.code ? `${p.code} — ` : ''}{p.name}
                                    </option>
                                  ))}
                                </select>
                                {isCurrentProj && (
                                  <span className="text-[9px] text-green-600 font-semibold mt-0.5 block">
                                    ● obra atual
                                  </span>
                                )}
                                {isPj && e.supplierName && (
                                  <span className="text-[9px] text-purple-500 mt-0.5 block truncate" title={`Fornecedor: ${e.supplierName}`}>
                                    🏢 {e.supplierName}
                                  </span>
                                )}
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700 whitespace-nowrap">{fmtMoney(e.salarioBase)}</td>
                        {/* HE 60% */}
                        <td className="px-3 py-3 text-center">
                          <input
                            type="number" min="0" max="300" step="0.5"
                            value={ov?.he60 ?? e.horasExtras60 ?? 0}
                            onChange={ev => setOv(e.employeeId, 'he60', parseFloat(ev.target.value) || 0)}
                            className="w-14 border border-amber-200 rounded-lg px-1.5 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-amber-300"
                          />
                          {e.valorHorasExtras60 > 0 && (
                            <p className="text-[9px] text-amber-600 mt-0.5">{fmtMoney(e.valorHorasExtras60)}</p>
                          )}
                        </td>
                        {/* HE 100% */}
                        <td className="px-3 py-3 text-center">
                          <input
                            type="number" min="0" max="300" step="0.5"
                            value={ov?.he100 ?? e.horasExtras100 ?? 0}
                            onChange={ev => setOv(e.employeeId, 'he100', parseFloat(ev.target.value) || 0)}
                            className="w-14 border border-red-200 rounded-lg px-1.5 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-red-300"
                          />
                          {e.valorHorasExtras100 > 0 && (
                            <p className="text-[9px] text-red-500 mt-0.5">{fmtMoney(e.valorHorasExtras100)}</p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700 whitespace-nowrap">{fmtMoney(e.salarioBruto)}</td>
                        <td className="px-3 py-3 text-right text-red-500 text-xs whitespace-nowrap">{isPj ? '—' : fmtMoney(e.inss)}</td>
                        {/* Dependentes */}
                        <td className="px-3 py-3 text-center">
                          {isPj ? (
                            <span className="text-xs text-gray-300">—</span>
                          ) : (
                            <input
                              type="number" min="0" max="10" step="1"
                              value={ov?.dependentes ?? 0}
                              onChange={ev => setOv(e.employeeId, 'dependentes', Math.max(0, parseInt(ev.target.value) || 0))}
                              className="w-10 border border-purple-200 rounded-lg px-1 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-purple-300"
                              title="Dependentes para dedução IRRF"
                            />
                          )}
                        </td>
                        {/* IRRF — "Isento" quando zero para CLT */}
                        <td className="px-3 py-3 text-right text-xs whitespace-nowrap"
                          title={!isPj && e.irrfBase ? `Base: ${fmtMoney(e.irrfBase)} (Bruto ${fmtMoney(e.salarioBruto)} − INSS ${fmtMoney(e.inss)})` : undefined}>
                          {isPj ? '—' : e.irrf === 0
                            ? <span className="text-green-600 font-semibold">Isento</span>
                            : <span className="text-red-500">{fmtMoney(e.irrf)}</span>
                          }
                        </td>
                        {/* FIX 2: Campo desconto editável */}
                        <td className="px-3 py-3 text-center">
                          <input
                            type="number" min="0" step="0.01"
                            value={ov?.desconto ?? 0}
                            onChange={ev => setOv(e.employeeId, 'desconto', parseFloat(ev.target.value) || 0)}
                            className="w-20 border border-rose-200 rounded-lg px-1.5 py-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-rose-300"
                            placeholder="0,00"
                          />
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-green-700 whitespace-nowrap">{fmtMoney(e.salarioLiquido)}</td>
                        <td className="px-3 py-3 text-right text-blue-600 text-xs whitespace-nowrap">{isPj ? '—' : fmtMoney(e.fgts)}</td>
                        <td className="px-3 py-3 text-right font-bold text-orange-700 whitespace-nowrap">{fmtMoney(e.custoTotal)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                {/* Rodapé com totais */}
                <tfoot className="bg-gray-50 font-semibold text-sm border-t-2 border-gray-200">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-gray-600">Total ({computedEntries.length})</td>
                    <td className="px-3 py-3 text-right text-gray-700 whitespace-nowrap">
                      {fmtMoney(computedEntries.reduce((s, e) => s + e.salarioBase, 0))}
                    </td>
                    <td className="px-3 py-3 text-center text-amber-600 text-xs whitespace-nowrap">
                      {totals.he60Valor > 0 ? fmtMoney(totals.he60Valor) : '—'}
                    </td>
                    <td className="px-3 py-3 text-center text-red-500 text-xs whitespace-nowrap">
                      {totals.he100Valor > 0 ? fmtMoney(totals.he100Valor) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-700 whitespace-nowrap">{fmtMoney(totals.salariosBrutos)}</td>
                    <td className="px-3 py-3 text-right text-red-500 whitespace-nowrap">{fmtMoney(totals.inss)}</td>
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3 text-right text-red-500 whitespace-nowrap">{fmtMoney(totals.irrf)}</td>
                    <td className="px-3 py-3 text-right text-rose-600 whitespace-nowrap">
                      {totals.descontos > 0 ? fmtMoney(totals.descontos) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right text-green-700 whitespace-nowrap">{fmtMoney(totals.salariosLiquidos)}</td>
                    <td className="px-3 py-3 text-right text-blue-600 whitespace-nowrap">{fmtMoney(totals.fgts)}</td>
                    <td className="px-3 py-3 text-right text-orange-700 whitespace-nowrap">{fmtMoney(totals.custoTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Resumo por obra */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">
              Lançamentos que serão criados no Financeiro ({computedEntries.length} individuais)
            </p>
            <div className="space-y-2">
              {byProject.map(pr => (
                <div key={pr.projectId ?? 'null'}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{pr.projectName}</p>
                    <p className="text-xs text-gray-400">{pr.count} colaborador{pr.count !== 1 ? 'es' : ''}</p>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{fmtMoney(pr.custoTotal)}</p>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 mt-1 border-t-2 border-gray-200">
                <p className="text-sm font-bold text-gray-900">Total líquido a pagar</p>
                <p className="text-base font-bold text-green-700">{fmtMoney(totals.salariosLiquidos)}</p>
              </div>
            </div>
          </div>

          {/* Encargos detalhados */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-xs text-gray-500 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="font-semibold text-gray-600 mb-1">Descontos colaborador</p>
              <p>INSS progressivo: {fmtMoney(totals.inss)}</p>
              <p>IRRF: {fmtMoney(totals.irrf)}</p>
              {totals.descontos > 0 && <p>Outros: {fmtMoney(totals.descontos)}</p>}
            </div>
            <div>
              <p className="font-semibold text-gray-600 mb-1">Encargos empregador *</p>
              <p>FGTS (8%): {fmtMoney(totals.fgts)}</p>
              <p>INSS pat. + RAT + 3ºs: {fmtMoney(totals.encargos)}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-600 mb-1">Horas extras</p>
              <p>60% (úteis): {fmtMoney(totals.he60Valor)}</p>
              <p>100% (dom./feriados): {fmtMoney(totals.he100Valor)}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-600 mb-1">Tabela INSS 2025</p>
              {INSS_INFO.map(l => <p key={l}>{l}</p>)}
            </div>
            <div className="col-span-2 sm:col-span-4 border-t border-gray-200 pt-2 mt-1">
              <p className="font-semibold text-gray-600 mb-1">
                {year >= 2026 ? 'Tabela IRRF 2026 (Lei 14.848/2024 — isenção R$ 5.000)' : 'Tabela IRRF 2025'}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                {IRRF_INFO(year).map(l => <span key={l}>{l}</span>)}
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 px-1">
            * FGTS e encargos patronais <strong>não</strong> são lançados na folha — devem ser recolhidos por guias separadas (GFIP/eSocial).
          </p>

          {/* Botão lançar */}
          {!success && (
            <div className="flex justify-end gap-3">
              {!confirm ? (
                <button
                  onClick={() => setConfirm(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors"
                >
                  <DollarSign size={16} />
                  Lançar folha no Financeiro
                </button>
              ) : (
                <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl w-full">
                  <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-amber-800 font-medium">
                      Confirmar lançamento de <strong>{computedEntries.length} transação(ões) individual(is)</strong> — categoria &ldquo;Mão de obra&rdquo;?
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Total líquido: <strong>{fmtMoney(totals.salariosLiquidos)}</strong>
                    </p>
                  </div>
                  <button onClick={() => setConfirm(false)}
                    className="px-3 py-1.5 border border-gray-200 text-sm rounded-lg text-gray-600 hover:bg-gray-100">
                    Cancelar
                  </button>
                  <button onClick={handleLaunch} disabled={launching}
                    className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50">
                    {launching ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                    Confirmar
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {calculated && computedEntries.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center space-y-2">
          <Users size={32} className="text-gray-200 mx-auto" />
          <p className="text-sm text-gray-500">Nenhum colaborador ativo com salário cadastrado</p>
          <p className="text-xs text-gray-400">Cadastre colaboradores com tipo de contrato e salário para calcular a folha</p>
          <Link href="/app/colaboradores" className="inline-block mt-2 text-sm text-[#F5A623] hover:underline font-medium">
            Ir para Colaboradores
          </Link>
        </div>
      )}

      {!calculated && !loading && (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center space-y-3">
          <Calculator size={36} className="text-gray-200 mx-auto" />
          <p className="text-sm font-medium text-gray-600">Selecione o mês e clique em &ldquo;Calcular folha&rdquo;</p>
          <p className="text-xs text-gray-400">O sistema irá buscar todos os colaboradores ativos com salário cadastrado</p>
          <p className="text-xs text-gray-400">Se houver rascunho salvo para o período selecionado, ele será carregado automaticamente.</p>
        </div>
      )}

      {/* ── Modal seleção PJ / Terceirizados ──────────────────────────────────── */}
      {showPjModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPjModal(false)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-[560px] max-h-[85vh] flex flex-col">

            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="font-semibold text-gray-900">PJ e Terceirizados</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Selecione quem deve aparecer nesta folha e informe o valor combinado
                </p>
              </div>
              <button onClick={() => setShowPjModal(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingPj ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={22} className="animate-spin text-gray-300" />
                </div>
              ) : pjEmployees.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <Users size={32} className="mx-auto text-gray-200" />
                  <p className="text-sm text-gray-500">Nenhum colaborador PJ ou Terceirizado ativo encontrado.</p>
                  <Link href="/app/colaboradores"
                    className="text-sm text-[#F5A623] hover:underline font-medium">
                    Cadastrar colaborador PJ →
                  </Link>
                </div>
              ) : (
                <>
                  {/* Selecionar / desmarcar todos */}
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <p className="text-xs text-gray-500">
                      {pjEmployees.length} colaborador(es) encontrado(s)
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPjSelected(prev => {
                          const next = { ...prev }
                          for (const emp of pjEmployees) next[emp.id] = { ...next[emp.id], selected: true }
                          return next
                        })}
                        className="text-xs text-purple-600 hover:underline"
                      >Selecionar todos</button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={() => setPjSelected(prev => {
                          const next = { ...prev }
                          for (const emp of pjEmployees) next[emp.id] = { ...next[emp.id], selected: false }
                          return next
                        })}
                        className="text-xs text-gray-400 hover:underline"
                      >Desmarcar todos</button>
                    </div>
                  </div>

                  {pjEmployees.map(emp => {
                    const sel = pjSelected[emp.id]
                    const isSelected = sel?.selected ?? false
                    return (
                      <div key={emp.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                          isSelected ? 'border-purple-200 bg-purple-50/60' : 'border-gray-100 hover:border-gray-200 bg-white'
                        }`}>
                        {/* Checkbox */}
                        <button
                          type="button"
                          onClick={() => setPjSelected(prev => ({
                            ...prev,
                            [emp.id]: { salary: prev[emp.id]?.salary ?? 0, selected: !isSelected },
                          }))}
                          className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                            isSelected ? 'bg-purple-500 border-purple-500' : 'border-gray-300 bg-white'
                          }`}
                        >
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="1,5 4,9 11,1" />
                            </svg>
                          )}
                        </button>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{emp.name}</p>
                          <p className="text-xs text-gray-400">{emp.role ?? (TYPE_LABELS[emp.type] ?? emp.type)}</p>
                          {emp.supplier?.name && (
                            <p className="text-[11px] text-purple-500 mt-0.5">⚡ {emp.supplier.name}</p>
                          )}
                        </div>

                        {/* Badge tipo */}
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium flex-shrink-0 whitespace-nowrap">
                          {TYPE_LABELS[emp.type] ?? emp.type}
                        </span>

                        {/* Salary input */}
                        <div className="flex-shrink-0 w-28">
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 pointer-events-none">R$</span>
                            <input
                              type="number"
                              min="0"
                              step="100"
                              value={sel?.salary ?? 0}
                              onChange={e => setPjSelected(prev => ({
                                ...prev,
                                [emp.id]: { ...prev[emp.id], salary: parseFloat(e.target.value) || 0 },
                              }))}
                              onClick={() => {
                                if (!isSelected) {
                                  setPjSelected(prev => ({
                                    ...prev,
                                    [emp.id]: { salary: prev[emp.id]?.salary ?? 0, selected: true },
                                  }))
                                }
                              }}
                              className="w-full pl-7 pr-1.5 py-1.5 text-xs border border-gray-200 rounded-lg text-right focus:outline-none focus:ring-1 focus:ring-purple-300 bg-white"
                            />
                          </div>
                          <p className="text-[10px] text-gray-400 text-right mt-0.5">valor / mês</p>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
              <p className="text-xs text-gray-500">
                <span className="font-semibold text-purple-700">
                  {Object.values(pjSelected).filter(s => s.selected).length}
                </span> selecionado(s)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPjModal(false)}
                  className="px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmPjSelection}
                  className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-colors"
                >
                  Confirmar seleção
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
