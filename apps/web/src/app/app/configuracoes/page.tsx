'use client'

import { useState, useRef, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function ConfiguracoesPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [currentLogo, setCurrentLogo] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [companyCnpj, setCompanyCnpj] = useState('')

  useEffect(() => {
    // A logo da empresa é usada apenas em documentos gerados (PDFs, contratos, OCs)
    // e salva no banco de dados — NÃO é usada na sidebar ou header do sistema
    setCurrentLogo(localStorage.getItem('companyLogoUrl') || null)
    setCompanyName(localStorage.getItem('companyName') || '')
    setCompanyCnpj(localStorage.getItem('companyCnpj') || '')
  }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(f.type)) {
      setError('Formato inválido. Use PNG, JPG ou WEBP.')
      return
    }
    if (f.size > 2 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo 2 MB.')
      return
    }

    setFile(f)
    setError('')
    setSuccess('')
    const reader = new FileReader()
    reader.onload = (ev) => setPreview(ev.target?.result as string)
    reader.readAsDataURL(f)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) {
      const fakeEvent = { target: { files: [f] } } as any
      handleFileChange(fakeEvent)
    }
  }

  async function handleSave() {
    if (!file) return

    const token = localStorage.getItem('token')
    if (!token) {
      setError('Sessão expirada. Faça login novamente.')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const formData = new FormData()
      formData.append('logo', file)

      const res = await fetch(`${API}/api/v1/companies/current/logo`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar logo')

      // Salva apenas como logo da empresa para documentos — NÃO atualiza a sidebar
      localStorage.setItem('companyLogoUrl', data.logoUrl)
      setCurrentLogo(data.logoUrl)

      setSuccess('Logo da empresa salva com sucesso! Será usada nos próximos documentos gerados.')
      setFile(null)
      setPreview(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleRemove() {
    setFile(null)
    setPreview(null)
    setError('')
    setSuccess('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
        <p className="text-sm text-gray-500 mt-1">Personalize os dados da sua empresa</p>
      </div>

      {/* ── Logo da empresa (para documentos) ───────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-gray-900 mb-0.5">
          Logo da empresa (usada em documentos e relatórios gerados)
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          Sua logo aparecerá nos PDFs, contratos, ordens de compra e placa de obra gerados pelo sistema.
          PNG ou JPG, até 2 MB.
        </p>

        {/* Aviso de escopo */}
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 text-sm text-blue-700">
          <span className="flex-shrink-0 mt-0.5">ℹ️</span>
          <span>
            Esta logo <strong>não</strong> aparece na barra lateral nem no header do sistema —
            esses elementos exibem sempre a identidade visual do SYSOBRA.
          </span>
        </div>

        {/* Logo atual */}
        {currentLogo && !preview && (
          <div className="mb-5 flex items-center gap-4">
            <img
              src={currentLogo}
              alt="Logo da empresa"
              className="h-16 w-16 rounded-xl object-cover border border-gray-200"
            />
            <div>
              <p className="text-sm font-medium text-gray-700">Logo atual</p>
              <p className="text-xs text-gray-400">{companyName}</p>
              <button
                onClick={() => fileRef.current?.click()}
                className="text-xs text-[#F5A623] hover:underline mt-1"
              >
                Trocar logo
              </button>
            </div>
          </div>
        )}

        {/* Zona de upload */}
        {!preview ? (
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-[#F5A623] transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700">Clique ou arraste a logo da sua empresa</p>
            <p className="text-xs text-gray-400 mt-1">PNG, JPG, WEBP — máximo 2 MB</p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-xl p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Preview</p>
            <div className="flex items-center gap-4">
              <img
                src={preview}
                alt="Preview"
                className="h-20 w-20 rounded-xl object-cover border border-gray-200 shadow-sm"
              />
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Arquivo: <span className="font-medium">{file?.name}</span>
                </p>
                <p className="text-xs text-gray-400">
                  {((file?.size ?? 0) / 1024).toFixed(0)} KB
                </p>
                <button
                  onClick={handleRemove}
                  className="text-xs text-red-400 hover:text-red-500 transition-colors"
                >
                  ✕ Remover
                </button>
              </div>
            </div>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />

        {error && (
          <p className="mt-3 text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}
        {success && (
          <p className="mt-3 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">✅ {success}</p>
        )}

        {preview && (
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-6 py-2.5 bg-[#F5A623] text-white font-semibold rounded-lg text-sm hover:bg-[#d4891a] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Salvando...' : 'Salvar logo'}
            </button>
            <button
              onClick={handleRemove}
              className="px-6 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* ── Informações da empresa ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-gray-900 mb-0.5">Informações da empresa</h2>
        <p className="text-sm text-gray-500 mb-5">Dados cadastrados no sistema.</p>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Razão social</p>
            <p className="text-sm font-medium text-gray-800">{companyName || '—'}</p>
          </div>
          {companyCnpj && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">CNPJ</p>
              <p className="text-sm font-medium text-gray-800">{companyCnpj}</p>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-5">
          Para editar informações da empresa, entre em contato com o suporte em{' '}
          <a href="mailto:suporte@sysobra.com.br" className="text-[#F5A623] hover:underline">
            suporte@sysobra.com.br
          </a>
        </p>
      </div>

      {/* ── Assinatura ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900 mb-0.5">Assinatura</h2>
            <p className="text-sm text-gray-500">Gerencie seu plano e cobrança</p>
          </div>
          <a
            href="/app/assinatura"
            className="px-4 py-2 bg-[#F5A623] text-white text-sm font-semibold rounded-lg hover:bg-[#d4891a] transition-colors"
          >
            Ver assinatura →
          </a>
        </div>
      </div>

      {/* ── Usuários e Permissões ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900 mb-0.5">Usuários e Permissões</h2>
            <p className="text-sm text-gray-500">
              Convide colaboradores, defina cargos e controle o acesso de cada usuário
              aos módulos do sistema.
            </p>
          </div>
          <a
            href="/app/configuracoes/usuarios"
            className="px-4 py-2 border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            Gerenciar usuários →
          </a>
        </div>
      </div>
    </div>
  )
}
