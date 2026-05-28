'use client'
import { useEffect } from 'react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App error:', error)
  }, [error])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', padding: 32, textAlign: 'center',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: '#FEE2E2', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 16,
      }}>
        <span style={{ fontSize: 28 }}>⚠️</span>
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
        Erro ao carregar a página
      </h2>
      <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>
        {error?.message || 'Ocorreu um erro inesperado.'}
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={reset}
          style={{
            padding: '8px 20px', borderRadius: 8,
            background: '#F5A623', border: 'none',
            fontWeight: 600, cursor: 'pointer', color: '#fff',
          }}
        >
          Tentar novamente
        </button>
        <button
          onClick={() => window.location.href = '/app/dashboard'}
          style={{
            padding: '8px 20px', borderRadius: 8,
            border: '1px solid #D1D5DB',
            background: 'transparent', cursor: 'pointer',
          }}
        >
          Ir ao Dashboard
        </button>
      </div>
    </div>
  )
}
