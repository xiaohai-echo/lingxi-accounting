import type { Budget, Record } from '../../main/database/schema'

export function getRecordEffectiveAmount(record: Pick<Record, 'type' | 'amount' | 'refundAmount' | 'shippingFee'>): number {
  if (record.type === 'expense' && record.refundAmount) {
    return Math.max(0, record.amount - record.refundAmount + (record.shippingFee || 0))
  }
  return record.amount
}

export function getMonthlyCategorySpend(records: Record[], year: number, month: number): Map<number, number> {
  const map = new Map<number, number>()
  for (const r of records) {
    if (r.type !== 'expense') continue
    const d = new Date(r.date)
    if (Number.isNaN(d.getTime())) continue
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    if (y !== year || m !== month) continue
    const current = map.get(r.categoryId) || 0
    map.set(r.categoryId, current + getRecordEffectiveAmount(r))
  }
  return map
}

export function getActiveMonthlyBudgets(budgets: Budget[], year: number, month: number): Budget[] {
  return budgets.filter(b => {
    if (b.period !== 'monthly') return false
    if (b.year !== year) return false
    if (b.month == null) return true
    return b.month === month
  })
}

export function getMonthlyBudgetOverages(
  records: Record[],
  budgets: Budget[],
  year: number,
  month: number
): Array<{ budget: Budget; spent: number }> {
  const spend = getMonthlyCategorySpend(records, year, month)
  const activeBudgets = getActiveMonthlyBudgets(budgets, year, month)
  const overages: Array<{ budget: Budget; spent: number }> = []
  for (const b of activeBudgets) {
    if (!b.amount || b.amount <= 0) continue
    const spentAmount = spend.get(b.categoryId) || 0
    if (spentAmount >= b.amount) {
      overages.push({ budget: b, spent: spentAmount })
    }
  }
  return overages
}

