'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Rota legada: /app/diario/novo
 * Na nova arquitetura, o RDO é criado a partir da seleção de uma obra:
 *   /app/diario/[projectId]/novo
 * Redireciona para a lista de obras do Diário.
 */
export default function NovoRdoRedirectPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/app/diario') }, [router])
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-8 h-8 border-4 border-[#F5A623] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
