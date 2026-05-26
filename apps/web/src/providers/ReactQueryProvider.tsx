'use client'

/**
 * Wrapper client-side para o React Query (TanStack Query v5).
 * Mantido separado do layout.tsx para que o layout possa ser server component
 * enquanto este provider é client-only.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime:          60_000,  // 1 min: dados considerados frescos
            gcTime:             300_000, // 5 min: mantém cache após desmontagem
            retry:              1,
            refetchOnWindowFocus: false, // evita refetch surpreendente ao voltar aba
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
