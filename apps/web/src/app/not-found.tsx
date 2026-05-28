import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', padding: 32, textAlign: 'center',
      fontFamily: 'sans-serif',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: '#F3F4F6', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 20, fontSize: 36,
      }}>
        🔍
      </div>
      <h1 style={{ fontSize: 48, fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>404</h1>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#374151', margin: '0 0 8px' }}>
        Página não encontrada
      </h2>
      <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 24, maxWidth: 360 }}>
        A página que você procura não existe ou foi movida.
      </p>
      <Link
        href="/app/dashboard"
        style={{
          padding: '10px 24px', borderRadius: 10,
          background: '#F5A623', color: '#fff',
          fontWeight: 600, textDecoration: 'none', fontSize: 14,
        }}
      >
        Voltar ao Dashboard
      </Link>
    </div>
  )
}
