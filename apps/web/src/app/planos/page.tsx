import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Planos — SYSOBRA' }

const PLANS = [
  {
    id: 'FREE',
    name: 'Grátis',
    price: 'R$ 0',
    period: '',
    description: 'Para começar sem custo',
    highlight: false,
    badge: null,
    features: [
      '1 usuário',
      '1 obra ativa',
      'Financeiro básico',
      '1 GB de armazenamento',
      'Suporte por e-mail',
    ],
    cta: 'Começar grátis',
  },
  {
    id: 'STARTER',
    name: 'Essencial',
    price: 'R$ 99',
    period: '/mês',
    description: 'Para pequenas construtoras',
    highlight: false,
    badge: null,
    features: [
      '5 usuários',
      '10 obras ativas',
      'Financeiro completo',
      'Gestão de frota',
      '2 GB de armazenamento',
      'Suporte prioritário',
    ],
    cta: 'Começar agora',
  },
  {
    id: 'PROFESSIONAL',
    name: 'Profissional',
    price: 'R$ 199',
    period: '/mês',
    description: 'O mais escolhido do mercado',
    highlight: true,
    badge: 'MAIS CONTRATADO',
    features: [
      '10 usuários',
      '20 obras ativas',
      'Depósito e estoque',
      'Financeiro completo',
      'Gestão de frota',
      '5 GB de armazenamento',
      'Suporte 24h',
    ],
    cta: 'Começar agora',
  },
  {
    id: 'ENTERPRISE',
    name: 'Avançado',
    price: 'R$ 349',
    period: '/mês',
    description: 'Para grandes operações',
    highlight: false,
    badge: null,
    features: [
      'Usuários ilimitados',
      'Obras ilimitadas',
      'Open Finance',
      'Gestão de compras',
      'Diário de obras',
      '7 GB de armazenamento',
      'Gerente de conta dedicado',
    ],
    cta: 'Começar agora',
  },
]

export default function PlanosPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-[#1a1a1a] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image src="/logo-dark.png" alt="SYSOBRA" width={160} height={36} style={{ height: 36, width: 'auto', objectFit: 'contain' }} priority />
          </Link>
          <Link
            href="/login"
            className="text-sm text-gray-300 hover:text-white transition-colors"
          >
            Já tenho conta →
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 text-center px-6">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Escolha o plano ideal para sua construtora
        </h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto">
          Comece gratuitamente e escale conforme sua operação cresce.
          Sem contratos longos, cancele quando quiser.
        </p>
      </section>

      {/* Plans Grid */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl border-2 p-6 flex flex-col transition-shadow hover:shadow-lg ${
                plan.highlight
                  ? 'border-[#F5A623] shadow-md shadow-orange-100'
                  : 'border-gray-200'
              }`}
            >
              {/* Badge */}
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-[#F5A623] text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                    {plan.badge}
                  </span>
                </div>
              )}

              {/* Plan info */}
              <div className="mb-6">
                <h2 className="text-lg font-bold text-gray-900 mb-1">{plan.name}</h2>
                <p className="text-sm text-gray-400 mb-4">{plan.description}</p>
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-extrabold text-gray-900">{plan.price}</span>
                  {plan.period && (
                    <span className="text-gray-400 mb-1">{plan.period}</span>
                  )}
                </div>
              </div>

              {/* Features */}
              <ul className="space-y-2 flex-1 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-gray-600">
                    <svg
                      className="w-4 h-4 mt-0.5 text-[#F5A623] flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link
                href={`/cadastro?plano=${plan.id}`}
                className={`w-full text-center py-3 rounded-xl font-semibold text-sm transition-colors ${
                  plan.highlight
                    ? 'bg-[#F5A623] text-white hover:bg-[#d4891a]'
                    : 'bg-gray-900 text-white hover:bg-gray-700'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <p className="text-center text-sm text-gray-400 mt-10">
          Todos os planos incluem certificado SSL, backups diários e conformidade com LGPD.
        </p>
      </section>
    </div>
  )
}
