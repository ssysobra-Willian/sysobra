export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="text-center space-y-6">
        <div className="flex items-center justify-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary-500 flex items-center justify-center">
            <span className="text-white font-bold text-xl">S</span>
          </div>
          <h1 className="text-4xl font-bold text-foreground">SYSOBRA</h1>
        </div>
        <p className="text-xl text-muted-foreground max-w-md">
          SaaS de gestão de obras para construtoras brasileiras
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/login"
            className="px-6 py-3 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors"
          >
            Entrar
          </a>
          <a
            href="/register"
            className="px-6 py-3 border border-border text-foreground rounded-lg font-medium hover:bg-muted transition-colors"
          >
            Criar conta
          </a>
        </div>
        <p className="text-sm text-muted-foreground">
          🚧 Em desenvolvimento — API rodando em{' '}
          <code className="bg-muted px-1 rounded">localhost:3001</code>
        </p>
      </div>
    </main>
  )
}
