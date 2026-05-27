'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, Loader2, Calculator, DollarSign, Users,
  AlertTriangle, CheckCircle, FileSpreadsheet, Download,
  Filter, RefreshCcw, ArrowRight,
} from 'lucide-react'
import { Breadcrumb } from '@/components/ui/Breadcrumb'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PayrollEntry {
  employeeId:        string
  name:              string
  type:              string
  role:              string | null
  projectId:         string | null
  project:           { id: string; name: string; code: string | null } | null
  salarioBase:       number
  horasExtras:       number
  valorHorasExtras:  number
  salarioBruto:      number
  inss:              number
  salarioLiquido:    number
  fgts:              number
  encargosPatronais: number
  custoTotal:        number
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

function calcEntry(base: PayrollEntry, horasExtras: number, projectId: string | null): PayrollEntry {
  const salario     = base.salarioBase
  const valorHora   = (salario / 220) * 1.5
  const valorHE     = horasExtras * valorHora
  const salarioBruto = salario + valorHE

  if (base.type === 'PJ' || base.type === 'THIRD_PARTY') {
    return { ...base, horasExtras, valorHorasExtras: 0, salarioBruto: salario, inss: 0, salarioLiquido: salario, fgts: 0, encargosPatronais: 0, custoTotal: salario, projectId }
  }

  const encTot = 0.20 + 0.03 + 0.058 + 0.1111 + 0.0833
  const inss              = salarioBruto * 0.14
  const fgts              = salarioBruto * 0.08
  const encargosPatronais = salarioBruto * encTot
  const custoTotal        = salarioBruto + fgts + encargosPatronais

  return { ...base, horasExtras, valorHorasExtras: valorHE, salarioBruto, inss, salarioLiquido: salarioBruto - inss, fgts, encargosPatronais, custoTotal, projectId }
}

const MONTH_NAMES = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const TYPE_LABELS: Record<string, string> = {
  CLT: 'CLT', PJ: 'PJ', TEMPORARY: 'Temporário', INTERN: 'Estagiário', THIRD_PARTY: 'Terceirizado',
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function FolhaPagamentoPage() {
  const now = new Date()
  const [month,     setMonth]     = useState(now.getMonth() + 1)
  const [year,      setYear]      = useState(now.getFullYear())
  const [entries,   setEntries]   = useState<PayrollEntry[]>([])
  const [loading,   setLoading]   = useState(false)
  const [launching, setLaunching] = useState(false)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState('')
  const [projects,  setProjects]  = useState<{ id: string; name: string; code: string | null }[]>([])
  const [calculated, setCalculated] = useState(false)
  const [confirm,    setConfirm]    = useState(false)

  // Estado local das linhas (horas extras + alocação por obra)
  const [overrides, setOverrides] = useState<Record<string, { horasExtras: number; projectId: string | null }>>({})

  // Carregar obras
  useEffect(() => {
    fetch(`${API}/api/v1/projects?status=ACTIVE&limit=200`, { headers: getHeaders() })
      .then(r => r.json())
      .then(d => setProjects((d.projects ?? []).map((p: any) => ({ id: p.id, name: p.name, code: p.code }))))
      .catch(() => {})
  }, [])

  // Calcular folha
  const handleCalculate = useCallback(async () => {
    setLoading(true); setError(''); setSuccess(''); setCalculated(false)
    try {
      const res = await fetch(
        `${API}/api/v1/employees/payroll-preview?month=${month}&year=${year}`,
        { headers: getHeaders() }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao calcular')
      setEntries(data.entries ?? [])
      setOverrides({})
      setCalculated(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [month, year])

  // Linha calculada com overrides
  const computedEntries = useMemo(() => {
    return entries.map(e => {
      const ov = overrides[e.employeeId]
      return calcEntry(e, ov?.horasExtras ?? 0, ov?.projectId !== undefined ? ov.projectId : e.projectId)
    })
  }, [entries, overrides])

  // Totais gerais
  const totals = useMemo(() => computedEntries.reduce((acc, e) => ({
    salarioBrutos:   acc.salarioBrutos   + e.salarioBruto,
    salariosLiquidos: acc.salariosLiquidos + e.salarioLiquido,
    fgts:            acc.fgts            + e.fgts,
    encargos:        acc.encargos        + e.encargosPatronais,
    custoTotal:      acc.custoTotal      + e.custoTotal,
    horasExtrasValor: acc.horasExtrasValor + e.valorHorasExtras,
  }), { salarioBrutos: 0, salariosLiquidos: 0, fgts: 0, encargos: 0, custoTotal: 0, horasExtrasValor: 0 }), [computedEntries])

  // Resumo por obra
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
          entries: computedEntries.map(e => ({
            employeeId:        e.employeeId,
            projectId:         e.projectId,
            salarioBruto:      e.salarioBruto,
            salarioLiquido:    e.salarioLiquido,
            horasExtras:       e.horasExtras,
            valorHorasExtras:  e.valorHorasExtras,
            fgts:              e.fgts,
            encargosPatronais: e.encargosPatronais,
            custoTotal:        e.custoTotal,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao lançar')
      setSuccess(`Folha lançada! ${data.transactionsCreated} lançamento(s) criado(s) no Financeiro.`)
      setConfirm(false)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLaunching(false)
    }
  }, [month, year, computedEntries])

  // Exportar CSV
  const handleExportCsv = useCallback(() => {
    const header = ['Colaborador','Tipo','Função','Obra','Sal. Base','H. Extra','Sal. Bruto','INSS','Sal. Líquido','FGTS','Encargos','Custo Total']
    const rows = computedEntries.map(e => [
      e.name, TYPE_LABELS[e.type] ?? e.type, e.role ?? '', e.project?.name ?? 'Administrativo',
      e.salarioBase.toFixed(2), e.horasExtras.toString(), e.salarioBruto.toFixed(2),
      e.inss.toFixed(2), e.salarioLiquido.toFixed(2), e.fgts.toFixed(2),
      e.encargosPatronais.toFixed(2), e.custoTotal.toFixed(2),
    ])
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = `folha-${year}-${String(month).padStart(2,'0')}.csv`
    a.click(); URL.revokeObjectURL(url)
  }, [computedEntries, month, year])

  const setOverride = (employeeId: string, field: 'horasExtras' | 'projectId', value: number | string | null) => {
    setOverrides(prev => ({
      ...prev,
      [employeeId]: {
        horasExtras: prev[employeeId]?.horasExtras ?? 0,
        projectId:   prev[employeeId]?.projectId   !== undefined ? prev[employeeId].projectId : entries.find(e => e.employeeId === employeeId)?.projectId ?? null,
        ...{ [field]: value },
      },
    }))
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Breadcrumb items={[
        { label: 'Dashboard',     href: '/app/dashboard' },
        { label: 'Colaboradores', href: '/app/colaboradores' },
        { label: 'Folha de pagamento' },
      ]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Folha de pagamento</h1>
          <p className="text-sm text-gray-500">Calcule e lance os salários no financeiro</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white">
            {MONTH_NAMES.slice(1).map((m, i) => (
              <option key={i+1} value={i+1}>{m}</option>
            ))}
          </select>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={handleCalculate} disabled={loading}
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

      {calculated && computedEntries.length > 0 && (
        <>
          {/* Cards de totais */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Salários líquidos',   value: fmtMoney(totals.salariosLiquidos), color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-100' },
              { label: 'FGTS (empregador)',    value: fmtMoney(totals.fgts),            color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-100' },
              { label: 'Encargos patronais',   value: fmtMoney(totals.encargos),        color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-100' },
              { label: 'Custo total empresa',  value: fmtMoney(totals.custoTotal),      color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-100' },
            ].map(c => (
              <div key={c.label} className={`${c.bg} border ${c.border} rounded-2xl px-4 py-3`}>
                <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide mb-1">{c.label}</p>
                <p className={`text-base font-bold ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Tabela de colaboradores */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-[#F5A623]" />
                <p className="text-sm font-semibold text-gray-700">
                  Colaboradores ({computedEntries.length})
                </p>
              </div>
              <button onClick={handleExportCsv}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#F5A623] border border-gray-200 px-3 py-1.5 rounded-lg transition-colors">
                <FileSpreadsheet size={13} /> Exportar CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Colaborador</th>
                    <th className="px-3 py-3 text-left font-semibold">Tipo</th>
                    <th className="px-3 py-3 text-left font-semibold min-w-[160px]">Obra / Local</th>
                    <th className="px-3 py-3 text-right font-semibold">Sal. base</th>
                    <th className="px-3 py-3 text-center font-semibold min-w-[80px]">H. Extra</th>
                    <th className="px-3 py-3 text-right font-semibold">Sal. bruto</th>
                    <th className="px-3 py-3 text-right font-semibold">INSS</th>
                    <th className="px-3 py-3 text-right font-semibold">Sal. líquido</th>
                    <th className="px-3 py-3 text-right font-semibold">FGTS</th>
                    <th className="px-3 py-3 text-right font-semibold text-red-600">Custo total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {computedEntries.map(e => {
                    const isPj = e.type === 'PJ' || e.type === 'THIRD_PARTY'
                    return (
                      <tr key={e.employeeId} className={`hover:bg-gray-50 transition-colors ${isPj ? 'bg-purple-50/30' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{e.name}</p>
                          {e.role && <p className="text-xs text-gray-400">{e.role}</p>}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            isPj ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {TYPE_LABELS[e.type] ?? e.type}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <select
                            value={overrides[e.employeeId]?.projectId !== undefined ? (overrides[e.employeeId].projectId ?? '') : (e.projectId ?? '')}
                            onChange={ev => setOverride(e.employeeId, 'projectId', ev.target.value || null)}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white"
                          >
                            <option value="">Administrativo</option>
                            {projects.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.code ? `${p.code} — ` : ''}{p.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700">{fmtMoney(e.salarioBase)}</td>
                        <td className="px-3 py-3 text-center">
                          <input
                            type="number" min="0" max="300"
                            value={overrides[e.employeeId]?.horasExtras ?? 0}
                            onChange={ev => setOverride(e.employeeId, 'horasExtras', parseFloat(ev.target.value) || 0)}
                            className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-orange-300"
                          />
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700">{fmtMoney(e.salarioBruto)}</td>
                        <td className="px-3 py-3 text-right text-red-500 text-xs">{isPj ? '—' : fmtMoney(e.inss)}</td>
                        <td className="px-3 py-3 text-right font-medium text-green-700">{fmtMoney(e.salarioLiquido)}</td>
                        <td className="px-3 py-3 text-right text-blue-600 text-xs">{isPj ? '—' : fmtMoney(e.fgts)}</td>
                        <td className="px-3 py-3 text-right font-bold text-red-700">{fmtMoney(e.custoTotal)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                {/* Rodapé com totais */}
                <tfoot className="bg-gray-50 font-semibold text-sm border-t border-gray-200">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-gray-600">Total ({computedEntries.length} colaboradores)</td>
                    <td className="px-3 py-3 text-right text-gray-700">{fmtMoney(computedEntries.reduce((s, e) => s + e.salarioBase, 0))}</td>
                    <td className="px-3 py-3 text-center text-gray-400">—</td>
                    <td className="px-3 py-3 text-right text-gray-700">{fmtMoney(totals.salarioBrutos)}</td>
                    <td className="px-3 py-3 text-right text-red-500">{fmtMoney(computedEntries.reduce((s, e) => s + e.inss, 0))}</td>
                    <td className="px-3 py-3 text-right text-green-700">{fmtMoney(totals.salariosLiquidos)}</td>
                    <td className="px-3 py-3 text-right text-blue-600">{fmtMoney(totals.fgts)}</td>
                    <td className="px-3 py-3 text-right text-red-700">{fmtMoney(totals.custoTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Resumo por obra */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">
              Lançamentos que serão criados no Financeiro ({byProject.length})
            </p>
            <div className="space-y-2">
              {byProject.map(p => (
                <div key={p.projectId ?? 'null'} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.projectName}</p>
                    <p className="text-xs text-gray-400">{p.count} colaborador{p.count !== 1 ? 'es' : ''}</p>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{fmtMoney(p.custoTotal)}</p>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 mt-1 border-t-2 border-gray-200">
                <p className="text-sm font-bold text-gray-900">Total geral</p>
                <p className="text-base font-bold text-red-700">{fmtMoney(totals.custoTotal)}</p>
              </div>
            </div>
          </div>

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
                <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
                  <p className="text-sm text-amber-800">
                    Serão criados <strong>{byProject.length} lançamento(s)</strong> no Financeiro. Confirmar?
                  </p>
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
          <p className="text-sm font-medium text-gray-600">Selecione o mês e clique em "Calcular folha"</p>
          <p className="text-xs text-gray-400">O sistema irá buscar todos os colaboradores ativos com salário cadastrado</p>
        </div>
      )}
    </div>
  )
}
