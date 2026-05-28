'use client'
import { useState } from 'react'

/**
 * Hook para download de PDFs que exigem autenticação Bearer.
 *
 * Uso:
 *   const { downloadPdf, isLoading } = useAuthenticatedPdf()
 *   await downloadPdf('/api/v1/deposit/employees/123/epi-cautela', 'cautela.pdf')
 */
export function useAuthenticatedPdf() {
  const [loadingKey, setLoadingKey] = useState<string | null>(null)

  /**
   * @param url        URL relativa (ex: /api/v1/...) ou absoluta (https://...)
   * @param filename   Nome do arquivo para download (opcional)
   * @param openInNewTab  true = abrir em nova aba | false = forçar download
   */
  const downloadPdf = async (
    url: string,
    filename?: string,
    openInNewTab = true,
  ): Promise<boolean> => {
    setLoadingKey(url)
    try {
      const API    = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const token  = typeof window !== 'undefined' ? (localStorage.getItem('token') ?? '') : ''
      const cid    = typeof window !== 'undefined' ? (localStorage.getItem('companyId') ?? '') : ''
      const fullUrl = url.startsWith('http') ? url : `${API}${url}`

      const res = await fetch(fullUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': cid,
        },
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const blob      = await res.blob()
      const objectUrl = URL.createObjectURL(blob)

      if (openInNewTab) {
        window.open(objectUrl, '_blank')
      } else {
        const a = document.createElement('a')
        a.href     = objectUrl
        a.download = filename || 'documento.pdf'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }

      // Revoga a object URL após 30 s para liberar memória
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000)
      return true
    } catch (err) {
      console.error('[useAuthenticatedPdf] Erro ao baixar PDF:', err)
      return false
    } finally {
      setLoadingKey(null)
    }
  }

  /** Retorna true se aquela URL específica está sendo carregada */
  const isLoading = (key: string) => loadingKey === key

  return { downloadPdf, isLoading, loadingKey }
}
