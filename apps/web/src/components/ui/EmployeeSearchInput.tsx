'use client'
import { useState, useEffect } from 'react'

interface Props {
  onSelect: (employee: any) => void
  placeholder?: string
}

export default function EmployeeSearchInput({ onSelect, placeholder }: Props) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (search.length < 2) { setResults([]); return }
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
        const token = localStorage.getItem('token') || ''
        const companyId = localStorage.getItem('companyId') || ''
        const res = await fetch(
          `${API}/api/v1/employees?search=${encodeURIComponent(search)}&limit=8&status=ACTIVE`,
          { headers: { Authorization: `Bearer ${token}`, 'x-company-id': companyId } }
        )
        const data = await res.json()
        setResults(data.employees ?? [])
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={placeholder || 'Buscar colaborador...'}
        style={{
          width: '100%', padding: '9px 12px 9px 36px',
          border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14,
          outline: 'none',
        }}
      />
      {/* Ícone lupa */}
      <svg
        width="16" height="16" viewBox="0 0 24 24"
        fill="none" stroke="#9CA3AF" strokeWidth="2"
        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
      >
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>

      {loading && (
        <div style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          width: 14, height: 14, border: '2px solid #E5E7EB', borderTopColor: '#F5A623',
          borderRadius: '50%', animation: 'spin 0.6s linear infinite',
        }} />
      )}

      {results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          zIndex: 100, background: '#fff',
          border: '1px solid #E5E7EB', borderRadius: 8, marginTop: 4,
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
          maxHeight: 220, overflowY: 'auto',
        }}>
          {results.map((emp: any) => (
            <div
              key={emp.id}
              onClick={() => { onSelect(emp); setSearch(''); setResults([]) }}
              style={{
                padding: '10px 14px', cursor: 'pointer',
                borderBottom: '1px solid #F3F4F6',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: '#FEF3DC', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 13, color: '#92400E',
              }}>
                {emp.name?.slice(0, 2).toUpperCase() ?? '??'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 14, color: '#111827' }}>{emp.name}</div>
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>
                  {[emp.code, emp.role, emp.project?.name].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 6px',
                borderRadius: 99, flexShrink: 0,
                background: emp.type === 'CLT' ? '#DBEAFE' : '#EDE9FE',
                color: emp.type === 'CLT' ? '#1D4ED8' : '#5B21B6',
              }}>
                {emp.type}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
