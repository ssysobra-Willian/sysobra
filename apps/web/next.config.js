/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@sysobra/database'],
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },

  images: {
    remotePatterns: [
      // Acesso direto ao backend em dev (fallback e PDFs)
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3001',
        pathname: '/uploads/**',
      },
      // Buckets S3 e Supabase
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },

  /**
   * Proxy reverso: /api/uploads/:path* → backend:3001/uploads/:path*
   * Atua como fallback caso o route handler não esteja disponível.
   */
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    return [
      {
        source:      '/api/uploads/:path*',
        destination: `${backendUrl}/uploads/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
