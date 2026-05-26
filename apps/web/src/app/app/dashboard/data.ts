// ─── Filtros do dashboard ──────────────────────────────────────────────────────

export interface DashboardFilters {
  contaBancaria: string  // '' = todas
  centroCusto:   string  // '' = todos — enviado à API como projectId
  etapa:         string  // '' = todas — enviado à API como stageId (dependente do centroCusto)
  periodoInicio: string  // YYYY-MM-DD
  periodoFim:    string  // YYYY-MM-DD
}

/** Calcula o mês corrente como período padrão */
function currentMonthRange(): { periodoInicio: string; periodoFim: string } {
  const now     = new Date()
  const y       = now.getFullYear()
  const m       = String(now.getMonth() + 1).padStart(2, '0')
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate()
  return {
    periodoInicio: `${y}-${m}-01`,
    periodoFim:    `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
  }
}

export const DEFAULT_FILTERS: DashboardFilters = {
  contaBancaria: '',
  centroCusto:   '',
  etapa:         '',
  ...currentMonthRange(),
}

// ─── Tipos usados pelo dashboard (também consumidos pelo page.tsx) ─────────────

export interface Transaction {
  id:          string
  date:        string        // YYYY-MM-DD
  time:        string        // HH:MM
  type:        'entrada' | 'saida'
  amount:      number
  account:     string
  projectId:   string
  projectName: string
  category:    string
  description: string
  icon:        string
  action:      string        // CREATED | EDITED | PAID | CANCELLED | DELETED | RECONCILED
  module:      string
  deleted:     boolean       // true se a transação foi excluída (isActive=false)
  createdBy:   { id: string; name: string; avatarUrl: string | null } | null
}

export interface CashflowPoint {
  month:      string  // "Jan"
  axisLabel:  string  // "Jan" ou "Jan/26" quando cruza anos
  fullLabel:  string  // "Janeiro/2026" para tooltip
  year:       number
  entradas:   number
  saidas:     number
  saldo:      number
}

export interface BalancePoint {
  month:     string
  axisLabel: string
  fullLabel: string
  year:      number
  saldo:     number
}

export interface ExpenseCategory {
  name:   string
  value:  number  // percentual inteiro (0-100)
  color:  string
  amount: number  // valor absoluto R$
}

export interface BillGroup {
  label:    string
  count:    number
  valor:    number
  badgeCls: string
}

export interface DashboardData {
  metrics: {
    totalEntradas: number
    totalSaidas:   number
    saldo:         number   // resultado do período
    previsto:      number   // saldo total das contas bancárias
    entradasDelta: number   // % variação vs período anterior (0 se indisponível)
    saidasDelta:   number
  }
  cashflow:           CashflowPoint[]
  balanceEvolution:   BalancePoint[]
  expenseCategories:  ExpenseCategory[]
  topObras:           { name: string; valor: number }[]
  activities:         Transaction[]
  accountsPayable:    BillGroup[]
  accountsReceivable: BillGroup[]
}

// ─── Formato bruto retornado pela API ─────────────────────────────────────────

export interface AuditLogEntry {
  id:           string
  action:       string   // CREATED | EDITED | PAID | CANCELLED | DELETED | RECONCILED
  newData:      Record<string, unknown> | null
  previousData: Record<string, unknown> | null
  createdAt:    string
  transaction: {
    id:          string
    description: string
    type:        string
    netAmount:   number | string
    isActive:    boolean
    category:    { name: string; icon: string | null; color: string | null } | null
  } | null
  user: { id: string; name: string; avatarUrl: string | null } | null
}

export interface ApiDashboardResponse {
  currentBalance:    number
  periodIncome:      number
  periodExpense:     number
  periodResult:      number
  payableToday:      { count: number; amount: number }
  receivableMonth:   { count: number; amount: number }
  overduePayable:    { count: number; amount: number }
  overdueReceivable: { count: number; amount: number }
  payableNext7:      { count: number; amount: number }
  payableNext30:     { count: number; amount: number }
  receivableNext7:   { count: number; amount: number }
  receivableNext30:  { count: number; amount: number }
  cashflowByMonth:   { month: string; income: number; expense: number }[]
  expensesByCategory:{ id: string; name: string; color: string | null; total: number }[]
  topProjectsByExpense: { id: string; name: string; total: number }[]
  recentAuditLogs:   AuditLogEntry[]
}

// ─── Nomes dos meses em pt-BR ──────────────────────────────────────────────────

export const MONTHS_PT      = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
export const MONTHS_FULL_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
