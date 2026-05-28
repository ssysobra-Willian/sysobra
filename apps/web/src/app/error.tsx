'use client'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global error:', error)
  }, [error])

  return (
    <html>
      <body>
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', padding: 32, textAlign: 'center',
          fontFamily: 'sans-serif',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: '#FEE2E2', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 28 }}>⚠️</span>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, margin: '0 0 8px' }}>
            Erro inesperado
          </h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>
            {error?.message || 'Ocorreu um erro inesperado.'}
          </p>
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
        </div>
      </body>
    </html>
  )
}
