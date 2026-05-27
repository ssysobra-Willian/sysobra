import Image from 'next/image'

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white">
      <div className="text-center space-y-6">
        <div className="flex items-center justify-center">
          <Image
            src="/logo.png"
            alt="SYSOBRA"
            width={200}
            height={48}
            style={{ height: 48, width: 'auto', objectFit: 'contain' }}
            priority
          />
        </div>
        <p className="text-xl text-gray-500 max-w-md">
          Sistema completo de gestão para construtoras
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/planos"
            className="px-6 py-3 bg-[#F5A623] text-white rounded-lg font-medium hover:bg-[#d4891a] transition-colors"
          >
            Ver planos
          </a>
          <a
            href="/login"
            className="px-6 py-3 border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Entrar
          </a>
        </div>
      </div>
    </main>
  )
}
