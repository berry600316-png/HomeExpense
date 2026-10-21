import Dexie, { type EntityTable } from 'dexie'
import type {
  Beneficiary,
  CardBill,
  CardMonth,
  CreditCard,
  ExtraExpense,
  FixedTemplate,
  InsuranceInfo,
  MonthNote,
  Occurrence,
  PaymentSource,
  SettingRow,
} from '../domain/types'

/** 專屬資料庫名稱，避免與同網域其他網站／專案共用。 */
export const DB_NAME = 'homeexpense-tw-v1'

export class HomeExpenseDB extends Dexie {
  cards!: EntityTable<CreditCard, 'id'>
  cardMonths!: EntityTable<CardMonth, 'id'>
  sources!: EntityTable<PaymentSource, 'id'>
  templates!: EntityTable<FixedTemplate, 'id'>
  insurance!: EntityTable<InsuranceInfo, 'templateId'>
  beneficiaries!: EntityTable<Beneficiary, 'id'>
  occurrences!: EntityTable<Occurrence, 'id'>
  extras!: EntityTable<ExtraExpense, 'id'>
  monthNotes!: EntityTable<MonthNote, 'ym'>
  cardBills!: EntityTable<CardBill, 'id'>
  settings!: EntityTable<SettingRow, 'key'>

  constructor(name: string = DB_NAME) {
    super(name)
    this.version(1).stores({
      cards: 'id, order',
      cardMonths: 'id, &[cardId+ym], cardId, ym',
      sources: 'id, kind, cardId, order',
      templates: 'id, kind, order',
      insurance: 'templateId, beneficiaryId',
      beneficiaries: 'id, order',
      occurrences: 'id, &[templateId+periodKey], templateId, periodYm, actualYm, status',
      extras: 'id, ym, date',
      monthNotes: 'ym',
      cardBills: 'id, &[cardId+dueYm], cardId, dueYm',
      settings: 'key',
    })
  }
}

/**
 * 示範模式：只在開發環境（npm run dev）且網址帶 ?demo 時啟用，使用另一個資料庫名稱，
 * 與正式資料完全隔離。正式建置時 import.meta.env.DEV 為 false，整段不會進入產物。
 */
export const IS_DEMO =
  import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo')

export const db = new HomeExpenseDB(IS_DEMO ? `${DB_NAME}-demo` : DB_NAME)

export const ALL_TABLES = [
  'cards',
  'cardMonths',
  'sources',
  'templates',
  'insurance',
  'beneficiaries',
  'occurrences',
  'extras',
  'monthNotes',
  'cardBills',
  'settings',
] as const

export type TableName = (typeof ALL_TABLES)[number]

/**
 * 產生 UUID v4。crypto.randomUUID 只在安全環境（https/localhost）可用，
 * 用區網 IP 在 iPhone 上測試時不存在，所以退回 getRandomValues（不受此限制）。
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
