export interface MonthlySpend {
  month: string   // "2025-08"
  total: number
}

export interface DepartmentBudget {
  department: string
  quarter: string
  budget_cad: number
  spent: number
  remaining: number
}

export interface Summary {
  monthly_spend: MonthlySpend[]
  budgets: DepartmentBudget[]
}

export interface Violation {
  id: number
  employee_id: number
  employee_name: string
  rule: string
  detail: string
  severity: 1 | 2 | 3 | 4 | 5
  status: 'open' | 'resolved' | 'dismissed'
  amount: number
  latest_txn_date: string | null
}

export interface ChartPoint {
  x: string
  y: number
}

export interface ChartSeries {
  name: string
  points: ChartPoint[]
}

export interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'table'
  title: string
  x_label?: string
  y_label?: string
  series: ChartSeries[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  chart?: ChartSpec
}
