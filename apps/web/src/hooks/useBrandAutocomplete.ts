import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
function getToken()     { return typeof window !== 'undefined' ? localStorage.getItem('token')     ?? '' : '' }
function getCompanyId() { return typeof window !== 'undefined' ? localStorage.getItem('companyId') ?? '' : '' }

let _cache: string[] | null = null

export function useBrandAutocomplete() {
  const [brands, setBrands] = useState<string[]>(_cache ?? [])

  useEffect(() => {
    if (_cache !== null) { setBrands(_cache); return }
    fetch(`${API}/api/v1/deposit/brands`, {
      headers: { Authorization: `Bearer ${getToken()}`, 'x-company-id': getCompanyId() },
    })
      .then(r => r.json())
      .then(d => {
        const list = d.brands ?? []
        _cache = list
        setBrands(list)
      })
      .catch(() => {})
  }, [])

  const getSuggestions = (input: string): string[] => {
    if (!input || input.length < 1) return []
    return brands
      .filter(b => b.toLowerCase().startsWith(input.toLowerCase()))
      .slice(0, 6)
  }

  return { brands, getSuggestions }
}
