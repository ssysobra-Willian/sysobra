'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Download, Printer, Eye, EyeOff, HardHat,
  Calendar, MapPin, Building2, User, Loader2,
} from 'lucide-react'
import { Breadcrumb } from '@/components/ui/Breadcrumb'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface PlateData {
  projectId: string
  projectName: string
  projectCode: string | null
  address: string | null
  city: string | null
  state: string | null
  clientName: string | null
  cno: string | null
  artExecution: string | null
  artProjects: string | null
  technicalName: string | null
  technicalTitle: string | null
  technicalCrea: string | null
  technicalPhoto: string | null
  startDate: string | null
  expectedEndDate: string | null
  company: {
    name: string | null
    logo: string | null
    cnpj: string | null
    phone: string | null
    email: string | null
    address: string | null
    city: string | null
    state: string | null
  }
}

function formatDateBR(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

// ─── Preview da Placa ─────────────────────────────────────────────────────────

function PlatePreview({ data, showPhoto }: { data: PlateData; showPhoto: boolean }) {
  const fullAddress = [data.address, data.city, data.state].filter(Boolean).join(', ')

  return (
    <div
      id="plate-preview"
      className="bg-white rounded-2xl shadow-2xl overflow-hidden"
      style={{ width: '100%', maxWidth: 640, aspectRatio: '3/4', fontFamily: 'Arial, sans-serif' }}
    >
      {/* ── Faixa superior laranja ───────────────────────────────────────── */}
      <div className="bg-[#F5A623] px-6 py-5 flex items-center justify-between">
        {/* Logo da empresa */}
        <div className="flex items-center gap-3">
          {data.company.logo ? (
            <img src={data.company.logo} alt="Logo" className="h-12 w-auto object-contain" />
          ) : (
            <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center">
              <Building2 size={24} className="text-white" />
            </div>
          )}
          <div>
            <p className="text-white font-bold text-base leading-tight">{data.company.name ?? 'Empresa'}</p>
            {data.company.cnpj && <p className="text-white/70 text-[11px]">CNPJ: {data.company.cnpj}</p>}
          </div>
        </div>
        {/* Ícone de obra */}
        <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center">
          <HardHat size={26} className="text-white" />
        </div>
      </div>

      {/* ── Título da obra ───────────────────────────────────────────────── */}
      <div className="bg-[#1a1a1a] px-6 py-4">
        <p className="text-[#F5A623] text-[10px] font-semibold uppercase tracking-widest mb-1">Obra em andamento</p>
        <h1 className="text-white font-bold text-xl leading-tight">{data.projectName}</h1>
        {data.projectCode && (
          <p className="text-gray-400 text-xs mt-0.5 font-mono">{data.projectCode}</p>
        )}
      </div>

      {/* ── Corpo ───────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 space-y-4 flex-1">
        {/* Endereço */}
        {fullAddress && (
          <div className="flex items-start gap-2.5">
            <MapPin size={14} className="text-[#F5A623] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold">Endereço da obra</p>
              <p className="text-sm font-medium text-gray-800">{fullAddress}</p>
            </div>
          </div>
        )}

        {/* Cliente */}
        {data.clientName && (
          <div className="flex items-start gap-2.5">
            <User size={14} className="text-[#F5A623] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold">Proprietário / Cliente</p>
              <p className="text-sm font-medium text-gray-800">{data.clientName}</p>
            </div>
          </div>
        )}

        {/* Datas */}
        <div className="flex items-start gap-2.5">
          <Calendar size={14} className="text-[#F5A623] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold">Prazo</p>
            <p className="text-sm font-medium text-gray-800">
              Início: {formatDateBR(data.startDate)} &nbsp;|&nbsp; Previsão: {formatDateBR(data.expectedEndDate)}
            </p>
          </div>
        </div>

        {/* Separador */}
        <div className="border-t border-gray-100" />

        {/* CNO e ARTs */}
        <div className="grid grid-cols-3 gap-3">
          {data.cno && (
            <div>
              <p className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold">CNO</p>
              <p className="text-xs font-medium text-gray-800 font-mono mt-0.5">{data.cno}</p>
            </div>
          )}
          {data.artExecution && (
            <div>
              <p className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold">ART Execução</p>
              <p className="text-xs font-medium text-gray-800 font-mono mt-0.5">{data.artExecution}</p>
            </div>
          )}
          {data.artProjects && (
            <div>
              <p className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold">ART Projetos</p>
              <p className="text-xs font-medium text-gray-800 font-mono mt-0.5">{data.artProjects}</p>
            </div>
          )}
        </div>

        {/* Separador */}
        {(data.technicalName || data.technicalCrea) && <div className="border-t border-gray-100" />}

        {/* Responsável técnico */}
        {(data.technicalName || data.technicalCrea) && (
          <div className="flex items-center gap-4">
            {showPhoto && data.technicalPhoto && (
              <img src={data.technicalPhoto} alt={data.technicalName ?? 'RT'} className="h-14 w-14 rounded-full object-cover border-2 border-[#F5A623] flex-shrink-0" />
            )}
            <div>
              <p className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold">Responsável técnico</p>
              {data.technicalName && (
                <p className="text-sm font-bold text-gray-900 mt-0.5">{data.technicalName}</p>
              )}
              {data.technicalTitle && (
                <p className="text-xs text-gray-600">{data.technicalTitle}</p>
              )}
              {data.technicalCrea && (
                <p className="text-xs text-gray-500 font-mono">{data.technicalCrea}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Rodapé ──────────────────────────────────────────────────────── */}
      <div className="bg-gray-50 border-t border-gray-100 px-6 py-3 flex items-center justify-between">
        <div>
          {data.company.phone && <p className="text-[10px] text-gray-500">☎ {data.company.phone}</p>}
          {data.company.email && <p className="text-[10px] text-gray-500">✉ {data.company.email}</p>}
        </div>
        <div className="text-right">
          <p className="text-[9px] text-gray-400 uppercase tracking-wide">Gerado por</p>
          <p className="text-[10px] font-semibold text-gray-600">SYSOBRA</p>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function PlacaObraPage() {
  const params = useParams()
  const router = useRouter()
  const id     = params.id as string

  const [data,       setData]       = useState<PlateData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [showPhoto,  setShowPhoto]  = useState(true)
  const plateRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const token     = localStorage.getItem('token') || ''
      const companyId = localStorage.getItem('companyId') || ''
      const res = await fetch(`${API}/api/v1/projects/${id}/plate`, {
        headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId },
      })
      if (!res.ok) { router.push(`/app/centro-de-custo/${id}`); return }
      const json = await res.json()
      setData(json.plate)
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { load() }, [load])

  const handlePrint = () => {
    const content = document.getElementById('plate-preview')
    if (!content) return
    const w = window.open('', '_blank', 'width=700,height=900')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><title>Placa de Obra</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; background: white; }
        @media print { @page { size: A4 portrait; margin: 10mm; } }
      </style>
    </head><body>${content.outerHTML}</body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 500)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 size={28} className="animate-spin text-[#F5A623]" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ── Breadcrumb ─────────────────────────────────────────────────── */}
      <Breadcrumb items={[
        { label: 'Centro de Custo', href: '/app/centro-de-custo' },
        { label: data.projectName,  href: `/app/centro-de-custo/${id}` },
        { label: 'Placa de obra' },
      ]} />

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gerador de placa de obra</h1>
        <p className="text-sm text-gray-500">Preview interativo — imprima ou gere o PDF para a gráfica</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Preview ──────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 flex justify-center">
          <PlatePreview data={data} showPhoto={showPhoto} />
        </div>

        {/* ── Painel de controles ───────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Opções da placa</h3>

            {/* Toggle foto do RT */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">Foto do responsável técnico</p>
                <p className="text-xs text-gray-400 mt-0.5">Exibir na placa</p>
              </div>
              <button
                onClick={() => setShowPhoto(v => !v)}
                className={`w-10 h-5 rounded-full transition-colors relative ${showPhoto ? 'bg-[#F5A623]' : 'bg-gray-200'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${showPhoto ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <hr className="border-gray-100" />

            {/* Informações exibidas */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Campos na placa</p>
              {[
                { label: 'Nome da obra',        value: data.projectName },
                { label: 'Endereço',            value: data.address },
                { label: 'Cliente',             value: data.clientName },
                { label: 'CNO',                 value: data.cno },
                { label: 'ART de execução',     value: data.artExecution },
                { label: 'ART de projetos',     value: data.artProjects },
                { label: 'Responsável técnico', value: data.technicalName },
                { label: 'Data início',         value: data.startDate ? formatDateBR(data.startDate) : null },
                { label: 'Previsão de entrega', value: data.expectedEndDate ? formatDateBR(data.expectedEndDate) : null },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-1">
                  <span className="text-xs text-gray-500">{label}</span>
                  <span className={`text-[11px] font-medium ${value ? 'text-green-600' : 'text-gray-300'}`}>
                    {value ? '✓' : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Botões de ação */}
          <div className="space-y-2">
            <button
              onClick={handlePrint}
              className="w-full flex items-center justify-center gap-2 bg-[#F5A623] hover:bg-[#e09610] text-white text-sm font-medium py-3 rounded-lg transition-colors"
            >
              <Printer size={16} /> Gerar PDF / Imprimir
            </button>

            <button
              onClick={handlePrint}
              className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-700 text-sm font-medium py-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download size={16} /> Exportar PNG
            </button>

            <Link
              href={`/app/centro-de-custo/${id}`}
              className="w-full flex items-center justify-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 py-2 transition-colors"
            >
              <ChevronLeft size={14} /> Voltar para a obra
            </Link>
          </div>

          {/* Dica */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <p className="text-xs text-blue-600 leading-relaxed">
              💡 <strong>Dica:</strong> Ao clicar em "Gerar PDF", o navegador abrirá a janela de impressão. Selecione "Salvar como PDF" para obter o arquivo. Para impressão em gráfica, use papel A4 ou 90×120cm.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
