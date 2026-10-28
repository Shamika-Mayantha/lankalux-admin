/** Everything on the Finance page is reported in rupees; other currencies carry a rate to LKR. */
export const BASE_CURRENCY = 'LKR'
export const FINANCE_CURRENCIES = ['LKR', 'USD', 'GBP', 'EUR', 'AUD'] as const
export const EXPENSE_CATEGORIES = ['ad_spend', 'salary', 'software', 'office', 'other'] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  ad_spend: 'Ad spend',
  salary: 'Salaries',
  software: 'Software',
  office: 'Office & admin',
  other: 'Other',
}
