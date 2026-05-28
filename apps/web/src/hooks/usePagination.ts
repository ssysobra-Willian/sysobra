import { useState, useEffect } from 'react'

interface UsePaginationProps<T> {
  items: T[]
  itemsPerPage?: number
}

interface UsePaginationReturn<T> {
  currentItems: T[]
  currentPage: number
  totalPages: number
  totalItems: number
  hasNext: boolean
  hasPrev: boolean
  goToPage: (page: number) => void
  goToNext: () => void
  goToPrev: () => void
  goToFirst: () => void
  goToLast: () => void
  setItemsPerPage: (n: number) => void
  itemsPerPage: number
}

export function usePagination<T>({
  items,
  itemsPerPage: initialPerPage = 10,
}: UsePaginationProps<T>): UsePaginationReturn<T> {
  const [currentPage, setCurrentPage] = useState(1)
  const [perPage, setPerPageState]    = useState(initialPerPage)

  // Resetar para página 1 quando a lista muda de tamanho
  useEffect(() => {
    setCurrentPage(1)
  }, [items.length])

  const totalPages  = Math.max(1, Math.ceil(items.length / perPage))
  const safePage    = Math.min(currentPage, totalPages)
  const startIndex  = (safePage - 1) * perPage
  const currentItems = items.slice(startIndex, startIndex + perPage)

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  const setItemsPerPage = (n: number) => {
    setPerPageState(n)
    setCurrentPage(1)
  }

  return {
    currentItems,
    currentPage:   safePage,
    totalPages,
    totalItems:    items.length,
    hasNext:       safePage < totalPages,
    hasPrev:       safePage > 1,
    goToPage,
    goToNext:  () => goToPage(safePage + 1),
    goToPrev:  () => goToPage(safePage - 1),
    goToFirst: () => goToPage(1),
    goToLast:  () => goToPage(totalPages),
    setItemsPerPage,
    itemsPerPage: perPage,
  }
}
