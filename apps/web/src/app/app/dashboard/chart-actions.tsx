'use client'

import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ZoomIn, MoreHorizontal, Download, FileImage, FileCode, FileSpreadsheet, Maximize2 } from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n)
}

// ─── Tooltip com variação percentual mensal ──────────────────────────────────

interface TooltipConfig {
  dataKeys: string[]
  keyLabels?: Record<string, string>
  keyColors?: Record<string, string>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeChartTooltip(allData: Record<string, any>[], config: TooltipConfig) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function ChartTooltipContent({ active, payload, label }: any) {
    if (!active || !payload?.length) return null

    const idx  = allData.findIndex((d) => d.axisLabel === label || d.month === label)
    const prev = idx > 0 ? allData[idx - 1] : null
    const full = allData[idx]?.fullLabel ?? label

    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs min-w-[170px] relative">
        {/* Seta */}
        <div className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-r border-b border-gray-200 rotate-45" />
        <p className="font-semibold text-gray-700 mb-2.5 text-[11px] uppercase tracking-wide">{full}</p>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {payload.map((p: any) => {
          const key      = p.dataKey as string
          const val      = p.value as number
          const prevVal  = prev ? (prev[key] as number | undefined) : undefined
          const delta    = prevVal != null && prevVal !== 0
            ? ((val - prevVal) / Math.abs(prevVal)) * 100
            : null
          const color    = config.keyColors?.[key] ?? p.color ?? p.stroke ?? '#6B7280'
          const keyLabel = config.keyLabels?.[key] ?? p.name ?? key

          return (
            <div key={key} className="flex items-center justify-between gap-3 mb-1 last:mb-0">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="text-gray-500">{keyLabel}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-gray-800">{fmt(val)}</span>
                {delta != null && (
                  <span className={`text-[10px] font-semibold px-1 rounded ${delta >= 0 ? 'text-green-600 bg-green-50' : 'text-red-500 bg-red-50'}`}>
                    {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }
}

// ─── ChartModal (fullscreen) ──────────────────────────────────────────────────

interface ChartModalProps {
  open:      boolean
  onClose:   () => void
  title:     string
  chartNode: (height: number) => React.ReactNode
  tableData?:    Record<string, unknown>[]
  tableColumns?: { key: string; label: string; fmt?: (v: unknown) => string }[]
}

export function ChartModal({ open, onClose, title, chartNode, tableData, tableColumns }: ChartModalProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Fecha com Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Bloqueia scroll
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!mounted || !open) return null

  async function handleExportPng() {
    if (!chartRef.current) return
    try {
      const { toPng } = await import('html-to-image')
      const url = await toPng(chartRef.current, { backgroundColor: '#ffffff' })
      const a = document.createElement('a'); a.href = url; a.download = `${title}.png`; a.click()
    } catch (e) { console.error('Erro ao exportar PNG:', e) }
  }

  async function handleExportSvg() {
    if (!chartRef.current) return
    try {
      const { toSvg } = await import('html-to-image')
      const url = await toSvg(chartRef.current, { backgroundColor: '#ffffff' })
      const a = document.createElement('a'); a.href = url; a.download = `${title}.svg`; a.click()
    } catch (e) { console.error('Erro ao exportar SVG:', e) }
  }

  const modal = (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex-1 flex flex-col m-4 sm:m-8 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header do modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <div className="flex items-center gap-2">
            <button onClick={handleExportPng}
              className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors">
              <FileImage size={13} /> PNG
            </button>
            <button onClick={handleExportSvg}
              className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors">
              <FileCode size={13} /> SVG
            </button>
            <button onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors ml-1">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Corpo: gráfico */}
        <div className="flex-1 overflow-auto p-6">
          <div ref={chartRef} className="bg-white">
            {chartNode(Math.max(360, typeof window !== 'undefined' ? Math.floor(window.innerHeight * 0.45) : 400))}
          </div>

          {/* Tabela de dados */}
          {tableData && tableData.length > 0 && tableColumns && tableColumns.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Dados</h3>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {tableColumns.map((col) => (
                        <th key={col.key} className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tableData.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {tableColumns.map((col) => (
                          <td key={col.key} className="px-4 py-2.5 text-gray-700 tabular-nums">
                            {col.fmt ? col.fmt(row[col.key]) : String(row[col.key] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

// ─── ChartDropdown (menu 3 pontinhos) ────────────────────────────────────────

interface ChartDropdownProps {
  onZoom:       () => void
  onExportPng:  () => void
  onExportSvg:  () => void
  onExportCsv:  () => void
}

export function ChartDropdown({ onZoom, onExportPng, onExportSvg, onExportCsv }: ChartDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const item = (label: string, Icon: React.ElementType, action: () => void) => (
    <button
      onClick={() => { action(); setOpen(false) }}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors text-left"
    >
      <Icon size={13} className="text-gray-400" />
      {label}
    </button>
  )

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <MoreHorizontal size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden py-1">
          {item('Ver em tela cheia',   Maximize2,       onZoom)}
          <div className="border-t border-gray-100 my-1" />
          {item('Salvar como PNG',     FileImage,       onExportPng)}
          {item('Salvar como SVG',     FileCode,        onExportSvg)}
          {item('Exportar dados (CSV)', FileSpreadsheet, onExportCsv)}
        </div>
      )}
    </div>
  )
}

// ─── Botão lupa simples ───────────────────────────────────────────────────────

export function ZoomBtn({ onClick }: { onClick?: () => void }) {
  return (
    <button onClick={onClick} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
      <ZoomIn size={14} />
    </button>
  )
}

// ─── CSV export helper ────────────────────────────────────────────────────────

export function exportCsv(
  filename: string,
  data: Record<string, unknown>[],
  columns: { key: string; label: string; fmt?: (v: unknown) => string }[],
) {
  const header = columns.map((c) => `"${c.label}"`).join(',')
  const rows   = data.map((row) =>
    columns.map((c) => {
      const val = row[c.key]
      const str = c.fmt ? c.fmt(val) : String(val ?? '')
      return `"${str.replace(/"/g, '""')}"`
    }).join(',')
  )
  const csv  = [header, ...rows].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url; a.download = `${filename}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ─── useChartExport ───────────────────────────────────────────────────────────
// Hook que retorna handlers para exportar o gráfico referenciado por containerRef.

export function useChartExport(
  containerRef: React.RefObject<HTMLDivElement | null>,
  filename: string,
  data: Record<string, unknown>[],
  columns: { key: string; label: string; fmt?: (v: unknown) => string }[],
) {
  async function exportPng() {
    if (!containerRef.current) return
    try {
      const { toPng } = await import('html-to-image')
      const url = await toPng(containerRef.current, { backgroundColor: '#ffffff' })
      const a = document.createElement('a'); a.href = url; a.download = `${filename}.png`; a.click()
    } catch (e) { console.error(e) }
  }

  async function exportSvg() {
    if (!containerRef.current) return
    try {
      const { toSvg } = await import('html-to-image')
      const url = await toSvg(containerRef.current, { backgroundColor: '#ffffff' })
      const a = document.createElement('a'); a.href = url; a.download = `${filename}.svg`; a.click()
    } catch (e) { console.error(e) }
  }

  function exportCsvFn() { exportCsv(filename, data, columns) }

  return { exportPng, exportSvg, exportCsv: exportCsvFn }
}
