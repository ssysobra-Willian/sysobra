import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

// Rotas que NÃO precisam de autenticação
const PUBLIC_PATHS = [
  '/', '/planos', '/cadastro', '/pagamento', '/login', '/register',
  '/esqueci-senha', '/redefinir-senha',
  // Semi-pública: precisa de token base (não de empresa selecionada)
  '/selecionar-empresa',
]

// Rotas de estado (dentro de /app/) que não fazem redirect de subscription
const STATUS_PATHS = [
  '/app/assinatura-pendente',
  '/app/assinatura-vencida',
  '/app/pagamento-recusado',
  '/app/assinatura',
]

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'sysobra-super-secret-jwt-key-change-in-production-min32chars'
)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Deixa passar rotas públicas e assets ─────────────────────────────────
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?')) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/uploads') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // ── Protege rotas /app/* ──────────────────────────────────────────────────
  if (pathname.startsWith('/app/')) {
    const token = request.cookies.get('sysobra_token')?.value

    // Sem token → login
    if (!token) {
      const url = new URL('/login', request.url)
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }

    let payload: { sub?: string; companyId?: string } = {}

    try {
      const result = await jwtVerify(token, JWT_SECRET)
      payload = result.payload as typeof payload
    } catch {
      // Token inválido ou expirado → login
      const url = new URL('/login', request.url)
      url.searchParams.set('redirect', pathname)
      const res = NextResponse.redirect(url)
      res.cookies.delete('sysobra_token')
      return res
    }

    // ── Token sem empresa selecionada → selecionar-empresa ─────────────────
    // Token base (pós-login com múltiplas empresas ou pós-logout-company)
    // não tem companyId; o usuário precisa escolher uma empresa antes.
    if (!payload.companyId) {
      return NextResponse.redirect(new URL('/selecionar-empresa', request.url))
    }

    // ── Verificação de subscription via cookies (rápida, sem DB) ───────────
    // A verificação autoritativa acontece no layout client-side via API
    const subStatus = request.cookies.get('sysobra_sub_status')?.value || 'ACTIVE'
    const isStatusPage = STATUS_PATHS.some((p) => pathname.startsWith(p))

    if (!isStatusPage) {
      if (subStatus === 'PENDING') {
        return NextResponse.redirect(new URL('/app/assinatura-pendente', request.url))
      }
      if (subStatus === 'PAST_DUE' || subStatus === 'EXPIRED') {
        return NextResponse.redirect(new URL('/app/assinatura-vencida', request.url))
      }
      if (subStatus === 'FAILED') {
        return NextResponse.redirect(new URL('/app/pagamento-recusado', request.url))
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Aplica o middleware em todas as rotas exceto:
     * - _next/static, _next/image, favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
