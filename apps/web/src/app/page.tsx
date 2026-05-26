export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white">
      <div className="text-center space-y-6">
        <div className="flex items-center justify-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-[#F5A623] flex items-center justify-center">
            <span className="text-white font-bold text-xl">S</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-900">SYSOBRA</h1>
        </div>
        <p className="text-xl text-gray-500 max-w-md">
          SaaS de gestão de obras para construtoras brasileiras
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
