import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@/components/ui/theme-provider'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'SYSOBRA — Gestão de Obras',
    template: '%s | SYSOBRA',
  },
  description: 'Sistema completo de gestão para construtoras',
  keywords: ['gestão de obras', 'construtora', 'construção civil', 'SaaS'],
  icons: {
    icon:     '/favicon.ico',
    shortcut: '/favicon.ico',
    apple:    '/logo-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
