import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  type DashboardFilters,
  type DashboardData,
  type ApiDashboardResponse,
  type CashflowPoint,
  type BalancePoint,
  type ExpenseCategory,
  type BillGroup,
  type Transaction,
  DEFAULT_FILTERS,
  MONTHS_PT,
  MONTHS_FULL_PT,
} from './data'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const STORAGE_KEY = 'sysobra_dashboard_filters'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('token') ?? ''
}

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}` }
}

// ─── Transforma resposta da API no formato que o page.tsx consume ─────────────

function transformDashboard(api: ApiDashboardResponse): DashboardData {
  // ── cashflow ──────────────────────────────────────────────────────────────
  const cashflow: CashflowPoint[] = api.cashflowByMonth.map((cf) => {
    const [yearStr, monStr] = cf.month.split('-')
    const year = parseInt(yearStr, 10)
    const mon  = parseInt(monStr,  10) - 1   // 0-indexed
    const label = MONTHS_PT[mon]      ?? cf.month
    const full  = MONTHS_FULL_PT[mon] ?? cf.month
    return {
      month:     label,
      axisLabel: label,
      fullLabel: `${full}/${year}`,
      year,
      entradas: Number(cf.income),
      saidas:   Number(cf.expense),
      saldo:    Number(cf.income) - Number(cf.expense),
    }
  })

  // ── evolução do saldo acumulado ───────────────────────────────────────────
  let acc = 0
  const balanceEvolution: BalancePoint[] = cashflow.map((cf) => {
    acc += cf.saldo
    return { month: cf.month, axisLabel: cf.axisLabel, fullLabel: cf.fullLabel, year: cf.year, saldo: acc }
  })

  // ── despesas por categoria ────────────────────────────────────────────────
  const totalExp = api.expensesByCategory.reduce((s, c) => s + c.total, 0)
  const expenseCategories: ExpenseCategory[] = api.expensesByCategory.map((c) => ({
    name:   c.name,
    amount: c.total,
    value:  totalExp > 0 ? Math.round((c.total / totalExp) * 100) : 0,
    color:  c.color ?? '#6B7280',
  }))

  // ── top obras ─────────────────────────────────────────────────────────────
  const topObras = api.topProjectsByExpense.map((p) => ({ name: p.name, valor: p.total }))

  // ── atividades recentes ───────────────────────────────────────────────────
  const activities: Transaction[] = api.recentTransactions.map((tx) => {
    const rawDate = tx.createdAt ?? tx.referenceDate ?? tx.paidAt ?? null
    const isoDate = rawDate ? new Date(rawDate) : new Date()
    const date    = isoDate.toISOString().split('T')[0]
    const time    = isoDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    return {
      id:          tx.id,
      date,
      time,
      type:        tx.type === 'INCOME' ? 'entrada' : 'saida',
      amount:      Number(tx.netAmount),
      account:     tx.bankAccount?.name ?? '',
      projectId:   '',
      projectName: '',
      category:    tx.category?.name ?? 'Financeiro',
      description: tx.description,
      icon:        tx.category?.icon ?? (tx.type === 'INCOME' ? '💰' : '📤'),
      module:      'Financeiro',
      createdBy:   tx.createdBy ?? null,
    }
  })

  // ── AP / AR com 3 grupos cada ─────────────────────────────────────────────
  const accountsPayable: BillGroup[] = [
    { label: 'Vencidas',            count: api.overduePayable.count,  valor: api.overduePayable.amount,  badgeCls: 'bg-red-100 text-red-700'     },
    { label: 'A vencer em 7 dias',  count: api.payableNext7.count,    valor: api.payableNext7.amount,    badgeCls: 'bg-amber-100 text-amber-700' },
    { label: 'A vencer em 30 dias', count: api.payableNext30.count,   valor: api.payableNext30.amount,   badgeCls: 'bg-gray-100 text-gray-600'   },
  ]
  const accountsReceivable: BillGroup[] = [
    { label: 'Vencidas',             count: api.overdueReceivable.count, valor: api.overdueReceivable.amount, badgeCls: 'bg-red-100 text-red-700'     },
    { label: 'A receber em 7 dias',  count: api.receivableNext7.count,   valor: api.receivableNext7.amount,   badgeCls: 'bg-amber-100 text-amber-700' },
    { label: 'A receber em 30 dias', count: api.receivableNext30.count,  valor: api.receivableNext30.amount,  badgeCls: 'bg-gray-100 text-gray-600'   },
  ]

  return {
    metrics: {
      totalEntradas: api.periodIncome,
      totalSaidas:   api.periodExpense,
      saldo:         api.periodResult,
      previsto:      api.currentBalance,   // saldo das contas bancárias
      entradasDelta: 0,                    // não disponível via API por enquanto
      saidasDelta:   0,
    },
    cashflow,
    balanceEvolution,
    expenseCategories,
    topObras,
    activities,
    accountsPayable,
    accountsReceivable,
  }
}

// ─── useFilterState ───────────────────────────────────────────────────────────
// Gerencia os filtros do dashboard com persistência em sessionStorage.

export function useFilterState() {
  const [filters, setFiltersRaw] = useState<DashboardFilters>(() => {
    if (typeof window === 'undefined') return DEFAULT_FILTERS
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) return { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<DashboardFilters>) }
    } catch { /* ignore */ }
    return DEFAULT_FILTERS
  })

  const setFilter = useCallback(
    <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => {
      setFiltersRaw((prev) => {
        const next = { ...prev, [key]: value }
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
        return next
      })
    },
    [],
  )

  const resetFilters = useCallback(() => {
    setFiltersRaw(DEFAULT_FILTERS)
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  const activeCount =
    (filters.contaBancaria ? 1 : 0) +
    (filters.centroCusto   ? 1 : 0) +
    (filters.periodoInicio !== DEFAULT_FILTERS.periodoInicio ||
     filters.periodoFim    !== DEFAULT_FILTERS.periodoFim    ? 1 : 0)

  const isPeriodoAlterado =
    filters.periodoInicio !== DEFAULT_FILTERS.periodoInicio ||
    filters.periodoFim    !== DEFAULT_FILTERS.periodoFim

  return { filters, setFilter, resetFilters, activeCount, isPeriodoAlterado }
}

// ─── useDashboardData ─────────────────────────────────────────────────────────
// Hook principal: busca dados reais de /api/financial/dashboard com React Query.
// O queryKey inclui os filtros para que mudar qualquer filtro dispare um refetch.

export function useDashboardData(filters: DashboardFilters): {
  data:    DashboardData | null
  loading: boolean
  error:   boolean
  refetch: () => void
} {
  const qp = new URLSearchParams()
  if (filters.periodoInicio) qp.set('startDate',     filters.periodoInicio)
  if (filters.periodoFim)    qp.set('endDate',       filters.periodoFim)
  if (filters.contaBancaria) qp.set('bankAccountId', filters.contaBancaria)

  const { data, isFetching, isError, refetch } = useQuery<DashboardData>({
    queryKey: ['dashboard', filters.contaBancaria, filters.periodoInicio, filters.periodoFim],
    queryFn:  async () => {
      const token = getToken()
      const res = await fetch(`${API}/api/financial/dashboard?${qp.toString()}`, {
        headers: { ...authHeaders() },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw: ApiDashboardResponse = await res.json()
      return transformDashboard(raw)
    },
    staleTime:          60_000,
    enabled:            typeof window !== 'undefined' && !!getToken(),
    placeholderData:    (prev) => prev,  // mantém dados antigos durante refetch
  })

  return {
    data:    data ?? null,
    loading: isFetching,
    error:   isError,
    refetch: () => refetch(),
  }
}

// ─── useBankAccounts ──────────────────────────────────────────────────────────
// Retorna as contas bancárias ativas para popular o dropdown de filtro.

export function useBankAccounts() {
  const { data } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['bank-accounts-filter'],
    queryFn:  async () => {
      const res = await fetch(`${API}/api/financial/bank-accounts`, { headers: authHeaders() })
      if (!res.ok) return []
      const json = await res.json()
      return (json.accounts ?? []) as { id: string; name: string }[]
    },
    staleTime: 5 * 60_000,
    enabled:   typeof window !== 'undefined' && !!getToken(),
  })
  return data ?? []
}

// ─── useProjects ──────────────────────────────────────────────────────────────
// Retorna os projetos para popular o dropdown de centro de custo.

export function useProjects() {
  const { data } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['projects-filter'],
    queryFn:  async () => {
      const res = await fetch(`${API}/api/financial/projects`, { headers: authHeaders() })
      if (!res.ok) return []
      const json = await res.json()
      return (json.projects ?? []) as { id: string; name: string }[]
    },
    staleTime: 5 * 60_000,
    enabled:   typeof window !== 'undefined' && !!getToken(),
  })
  return data ?? []
}

// ─── useProjectAlerts ─────────────────────────────────────────────────────────
// Conta obras com alertas de orçamento ou prazo em aberto.

export interface ProjectAlerts {
  budgetAlertCount: number
  delayAlertCount:  number
  total:            number
}

export function useProjectAlerts(): { alerts: ProjectAlerts; loading: boolean } {
  const { data, isFetching } = useQuery<ProjectAlerts>({
    queryKey: ['project-alerts'],
    queryFn:  async () => {
      const res = await fetch(`${API}/api/v1/projects?budgetAlert=true&delayAlert=true&limit=100`, { headers: authHeaders() })
      if (!res.ok) return { budgetAlertCount: 0, delayAlertCount: 0, total: 0 }
      const json = await res.json()
      const projects: any[] = json.projects ?? []
      return {
        budgetAlertCount: projects.filter((p) => p.budgetAlert).length,
        delayAlertCount:  projects.filter((p) => p.delayAlert).length,
        total:            projects.length,
      }
    },
    staleTime: 2 * 60_000,
    enabled:   typeof window !== 'undefined' && !!getToken(),
  })
  return { alerts: data ?? { budgetAlertCount: 0, delayAlertCount: 0, total: 0 }, loading: isFetching }
}
