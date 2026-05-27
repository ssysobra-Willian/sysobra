'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ActivityFeed } from '@/components/ui/ActivityFeed'

export default function AtividadesPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Cabeçalho */}
        <div className="mb-6">
          <Link
            href="/app/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
          >
            <ChevronLeft size={16} />
            Voltar ao Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Histórico de Atividades</h1>
          <p className="text-sm text-gray-500 mt-1">
            Todas as ações realizadas no sistema pela sua empresa.
          </p>
        </div>

        {/* Feed completo */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <ActivityFeed limit={50} showHeader={false} />
        </div>
      </div>
    </div>
  )
}
