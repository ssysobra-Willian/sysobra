'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface RainDay {
  date:             string
  totalMm:          number
  morningMm:        number
  afternoonMm:      number
  nightMm:          number
  isUnworkable:     boolean
  unworkableReason: string | null
}

interface RainSummary {
  totalMm:        number
  rainyDays:      number
  unworkableDays: number
  maxRainDay:     { date: string; totalMm: number } | null
  averagePerMonth:{ month: string; totalMm: number; unworkableDays: number; rainyDays: number }[]
}

interface Props {
  records:     RainDay[]
  summary:     RainSummary | null
  projectId:   string
  projectName: string
  compact?:    boolean   // modo compacto para sidebar
}

type Granularity = 'day' | 'week' | 'month'
type Period = '30d' | '90d' | 'year' | 'all'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateShort(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[parseInt(m) - 1]}/${y.slice(2)}`
}

function isoWeek(dateStr: string): string {
  const d = new Date(dateStr)
  const year = d.getFullYear()
  const start = new Date(year, 0, 1)
  const week = Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

function weekLabel(wk: string): string {
  const [year, wPart] = wk.split('-W')
  const weekNum = parseInt(wPart)
  const jan1 = new Date(parseInt(year), 0, 1)
  const startDate = new Date(jan1.getTime() + (weekNum - 1) * 7 * 86400000)
  return `${String(startDate.getDate()).padStart(2,'0')}/${String(startDate.getMonth()+1).padStart(2,'0')}`
}

// ─── Agrega registros por granularidade ──────────────────────────────────────

interface AggRow {
  key:          string
  label:        string
  totalMm:      number
  morningMm:    number
  afternoonMm:  number
  nightMm:      number
  rainyDays:    number
  unworkable:   number
  accumulated:  number
  hasUnworkable:boolean
  days:         RainDay[]
}

function aggregate(records: RainDay[], granularity: Granularity): AggRow[] {
  const map: Record<string, AggRow> = {}

  for (const r of records) {
    let key: string
    let label: string

    if (granularity === 'day') {
      key   = r.date.substring(0, 10)
      label = fmtDateShort(r.date)
    } else if (granularity === 'week') {
      key   = isoWeek(r.date)
      label = weekLabel(key)
    } else {
      key   = r.date.substring(0, 7)
      label = fmtMonth(key)
    }

    if (!map[key]) {
      map[key] = { key, label, totalMm: 0, morningMm: 0, afternoonMm: 0, nightMm: 0,
        rainyDays: 0, unworkable: 0, accumulated: 0, hasUnworkable: false, days: [] }
    }
    const row = map[key]
    row.totalMm     += r.totalMm
    row.morningMm   += r.morningMm
    row.afternoonMm += r.afternoonMm
    row.nightMm     += r.nightMm
    if (r.totalMm > 0)    row.rainyDays++
    if (r.isUnworkable)   { row.unworkable++; row.hasUnworkable = true }
    row.days.push(r)
  }

  const rows = Object.values(map).sort((a, b) => a.key.localeCompare(b.key))

  // Calcula acumulado progressivo
  let acc = 0
  for (const row of rows) {
    acc += row.totalMm
    row.accumulated = Math.round(acc * 10) / 10
  }

  return rows
}

// ─── Tooltip customizado ──────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, granularity }: any) {
  if (!active || !payload?.length) return null
  const row: AggRow = payload[0]?.payload
  if (!row) return null

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-3 text-xs min-w-[180px]">
      <p className="font-semibold text-gray-800 mb-2">
        {granularity === 'day'
          ? fmtDate(row.days[0]?.date ?? '')
          : granularity === 'week'
          ? `Semana iniciada em ${label}`
          : label}
      </p>
      {granularity === 'day' && row.days[0] && (
        <>
          <p className="text-gray-500">☀️ Manhã: <span className="font-medium text-gray-800">{row.morningMm.toFixed(1)} mm</span></p>
          <p className="text-gray-500">🌤 Tarde: <span className="font-medium text-gray-800">{row.afternoonMm.toFixed(1)} mm</span></p>
          <p className="text-gray-500">🌙 Noite: <span className="font-medium text-gray-800">{row.nightMm.toFixed(1)} mm</span></p>
          <hr className="my-1 border-gray-100" />
        </>
      )}
      {granularity !== 'day' && (
        <>
          <p className="text-gray-500">Dias chuvosos: <span className="font-medium text-gray-800">{row.rainyDays}</span></p>
          {row.unworkable > 0 && (
            <p className="text-red-500">⛔ Dias imprat.: <span className="font-medium">{row.unworkable}</span></p>
          )}
          <hr className="my-1 border-gray-100" />
        </>
      )}
      <p className="text-blue-600 font-semibold">Total: {row.totalMm.toFixed(1)} mm</p>
      <p className="text-orange-500">Acumulado: {row.accumulated.toFixed(1)} mm</p>
      {row.hasUnworkable && (
        <p className="mt-1 text-red-500 font-semibold">⛔ Dia impraticável</p>
      )}
    </div>
  )
}

// ─── Exportar CSV ────────────────────────────────────────────────────────────

function exportCsv(records: RainDay[]) {
  const lines = [
    'Data,Manhã (mm),Tarde (mm),Noite (mm),Total (mm),Praticável',
    ...records.map((r) =>
      `${fmtDate(r.date)},${r.morningMm},${r.afternoonMm},${r.nightMm},${r.totalMm},${r.isUnworkable ? 'Não' : 'Sim'}`
    ),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'pluviometria.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function RainChart({ records, summary, projectId, projectName, compact }: Props) {
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [period,      setPeriod]      = useState<Period>('all')
  const [tableTab,    setTableTab]    = useState<Granularity>('day')

  // Filtra pelo período selecionado
  const filteredRecords = useMemo(() => {
    if (period === 'all' || !records.length) return records
    const now    = new Date()
    const cutoff = new Date()
    if (period === '30d')  cutoff.setDate(now.getDate() - 30)
    if (period === '90d')  cutoff.setDate(now.getDate() - 90)
    if (period === 'year') cutoff.setFullYear(now.getFullYear(), 0, 1)
    return records.filter((r) => new Date(r.date) >= cutoff)
  }, [records, period])

  // Granularidade automática
  const autoGranularity: Granularity = useMemo(() => {
    if (filteredRecords.length <= 30)  return 'day'
    if (filteredRecords.length <= 90)  return 'week'
    return 'month'
  }, [filteredRecords])

  const activeGranularity = granularity

  const chartData = useMemo(
    () => aggregate(filteredRecords, activeGranularity),
    [filteredRecords, activeGranularity]
  )

  const tableData = useMemo(
    () => aggregate(filteredRecords, tableTab),
    [filteredRecords, tableTab]
  )

  // Máximo para escala do eixo esquerdo
  const maxMm = useMemo(() => Math.max(...chartData.map((r) => r.totalMm), 10), [chartData])

  // Métricas do período filtrado
  const filteredSummary = useMemo(() => {
    const total        = filteredRecords.reduce((s, r) => s + r.totalMm, 0)
    const rainyDays    = filteredRecords.filter((r) => r.totalMm > 0).length
    const unworkable   = filteredRecords.filter((r) => r.isUnworkable).length
    const maxDay       = filteredRecords.reduce((mx, r) => (!mx || r.totalMm > mx.totalMm) ? r : mx, null as RainDay | null)
    return { total, rainyDays, unworkable, maxDay }
  }, [filteredRecords])

  if (!records.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
        <p className="text-4xl mb-3">🌤</p>
        <p className="text-sm font-medium">Nenhum registro pluviométrico ainda.</p>
        <p className="text-xs mt-1">Os dados aparecerão conforme os RDOs forem preenchidos.</p>
      </div>
    )
  }

  if (compact) {
    // ─── Versão compacta (sparkline) para sidebar ─────────────────────────
    const sparkData = aggregate(records.slice(-30), 'day')
    return (
      <div className="space-y-2">
        <ResponsiveContainer width="100%" height={60}>
          <ComposedChart data={sparkData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <Bar dataKey="totalMm" fill="#3b82f6" radius={[2,2,0,0]}>
              {sparkData.map((d, i) => (
                <Cell key={i} fill={d.hasUnworkable ? '#ef4444' : '#3b82f6'} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
        <Link href={`/app/diario/${projectId}?tab=rain`}
          className="text-xs text-[#F5A623] hover:text-[#d4891a] font-medium">
          Ver histórico completo →
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ── Cards resumo ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <SummaryCard icon="💧" label="Precipitação total"
          value={`${filteredSummary.total.toFixed(0)} mm`}
          sub={period === 'all' ? 'período completo' : `últimos ${period}`} />
        <SummaryCard icon="🌧" label="Dias com chuva"
          value={String(filteredSummary.rainyDays)}
          sub="dias registrados" />
        <SummaryCard icon="⛔" label="Dias impraticáveis"
          value={String(filteredSummary.unworkable)}
          sub="paralisações"
          highlight={filteredSummary.unworkable > 0} />
        <SummaryCard icon="📊" label="Maior evento"
          value={filteredSummary.maxDay ? `${filteredSummary.maxDay.totalMm.toFixed(0)} mm` : '—'}
          sub={filteredSummary.maxDay ? fmtDate(filteredSummary.maxDay.date) : ''} />
        <SummaryCard icon="📅" label="Média mensal"
          value={summary?.averagePerMonth?.length
            ? `${(filteredSummary.total / Math.max(1, summary.averagePerMonth.length)).toFixed(0)} mm`
            : '—'}
          sub="por mês no período" />
        <SummaryCard icon="⚖️" label="Aditivo de prazo"
          value={`${filteredSummary.unworkable} dias`}
          sub="possível aditivo"
          highlight={filteredSummary.unworkable > 0} />
      </div>

      {/* ── Gráfico ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        {/* Controles */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Histórico pluviométrico</h3>

          <div className="flex flex-wrap items-center gap-2">
            {/* Período */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              {([['30d','30 dias'],['90d','90 dias'],['year','Este ano'],['all','Contrato']] as [Period,string][]).map(([v,l]) => (
                <button key={v} onClick={() => setPeriod(v)}
                  className={`px-2.5 py-1.5 transition-colors ${period === v ? 'bg-[#F5A623] text-white font-semibold' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                  {l}
                </button>
              ))}
            </div>

            {/* Granularidade */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              {([['day','Dia'],['week','Semana'],['month','Mês']] as [Granularity,string][]).map(([v,l]) => (
                <button key={v} onClick={() => setGranularity(v)}
                  className={`px-2.5 py-1.5 transition-colors ${granularity === v ? 'bg-blue-600 text-white font-semibold' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                  {l}
                </button>
              ))}
            </div>

            {/* Exportar PDF */}
            <a href={`${API}/api/v1/diary/projects/${projectId}/rain-report`}
              target="_blank" rel="noreferrer"
              className="text-xs font-medium px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1">
              📄 PDF
            </a>

            {/* Exportar CSV */}
            <button onClick={() => exportCsv(filteredRecords)}
              className="text-xs font-medium px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              ⬇ CSV
            </button>
          </div>
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#6b7280' }}
              angle={chartData.length > 15 ? -45 : 0}
              textAnchor={chartData.length > 15 ? 'end' : 'middle'}
              height={chartData.length > 15 ? 50 : 30}
            />
            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#6b7280' }}
              label={{ value: 'mm', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#9ca3af' } }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#f97316' }}
              label={{ value: 'acum. mm', angle: 90, position: 'insideRight', style: { fontSize: 10, fill: '#f97316' } }} />
            <Tooltip content={<CustomTooltip granularity={activeGranularity} />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />

            {/* Barras de chuva — vermelhas para impraticáveis */}
            <Bar yAxisId="left" dataKey="totalMm" name="Chuva (mm)"
              radius={[3, 3, 0, 0]} maxBarSize={40}>
              {chartData.map((d, i) => (
                <Cell key={i}
                  fill={d.hasUnworkable ? '#ef4444' : d.totalMm > maxMm * 0.7 ? '#1d4ed8' : '#3b82f6'}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>

            {/* Linha de acumulado */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="accumulated"
              name="Acumulado (mm)"
              stroke="#f97316"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#f97316' }}
            />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Legenda de referência */}
        <div className="mt-2 flex items-center gap-4 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500" /> Chuva (mm)</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500" /> Dia impraticável</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-orange-500" /> Acumulado</span>
        </div>
      </div>

      {/* ── Tabela detalhada ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-700">Detalhamento</h3>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              {([['day','Por dia'],['week','Por semana'],['month','Por mês']] as [Granularity,string][]).map(([v,l]) => (
                <button key={v} onClick={() => setTableTab(v)}
                  className={`px-2.5 py-1 transition-colors ${tableTab === v ? 'bg-gray-700 text-white font-semibold' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => exportCsv(filteredRecords)}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            ⬇ CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          {tableTab === 'day' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Data</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 hidden sm:table-cell">Manhã</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 hidden sm:table-cell">Tarde</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 hidden sm:table-cell">Noite</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Total</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Acumulado</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">Praticável</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredRecords].reverse().map((r, i) => {
                  const accumulated = filteredRecords
                    .filter((x) => x.date <= r.date)
                    .reduce((s, x) => s + x.totalMm, 0)
                  return (
                    <tr key={i} className={`border-b border-gray-100 ${r.isUnworkable ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-3 py-2 text-xs font-medium">{fmtDate(r.date)}</td>
                      <td className="px-3 py-2 text-right text-xs hidden sm:table-cell">{r.morningMm > 0 ? `${r.morningMm} mm` : '—'}</td>
                      <td className="px-3 py-2 text-right text-xs hidden sm:table-cell">{r.afternoonMm > 0 ? `${r.afternoonMm} mm` : '—'}</td>
                      <td className="px-3 py-2 text-right text-xs hidden sm:table-cell">{r.nightMm > 0 ? `${r.nightMm} mm` : '—'}</td>
                      <td className="px-3 py-2 text-right text-xs font-semibold">{r.totalMm > 0 ? `${r.totalMm.toFixed(1)} mm` : '—'}</td>
                      <td className="px-3 py-2 text-right text-xs text-orange-600 font-medium">{accumulated.toFixed(0)} mm</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${r.isUnworkable ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                          {r.isUnworkable ? '⛔ Imprat.' : '✅ OK'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {tableTab !== 'day' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">
                    {tableTab === 'week' ? 'Semana' : 'Mês'}
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Total (mm)</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Dias chuvosos</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Dias imprat.</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {[...tableData].reverse().map((row, i) => (
                  <tr key={row.key} className={`border-b border-gray-100 ${row.hasUnworkable ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-3 py-2 text-xs font-medium">{row.label}</td>
                    <td className="px-3 py-2 text-right text-xs font-semibold">{row.totalMm.toFixed(1)} mm</td>
                    <td className="px-3 py-2 text-right text-xs">{row.rainyDays}</td>
                    <td className={`px-3 py-2 text-right text-xs font-semibold ${row.unworkable > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {row.unworkable > 0 ? `⛔ ${row.unworkable}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-orange-600 font-medium">{row.accumulated.toFixed(0)} mm</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Seção de aditivo de prazo ───────────────────────────────────── */}
      {filteredSummary.unworkable > 0 && (
        <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">
            ⚖️ Embasamento para Aditivo de Prazo
          </h3>
          <p className="text-xs text-amber-700 leading-relaxed">
            Conforme registros do Diário de Obra (<em>{projectName}</em>), foram identificados{' '}
            <strong>{filteredSummary.unworkable} dia{filteredSummary.unworkable !== 1 ? 's' : ''}</strong>{' '}
            com condições impraticáveis para execução dos serviços, com precipitação total acumulada de{' '}
            <strong>{filteredSummary.total.toFixed(0)} mm</strong>.
            Conforme cláusulas contratuais aplicáveis, solicita-se análise de aditivo de prazo de{' '}
            <strong>{filteredSummary.unworkable} dia{filteredSummary.unworkable !== 1 ? 's' : ''} corrido{filteredSummary.unworkable !== 1 ? 's' : ''}</strong>.
          </p>
          <div className="mt-3">
            <a href={`${API}/api/v1/diary/projects/${projectId}/rain-report`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors">
              📄 Gerar Relatório Pluviométrico Técnico
            </a>
          </div>

          {/* Tabela de dias impraticáveis */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-amber-200">
                  <th className="py-1.5 text-left font-semibold text-amber-700">Data</th>
                  <th className="py-1.5 text-right font-semibold text-amber-700">Chuva (mm)</th>
                  <th className="py-1.5 text-left font-semibold text-amber-700 pl-4">Justificativa</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.filter((r) => r.isUnworkable).map((r, i) => (
                  <tr key={i} className="border-b border-amber-100">
                    <td className="py-1.5 text-amber-800 font-medium">{fmtDate(r.date)}</td>
                    <td className="py-1.5 text-right text-amber-800">{r.totalMm.toFixed(1)} mm</td>
                    <td className="py-1.5 pl-4 text-amber-700">{r.unworkableReason ?? 'Condições climáticas adversas'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SummaryCard ──────────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, sub, highlight }: {
  icon: string; label: string; value: string; sub?: string; highlight?: boolean
}) {
  return (
    <div className={`rounded-2xl border p-3 ${highlight ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'} shadow-sm`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-base">{icon}</span>
        <p className="text-[11px] text-gray-500 leading-tight">{label}</p>
      </div>
      <p className={`text-lg font-bold ${highlight ? 'text-red-600' : 'text-gray-800'}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}
