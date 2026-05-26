'use client'

import Link from 'next/link'

interface SemAcessoProps {
  modulo?: string
  mensagem?: string
}

export function SemAcesso({ modulo, mensagem }: SemAcessoProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      {/* Ícone de cadeado */}
      <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
        <svg
          className="w-10 h-10 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
      </div>

      {/* Badge */}
      <span className="bg-gray-100 text-gray-500 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest mb-4">
        Acesso restrito
      </span>

      <h2 className="text-xl font-bold text-gray-900 mb-2">
        {modulo
          ? `Você não tem acesso ao módulo ${modulo}`
          : 'Você não tem permissão para acessar esta área'}
      </h2>

      <p className="text-sm text-gray-500 mb-8 max-w-sm">
        {mensagem ??
          'Solicite ao administrador da empresa para liberar seu acesso a este módulo.'}
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/app/dashboard"
          className="px-6 py-2.5 bg-[#F5A623] text-white font-semibold rounded-xl hover:bg-[#d4891a] transition-colors text-sm"
        >
          ← Voltar ao Dashboard
        </Link>
        <a
          href="mailto:suporte@sysobra.com.br"
          className="px-6 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors text-sm"
        >
          Falar com suporte
        </a>
      </div>
    </div>
  )
}
