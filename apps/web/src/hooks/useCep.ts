'use client'

import { useState, useCallback } from 'react'

export interface CepResult {
  logradouro: string
  bairro:     string
  cidade:     string
  estado:     string   // UF 2 chars
  cep:        string   // 00000-000
}

export interface UseCepReturn {
  loading: boolean
  error:   string
  fetch:   (cep: string) => Promise<CepResult | null>
}

export function useCep(): UseCepReturn {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const fetchCep = useCallback(async (cep: string): Promise<CepResult | null> => {
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) {
      setError('CEP deve ter 8 dígitos')
      return null
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      if (!res.ok) { setError('Erro ao consultar CEP'); return null }
      const data = await res.json()
      if (data.erro) { setError('CEP não encontrado'); return null }
      return {
        logradouro: data.logradouro ?? '',
        bairro:     data.bairro     ?? '',
        cidade:     data.localidade ?? '',
        estado:     data.uf         ?? '',
        cep:        data.cep        ?? '',
      }
    } catch {
      setError('Falha ao buscar CEP. Verifique sua conexão.')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { loading, error, fetch: fetchCep }
}
