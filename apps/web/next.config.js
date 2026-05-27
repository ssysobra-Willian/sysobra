/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@sysobra/database'],
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },

  images: {
    remotePatterns: [
      // Proxy interno — usado pelo toImageUrl() para /api/uploads/...
      // (não precisa de remotePattern pois é mesmo origin)
      // Backends externos e bucket S3/Supabase:
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.supabase.co' },
      // Fallback: acesso direto ao backend em dev (caso o proxy falhe)
      { protocol: 'http',  hostname: 'localhost',     port: '3001', pathname: '/uploads/**' },
      { protocol: 'https', hostname: '**',            pathname: '/uploads/**' },
    ],
  },

  /**
   * Rewrite reverso: /api/uploads/:path* → backend:3001/uploads/:path*
   *
   * Este rewrite atua como fallback caso o route handler
   * apps/web/src/app/api/uploads/[...path]/route.ts não esteja disponível.
   * Em desenvolvimento ambos coexistem; o route handler tem precedência.
   */
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    return {
      // beforeFiles: são verificados antes dos routes da app
      beforeFiles: [],
      // afterFiles: verificados depois dos routes (route handler tem precedência)
      afterFiles: [
        {
          source:      '/api/uploads/:path*',
          destination: `${backendUrl}/uploads/:path*`,
        },
      ],
      fallback: [],
    }
  },
}

module.exports = nextConfig
